from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    app_name: str = "lyeria-server"
    app_env: str = "development"
    cors_origins: List[str] = Field(default_factory=lambda: ["*"])

    token_secret: str = "dev-secret-change-me"
    token_ttl_seconds: int = 60 * 60 * 24
    reservation_ttl_seconds: int = 30

    use_mock_lyria: bool = True
    gemini_api_key: str | None = None
    gemini_model: str = "models/lyria-realtime-exp"

    room_idle_timeout_seconds: int = 60 * 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
