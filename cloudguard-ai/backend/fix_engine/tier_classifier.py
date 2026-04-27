"""Fix tier classification logic."""

from __future__ import annotations


def classify_fix_tier(check_id: str, severity: str, resource_id: str) -> str:
    """Classify a finding into the correct approval tier."""
    if check_id in {
        "s3_public_access_enabled",
        "s3_default_encryption_disabled",
        "s3_versioning_disabled",
        "vpc_flow_logs_disabled",
        "rds_minor_version_auto_upgrade_disabled",
    }:
        return "TIER_1_AUTO"

    if check_id in {
        "vpc_open_ssh_ingress",
        "vpc_open_rdp_ingress",
        "rds_publicly_accessible",
        "cloudtrail_log_file_validation_disabled",
        "cloudtrail_s3_public_access_enabled",
    }:
        return "TIER_2_APPROVAL"

    if severity == "CRITICAL" or resource_id.startswith("root") or check_id.startswith("iam_"):
        return "TIER_3_GUIDANCE"

    return "TIER_2_APPROVAL"
