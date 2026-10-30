"""
Main FastAPI application entry point for context-handoff-ai.

Architecture:
- REST API under /api/*
- React SPA (frontend/dist) served at all other routes with SPA fallback
- Structured JSON logging + request-ID middleware
- Global exception handler returns consistent error JSON
"""
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import engine, Base
from app.logging_setup import setup_logging, request_id_var
from app.routers import meetings, items, ai_routes, kb, dashboard

settings = get_settings()
setup_logging(settings.log_level, settings.log_file)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all DB tables on startup."""
    logger.info("startup: creating database tables")
    Base.metadata.create_all(bind=engine)
    logger.info("startup: tables ready")
    yield
    logger.info("shutdown: application stopping")


app = FastAPI(
    title="context-handoff-ai",
    description="AI-enabled platform for meeting summaries and work handovers",
    version="1.0.0",
    docs_url="/docs",
    lifespan=lifespan,
)

# ─── CORS (dev only; in prod, same-origin via FastAPI static serving) ─────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# ─── Request-ID + timing middleware ───────────────────────────────────────────
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """
    Sets a request ID (accept X-Request-ID header or generate UUID).
    Injects into contextvar so all log records in this request get it.
    Adds X-Request-ID to every response.
    Logs method, path, status, duration_ms.
    """
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    token = request_id_var.set(req_id)

    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        raise
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        request_id_var.reset(token)

    response.headers["X-Request-ID"] = req_id
    logger.info(
        f"{request.method} {request.url.path} {response.status_code}",
        extra={
            "event": "http.request",
            "method": request.method,
            "path": str(request.url.path),
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


# ─── Global exception handler ─────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for unhandled exceptions.
    Returns consistent JSON error shape with request_id.
    Logs ERROR with route, exception type, and stack trace.
    """
    req_id = request_id_var.get("") or "-"
    logger.error(
        f"Unhandled exception: {type(exc).__name__}",
        extra={
            "event": "error.unhandled",
            "route": str(request.url.path),
            "exception_type": type(exc).__name__,
            "request_id": req_id,
        },
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "request_id": req_id,
                "details": None,
            }
        },
    )


# Override FastAPI's default HTTP exception handler for consistent format
from fastapi.exceptions import RequestValidationError, HTTPException as FastAPIHTTPException
from fastapi.responses import JSONResponse as FR


@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    req_id = request_id_var.get("") or "-"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail),
                "request_id": req_id,
                "details": None,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    req_id = request_id_var.get("") or "-"
    # Convert errors to plain serializable dicts (Pydantic v2 errors may contain
    # non-JSON-serializable objects such as PydanticCustomError instances).
    safe_details = [
        {
            "loc": list(e.get("loc", [])),
            "msg": str(e.get("msg", "")),
            "type": str(e.get("type", "")),
        }
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "request_id": req_id,
                "details": safe_details,
            }
        },
    )


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health_check():
    """Simple health probe – no secrets, no DB call needed."""
    return {"status": "ok", "service": "context-handoff-ai"}


# ─── API Routers ──────────────────────────────────────────────────────────────
app.include_router(meetings.router)
app.include_router(items.router)
app.include_router(ai_routes.router)
app.include_router(kb.router)
app.include_router(dashboard.router)


# ─── Frontend static file serving ─────────────────────────────────────────────
# The React build is at frontend/dist (built during Docker image build).
# All /api/* routes are handled above; everything else serves the SPA.
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.exists():
    # Mount /assets and other static files
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """Serve index.html for all non-API routes (React Router SPA)."""
        index = _FRONTEND_DIST / "index.html"
        return FileResponse(str(index))
else:
    @app.get("/", include_in_schema=False)
    async def root():
        return {"message": "context-handoff-ai API running. Frontend not built yet."}

