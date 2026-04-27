"""FastAPI entrypoint for CloudGuard AI."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from backend.api import accounts, findings, scans
from backend.config import settings
from backend.database import Base, engine
from backend.models import account, finding, scan  # noqa: F401


logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


app = FastAPI(title=settings.app_name, version=settings.app_version)


@app.on_event("startup")
def startup() -> None:
    """Create tables for the milestone project."""
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    """Simple health endpoint."""
    return {"status": "ok"}


app.include_router(accounts.router)
app.include_router(scans.router)
app.include_router(findings.router)
