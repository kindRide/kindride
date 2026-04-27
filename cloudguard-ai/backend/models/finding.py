"""Finding model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Finding(Base):
    """A persisted security finding produced by a scan."""

    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("customer_accounts.id"), nullable=False, index=True)
    check_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String(512), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN", index=True)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    fix_tier: Mapped[str] = mapped_column(String(32), nullable=False)
    fix_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    details_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    scan = relationship("Scan", back_populates="findings")
    account = relationship("CustomerAccount", back_populates="findings")
