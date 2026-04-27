"""Customer account model."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class CustomerAccount(Base):
    """An onboarded customer AWS account that can be scanned by CloudGuard AI."""

    __tablename__ = "customer_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_arn: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    region: Mapped[str] = mapped_column(String(64), nullable=False, default="us-east-1")

    scans = relationship("Scan", back_populates="account", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="account", cascade="all, delete-orphan")
