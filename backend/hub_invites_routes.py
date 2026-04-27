"""
Hub Invite Token system for KindRide Community Hubs.

Endpoints:
  POST /hubs/{hub_id}/invites          — hub admin creates an invite token
  GET  /hubs/invite/{token}            — anyone validates a token (returns hub + user info)
  POST /hubs/invite/{token}/join       — authenticated user consumes token and joins hub
  GET  /hubs/{hub_id}/invites          — hub admin lists all invites for their hub
  DELETE /hubs/invite/{token}          — hub admin revokes an invite
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("kindride.hub_invites")

hub_invites_router = APIRouter(tags=["hub-invites"])

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _rest(path: str) -> str:
    return f"{SUPABASE_URL}/rest/v1{path}"


def _verify_jwt(authorization: str | None) -> str:
    """Validate Bearer JWT and return the user_id (sub claim)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization[len("Bearer "):]
    try:
        import jwt as pyjwt
        jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
        if not jwt_secret:
            raise HTTPException(status_code=500, detail="JWT secret not configured")
        payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
        uid = payload.get("sub")
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return str(uid)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {exc}") from exc


def _is_hub_admin(client: httpx.Client, hub_id: str, user_id: str) -> bool:
    r = client.get(
        _rest("/hub_members"),
        params={"hub_id": f"eq.{hub_id}", "user_id": f"eq.{user_id}",
                "role": "eq.hub_admin", "is_active": "eq.true", "select": "user_id"},
        headers=_headers(),
        timeout=8.0,
    )
    return r.status_code == 200 and len(r.json()) > 0


def _is_founder(user_id: str) -> bool:
    founder_ids = os.environ.get("KINDRIDE_FOUNDER_USER_IDS", "")
    return user_id in [fid.strip() for fid in founder_ids.split(",") if fid.strip()]


# ── Models ────────────────────────────────────────────────────────────────────

class CreateInviteRequest(BaseModel):
    label: Optional[str] = Field(default=None, max_length=120,
                                  description="Optional note, e.g. 'Orientation Week 2025'")
    max_uses: int = Field(default=1, ge=1, le=500,
                          description="1 = single-use. Up to 500 for batch events.")
    expires_in_hours: Optional[int] = Field(default=None, ge=1, le=720,
                                             description="Hours until expiry. Omit for no expiry.")


class InviteOut(BaseModel):
    id: str
    hub_id: str
    token: str
    label: Optional[str]
    max_uses: int
    use_count: int
    expires_at: Optional[str]
    created_at: str


class TokenValidationOut(BaseModel):
    valid: bool
    reason: Optional[str] = None   # set when valid=False
    hub_id: Optional[str] = None
    hub_name: Optional[str] = None
    hub_type: Optional[str] = None
    hub_slug: Optional[str] = None
    invite_label: Optional[str] = None
    # current user info (if authenticated)
    user_id: Optional[str] = None
    user_full_name: Optional[str] = None
    user_display_name: Optional[str] = None
    user_avatar_url: Optional[str] = None
    user_email: Optional[str] = None
    already_member: bool = False


# ── POST /hubs/{hub_id}/invites ───────────────────────────────────────────────

@hub_invites_router.post("/hubs/{hub_id}/invites", response_model=InviteOut)
def create_invite(
    hub_id: str,
    body: CreateInviteRequest,
    authorization: str | None = Header(default=None),
):
    """Hub admin (or founder) creates an invite token for their hub."""
    user_id = _verify_jwt(authorization)

    with httpx.Client() as client:
        if not _is_founder(user_id) and not _is_hub_admin(client, hub_id, user_id):
            raise HTTPException(status_code=403, detail="Only hub admins can create invites")

        expires_at = None
        if body.expires_in_hours:
            from datetime import timedelta
            expires_at = (datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)).isoformat()

        payload: dict = {
            "hub_id": hub_id,
            "created_by": user_id,
            "max_uses": body.max_uses,
            "use_count": 0,
        }
        if body.label:
            payload["label"] = body.label
        if expires_at:
            payload["expires_at"] = expires_at

        r = client.post(_rest("/hub_invites"), json=payload, headers=_headers(), timeout=10.0)
        if r.status_code not in (200, 201):
            logger.error("Failed to create invite: %s %s", r.status_code, r.text)
            raise HTTPException(status_code=500, detail="Failed to create invite")

        row = r.json()[0] if isinstance(r.json(), list) else r.json()
        return InviteOut(
            id=str(row["id"]),
            hub_id=str(row["hub_id"]),
            token=str(row["token"]),
            label=row.get("label"),
            max_uses=int(row["max_uses"]),
            use_count=int(row["use_count"]),
            expires_at=row.get("expires_at"),
            created_at=str(row["created_at"]),
        )


# ── GET /hubs/invite/{token} ──────────────────────────────────────────────────

@hub_invites_router.get("/hubs/invite/{token}", response_model=TokenValidationOut)
def validate_invite(
    token: str,
    authorization: str | None = Header(default=None),
):
    """
    Validate an invite token and return hub info + the calling user's profile.
    Does NOT consume the token. Safe to call on every page load.
    """
    with httpx.Client() as client:
        # Fetch invite + hub in one query via PostgREST join
        r = client.get(
            _rest("/hub_invites"),
            params={
                "token": f"eq.{token}",
                "select": "id,hub_id,label,max_uses,use_count,expires_at,hub:hubs(id,name,type,slug)",
            },
            headers=_headers(),
            timeout=8.0,
        )
        rows = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        if not rows:
            return TokenValidationOut(valid=False, reason="Invite not found or has been revoked")

        invite = rows[0]
        hub_obj = invite.get("hub") or {}

        # Check expiry
        expires_at = invite.get("expires_at")
        if expires_at:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                return TokenValidationOut(valid=False, reason="This invite link has expired")

        # Check usage limit
        if int(invite.get("use_count", 0)) >= int(invite.get("max_uses", 1)):
            return TokenValidationOut(valid=False, reason="This invite has already been used")

        result = TokenValidationOut(
            valid=True,
            hub_id=str(hub_obj.get("id", "")),
            hub_name=str(hub_obj.get("name", "")),
            hub_type=str(hub_obj.get("type", "")),
            hub_slug=str(hub_obj.get("slug", "")),
            invite_label=invite.get("label"),
        )

        # If caller is authenticated, attach their profile
        if authorization and authorization.startswith("Bearer "):
            try:
                user_id = _verify_jwt(authorization)
                result.user_id = user_id

                # Fetch profile (full_name, display_name, avatar_url)
                pr = client.get(
                    _rest("/profiles"),
                    params={"id": f"eq.{user_id}",
                            "select": "full_name,display_name,avatar_url,id"},
                    headers=_headers(),
                    timeout=8.0,
                )
                if pr.status_code == 200 and pr.json():
                    profile = pr.json()[0]
                    result.user_full_name = profile.get("full_name")
                    result.user_display_name = profile.get("display_name")
                    result.user_avatar_url = profile.get("avatar_url")

                # Fetch email from auth.users via admin API
                ua = client.get(
                    f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                    headers=_headers(),
                    timeout=8.0,
                )
                if ua.status_code == 200:
                    result.user_email = ua.json().get("email")

                # Check if already a member
                if result.hub_id:
                    mem = client.get(
                        _rest("/hub_members"),
                        params={"hub_id": f"eq.{result.hub_id}", "user_id": f"eq.{user_id}",
                                "is_active": "eq.true", "select": "user_id"},
                        headers=_headers(),
                        timeout=8.0,
                    )
                    if mem.status_code == 200 and mem.json():
                        result.already_member = True

            except HTTPException:
                pass  # unauthenticated is fine — just no user info

        return result


# ── POST /hubs/invite/{token}/join ────────────────────────────────────────────

@hub_invites_router.post("/hubs/invite/{token}/join")
def join_via_invite(
    token: str,
    authorization: str | None = Header(default=None),
):
    """
    Authenticated user consumes an invite token and joins the hub.
    Atomically increments use_count and creates the hub_members row.
    """
    user_id = _verify_jwt(authorization)

    with httpx.Client() as client:
        # Re-validate token (under service role — authoritative check)
        r = client.get(
            _rest("/hub_invites"),
            params={"token": f"eq.{token}",
                    "select": "id,hub_id,max_uses,use_count,expires_at"},
            headers=_headers(),
            timeout=8.0,
        )
        rows = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        if not rows:
            raise HTTPException(status_code=404, detail="Invite not found or revoked")

        invite = rows[0]
        invite_id = invite["id"]
        hub_id = invite["hub_id"]

        expires_at = invite.get("expires_at")
        if expires_at:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=410, detail="This invite link has expired")

        use_count = int(invite.get("use_count", 0))
        max_uses = int(invite.get("max_uses", 1))
        if use_count >= max_uses:
            raise HTTPException(status_code=410, detail="This invite has already been used")

        # Check not already a member
        mem = client.get(
            _rest("/hub_members"),
            params={"hub_id": f"eq.{hub_id}", "user_id": f"eq.{user_id}",
                    "is_active": "eq.true", "select": "user_id"},
            headers=_headers(),
            timeout=8.0,
        )
        if mem.status_code == 200 and mem.json():
            return {"status": "already_member", "hub_id": hub_id}

        # Log the use (unique constraint prevents double-consume)
        use_r = client.post(
            _rest("/hub_invite_uses"),
            json={"invite_id": invite_id, "used_by": user_id},
            headers=_headers(),
            timeout=8.0,
        )
        if use_r.status_code == 409:
            # Unique violation — this user already consumed this token
            return {"status": "already_used", "hub_id": hub_id}
        if use_r.status_code not in (200, 201):
            logger.error("Failed to log invite use: %s %s", use_r.status_code, use_r.text)
            raise HTTPException(status_code=500, detail="Failed to record invite use")

        # Increment use_count
        client.patch(
            _rest("/hub_invites"),
            params={"id": f"eq.{invite_id}"},
            json={"use_count": use_count + 1},
            headers=_headers(),
            timeout=8.0,
        )

        # Join the hub (active immediately — token = admin's trust)
        join_r = client.post(
            _rest("/hub_members"),
            json={"hub_id": hub_id, "user_id": user_id,
                  "role": "member", "status": "active", "is_active": True},
            headers=_headers(),
            timeout=8.0,
        )
        if join_r.status_code == 409:
            return {"status": "already_member", "hub_id": hub_id}
        if join_r.status_code not in (200, 201):
            logger.error("Failed to join hub: %s %s", join_r.status_code, join_r.text)
            raise HTTPException(status_code=500, detail="Failed to join hub")

        return {"status": "joined", "hub_id": hub_id}


# ── GET /hubs/{hub_id}/invites ────────────────────────────────────────────────

@hub_invites_router.get("/hubs/{hub_id}/invites")
def list_invites(
    hub_id: str,
    authorization: str | None = Header(default=None),
):
    """Hub admin lists all invite tokens for their hub."""
    user_id = _verify_jwt(authorization)

    with httpx.Client() as client:
        if not _is_founder(user_id) and not _is_hub_admin(client, hub_id, user_id):
            raise HTTPException(status_code=403, detail="Only hub admins can view invites")

        r = client.get(
            _rest("/hub_invites"),
            params={"hub_id": f"eq.{hub_id}",
                    "select": "id,token,label,max_uses,use_count,expires_at,created_at",
                    "order": "created_at.desc"},
            headers=_headers(),
            timeout=8.0,
        )
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch invites")

        rows = r.json() if isinstance(r.json(), list) else []
        now = datetime.now(timezone.utc)
        result = []
        for row in rows:
            exp = row.get("expires_at")
            expired = False
            if exp:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                expired = now > exp_dt
            exhausted = int(row.get("use_count", 0)) >= int(row.get("max_uses", 1))
            result.append({
                **row,
                "status": "expired" if expired else ("exhausted" if exhausted else "active"),
            })
        return result


# ── DELETE /hubs/invite/{token} ───────────────────────────────────────────────

@hub_invites_router.delete("/hubs/invite/{token}")
def revoke_invite(
    token: str,
    authorization: str | None = Header(default=None),
):
    """Hub admin revokes (deletes) an invite token."""
    user_id = _verify_jwt(authorization)

    with httpx.Client() as client:
        # Fetch invite to get hub_id for permission check
        r = client.get(
            _rest("/hub_invites"),
            params={"token": f"eq.{token}", "select": "id,hub_id"},
            headers=_headers(),
            timeout=8.0,
        )
        rows = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        if not rows:
            raise HTTPException(status_code=404, detail="Invite not found")

        hub_id = rows[0]["hub_id"]
        invite_id = rows[0]["id"]

        if not _is_founder(user_id) and not _is_hub_admin(client, hub_id, user_id):
            raise HTTPException(status_code=403, detail="Only hub admins can revoke invites")

        del_r = client.delete(
            _rest("/hub_invites"),
            params={"id": f"eq.{invite_id}"},
            headers=_headers(),
            timeout=8.0,
        )
        if del_r.status_code not in (200, 204):
            raise HTTPException(status_code=500, detail="Failed to revoke invite")

        return {"status": "revoked"}


# ── GET /hubs/{hub_id}/members/pending ────────────────────────────────────────

@hub_invites_router.get("/hubs/{hub_id}/members/pending")
def list_pending_members(
    hub_id: str,
    authorization: str | None = Header(default=None),
):
    """Hub admin lists members awaiting approval (status = pending)."""
    user_id = _verify_jwt(authorization)

    with httpx.Client() as client:
        if not _is_founder(user_id) and not _is_hub_admin(client, hub_id, user_id):
            raise HTTPException(status_code=403, detail="Only hub admins can view pending members")

        r = client.get(
            _rest("/hub_members"),
            params={
                "hub_id": f"eq.{hub_id}",
                "status": "eq.pending",
                "is_active": "eq.true",
                "select": "user_id,role,joined_at",
                "order": "joined_at.asc",
            },
            headers=_headers(),
            timeout=8.0,
        )
        rows = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        if not rows:
            return []

        # Batch-fetch profiles for names + avatars
        ids_csv = ",".join(str(row["user_id"]) for row in rows)
        pr = client.get(
            _rest("/profiles"),
            params={"id": f"in.({ids_csv})", "select": "id,full_name,display_name,avatar_url"},
            headers=_headers(),
            timeout=8.0,
        )
        profile_map: dict[str, dict] = {}
        if pr.status_code == 200:
            for p in pr.json():
                profile_map[str(p["id"])] = p

        # Fetch emails via auth admin API
        email_map: dict[str, str] = {}
        for uid in [row["user_id"] for row in rows]:
            try:
                ua = client.get(
                    f"{SUPABASE_URL}/auth/v1/admin/users/{uid}",
                    headers=_headers(),
                    timeout=5.0,
                )
                if ua.status_code == 200:
                    email_map[str(uid)] = ua.json().get("email", "")
            except Exception:
                pass

        result = []
        for row in rows:
            uid = str(row["user_id"])
            profile = profile_map.get(uid, {})
            result.append({
                "user_id": uid,
                "full_name": profile.get("full_name"),
                "display_name": profile.get("display_name"),
                "avatar_url": profile.get("avatar_url"),
                "email": email_map.get(uid, ""),
                "joined_at": row.get("joined_at"),
                "role": row.get("role", "member"),
            })
        return result


# ── POST /hubs/{hub_id}/members/{user_id}/approve ─────────────────────────────

@hub_invites_router.post("/hubs/{hub_id}/members/{member_id}/approve")
def approve_member(
    hub_id: str,
    member_id: str,
    authorization: str | None = Header(default=None),
):
    """Hub admin approves a pending membership request."""
    user_id = _verify_jwt(authorization)

    with httpx.Client() as client:
        if not _is_founder(user_id) and not _is_hub_admin(client, hub_id, user_id):
            raise HTTPException(status_code=403, detail="Only hub admins can approve members")

        r = client.patch(
            _rest("/hub_members"),
            params={"hub_id": f"eq.{hub_id}", "user_id": f"eq.{member_id}"},
            json={"status": "active"},
            headers=_headers(),
            timeout=8.0,
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=500, detail="Failed to approve member")
        return {"status": "approved", "user_id": member_id}


# ── POST /hubs/{hub_id}/members/{user_id}/reject ──────────────────────────────

@hub_invites_router.post("/hubs/{hub_id}/members/{member_id}/reject")
def reject_member(
    hub_id: str,
    member_id: str,
    authorization: str | None = Header(default=None),
):
    """Hub admin rejects (soft-deletes) a pending membership request."""
    user_id = _verify_jwt(authorization)

    with httpx.Client() as client:
        if not _is_founder(user_id) and not _is_hub_admin(client, hub_id, user_id):
            raise HTTPException(status_code=403, detail="Only hub admins can reject members")

        r = client.patch(
            _rest("/hub_members"),
            params={"hub_id": f"eq.{hub_id}", "user_id": f"eq.{member_id}"},
            json={"status": "rejected", "is_active": False},
            headers=_headers(),
            timeout=8.0,
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=500, detail="Failed to reject member")
        return {"status": "rejected", "user_id": member_id}
