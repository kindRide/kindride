"""
SOS (emergency alert) router for KindRide.
Isolated module for emergency request handling.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
import httpx
import os

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _sos_limiter = Limiter(key_func=get_remote_address)
    _SLOWAPI_AVAILABLE = True
except ImportError:
    _sos_limiter = None
    _SLOWAPI_AVAILABLE = False

logger = logging.getLogger("kindride.sos")

sos_router = APIRouter(prefix="/sos", tags=["sos"])

# Twilio configuration (optional)
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_PHONE_NUMBER = os.getenv("TWILIO_FROM_PHONE_NUMBER", "").strip()
TWILIO_AVAILABLE = bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_PHONE_NUMBER)

# ── M6 SOS Spam Protection ────────────────────────────────────────────────────
# Cooldown is enforced via the database (sos_requests.created_at), not an
# in-memory dict, so it works correctly across multiple workers / load-balanced
# deployments. The old threading.Lock approach would silently fail under
# Gunicorn multi-process or Kubernetes multi-pod setups.
_SOS_COOLDOWN_SECONDS = 60


def _check_sos_cooldown_db(client: httpx.Client, user_id: str) -> None:
    """
    Raises 429 if the user has an sos_requests row created within the last
    60 seconds. Uses the database as the source of truth so this check is
    consistent across all worker processes.
    """
    from main import _service_headers, _rest_url

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=_SOS_COOLDOWN_SECONDS)).isoformat()
    try:
        r = client.get(
            _rest_url("/sos_requests"),
            params={
                "user_id": f"eq.{user_id}",
                "created_at": f"gte.{cutoff}",
                "select": "created_at",
                "order": "created_at.desc",
                "limit": "1",
            },
            headers=_service_headers(),
            timeout=10.0,
        )
        if r.status_code == 200:
            rows = r.json() if isinstance(r.json(), list) else []
            if rows:
                last_ts = datetime.fromisoformat(rows[0]["created_at"].replace("Z", "+00:00"))
                elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
                remaining = int(_SOS_COOLDOWN_SECONDS - elapsed)
                if remaining > 0:
                    raise HTTPException(
                        status_code=429,
                        detail=f"SOS cooldown active. Please wait {remaining}s before triggering again.",
                    )
    except HTTPException:
        raise
    except Exception as e:
        # If the DB check itself fails, log and allow through — never silently
        # block a genuine emergency because of a transient DB error.
        logger.warning("SOS cooldown DB check failed (allowing through): %s", e)
# ── End M6 ───────────────────────────────────────────────────────────────────


class SosLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class SendSOSRequest(BaseModel):
    """Emergency SOS alert."""

    location: SosLocation | None = None
    message: str | None = Field(default=None, max_length=500)


@sos_router.post("")
@(_sos_limiter.limit("5/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def send_sos(
    request: Request,
    payload: SendSOSRequest,
    authorization: str | None = Header(default=None),
):
    """Log emergency SOS event and return emergency contact info."""
    correlation_id = str(uuid4())

    # Import at function call time to avoid circular imports
    from main import _verify_user_bearer_token, _require_config, _service_headers, _rest_url

    try:
        _require_config()
        user_id = _verify_user_bearer_token(authorization)

        # M6: enforce per-user 60-second cooldown via DB (works across all workers)
        with httpx.Client() as cooldown_client:
            _check_sos_cooldown_db(cooldown_client, user_id)

        logger.warning(
            "SOS ALERT triggered",
            extra={
                "event_type": "sos_trigger",
                "correlation_id": correlation_id,
                "user_id": str(user_id),
                "status": "started",
                "location_present": payload.location is not None,
            }
        )

        # Persist SOS request to database
        try:
            with httpx.Client() as client:
                body = {
                    "user_id": user_id,
                    "location": payload.location.model_dump() if payload.location else None,
                    "message": payload.message,
                    "status": "initial",
                }
                r = client.post(
                    _rest_url("/sos_requests"),
                    headers={**_service_headers(), "Prefer": "return=minimal"},
                    json=body,
                    timeout=30.0,
                )
                if r.status_code not in (200, 201, 204):
                    logger.error(
                        "SOS persistence failed",
                        extra={
                            "event_type": "sos_trigger",
                            "correlation_id": correlation_id,
                            "user_id": str(user_id),
                            "status": "persistence_failed",
                            "http_status": r.status_code,
                            "response": r.text[:500],
                        }
                    )
                else:
                    logger.info(
                        "SOS persisted to database",
                        extra={
                            "event_type": "sos_trigger",
                            "correlation_id": correlation_id,
                            "user_id": str(user_id),
                            "status": "persisted",
                        }
                    )
        except Exception as e:
            logger.error(
                "SOS persistence error",
                extra={
                    "event_type": "sos_trigger",
                    "correlation_id": correlation_id,
                    "user_id": str(user_id),
                    "status": "persistence_error",
                    "error": str(e),
                }
            )

        # Send SMS alerts if Twilio is configured
        if TWILIO_AVAILABLE:
            try:
                from twilio.rest import Client
                client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
                loc_str = f"lat={payload.location.latitude}, lng={payload.location.longitude}" if payload.location else "unknown"
                message_body = f"KindRide SOS Alert at {datetime.now(timezone.utc).isoformat()}. Location: {loc_str}. Open KindRide admin panel for details."
                emergency_contacts_raw = os.getenv("SOS_EMERGENCY_CONTACTS", "").strip()
                sos_contacts = []
                for entry in emergency_contacts_raw.split(";"):
                    parts = entry.strip().split(",", 1)
                    if len(parts) == 2 and parts[1].strip():
                        sos_contacts.append({"name": parts[0].strip(), "phone": parts[1].strip()})
                if not sos_contacts:
                    logger.warning("SOS_EMERGENCY_CONTACTS not configured — no SMS sent.")
                seen_phones: set = set()
                for contact in sos_contacts:
                    if contact["phone"] in seen_phones:
                        continue
                    seen_phones.add(contact["phone"])
                    try:
                        message = client.messages.create(
                            body=message_body,
                            from_=TWILIO_FROM_PHONE_NUMBER,
                            to=contact["phone"]
                        )
                        logger.info(
                            "SOS SMS sent",
                            extra={
                                "event_type": "sos_trigger",
                                "correlation_id": correlation_id,
                                "user_id": str(user_id),
                                "status": "sms_sent",
                                "contact": contact["name"],
                                "message_sid": message.sid,
                            }
                        )
                    except Exception as sms_e:
                        logger.error(
                            "SOS SMS failed",
                            extra={
                                "event_type": "sos_trigger",
                                "correlation_id": correlation_id,
                                "user_id": str(user_id),
                                "status": "sms_failed",
                                "contact": contact["name"],
                                "error": str(sms_e),
                            }
                        )
            except ImportError:
                logger.warning(
                    "Twilio not installed, skipping SMS",
                    extra={
                        "event_type": "sos_trigger",
                        "correlation_id": correlation_id,
                        "user_id": str(user_id),
                        "status": "twilio_missing",
                    }
                )
            except Exception as twilio_e:
                logger.error(
                    "Twilio client error",
                    extra={
                        "event_type": "sos_trigger",
                        "correlation_id": correlation_id,
                        "user_id": str(user_id),
                        "status": "twilio_error",
                        "error": str(twilio_e),
                    }
                )
        else:
            logger.info(
                "Twilio not configured, skipping SMS",
                extra={
                    "event_type": "sos_trigger",
                    "correlation_id": correlation_id,
                    "user_id": str(user_id),
                    "status": "twilio_not_configured",
                }
            )
        logger.warning(
            "SOS ALERT processed",
            extra={
                "event_type": "sos_trigger",
                "correlation_id": correlation_id,
                "user_id": str(user_id),
                "status": "completed",
            }
        )

        return {
            "status": "alert_logged",
            "message": "Emergency alert sent. Stay calm and follow instructions.",
            "correlation_id": correlation_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.error(
            "SOS processing error",
            extra={
                "event_type": "sos_trigger",
                "correlation_id": correlation_id,
                "status": "error",
                "error": str(e),
            }
        )
        raise
