"""Application configuration for CloudGuard AI."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    """Runtime settings loaded from environment variables."""

    app_name: str = os.getenv("APP_NAME", "CloudGuard AI")
    app_version: str = os.getenv("APP_VERSION", "0.1.0")
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://cloudguard:cloudguard@localhost:5432/cloudguard",
    )
    aws_role_session_name: str = os.getenv("AWS_ROLE_SESSION_NAME", "cloudguard-scan")
    aws_default_region: str = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-haiku-20240307")
    enable_ai_explanations: bool = os.getenv("ENABLE_AI_EXPLANATIONS", "true").lower() == "true"
    log_level: str = os.getenv("LOG_LEVEL", "INFO")


settings = Settings()
