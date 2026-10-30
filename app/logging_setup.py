"""
Structured JSON logging setup with:
- RotatingFileHandler writing to LOG_FILE
- stdout handler
- Request-ID injection via contextvar + logging.Filter
- Redaction of anything resembling API keys/tokens
"""
import logging
import logging.handlers
import json
import os
import re
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path

# Contextvar holding the current request ID (set by middleware)
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

# Regex to detect and redact secrets (API keys, tokens, passwords)
_SECRET_PATTERN = re.compile(
    r"(api[_-]?key|token|secret|password|bearer|authorization)\s*[=:]\s*\S+",
    re.IGNORECASE,
)


class RequestIDFilter(logging.Filter):
    """Injects request_id from contextvar into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("") or "-"
        return True


class RedactionFilter(logging.Filter):
    """Masks anything resembling API keys/tokens in log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _SECRET_PATTERN.sub(
                lambda m: m.group(0).split("=")[0].split(":")[0] + "=[REDACTED]",
                record.msg,
            )
        return True


class JSONFormatter(logging.Formatter):
    """Outputs each log line as a single JSON object for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        # Attach any extra fields (e.g., event, latency_ms, provider)
        for key, val in record.__dict__.items():
            if key not in (
                "msg", "args", "levelname", "levelno", "pathname", "filename",
                "module", "exc_info", "exc_text", "stack_info", "lineno",
                "funcName", "created", "msecs", "relativeCreated", "thread",
                "threadName", "processName", "process", "name", "message",
                "request_id", "taskName",
            ):
                log_obj[key] = val

        if record.exc_info:
            log_obj["exc"] = self.formatException(record.exc_info)

        return json.dumps(log_obj, default=str)


def setup_logging(log_level: str = "INFO", log_file: str = "logs/app.log") -> None:
    """Configure root logger with JSON formatting + file + stdout handlers."""
    # Ensure log directory exists
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)

    level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove existing handlers to avoid duplicates on hot-reload
    root_logger.handlers.clear()

    formatter = JSONFormatter()
    req_filter = RequestIDFilter()
    redact_filter = RedactionFilter()

    # File handler with rotation (10 MB max, 5 backups)
    file_handler = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(req_filter)
    file_handler.addFilter(redact_filter)

    # Stdout handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.addFilter(req_filter)
    console_handler.addFilter(redact_filter)

    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Quiet noisy libs
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

