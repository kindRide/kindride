"""Account API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.account import CustomerAccount


router = APIRouter(prefix="/accounts", tags=["accounts"])


class AccountCreateRequest(BaseModel):
    """Payload for creating a customer account."""

    name: str = Field(..., min_length=1, max_length=255)
    role_arn: str = Field(..., min_length=20, max_length=512)
    region: str = Field(default="us-east-1", min_length=3, max_length=64)


class AccountResponse(BaseModel):
    """API response model for customer accounts."""

    id: int
    name: str
    role_arn: str
    region: str

    model_config = {"from_attributes": True}


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreateRequest, db: Session = Depends(get_db)) -> CustomerAccount:
    """Create a new customer account record."""
    account = CustomerAccount(name=payload.name, role_arn=payload.role_arn, region=payload.region)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(account_id: int, db: Session = Depends(get_db)) -> CustomerAccount:
    """Fetch a customer account by ID."""
    account = db.get(CustomerAccount, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    return account
