"""VPC and security group checks."""

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
    """Run VPC-related checks in a region."""
    ec2_client = session.client("ec2", region_name=region)
    results: list[dict[str, Any]] = []
    results.extend(_check_open_ingress(ec2_client, region, port=22, check_id="vpc_open_ssh_ingress"))
    results.extend(_check_open_ingress(ec2_client, region, port=3389, check_id="vpc_open_rdp_ingress"))
    results.extend(_check_flow_logs(ec2_client, region))
    results.extend(_check_default_vpcs(ec2_client, region))
    return results


def _check_open_ingress(ec2_client: Any, region: str, *, port: int, check_id: str) -> list[dict[str, Any]]:
    try:
        security_groups = ec2_client.describe_security_groups()["SecurityGroups"]
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Ingress check failed for port %s in %s: %s", port, region, exc)
        return [_skipped(check_id, "security-groups", region, exc)]

    results: list[dict[str, Any]] = []
    for group in security_groups:
        open_rule = False
        matching_cidrs: list[str] = []
        for permission in group.get("IpPermissions", []):
            from_port = permission.get("FromPort")
            to_port = permission.get("ToPort")
            if from_port is None or to_port is None or not (from_port <= port <= to_port):
                continue
            for ip_range in permission.get("IpRanges", []):
                if ip_range.get("CidrIp") == "0.0.0.0/0":
                    open_rule = True
                    matching_cidrs.append("0.0.0.0/0")
            for ip_range in permission.get("Ipv6Ranges", []):
                if ip_range.get("CidrIpv6") == "::/0":
                    open_rule = True
                    matching_cidrs.append("::/0")

        results.append(
            _result(
                check_id,
                not open_rule,
                group["GroupId"],
                region,
                {
                    "summary": f"Port {port} is open to the internet." if open_rule else f"Port {port} is not open to the internet.",
                    "group_name": group.get("GroupName"),
                    "open_cidrs": matching_cidrs,
                },
            )
        )

    return results


def _check_flow_logs(ec2_client: Any, region: str) -> list[dict[str, Any]]:
    check_id = "vpc_flow_logs_disabled"
    try:
        vpcs = ec2_client.describe_vpcs()["Vpcs"]
        flow_logs = ec2_client.describe_flow_logs()["FlowLogs"]
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("VPC flow logs check failed in %s: %s", region, exc)
        return [_skipped(check_id, "vpcs", region, exc)]

    active_ids = {
        flow_log["ResourceId"]
        for flow_log in flow_logs
        if flow_log.get("ResourceType") == "VPC" and flow_log.get("FlowLogStatus") == "ACTIVE"
    }
    return [
        _result(
            check_id,
            vpc["VpcId"] in active_ids,
            vpc["VpcId"],
            region,
            {
                "summary": "VPC flow logs are disabled." if vpc["VpcId"] not in active_ids else "VPC flow logs are enabled.",
                "is_default": vpc.get("IsDefault", False),
            },
        )
        for vpc in vpcs
    ]


def _check_default_vpcs(ec2_client: Any, region: str) -> list[dict[str, Any]]:
    check_id = "vpc_default_vpc_in_use"
    try:
        vpcs = ec2_client.describe_vpcs()["Vpcs"]
    except (NoCredentialsError, ClientError) as exc:
        logger.warning("Default VPC check failed in %s: %s", region, exc)
        return [_skipped(check_id, "vpcs", region, exc)]

    return [
        _result(
            check_id,
            not vpc.get("IsDefault", False),
            vpc["VpcId"],
            region,
            {
                "summary": "Default VPC exists in this region." if vpc.get("IsDefault", False) else "VPC is not the default VPC.",
                "cidr_block": vpc.get("CidrBlock"),
            },
        )
        for vpc in vpcs
    ]
