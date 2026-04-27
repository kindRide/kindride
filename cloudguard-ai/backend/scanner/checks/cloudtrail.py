"""CloudTrail checks."""

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


def run_checks(session: Any, enabled_regions: list[str]) -> list[dict[str, Any]]:
    """Run CloudTrail checks across the account."""
    home_region = enabled_regions[0] if enabled_regions else "us-east-1"
    client = session.client("cloudtrail", region_name=home_region)

    try:
        trails = client.describe_trails(includeShadowTrails=True).get("trailList", [])
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("CloudTrail describe_trails failed: %s", exc)
        return [_skipped("cloudtrail_not_enabled_all_regions", "account", home_region, exc)]

    results: list[dict[str, Any]] = []
    results.append(_check_all_regions(session, enabled_regions, trails))
    results.extend(_check_log_validation(session, trails, home_region))
    results.extend(_check_log_bucket_public_access(session, trails, home_region))
    return results


def _check_all_regions(session: Any, enabled_regions: list[str], trails: list[dict[str, Any]]) -> dict[str, Any]:
    check_id = "cloudtrail_not_enabled_all_regions"
    multiregion_trails = [trail for trail in trails if trail.get("IsMultiRegionTrail")]

    active_multiregion_trails: list[str] = []
    for trail in multiregion_trails:
        try:
            client = session.client("cloudtrail", region_name=trail["HomeRegion"])
            status = client.get_trail_status(Name=trail["TrailARN"])
            if status.get("IsLogging"):
                active_multiregion_trails.append(trail["TrailARN"])
        except (NoCredentialsError, ClientError) as exc:
            logger.warning("CloudTrail status lookup failed for %s: %s", trail.get("TrailARN"), exc)

    passed = bool(active_multiregion_trails)
    return _result(
        check_id,
        passed,
        "account",
        enabled_regions[0] if enabled_regions else "us-east-1",
        {
            "summary": "No active multi-region CloudTrail trail was found." if not passed else "An active multi-region CloudTrail trail is enabled.",
            "enabled_regions": enabled_regions,
            "active_multiregion_trails": active_multiregion_trails,
        },
    )


def _check_log_validation(session: Any, trails: list[dict[str, Any]], region: str) -> list[dict[str, Any]]:
    check_id = "cloudtrail_log_file_validation_disabled"
    results: list[dict[str, Any]] = []
    for trail in trails:
        try:
            home_region = trail["HomeRegion"]
            client = session.client("cloudtrail", region_name=home_region)
            status = client.get_trail_status(Name=trail["TrailARN"])
            if not status.get("IsLogging"):
                continue
            results.append(
                _result(
                    check_id,
                    trail.get("LogFileValidationEnabled", False),
                    trail["TrailARN"],
                    home_region,
                    {
                        "summary": "Log file validation is disabled." if not trail.get("LogFileValidationEnabled", False) else "Log file validation is enabled.",
                        "s3_bucket_name": trail.get("S3BucketName"),
                    },
                )
            )
        except (NoCredentialsError, ClientError) as exc:
            logger.warning("CloudTrail log validation check failed for %s: %s", trail.get("TrailARN"), exc)
            results.append(_skipped(check_id, trail.get("TrailARN", "cloudtrail"), region, exc))
    return results


def _check_log_bucket_public_access(session: Any, trails: list[dict[str, Any]], region: str) -> list[dict[str, Any]]:
    check_id = "cloudtrail_s3_public_access_enabled"
    s3_client = session.client("s3", region_name=region)
    results: list[dict[str, Any]] = []

    for trail in trails:
        bucket_name = trail.get("S3BucketName")
        if not bucket_name:
            continue
        try:
            response = s3_client.get_public_access_block(Bucket=bucket_name)
            config = response["PublicAccessBlockConfiguration"]
            passed = all(
                config.get(flag, False)
                for flag in (
                    "BlockPublicAcls",
                    "IgnorePublicAcls",
                    "BlockPublicPolicy",
                    "RestrictPublicBuckets",
                )
            )
            results.append(
                _result(
                    check_id,
                    passed,
                    bucket_name,
                    trail.get("HomeRegion", region),
                    {
                        "summary": "CloudTrail log bucket allows some public access settings." if not passed else "CloudTrail log bucket blocks public access.",
                        "trail_arn": trail.get("TrailARN"),
                        "public_access_block": config,
                    },
                )
            )
        except (NoCredentialsError, ClientError) as exc:
            logger.warning("CloudTrail S3 bucket check failed for %s: %s", bucket_name, exc)
            results.append(_skipped(check_id, bucket_name, trail.get("HomeRegion", region), exc))
    return results
