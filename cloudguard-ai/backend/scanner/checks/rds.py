"""RDS checks."""

from __future__ import annotations

import logging
from typing import Any

from botocore.exceptions import ClientError, NoCredentialsError


logger = logging.getLogger(__name__)


def _result(check_id: str, passed: bool, resource_id: str, region: str, details: dict[str, Any]) -> dict[str, Any]:
    return {
        "check_id": check_id,
        "passed": passed,
        "resource_id": resource_id,
        "region": region,
        "details": details,
    }


def _skipped(check_id: str, resource_id: str, region: str, error: Exception) -> dict[str, Any]:
    return _result(check_id, True, resource_id, region, {"status": "skipped", "error": str(error)})


def run_checks(session: Any, region: str) -> list[dict[str, Any]]:
    """Run RDS checks in a region."""
    client = session.client("rds", region_name=region)
    try:
        instances = client.describe_db_instances()["DBInstances"]
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("RDS describe_db_instances failed in %s: %s", region, exc)
        return [_skipped("rds_publicly_accessible", "rds", region, exc)]

    results: list[dict[str, Any]] = []
    for instance in instances:
        resource_id = instance["DBInstanceIdentifier"]
        results.extend(
            [
                _result(
                    "rds_publicly_accessible",
                    not instance.get("PubliclyAccessible", False),
                    resource_id,
                    region,
                    {
                        "summary": "RDS instance is publicly accessible." if instance.get("PubliclyAccessible", False) else "RDS instance is not publicly accessible.",
                        "engine": instance.get("Engine"),
                    },
                ),
                _result(
                    "rds_storage_encryption_disabled",
                    instance.get("StorageEncrypted", False),
                    resource_id,
                    region,
                    {
                        "summary": "RDS storage encryption is disabled." if not instance.get("StorageEncrypted", False) else "RDS storage encryption is enabled.",
                        "kms_key_id": instance.get("KmsKeyId"),
                    },
                ),
                _result(
                    "rds_backup_retention_disabled",
                    instance.get("BackupRetentionPeriod", 0) > 0,
                    resource_id,
                    region,
                    {
                        "summary": "RDS automated backups are disabled." if instance.get("BackupRetentionPeriod", 0) <= 0 else "RDS automated backups are enabled.",
                        "backup_retention_period": instance.get("BackupRetentionPeriod", 0),
                    },
                ),
                _result(
                    "rds_minor_version_auto_upgrade_disabled",
                    instance.get("AutoMinorVersionUpgrade", False),
                    resource_id,
                    region,
                    {
                        "summary": "Automatic minor version upgrades are disabled." if not instance.get("AutoMinorVersionUpgrade", False) else "Automatic minor version upgrades are enabled.",
                        "engine_version": instance.get("EngineVersion"),
                    },
                ),
            ]
        )

    return results
