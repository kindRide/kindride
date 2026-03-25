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
from typing import Literal
from uuid import UUID

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient
from pydantic import BaseModel, Field, field_validator

# Always load .env next to this file (Uvicorn's working directory may be elsewhere).
# This file is NOT the same as KindRide/.env used by Expo — you need both.
_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_PATH = _BACKEND_DIR / ".env"
load_dotenv(_ENV_PATH)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()

logger = logging.getLogger("kindride.api")

app = FastAPI(title="KindRide Points API", version="0.6.0")

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


def _ensure_completed_ride(client: httpx.Client, driver_id: str, ride_id: str) -> None:
    _fetch_completed_ride_for_driver(client, driver_id, ride_id)


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
    """Multi-leg: ride completion must reference an active journey owned by this passenger."""
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
    if row.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail="This journey is no longer active (completed or cancelled).",
        )


def _award_points_with_idempotency(
    client: httpx.Client,
    driver_id: str,
    ride_id: str,
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
    return {"status": "ok"}


class DemoDriverCard(BaseModel):
    """One driver option in the matching list (MVP: static; later: geo + availability)."""

    id: str
    name: str
    tier: str
    etaMinutes: int
    distanceMiles: float
    intent: Literal["already_going", "detour"]


def _demo_driver_catalog() -> list[DemoDriverCard]:
    return [
        DemoDriverCard(
            id="1",
            name="Aisha Bello",
            tier="Champion",
            etaMinutes=4,
            distanceMiles=1.1,
            intent="already_going",
        ),
        DemoDriverCard(
            id="2",
            name="Daniel Kim",
            tier="Good Samaritan",
            etaMinutes=6,
            distanceMiles=1.8,
            intent="detour",
        ),
        DemoDriverCard(
            id="3",
            name="Grace Martin",
            tier="Leader",
            etaMinutes=7,
            distanceMiles=2.2,
            intent="already_going",
        ),
    ]


@app.get("/matching/demo-drivers", response_model=list[DemoDriverCard])
def matching_demo_drivers(authorization: str | None = Header(default=None)):
    """
    Matching feed placeholder: returns a deterministic driver list from the server.
    Swap this implementation for real routing when GPS + driver availability exist.
    Caller must send a valid Supabase access token (passenger or driver).
    """
    _require_config()
    _verify_user_bearer_token(authorization)
    return _demo_driver_catalog()


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


@app.post("/rides/complete")
def complete_ride(
    payload: CompleteRideRequest,
    authorization: str | None = Header(default=None),
):
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)
    ride_id = payload.rideId

    now = datetime.now(timezone.utc).isoformat()

    # Upsert the ride record using PostgREST.
    body: dict = {
        "id": ride_id,
        "driver_id": driver_id,
        "status": "completed",
        "completed_at": now,
    }
    if payload.passengerId:
        body["passenger_id"] = payload.passengerId
    if payload.journeyId:
        body["journey_id"] = payload.journeyId
        body["leg_index"] = payload.legIndex
    body["distance_miles"] = payload.distanceMiles
    body["was_zero_detour"] = payload.wasZeroDetour

    with httpx.Client() as client:
        if payload.journeyId:
            if not payload.passengerId:
                raise HTTPException(
                    status_code=400,
                    detail="passengerId is required when journeyId is set (multi-leg).",
                )
            _ensure_journey_active_for_passenger(client, payload.journeyId, payload.passengerId)

        r = client.post(
            _rest_url("/rides"),
            headers={**_service_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=body,
            timeout=30.0,
        )

    if r.status_code not in (200, 201, 204):
        # If PostgREST returns a non-JSON error, we still want the user to see something useful.
        raise HTTPException(status_code=502, detail=f"Ride completion write failed: {r.text}")

    # Non-blocking approach: award base leg points now; rating bonus happens later.
    base_component = (10 + payload.distanceMiles) * (1.5 if payload.wasZeroDetour else 1.0)
    base_points = int(round(base_component))
    with httpx.Client() as client:
        points_earned, was_idempotent = _award_points_with_idempotency(
            client=client,
            driver_id=driver_id,
            ride_id=ride_id,
            idempotency_key=f"{ride_id}:base",
            action="LEG_COMPLETED_BASE",
            points=base_points,
            metadata={
                "ride_id": ride_id,
                "distance_miles": payload.distanceMiles,
                "was_zero_detour": payload.wasZeroDetour,
                **(
                    {"journey_id": payload.journeyId, "leg_index": payload.legIndex}
                    if payload.journeyId
                    else {}
                ),
            },
        )

    # Search for next driver should continue independently of rating (non-blocking).
    # Matching engine hookup happens in the next step; for now we return a signal.
    return {
        "ride_id": ride_id,
        "status": "completed",
        "base_points_earned": points_earned,
        "base_points_idempotent": was_idempotent,
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


@app.post("/passengers/rate", response_model=RatePassengerResponse)
def rate_passenger(
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
    Drivers (any signed-in user for now) can fetch aggregate passenger reputation
    before accepting a trip. Tighten to matched rides only when matching ships.
    """
    _require_config()
    _verify_user_bearer_token(authorization)
    try:
        UUID(passenger_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid passenger_id") from e

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
def award_rating_bonus(
    payload: RatingBonusRequest,
    authorization: str | None = Header(default=None),
):
    """
    Deferred bonus path:
    - Base points are awarded at /rides/complete.
    - Rating bonus is awarded later (non-blocking for next-leg search).
    """
    _require_config()
    driver_id = _verify_user_bearer_token(authorization)

    with httpx.Client() as client:
        _ensure_completed_ride(client, driver_id, payload.rideId)

        if payload.rating != 5:
            return AwardPointsResponse(
                points_earned=0,
                source="backend",
                credited_driver_id=driver_id,
                idempotent=True,
            )

        points_earned, is_idempotent = _award_points_with_idempotency(
            client=client,
            driver_id=driver_id,
            ride_id=payload.rideId,
            idempotency_key=f"{payload.rideId}:rating5",
            action="LEG_RATING_5_STAR_BONUS",
            points=5,
            metadata={"ride_id": payload.rideId, "rating": payload.rating},
        )

    return AwardPointsResponse(
        points_earned=points_earned,
        source="backend",
        credited_driver_id=driver_id,
        idempotent=is_idempotent,
    )


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
                return AwardPointsResponse(
                    points_earned=concurrent,
                    source="backend",
                    credited_driver_id=driver_id,
                    idempotent=True,
                )

            before = _fetch_total_points(client, driver_id)
            new_total = before + points_to_add
            _update_points_balance(client, driver_id, new_total)

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
        logger.error("award_points failed: %s", exc)
        logger.error(tb)
        print(tb, file=sys.stderr, flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {exc!s}. Check Uvicorn terminal for full traceback.",
        ) from exc
