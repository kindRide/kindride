"""Finding API routes."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.finding import Finding


router = APIRouter(prefix="/findings", tags=["findings"])


class FindingResponse(BaseModel):
    """API response model for findings."""

    id: int
    scan_id: int
    account_id: int
    check_id: str
    severity: str
    resource_id: str
    region: str
    status: str
    ai_explanation: str | None
    fix_tier: str
    fix_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FindingApprovalRequest(BaseModel):
    """Payload for approving a finding for remediation."""

    approved: bool = Field(..., description="Whether the finding was approved for the next step.")


@router.get("", response_model=list[FindingResponse])
def list_findings(scan_id: int = Query(..., gt=0), db: Session = Depends(get_db)) -> list[Finding]:
    """List findings for a scan."""
    findings = db.scalars(select(Finding).where(Finding.scan_id == scan_id).order_by(Finding.created_at.desc())).all()
    return list(findings)


@router.post("/{finding_id}/approve", response_model=FindingResponse)
def approve_finding(
    finding_id: int,
    payload: FindingApprovalRequest,
    db: Session = Depends(get_db),
) -> Finding:
    """Approve or reject a finding's next remediation step."""
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    finding.fix_status = "APPROVED" if payload.approved else "REJECTED"
    if payload.approved and finding.fix_tier == "TIER_1_AUTO":
        finding.status = "READY_FOR_AUTO_FIX"
    elif payload.approved:
        finding.status = "APPROVED"
    else:
        finding.status = "OPEN"

    db.commit()
    db.refresh(finding)
    return finding
