"""Claude-powered security explanation service."""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field

from backend.config import settings

try:
    from anthropic import Anthropic
except ImportError:  # pragma: no cover
    Anthropic = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)


SOC2_CONTROL_MAP = {
    "s3_public_access_enabled": "CC6.1 - Logical and physical access controls",
    "s3_default_encryption_disabled": "CC6.7 - Data protection through security controls",
    "s3_versioning_disabled": "CC7.2 - Change management and recovery readiness",
    "s3_access_logging_disabled": "CC7.2 - Monitoring of system components",
    "iam_root_mfa_disabled": "CC6.3 - Strong authentication controls",
    "iam_root_access_keys_active": "CC6.2 - Privileged access restriction",
    "iam_user_mfa_disabled": "CC6.3 - Strong authentication controls",
    "iam_wildcard_policy_attached": "CC6.2 - Least privilege access design",
    "iam_password_policy_weak": "CC6.3 - Credential management controls",
    "iam_access_key_rotation_overdue": "CC6.1 - Access lifecycle management",
    "vpc_open_ssh_ingress": "CC6.6 - Network security configuration",
    "vpc_open_rdp_ingress": "CC6.6 - Network security configuration",
    "vpc_flow_logs_disabled": "CC7.2 - Security event monitoring",
    "vpc_default_vpc_in_use": "CC6.6 - Secure network design",
    "cloudtrail_not_enabled_all_regions": "CC7.2 - Audit logging and monitoring",
    "cloudtrail_log_file_validation_disabled": "CC7.4 - Integrity of monitoring evidence",
    "cloudtrail_s3_public_access_enabled": "CC6.7 - Protection of audit data",
    "rds_publicly_accessible": "CC6.6 - Network boundary enforcement",
    "rds_storage_encryption_disabled": "CC6.7 - Protection of sensitive data",
    "rds_backup_retention_disabled": "CC7.3 - Recovery and resilience procedures",
    "rds_minor_version_auto_upgrade_disabled": "CC8.1 - Vulnerability and patch management",
}


class ClaudeExplanation(BaseModel):
    """Structured explanation generated for a finding."""

    risk: str = Field(..., description="Plain-English risk summary.")
    compliance_control: str = Field(..., description="Exact SOC 2 control reference.")
    business_impact: str = Field(..., description="Business impact without jargon.")
    fix_steps: list[str] = Field(..., description="Clear remediation instructions.")


class ClaudeExplainer:
    """Generate plain-English security explanations with Claude or a local fallback."""

    def __init__(self) -> None:
        self._client = Anthropic(api_key=settings.anthropic_api_key) if Anthropic and settings.anthropic_api_key else None

    def explain(
        self,
        *,
        check_id: str,
        severity: str,
        resource_id: str,
        current_state: dict[str, Any],
    ) -> ClaudeExplanation:
        """Return a structured explanation for a finding."""
        if self._client and settings.enable_ai_explanations:
            try:
                return self._call_claude(
                    check_id=check_id,
                    severity=severity,
                    resource_id=resource_id,
                    current_state=current_state,
                )
            except Exception as exc:  # pragma: no cover
                logger.warning("Claude explanation failed for %s: %s", check_id, exc)

        return self._fallback_explanation(
            check_id=check_id,
            severity=severity,
            resource_id=resource_id,
            current_state=current_state,
        )

    def _call_claude(
        self,
        *,
        check_id: str,
        severity: str,
        resource_id: str,
        current_state: dict[str, Any],
    ) -> ClaudeExplanation:
        prompt = self._build_prompt(
            check_id=check_id,
            severity=severity,
            resource_id=resource_id,
            current_state=current_state,
        )
        message = self._client.messages.create(
            model=settings.anthropic_model,
            max_tokens=500,
            temperature=0,
            system=(
                "You are a cloud security analyst. Return valid JSON only with keys "
                "risk, compliance_control, business_impact, and fix_steps."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = "".join(block.text for block in message.content if getattr(block, "type", "") == "text")
        return ClaudeExplanation.model_validate(json.loads(raw_text))

    def _build_prompt(
        self,
        *,
        check_id: str,
        severity: str,
        resource_id: str,
        current_state: dict[str, Any],
    ) -> str:
        control = SOC2_CONTROL_MAP.get(check_id, "CC6.1 - Logical access control")
        return (
            "Analyze this AWS security finding and explain it for a non-specialist operator.\n\n"
            f"Severity level: {severity}\n"
            f"Check ID: {check_id}\n"
            f"Resource ID: {resource_id}\n"
            f"Misconfiguration detected: {json.dumps(current_state, sort_keys=True, default=str)}\n"
            f"Exact SOC 2 Trust Services Criteria control violated: {control}\n\n"
            "Requirements:\n"
            "- Explain exactly what is wrong.\n"
            "- Explain the business risk in plain English with no jargon.\n"
            "- Name the SOC 2 control exactly as given.\n"
            "- Provide step-by-step remediation instructions.\n"
            "- Respond as JSON only with keys risk, compliance_control, business_impact, fix_steps.\n"
            "- fix_steps must be an array of short strings."
        )

    def _fallback_explanation(
        self,
        *,
        check_id: str,
        severity: str,
        resource_id: str,
        current_state: dict[str, Any],
    ) -> ClaudeExplanation:
        control = SOC2_CONTROL_MAP.get(check_id, "CC6.1 - Logical access control")
        summary = current_state.get("summary") or current_state.get("error") or "The current state did not meet the expected secure baseline."
        return ClaudeExplanation(
            risk=(
                f"{resource_id} triggered {check_id} at {severity} severity because {summary}. "
                "This could expose systems or data to unauthorized access."
            ),
            compliance_control=control,
            business_impact=(
                "If this stays in place, an attacker or unintended user could gain access, "
                "security teams may miss important evidence, and customer trust could be affected."
            ),
            fix_steps=[
                f"Review the resource state for {resource_id} and confirm the misconfiguration described by {check_id}.",
                "Update the AWS configuration so it matches the secure baseline for this control.",
                "Validate the change by rerunning the scan and confirming the finding no longer appears.",
            ],
        )
