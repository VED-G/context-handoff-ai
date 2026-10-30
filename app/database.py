"""
SQLAlchemy database setup.
- Uses DATABASE_URL from config (SQLite locally, Postgres in prod).
- Normalises postgres:// -> postgresql+psycopg2:// with sslmode=require.
- Tables are created automatically on startup (no Alembic for simplicity).
"""
import re
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import get_settings


def _normalise_db_url(url: str) -> str:
    """
    Convert plain postgres:// or postgresql:// to postgresql+psycopg2://
    and append sslmode=require for Neon/Supabase hosted Postgres.
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    # Add sslmode=require for hosted Postgres (not sqlite)
    if "postgresql" in url and "sslmode" not in url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}sslmode=require"

    return url


settings = get_settings()
db_url = _normalise_db_url(settings.database_url)

# SQLite needs check_same_thread=False for FastAPI's thread pool
connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}

engine = create_engine(db_url, connect_args=connect_args, echo=False)

# Enable WAL mode for SQLite to reduce locking under concurrent reads
if "sqlite" in db_url:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_con, connection_record):
        cursor = dbapi_con.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def get_db():
    """FastAPI dependency: yields a DB session and closes it on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

