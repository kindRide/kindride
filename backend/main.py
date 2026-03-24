from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(title="KindRide Points API", version="0.1.0")

# Dev CORS setup so Expo web/mobile can call local backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AwardPointsRequest(BaseModel):
    rideId: str = Field(min_length=3)
    driverId: str | None = None
    rating: int = Field(ge=1, le=5)
    wasZeroDetour: bool
    distanceMiles: float = Field(ge=0)


class AwardPointsResponse(BaseModel):
    points_earned: int
    source: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/points/award", response_model=AwardPointsResponse)
def award_points(
    payload: AwardPointsRequest,
    authorization: str | None = Header(default=None),
):
    # Security gate: require bearer token in production.
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid bearer token")

    # Placeholder scoring logic (server-side source of truth).
    # Replace with DB-backed validation and writes:
    # - validate ride belongs to driver and is completed
    # - enforce idempotency per ride
    # - write point_events and points total using service role
    base_points = 10
    five_star_bonus = 5 if payload.rating == 5 else 0
    zero_detour_bonus = 0  # reserved for next iteration
    points_earned = base_points + five_star_bonus + zero_detour_bonus

    return AwardPointsResponse(points_earned=points_earned, source="backend")
