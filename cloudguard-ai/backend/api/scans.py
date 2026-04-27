"""Scan API routes."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import SessionLocal, get_db
from backend.models.account import CustomerAccount
from backend.models.scan import Scan
from backend.scanner.engine import ScanEngine


router = APIRouter(prefix="/scans", tags=["scans"])
scan_engine = ScanEngine()


class ScanCreateRequest(BaseModel):
    """Payload for creating a scan."""

    account_id: int = Field(..., gt=0)


class ScanResponse(BaseModel):
    """API response model for a scan."""

    id: int
    account_id: int
    status: str
    summary: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


def _run_scan_in_background(scan_id: int) -> None:
    """Run a scan using a fresh database session."""
    db = SessionLocal()
    try:
        scan_engine.run_scan(db, scan_id)
    finally:
        db.close()


@router.post("", response_model=ScanResponse, status_code=status.HTTP_202_ACCEPTED)
def create_scan(
    payload: ScanCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Scan:
    """Create a pending scan and execute it asynchronously."""
    account = db.get(CustomerAccount, payload.account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

    scan = Scan(account_id=payload.account_id, status="PENDING", summary=None)
    db.add(scan)
    db.commit()
    db.refresh(scan)
    background_tasks.add_task(_run_scan_in_background, scan.id)
    return scan


@router.get("/{scan_id}", response_model=ScanResponse)
def get_scan(scan_id: int, db: Session = Depends(get_db)) -> Scan:
    """Fetch a scan by ID."""
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")
    return scan
