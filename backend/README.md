# KindRide Backend (FastAPI + Supabase)

The module docstring at the top of `main.py` explains JWT verification, idempotency, and why the service role key stays on the server only.

## Run Locally

1. Copy `backend/.env.example` to `backend/.env` and fill in values from Supabase (**Project URL**, **service_role** key, **JWT / JWKS** as documented in `.env.example`). Never commit `.env`.

2. In the Supabase SQL Editor, run these in order (skip any you already applied):

   - `supabase/points_schema.sql` (if not already)
   - `supabase/points_idempotency.sql` (`point_events.idempotency_key` + unique index)
   - `supabase/rides_schema.sql` (minimal `rides` for completion checks)
   - `supabase/passenger_ratings_schema.sql` (driver → passenger face ratings + cumulative reputation)
   - `supabase/journeys_multileg.sql` (journeys + `rides.journey_id` / `rides.leg_index`)
   - `supabase/rides_leg_distance.sql` (`rides.distance_miles`, `rides.was_zero_detour` — filled on complete)
   - `supabase/rides_geo.sql` (`rides.pickup_lat/lng`, `rides.destination_lat/lng`, `rides.destination_label`)
   - `supabase/rides_trip_time.sql` (`rides.started_at` + computed `trip_duration_*`)
   - `supabase/rides_lifecycle.sql` (nullable `driver_id`, `pending_driver_id`, request expiry, expanded `status` for search → request → accept)
   - `supabase/ride_trust_anchors.sql` (Feature 2: Proximity-Verified Trust Anchor schema)
   - `supabase/trip_analytics.sql` (Feature 3: Privacy-safe analytics logging pipeline)
   - `supabase/zk_route_commitments.sql` (Feature 5: Zero-Knowledge Route Commitment schema from the patent)
   - `supabase/ride_integrity.sql` (Feature 1: Anti-replay and anomaly detection flags)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

For phone testing on the same Wi‑Fi network, bind to all interfaces:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Set the app env var **`EXPO_PUBLIC_POINTS_API_URL`** to the **points award** URL (the app derives other paths from this):

```env
EXPO_PUBLIC_POINTS_API_URL=http://192.168.1.20:8000/points/award
```

Use a real Supabase **session access token** in the app (`Authorization: Bearer …`) where endpoints require auth.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Basic liveness check |
| `GET` | `/health/detailed` | System metrics and service status |
| `GET` | `/health/supabase` | PostgREST + service role check |
| `GET` | `/metrics` | Prometheus-style metrics |
| `GET` | `/logs/recent` | Recent application logs (debugging) |
| `GET` | `/matching/demo-drivers` | Demo driver list for testing |
| `GET` | `/matching/search` | Live matching (PostGIS RPC or `driver_presence` + haversine); optional `urgent=1`; **Match Score** sort (env `MATCH_ALPHA`, `MATCH_BETA`, `MATCH_GAMMA`) |
| `POST` | `/rides/start-search` | Passenger: upsert ride row in `searching` (requires JWT + applied `rides_lifecycle.sql`) |
| `POST` | `/rides/request-driver` | Passenger: target a driver UUID → `requested` only if they pass the same **eligibility** rules as `GET /matching/search` (available presence, fresh GPS, within 5 km pickup radius, heading matches trip corridor); then **one** Expo push to that driver’s `push_tokens` row (not a broadcast). Override with `KINDRIDE_RELAX_DRIVER_REQUEST_ELIGIBILITY=true` for local debugging. |
| `POST` | `/rides/respond` | Driver: accept (→ `accepted` + `driver_id`) or decline (→ `searching`) |
| `GET` | `/rides/status/{ride_id}` | Passenger, pending driver, or assigned driver: poll state |
| `POST` | `/journeys/register` | Start multi-leg journey |
| `POST` | `/journeys/complete` | End whole journey |
| `POST` | `/rides/complete` | Mark ride completed; awards base points |
| `POST` | `/points/rating-bonus` | Deferred +5 for 5-star rating |
| `POST` | `/points/award` | Legacy full award (prefer split flow) |
| `POST` | `/points/sync` | Ledger repair job (recalculates total from events) |
| `POST` | `/passengers/rate` | Driver rates passenger (face + comment) |
| `GET` | `/passengers/{id}/reputation` | Get passenger reputation score |
| `POST` | `/notifications/register-token` | Register Expo push token |
| `POST` | `/notifications/send` | Send push notification |
| `GET` | `/notifications/health` | Check notification service status |
| `POST` | `/sos` | Passenger SOS: persist alert + return contact payload |

### Quick `curl` (auth + service routes)

Replace `BASE` with your origin (e.g. `http://127.0.0.1:8000`) and `TOKEN` with a Supabase **access token** (same as the app `Authorization` header).

#### Push Notifications

**Register Expo push token** (passenger/driver signs in → app calls this):

```bash
curl -sS -X POST "http://127.0.0.1:8000/notifications/register-token" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "push_token": "ExponentPushToken[xxxxxx-yyyy-zzzz-wwwwwwwwwwww]"
  }'
```

**Response** (success):
```json
{"status": "registered"}
```

**Send notification to a user** (backend initiates; e.g., trip request):

```bash
curl -sS -X POST "http://127.0.0.1:8000/notifications/send" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "New ride request",
    "body": "A passenger needs a ride to downtown",
    "data": {
      "url": "/(tabs)/ride-request",
      "rideId": "00000000-0000-4000-8000-000000000001",
      "journeyId": "00000000-0000-4000-8000-000000000099"
    }
  }'
```

**Response** (success):
```json
{"status": "sent", "expo_response": [...]}
```

**Response** (user has no push token):
```json
{"status": "no_token", "message": "User has no registered push token"}
```

**Check notifications service health**:

```bash
curl -sS -X GET "http://127.0.0.1:8000/notifications/health"
```

**Response**:
```json
{"available": true, "service": "expo_push_notifications"}
```

---

#### Emergency SOS

**Trigger SOS** (passenger emergency → app calls with location + message):

```bash
curl -sS -X POST "http://127.0.0.1:8000/sos" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "latitude": 40.7480,
      "longitude": -73.9862
    },
    "message": "In immediate danger near Central Park"
  }'
```

**Response** (success):
```json
{
  "status": "alert_logged",
  "emergency_contacts": [
    {"name": "Emergency Services", "phone": "911"},
    {"name": "Local Police", "phone": "911"}
  ],
  "message": "Emergency services have been alerted. Stay calm and follow instructions.",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-28T15:30:45.123456+00:00"
}
```

**SOS Persistence**: Each SOS request creates a row in `public.sos_requests` with:
- `user_id` (from JWT)
- `location` (JSON: `{latitude, longitude}`)
- `message` (passenger's text)
- `status` ('initial' → 'acknowledged' → 'resolved')
- `created_at`, `updated_at`, `resolved_at`

---

#### Push Data Payload (Internal Contract)

When the backend sends notifications, the `data` object is passed to the app's notification listener (`lib/notifications/notificationResponseRouting.ts`):

```json
{
  "url": "/(tabs)/ride-request",
  "rideId": "uuid-of-ride",
  "journeyId": "uuid-optional",
  "legIndex": 0,
  "campaignId": "optional-tag-for-analytics"
}
```

- **`url`**: Expo Router path (e.g., `"/(tabs)"`). Listener calls `router.push(data.url)` on tap.
- **`rideId`**: Used by app to pre-populate context when deep linking to an active trip.
- **`journeyId`**: Multi-leg context (optional).
- **`campaignId`**: For future analytics / A/B testing (optional).

## Structured Logging & Debugging

**Notifications and SOS routes** emit structured logs for operational visibility—no PII (emails, phone numbers, full tokens, or message bodies) is logged in plain text.

### Log Fields (All Routes)

Each log entry includes:
- `event_type`: identifies the operation ('push_token_register', 'send_notification', 'sos_trigger')
- `status`: 'started', 'success', 'failed', 'error', 'skipped', 'persistence_failed'
- `correlation_id`: UUID for tracing a single request through the system
- `user_id`: opaque UUID (when applicable; safe to log)
- `http_status`: HTTP status code if applicable
- `error`: exception message (no sensitive data)

### Example Log Entry (Token Registration)

When a user signs in and registers a push token, you'll see:

```
2026-03-28 15:30:45,123 - kindride.notifications - INFO - Push token registration started (event_type=push_token_register, correlation_id=abc-123, user_id=550e..., status=started)
2026-03-28 15:30:45,456 - kindride.notifications - INFO - Push token registration completed (event_type=push_token_register, correlation_id=abc-123, user_id=550e..., status=success)
```

### Example Log Entry (SOS Trigger)

When a passenger taps SOS:

```
2026-03-28 15:35:22,111 - kindride.sos - WARNING - SOS ALERT triggered (event_type=sos_trigger, correlation_id=def-456, user_id=550e..., status=started, location_present=true)
2026-03-28 15:35:22,234 - kindride.sos - INFO - SOS persisted to database (event_type=sos_trigger, correlation_id=def-456, user_id=550e..., status=persisted)
2026-03-28 15:35:22,345 - kindride.sos - WARNING - SOS ALERT processed (event_type=sos_trigger, correlation_id=def-456, user_id=550e..., status=completed)
```

### Viewing Logs

**Live logs (streaming)**:
```bash
tail -f kindride.log
```

**Last 50 lines**:
```bash
tail -50 kindride.log
```

**Via API** (get JSON from backend):
```bash
curl -sS "http://127.0.0.1:8000/logs/recent?lines=100" | python -m json.tool
```

**For debugging in production**, use correlation IDs to trace a user's request:
```bash
grep "correlation_id=abc-123" kindride.log
```

---

## Database Schemas (Supabase)

Before using notifications or SOS, ensure these SQL migrations have been run in your Supabase SQL Editor:

| Feature | File | Purpose |
|---------|------|---------|
| Push notifications | `supabase/push_notifications.sql` | Stores user's Expo push tokens; supports idempotent upsert |
| SOS requests | `supabase/sos_requests.sql` | Logs emergency alerts with location, status, and timestamps |

---



### 1. PostGIS Spatial Matching
- **File**: `supabase/geospatial_postgis.sql`
- **Benefit**: Fast proximity queries using spatial indexes instead of manual distance calculations
- **Setup**: Enable PostGIS extension, run the SQL file
- **API**: `/matching/search` uses `find_nearby_drivers()` when the RPC exists; if PostgREST returns 404/error, the API falls back to `driver_presence` over REST plus haversine (same 5km / freshness rules).

### 2. Push Notifications
- **Package**: `expo-push-notifications` (add to requirements.txt)
- **Schema**: `supabase/push_notifications.sql` (push_tokens table)
- **Idempotency**: Token registration uses `Prefer: resolution=merge-duplicates` header, ensuring same (user_id, push_token) pair won't create duplicates. Supabase enforces uniqueness via composite key if needed.
- **Endpoints**:
  - `POST /notifications/register-token` - Store user's Expo push token
  - `POST /notifications/send` - Send notification to user
  - `GET /notifications/health` - Check service availability

### 3. Emergency SOS System
- **Schema**: `supabase/sos_requests.sql` (sos_requests table with RLS)
- **Idempotency**: Each SOS trigger creates a new row (no client-side deduplication). One row per tap is acceptable as long as failures are visible to user.
- **Endpoints**:
  - `POST /sos` - Trigger emergency alert with location and message
- **Security**: User can only create SOS requests for themselves (RLS policy)

### 4. Comprehensive Logging & Monitoring
- **Logging**: Structured logging with file output (`kindride.log`)
- **Health Checks**: 
  - `/health/detailed` - System metrics (CPU, memory, disk)
  - `/health/supabase` - Database connectivity
- **Metrics**: `/metrics` - Prometheus-compatible metrics endpoint
- **Debugging**: `/logs/recent` - View recent application logs

## Environment Variables

Add to `backend/.env`:

```env
# Existing variables...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Optional: Enable push notifications
# (Install expo-push-notifications package)
```

## Monitoring Setup

For production monitoring:

1. **Logs**: Application logs are written to `kindride.log`
2. **Metrics**: Expose `/metrics` endpoint to Prometheus
3. **Health**: Use `/health/detailed` for load balancer checks
4. **Alerts**: Monitor for:
   - High error rates in logs
   - Database connection failures
   - Memory/CPU usage spikes
| `POST` | `/passengers/rate` | Driver rates passenger (smile / neutral / sad + optional comment) |
| `GET` | `/passengers/{passenger_id}/reputation` | Aggregate score + count for a passenger |
| `GET` | `/matching/demo-drivers` | Auth required — placeholder driver list (replace with geo later) |
| `POST` | `/journeys/register` | Passenger JWT — register client `journeyId` (idempotent) |
| `POST` | `/journeys/complete` | Passenger JWT — mark whole journey completed (no more legs) |

**Distance source (mobile):** the app may fill `distanceMiles` from a **straight-line haversine** estimate between two GPS fixes (`expo-location`). Road distance is often larger; the backend only validates the numeric range.

**Maps (mobile):** Active Trip uses `react-native-maps` with `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` merged into native config via root `app.config.js` (run a **native rebuild** after changing the key or adding the dependency).

## Example: complete ride + rating bonus

Replace `YOUR_ACCESS_TOKEN` and UUIDs with real values:

```bash
curl -X POST "http://127.0.0.1:8000/rides/complete" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ^
  -d "{\"rideId\":\"00000000-0000-4000-8000-000000000001\",\"wasZeroDetour\":true,\"distanceMiles\":2.2,\"passengerId\":\"PASSENGER-USER-UUID\"}"
```

```bash
curl -X POST "http://127.0.0.1:8000/points/rating-bonus" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ^
  -d "{\"rideId\":\"00000000-0000-4000-8000-000000000001\",\"rating\":5}"
```

## Example: matching driver list (signed-in user)

```bash
curl -X GET "http://127.0.0.1:8000/matching/demo-drivers" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Example: rate passenger (after `rides` exists and is completed)

```bash
curl -X POST "http://127.0.0.1:8000/passengers/rate" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ^
  -d "{\"rideId\":\"00000000-0000-4000-8000-000000000001\",\"face\":\"smile\",\"comment\":null}"
```

## Implemented Security

1. Supabase access JWT verified (HS256 and/or JWKS); user id from `sub` where applicable.
2. Points idempotency: unique `(driver_id, idempotency_key)` on `point_events`.
3. Writes use `SUPABASE_SERVICE_ROLE_KEY` only on this server (PostgREST).
4. `rides` completion and `passenger_ratings` validated against completed rides where required.
