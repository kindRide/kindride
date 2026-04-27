"""Scan orchestration engine."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from sqlalchemy.orm import Session

from backend.config import settings
from backend.explainer.claude_explainer import ClaudeExplainer
from backend.models.account import CustomerAccount
from backend.models.scan import Scan
from backend.scanner import findings_mapper
from backend.scanner.checks import cloudtrail, iam, rds, s3, vpc


logger = logging.getLogger(__name__)


class ScanEngine:
    """Orchestrates AWS credential acquisition, region discovery, checks, and persistence."""

    def __init__(self) -> None:
        self.explainer = ClaudeExplainer()

    def run_scan(self, db: Session, scan_id: int) -> Scan:
        """Run a complete scan and persist all findings."""
        scan = db.get(Scan, scan_id)
        if scan is None:
            raise ValueError(f"Scan {scan_id} was not found.")

        account = db.get(CustomerAccount, scan.account_id)
        if account is None:
            raise ValueError(f"Customer account {scan.account_id} was not found.")

        scan.status = "RUNNING"
        scan.started_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(scan)

        try:
            session = self._assume_role(account.role_arn)
            enabled_regions = self._discover_regions(session, account.region)
            logger.info(
                "Running scan %s for account %s across regions %s",
                scan.id,
                account.id,
                enabled_regions,
            )
            raw_results = self._execute_checks(session, enabled_regions)
            findings = findings_mapper.map_results_to_findings(scan.id, account.id, raw_results)

            for finding in findings:
                details = json.loads(finding.details_json or "{}")
                explanation = self.explainer.explain(
                    check_id=finding.check_id,
                    severity=finding.severity,
                    resource_id=finding.resource_id,
                    current_state=details,
                )
                finding.ai_explanation = explanation.model_dump_json()
                db.add(finding)

            scan.summary = json.dumps(
                {
                    "regions_scanned": enabled_regions,
                    "checks_run": len(raw_results),
                    "findings_created": len(findings),
                },
                sort_keys=True,
            )
            scan.status = "COMPLETED"
            scan.completed_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(scan)
            return scan
        except Exception as exc:
            logger.exception("Scan %s failed: %s", scan.id, exc)
            scan.status = "FAILED"
            scan.summary = json.dumps({"error": str(exc)})
            scan.completed_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(scan)
            return scan

    def _assume_role(self, role_arn: str) -> boto3.Session:
        sts_client = boto3.client("sts", region_name=settings.aws_default_region)
        response = sts_client.assume_role(
            RoleArn=role_arn,
            RoleSessionName=settings.aws_role_session_name,
        )
        credentials = response["Credentials"]
        return boto3.Session(
            aws_access_key_id=credentials["AccessKeyId"],
            aws_secret_access_key=credentials["SecretAccessKey"],
            aws_session_token=credentials["SessionToken"],
            region_name=settings.aws_default_region,
        )

    def _discover_regions(self, session: boto3.Session, fallback_region: str) -> list[str]:
        ec2_client = session.client("ec2", region_name=fallback_region)
        try:
            response = ec2_client.describe_regions(AllRegions=True)
            return [
                region["RegionName"]
                for region in response.get("Regions", [])
                if region.get("OptInStatus") in (None, "opt-in-not-required", "opted-in")
            ]
        except (NoCredentialsError, ClientError) as exc:
            logger.warning("Falling back to account region %s after describe_regions failed: %s", fallback_region, exc)
            return [fallback_region]

    def _execute_checks(self, session: boto3.Session, enabled_regions: list[str]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        global_region = enabled_regions[0] if enabled_regions else settings.aws_default_region

        results.extend(iam.run_checks(session, global_region))
        results.extend(cloudtrail.run_checks(session, enabled_regions))

        for region in enabled_regions:
            regional_session = boto3.Session(
                aws_access_key_id=session.get_credentials().access_key,
                aws_secret_access_key=session.get_credentials().secret_key,
                aws_session_token=session.get_credentials().token,
                region_name=region,
            )
            results.extend(s3.run_checks(regional_session, region))
            results.extend(vpc.run_checks(regional_session, region))
            results.extend(rds.run_checks(regional_session, region))

        return results
