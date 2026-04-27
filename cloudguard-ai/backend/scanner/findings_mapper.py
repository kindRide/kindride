"""Map raw check outputs into Finding ORM objects."""

from __future__ import annotations

import json
from typing import Any

from backend.fix_engine.tier_classifier import classify_fix_tier
from backend.models.finding import Finding

SEVERITY_BY_CHECK_ID = {
    "s3_public_access_enabled": "HIGH",
    "s3_default_encryption_disabled": "HIGH",
    "s3_versioning_disabled": "MEDIUM",
    "s3_access_logging_disabled": "LOW",
    "iam_root_mfa_disabled": "CRITICAL",
    "iam_root_access_keys_active": "CRITICAL",
    "iam_user_mfa_disabled": "HIGH",
    "iam_wildcard_policy_attached": "HIGH",
    "iam_password_policy_weak": "MEDIUM",
    "iam_access_key_rotation_overdue": "MEDIUM",
    "vpc_open_ssh_ingress": "HIGH",
    "vpc_open_rdp_ingress": "HIGH",
    "vpc_flow_logs_disabled": "MEDIUM",
    "vpc_default_vpc_in_use": "LOW",
    "cloudtrail_not_enabled_all_regions": "HIGH",
    "cloudtrail_log_file_validation_disabled": "MEDIUM",
    "cloudtrail_s3_public_access_enabled": "HIGH",
    "rds_publicly_accessible": "HIGH",
    "rds_storage_encryption_disabled": "HIGH",
    "rds_backup_retention_disabled": "MEDIUM",
    "rds_minor_version_auto_upgrade_disabled": "LOW",
}


def map_results_to_findings(scan_id: int, account_id: int, results: list[dict[str, Any]]) -> list[Finding]:
    """Convert failed raw check results into persisted finding objects."""
    findings: list[Finding] = []
    for result in results:
        if result.get("passed", True):
            continue

        details = result.get("details") or {}
        if details.get("status") == "skipped":
            continue

        check_id = result["check_id"]
        severity = SEVERITY_BY_CHECK_ID.get(check_id, "LOW")
        findings.append(
            Finding(
                scan_id=scan_id,
                account_id=account_id,
                check_id=check_id,
                severity=severity,
                resource_id=result["resource_id"],
                region=result["region"],
                status="OPEN",
                ai_explanation=None,
                fix_tier=classify_fix_tier(check_id, severity, result["resource_id"]),
                fix_status="PENDING",
                details_json=json.dumps(details, sort_keys=True, default=str),
            )
        )

    return findings
