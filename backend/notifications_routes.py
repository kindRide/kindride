"""
Push notifications router for KindRide.
Isolated module for Expo push notification handling.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
import httpx

logger = logging.getLogger("kindride.notifications")

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _notif_limiter = Limiter(key_func=get_remote_address)
    _SLOWAPI_AVAILABLE = True
except ImportError:
    _notif_limiter = None
    _SLOWAPI_AVAILABLE = False

notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])

EXPO_NOTIFICATIONS_AVAILABLE = True  # uses Expo Push API over HTTP — no library needed


def _send_expo_push_notif(messages: list[dict]) -> dict:
    """Send push notifications via Expo Push API."""
    if not messages:
        return {"status": "no_messages"}
    try:
        import httpx as _httpx
        with _httpx.Client() as client:
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
        logger.warning("Expo push HTTP error: %s", str(exc))
        return {"error": str(exc)}


class RegisterPushTokenRequest(BaseModel):
    """Register Expo push token for a user."""

    push_token: str = Field(description="Expo push token from the device")

    @field_validator("push_token")
    @classmethod
    def validate_push_token(cls, v: str) -> str:
        if not v.startswith("ExponentPushToken["):
            raise ValueError("Invalid Expo push token format")
        return v


class SendNotificationRequest(BaseModel):
    """Send push notification to a user."""

    user_id: str = Field(description="Supabase user ID to send notification to")
    title: str
    body: str
    data: dict | None = None

    @field_validator("user_id")
    @classmethod
    def user_id_must_be_uuid(cls, v: str) -> str:
        UUID(v)
        return v


@notifications_router.post("/register-token")
@(_notif_limiter.limit("5/minute") if _SLOWAPI_AVAILABLE else lambda f: f)
def register_push_token(
    request: Request,
    payload: RegisterPushTokenRequest,
    authorization: str | None = Header(default=None),
):
    """Store user's Expo push token for sending notifications."""
    correlation_id = str(uuid4())

    # Import at function call time to avoid circular imports
    from main import _verify_user_bearer_token, _service_headers, _rest_url, _require_config

    try:
        _require_config()
        user_id = _verify_user_bearer_token(authorization)

        logger.info(
            "Push token registration started",
            extra={
                "event_type": "push_token_register",
                "correlation_id": correlation_id,
                "user_id": str(user_id),
                "status": "started",
            }
        )

        with httpx.Client() as client:
            # Upsert push token for user
            r = client.post(
                _rest_url("/push_tokens"),
                headers={**_service_headers(), "Prefer": "resolution=merge-duplicates"},
                json={
                    "user_id": user_id,
                    "push_token": payload.push_token,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                timeout=30.0,
            )
            if r.status_code not in (200, 201, 204):
                logger.error(
                    "Push token registration failed",
                    extra={
                        "event_type": "push_token_register",
                        "correlation_id": correlation_id,
                        "user_id": str(user_id),
                        "status": "failed",
                        "http_status": r.status_code,
                        "response": r.text[:500],  # Truncate long responses
                    }
                )
                raise HTTPException(status_code=502, detail=f"Push token registration failed: {r.text}")

        logger.info(
            "Push token registration completed",
            extra={
                "event_type": "push_token_register",
                "correlation_id": correlation_id,
                "user_id": str(user_id),
                "status": "success",
            }
        )
        return {"status": "registered"}

    except Exception as e:
        logger.error(
            "Push token registration error",
            extra={
                "event_type": "push_token_register",
                "correlation_id": correlation_id,
                "status": "error",
                "error": str(e),
            }
        )
        raise


@notifications_router.post("/send")
def send_notification(
    payload: SendNotificationRequest,
    authorization: str | None = Header(default=None),
):
    """Send push notification to a user (founder-only)."""
    correlation_id = str(uuid4())

    # Import at function call time to avoid circular imports
    from main import _verify_user_bearer_token, _service_headers, _rest_url, _rest_json_list, _require_config, _FOUNDER_IDS

    try:
        _require_config()
        sender_id = _verify_user_bearer_token(authorization)
        if not _FOUNDER_IDS or sender_id not in _FOUNDER_IDS:
            from fastapi import HTTPException as _HTTPException
            raise _HTTPException(status_code=403, detail="Founder access required")

        logger.info(
            "Send notification started",
            extra={
                "event_type": "send_notification",
                "correlation_id": correlation_id,
                "sender_id": str(sender_id),
                "target_user_id": payload.user_id,
                "status": "started",
            }
        )

        if not EXPO_NOTIFICATIONS_AVAILABLE:
            logger.warning(
                "Send notification failed: Expo not available",
                extra={
                    "event_type": "send_notification",
                    "correlation_id": correlation_id,
                    "sender_id": str(sender_id),
                    "target_user_id": payload.user_id,
                    "status": "failed",
                    "reason": "expo_not_configured",
                }
            )
            raise HTTPException(status_code=503, detail="Push notifications not configured")

        with httpx.Client() as client:
            # Get user's push token
            r = client.get(
                _rest_url("/push_tokens"),
                params={"user_id": f"eq.{payload.user_id}", "select": "push_token", "limit": "1"},
                headers=_service_headers(),
                timeout=30.0,
            )
            if r.status_code != 200:
                logger.warning(
                    "Send notification failed: Token lookup error",
                    extra={
                        "event_type": "send_notification",
                        "correlation_id": correlation_id,
                        "sender_id": str(sender_id),
                        "target_user_id": payload.user_id,
                        "status": "failed",
                        "reason": "token_lookup_failed",
                        "http_status": r.status_code,
                    }
                )
                raise HTTPException(status_code=502, detail=f"Push token lookup failed: {r.text}")
            rows = _rest_json_list(r, "push_tokens select")
            if not rows:
                logger.info(
                    "Send notification skipped: No token",
                    extra={
                        "event_type": "send_notification",
                        "correlation_id": correlation_id,
                        "sender_id": str(sender_id),
                        "target_user_id": payload.user_id,
                        "status": "skipped",
                        "reason": "no_token",
                    }
                )
                return {"status": "no_token", "message": "User has no registered push token"}

            push_token = rows[0]["push_token"]

            # Send notification
            try:
                response = _send_expo_push_notif([{
                    "to": push_token,
                    "title": payload.title,
                    "body": payload.body,
                    "sound": "default",
                    "data": payload.data or {},
                }])
                logger.info(
                    "Send notification completed",
                    extra={
                        "event_type": "send_notification",
                        "correlation_id": correlation_id,
                        "sender_id": str(sender_id),
                        "target_user_id": payload.user_id,
                        "status": "success",
                        "expo_response": str(response)[:200],  # Truncate if long
                    }
                )
                return {"status": "sent", "expo_response": response}
            except Exception as e:
                logger.error(
                    "Send notification failed: Expo error",
                    extra={
                        "event_type": "send_notification",
                        "correlation_id": correlation_id,
                        "sender_id": str(sender_id),
                        "target_user_id": payload.user_id,
                        "status": "failed",
                        "reason": "expo_error",
                        "error": str(e),
                    }
                )
                raise HTTPException(status_code=502, detail=f"Expo notification failed: {str(e)}")

    except Exception as e:
        logger.error(
            "Send notification error",
            extra={
                "event_type": "send_notification",
                "correlation_id": correlation_id,
                "status": "error",
                "error": str(e),
            }
        )
        raise


@notifications_router.get("/health")
def notifications_health():
    """Check if push notifications are configured."""
    return {
        "available": EXPO_NOTIFICATIONS_AVAILABLE,
        "service": "expo_push_notifications" if EXPO_NOTIFICATIONS_AVAILABLE else None
    }
