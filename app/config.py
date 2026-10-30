"""
Application configuration loaded from environment variables.
Uses pydantic-settings to validate and provide typed access.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./app.db"

    # AI Providers
    groq_api_key: str = ""
    gemini_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_model: str = "gemini-2.0-flash"

    # AI behavior
    ai_timeout_seconds: int = 20

    # Logging
    log_level: str = "INFO"
    log_file: str = "logs/app.log"

    # App
    app_name: str = "context-handoff-ai"
    debug: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance – call this everywhere."""
    return Settings()

