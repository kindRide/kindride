"""S3 configuration checks."""

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
    return _result(
        check_id,
        True,
        resource_id,
        region,
        {"status": "skipped", "error": str(error)},
    )


def run_checks(session: Any, region: str) -> list[dict[str, Any]]:
    """Run S3 checks for buckets that belong to the current region."""
    results: list[dict[str, Any]] = []
    s3_client = session.client("s3", region_name=region)

    try:
        buckets = s3_client.list_buckets().get("Buckets", [])
    except (NoCredentialsError, ClientError) as exc:
        logger.exception("Unable to list S3 buckets in %s", region)
        return [_skipped("s3_public_access_enabled", "account", region, exc)]

    for bucket in buckets:
        bucket_name = bucket["Name"]
        try:
            location = s3_client.get_bucket_location(Bucket=bucket_name).get("LocationConstraint") or "us-east-1"
        except (NoCredentialsError, ClientError) as exc:
            logger.warning("Skipping bucket location lookup for %s: %s", bucket_name, exc)
            results.append(_skipped("s3_public_access_enabled", bucket_name, region, exc))
            continue

        normalized_location = "eu-west-1" if location == "EU" else location
        if normalized_location != region:
            continue

        results.extend(
            [
                _check_public_access(s3_client, bucket_name, region),
                _check_encryption(s3_client, bucket_name, region),
                _check_versioning(s3_client, bucket_name, region),
                _check_logging(s3_client, bucket_name, region),
            ]
        )

    return results


def _check_public_access(s3_client: Any, bucket_name: str, region: str) -> dict[str, Any]:
    check_id = "s3_public_access_enabled"
    try:
        response = s3_client.get_public_access_block(Bucket=bucket_name)
        config = response["PublicAccessBlockConfiguration"]
        all_enabled = all(
            config.get(flag, False)
            for flag in (
                "BlockPublicAcls",
                "IgnorePublicAcls",
                "BlockPublicPolicy",
                "RestrictPublicBuckets",
            )
        )
        return _result(
            check_id,
            all_enabled,
            bucket_name,
            region,
            {
                "summary": "Public access block is incomplete." if not all_enabled else "Public access block is fully enabled.",
                "public_access_block": config,
            },
        )
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Public access check failed for bucket %s: %s", bucket_name, exc)
        return _skipped(check_id, bucket_name, region, exc)


def _check_encryption(s3_client: Any, bucket_name: str, region: str) -> dict[str, Any]:
    check_id = "s3_default_encryption_disabled"
    try:
        response = s3_client.get_bucket_encryption(Bucket=bucket_name)
        rules = response["ServerSideEncryptionConfiguration"]["Rules"]
        enabled = bool(rules)
        return _result(
            check_id,
            enabled,
            bucket_name,
            region,
            {
                "summary": "Default encryption is not configured." if not enabled else "Default encryption is enabled.",
                "encryption_rules": rules,
            },
        )
    except s3_client.exceptions.ServerSideEncryptionConfigurationNotFoundError:
        return _result(
            check_id,
            False,
            bucket_name,
            region,
            {"summary": "Bucket does not have default encryption enabled."},
        )
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Encryption check failed for bucket %s: %s", bucket_name, exc)
        return _skipped(check_id, bucket_name, region, exc)


def _check_versioning(s3_client: Any, bucket_name: str, region: str) -> dict[str, Any]:
    check_id = "s3_versioning_disabled"
    try:
        response = s3_client.get_bucket_versioning(Bucket=bucket_name)
        enabled = response.get("Status") == "Enabled"
        return _result(
            check_id,
            enabled,
            bucket_name,
            region,
            {
                "summary": "Bucket versioning is disabled." if not enabled else "Bucket versioning is enabled.",
                "versioning_status": response.get("Status", "Disabled"),
            },
        )
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Versioning check failed for bucket %s: %s", bucket_name, exc)
        return _skipped(check_id, bucket_name, region, exc)


def _check_logging(s3_client: Any, bucket_name: str, region: str) -> dict[str, Any]:
    check_id = "s3_access_logging_disabled"
    try:
        response = s3_client.get_bucket_logging(Bucket=bucket_name)
        enabled = "LoggingEnabled" in response
        return _result(
            check_id,
            enabled,
            bucket_name,
            region,
            {
                "summary": "Server access logging is disabled." if not enabled else "Server access logging is enabled.",
                "logging": response.get("LoggingEnabled"),
            },
        )
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Logging check failed for bucket %s: %s", bucket_name, exc)
        return _skipped(check_id, bucket_name, region, exc)
