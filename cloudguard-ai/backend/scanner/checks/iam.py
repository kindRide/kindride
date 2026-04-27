"""IAM account-level checks."""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote

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
    """Run IAM checks against the account-wide IAM configuration."""
    iam_client = session.client("iam", region_name=region)
    results: list[dict[str, Any]] = []

    results.append(_check_root_mfa(iam_client, region))
    results.append(_check_root_access_keys(iam_client, region))
    results.extend(_check_user_mfa(iam_client, region))
    results.extend(_check_wildcard_policies(iam_client, region))
    results.append(_check_password_policy(iam_client, region))
    results.extend(_check_key_rotation(iam_client, region))
    return results


def _get_credential_report_rows(iam_client: Any) -> list[dict[str, str]]:
    try:
        iam_client.generate_credential_report()
        report = iam_client.get_credential_report()
    except (NoCredentialsError, ClientError):
        raise

    content = report["Content"].decode("utf-8")
    return list(csv.DictReader(io.StringIO(content)))


def _check_root_mfa(iam_client: Any, region: str) -> dict[str, Any]:
    check_id = "iam_root_mfa_disabled"
    try:
        summary = iam_client.get_account_summary()["SummaryMap"]
        enabled = summary.get("AccountMFAEnabled", 0) == 1
        return _result(
            check_id,
            enabled,
            "root-account",
            region,
            {
                "summary": "Root MFA is disabled." if not enabled else "Root MFA is enabled.",
                "account_mfa_enabled": enabled,
            },
        )
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Root MFA check failed: %s", exc)
        return _skipped(check_id, "root-account", region, exc)


def _check_root_access_keys(iam_client: Any, region: str) -> dict[str, Any]:
    check_id = "iam_root_access_keys_active"
    try:
        rows = _get_credential_report_rows(iam_client)
        root_row = next((row for row in rows if row.get("user") == "<root_account>"), None)
        if not root_row:
            return _result(check_id, True, "root-account", region, {"summary": "Root account row not present in credential report."})

        key_active = root_row.get("access_key_1_active") == "true" or root_row.get("access_key_2_active") == "true"
        return _result(
            check_id,
            not key_active,
            "root-account",
            region,
            {
                "summary": "Root access keys are active." if key_active else "Root access keys are not active.",
                "access_key_1_active": root_row.get("access_key_1_active"),
                "access_key_2_active": root_row.get("access_key_2_active"),
            },
        )
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Root access key check failed: %s", exc)
        return _skipped(check_id, "root-account", region, exc)


def _check_user_mfa(iam_client: Any, region: str) -> list[dict[str, Any]]:
    check_id = "iam_user_mfa_disabled"
    try:
        rows = _get_credential_report_rows(iam_client)
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("User MFA check failed: %s", exc)
        return [_skipped(check_id, "iam-users", region, exc)]

    results: list[dict[str, Any]] = []
    for row in rows:
        username = row.get("user", "")
        if not username or username == "<root_account>":
            continue
        has_console = row.get("password_enabled") == "true"
        has_key = row.get("access_key_1_active") == "true" or row.get("access_key_2_active") == "true"
        if not (has_console or has_key):
            continue
        mfa_enabled = row.get("mfa_active") == "true"
        results.append(
            _result(
                check_id,
                mfa_enabled,
                username,
                region,
                {
                    "summary": f"MFA is {'enabled' if mfa_enabled else 'disabled'} for IAM user {username}.",
                    "password_enabled": has_console,
                    "programmatic_access": has_key,
                    "mfa_active": mfa_enabled,
                },
            )
        )
    return results


def _policy_has_wildcard(document: dict[str, Any]) -> bool:
    statements = document.get("Statement", [])
    if isinstance(statements, dict):
        statements = [statements]
    for statement in statements:
        actions = statement.get("Action", [])
        resources = statement.get("Resource", [])
        if isinstance(actions, str):
            actions = [actions]
        if isinstance(resources, str):
            resources = [resources]
        if "*" in actions or "*:*" in actions or "*" in resources:
            return True
    return False


def _check_wildcard_policies(iam_client: Any, region: str) -> list[dict[str, Any]]:
    check_id = "iam_wildcard_policy_attached"
    results: list[dict[str, Any]] = []

    try:
        paginator = iam_client.get_paginator("list_policies")
        for page in paginator.paginate(Scope="Local"):
            for policy in page.get("Policies", []):
                version = iam_client.get_policy_version(
                    PolicyArn=policy["Arn"],
                    VersionId=policy["DefaultVersionId"],
                )
                document = version["PolicyVersion"]["Document"]
                has_wildcard = _policy_has_wildcard(document)
                results.append(
                    _result(
                        check_id,
                        not has_wildcard,
                        policy["Arn"],
                        region,
                        {
                            "summary": "Wildcard permissions detected in customer-managed policy." if has_wildcard else "No wildcard permissions detected.",
                            "policy_type": "managed",
                            "policy_name": policy["PolicyName"],
                        },
                    )
                )

        for entity_type, list_call, policy_call, name_key in (
            ("user", "list_users", "list_user_policies", "UserName"),
            ("role", "list_roles", "list_role_policies", "RoleName"),
            ("group", "list_groups", "list_group_policies", "GroupName"),
        ):
            entity_paginator = iam_client.get_paginator(list_call)
            for page in entity_paginator.paginate():
                entities = page.get(f"{entity_type.title()}s", [])
                for entity in entities:
                    entity_name = entity[name_key]
                    inline_paginator = iam_client.get_paginator(policy_call)
                    for inline_page in inline_paginator.paginate(**{name_key: entity_name}):
                        for policy_name in inline_page.get("PolicyNames", []):
                            policy = getattr(iam_client, f"get_{entity_type}_policy")(
                                **{name_key: entity_name, "PolicyName": policy_name}
                            )
                            document = json.loads(unquote(policy["PolicyDocument"]))
                            has_wildcard = _policy_has_wildcard(document)
                            results.append(
                                _result(
                                    check_id,
                                    not has_wildcard,
                                    f"{entity_type}:{entity_name}:{policy_name}",
                                    region,
                                    {
                                        "summary": "Wildcard permissions detected in inline policy." if has_wildcard else "No wildcard permissions detected.",
                                        "policy_type": "inline",
                                        "entity_type": entity_type,
                                        "entity_name": entity_name,
                                    },
                                )
                            )

        return results
    except (NoCredentialsError, ClientError, json.JSONDecodeError) as exc:
        logger.warning("Wildcard policy check failed: %s", exc)
        return [_skipped(check_id, "iam-policies", region, exc)]


def _check_password_policy(iam_client: Any, region: str) -> dict[str, Any]:
    check_id = "iam_password_policy_weak"
    try:
        policy = iam_client.get_account_password_policy()["PasswordPolicy"]
        strong_policy = all(
            [
                policy.get("MinimumPasswordLength", 0) >= 14,
                policy.get("RequireSymbols", False),
                policy.get("RequireNumbers", False),
                policy.get("RequireUppercaseCharacters", False),
                policy.get("RequireLowercaseCharacters", False),
                policy.get("MaxPasswordAge", 9999) <= 90,
                policy.get("PasswordReusePrevention", 0) >= 24,
            ]
        )
        return _result(
            check_id,
            strong_policy,
            "account-password-policy",
            region,
            {
                "summary": "Password policy does not meet the recommended baseline." if not strong_policy else "Password policy meets the recommended baseline.",
                "policy": policy,
            },
        )
    except iam_client.exceptions.NoSuchEntityException:
        return _result(
            check_id,
            False,
            "account-password-policy",
            region,
            {"summary": "No account password policy is configured."},
        )
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Password policy check failed: %s", exc)
        return _skipped(check_id, "account-password-policy", region, exc)


def _age_in_days(value: str) -> int | None:
    if not value or value in {"N/A", "not_supported", "no_information"}:
        return None
    timestamp = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S+00:00").replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - timestamp).days


def _check_key_rotation(iam_client: Any, region: str) -> list[dict[str, Any]]:
    check_id = "iam_access_key_rotation_overdue"
    try:
        rows = _get_credential_report_rows(iam_client)
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Access key rotation check failed: %s", exc)
        return [_skipped(check_id, "iam-access-keys", region, exc)]

    results: list[dict[str, Any]] = []
    for row in rows:
        username = row.get("user", "")
        if not username or username == "<root_account>":
            continue
        for index in ("1", "2"):
            if row.get(f"access_key_{index}_active") != "true":
                continue
            age_days = _age_in_days(row.get(f"access_key_{index}_last_rotated", ""))
            overdue = age_days is not None and age_days > 90
            results.append(
                _result(
                    check_id,
                    not overdue,
                    f"{username}:access-key-{index}",
                    region,
                    {
                        "summary": "Access key rotation is overdue." if overdue else "Access key rotation is within the allowed window.",
                        "user": username,
                        "access_key_index": index,
                        "age_days": age_days,
                    },
                )
            )
    return results
