"""
================================================================================
KindRide Points API — what this file does (founder / non-programmer overview)
================================================================================

BIG PICTURE
-----------
The mobile app should never be allowed to invent points. If the app could write
points directly to the database, a malicious user could give themselves infinite
points. So the rule is:

  Phone  -->  THIS Python API (you control)  -->  Supabase database

The phone proves who it is by sending a short-lived login token (JWT) from
Supabase Auth. This API verifies that token. Only after verification do we
award points using a separate "service role" key that lives only on the server.

KEY IDEA: IDEMPOTENCY
---------------------
Networks fail. Users double-tap buttons. Your app might retry a request.

"Idempotent" means: sending the SAME award request twice must NOT create two
awards. The second time, we detect "this ride was already paid" and return the
same answer as the first time.

We implement that with a database rule: for each driver, each `idempotency_key`
(we use the ride id string from the app) can appear at most once in
`point_events`. See `supabase/points_idempotency.sql`.

REQUEST FLOW (step by step)
---------------------------
1) App calls POST /points/award with JSON body + header:
     Authorization: Bearer <user's Supabase access token>

2) We extract and VERIFY the JWT using SUPABASE_JWT_SECRET.
   - If invalid/missing → 401 Unauthorized.

3) We read the driver's id from the token (`sub` claim). We do NOT trust
   `driverId` from the body for security (we ignore it for now).

4) We check: does a `point_events` row already exist for this driver + ride?
   - If YES → return the same `points_earned` and set idempotent=true.

5) If NO:
   - Calculate points on the server (simple rules for now: 10 + 5 if 5-star).
   - Insert ONE event row with `idempotency_key = rideId`.
   - Ensure a row exists in `points` for this driver (starter balance row).
   - Read current total, add new points, write back total + updated tier.

WHY SERVICE ROLE KEY
--------------------
Row Level Security (RLS) on your tables prevents normal users from inserting
point events. The service role bypasses RLS so THIS backend can write AFTER it
has done its own checks. Never put the service role key in the Expo app.

ENVIRONMENT VARIABLES
---------------------
See `backend/.env.example`. Copy to `backend/.env` and fill values from Supabase.
"""

from __future__ import annotations

import logging
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient
from pydantic import BaseModel, Field

# Always load .env next to this file (Uvicorn's working directory may be elsewhere).
# This file is NOT the same as KindRide/.env used by Expo — you need both.
_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_PATH = _BACKEND_DIR / ".env"
load_dotenv(_ENV_PATH)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()

logger = logging.getLogger("kindride.api")

app = FastAPI(title="KindRide Points API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AwardPointsRequest(BaseModel):
    """What the app sends. `rideId` doubles as our idempotency key for now."""

    rideId: str = Field(min_length=3)
    driverId: str | None = Field(default=None, description="Ignored; driver comes from JWT")
    rating: int = Field(ge=1, le=5)
    wasZeroDetour: bool
    distanceMiles: float = Field(ge=0)


class AwardPointsResponse(BaseModel):
    points_earned: int
    source: str
    idempotent: bool = False


def _require_config() -> None:
    """JWT secret is optional if you only verify via JWKS (RS256); URL + service role are required."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        exists = _ENV_PATH.exists()
        raise HTTPException(
            status_code=500,
            detail=(
                "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. "
                f"Expected a file at: {_ENV_PATH} (file exists: {exists}). "
                "Copy backend/.env.example to backend/.env and fill in values. "
                "Note: KindRide/.env is only for Expo — the Python API reads backend/.env only."
            ),
        )


def _rest_json_list(r: httpx.Response, context: str) -> list:
    """Parse PostgREST JSON array; avoid raw 500s on empty or HTML error bodies."""
    try:
        data = r.json()
    except Exception:
        raise HTTPException(
            status_code=502,
            detail=f"{context}: non-JSON body (status {r.status_code}): {r.text[:1200]}",
        ) from None
    if not isinstance(data, list):
        raise HTTPException(
            status_code=502,
            detail=f"{context}: expected JSON array, got {type(data).__name__}: {str(data)[:500]}",
        )
    return data


def _service_headers() -> dict[str, str]:
    """
    Headers for Supabase PostgREST. Service role bypasses RLS.

    Use the legacy `service_role` JWT (`eyJ...`) from Dashboard → API → *Legacy* API keys
    if `sb_secret_...` returns 401 from PostgREST (some clients work best with the JWT).

    User-Agent avoids Supabase treating the request like a browser (secret keys are
    blocked for browser User-Agents).
    """
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "KindRideBackend/1.0 (server)",
        "Accept": "application/json",
    }


def _verify_user_bearer_token(authorization: str | None) -> str:
    """
    Returns Supabase auth user id (UUID string) from a valid access JWT.

    Supabase may sign session JWTs with either:
    - HS256 + legacy JWT secret (dashboard → JWT Keys → legacy secret), or
    - RS256 / asymmetric keys (JWT Signing Keys). Those are verified via JWKS.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    decoded: dict | None = None

    if SUPABASE_JWT_SECRET:
        try:
            decoded = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError:
            decoded = None

    if decoded is None and SUPABASE_URL:
        try:
            jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
            jwks_client = PyJWKClient(jwks_url, cache_keys=True)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            try:
                decoded = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["RS256", "ES256"],
                    audience="authenticated",
                    issuer=f"{SUPABASE_URL}/auth/v1",
                )
            except jwt.PyJWTError:
                decoded = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["RS256", "ES256"],
                    audience="authenticated",
                )
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

    if decoded is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    sub = decoded.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Token missing user id")
    return sub


def _compute_points(rating: int, _was_zero_detour: bool, distance_miles: float) -> int:
    """
    SERVER-SIDE scoring. Only this function should decide how many points to award
    for a given request (the app may display guesses, but this is the truth).

    Today: base 10 + 5 for five-star. Distance / zero-detour multipliers come next.
    """
    base = 10
    bonus_5_star = 5 if rating == 5 else 0
    _ = distance_miles  # reserved for distance bonus like your blueprint
    _ = _was_zero_detour  # reserved for 1.5x rules
    return base + bonus_5_star


def _tier_for_total(total: int) -> str:
    """Maps total points to enum label used in public.points.tier."""
    if total >= 1000:
        return "Elite"
    if total >= 600:
        return "Leader"
    if total >= 300:
        return "Champion"
    if total >= 100:
        return "GoodSamaritan"
    return "Helper"


def _rest_url(path: str) -> str:
    return f"{SUPABASE_URL}/rest/v1{path}"


def _fetch_existing_award(client: httpx.Client, driver_id: str, ride_id: str) -> int | None:
    """
    If this driver already has an award row for this ride idempotency key, return
    the points_change from that row. Otherwise None.
    """
    params = {
        "driver_id": f"eq.{driver_id}",
        "idempotency_key": f"eq.{ride_id}",
        "select": "points_change",
        "limit": "1",
    }
    r = client.get(_rest_url("/point_events"), params=params, headers=_service_headers(), timeout=30.0)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase read failed: {r.text}")
    rows = _rest_json_list(r, "point_events select")
    if not rows:
        return None
    return int(rows[0]["points_change"])


def _ensure_driver_points_row(client: httpx.Client, driver_id: str) -> None:
    """Calls your SQL helper to create a points row if missing."""
    r = client.post(
        _rest_url("/rpc/ensure_driver_points_row"),
        headers=_service_headers(),
        json={"p_driver_id": driver_id},
        timeout=30.0,
    )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"ensure_driver_points_row failed: {r.text}")


def _fetch_total_points(client: httpx.Client, driver_id: str) -> int:
    params = {"driver_id": f"eq.{driver_id}", "select": "total_points", "limit": "1"}
    r = client.get(_rest_url("/points"), params=params, headers=_service_headers(), timeout=30.0)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Could not read points: {r.text}")
    rows = _rest_json_list(r, "points select")
    if not rows:
        return 0
    return int(rows[0]["total_points"])


def _try_insert_award_event(
    client: httpx.Client,
    driver_id: str,
    ride_id: str,
    points: int,
    payload: AwardPointsRequest,
) -> bool:
    """
    Inserts the ledger row. Returns True if THIS call created the row.
    Returns False if another request already inserted the same key (duplicate / race).
    Only when True should the caller increment `points.total_points`.
    """
    body = {
        "driver_id": driver_id,
        # `ride_id` is stored as uuid in Supabase.
        # The app generates UUIDv4 so this write stays valid.
        "ride_id": ride_id,
        "action": "TRIP_POINTS_AWARDED",
        "points_change": points,
        "idempotency_key": ride_id,
        "metadata": {
            "ride_id": ride_id,
            "rating": payload.rating,
            "was_zero_detour": payload.wasZeroDetour,
            "distance_miles": payload.distanceMiles,
        },
    }
    r = client.post(
        _rest_url("/point_events"),
        headers={**_service_headers(), "Prefer": "return=minimal"},
        json=body,
        timeout=30.0,
    )
    if r.status_code in (200, 201):
        return True
    # Race: two parallel retries hit insert at once — one wins, the other hits unique index.
    if r.status_code == 409 or "duplicate key" in r.text.lower() or "unique" in r.text.lower():
        return False
    raise HTTPException(status_code=502, detail=f"Insert point_events failed: {r.text}")


def _update_points_balance(client: httpx.Client, driver_id: str, new_total: int) -> None:
    tier = _tier_for_total(new_total)
    now = datetime.now(timezone.utc).isoformat()
    r = client.patch(
        _rest_url("/points"),
        params={"driver_id": f"eq.{driver_id}"},
        headers={**_service_headers(), "Prefer": "return=minimal"},
        json={"total_points": new_total, "tier": tier, "last_updated": now},
        timeout=30.0,
    )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Update points failed: {r.text}")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/supabase")
def health_supabase():
    """
    Quick check that PostgREST accepts your service role key.
    Open in a browser while Uvicorn is running: http://127.0.0.1:8000/health/supabase
    """
    _require_config()
    url = f"{SUPABASE_URL}/rest/v1/points?select=driver_id&limit=1"
    try:
        with httpx.Client() as client:
            r = client.get(url, headers=_service_headers(), timeout=15.0)
        return {
            "ok": r.status_code == 200,
            "postgrest_http_status": r.status_code,
            "hint": (
                "If status is 401, open Supabase → Settings → API → Legacy API keys "
                "and paste the long `service_role` JWT (starts with eyJ) into "
                "SUPABASE_SERVICE_ROLE_KEY instead of sb_secret_..."
                if r.status_code == 401
                else None
            ),
            "body_preview": r.text[:400],
        }
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


@app.post("/points/award", response_model=AwardPointsResponse)
def award_points(
    payload: AwardPointsRequest,
    authorization: str | None = Header(default=None),
):
    """
    Awards points for a completed trip, once per (driver, rideId), verified by JWT.
    """
    try:
        _require_config()
        driver_id = _verify_user_bearer_token(authorization)
        points_to_add = _compute_points(payload.rating, payload.wasZeroDetour, payload.distanceMiles)

        with httpx.Client() as client:
            existing = _fetch_existing_award(client, driver_id, payload.rideId)
            if existing is not None:
                return AwardPointsResponse(points_earned=existing, source="backend", idempotent=True)

            _ensure_driver_points_row(client, driver_id)

            inserted = _try_insert_award_event(
                client, driver_id, payload.rideId, points_to_add, payload
            )
            if not inserted:
                concurrent = _fetch_existing_award(client, driver_id, payload.rideId)
                if concurrent is None:
                    raise HTTPException(status_code=502, detail="Duplicate insert but no award row found")
                return AwardPointsResponse(points_earned=concurrent, source="backend", idempotent=True)

            before = _fetch_total_points(client, driver_id)
            new_total = before + points_to_add
            _update_points_balance(client, driver_id, new_total)

            return AwardPointsResponse(points_earned=points_to_add, source="backend", idempotent=False)
    except HTTPException:
        raise
    except Exception as exc:
        tb = traceback.format_exc()
        logger.error("award_points failed: %s", exc)
        logger.error(tb)
        print(tb, file=sys.stderr, flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {exc!s}. Check Uvicorn terminal for full traceback.",
        ) from exc
