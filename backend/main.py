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

import base64
import hmac
import json
import logging
import math
import os
import random
import sys
import traceback
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from typing import Literal
from uuid import UUID

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient
from pydantic import BaseModel, Field, field_validator
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _SLOWAPI_AVAILABLE = True
except ImportError:
    _SLOWAPI_AVAILABLE = False
EXPO_NOTIFICATIONS_AVAILABLE = True  # always available — uses Expo Push API over HTTP


def _send_expo_push(messages: list[dict]) -> dict:
    """Send push notifications via Expo Push API (no third-party library needed)."""
    if not messages:
        return {"status": "no_messages"}
    try:
        with httpx.Client() as client:
            r = client.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
                timeout=15.0,
            )
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning(
            "Expo push HTTP error: %s",
            str(exc),
            extra={"event_type": "expo_push_error"},
        )
        return {"error": str(exc)}

# Import isolated routers
from notifications_routes import notifications_router
from sos_routes import sos_router

# Always load .env next to this file (Uvicorn's working directory may be elsewhere).
# This file is NOT the same as KindRide/.env used by Expo — you need both.
_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_PATH = _BACKEND_DIR / ".env"
load_dotenv(_ENV_PATH)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()
SHARE_TOKEN_SECRET = os.getenv("SHARE_TOKEN_SECRET", "kindride-default-share-secret").strip()
KINDRIDE_ROUTE_COMMITMENT_SECRET = os.getenv(
    "KINDRIDE_ROUTE_COMMITMENT_SECRET",
    SUPABASE_JWT_SECRET or SHARE_TOKEN_SECRET or "kindride-route-commitment-secret",
).strip()

# P2.1: Stripe Identity — set STRIPE_WEBHOOK_SECRET to enable webhook verification.
# Set KINDRIDE_REQUIRE_ID_VERIFIED=true to hard-filter unverified drivers from matching.
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
KINDRIDE_REQUIRE_ID_VERIFIED = os.getenv("KINDRIDE_REQUIRE_ID_VERIFIED", "true").lower() == "true"

# Stripe Connect (voluntary tipping).
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_TIP_WEBHOOK_SECRET = os.getenv("STRIPE_TIP_WEBHOOK_SECRET", "").strip()
STRIPE_CONNECT_RETURN_URL = os.getenv("STRIPE_CONNECT_RETURN_URL", "kindride://connect/return").strip()
KINDRIDE_FOUNDER_USER_ID = os.getenv("KINDRIDE_FOUNDER_USER_ID", "").strip()
# Comma-separated list of founder UUIDs — all have admin privileges
_FOUNDER_IDS: set[str] = {
    uid.strip() for uid in os.getenv("KINDRIDE_FOUNDER_USER_IDS", KINDRIDE_FOUNDER_USER_ID).split(",")
    if uid.strip()
}
try:
    import stripe as _stripe_lib
    _STRIPE_AVAILABLE = bool(STRIPE_SECRET_KEY)
    if _STRIPE_AVAILABLE:
        _stripe_lib.api_key = STRIPE_SECRET_KEY
except ImportError:
    _STRIPE_AVAILABLE = False
    _stripe_lib = None  # type: ignore

# P2.4: Founding driver cohort — drivers who complete their first presence upsert
# before this UTC cutoff receive is_founding_driver=true permanently.
_FOUNDING_COHORT_CUTOFF = datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

logger = logging.getLogger("kindride.api")

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("kindride.log", mode='a')
    ]
)

app = FastAPI(title="KindRide Points API", version="0.8.0")

# Rate limiting — requires `pip install slowapi`.
if _SLOWAPI_AVAILABLE:
    _limiter = Limiter(key_func=get_remote_address, default_limits=[])
    app.state.limiter = _limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
else:
    _limiter = None

# Cache JWKS client so the first request doesn't repeatedly re-instantiate it.
# This reduces latency when JWT verification happens via RS256.
_JWKS_CLIENT: PyJWKClient | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include isolated routers
app.include_router(notifications_router)
app.include_router(sos_router)


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
    credited_driver_id: str
    idempotent: bool = False


class AdminPointsAdjustRequest(BaseModel):
    user_id: str
    delta: int
    reason: str = Field(min_length=3, max_length=200)

    @field_validator("user_id")
    @classmethod
    def valid_user_id(cls, v: str) -> str:
        UUID(v)
        return v

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, v: str) -> str:
        return v.strip()


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


def _ride_transition_conflict_detail(from_status: str, action: str) -> str:
    """
    Normalize lifecycle transition conflict details across ride endpoints.
    """
    status = (from_status or "unknown").strip().lower() or "unknown"
    if action == "request_driver":
        mapping = {
            "requested": "Transition blocked: ride is already requested with another driver.",
            "accepted": "Transition blocked: ride already accepted. Start a new ride to request another driver.",
            "in_progress": "Transition blocked: ride already in progress. Start a new ride to request another driver.",
            "completed": "Transition blocked: ride already completed. Start a new ride to request another driver.",
            "cancelled": "Transition blocked: ride cancelled. Start a new ride to request another driver.",
        }
        return mapping.get(
            status,
            f"Transition blocked: cannot request driver from status '{status}'.",
        )
    if action == "respond":
        mapping = {
            "searching": (
                "Transition blocked: no pending request (status=searching). "
                "The request may have expired (~1 minute) or been reset by the passenger."
            ),
            "accepted": "Transition blocked: ride already accepted.",
            "declined": "Transition blocked: ride already declined.",
            "expired": "Transition blocked: request expired. Passenger must request again.",
            "cancelled": "Transition blocked: ride cancelled.",
            "completed": "Transition blocked: ride already completed.",
            "in_progress": "Transition blocked: ride already in progress.",
        }
        return mapping.get(
            status,
            f"Transition blocked: no pending request to respond to (status={status}).",
        )
    if action == "complete":
        mapping = {
            "declined": "Transition blocked: declined rides cannot be completed.",
            "expired": "Transition blocked: expired rides cannot be completed.",
            "cancelled": "Transition blocked: cancelled rides cannot be completed.",
        }
        return mapping.get(
            status,
            f"Transition blocked: ride is not ready for completion (status={status}).",
        )
    return f"Transition blocked: invalid '{action}' action from status '{status}'."


def _request_trace_id(request: Request | None) -> str | None:
    if request is None:
        return None
    raw = request.headers.get("x-kindride-trace-id", "").strip()
    if not raw:
        return None
    # Keep traces bounded for logs/storage.
    return raw[:128]


def _canonical_json(value: dict) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _b64decode_loose(value: str) -> bytes:
    padded = value.strip().replace("-", "+").replace("_", "/")
    padded += "=" * ((4 - len(padded) % 4) % 4)
    return base64.b64decode(padded)


def _jwk_b64url_to_int(value: str) -> int:
    return int.from_bytes(_b64decode_loose(value), "big")


def _ecdsa_public_key_from_jwk(public_jwk_json: str):
    jwk = json.loads(public_jwk_json)
    if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
        raise ValueError("Only P-256 EC public keys are supported.")
    return ec.EllipticCurvePublicNumbers(
        _jwk_b64url_to_int(jwk["x"]),
        _jwk_b64url_to_int(jwk["y"]),
        ec.SECP256R1(),
    ).public_key()


def _normalize_ecdsa_signature(signature_b64: str) -> bytes:
    sig = _b64decode_loose(signature_b64)
    # Web Crypto often returns the raw IEEE-P1363 (r||s) form for ECDSA.
    if len(sig) == 64:
        r = int.from_bytes(sig[:32], "big")
        s = int.from_bytes(sig[32:], "big")
        return encode_dss_signature(r, s)
    return sig


def _verify_ecdsa_signature(public_jwk_json: str, payload: str, signature_b64: str) -> bool:
    public_key = _ecdsa_public_key_from_jwk(public_jwk_json)
    public_key.verify(
        _normalize_ecdsa_signature(signature_b64),
        payload.encode("utf-8"),
        ec.ECDSA(hashes.SHA256()),
    )
    return True


def _route_commitment_hash(signed_payload: str) -> str:
    secret = KINDRIDE_ROUTE_COMMITMENT_SECRET.encode("utf-8")
    return hmac.new(secret, signed_payload.encode("utf-8"), sha256).hexdigest()


def _point_inside_bbox(lat: float | None, lng: float | None, bbox: dict | None, tolerance: float = 0.0025) -> bool:
    if lat is None or lng is None or not isinstance(bbox, dict):
        return False
    try:
        min_lat = float(bbox["minLat"]) - tolerance
        max_lat = float(bbox["maxLat"]) + tolerance
        min_lng = float(bbox["minLng"]) - tolerance
        max_lng = float(bbox["maxLng"]) + tolerance
    except Exception:
        return False
    return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng


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
            global _JWKS_CLIENT
            if _JWKS_CLIENT is None:
                _JWKS_CLIENT = PyJWKClient(jwks_url, cache_keys=True)
            signing_key = _JWKS_CLIENT.get_signing_key_from_jwt(token)
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


def _compute_points(rating: int, was_zero_detour: bool, distance_miles: float) -> int:
    """
    SERVER-SIDE scoring. Only this function should decide how many points to award
    for a given request (the app may display guesses, but this is the truth).

    Blueprint-aligned scoring (Phase 4 Step 17):
      - base = 10
      - distance bonus = 1 point per mile
      - if zero-detour: multiply subtotal by 1.5
      - if 5-star rating: add +5 after the multiplier
    """
    base_points = 10
    distance_bonus = float(distance_miles) * 1.0
    subtotal = base_points + distance_bonus

    if was_zero_detour:
        subtotal *= 1.5

    rating_bonus = 5 if rating == 5 else 0
    total = subtotal + rating_bonus

    # points.total_points is integer, so round to nearest int.
    return int(round(total))


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

def _compute_streak_from_dates(past_dates: set, reference_date) -> int:
    """
    Given a set of dates on which a driver completed at least one ride,
    compute the current consecutive-day streak ending on reference_date.
    Returns 0 if no ride on reference_date, 1 if only today, etc.
    """
    if reference_date not in past_dates:
        # Check if they rode yesterday (streak is still live today)
        yesterday = reference_date - timedelta(days=1)
        if yesterday not in past_dates:
            return 0
        # Streak is alive from yesterday — count backwards from yesterday
        count = 0
        for i in range(0, 365):
            if (yesterday - timedelta(days=i)) in past_dates:
                count += 1
            else:
                break
        return count

    streak = 1
    for i in range(1, 365):
        if (reference_date - timedelta(days=i)) in past_dates:
            streak += 1
        else:
            break
    return streak


def _fetch_driver_ride_dates(client: httpx.Client, driver_id: str, exclude_ride_id: str | None = None) -> set:
    """Fetch the set of calendar dates on which this driver completed a ride."""
    r = client.get(
        _rest_url("/point_events"),
        params={
            "driver_id": f"eq.{driver_id}",
            "action": "in.(LEG_COMPLETED_BASE,TRIP_POINTS_AWARDED)",
            "select": "created_at,ride_id",
            "order": "created_at.desc",
            "limit": "100",
        },
        headers=_service_headers(),
        timeout=15.0,
    )
    if r.status_code != 200:
        return set()
    rows = _rest_json_list(r, "point_events streak fetch")
    past_dates: set = set()
    for row in rows:
        if exclude_ride_id and str(row.get("ride_id")) == exclude_ride_id:
            continue
        dt = _parse_supabase_timestamptz(row.get("created_at"))
        if dt:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            past_dates.add(dt.date())
    return past_dates


def _evaluate_daily_bonuses(client: httpx.Client, driver_id: str, current_ride_id: str, target_dt: datetime) -> list[tuple[str, int, str]]:
    """Evaluates First Ride and 7-Day Streaks based on past ledger events."""
    past_dates = _fetch_driver_ride_dates(client, driver_id, exclude_ride_id=current_ride_id)
    target_date = target_dt.date()

    bonuses = []
    if target_date not in past_dates:
        bonuses.append(("DAILY_FIRST_RIDE_BONUS", 3, "first_ride"))
        streak_days = _compute_streak_from_dates(past_dates | {target_date}, target_date)
        if streak_days > 0 and streak_days % 7 == 0:
            bonuses.append(("WEEKLY_7_DAY_STREAK_BONUS", 25, "streak_7"))

    return bonuses

def _fetch_completed_ride_for_driver(client: httpx.Client, driver_id: str, ride_id: str) -> dict:
    """Returns rides row dict (status, passenger_id, …) when completed; raises otherwise."""
    r = client.get(
        _rest_url("/rides"),
        params={
            "id": f"eq.{ride_id}",
            "driver_id": f"eq.{driver_id}",
            "select": "status,passenger_id",
            "limit": "1",
        },
        headers=_service_headers(),
        timeout=30.0,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Ride read failed: {r.text}")
    rows = _rest_json_list(r, "rides select")
    if not rows or rows[0].get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Ride is not completed (missing /rides record or status != completed)",
        )
    return rows[0]


def _fetch_completed_ride_for_passenger_rating_bonus(
    client: httpx.Client, passenger_id: str, ride_id: str
) -> dict:
    """
    Passenger star-rating flow: JWT must match rides.passenger_id on a completed row
    with an assigned driver (bonus credits that driver).
    """
    r = client.get(
        _rest_url("/rides"),
        params={
            "id": f"eq.{ride_id}",
            "passenger_id": f"eq.{passenger_id}",
            "select": "status,driver_id,passenger_id",
            "limit": "1",
        },
        headers=_service_headers(),
        timeout=30.0,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Ride read failed: {r.text}")
    rows = _rest_json_list(r, "rides select")
    if not rows or rows[0].get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Ride is not completed (missing /rides record or status != completed)",
        )
    did = rows[0].get("driver_id")
    if not did:
        raise HTTPException(
            status_code=400,
            detail="Ride has no assigned driver; cannot award rating bonus.",
        )
    return rows[0]


def _get_journey_row(client: httpx.Client, journey_id: str) -> dict | None:
    r = client.get(
        _rest_url("/journeys"),
        params={
            "id": f"eq.{journey_id}",
            "select": "id,passenger_id,status",
            "limit": "1",
        },
        headers=_service_headers(),
        timeout=30.0,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"journeys read failed: {r.text}")
    rows = _rest_json_list(r, "journeys select")
    return rows[0] if rows else None


def _ensure_journey_active_for_passenger(
    client: httpx.Client, journey_id: str, passenger_id: str
) -> None:
    """
    Multi-leg: ride completion must reference a journey owned by this passenger
    that is either `active` or `leg_aborted` (passenger retrying after a failed
    handoff). Completing a leg auto-heals a `leg_aborted` journey back to active.
    """
    row = _get_journey_row(client, journey_id)
    if not row:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unknown journey. Passenger must open Ride Request first so the journey is registered."
            ),
        )
    if str(row.get("passenger_id")) != passenger_id:
        raise HTTPException(status_code=403, detail="This journey belongs to another passenger.")
    status = str(row.get("status") or "")
    if status == "leg_aborted":
        # Passenger found a new driver and is completing the leg — heal the journey.
        now = datetime.now(timezone.utc).isoformat()
        client.patch(
            _rest_url("/journeys"),
            params={"id": f"eq.{journey_id}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={"status": "active", "updated_at": now},
            timeout=10.0,
        )
    elif status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"This journey is no longer active (status: {status}).",
        )


def _award_points_with_idempotency(
    client: httpx.Client,
    driver_id: str,
    ride_id: str | None,
    idempotency_key: str,
    action: str,
    points: int,
    metadata: dict,
) -> tuple[int, bool]:
    """
    Ledger-style award with idempotency and balance update.
    Returns: (points_earned, idempotent)
    """
    existing = _fetch_existing_award(client, driver_id, idempotency_key)
    if existing is not None:
        return existing, True

    _ensure_driver_points_row(client, driver_id)

    body = {
        "driver_id": driver_id,
        "ride_id": ride_id,
        "action": action,
        "points_change": points,
        "idempotency_key": idempotency_key,
        "metadata": metadata,
    }
    r = client.post(
        _rest_url("/point_events"),
        headers={**_service_headers(), "Prefer": "return=minimal"},
        json=body,
        timeout=30.0,
    )
    if r.status_code not in (200, 201):
        if r.status_code == 409 or "duplicate key" in r.text.lower() or "unique" in r.text.lower():
            concurrent = _fetch_existing_award(client, driver_id, idempotency_key)
            if concurrent is None:
                raise HTTPException(status_code=502, detail="Duplicate insert but no award row found")
            return concurrent, True
        raise HTTPException(status_code=502, detail=f"Insert point_events failed: {r.text}")

    before = _fetch_total_points(client, driver_id)
    _update_points_balance(client, driver_id, before + points)
    return points, False


@app.get("/health")
def health():
    """Basic health check."""
    logger.info("Health check requested")
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/health/detailed")
def health_detailed():
    """Detailed health check with system metrics."""
    import psutil
    import platform

    try:
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        cpu_percent = psutil.cpu_percent(interval=1)

        health_data = {
            "status": "ok",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "system": {
                "platform": platform.system(),
                "python_version": platform.python_version(),
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "memory_used_mb": memory.used // (1024 * 1024),
                "memory_total_mb": memory.total // (1024 * 1024),
                "disk_percent": disk.percent,
                "disk_free_gb": disk.free // (1024 * 1024 * 1024),
            },
            "services": {
                "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
                "notifications_available": EXPO_NOTIFICATIONS_AVAILABLE,
            }
        }

        logger.info(f"Detailed health check: CPU {cpu_percent}%, Memory {memory.percent}%")
        return health_data
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check error: {str(e)}")


@app.get("/metrics")
def metrics():
    """Prometheus-style metrics endpoint."""
    import time

    # Simple metrics collection (in production, use prometheus_client)
    metrics_data = f"""# KindRide API Metrics
# Generated at {datetime.now(timezone.utc).isoformat()}

# HELP kindride_api_uptime_seconds Time since API started
# TYPE kindride_api_uptime_seconds gauge
kindride_api_uptime_seconds {time.time() - app.startup_time if hasattr(app, 'startup_time') else 0}

# HELP kindride_api_version API version
# TYPE kindride_api_version gauge
kindride_api_version{{version="{app.version}"}} 1

# HELP kindride_config_status Configuration status
# TYPE kindride_config_status gauge
kindride_config_status{{service="supabase", configured="{bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)}"}} 1
kindride_config_status{{service="notifications", configured="{EXPO_NOTIFICATIONS_AVAILABLE}"}} 1
"""

    return Response(content=metrics_data, media_type="text/plain")


@app.get("/logs/recent")
def get_recent_logs(lines: int = 50):
    """Get recent application logs (for debugging)."""
    try:
        with open("kindride.log", "r") as f:
            all_lines = f.readlines()
            recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"logs": recent_lines, "total_lines": len(all_lines)}
    except FileNotFoundError:
        return {"logs": [], "total_lines": 0, "message": "Log file not found"}
    except Exception as e:
        logger.error(f"Failed to read logs: {e}")
        raise HTTPException(status_code=500, detail=f"Log read error: {str(e)}")


_MATCH_ALPHA = float(os.getenv("MATCH_ALPHA", "0.5"))
_MATCH_BETA = float(os.getenv("MATCH_BETA", "0.3"))
_MATCH_GAMMA = float(os.getenv("MATCH_GAMMA", "0.2"))


def _weighted_match_score(
    *,
    intent: str,
    distance_miles: float,
    urgent: bool,
) -> float:
    """
    Founder-aligned Match Score (normalized to ~0..1 for UX).
    Weights default to α=0.5 alignment, β=0.3 distance, γ=0.2 time sensitivity (env overridable).
    """
    align = 1.0 if intent == "already_going" else 0.55
    dist_u = 1.0 / (1.0 + max(distance_miles, 0.01))
    time_u = 1.0 if urgent else 0.25
    raw = _MATCH_ALPHA * align + _MATCH_BETA * dist_u + _MATCH_GAMMA * time_u
    return min(1.0, max(0.0, raw))


class DemoDriverCard(BaseModel):
    """One driver option in the matching list."""

    id: str
    name: str
    tier: str
    etaMinutes: int
    distanceMiles: float
    intent: Literal["already_going", "detour"]
    headingDirection: Literal["north", "south", "east", "west"] = "north"
    matchScore: float | None = Field(
        default=None,
        description="Server-ranked composite score (higher is better).",
    )
    isFoundingDriver: bool = Field(default=False, description="True for founding cohort drivers.")
    idVerified: bool = Field(default=False, description="True when Stripe Identity verified.")
    carMake: str | None = Field(default=None, description="Vehicle make (e.g. Toyota)")
    carModel: str | None = Field(default=None, description="Vehicle model (e.g. Camry)")
    carColor: str | None = Field(default=None, description="Vehicle color (e.g. Silver)")
    carPlate: str | None = Field(default=None, description="License plate")
    carYear: str | None = Field(default=None, description="Vehicle year (e.g. 2019)")
    hubName: str | None = Field(default=None, description="Community hub name if driver is a hub member (e.g. 'UMD')")


def _demo_driver_catalog() -> list[DemoDriverCard]:
    return [
        DemoDriverCard(
            id="1",
            name="Aisha Bello",
            tier="Champion",
            etaMinutes=4,
            distanceMiles=1.1,
            intent="already_going",
            headingDirection="north",
            matchScore=_weighted_match_score(
                intent="already_going", distance_miles=1.1, urgent=False
            ),
        ),
        DemoDriverCard(
            id="2",
            name="Daniel Kim",
            tier="Good Samaritan",
            etaMinutes=6,
            distanceMiles=1.8,
            intent="detour",
            headingDirection="west",
            matchScore=_weighted_match_score(intent="detour", distance_miles=1.8, urgent=False),
        ),
        DemoDriverCard(
            id="3",
            name="Grace Martin",
            tier="Leader",
            etaMinutes=7,
            distanceMiles=2.2,
            intent="already_going",
            headingDirection="east",
            matchScore=_weighted_match_score(
                intent="already_going", distance_miles=2.2, urgent=False
            ),
        ),
    ]


@app.get("/matching/demo-drivers", response_model=list[DemoDriverCard])
def matching_demo_drivers(authorization: str | None = Header(default=None)):
    """
    Demo driver endpoint — disabled for live testing. Returns empty list.
    Kept for backwards compatibility so old clients don't crash.
    """
    _require_config()
    if authorization:
        _verify_user_bearer_token(authorization)
    logger.info("matching_demo_drivers: disabled for live testing, returning empty list")
    return []


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 3958.7613  # Earth radius in miles
    φ1 = radians(lat1)
    φ2 = radians(lat2)
    dφ = radians(lat2 - lat1)
    dλ = radians(lng2 - lng1)
    h = sin(dφ / 2) ** 2 + cos(φ1) * cos(φ2) * sin(dλ / 2) ** 2
    return 2 * r * asin(sqrt(h))


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters (same model as miles helper)."""
    return _haversine_miles(lat1, lng1, lat2, lng2) * 1609.344


# Same defaults as GET /matching/search (keep in sync for eligibility).
_MATCHING_SEARCH_RADIUS_M = 20000.0  # 20km default — wide enough for test networks
_STALE_DRIVER_PRESENCE_MINUTES = 10
_MATCHING_FALLBACK_SCAN_LIMIT = int((os.getenv("KINDRIDE_MATCHING_FALLBACK_SCAN_LIMIT") or "250").split()[0])


def _bearing_degrees(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Initial bearing from (lat1,lng1) to (lat2,lng2), degrees 0–360."""
    φ1 = math.radians(lat1)
    φ2 = math.radians(lat2)
    dλ = math.radians(lng2 - lng1)
    y = math.sin(dλ) * math.cos(φ2)
    x = math.cos(φ1) * math.sin(φ2) - math.sin(φ1) * math.cos(φ2) * math.cos(dλ)
    θ = math.degrees(math.atan2(y, x))
    return (θ + 360) % 360


def _direction_from_bearing_deg(deg: float) -> Literal["north", "south", "east", "west"]:
    d = deg % 360.0
    if 45 <= d < 135:
        return "east"
    if 135 <= d < 225:
        return "south"
    if 225 <= d < 315:
        return "west"
    return "north"


def _route_direction_from_ride_row(row: dict) -> Literal["north", "south", "east", "west"]:
    """Cardinal bucket for pickup→destination (matches matching_search heading filter)."""
    plat = row.get("pickup_lat")
    plng = row.get("pickup_lng")
    dlat = row.get("destination_lat")
    dlng = row.get("destination_lng")
    if plat is None or plng is None or dlat is None or dlng is None:
        raise HTTPException(
            status_code=400,
            detail="Ride is missing pickup or destination coordinates; cannot verify driver eligibility.",
        )
    return _direction_from_bearing_deg(
        _bearing_degrees(float(plat), float(plng), float(dlat), float(dlng))
    )


def _assert_driver_eligible_for_ride_request(client: httpx.Client, ride_row: dict, driver_id: str) -> None:
    """
    P0 targeted requests: only drivers who would appear in /matching/search for this
    ride's pickup, destination corridor, and radius may be set as pending_driver_id.
    Set KINDRIDE_RELAX_DRIVER_REQUEST_ELIGIBILITY=true to skip (local debugging only).
    """
    relax = os.getenv("KINDRIDE_RELAX_DRIVER_REQUEST_ELIGIBILITY", "").strip().lower() in ("1", "true", "yes")
    if relax:
        logger.warning("KINDRIDE_RELAX_DRIVER_REQUEST_ELIGIBILITY: skipping request-driver eligibility check")
        return

    route_dir = _route_direction_from_ride_row(ride_row)
    plat = float(ride_row["pickup_lat"])
    plng = float(ride_row["pickup_lng"])

    r = client.get(
        _rest_url("/driver_presence"),
        params={"driver_id": f"eq.{driver_id}", "select": "*", "limit": "1"},
        headers=_service_headers(),
        timeout=15.0,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not read driver presence for eligibility.")
    rows = _rest_json_list(r, "driver_presence eligibility")
    if not rows:
        raise HTTPException(
            status_code=403,
            detail="Selected driver is not in the live matching pool (no presence record).",
        )
    dp = rows[0]
    if not dp.get("is_available"):
        raise HTTPException(status_code=403, detail="Driver is not marked available for rides.")
    upd = _parse_supabase_timestamptz(dp.get("updated_at"))
    if upd is not None:
        if upd.tzinfo is None:
            upd = upd.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - upd > timedelta(minutes=_STALE_DRIVER_PRESENCE_MINUTES):
            raise HTTPException(
                status_code=403,
                detail="Driver location is stale; they must open Driver mode to refresh GPS.",
            )
    cur_lat = dp.get("current_lat")
    cur_lng = dp.get("current_lng")
    if cur_lat is None or cur_lng is None:
        raise HTTPException(status_code=403, detail="Driver has no GPS in presence.")
    dist_m = _haversine_meters(plat, plng, float(cur_lat), float(cur_lng))

    # Radius check: use full 20km radius for all tiers during development.
    # Helper tier 2km cap re-enabled for production once driver pool is large enough.
    allowed_radius = _MATCHING_SEARCH_RADIUS_M
    if dist_m > allowed_radius:
        raise HTTPException(
            status_code=403,
            detail=f"Driver is outside the {int(allowed_radius/1000)}km pickup radius.",
        )

    # Heading check: disabled during development — small test networks rarely share
    # the same heading. Re-enable for production by uncommenting below.
    # h = str(dp.get("heading_direction") or "north").lower()
    # if h not in ("north", "south", "east", "west"):
    #     h = "north"
    # if h != route_dir:
    #     raise HTTPException(
    #         status_code=403,
    #         detail="Driver heading does not match this trip corridor (pickup→destination).",
    #     )


def _parse_supabase_timestamptz(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    s = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _matching_search_fallback_driver_presence(
    client: httpx.Client,
    passenger_lat: float,
    passenger_lng: float,
    search_radius_meters: float,
    max_results: int,
) -> list[dict]:
    """
    When `find_nearby_drivers` RPC is not installed (404) or PostGIS is unavailable,
    read driver_presence via REST and filter by haversine distance in Python.
    Run `supabase/geospatial_postgis.sql` in Supabase for the indexed RPC path.
    """
    params = {
        "is_available": "eq.true",
        "select": "driver_id,display_name,tier,intent,heading_direction,current_lat,current_lng,is_available,id_verified,is_founding_driver,updated_at",
        "limit": str(_MATCHING_FALLBACK_SCAN_LIMIT),
    }
    r = client.get(_rest_url("/driver_presence"), params=params, headers=_service_headers(), timeout=30.0)
    if r.status_code != 200:
        logger.warning(
            "matching_search fallback: driver_presence GET failed status=%s body=%s",
            r.status_code,
            (r.text or "")[:400],
        )
        return []
    try:
        raw_rows = r.json()
    except Exception:
        return []
    if not isinstance(raw_rows, list):
        return []

    stale_before = datetime.now(timezone.utc) - timedelta(minutes=10)
    candidates: list[tuple[float, dict]] = []
    for row in raw_rows:
        if not isinstance(row, dict):
            continue
        try:
            plat = row.get("current_lat")
            plng = row.get("current_lng")
            if plat is None or plng is None:
                continue
            lat, lng = float(plat), float(plng)
            dist_m = _haversine_meters(passenger_lat, passenger_lng, lat, lng)
            if dist_m > search_radius_meters:
                continue
            upd = _parse_supabase_timestamptz(row.get("updated_at"))
            if upd is not None and upd.tzinfo is None:
                upd = upd.replace(tzinfo=timezone.utc)
            if upd is not None and upd < stale_before:
                continue
            candidates.append(
                (
                    dist_m,
                    {
                        "driver_id": row.get("driver_id"),
                        "display_name": row.get("display_name"),
                        "tier": row.get("tier"),
                        "intent": row.get("intent"),
                        "heading_direction": row.get("heading_direction"),
                        "current_lat": lat,
                        "current_lng": lng,
                        "distance_meters": dist_m,
                        "is_available": row.get("is_available"),
                        "updated_at": row.get("updated_at"),
                    },
                )
            )
        except (TypeError, ValueError):
            continue

    candidates.sort(key=lambda x: x[0])
    return [item[1] for item in candidates[:max_results]]


@app.get("/matching/search", response_model=list[DemoDriverCard])
def matching_search(
    originLat: float,
    originLng: float,
    destinationDirection: Literal["north", "south", "east", "west"] = "north",
    urgent: bool = Query(default=False, description="Time-sensitive request (↑ γ weight in Match Score)."),
    radiusMeters: float = Query(default=20000.0, description="Search radius in meters"),
    authorization: str | None = Header(default=None),
):
    """
    Matching: prefers PostGIS RPC `find_nearby_drivers` when deployed
    (`supabase/geospatial_postgis.sql`). If the RPC is missing (404) or errors,
    falls back to REST `driver_presence` + haversine filtering in Python.
    """
    _require_config()
    # Matching search can be used in demo mode before sign-in.
    passenger_id: str | None = None
    if authorization:
        passenger_id = _verify_user_bearer_token(authorization)

    search_radius_meters = radiusMeters
    max_results = 20
    rows: list[dict] = []

    with httpx.Client() as client:
        body = {
            "passenger_lat": originLat,
            "passenger_lng": originLng,
            "search_radius_meters": search_radius_meters,
            "max_results": max_results,
        }
        r = client.post(
            _rest_url("/rpc/find_nearby_drivers"),
            headers=_service_headers(),
            json=body,
            timeout=30.0,
        )
        if r.status_code == 200:
            rows = _rest_json_list(r, "find_nearby_drivers")
        else:
            logger.warning(
                "find_nearby_drivers RPC failed status=%s (404 means run supabase/geospatial_postgis.sql). "
                "Using driver_presence REST + haversine fallback. body=%s",
                r.status_code,
                (r.text or "")[:500],
            )
            rows = _matching_search_fallback_driver_presence(
                client, originLat, originLng, search_radius_meters, max_results
            )

    out: list[DemoDriverCard] = []
    for row in rows:
        try:
            heading = str(row.get("heading_direction") or "north")
            # Heading filter: soft-match — opposite directions excluded, but perpendicular OK.
            # In small test networks (few drivers) we skip this filter entirely so testers
            # can always find each other regardless of heading. Re-enable for production.
            OPPOSITE = {"north": "south", "south": "north", "east": "west", "west": "east"}
            if heading == OPPOSITE.get(destinationDirection):
                pass  # soft: don't exclude even opposites during testing

            distance_meters = float(row.get("distance_meters", 0))
            tier = str(row.get("tier") or "Helper")
            # P1.6 Progressive Trust: cap lifted to full radius during development so test
            # drivers (all Helper tier) are visible across the search radius.
            allowed_radius = search_radius_meters
            if distance_meters > allowed_radius:
                continue
            
            # P2.1: Hard-filter unverified drivers when operator flag is set.
            id_verified = bool(row.get("id_verified"))
            if KINDRIDE_REQUIRE_ID_VERIFIED and not id_verified:
                continue

            distance_miles = distance_meters * 0.000621371  # convert meters to miles
            eta = max(2, int(round((distance_miles / 22.0) * 60)))  # assume ~22 mph average
            intent_raw = str(row.get("intent") or "already_going")
            score = _weighted_match_score(
                intent=intent_raw,
                distance_miles=round(distance_miles, 4),
                urgent=urgent,
            )
            # P2.1: Verified drivers get a 10% match score boost (soft preference).
            if id_verified:
                score = min(1.0, score * 1.10)
            is_founding = bool(row.get("is_founding_driver"))
            out.append(
                DemoDriverCard(
                    id=str(row.get("driver_id")),
                    name=str(row.get("display_name") or "Driver"),
                    tier=str(row.get("tier") or "Helper"),
                    etaMinutes=eta,
                    distanceMiles=round(distance_miles, 2),
                    intent=intent_raw,  # type: ignore[arg-type]
                    headingDirection=heading,  # type: ignore[arg-type]
                    isFoundingDriver=is_founding,
                    idVerified=id_verified,
                    matchScore=score,
                    carMake=str(row["car_make"]) if row.get("car_make") else None,
                    carModel=str(row["car_model"]) if row.get("car_model") else None,
                    carColor=str(row["car_color"]) if row.get("car_color") else None,
                    carPlate=str(row["car_plate"]) if row.get("car_plate") else None,
                    carYear=str(row["car_year"]) if row.get("car_year") else None,
                )
            )
        except Exception:
            continue

    # ── Hub enrichment: attach hubName + boost same-hub drivers ──────────────
    # Best-effort: hub lookup failure never breaks matching.
    if out:
        try:
            with httpx.Client() as hub_client:
                # 1. Batch-fetch which drivers belong to a hub
                ids_csv = ",".join(d.id for d in out)
                rh = hub_client.get(
                    _rest_url("/hub_members"),
                    params={
                        "select": "user_id,hub_id,hub:hubs(name)",
                        "user_id": f"in.({ids_csv})",
                        "is_active": "eq.true",
                    },
                    headers=_service_headers(),
                    timeout=10.0,
                )
                # map: driver_id → (hub_id, hub_name)
                driver_hub: dict[str, tuple[str, str]] = {}
                if rh.status_code == 200:
                    for hr in rh.json():
                        uid = hr.get("user_id")
                        hub_id = hr.get("hub_id")
                        hub_obj = hr.get("hub")
                        hub_name = hub_obj.get("name") if isinstance(hub_obj, dict) else None
                        if uid and hub_id and hub_name and uid not in driver_hub:
                            driver_hub[uid] = (str(hub_id), str(hub_name))

                # 2. Fetch passenger's hub memberships (if authed) for same-hub boost
                passenger_hub_ids: set[str] = set()
                if passenger_id:
                    rp = hub_client.get(
                        _rest_url("/hub_members"),
                        params={
                            "select": "hub_id",
                            "user_id": f"eq.{passenger_id}",
                            "is_active": "eq.true",
                        },
                        headers=_service_headers(),
                        timeout=10.0,
                    )
                    if rp.status_code == 200:
                        for pr in rp.json():
                            if pr.get("hub_id"):
                                passenger_hub_ids.add(str(pr["hub_id"]))

                # 3. Apply hubName and same-hub score boost to driver cards
                for d in out:
                    hub_entry = driver_hub.get(d.id)
                    if hub_entry:
                        hub_id, hub_name = hub_entry
                        d.hubName = hub_name
                        # Same-hub drivers get a 25% score boost so they float to the top
                        if hub_id in passenger_hub_ids and d.matchScore is not None:
                            d.matchScore = min(1.0, d.matchScore * 1.25)
        except Exception:
            pass  # hub lookup is best-effort; matching continues without hub data

    results = sorted(out, key=lambda d: (-(d.matchScore or 0), d.etaMinutes))
    logger.info(
        "matching_search: origin=(%.5f,%.5f) direction=%s candidates=%s matched=%s",
        originLat,
        originLng,
        destinationDirection,
        len(rows),
        len(results),
    )
    return results


def _rides_get_by_id(client: httpx.Client, ride_id: str) -> dict | None:
    r = client.get(
        _rest_url("/rides"),
        params={"id": f"eq.{ride_id}", "select": "*", "limit": "1"},
        headers=_service_headers(),
        timeout=30.0,
    )
    if r.status_code != 200:
        return None
    rows = _rest_json_list(r, "rides by id")
    return rows[0] if rows else None


def _make_share_token(ride_id: str) -> str:
    digest = hmac.new(SHARE_TOKEN_SECRET.encode(), ride_id.encode(), sha256).digest()
    token = base64.urlsafe_b64encode(ride_id.encode() + b"." + digest).decode().rstrip("=")
    return token


def _parse_share_token(token: str) -> str | None:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        ride_id, signature = decoded.split(b".", 1)
        expected = hmac.new(SHARE_TOKEN_SECRET.encode(), ride_id, sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        return ride_id.decode("utf-8")
    except Exception:
        return None


def _rides_expire_requested_if_needed(client: httpx.Client, row: dict) -> dict:
    """Transition an overdue requested ride to 'expired' so the passenger can retry."""
    if str(row.get("status")) != "requested":
        return row
    exp = _parse_supabase_timestamptz(row.get("request_expires_at"))
    if exp is None:
        return row
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) <= exp:
        return row
    rid = row.get("id")
    if not rid:
        return row
    r = client.patch(
        _rest_url("/rides"),
        params={"id": f"eq.{rid}"},
        headers={**_service_headers(), "Prefer": "return=minimal"},
        json={
            "status": "expired",
            "pending_driver_id": None,
            "request_expires_at": None,
        },
        timeout=30.0,
    )
    if r.status_code not in (200, 204):
        return row
    logger.info(
        "ride_request_expired ride_id=%s pending_driver=%s",
        rid,
        row.get("pending_driver_id"),
        extra={"event_type": "ride_request_expired", "ride_id": str(rid)},
    )
    return _rides_get_by_id(client, str(rid)) or row


def _notify_driver_ride_request(*, driver_user_id: str, ride_id: str, destination_hint: str) -> None:
    """
    Send a single Expo push to the requested driver only (lookup in push_tokens by user_id).
    Called after POST /rides/request-driver persists pending_driver_id + requested.
    Uses Expo Push API over HTTP — no third-party library needed.
    """
    try:
        with httpx.Client() as client:
            r = client.get(
                _rest_url("/push_tokens"),
                params={"user_id": f"eq.{driver_user_id}", "select": "push_token", "limit": "1"},
                headers=_service_headers(),
                timeout=15.0,
            )
            if r.status_code != 200:
                return
            rows = _rest_json_list(r, "push_tokens ride_request")
            if not rows:
                logger.info(
                    "ride_request push skipped (no push_token for driver)",
                    extra={"event_type": "ride_request_push", "ride_id": ride_id},
                )
                return
            token = rows[0].get("push_token")
            if not token or not isinstance(token, str):
                return

        hint = destination_hint.strip()[:80] if destination_hint else ""
        body = (
            "A passenger requested you for a KindRide trip."
            + (f" Destination: {hint}." if hint else "")
        )
        logger.info(
            "ride_request push sending ride_id=%s driver=%s",
            ride_id,
            driver_user_id,
            extra={"event_type": "ride_request_push", "ride_id": ride_id},
        )
        result = _send_expo_push([
            {
                "to": token,
                "title": "New Ride Request 🚗",
                "body": body,
                "sound": "default",
                "data": {
                    "url": f"/incoming-ride?rideId={ride_id}",
                    "rideId": ride_id,
                    "type": "incoming_ride_request",
                    "destinationHint": hint,
                },
            }
        ])
        logger.info(
            "ride_request push result ride_id=%s result=%s",
            ride_id,
            str(result)[:200],
            extra={"event_type": "ride_request_push_result", "ride_id": ride_id},
        )
    except Exception as exc:
        # Never crash the request flow because of a notification failure
        logger.warning(
            "ride_request push failed (non-fatal): %s",
            str(exc),
            extra={"event_type": "ride_request_push_error", "ride_id": ride_id},
        )


class StartRideSearchRequest(BaseModel):
    """Passenger starts (or refreshes) a ride session row in `searching` state."""

    rideId: str = Field(min_length=3)
    pickupLat: float = Field(ge=-90, le=90)
    pickupLng: float = Field(ge=-180, le=180)
    destinationLat: float = Field(ge=-90, le=90)
    destinationLng: float = Field(ge=-180, le=180)
    destinationLabel: str | None = Field(default=None, max_length=200)
    journeyId: str | None = None
    legIndex: int = Field(default=1, ge=1, le=500)

    @field_validator("rideId")
    @classmethod
    def ride_uuid(cls, v: str) -> str:
        UUID(v)
        return v

    @field_validator("journeyId", mode="before")
    @classmethod
    def journey_empty(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("journeyId")
    @classmethod
    def journey_uuid(cls, v: str | None) -> str | None:
        if v is None:
            return None
        UUID(v)
        return v

    @field_validator("destinationLabel", mode="before")
    @classmethod
    def label_strip(cls, v: object) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return str(v).strip() if isinstance(v, str) else v


class RequestDriverForRideRequest(BaseModel):
    rideId: str = Field(min_length=3)
    driverId: str = Field(min_length=3)

    @field_validator("rideId", "driverId")
    @classmethod
    def must_be_uuid(cls, v: str) -> str:
        UUID(v)
        return v


class RespondToRideRequestPayload(BaseModel):
    rideId: str = Field(min_length=3)
    accept: bool

    @field_validator("rideId")
    @classmethod
    def ride_uuid(cls, v: str) -> str:
        UUID(v)
        return v


@app.post("/rides/start-search")
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def rides_start_search(
    request: Request,
    payload: StartRideSearchRequest,
    authorization: str | None = Header(default=None),
):
    """
    Idempotent upsert: creates/updates a ride row owned by the passenger in `searching` state.
    Run after the passenger has GPS + destination so analytics and later matching bind to one `rideId`.
    """
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)
    now = datetime.now(timezone.utc).isoformat()
    body: dict = {
        "id": payload.rideId,
        "passenger_id": passenger_id,
        "status": "searching",
        "pending_driver_id": None,
        "request_expires_at": None,
        "pickup_lat": payload.pickupLat,
        "pickup_lng": payload.pickupLng,
        "destination_lat": payload.destinationLat,
        "destination_lng": payload.destinationLng,
    }
    if payload.destinationLabel:
        body["destination_label"] = payload.destinationLabel
    if payload.journeyId:
        body["journey_id"] = payload.journeyId
        body["leg_index"] = payload.legIndex

    with httpx.Client() as client:
        existing = _rides_get_by_id(client, payload.rideId)
        if existing and str(existing.get("passenger_id")) != passenger_id:
            raise HTTPException(status_code=403, detail="This rideId belongs to another passenger.")
        if existing and str(existing.get("status")) in ("accepted", "in_progress", "completed"):
            raise HTTPException(
                status_code=409,
                detail=f"Ride is already {existing.get('status')}; create a new rideId for a new trip.",
            )
        # Don't reset an active pending request back to searching — the passenger should wait
        # for the driver to accept/decline, or call /rides/cancel-pending first.
        if existing and str(existing.get("status")) == "requested":
            return {
                "ride_id": payload.rideId,
                "status": "requested",
                "updated_at": now,
                "no_op": True,
            }

        r = client.post(
            _rest_url("/rides"),
            headers={
                **_service_headers(),
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=body,
            timeout=30.0,
        )
        if r.status_code not in (200, 201, 204):
            raise HTTPException(status_code=502, detail=f"rides start-search failed: {r.text}")

    return {
        "ride_id": payload.rideId,
        "status": "searching",
        "updated_at": now,
    }


@app.post("/rides/request-driver")
@(_limiter.limit("10/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def rides_request_driver(
    request: Request,
    payload: RequestDriverForRideRequest,
    authorization: str | None = Header(default=None),
):
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)
    trace_id = _request_trace_id(request)
    logger.info(
        "rides_request_driver trace=%s ride_id=%s passenger_id=%s driver_id=%s",
        trace_id,
        payload.rideId,
        passenger_id,
        payload.driverId,
    )
    if payload.driverId == passenger_id:
        raise HTTPException(status_code=400, detail="Cannot request yourself as driver.")

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=90)

    with httpx.Client() as client:
        row = _rides_get_by_id(client, payload.rideId)
        if not row:
            raise HTTPException(status_code=404, detail="Ride not found. Call /rides/start-search first.")
        row = _rides_expire_requested_if_needed(client, row)
        if str(row.get("passenger_id")) != passenger_id:
            raise HTTPException(status_code=403, detail="Not your ride.")

        st = str(row.get("status"))
        pending_existing = str(row.get("pending_driver_id") or "")

        if st == "requested" and pending_existing == str(payload.driverId):
            # Same driver + still pending: idempotent (double-tap / retry); refresh window and re-send push.
            _assert_driver_eligible_for_ride_request(client, row, payload.driverId)
            r = client.patch(
                _rest_url("/rides"),
                params={"id": f"eq.{payload.rideId}"},
                headers={**_service_headers(), "Prefer": "return=minimal"},
                json={
                    "request_expires_at": expires_at.isoformat(),
                },
                timeout=30.0,
            )
            if r.status_code not in (200, 204):
                raise HTTPException(status_code=502, detail=f"rides request-driver refresh failed: {r.text}")
            dest_label = row.get("destination_label") if isinstance(row.get("destination_label"), str) else ""
            try:
                _notify_driver_ride_request(
                    driver_user_id=payload.driverId,
                    ride_id=payload.rideId,
                    destination_hint=dest_label or "",
                )
            except Exception as e:
                logger.warning("ride_request push failed ride_id=%s err=%s", payload.rideId, str(e)[:200])
            return {
                "ride_id": payload.rideId,
                "status": "requested",
                "request_expires_at": expires_at.isoformat(),
                "idempotent": True,
            }

        if st not in ("searching", "declined", "expired"):
            if st == "requested":
                raise HTTPException(
                    status_code=409,
                    detail=_ride_transition_conflict_detail(st, "request_driver"),
                )
            raise HTTPException(status_code=409, detail=_ride_transition_conflict_detail(st, "request_driver"))

        dest_label = row.get("destination_label") if isinstance(row.get("destination_label"), str) else ""

        _assert_driver_eligible_for_ride_request(client, row, payload.driverId)

        r = client.patch(
            _rest_url("/rides"),
            params={"id": f"eq.{payload.rideId}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={
                "status": "requested",
                "pending_driver_id": payload.driverId,
                "request_expires_at": expires_at.isoformat(),
            },
            timeout=30.0,
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"rides request-driver failed: {r.text}")

    try:
        _notify_driver_ride_request(
            driver_user_id=payload.driverId,
            ride_id=payload.rideId,
            destination_hint=dest_label or "",
        )
    except Exception as e:
        logger.warning("ride_request push failed ride_id=%s err=%s", payload.rideId, str(e)[:200])

    return {
        "ride_id": payload.rideId,
        "status": "requested",
        "request_expires_at": expires_at.isoformat(),
    }


class CancelPendingRideRequest(BaseModel):
    rideId: str = Field(min_length=3)

    @field_validator("rideId")
    @classmethod
    def ride_uuid(cls, v: str) -> str:
        UUID(v)
        return v


class RideRequest(BaseModel):
    pickup: str = Field(min_length=3, max_length=200)
    dropoff: str = Field(min_length=3, max_length=200)
    scheduled_for: datetime | None = None

    @field_validator("pickup", "dropoff")
    @classmethod
    def normalize_address(cls, v: str) -> str:
        return v.strip()


@app.post("/rides/cancel-pending")
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def rides_cancel_pending(
    request: Request,
    payload: CancelPendingRideRequest,
    authorization: str | None = Header(default=None),
):
    """Passenger clears a stuck `requested` state so they can pick another driver or retry."""
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        row = _rides_get_by_id(client, payload.rideId)
        if not row:
            raise HTTPException(status_code=404, detail="Ride not found.")
        if str(row.get("passenger_id")) != passenger_id:
            raise HTTPException(status_code=403, detail="Not your ride.")
        st = str(row.get("status"))
        if st == "accepted":
            # Passenger cancelling an accepted ride — hard cancel, driver notified via status poll.
            r = client.patch(
                _rest_url("/rides"),
                params={"id": f"eq.{payload.rideId}"},
                headers={**_service_headers(), "Prefer": "return=minimal"},
                json={"status": "cancelled"},
                timeout=30.0,
            )
            if r.status_code not in (200, 204):
                raise HTTPException(status_code=502, detail=f"cancel-accepted failed: {r.text}")
            return {"ride_id": payload.rideId, "status": "cancelled"}
        if st != "requested":
            # Not in a cancellable state — treat as no-op so the passenger flow can
            # proceed to the next candidate without surfacing a spurious error.
            return {"ride_id": payload.rideId, "status": st, "no_op": True}
        r = client.patch(
            _rest_url("/rides"),
            params={"id": f"eq.{payload.rideId}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={
                "status": "searching",
                "pending_driver_id": None,
                "request_expires_at": None,
            },
            timeout=30.0,
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"cancel-pending failed: {r.text}")

    return {"ride_id": payload.rideId, "status": "searching"}


@app.post("/rides/request")
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def rides_request(
    request: Request,
    payload: RideRequest,
    authorization: str | None = Header(default=None),
):
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)

    body: dict[str, object] = {
        "passenger_id": passenger_id,
        "status": "scheduled" if payload.scheduled_for else "searching",
        "pickup_address": payload.pickup,
        "dropoff_address": payload.dropoff,
        "destination_label": payload.dropoff,
    }
    if payload.scheduled_for is not None:
        scheduled_for = payload.scheduled_for
        if scheduled_for.tzinfo is None:
            scheduled_for = scheduled_for.replace(tzinfo=timezone.utc)
        body["scheduled_for"] = scheduled_for.astimezone(timezone.utc).isoformat()

    with httpx.Client() as client:
        r = client.post(
            _rest_url("/rides"),
            headers={**_service_headers(), "Prefer": "return=representation"},
            json=body,
            timeout=30.0,
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"rides request failed: {r.text}")
        rows = _rest_json_list(r, "rides request insert")
        created = rows[0] if rows else {}

    return {
        "ride_id": created.get("id"),
        "status": created.get("status", body["status"]),
        "scheduled_for": created.get("scheduled_for"),
    }


@app.post("/rides/respond")
@(_limiter.limit("30/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def rides_respond(
    request: Request,
    payload: RespondToRideRequestPayload,
    authorization: str | None = Header(default=None),
):
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)
    trace_id = _request_trace_id(request)
    logger.info(
        "rides_respond trace=%s ride_id=%s driver_id=%s accept=%s",
        trace_id,
        payload.rideId,
        driver_id,
        payload.accept,
    )

    with httpx.Client() as client:
        row = _rides_get_by_id(client, payload.rideId)
        if not row:
            raise HTTPException(status_code=404, detail="Ride not found.")
        row = _rides_expire_requested_if_needed(client, row)
        st = str(row.get("status") or "")

        # Idempotent accept: duplicate taps / retries after success should not 409.
        if payload.accept and st == "accepted":
            assigned = str(row.get("driver_id") or "")
            if assigned == driver_id:
                return {"ride_id": payload.rideId, "status": "accepted"}
            raise HTTPException(status_code=403, detail="Another driver already accepted this ride.")

        if st != "requested":
            raise HTTPException(status_code=409, detail=_ride_transition_conflict_detail(st, "respond"))

        pending = row.get("pending_driver_id")
        if not pending or str(pending) != driver_id:
            raise HTTPException(status_code=403, detail="You are not the requested driver.")

        if payload.accept:
            patch = {
                "status": "accepted",
                "driver_id": driver_id,
                "pending_driver_id": None,
                "request_expires_at": None,
            }
        else:
            patch = {
                "status": "declined",
                "pending_driver_id": None,
                "request_expires_at": None,
            }

        r = client.patch(
            _rest_url("/rides"),
            params={
                "id": f"eq.{payload.rideId}",
                "status": "eq.requested",
                "pending_driver_id": f"eq.{driver_id}",
            },
            # Use return=representation so PostgREST returns [] when 0 rows matched
            # (race: pending_driver_id or status changed between pre-read and write).
            # With return=minimal we always get 204 and cannot detect the race.
            headers={**_service_headers(), "Prefer": "return=representation"},
            json=patch,
            timeout=30.0,
        )
        if r.status_code not in (200, 201, 204):
            raise HTTPException(status_code=502, detail=f"rides respond failed: {r.text}")
        # Detect 0-row race: PostgREST returns 200 with [] when WHERE matched nothing.
        updated_rows: list = []
        try:
            body = r.json()
            if isinstance(body, list):
                updated_rows = body
        except Exception:
            pass
        if r.status_code in (200, 201) and len(updated_rows) == 0:
            # No rows updated — race: status or pending_driver_id changed after pre-read.
            latest = _rides_get_by_id(client, payload.rideId)
            latest_st = str((latest or {}).get("status") or "")
            if payload.accept and latest_st == "accepted":
                latest_driver = str((latest or {}).get("driver_id") or "")
                if latest_driver == driver_id:
                    return {"ride_id": payload.rideId, "status": "accepted"}
                raise HTTPException(status_code=403, detail="Another driver already accepted this ride.")
            raise HTTPException(
                status_code=409,
                detail=_ride_transition_conflict_detail(latest_st, "respond"),
            )

        if not payload.accept:
            logger.info(
                "ride_declined ride_id=%s driver_id=%s",
                payload.rideId,
                driver_id,
                extra={"event_type": "ride_declined", "ride_id": payload.rideId},
            )
        else:
            # Notify the passenger their driver is on the way
            try:
                passenger_id = str(row.get("passenger_id") or "")
                if passenger_id:
                    pt_r = client.get(
                        _rest_url("/push_tokens"),
                        params={"user_id": f"eq.{passenger_id}", "select": "push_token", "limit": "1"},
                        headers=_service_headers(),
                        timeout=10.0,
                    )
                    pt_rows = _rest_json_list(pt_r, "passenger push_token lookup") if pt_r.status_code == 200 else []
                    if pt_rows:
                        passenger_token = pt_rows[0].get("push_token")
                        if passenger_token:
                            _send_expo_push([{
                                "to": passenger_token,
                                "title": "Driver is on the way! 🚗",
                                "body": "Your driver accepted your request. Track them on the map.",
                                "sound": "default",
                                "data": {
                                    "url": f"/active-trip?rideId={payload.rideId}",
                                    "rideId": payload.rideId,
                                    "type": "ride_accepted",
                                },
                            }])
                            logger.info("ride_accepted push sent to passenger=%s", passenger_id)
            except Exception as exc:
                logger.warning("ride_accepted push failed (non-fatal): %s", str(exc))

    return {
        "ride_id": payload.rideId,
        "status": "accepted" if payload.accept else "declined",
    }


@app.get("/rides/incoming-for-driver")
def rides_incoming_for_driver(
    request: Request,
    authorization: str | None = Header(default=None),
):
    """
    Rides where this user is `pending_driver_id` and status is `requested`.
    Lets the driver app poll for Uber-style incoming requests without typing a ride id.
    Rows past `request_expires_at` are auto-expired like other ride reads.
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)
    trace_id = _request_trace_id(request)

    with httpx.Client() as client:
        r = client.get(
            _rest_url("/rides"),
            params={
                "pending_driver_id": f"eq.{driver_id}",
                "status": "eq.requested",
                "select": "id,status,destination_label,request_expires_at,pickup_lat,pickup_lng,destination_lat,destination_lng,passenger_id",
                "order": "request_expires_at.asc",
                "limit": "20",
            },
            headers=_service_headers(),
            timeout=30.0,
        )
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"rides incoming query failed: {r.text}")
        rows = _rest_json_list(r, "rides incoming for driver")

        # Fetch driver's current GPS so we can compute distance to each pickup.
        driver_lat: float | None = None
        driver_lng: float | None = None
        try:
            dp_r = client.get(
                _rest_url("/driver_presence"),
                params={"driver_id": f"eq.{driver_id}", "select": "current_lat,current_lng", "limit": "1"},
                headers=_service_headers(),
                timeout=10.0,
            )
            if dp_r.status_code == 200:
                dp_rows = _rest_json_list(dp_r, "driver_presence for distance")
                if dp_rows:
                    driver_lat = dp_rows[0].get("current_lat")
                    driver_lng = dp_rows[0].get("current_lng")
                    driver_lat = float(driver_lat) if driver_lat is not None else None
                    driver_lng = float(driver_lng) if driver_lng is not None else None
        except Exception:
            pass

        # Batch-fetch passenger display names from profiles.
        passenger_ids = list({str(row["passenger_id"]) for row in rows if isinstance(row, dict) and row.get("passenger_id")})
        passenger_names: dict[str, str] = {}
        if passenger_ids:
            try:
                ids_csv = ",".join(passenger_ids)
                prof_r = client.get(
                    _rest_url("/profiles"),
                    params={"id": f"in.({ids_csv})", "select": "id,full_name,display_name", "limit": "50"},
                    headers=_service_headers(),
                    timeout=10.0,
                )
                if prof_r.status_code == 200:
                    for p in _rest_json_list(prof_r, "passenger profiles"):
                        pid = str(p.get("id") or "")
                        name = str(p.get("full_name") or p.get("display_name") or "").strip()
                        if pid and name:
                            passenger_names[pid] = name
            except Exception:
                pass

        out: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            row = _rides_expire_requested_if_needed(client, row)
            if str(row.get("status")) != "requested":
                continue
            rid = row.get("id")
            if not rid:
                continue

            plat = row.get("pickup_lat")
            plng = row.get("pickup_lng")
            dlat = row.get("destination_lat")
            dlng = row.get("destination_lng")

            # Distance from driver to pickup in km.
            distance_km: float | None = None
            if driver_lat is not None and driver_lng is not None and plat is not None and plng is not None:
                try:
                    distance_km = round(_haversine_meters(driver_lat, driver_lng, float(plat), float(plng)) / 1000, 1)
                except Exception:
                    pass

            # Trip distance estimate for kind_points (pickup → destination).
            trip_km: float | None = None
            if plat is not None and plng is not None and dlat is not None and dlng is not None:
                try:
                    trip_km = _haversine_meters(float(plat), float(plng), float(dlat), float(dlng)) / 1000
                except Exception:
                    pass

            # Kind points: 10 base + 1 per km of trip, capped at 30.
            kind_points = 10
            if trip_km is not None:
                kind_points = min(30, 10 + int(trip_km))

            passenger_id = str(row.get("passenger_id") or "")
            passenger_name = passenger_names.get(passenger_id) or None

            out.append(
                {
                    "ride_id": str(rid),
                    "destination_label": row.get("destination_label"),
                    "request_expires_at": row.get("request_expires_at"),
                    "pickup_lat": plat,
                    "pickup_lng": plng,
                    "destination_lat": dlat,
                    "destination_lng": dlng,
                    "passenger_id": passenger_id or None,
                    "passenger_name": passenger_name,
                    "distance_km": distance_km,
                    "kind_points": kind_points,
                }
            )
        logger.info(
            "rides_incoming_for_driver trace=%s driver_id=%s count=%s",
            trace_id,
            driver_id,
            len(out),
        )
        return {"rides": out}


@app.get("/rides/status/{ride_id}")
def rides_status(
    ride_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    """Passenger, pending driver, or assigned driver may poll ride state."""
    _require_config()
    uid = _verify_user_bearer_token(authorization)
    trace_id = _request_trace_id(request)
    try:
        UUID(ride_id)
    except Exception as err:
        raise HTTPException(status_code=400, detail="ride_id must be a UUID") from err

    with httpx.Client() as client:
        row = _rides_get_by_id(client, ride_id)
        if not row:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Ride not found. The passenger app must register this ride id (POST /rides/start-search) "
                    "while signed in, or the id is from an old session — open Ride Request again for a fresh id."
                ),
            )
        # Snapshot before expiry: `_rides_expire_requested_if_needed` clears `pending_driver_id` when the
        # window ends. Without this, the driver who was pending can get 403 on GET /rides/status even though
        # GET /rides/incoming-for-driver listed the same ride a second earlier (race at expiry).
        pend_pre = str(row.get("pending_driver_id") or "")
        st_pre = str(row.get("status") or "")
        row = _rides_expire_requested_if_needed(client, row)

        def _status_payload(r: dict) -> dict:
            p = str(r.get("passenger_id") or "")
            d = str(r.get("driver_id") or "")
            pe = str(r.get("pending_driver_id") or "")
            return {
                "ride_id": ride_id,
                "status": r.get("status"),
                "passenger_id": p or None,
                "effective_driver_id": d or None,
                "pending_driver_id": pe or None,
                "request_expires_at": r.get("request_expires_at"),
                "destination_label": r.get("destination_label"),
                "pickup_lat": r.get("pickup_lat"),
                "pickup_lng": r.get("pickup_lng"),
                "destination_lat": r.get("destination_lat"),
                "destination_lng": r.get("destination_lng"),
            }

        pid = str(row.get("passenger_id") or "")
        did = str(row.get("driver_id") or "")
        pend = str(row.get("pending_driver_id") or "")
        status = str(row.get("status") or "")

        if uid in (pid, did, pend):
            logger.info(
                "rides_status trace=%s ride_id=%s uid=%s status=%s access=direct",
                trace_id,
                ride_id,
                uid,
                status,
            )
            return _status_payload(row)

        # Pending driver who just lost pending in this same request (expiry) should still see searching, not 403.
        if (
            uid == pend_pre
            and st_pre == "requested"
            and status == "searching"
            and not pend
        ):
            logger.info(
                "rides_status trace=%s ride_id=%s uid=%s status=%s access=expiry_race",
                trace_id,
                ride_id,
                uid,
                status,
            )
            return _status_payload(row)

        # Same visibility rules as before, but actionable copy for the common pilot failures.
        if uid != pid:
            if status == "searching" and not pend:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "This ride has no pending driver (expired, declined, or reset). "
                        "Ask the passenger to tap Request Ride again; accept within ~1 minute."
                    ),
                )
            if pend and uid != pend and uid != did:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Sign in as the driver account the passenger selected. "
                        "This signed-in account does not match the requested driver."
                    ),
                )
            if did and uid != did and not pend:
                raise HTTPException(
                    status_code=403,
                    detail="Sign in as the assigned driver for this ride.",
                )
            raise HTTPException(status_code=403, detail="Not authorized for this ride.")

        return _status_payload(row)


@app.post("/rides/share-token")
def rides_create_share_token(
    payload: dict,
    authorization: str | None = Header(default=None),
):
    _require_config()
    uid = _verify_user_bearer_token(authorization)
    ride_id = str(payload.get("rideId") or "").strip()
    if not ride_id:
        raise HTTPException(status_code=400, detail="rideId is required")

    with httpx.Client() as client:
        row = _rides_get_by_id(client, ride_id)
        if not row:
            raise HTTPException(status_code=404, detail="Ride not found")

        passenger_id = str(row.get("passenger_id") or "")
        driver_id = str(row.get("driver_id") or "")
        pending_driver_id = str(row.get("pending_driver_id") or "")

        if uid not in (passenger_id, driver_id, pending_driver_id):
            raise HTTPException(status_code=403, detail="Not authorized to share this ride")

        if str(row.get("status")) not in ("accepted", "in_progress", "completed"):
            raise HTTPException(status_code=400, detail="Ride must be accepted or in progress to share")

    share_token = _make_share_token(ride_id)
    return {"rideId": ride_id, "shareToken": share_token}


@app.get("/rides/share/{share_token}")
def rides_share_status(share_token: str):
    _require_config()
    ride_id = _parse_share_token(share_token)
    if not ride_id:
        raise HTTPException(status_code=404, detail="Invalid share token")

    with httpx.Client() as client:
        row = _rides_get_by_id(client, ride_id)
        if not row:
            raise HTTPException(status_code=404, detail="Ride not found")

        status = str(row.get("status") or "")
        if status not in ("requested", "accepted", "in_progress", "completed"):
            raise HTTPException(status_code=404, detail="Ride not available for sharing")

        return {
            "rideId": ride_id,
            "status": status,
            "destinationLabel": row.get("destination_label"),
            "pickupLat": row.get("pickup_lat"),
            "pickupLng": row.get("pickup_lng"),
            "destinationLat": row.get("destination_lat"),
            "destinationLng": row.get("destination_lng"),
            "driverId": row.get("driver_id") if status != "completed" else None,
        }


class RegisterJourneyRequest(BaseModel):
    """Passenger starts a multi-leg trip; app sends a client-generated UUID."""

    journeyId: str = Field(min_length=3)

    @field_validator("journeyId")
    @classmethod
    def journey_uuid(cls, v: str) -> str:
        UUID(v)
        return v


class CompleteJourneyRequest(BaseModel):
    """Passenger marks the whole journey finished (no more legs)."""

    journeyId: str = Field(min_length=3)

    @field_validator("journeyId")
    @classmethod
    def journey_uuid(cls, v: str) -> str:
        UUID(v)
        return v


class AbortLegRequest(BaseModel):
    """
    Passenger signals that the handoff for the next leg failed — Driver B
    declined, expired, or is no longer available — and the passenger is
    stranded at an intermediate point.  The journey moves to `leg_aborted`
    so the app can surface a clear recovery UI (retry search, call for help).
    """

    journeyId: str = Field(min_length=3)
    legIndex: int = Field(ge=1, le=500, description="The leg that failed to start.")
    reason: str = Field(
        default="driver_unavailable",
        description="One of: driver_unavailable | driver_declined | passenger_cancelled | timeout",
    )

    @field_validator("journeyId")
    @classmethod
    def journey_uuid(cls, v: str) -> str:
        UUID(v)
        return v


class RouteCommitmentBBox(BaseModel):
    minLat: float = Field(ge=-90, le=90)
    maxLat: float = Field(ge=-90, le=90)
    minLng: float = Field(ge=-180, le=180)
    maxLng: float = Field(ge=-180, le=180)


class RegisterRouteCommitmentRequest(BaseModel):
    rideId: str = Field(min_length=3)
    declaredIntent: Literal["zero_detour", "detour"]
    corridorBBox: RouteCommitmentBBox
    signedPayload: str = Field(min_length=10)
    commitmentSig: str = Field(min_length=16)
    devicePublicKey: str = Field(min_length=10)
    signatureAlgorithm: Literal["ecdsa-p256-sha256"] = "ecdsa-p256-sha256"

    @field_validator("rideId")
    @classmethod
    def ride_id_uuid(cls, v: str) -> str:
        UUID(v)
        return v


class AttestRouteCommitmentRequest(BaseModel):
    rideId: str = Field(min_length=3)
    attestationPayload: str = Field(min_length=10)
    attestationSig: str = Field(min_length=16)

    @field_validator("rideId")
    @classmethod
    def ride_id_uuid(cls, v: str) -> str:
        UUID(v)
        return v


@app.post("/journeys/register")
def register_journey(
    payload: RegisterJourneyRequest,
    authorization: str | None = Header(default=None),
):
    """
    Idempotent: same journeyId + same passenger returns idempotent=true.
    Another passenger reusing journeyId gets 403.
    """
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        existing = _get_journey_row(client, payload.journeyId)
        if existing:
            if str(existing.get("passenger_id")) != passenger_id:
                raise HTTPException(
                    status_code=403,
                    detail="This journey id is already registered to another passenger.",
                )
            return {"journey_id": payload.journeyId, "idempotent": True}

        r = client.post(
            _rest_url("/journeys"),
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={
                "id": payload.journeyId,
                "passenger_id": passenger_id,
                "status": "active",
            },
            timeout=30.0,
        )
        if r.status_code not in (200, 201, 204):
            raise HTTPException(status_code=502, detail=f"Insert journey failed: {r.text}")

    return {"journey_id": payload.journeyId, "idempotent": False}


@app.post("/journeys/complete")
def complete_journey_endpoint(
    payload: CompleteJourneyRequest,
    authorization: str | None = Header(default=None),
):
    """Sets journey status to completed (passenger JWT must own the row)."""
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)
    now = datetime.now(timezone.utc).isoformat()

    with httpx.Client() as client:
        row = _get_journey_row(client, payload.journeyId)
        if not row:
            raise HTTPException(status_code=404, detail="Journey not found")
        if str(row.get("passenger_id")) != passenger_id:
            raise HTTPException(status_code=403, detail="Not your journey")
        r = client.patch(
            _rest_url("/journeys"),
            params={"id": f"eq.{payload.journeyId}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={"status": "completed", "updated_at": now},
            timeout=30.0,
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"Update journey failed: {r.text}")

    return {"journey_id": payload.journeyId, "status": "completed"}


@app.post("/journeys/abort-leg")
def abort_journey_leg(
    payload: AbortLegRequest,
    authorization: str | None = Header(default=None),
):
    """
    Called by the passenger app when Driver B fails to materialise for the next
    leg — declined, expired, or the passenger waited too long at the handoff
    point and gave up.

    Transitions the journey to `leg_aborted` with metadata so the app can show:
      - "Your next driver didn't arrive — here's what you can do."
      - Retry search for a new driver on the same leg
      - Call for help (SOS)
      - End the journey and go home

    A `leg_aborted` journey can be resumed (status set back to `active`) if the
    passenger retries and finds a new driver — handled by the existing
    /journeys/register idempotency flow.
    """
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)
    now = datetime.now(timezone.utc).isoformat()

    valid_reasons = {"driver_unavailable", "driver_declined", "passenger_cancelled", "timeout"}
    reason = payload.reason if payload.reason in valid_reasons else "driver_unavailable"

    with httpx.Client() as client:
        row = _get_journey_row(client, payload.journeyId)
        if not row:
            raise HTTPException(status_code=404, detail="Journey not found.")
        if str(row.get("passenger_id")) != passenger_id:
            raise HTTPException(status_code=403, detail="Not your journey.")

        current_status = str(row.get("status") or "")
        if current_status == "completed":
            raise HTTPException(
                status_code=409,
                detail="Journey is already completed — cannot abort a leg.",
            )
        if current_status == "leg_aborted":
            # Idempotent — already aborted, return current state.
            return {
                "journey_id": payload.journeyId,
                "status": "leg_aborted",
                "leg_index": payload.legIndex,
                "reason": reason,
                "idempotent": True,
            }

        r = client.patch(
            _rest_url("/journeys"),
            params={"id": f"eq.{payload.journeyId}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={
                "status": "leg_aborted",
                "updated_at": now,
                "aborted_leg_index": payload.legIndex,
                "abort_reason": reason,
            },
            timeout=30.0,
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"abort-leg update failed: {r.text}")

    logger.warning(
        "MULTI_LEG_ABORT journey_id=%s leg=%d reason=%s passenger=%s",
        payload.journeyId, payload.legIndex, reason, passenger_id,
    )

    return {
        "journey_id": payload.journeyId,
        "status": "leg_aborted",
        "leg_index": payload.legIndex,
        "reason": reason,
        "message": (
            "Your next driver couldn't be reached. You can retry the search, "
            "ask someone nearby for help, or trigger SOS if you feel unsafe."
        ),
    }


@app.post("/journeys/resume-leg")
def resume_journey_leg(
    payload: CompleteJourneyRequest,  # reuse — just needs journeyId
    authorization: str | None = Header(default=None),
):
    """
    Passenger retries finding a driver after a leg_aborted state.
    Sets the journey back to `active` so the next /rides/complete leg can proceed.
    """
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)
    now = datetime.now(timezone.utc).isoformat()

    with httpx.Client() as client:
        row = _get_journey_row(client, payload.journeyId)
        if not row:
            raise HTTPException(status_code=404, detail="Journey not found.")
        if str(row.get("passenger_id")) != passenger_id:
            raise HTTPException(status_code=403, detail="Not your journey.")
        if str(row.get("status")) == "active":
            return {"journey_id": payload.journeyId, "status": "active", "idempotent": True}
        if str(row.get("status")) != "leg_aborted":
            raise HTTPException(
                status_code=409,
                detail=f"Journey cannot be resumed from status '{row.get('status')}'.",
            )
        r = client.patch(
            _rest_url("/journeys"),
            params={"id": f"eq.{payload.journeyId}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={"status": "active", "updated_at": now},
            timeout=30.0,
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"resume-leg update failed: {r.text}")

    return {"journey_id": payload.journeyId, "status": "active"}


@app.post("/route-commitments/register")
def register_route_commitment(
    payload: RegisterRouteCommitmentRequest,
    authorization: str | None = Header(default=None),
):
    """
    Phase 1 — architecture stub.
    The schema and signing fields are recorded for future ZK-proof enforcement.
    Signature verification is logged but NOT enforced yet; this endpoint never
    blocks a ride. Full verification will be enabled once liquidity targets are
    met and the schema migration (zk_route_commitments_phase2.sql) is applied.
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)

    # Attempt signature verification — log result but never reject.
    sig_valid: bool | None = None
    try:
        _verify_ecdsa_signature(payload.devicePublicKey, payload.signedPayload, payload.commitmentSig)
        sig_valid = True
    except InvalidSignature:
        sig_valid = False
        logger.info(
            "Route commitment signature mismatch (not enforced yet): ride_id=%s driver=%s",
            payload.rideId, driver_id,
        )
    except Exception as e:
        sig_valid = None
        logger.info(
            "Route commitment sig check skipped (key/payload issue, not enforced): ride_id=%s err=%s",
            payload.rideId, e,
        )

    try:
        signed_obj = json.loads(payload.signedPayload)
    except Exception:
        signed_obj = {}

    corridor_hash = _route_commitment_hash(payload.signedPayload)

    # Persist to DB so the architecture is in place for when enforcement turns on.
    # If the table doesn't exist yet, swallow the error gracefully.
    committed_at: str | None = None
    verification_status = "pending_enforcement"
    with httpx.Client() as client:
        try:
            r = client.post(
                _rest_url("/route_commitments"),
                headers={**_service_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
                json={
                    "ride_id": payload.rideId,
                    "driver_id": driver_id,
                    "corridor_hash": corridor_hash,
                    "commitment_sig": payload.commitmentSig,
                    "corridor_bbox": payload.corridorBBox.model_dump(),
                    "declared_intent": payload.declaredIntent,
                    "signed_payload": payload.signedPayload,
                    "device_public_key": payload.devicePublicKey,
                    "signature_algorithm": payload.signatureAlgorithm,
                    "nonce": signed_obj.get("nonce"),
                    "verification_status": verification_status,
                },
                timeout=15.0,
            )
            if r.status_code in (200, 201):
                rows = _rest_json_list(r, "route commitment register")
                row = rows[0] if rows else {}
                committed_at = row.get("committed_at")
                verification_status = row.get("verification_status", verification_status)
            else:
                logger.info(
                    "Route commitment DB write skipped (table may not exist yet): %s",
                    r.text[:200],
                )
        except Exception as e:
            logger.info("Route commitment persist failed (non-blocking): %s", e)

    return {
        "ride_id": payload.rideId,
        "driver_id": driver_id,
        "verification_status": verification_status,
        "sig_valid": sig_valid,
        "committed_at": committed_at,
        "note": "Signature enforcement not yet active. Architecture in place for Phase 2.",
    }


@app.post("/route-commitments/attest")
def attest_route_commitment(
    payload: AttestRouteCommitmentRequest,
    authorization: str | None = Header(default=None),
):
    """
    Phase 1 — architecture stub.
    Attestation data is recorded. Signature verification is logged but NOT
    enforced. The multiplier result defaults to True (no penalty) until Phase 2
    enforcement is enabled.
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)

    try:
        attestation = json.loads(payload.attestationPayload)
    except Exception:
        attestation = {}

    actual = attestation.get("actual") or {}
    dropoff = actual.get("dropoff") or {}
    now = datetime.now(timezone.utc).isoformat()

    # Attempt to fetch existing commitment for corridor check logging.
    # If table doesn't exist yet, swallow gracefully.
    within_bbox: bool = True  # default: no penalty until enforcement is on
    row_id: str | None = None
    with httpx.Client() as client:
        try:
            r = client.get(
                _rest_url("/route_commitments"),
                headers=_service_headers(),
                params={
                    "ride_id": f"eq.{payload.rideId}",
                    "driver_id": f"eq.{driver_id}",
                    "select": "id,declared_intent,corridor_bbox,device_public_key,signature_algorithm",
                    "limit": 1,
                },
                timeout=15.0,
            )
            if r.status_code == 200:
                rows = r.json() if isinstance(r.json(), list) else []
                if rows:
                    row = rows[0]
                    row_id = row.get("id")
                    bbox = row.get("corridor_bbox")
                    within_bbox = _point_inside_bbox(
                        dropoff.get("latitude"), dropoff.get("longitude"), bbox
                    )
                    # Log sig result but never reject.
                    try:
                        _verify_ecdsa_signature(
                            str(row.get("device_public_key") or ""),
                            payload.attestationPayload,
                            payload.attestationSig,
                        )
                    except Exception as sig_e:
                        logger.info(
                            "Attestation sig mismatch (not enforced): ride_id=%s err=%s",
                            payload.rideId, sig_e,
                        )
        except Exception as e:
            logger.info("Attestation DB fetch failed (non-blocking): %s", e)

        # Record attestation data if we have a row to update.
        if row_id:
            try:
                client.patch(
                    _rest_url("/route_commitments"),
                    headers={**_service_headers(), "Prefer": "return=minimal"},
                    params={"id": f"eq.{row_id}"},
                    json={
                        "attestation_payload": payload.attestationPayload,
                        "attestation_sig": payload.attestationSig,
                        "attested_at": now,
                        # Store observed result but keep status as pending_enforcement.
                        "verification_status": "pending_enforcement",
                        "deviation_flag": not within_bbox,
                        "multiplier_awarded": False,  # not active yet
                        "verified_at": now,
                    },
                    timeout=15.0,
                )
            except Exception as e:
                logger.info("Attestation DB write failed (non-blocking): %s", e)

    return {
        "ride_id": payload.rideId,
        "driver_id": driver_id,
        "verification_status": "pending_enforcement",
        "deviation_flag": not within_bbox,
        "note": "Attestation enforcement not yet active. Data recorded for Phase 2.",
    }


class CompleteRideRequest(BaseModel):
    """
    What the app sends to mark a ride session as completed.

    For security we store rides by:
      - `id` = rideId (generated by the app)
      - `driver_id` = derived from JWT (token owner)

    The next step (/points/award) will refuse to award points unless the ride
    is present and `status = completed`.
    """

    rideId: str = Field(min_length=3)
    wasZeroDetour: bool = True
    # Blueprint: 1 point per mile on this leg; must be a positive, realistic segment length.
    distanceMiles: float = Field(ge=0.1, le=500)
    passengerId: str | None = None
    journeyId: str | None = None
    legIndex: int = Field(default=1, ge=1, le=500)
    pickupLat: float | None = Field(default=None, ge=-90, le=90)
    pickupLng: float | None = Field(default=None, ge=-180, le=180)
    dropoffLat: float | None = Field(default=None, ge=-90, le=90)
    dropoffLng: float | None = Field(default=None, ge=-180, le=180)
    destinationLat: float | None = Field(default=None, ge=-90, le=90)
    destinationLng: float | None = Field(default=None, ge=-180, le=180)
    destinationLabel: str | None = Field(default=None, max_length=200)
    startedAt: str | None = Field(
        default=None,
        description="ISO timestamp for when trip began (passenger in car).",
    )

    @field_validator("passengerId", mode="before")
    @classmethod
    def passenger_id_empty_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("passengerId")
    @classmethod
    def passenger_id_must_be_uuid(cls, v: str | None) -> str | None:
        if v is None:
            return None
        UUID(v)
        return v

    @field_validator("journeyId", mode="before")
    @classmethod
    def journey_id_empty_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("journeyId")
    @classmethod
    def journey_id_must_be_uuid(cls, v: str | None) -> str | None:
        if v is None:
            return None
        UUID(v)
        return v

    @field_validator("destinationLabel", mode="before")
    @classmethod
    def destination_label_empty_to_none(cls, v: object) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("startedAt", mode="before")
    @classmethod
    def started_at_empty_to_none(cls, v: object) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("startedAt")
    @classmethod
    def started_at_must_be_iso_timestamp(cls, v: str | None) -> str | None:
        if v is None:
            return None
        try:
            # Accept both "...Z" and explicit offsets.
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception as e:
            raise ValueError("startedAt must be ISO timestamp") from e
        return v


class RatingBonusRequest(BaseModel):
    rideId: str = Field(min_length=3)
    rating: int = Field(ge=1, le=5)


class RatePassengerRequest(BaseModel):
    """Driver rates passenger after a completed ride (face + optional comment)."""

    rideId: str = Field(min_length=3)
    face: Literal["smile", "neutral", "sad"]
    comment: str | None = Field(default=None, max_length=500)

    @field_validator("comment", mode="before")
    @classmethod
    def normalize_comment(cls, v: object) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        if isinstance(v, str):
            return v.strip()
        return v


class RatePassengerResponse(BaseModel):
    score_delta: int
    passenger_id: str
    idempotent: bool = False


class PassengerReputationResponse(BaseModel):
    passenger_id: str
    total_score: int
    rating_count: int


def _face_to_delta(face: Literal["smile", "neutral", "sad"]) -> int:
    return {"smile": 1, "neutral": 0, "sad": -1}[face]


def _emit_trip_analytics(ride_id: str, passenger_id: str, driver_id: str, payload: CompleteRideRequest):
    """
    Feature 3: Trip Event Logging Pipeline (Background Task)
    Generates a privacy-safe 6-field analytics record.
    """
    try:
        # 1. Opaque Session ID (One-way hash)
        session_raw = f"{ride_id}:{passenger_id}:{driver_id}"
        session_id = sha256(session_raw.encode()).hexdigest()

        # 2. Differential noise to coordinates (~0.005 deg is roughly 500m of noise)
        p_lat = (payload.pickupLat + random.uniform(-0.005, 0.005)) if payload.pickupLat else 0.0
        p_lng = (payload.pickupLng + random.uniform(-0.005, 0.005)) if payload.pickupLng else 0.0
        
        actual_d_lat = payload.dropoffLat if payload.dropoffLat is not None else payload.destinationLat
        actual_d_lng = payload.dropoffLng if payload.dropoffLng is not None else payload.destinationLng
        d_lat = (actual_d_lat + random.uniform(-0.005, 0.005)) if actual_d_lat else 0.0
        d_lng = (actual_d_lng + random.uniform(-0.005, 0.005)) if actual_d_lng else 0.0

        route_vector = {
            "pickup": {"lat": round(p_lat, 4), "lng": round(p_lng, 4)},
            "dropoff": {"lat": round(d_lat, 4), "lng": round(d_lng, 4)}
        }

        # 3. Deviation delta (stubbed based on declared intent for now)
        deviation_delta = 0.0 if payload.wasZeroDetour else 1.5

        # 4. Time flag
        time_flag = "normal"
        if payload.startedAt:
            try:
                start_dt = datetime.fromisoformat(payload.startedAt.replace("Z", "+00:00"))
                duration_mins = (datetime.now(timezone.utc) - start_dt).total_seconds() / 60.0
                expected_mins = (payload.distanceMiles / 20.0) * 60.0  # roughly 20mph average
                if duration_mins > (expected_mins * 3):
                    time_flag = "abnormal_duration"
            except Exception:
                pass

        # 5. Trust Anchor Score (Feature 2 stub - to be implemented in phase 2)
        trust_anchor_score = 100.0

        # 6. SOS Ping Count (stub - will query sos_requests in future)
        sos_ping_count = 0

        with httpx.Client() as client:
            client.post(
                _rest_url("/trip_analytics"),
                headers={**_service_headers(), "Prefer": "return=minimal"},
                json={
                    "session_id": session_id,
                    "route_vector": route_vector,
                    "deviation_delta": deviation_delta,
                    "time_flag": time_flag,
                    "sos_ping_count": sos_ping_count,
                    "trust_anchor_score": trust_anchor_score
                },
                timeout=10.0
            )
    except Exception as e:
        logger.error(f"Failed to emit trip analytics for {ride_id}: {e}")


@app.post("/rides/complete")
@(_limiter.limit("10/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def complete_ride(
    request: Request,
    payload: CompleteRideRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    _require_config()
    caller_id = _verify_user_bearer_token(authorization)
    ride_id = payload.rideId
    trace_id = _request_trace_id(request)
    logger.info(
        "rides_complete trace=%s ride_id=%s caller_id=%s journey_id=%s",
        trace_id,
        ride_id,
        caller_id,
        payload.journeyId,
    )

    now = datetime.now(timezone.utc).isoformat()
    completing_driver_id: str | None = None
    passenger_id_for_analytics: str = payload.passengerId or ""

    with httpx.Client() as client:
        existing = _rides_get_by_id(client, ride_id)

        # FEATURE 1: Ride Integrity Engine (Anti-Replay / Trip Laundering Guard)
        r_int = client.get(
            _rest_url("/ride_integrity"),
            params={"ride_id": f"eq.{ride_id}", "select": "completed_auth_token_sub"},
            headers=_service_headers(),
            timeout=10.0
        )
        if r_int.status_code == 200:
            int_rows = _rest_json_list(r_int, "ride_integrity check")
            if int_rows:
                existing_sub = int_rows[0].get("completed_auth_token_sub")
                if existing_sub and existing_sub != caller_id:
                    # Allow idempotent completion if the caller is the other legitimate party
                    is_authorized_other_party = False
                    if existing:
                        pid = str(existing.get("passenger_id") or "")
                        did = str(existing.get("driver_id") or "")
                        if caller_id in (pid, did) and caller_id != "":
                            is_authorized_other_party = True

                    if not is_authorized_other_party:
                        logger.warning(f"SECURITY FLAG: Integrity violation on {ride_id}. Token mismatch (submitted by {caller_id}, originally by {existing_sub}).")
                        raise HTTPException(
                            status_code=409,
                            detail="Integrity violation: This ride ID was already completed from a different device/token."
                        )

        if payload.journeyId:
            if not payload.passengerId:
                raise HTTPException(
                    status_code=400,
                    detail="passengerId is required when journeyId is set (multi-leg).",
                )
            _ensure_journey_active_for_passenger(client, payload.journeyId, payload.passengerId)

        # Who receives points + who owns driver_id on the row: assigned driver when present.
        if existing:
            st = str(existing.get("status") or "")
            pid = str(existing.get("passenger_id") or "")
            did = str(existing.get("driver_id") or "")
            if st in ("accepted", "in_progress"):
                if did and pid == caller_id:
                    # Passenger device ends trip; credit the driver recorded on the accepted ride.
                    completing_driver_id = did
                elif did and did != caller_id:
                    raise HTTPException(
                        status_code=403,
                        detail="Only the assigned driver or the passenger on this ride can complete it.",
                    )
            elif st == "completed":
                # idempotent re-submit: keep existing driver assignment if present.
                completing_driver_id = did or None
            elif st in ("searching", "requested"):
                if pid != caller_id:
                    raise HTTPException(
                        status_code=403,
                        detail="Only the passenger who started this ride may mark it completed in this state.",
                    )
                # Allow legacy/demo flow where the ride row exists but no driver accepted yet.
                completing_driver_id = did or str(existing.get("pending_driver_id") or "") or None
            elif st in ("declined", "expired", "cancelled"):
                raise HTTPException(
                    status_code=409,
                    detail=_ride_transition_conflict_detail(st, "complete"),
                )
            if not passenger_id_for_analytics and pid:
                passenger_id_for_analytics = pid

        body: dict = {
            "status": "completed",
            "completed_at": now,
        }
        if completing_driver_id:
            body["driver_id"] = completing_driver_id
        else:
            # Keep driver_id unchanged when no assigned driver is known (legacy/demo mode).
            body["driver_id"] = existing.get("driver_id") if existing else None
        if payload.passengerId:
            body["passenger_id"] = payload.passengerId
        if payload.journeyId:
            body["journey_id"] = payload.journeyId
            body["leg_index"] = payload.legIndex
        # ── M8 Minimum Trip Duration Guard ───────────────────────────────────
        # Hard-block points if startedAt is present and the trip lasted < minimum duration.
        # Prevents two users sitting still and farming points by fake-completing rides.
        # Configurable via KINDRIDE_MIN_TRIP_SECONDS (default 120). Set to 30 for testing.
        _MIN_TRIP_DURATION_SECONDS = int((os.getenv("KINDRIDE_MIN_TRIP_SECONDS") or "120").split()[0])
        if payload.startedAt:
            try:
                start_dt = datetime.fromisoformat(payload.startedAt.replace("Z", "+00:00"))
                trip_seconds = (datetime.now(timezone.utc) - start_dt).total_seconds()
                if trip_seconds < _MIN_TRIP_DURATION_SECONDS:
                    logger.warning(
                        "FRAUD FLAG M8: trip too short. duration=%.0fs ride_id=%s caller=%s",
                        trip_seconds, ride_id, caller_id,
                    )
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Trip duration too short ({int(trip_seconds)}s). "
                            "A minimum of 2 minutes is required to complete a ride."
                        ),
                    )
            except HTTPException:
                raise
            except Exception:
                pass  # malformed startedAt — let field_validator catch it upstream
        # ── End M8 ───────────────────────────────────────────────────────────

        # ── M7 Fraud Distance Check ───────────────────────────────────────────
        # Verify claimed distanceMiles against real GPS haversine distance.
        # Drivers cannot fake long trips to inflate Kind Points.
        # Tolerance: claimed miles must not exceed 2.5x the straight-line GPS
        # distance (accounts for real road detours vs straight line).
        _FRAUD_DISTANCE_MULTIPLIER = 2.5
        _FRAUD_MIN_GPS_MILES = 0.1  # ignore check for very short trips (<0.1 mi)
        if (
            payload.distanceMiles is not None
            and payload.pickupLat is not None
            and payload.pickupLng is not None
            and payload.dropoffLat is not None
            and payload.dropoffLng is not None
        ):
            gps_miles = _haversine_miles(
                payload.pickupLat, payload.pickupLng,
                payload.dropoffLat, payload.dropoffLng,
            )
            if gps_miles >= _FRAUD_MIN_GPS_MILES:
                max_allowed = gps_miles * _FRAUD_DISTANCE_MULTIPLIER
                if payload.distanceMiles > max_allowed:
                    logger.warning(
                        "FRAUD FLAG M7: claimed=%.2f miles, gps_haversine=%.2f miles, "
                        "max_allowed=%.2f miles, ride_id=%s, caller=%s",
                        payload.distanceMiles, gps_miles, max_allowed, ride_id, caller_id,
                    )
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Distance mismatch: claimed {payload.distanceMiles:.1f} mi "
                            f"exceeds {_FRAUD_DISTANCE_MULTIPLIER}x the GPS distance "
                            f"({gps_miles:.1f} mi straight-line). "
                            "Please submit the accurate trip distance."
                        ),
                    )
        # ── End M7 ───────────────────────────────────────────────────────────

        body["distance_miles"] = payload.distanceMiles
        body["was_zero_detour"] = payload.wasZeroDetour
        if payload.pickupLat is not None and payload.pickupLng is not None:
            body["pickup_lat"] = payload.pickupLat
            body["pickup_lng"] = payload.pickupLng
        if payload.dropoffLat is not None and payload.dropoffLng is not None:
            body["dropoff_lat"] = payload.dropoffLat
            body["dropoff_lng"] = payload.dropoffLng
        if payload.destinationLat is not None and payload.destinationLng is not None:
            body["destination_lat"] = payload.destinationLat
            body["destination_lng"] = payload.destinationLng
        if payload.destinationLabel:
            body["destination_label"] = payload.destinationLabel
        if payload.startedAt:
            body["started_at"] = payload.startedAt.replace("Z", "+00:00")

        # M1 Security Fix: Atomic state transition prevents parallel-request double completions
        if existing:
            r = client.patch(
                _rest_url("/rides"),
                params={"id": f"eq.{ride_id}", "status": f"eq.{existing.get('status')}"},
                headers={**_service_headers(), "Prefer": "return=representation"},
                json=body,
                timeout=30.0,
            )
            if r.status_code in (200, 201, 204) and not r.json():
                raise HTTPException(status_code=409, detail="Race condition: Ride status changed before completion could finalize.")
        else:
            # Legacy demo fallback
            body["id"] = ride_id
            r = client.post(
                _rest_url("/rides"),
                headers={**_service_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
                json=body,
                timeout=30.0,
            )

        if r.status_code not in (200, 201, 204):
            raise HTTPException(status_code=502, detail=f"Ride completion write failed: {r.text}")

    # Feature 1: Store the integrity fingerprint to lock this ride ID
    with httpx.Client() as client:
        intent_str = "zero_detour" if payload.wasZeroDetour else "detour"
        fp_lat = payload.dropoffLat if payload.dropoffLat is not None else payload.destinationLat
        fp_lng = payload.dropoffLng if payload.dropoffLng is not None else payload.destinationLng
        fp_raw = f"{payload.pickupLat},{payload.pickupLng}|{fp_lat},{fp_lng}|{intent_str}"
        
        client.post(
            _rest_url("/ride_integrity"),
            headers={**_service_headers(), "Prefer": "resolution=ignore-duplicates"},
            json={
                "ride_id": ride_id,
                "fingerprint_hash": sha256(fp_raw.encode()).hexdigest(),
                "completed_auth_token_sub": caller_id,
                "pickup_lat": payload.pickupLat or 0.0,
                "pickup_lng": payload.pickupLng or 0.0,
                "destination_lat": payload.destinationLat or 0.0,
                "destination_lng": payload.destinationLng or 0.0,
                "is_valid": True
            },
            timeout=10.0
        )

    route_commitment_status: str | None = None
    route_commitment_multiplier_ok = payload.wasZeroDetour
    if completing_driver_id:
        with httpx.Client() as client:
            r_commit = client.get(
                _rest_url("/route_commitments"),
                headers=_service_headers(),
                params={
                    "ride_id": f"eq.{ride_id}",
                    "driver_id": f"eq.{completing_driver_id}",
                    "select": "verification_status,multiplier_awarded",
                    "limit": 1,
                },
                timeout=10.0,
            )
            if r_commit.status_code == 200:
                commit_rows = _rest_json_list(r_commit, "route commitment status")
                if commit_rows:
                    route_commitment_status = str(commit_rows[0].get("verification_status") or "pending")
                    if payload.wasZeroDetour and route_commitment_status == "failed":
                        route_commitment_multiplier_ok = False

    # Non-blocking approach: award base leg points now; rating bonus happens later.
    base_component = (10 + payload.distanceMiles) * (1.5 if route_commitment_multiplier_ok else 1.0)
    base_points = int(round(base_component))
    total_points_awarded = 0
    points_earned = 0
    was_idempotent = True
    with httpx.Client() as client:
        if completing_driver_id:
            points_earned, was_idempotent = _award_points_with_idempotency(
                client=client,
                driver_id=completing_driver_id,
                ride_id=ride_id,
                idempotency_key=f"{ride_id}:base",
                action="LEG_COMPLETED_BASE",
                points=base_points,
                metadata={
                "ride_id": ride_id,
                "distance_miles": payload.distanceMiles,
                "was_zero_detour": payload.wasZeroDetour,
                **(
                    {
                        "pickup_lat": payload.pickupLat,
                        "pickup_lng": payload.pickupLng,
                        "destination_lat": payload.destinationLat,
                        "destination_lng": payload.destinationLng,
                        "destination_label": payload.destinationLabel,
                    }
                    if payload.destinationLat is not None and payload.destinationLng is not None
                    else {}
                ),
                **(
                    {"journey_id": payload.journeyId, "leg_index": payload.legIndex}
                    if payload.journeyId
                    else {}
                ),
            },
        )
        if not was_idempotent:
            total_points_awarded += points_earned

        # P1.4 Points Ledger Parity: Evaluate First Ride & 7-Day Streak bonuses
        # Guard: completing_driver_id may be None in passenger-only or anonymous flows.
        if completing_driver_id:
            bonuses = _evaluate_daily_bonuses(client, completing_driver_id, ride_id, datetime.now(timezone.utc))
            for action_name, bonus_pts, tag in bonuses:
                b_earned, b_idem = _award_points_with_idempotency(
                    client=client,
                    driver_id=completing_driver_id,
                    ride_id=ride_id,
                    idempotency_key=f"{ride_id}:{tag}",
                    action=action_name,
                    points=bonus_pts,
                    metadata={"ride_id": ride_id, "bonus_type": tag}
                )
                if not b_idem:
                    total_points_awarded += b_earned

    # Referral bonus: award 50 pts to both parties on the referred user's first ride
    referral_subject = completing_driver_id or (payload.passengerId if payload.passengerId else None)
    if referral_subject:
        with httpx.Client() as client:
            _maybe_award_referral_bonus_on_first_ride(client, referral_subject, ride_id)

    # FEATURE 3: Dispatch Trip Analytics asynchronously
    if completing_driver_id or passenger_id_for_analytics:
        background_tasks.add_task(
            _emit_trip_analytics,
            ride_id=ride_id,
            passenger_id=passenger_id_for_analytics,
            driver_id=completing_driver_id or "",
            payload=payload
        )

    # P2.3: Anomaly detection — non-blocking, fires after analytics
    if completing_driver_id:
        background_tasks.add_task(
            _detect_ride_anomalies,
            ride_id=ride_id,
            driver_id=completing_driver_id,
            payload=payload,
        )

    # Notify driver of points earned (non-blocking)
    if completing_driver_id and total_points_awarded > 0:
        try:
            with httpx.Client() as client:
                pt_r = client.get(
                    _rest_url("/push_tokens"),
                    params={"user_id": f"eq.{completing_driver_id}", "select": "push_token", "limit": "1"},
                    headers=_service_headers(),
                    timeout=10.0,
                )
                pt_rows = _rest_json_list(pt_r, "driver push_token completion") if pt_r.status_code == 200 else []
                if pt_rows:
                    driver_token = pt_rows[0].get("push_token")
                    if driver_token:
                        _send_expo_push([{
                            "to": driver_token,
                            "title": f"+{total_points_awarded} points earned! 🌱",
                            "body": "Trip complete. See your impact score.",
                            "sound": "default",
                            "data": {
                                "url": "/(tabs)/points",
                                "type": "trip_completed",
                                "points": total_points_awarded,
                            },
                        }])
                        logger.info("trip_completed push sent to driver=%s pts=%s", completing_driver_id, total_points_awarded)
        except Exception as exc:
            logger.warning("trip_completed push failed (non-fatal): %s", str(exc))

    # Search for next driver should continue independently of rating (non-blocking).
    # Matching engine hookup happens in the next step; for now we return a signal.
    logger.info(
        "rides_complete_success trace=%s ride_id=%s driver_id=%s points=%s",
        trace_id,
        ride_id,
        completing_driver_id,
        total_points_awarded,
    )
    return {
        "ride_id": ride_id,
        "status": "completed",
        "base_points_earned": points_earned,
        "total_points_awarded": total_points_awarded,
        "base_points_idempotent": was_idempotent,
        "route_commitment_status": route_commitment_status,
        "route_commitment_multiplier_applied": route_commitment_multiplier_ok,
        "next_leg_search_status": "searching",
        "journey_id": payload.journeyId,
        "leg_index": payload.legIndex if payload.journeyId else None,
    }


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


@app.get("/health/rides-schema")
def health_rides_schema():
    """
    Checks whether the `rides` table exposes columns required by modern ride flow.
    Useful when `POST /rides/start-search` fails with 502 due to stale DB schema.
    """
    _require_config()
    required_columns = [
        "id",
        "driver_id",
        "passenger_id",
        "status",
        "pending_driver_id",
        "request_expires_at",
        "pickup_lat",
        "pickup_lng",
        "destination_lat",
        "destination_lng",
        "destination_label",
        "journey_id",
        "leg_index",
    ]
    expected_status_values = [
        "searching",
        "requested",
        "accepted",
        "in_progress",
        "completed",
        "declined",
        "expired",
        "cancelled",
    ]

    try:
        with httpx.Client() as client:
            # If any selected column does not exist, PostgREST returns 400 with details.
            r = client.get(
                _rest_url("/rides"),
                params={"select": ",".join(required_columns), "limit": "1"},
                headers=_service_headers(),
                timeout=20.0,
            )

            if r.status_code == 200:
                return {
                    "ok": True,
                    "checked_columns": required_columns,
                    "expected_status_values": expected_status_values,
                    "status_constraint_note": (
                        "Column check passed. If /rides/start-search still fails, run "
                        "supabase/rides_lifecycle.sql to update status constraints."
                    ),
                    "recommended_migrations": [
                        "supabase/rides_schema.sql",
                        "supabase/rides_geo.sql",
                        "supabase/rides_lifecycle.sql",
                        "supabase/journeys_multileg.sql",
                        "supabase/rides_leg_distance.sql",
                        "supabase/rides_trip_time.sql",
                    ],
                }

            return {
                "ok": False,
                "postgrest_http_status": r.status_code,
                "error": "rides schema check failed",
                "body_preview": r.text[:500],
                "required_columns": required_columns,
                "expected_status_values": expected_status_values,
                "recommended_migration": "Run supabase/rides_lifecycle.sql (and related rides migrations).",
            }
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


@app.post("/passengers/rate", response_model=RatePassengerResponse)
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def rate_passenger(
    request: Request,
    payload: RatePassengerRequest,
    authorization: str | None = Header(default=None),
):
    """
    Record one driver's face-rating for the passenger on this ride.
    Idempotent per (driver_id, ride_id). Cumulative reputation is updated by DB trigger.
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)
    delta = _face_to_delta(payload.face)

    with httpx.Client() as client:
        row = _fetch_completed_ride_for_driver(client, driver_id, payload.rideId)
        passenger_id = row.get("passenger_id")
        if not passenger_id:
            raise HTTPException(
                status_code=400,
                detail="Ride has no passenger_id; link passenger when completing the ride.",
            )

        dup = client.get(
            _rest_url("/passenger_ratings"),
            params={
                "driver_id": f"eq.{driver_id}",
                "ride_id": f"eq.{payload.rideId}",
                "select": "score_delta,passenger_id",
                "limit": "1",
            },
            headers=_service_headers(),
            timeout=30.0,
        )
        if dup.status_code != 200:
            raise HTTPException(status_code=502, detail=f"passenger_ratings read failed: {dup.text}")
        dup_rows = _rest_json_list(dup, "passenger_ratings select")
        if dup_rows:
            return RatePassengerResponse(
                score_delta=int(dup_rows[0]["score_delta"]),
                passenger_id=str(dup_rows[0]["passenger_id"]),
                idempotent=True,
            )

        insert_body = {
            "ride_id": payload.rideId,
            "driver_id": driver_id,
            "passenger_id": passenger_id,
            "face": payload.face,
            "score_delta": delta,
            "comment": payload.comment,
        }
        ins = client.post(
            _rest_url("/passenger_ratings"),
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json=insert_body,
            timeout=30.0,
        )
        if ins.status_code in (200, 201):
            return RatePassengerResponse(
                score_delta=delta,
                passenger_id=str(passenger_id),
                idempotent=False,
            )
        if ins.status_code == 409 or "duplicate key" in ins.text.lower() or "unique" in ins.text.lower():
            dup2 = client.get(
                _rest_url("/passenger_ratings"),
                params={
                    "driver_id": f"eq.{driver_id}",
                    "ride_id": f"eq.{payload.rideId}",
                    "select": "score_delta,passenger_id",
                    "limit": "1",
                },
                headers=_service_headers(),
                timeout=30.0,
            )
            if dup2.status_code != 200:
                raise HTTPException(status_code=502, detail=f"passenger_ratings read failed: {dup2.text}")
            dr = _rest_json_list(dup2, "passenger_ratings select")
            if not dr:
                raise HTTPException(status_code=502, detail="Duplicate insert but no rating row found")
            return RatePassengerResponse(
                score_delta=int(dr[0]["score_delta"]),
                passenger_id=str(dr[0]["passenger_id"]),
                idempotent=True,
            )
        raise HTTPException(status_code=502, detail=f"Insert passenger_ratings failed: {ins.text}")


@app.get("/passengers/{passenger_id}/reputation", response_model=PassengerReputationResponse)
def get_passenger_reputation(
    passenger_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Drivers can fetch aggregate passenger reputation.
    Tightened: Caller must be the passenger themselves, OR a driver actively matched/in-trip with them.
    """
    _require_config()
    caller_id = _verify_user_bearer_token(authorization)
    try:
        UUID(passenger_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid passenger_id") from e

    # TECHNICAL DEBT FIX: Tighten reputation privacy to matched context only
    if caller_id != passenger_id:
        with httpx.Client() as client:
            r = client.get(
                _rest_url("/rides"),
                params={
                    "passenger_id": f"eq.{passenger_id}",
                    "or": f"(driver_id.eq.{caller_id},pending_driver_id.eq.{caller_id})",
                    "status": "in.(requested,accepted,in_progress,completed)",
                    "select": "id",
                    "limit": "1"
                },
                headers=_service_headers(),
                timeout=15.0,
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to verify ride context for reputation access")
            rows = _rest_json_list(r, "reputation privacy check")
            if not rows:
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized. You must be actively matched or in a trip with this passenger to view their reputation."
                )

    with httpx.Client() as client:
        r = client.get(
            _rest_url("/passenger_reputation"),
            params={"passenger_id": f"eq.{passenger_id}", "select": "passenger_id,total_score,rating_count", "limit": "1"},
            headers=_service_headers(),
            timeout=30.0,
        )
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"passenger_reputation read failed: {r.text}")
        rows = _rest_json_list(r, "passenger_reputation select")
        if not rows:
            return PassengerReputationResponse(passenger_id=passenger_id, total_score=0, rating_count=0)
        row = rows[0]
        return PassengerReputationResponse(
            passenger_id=str(row["passenger_id"]),
            total_score=int(row["total_score"]),
            rating_count=int(row["rating_count"]),
        )


@app.post("/points/rating-bonus", response_model=AwardPointsResponse)
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def award_rating_bonus(
    request: Request,
    payload: RatingBonusRequest,
    authorization: str | None = Header(default=None),
):
    """
    Deferred bonus path (passenger post-trip screen):
    - Base points are awarded at /rides/complete.
    - Caller JWT must be the passenger on the completed ride; bonus credits the assigned driver.
    """
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        row = _fetch_completed_ride_for_passenger_rating_bonus(client, passenger_id, payload.rideId)
        credited_driver_id = str(row["driver_id"])

        if payload.rating != 5:
            return AwardPointsResponse(
                points_earned=0,
                source="backend",
                credited_driver_id=credited_driver_id,
                idempotent=True,
            )

        points_earned, is_idempotent = _award_points_with_idempotency(
            client=client,
            driver_id=credited_driver_id,
            ride_id=payload.rideId,
            idempotency_key=f"{payload.rideId}:rating5",
            action="LEG_RATING_5_STAR_BONUS",
            points=5,
            metadata={"ride_id": payload.rideId, "rating": payload.rating},
        )

    return AwardPointsResponse(
        points_earned=points_earned,
        source="backend",
        credited_driver_id=credited_driver_id,
        idempotent=is_idempotent,
    )


@app.get("/points/preview")
@(_limiter.limit("30/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def preview_points(
    request: Request,
    distanceMiles: float = Query(default=0.0, ge=0, description="Estimated trip distance in miles"),
    wasZeroDetour: bool = Query(default=True, description="True if driver was already heading this way"),
    rating: int = Query(default=5, ge=1, le=5, description="Expected passenger rating"),
):
    """
    Returns the exact calculated points for a prospective trip.
    Fixes Security Audit Issue M2 by making the backend the single source of truth for scoring math.
    """
    points = _compute_points(rating, wasZeroDetour, distanceMiles)
    
    # Calculate breakdown for frontend UI transparency
    base_component = 10 + distanceMiles
    multiplier = 1.5 if wasZeroDetour else 1.0
    rating_bonus = 5 if rating == 5 else 0

    return {
        "estimated_points": points,
        "breakdown": {
            "base_points": 10,
            "distance_bonus": distanceMiles,
            "multiplier": multiplier,
            "rating_bonus": rating_bonus,
        }
    }


@app.post("/points/sync")
@(_limiter.limit("5/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def sync_points_ledger(
    request: Request,
    authorization: str | None = Header(default=None),
):
    """
    Ledger Repair Job: Recalculates total points from point_events and updates points table.
    Resolves technical debt where an interrupted network request leaves the balance out of sync.
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        # 1. Fetch all point_events for this driver
        r = client.get(
            _rest_url("/point_events"),
            params={"driver_id": f"eq.{driver_id}", "select": "points_change"},
            headers=_service_headers(),
            timeout=30.0,
        )
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Failed to read point_events: {r.text}")

        rows = _rest_json_list(r, "point_events sync")
        true_total = sum(int(row.get("points_change", 0)) for row in rows)

        # 2. Update the points ledger with the true total
        _ensure_driver_points_row(client, driver_id)
        _update_points_balance(client, driver_id, true_total)

    logger.info(
        "ledger_synced driver_id=%s true_total=%s",
        driver_id, true_total,
        extra={"event_type": "ledger_synced"}
    )
    return {"driver_id": driver_id, "synced_total": true_total}


@app.post("/points/award", response_model=AwardPointsResponse)
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def award_points(
    request: Request,
    payload: AwardPointsRequest,
    authorization: str | None = Header(default=None),
):
    """
    Awards points for a completed trip, once per (driver, rideId), verified by JWT.
    """
    start_time = datetime.now(timezone.utc)
    driver_id = None

    try:
        _require_config()
        driver_id = _verify_user_bearer_token(authorization)
        points_to_add = _compute_points(payload.rating, payload.wasZeroDetour, payload.distanceMiles)

        logger.info(f"Points award requested: driver={driver_id}, ride={payload.rideId}, points={points_to_add}")

        with httpx.Client() as client:
            # SECURITY STEP (Session 12+):
            # Only award points if the ride is marked completed in `public.rides`
            # for THIS driver. This prevents fake points for arbitrary rideIds.
            r = client.get(
                _rest_url("/rides"),
                params={
                    "id": f"eq.{payload.rideId}",
                    "driver_id": f"eq.{driver_id}",
                    "select": "status",
                    "limit": "1",
                },
                headers=_service_headers(),
                timeout=30.0,
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ride read failed: {r.text}")
            rows = _rest_json_list(r, "rides select")
            if not rows or rows[0].get("status") != "completed":
                raise HTTPException(
                    status_code=400,
                    detail="Ride is not completed (missing /rides record or status != completed)",
                )

            existing = _fetch_existing_award(client, driver_id, payload.rideId)
            if existing is not None:
                logger.info(f"Idempotent award: driver={driver_id}, ride={payload.rideId}, existing_points={existing}")
                return AwardPointsResponse(
                    points_earned=existing,
                    source="backend",
                    credited_driver_id=driver_id,
                    idempotent=True,
                )

            _ensure_driver_points_row(client, driver_id)

            inserted = _try_insert_award_event(
                client, driver_id, payload.rideId, points_to_add, payload
            )
            if not inserted:
                concurrent = _fetch_existing_award(client, driver_id, payload.rideId)
                if concurrent is None:
                    raise HTTPException(status_code=502, detail="Duplicate insert but no award row found")
                logger.warning(f"Race condition handled: driver={driver_id}, ride={payload.rideId}")
                return AwardPointsResponse(
                    points_earned=concurrent,
                    source="backend",
                    credited_driver_id=driver_id,
                    idempotent=True,
                )

            before = _fetch_total_points(client, driver_id)
            new_total = before + points_to_add
            _update_points_balance(client, driver_id, new_total)

            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.info(f"Points awarded successfully: driver={driver_id}, ride={payload.rideId}, points={points_to_add}, duration={duration:.2f}s")

            return AwardPointsResponse(
                points_earned=points_to_add,
                source="backend",
                credited_driver_id=driver_id,
                idempotent=False,
            )
    except HTTPException:
        raise
    except Exception as exc:
        tb = traceback.format_exc()
        logger.error(f"award_points failed: driver={driver_id}, ride={payload.rideId}, error={exc}")
        logger.error(tb)
        print(tb, file=sys.stderr, flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {exc!s}. Check Uvicorn terminal for full traceback.",
        ) from exc


@app.post("/admin/points/adjust")
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def admin_points_adjust(
    request: Request,
    payload: AdminPointsAdjustRequest,
    authorization: str | None = Header(default=None),
):
    _require_config()
    caller_id = _verify_user_bearer_token(authorization)
    if not _FOUNDER_IDS or caller_id not in _FOUNDER_IDS:
        raise HTTPException(status_code=403, detail="Founder access required")

    with httpx.Client() as client:
        _ensure_driver_points_row(client, payload.user_id)
        current_total = _fetch_total_points(client, payload.user_id)
        new_total = max(0, current_total + payload.delta)

        _update_points_balance(client, payload.user_id, new_total)

        timestamp = int(datetime.now(timezone.utc).timestamp())
        reason_slug = payload.reason[:20].replace(" ", "-")
        adjustment_key = f"admin-{reason_slug}-{timestamp}"
        ledger_delta = new_total - current_total
        body = {
            "driver_id": payload.user_id,
            "ride_id": None,
            "action": "ADMIN_ADJUSTMENT",
            "points_change": ledger_delta,
            "idempotency_key": adjustment_key,
            "metadata": {
                "source": "admin_adjustment",
                "reason": payload.reason,
                "requested_delta": payload.delta,
                "applied_delta": ledger_delta,
                "adjusted_by": caller_id,
                "admin_reference": adjustment_key,
            },
        }
        r = client.post(
            _rest_url("/point_events"),
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json=body,
            timeout=30.0,
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Insert point_events failed: {r.text}")

    return {"user_id": payload.user_id, "delta": payload.delta, "new_total": new_total}

# Note: SOS and notification endpoints have been moved to isolated routers:
# - sos_routes.py (POST /sos)
# - notifications_routes.py (POST /notifications/register-token, /notifications/send, GET /notifications/health)
# These are now included via app.include_router() calls above.


# ─────────────────────────────────────────────────────────────────────────────
# P2.4b — Hub Onboarding
# ─────────────────────────────────────────────────────────────────────────────

class HubDomainRequest(BaseModel):
    domain: str  # e.g. "umd.edu"


def _auto_join_hub_by_email_domain(client: httpx.Client, user_id: str, email: str) -> None:
    """
    Extracts domain from email, queries hub_domain_allowlist, and auto-joins
    the user to matching hubs.
    """
    if not email or "@" not in email:
        return
    domain = email.split("@")[-1].strip().lower()
    if not domain:
        return

    r = client.get(
        _rest_url("/hub_domain_allowlist"),
        params={"domain": f"eq.{domain}", "select": "hub_id"},
        headers=_service_headers(),
        timeout=10.0,
    )
    if r.status_code == 200:
        rows = _rest_json_list(r, "hub_domain_allowlist")
        for row in rows:
            hub_id = row.get("hub_id")
            if hub_id:
                client.post(
                    _rest_url("/hub_members"),
                    headers={**_service_headers(), "Prefer": "resolution=ignore-duplicates,return=minimal"},
                    json={
                        "hub_id": str(hub_id),
                        "user_id": user_id,
                        "role": "member",
                        "is_active": True
                    },
                    timeout=10.0,
                )


@app.post("/admin/hubs/{hub_id}/domain")
@(_limiter.limit("20/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def admin_hubs_domain(
    hub_id: str,
    payload: HubDomainRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    _require_config()
    caller_id = _verify_user_bearer_token(authorization)
    if not _FOUNDER_IDS or caller_id not in _FOUNDER_IDS:
        raise HTTPException(status_code=403, detail="Founder access required")

    domain = payload.domain.strip().lower()
    if not domain:
        raise HTTPException(status_code=400, detail="Domain is required")

    with httpx.Client() as client:
        r = client.post(
            _rest_url("/hub_domain_allowlist"),
            headers={**_service_headers(), "Prefer": "resolution=ignore-duplicates,return=minimal"},
            json={"hub_id": hub_id, "domain": domain},
            timeout=10.0,
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Insert hub_domain_allowlist failed: {r.text}")

    return {"hub_id": hub_id, "domain": domain}


class HubJoinRequest(BaseModel):
    hubCode: str = Field(min_length=3, max_length=32)


@app.post("/hubs/join")
def hubs_join(
    payload: HubJoinRequest,
    authorization: str | None = Header(default=None),
):
    """
    Driver submits a hub join code.  Looks up the hub by code, then associates
    the driver with that hub in driver_presence.hub_id.
    """
    _require_config()
    uid = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        # 0. Auto-join by email domain pre-check
        try:
            r_prof = client.get(
                _rest_url("/profiles"),
                params={"id": f"eq.{uid}", "select": "email", "limit": "1"},
                headers=_service_headers(),
                timeout=10.0,
            )
            if r_prof.status_code == 200:
                p_rows = _rest_json_list(r_prof, "profiles email lookup")
                if p_rows and p_rows[0].get("email"):
                    _auto_join_hub_by_email_domain(client, uid, p_rows[0]["email"])
        except Exception as e:
            logger.warning("_auto_join_hub_by_email_domain wrapper failed: %s", e)

        # 1. Resolve hub by code.
        r = client.get(
            _rest_url("/hubs"),
            params={"code": f"eq.{payload.hubCode.upper()}", "is_active": "eq.true", "select": "id,name,hub_type"},
            headers=_service_headers(),
            timeout=15.0,
        )
        rows = _rest_json_list(r, "hubs_join lookup")
        if not rows:
            raise HTTPException(status_code=404, detail="Hub code not found or inactive.")
        hub = rows[0]

        # 2. Associate driver with hub.
        r2 = client.patch(
            _rest_url("/driver_presence"),
            params={"driver_id": f"eq.{uid}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={"hub_id": hub["id"]},
            timeout=15.0,
        )
        if r2.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"hub join write failed: {r2.text}")

    logger.info(
        "hub_joined driver_id=%s hub_id=%s hub_name=%s",
        uid, hub["id"], hub.get("name"),
        extra={"event_type": "hub_joined"},
    )
    return {"hub_id": hub["id"], "hub_name": hub.get("name"), "hub_type": hub.get("hub_type")}


@app.get("/hubs/my")
def hubs_my(authorization: str | None = Header(default=None)):
    """Returns the hub the authenticated driver is currently affiliated with."""
    _require_config()
    uid = _verify_user_bearer_token(authorization)
    with httpx.Client() as client:
        r = client.get(
            _rest_url("/driver_presence"),
            params={"driver_id": f"eq.{uid}", "select": "hub_id,hubs(name,hub_type,code)"},
            headers=_service_headers(),
            timeout=15.0,
        )
    rows = _rest_json_list(r, "hubs_my")
    if not rows or not rows[0].get("hub_id"):
        return {"hub": None}
    hub_obj = rows[0].get("hubs") or {}
    return {"hub": {"id": rows[0]["hub_id"], **hub_obj}}


# ─────────────────────────────────────────────────────────────────────────────
# Hub broadcast — driver goes online, notify all Hub members
# ─────────────────────────────────────────────────────────────────────────────

class HubDriverAvailableRequest(BaseModel):
    display_name: str = Field(max_length=80)
    heading_direction: str = Field(max_length=16)
    intent: str = Field(max_length=32)


@app.post("/hubs/driver-available")
def hub_driver_available(
    payload: HubDriverAvailableRequest,
    authorization: str | None = Header(default=None),
):
    """
    Called by the mobile app when a Hub driver goes online with hub_active=true.
    Looks up all other members of the same Hub and sends them a push notification
    so they know a driver is available — without them having to open the app first.
    """
    _require_config()
    uid = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        # 1. Find which Hub this driver belongs to
        r = client.get(
            _rest_url("/hub_members"),
            params={
                "user_id": f"eq.{uid}",
                "is_active": "eq.true",
                "select": "hub_id,hubs(name)",
            },
            headers=_service_headers(),
            timeout=15.0,
        )
        rows = _rest_json_list(r, "hub_driver_available hub lookup")
        if not rows:
            return {"sent": 0, "reason": "driver_not_in_hub"}

        hub_id = rows[0]["hub_id"]
        hub_obj = rows[0].get("hubs") or {}
        hub_name = hub_obj.get("name", "Hub") if isinstance(hub_obj, dict) else "Hub"

        # 2. Get all other active Hub members (not the driver themselves)
        r2 = client.get(
            _rest_url("/hub_members"),
            params={
                "hub_id": f"eq.{hub_id}",
                "is_active": "eq.true",
                "user_id": f"neq.{uid}",
                "select": "user_id",
            },
            headers=_service_headers(),
            timeout=15.0,
        )
        members = _rest_json_list(r2, "hub_driver_available members")
        if not members:
            return {"sent": 0, "reason": "no_other_members"}

        member_ids = [m["user_id"] for m in members if m.get("user_id")]
        if not member_ids:
            return {"sent": 0, "reason": "no_member_ids"}

        # 3. Fetch push tokens for all those members (service role bypasses RLS)
        member_ids_csv = ",".join(member_ids)
        r3 = client.get(
            _rest_url("/push_tokens"),
            params={
                "user_id": f"in.({member_ids_csv})",
                "select": "push_token",
            },
            headers=_service_headers(),
            timeout=15.0,
        )
        token_rows = _rest_json_list(r3, "hub_driver_available push_tokens")
        tokens = [t["push_token"] for t in token_rows if t.get("push_token")]

        if not tokens:
            return {"sent": 0, "reason": "no_push_tokens"}

        # 4. Build and send the notifications
        direction = payload.heading_direction.capitalize()
        intent_text = "heading out" if payload.intent == "already_going" else "making a detour"
        body = (
            f"{payload.display_name} is available and heading {direction} — "
            f"open KindRide to request a ride."
        )

        messages = [
            {
                "to": token,
                "title": f"🚗 {hub_name} — Driver Available",
                "body": body,
                "data": {"type": "hub_driver_available", "hub_id": hub_id},
                "sound": "default",
                "priority": "high",
            }
            for token in tokens[:100]  # Expo limit per batch
        ]

        _send_expo_push(messages)

    logger.info(
        "hub_broadcast sent=%d hub_id=%s driver_id=%s",
        len(tokens), hub_id, uid,
        extra={"event_type": "hub_broadcast"},
    )
    return {"sent": len(tokens), "hub_id": hub_id, "hub_name": hub_name}


# ─────────────────────────────────────────────────────────────────────────────
# P2.1 — Stripe Identity Verification
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/identity/webhook")
async def stripe_identity_webhook(request: Request):
    """
    Stripe Identity webhook.  Set STRIPE_WEBHOOK_SECRET in backend/.env.
    On identity.verification_session.verified → marks driver id_verified=true
    in driver_presence.  Stripe sends the verified user's metadata.id as the
    driver_id (set client_reference_id to auth.uid() when creating the session).
    """
    payload_bytes = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if STRIPE_WEBHOOK_SECRET:
        # Verify Stripe signature (constant-time HMAC check).
        import hmac as _hmac
        try:
            parts = {k: v for part in sig_header.split(",") for k, v in [part.split("=", 1)]}
            timestamp = parts.get("t", "")
            sig = parts.get("v1", "")
            signed_payload = f"{timestamp}.{payload_bytes.decode()}"
            expected = _hmac.new(
                STRIPE_WEBHOOK_SECRET.encode(),
                signed_payload.encode(),
                sha256,
            ).hexdigest()
            if not _hmac.compare_digest(expected, sig):
                raise HTTPException(status_code=400, detail="Invalid Stripe signature.")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Could not verify Stripe signature.")

    try:
        import json as _json
        event = _json.loads(payload_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    event_type = event.get("type", "")
    if event_type not in (
        "identity.verification_session.verified",
        "identity.verification_session.requires_input",
    ):
        # Acknowledge unhandled events without error.
        return {"received": True}

    session_obj = event.get("data", {}).get("object", {})
    session_id = session_obj.get("id", "")
    # client_reference_id must be set to auth.uid() when creating the session in-app.
    driver_id = session_obj.get("client_reference_id", "")

    if not driver_id:
        logger.warning("stripe_identity_webhook: missing client_reference_id session_id=%s", session_id)
        return {"received": True}

    verified = event_type == "identity.verification_session.verified"

    with httpx.Client() as client:
        r = client.patch(
            _rest_url("/driver_presence"),
            params={"driver_id": f"eq.{driver_id}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={
                "id_verified": verified,
                "stripe_identity_session_id": session_id,
            },
            timeout=15.0,
        )

    status_label = "verified" if verified else "requires_input"
    logger.info(
        "stripe_identity driver_id=%s status=%s session_id=%s db_status=%s",
        driver_id,
        status_label,
        session_id,
        r.status_code,
        extra={"event_type": "stripe_identity_webhook"},
    )
    return {"received": True}


@app.get("/identity/status")
def identity_status(authorization: str | None = Header(default=None)):
    """Returns id_verified flag for the authenticated driver."""
    _require_config()
    uid = _verify_user_bearer_token(authorization)
    with httpx.Client() as client:
        r = client.get(
            _rest_url("/driver_presence"),
            params={"driver_id": f"eq.{uid}", "select": "id_verified,stripe_identity_session_id"},
            headers=_service_headers(),
            timeout=15.0,
        )
    rows = _rest_json_list(r, "identity_status")
    if not rows:
        return {"id_verified": False, "stripe_identity_session_id": None}
    row = rows[0]
    return {
        "id_verified": bool(row.get("id_verified")),
        "stripe_identity_session_id": row.get("stripe_identity_session_id"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# P2.2 — Trip Recording (Supabase Storage metadata + flag retention)
# ─────────────────────────────────────────────────────────────────────────────

class RegisterRecordingRequest(BaseModel):
    rideId: str
    storagePath: str   # e.g. "trip-recordings/{rideId}.mp4"


class FlagRecordingRequest(BaseModel):
    reason: str = Field(default="", max_length=500)


@app.post("/recordings/register")
def recordings_register(
    payload: RegisterRecordingRequest,
    authorization: str | None = Header(default=None),
):
    """
    Called by the app after uploading a recording to Supabase Storage.
    Persists metadata (storage_path, ride_id) so the backend can manage
    expiry and flag-based retention.
    """
    _require_config()
    _verify_user_bearer_token(authorization)
    with httpx.Client() as client:
        r = client.post(
            _rest_url("/trip_recordings"),
            headers={**_service_headers(), "Prefer": "resolution=ignore-duplicates,return=representation"},
            json={"ride_id": payload.rideId, "storage_path": payload.storagePath},
            timeout=15.0,
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"recording register failed: {r.text}")
    rows = _rest_json_list(r, "recordings_register")
    row = rows[0] if rows else {}
    logger.info(
        "recording_registered ride_id=%s path=%s",
        payload.rideId,
        payload.storagePath,
        extra={"event_type": "recording_registered"},
    )
    return {
        "id": row.get("id"),
        "ride_id": payload.rideId,
        "storage_path": payload.storagePath,
        "retain_until": row.get("retain_until"),
    }


@app.post("/recordings/flag/{ride_id}")
def recordings_flag(
    ride_id: str,
    payload: FlagRecordingRequest,
    authorization: str | None = Header(default=None),
):
    """
    Flags a trip recording for extended retention (72 h → 30 days).
    Any authenticated party (passenger, driver, admin) may flag.
    """
    _require_config()
    _verify_user_bearer_token(authorization)
    now = datetime.now(timezone.utc).isoformat()
    with httpx.Client() as client:
        r = client.patch(
            _rest_url("/trip_recordings"),
            params={"ride_id": f"eq.{ride_id}"},
            headers={**_service_headers(), "Prefer": "return=representation"},
            json={"flagged": True, "flagged_at": now, "flag_reason": payload.reason or None},
            timeout=15.0,
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"recording flag failed: {r.text}")
    rows = _rest_json_list(r, "recordings_flag")
    row = rows[0] if rows else {}
    logger.info(
        "recording_flagged ride_id=%s reason=%s",
        ride_id,
        payload.reason[:80] if payload.reason else "",
        extra={"event_type": "recording_flagged", "ride_id": ride_id},
    )
    return {
        "ride_id": ride_id,
        "flagged": True,
        "retain_until": row.get("retain_until"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# P2.3 — Anomaly Detection (called as background task at ride completion)
# ─────────────────────────────────────────────────────────────────────────────

_ANOMALY_MAX_DURATION_MULTIPLIER = 3.0   # flag if trip took >3× expected
_ANOMALY_CORRIDOR_METERS = 500           # flag if start/end GPS > 500 m off straight line
_ANOMALY_RAPID_RIDES_WINDOW_MINUTES = 60
_ANOMALY_RAPID_RIDES_THRESHOLD = 5       # flag if driver completes >5 rides in 60 min


def _detect_ride_anomalies(ride_id: str, driver_id: str, payload: "CompleteRideRequest") -> None:
    """
    P2.3 Anomaly Detection — runs as a background task after /rides/complete.
    Checks three heuristics and writes flags to ride_integrity.validation_flags.
    Does NOT block the passenger response; failures are logged and swallowed.
    """
    flags: dict = {}

    # 1. Abnormal duration
    if payload.startedAt and payload.distanceMiles:
        try:
            start_dt = datetime.fromisoformat(payload.startedAt.replace("Z", "+00:00"))
            duration_mins = (datetime.now(timezone.utc) - start_dt).total_seconds() / 60.0
            expected_mins = (payload.distanceMiles / 20.0) * 60.0
            if expected_mins > 0 and duration_mins > (expected_mins * _ANOMALY_MAX_DURATION_MULTIPLIER):
                flags["abnormal_duration"] = True
                flags["duration_ratio"] = round(duration_mins / expected_mins, 2)
        except Exception:
            pass

    # 2. GPS corridor deviation (straight-line pickup→destination vs actual dropoff)
    if all(
        v is not None
        for v in [payload.pickupLat, payload.pickupLng, payload.destinationLat, payload.destinationLng,
                  payload.dropoffLat, payload.dropoffLng]
    ):
        try:
            # Mid-point of straight-line route as corridor proxy
            mid_lat = (payload.pickupLat + payload.destinationLat) / 2
            mid_lng = (payload.pickupLng + payload.destinationLng) / 2
            actual_drop_lat = payload.dropoffLat
            actual_drop_lng = payload.dropoffLng
            deviation_m = _haversine_meters(mid_lat, mid_lng, actual_drop_lat, actual_drop_lng)
            if deviation_m > _ANOMALY_CORRIDOR_METERS:
                flags["gps_corridor_deviation"] = True
                flags["deviation_meters"] = round(deviation_m)
        except Exception:
            pass

    # 3. Rapid ride accumulation (driver completing too many rides in a short window)
    try:
        window_start = (
            datetime.now(timezone.utc) - timedelta(minutes=_ANOMALY_RAPID_RIDES_WINDOW_MINUTES)
        ).isoformat()
        with httpx.Client() as client:
            r = client.get(
                _rest_url("/rides"),
                params={
                    "driver_id": f"eq.{driver_id}",
                    "status": "eq.completed",
                    "completed_at": f"gte.{window_start}",
                    "select": "id",
                    "limit": str(_ANOMALY_RAPID_RIDES_THRESHOLD + 1),
                },
                headers=_service_headers(),
                timeout=10.0,
            )
            recent_count = len(_rest_json_list(r, "anomaly_rapid_check"))
            if recent_count > _ANOMALY_RAPID_RIDES_THRESHOLD:
                flags["rapid_accumulation"] = True
                flags["rides_in_window"] = recent_count
    except Exception:
        pass

    if not flags:
        return

    # Write flags to ride_integrity row (created at completion by Feature 1).
    try:
        import json as _json
        with httpx.Client() as client:
            r = client.patch(
                _rest_url("/ride_integrity"),
                params={"ride_id": f"eq.{ride_id}"},
                headers={**_service_headers(), "Prefer": "return=minimal"},
                json={
                    "is_valid": False,
                    "validation_flags": _json.dumps(flags),
                },
                timeout=10.0,
            )
        logger.warning(
            "anomaly_detected ride_id=%s driver_id=%s flags=%s",
            ride_id,
            driver_id,
            flags,
            extra={"event_type": "anomaly_detected", "ride_id": ride_id},
        )
    except Exception as exc:
        logger.error("anomaly_detect write failed ride_id=%s err=%s", ride_id, str(exc)[:200])


# ─────────────────────────────────────────────────────────────────────────────
# Voluntary Tipping via Stripe Connect Express
# ─────────────────────────────────────────────────────────────────────────────

class ConnectOnboardRequest(BaseModel):
    """Driver requests a Stripe Connect onboarding link."""
    pass  # driver_id comes from JWT


class TipCreateRequest(BaseModel):
    ride_id: str = Field(min_length=3)
    driver_id: str = Field(min_length=3)
    amount_cents: int = Field(ge=50, description="Tip amount in cents. Minimum $0.50.")
    currency: str = Field(default="usd", pattern="^[a-z]{3}$")


@app.post("/connect/onboard")
def connect_onboard(
    authorization: str | None = Header(default=None),
):
    """
    Creates (or retrieves) a Stripe Connect Express account for the calling driver
    and returns a single-use onboarding URL.  The driver opens this URL in a browser.
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)

    if not _STRIPE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured on this server. Set STRIPE_SECRET_KEY in backend/.env.",
        )

    # Check if driver already has a Connect account stored.
    with httpx.Client() as client:
        r = client.get(
            _rest_url("/driver_presence"),
            headers=_service_headers(),
            params={"driver_id": f"eq.{driver_id}", "select": "stripe_connect_account_id"},
            timeout=8.0,
        )
    rows = _rest_json_list(r, "connect/onboard presence lookup")
    existing_account_id: str | None = rows[0].get("stripe_connect_account_id") if rows else None

    # Create a new Express account if needed.
    if not existing_account_id:
        account = _stripe_lib.Account.create(  # type: ignore[union-attr]
            type="express",
            metadata={"kindride_driver_id": str(driver_id)},
        )
        existing_account_id = account["id"]
        # Persist to driver_presence.
        with httpx.Client() as client:
            client.patch(
                _rest_url("/driver_presence"),
                headers={**_service_headers(), "Prefer": "return=minimal"},
                params={"driver_id": f"eq.{driver_id}"},
                json={"stripe_connect_account_id": existing_account_id},
                timeout=8.0,
            )

    # Create a fresh account link (they expire quickly).
    account_link = _stripe_lib.AccountLink.create(  # type: ignore[union-attr]
        account=existing_account_id,
        refresh_url=f"{STRIPE_CONNECT_RETURN_URL}?status=refresh",
        return_url=f"{STRIPE_CONNECT_RETURN_URL}?status=complete",
        type="account_onboarding",
    )

    logger.info(
        "connect_onboard account_id=%s driver_id=%s",
        existing_account_id,
        driver_id,
        extra={"event_type": "connect_onboard"},
    )
    return {"onboarding_url": account_link["url"], "account_id": existing_account_id}


@app.get("/connect/status")
def connect_status(
    authorization: str | None = Header(default=None),
):
    """Returns whether the calling driver has completed Connect onboarding."""
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)

    if not _STRIPE_AVAILABLE:
        return {"charges_enabled": False, "onboarded": False, "reason": "stripe_not_configured"}

    with httpx.Client() as client:
        r = client.get(
            _rest_url("/driver_presence"),
            headers=_service_headers(),
            params={"driver_id": f"eq.{driver_id}", "select": "stripe_connect_account_id"},
            timeout=8.0,
        )
    rows = _rest_json_list(r, "connect/status lookup")
    account_id: str | None = rows[0].get("stripe_connect_account_id") if rows else None

    if not account_id:
        return {"charges_enabled": False, "onboarded": False, "account_id": None}

    account = _stripe_lib.Account.retrieve(account_id)  # type: ignore[union-attr]
    return {
        "charges_enabled": account.get("charges_enabled", False),
        "onboarded": account.get("details_submitted", False),
        "account_id": account_id,
    }


@app.post("/tips/create")
@(_limiter.limit("15/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def tips_create(
    request: Request,
    payload: TipCreateRequest,
    authorization: str | None = Header(default=None),
):
    """
    Passenger creates a PaymentIntent to tip a driver.
    Returns a Stripe client_secret for the app to confirm payment.
    The tip is routed directly to the driver's Connect Express account.
    KindRide takes 0% platform fee.
    """
    _require_config()
    passenger_id = _verify_user_bearer_token(authorization)

    if not _STRIPE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env.",
        )

    # Look up driver's Connect account.
    with httpx.Client() as client:
        r = client.get(
            _rest_url("/driver_presence"),
            headers=_service_headers(),
            params={
                "driver_id": f"eq.{payload.driver_id}",
                "select": "stripe_connect_account_id",
            },
            timeout=8.0,
        )
    rows = _rest_json_list(r, "tips/create driver lookup")
    connect_account: str | None = rows[0].get("stripe_connect_account_id") if rows else None

    if not connect_account:
        raise HTTPException(
            status_code=422,
            detail="This driver has not set up their Stripe account yet. Tip cannot be processed.",
        )

    # Idempotency key: passenger + ride + amount (allow different amounts for same ride).
    idempotency_key = f"tip_{passenger_id}_{payload.ride_id}_{payload.amount_cents}"

    # Create a destination charge: full amount goes to driver's Express account.
    intent = _stripe_lib.PaymentIntent.create(  # type: ignore[union-attr]
        amount=payload.amount_cents,
        currency=payload.currency,
        transfer_data={"destination": connect_account},
        metadata={
            "ride_id": payload.ride_id,
            "passenger_id": str(passenger_id),
            "driver_id": payload.driver_id,
            "idempotency_key": idempotency_key,
        },
        idempotency_key=idempotency_key,
    )

    # Record pending tip in DB (status updated to 'succeeded' by webhook).
    with httpx.Client() as client:
        client.post(
            _rest_url("/tip_events"),
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={
                "ride_id": payload.ride_id,
                "passenger_id": str(passenger_id),
                "driver_id": payload.driver_id,
                "amount_cents": payload.amount_cents,
                "currency": payload.currency,
                "stripe_payment_intent": intent["id"],
                "stripe_connect_account": connect_account,
                "status": "pending",
                "idempotency_key": idempotency_key,
            },
            timeout=8.0,
        )

    logger.info(
        "tip_created ride_id=%s passenger_id=%s amount_cents=%d intent_id=%s",
        payload.ride_id,
        passenger_id,
        payload.amount_cents,
        intent["id"],
        extra={"event_type": "tip_created"},
    )

    return {
        "client_secret": intent["client_secret"],
        "payment_intent_id": intent["id"],
        "amount_cents": payload.amount_cents,
        "currency": payload.currency,
    }


@app.post("/tips/webhook")
async def tips_webhook(request: Request):
    """
    Stripe webhook for tip payment events.
    Handles payment_intent.succeeded → marks tip_events row as succeeded.
    Register this endpoint in Stripe Dashboard → Webhooks.
    Set STRIPE_TIP_WEBHOOK_SECRET to the signing secret.
    """
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if STRIPE_TIP_WEBHOOK_SECRET:
        try:
            event = _stripe_lib.Webhook.construct_event(  # type: ignore[union-attr]
                body, sig, STRIPE_TIP_WEBHOOK_SECRET
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature.")
    else:
        # No secret configured — accept in development/sandbox, log warning.
        import json as _json_mod
        logger.warning("STRIPE_TIP_WEBHOOK_SECRET not set — webhook signature not verified.")
        try:
            event = _json_mod.loads(body)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON in webhook body.")

    event_type = event.get("type") if isinstance(event, dict) else event["type"]

    if event_type == "payment_intent.succeeded":
        obj = event["data"]["object"] if isinstance(event, dict) else event.data.object
        intent_id = obj["id"] if isinstance(obj, dict) else obj.id
        meta = obj.get("metadata", {}) if isinstance(obj, dict) else obj.metadata or {}

        with httpx.Client() as client:
            client.patch(
                _rest_url("/tip_events"),
                headers={**_service_headers(), "Prefer": "return=minimal"},
                params={"stripe_payment_intent": f"eq.{intent_id}"},
                json={"status": "succeeded", "completed_at": datetime.now(timezone.utc).isoformat()},
                timeout=8.0,
            )

        logger.info(
            "tip_succeeded intent_id=%s ride_id=%s",
            intent_id,
            meta.get("ride_id"),
            extra={"event_type": "tip_succeeded"},
        )

    elif event_type == "payment_intent.payment_failed":
        obj = event["data"]["object"] if isinstance(event, dict) else event.data.object
        intent_id = obj["id"] if isinstance(obj, dict) else obj.id

        with httpx.Client() as client:
            client.patch(
                _rest_url("/tip_events"),
                headers={**_service_headers(), "Prefer": "return=minimal"},
                params={"stripe_payment_intent": f"eq.{intent_id}"},
                json={"status": "failed"},
                timeout=8.0,
            )

    return {"received": True}


# ─────────────────────────────────────────────────────────────────────────────
# Leaderboard / Gamification
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/points/streak")
@(_limiter.limit("30/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def get_driver_streak(
    request: Request,
    authorization: str | None = Header(default=None),
):
    """
    Returns the calling driver's current consecutive active-day streak.
    A day counts if the driver completed at least one ride that day.
    Streak stays alive if they rode yesterday (hasn't reset yet today).
    """
    _require_config()
    driver_id = str(_verify_user_bearer_token(authorization))

    with httpx.Client() as client:
        past_dates = _fetch_driver_ride_dates(client, driver_id)

    today = datetime.now(timezone.utc).date()
    streak = _compute_streak_from_dates(past_dates, today)

    return {
        "driver_id": driver_id,
        "streak_days": streak,
        "last_active_date": max(past_dates).isoformat() if past_dates else None,
    }


class LeaderboardEntry(BaseModel):
    driver_id: str
    display_name: str
    total_points: int
    tier: str
    rank: int
    streak_days: int = 0


@app.get("/points/leaderboard", response_model=list[LeaderboardEntry])
@(_limiter.limit("10/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def points_leaderboard(
    request: Request,
    limit: int = Query(default=10, le=50, description="Number of top drivers to return"),
    authorization: str | None = Header(default=None),
):
    """
    Returns the top drivers by total points for the community leaderboard.
    Used by the app to populate the podium and ranking list.
    """
    _require_config()
    if authorization:
        _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        # 1. Get the top drivers by points
        r_pts = client.get(
            _rest_url("/points"),
            params={
                "select": "driver_id,total_points,tier",
                "order": "total_points.desc",
                "limit": str(limit),
            },
            headers=_service_headers(),
            timeout=10.0,
        )
        if r_pts.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Failed to read points leaderboard: {r_pts.text}")
        
        top_points = _rest_json_list(r_pts, "points leaderboard")
        if not top_points:
            return []

        # 2. Get their display names from driver_presence
        driver_ids = [str(p["driver_id"]) for p in top_points if p.get("driver_id")]
        ids_csv = ",".join(driver_ids)
        
        r_pres = client.get(
            _rest_url("/driver_presence"),
            params={"driver_id": f"in.({ids_csv})", "select": "driver_id,display_name"},
            headers=_service_headers(),
            timeout=10.0,
        )
        
        presence_map = {}
        if r_pres.status_code == 200:
            presence_rows = _rest_json_list(r_pres, "driver_presence leaderboard")
            for pr in presence_rows:
                # Fallback to "Kind Driver" if they haven't set a display name
                presence_map[str(pr["driver_id"])] = str(pr.get("display_name") or "Kind Driver")

        # 3. Fetch streak for each driver in a single batch query
        today = datetime.now(timezone.utc).date()
        streak_map: dict[str, int] = {}
        if driver_ids:
            r_streak = client.get(
                _rest_url("/point_events"),
                params={
                    "driver_id": f"in.({ids_csv})",
                    "action": "in.(LEG_COMPLETED_BASE,TRIP_POINTS_AWARDED)",
                    "select": "driver_id,created_at",
                    "order": "created_at.desc",
                    "limit": "500",
                },
                headers=_service_headers(),
                timeout=15.0,
            )
            if r_streak.status_code == 200:
                streak_rows = _rest_json_list(r_streak, "leaderboard streaks")
                # Group dates by driver
                dates_by_driver: dict[str, set] = {}
                for row in streak_rows:
                    did = str(row.get("driver_id", ""))
                    dt = _parse_supabase_timestamptz(row.get("created_at"))
                    if did and dt:
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        dates_by_driver.setdefault(did, set()).add(dt.date())
                for did, dates in dates_by_driver.items():
                    streak_map[did] = _compute_streak_from_dates(dates, today)

        # 4. Merge and format the response
        leaderboard = []
        for idx, p in enumerate(top_points):
            did = str(p["driver_id"])
            leaderboard.append(LeaderboardEntry(
                driver_id=did,
                display_name=presence_map.get(did, "Kind Driver"),
                total_points=int(p.get("total_points", 0)),
                tier=str(p.get("tier", "Helper")),
                rank=idx + 1,
                streak_days=streak_map.get(did, 0),
            ))

        return leaderboard


# ─────────────────────────────────────────────────────────────────────────────
# Charity / Pay It Forward
# ─────────────────────────────────────────────────────────────────────────────

class DonatePointsRequest(BaseModel):
    charity_id: str = Field(min_length=2, max_length=50, description="e.g., 'local_food_bank'")
    points_amount: int = Field(ge=50, description="Must donate at least 50 points.")
    transaction_id: str = Field(description="UUIDv4 generated by the app for idempotency")

    @field_validator("transaction_id")
    @classmethod
    def valid_uuid(cls, v: str) -> str:
        UUID(v)
        return v


@app.post("/points/donate")
@(_limiter.limit("10/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def donate_points(
    request: Request,
    payload: DonatePointsRequest,
    authorization: str | None = Header(default=None),
):
    """
    Deducts points from a driver to fund a real-world charity donation.
    Requires a client-generated transaction_id (UUID) to prevent double-charging.
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        current_total = _fetch_total_points(client, driver_id)
        if current_total < payload.points_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient points. You have {current_total} but tried to donate {payload.points_amount}."
            )
        
        # Deduct points idempotently (pass a negative value)
        points_deducted, is_idempotent = _award_points_with_idempotency(
            client=client,
            driver_id=driver_id,
            ride_id=None,  # Not tied to a specific ride
            idempotency_key=payload.transaction_id,
            action="CHARITY_DONATION",
            points=-payload.points_amount,
            metadata={"charity_id": payload.charity_id, "transaction_id": payload.transaction_id}
        )

    return {
        "status": "success",
        "points_donated": payload.points_amount,
        "new_total": current_total - payload.points_amount if not is_idempotent else current_total,
        "idempotent": is_idempotent
    }


# ─────────────────────────────────────────────────────────────────────────────
# Referral System
# ─────────────────────────────────────────────────────────────────────────────

_REFERRAL_BONUS_POINTS = 50


def _generate_referral_code(user_id: str) -> str:
    """Deterministic 6-char uppercase code from user UUID. Collision-safe via DB unique constraint."""
    import hashlib
    h = hashlib.sha256(user_id.encode()).hexdigest()
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no O/0/I/1 to avoid confusion
    return "".join(chars[int(h[i * 2: i * 2 + 2], 16) % len(chars)] for i in range(6))


def _award_referral_bonus(client: httpx.Client, user_id: str, ride_id: str, tag: str) -> None:
    """Award REFERRAL_BONUS_POINTS to a user. Non-fatal — never crash the ride flow."""
    try:
        _award_points_with_idempotency(
            client=client,
            driver_id=user_id,
            ride_id=ride_id,
            idempotency_key=f"referral_bonus:{user_id}:{tag}",
            action="REFERRAL_BONUS",
            points=_REFERRAL_BONUS_POINTS,
            metadata={"bonus_type": "referral", "tag": tag},
        )
    except Exception as exc:
        logger.warning("referral bonus award failed (non-fatal): %s", str(exc))


@app.get("/referrals/my-code")
@(_limiter.limit("30/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def get_my_referral_code(
    request: Request,
    authorization: str | None = Header(default=None),
):
    """
    Returns the calling user's unique referral code.
    Creates it on first call — idempotent via DB unique constraint.
    """
    _require_config()
    user_id = str(_verify_user_bearer_token(authorization))
    code = _generate_referral_code(user_id)

    with httpx.Client() as client:
        # Upsert: insert if not exists, otherwise ignore duplicate
        r = client.post(
            _rest_url("/referral_codes"),
            headers={**_service_headers(), "Prefer": "resolution=ignore-duplicates,return=representation"},
            json={"user_id": user_id, "code": code},
            timeout=10.0,
        )
        if r.status_code not in (200, 201):
            # Row may already exist — fetch it
            r2 = client.get(
                _rest_url("/referral_codes"),
                params={"user_id": f"eq.{user_id}", "select": "code", "limit": "1"},
                headers=_service_headers(),
                timeout=10.0,
            )
            if r2.status_code == 200:
                rows = _rest_json_list(r2, "referral_codes fetch")
                if rows:
                    code = rows[0]["code"]

    return {"code": code}


class RedeemReferralRequest(BaseModel):
    code: str = Field(min_length=4, max_length=10, description="Referral code entered by new user")

    @field_validator("code")
    @classmethod
    def normalize(cls, v: str) -> str:
        return v.strip().upper()


@app.post("/referrals/redeem")
@(_limiter.limit("5/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def redeem_referral_code(
    request: Request,
    payload: RedeemReferralRequest,
    authorization: str | None = Header(default=None),
):
    """
    Called during complete-signup when a new user enters a referral code.
    Links the new user to their referrer. Bonus points are NOT awarded here —
    they are awarded when the new user completes their first ride.
    """
    _require_config()
    referred_id = str(_verify_user_bearer_token(authorization))

    with httpx.Client() as client:
        # Check new user hasn't already redeemed a code
        r_check = client.get(
            _rest_url("/referral_redemptions"),
            params={"referred_id": f"eq.{referred_id}", "select": "id", "limit": "1"},
            headers=_service_headers(),
            timeout=10.0,
        )
        if r_check.status_code == 200:
            rows = _rest_json_list(r_check, "referral_redemptions check")
            if rows:
                return {"status": "already_redeemed"}

        # Look up the referral code
        r_code = client.get(
            _rest_url("/referral_codes"),
            params={"code": f"eq.{payload.code}", "select": "user_id", "limit": "1"},
            headers=_service_headers(),
            timeout=10.0,
        )
        if r_code.status_code != 200:
            raise HTTPException(status_code=502, detail="Could not look up referral code.")
        code_rows = _rest_json_list(r_code, "referral_codes lookup")
        if not code_rows:
            raise HTTPException(status_code=404, detail="Invalid referral code. Please check and try again.")

        referrer_id = str(code_rows[0]["user_id"])
        if referrer_id == referred_id:
            raise HTTPException(status_code=400, detail="You cannot use your own referral code.")

        # Create the redemption record
        r_redeem = client.post(
            _rest_url("/referral_redemptions"),
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={
                "referrer_id": referrer_id,
                "referred_id": referred_id,
                "code": payload.code,
                "bonus_awarded": False,
            },
            timeout=10.0,
        )
        if r_redeem.status_code not in (200, 201, 204):
            if "unique" in r_redeem.text.lower() or r_redeem.status_code == 409:
                return {"status": "already_redeemed"}
            raise HTTPException(status_code=502, detail="Could not save referral redemption.")

    logger.info(
        "referral_redeemed referrer=%s referred=%s code=%s",
        referrer_id, referred_id, payload.code,
        extra={"event_type": "referral_redeemed"},
    )
    return {"status": "redeemed", "referrer_id": referrer_id}


def _maybe_award_referral_bonus_on_first_ride(
    client: httpx.Client, passenger_or_driver_id: str, ride_id: str
) -> None:
    """
    Called from /rides/complete. Checks if this user was referred and hasn't
    had their bonus awarded yet. If yes, awards 50 pts to both parties.
    Non-fatal: exceptions are logged and swallowed.
    """
    try:
        r = client.get(
            _rest_url("/referral_redemptions"),
            params={
                "referred_id": f"eq.{passenger_or_driver_id}",
                "bonus_awarded": "eq.false",
                "select": "id,referrer_id,referred_id",
                "limit": "1",
            },
            headers=_service_headers(),
            timeout=10.0,
        )
        if r.status_code != 200:
            return
        rows = _rest_json_list(r, "referral_redemptions bonus check")
        if not rows:
            return

        redemption_id = rows[0]["id"]
        referrer_id = str(rows[0]["referrer_id"])
        referred_id = str(rows[0]["referred_id"])

        # Award 50 pts to referred user
        _award_referral_bonus(client, referred_id, ride_id, f"referred:{redemption_id}")
        # Award 50 pts to referrer
        _award_referral_bonus(client, referrer_id, ride_id, f"referrer:{redemption_id}")

        # Mark bonus as awarded — idempotent via update
        client.patch(
            _rest_url("/referral_redemptions"),
            params={"id": f"eq.{redemption_id}"},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            json={"bonus_awarded": True, "awarded_at": datetime.now(timezone.utc).isoformat()},
            timeout=10.0,
        )
        logger.info(
            "referral_bonus_awarded referrer=%s referred=%s ride=%s",
            referrer_id, referred_id, ride_id,
            extra={"event_type": "referral_bonus_awarded"},
        )
    except Exception as exc:
        logger.warning("referral bonus check failed (non-fatal): %s", str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
