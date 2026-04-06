"""
SOS (emergency alert) router for KindRide.
Isolated module for emergency request handling.
"""

import logging
from datetime import datetime, timezone
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
