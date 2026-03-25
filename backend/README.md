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
| `GET` | `/health` | Liveness |
| `GET` | `/health/supabase` | PostgREST + service role check |
| `POST` | `/rides/complete` | Mark ride completed; `distanceMiles` (0.1–500), `wasZeroDetour`; optional `passengerId`, `journeyId`, `legIndex`; writes leg metrics + awards base points |
| `POST` | `/points/rating-bonus` | Deferred +5 for 5-star driver rating (after trip) |
| `POST` | `/points/award` | Legacy full award in one call (prefer split flow above) |
| `POST` | `/passengers/rate` | Driver rates passenger (smile / neutral / sad + optional comment) |
| `GET` | `/passengers/{passenger_id}/reputation` | Aggregate score + count for a passenger |
| `GET` | `/matching/demo-drivers` | Auth required — placeholder driver list (replace with geo later) |
| `POST` | `/journeys/register` | Passenger JWT — register client `journeyId` (idempotent) |
| `POST` | `/journeys/complete` | Passenger JWT — mark whole journey completed (no more legs) |

**Distance source (mobile):** the app may fill `distanceMiles` from a **straight-line haversine** estimate between two GPS fixes (`expo-location`). Road distance is often larger; the backend only validates the numeric range.

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

## Still TODO (later sessions)

- If `PATCH points` fails after `point_events` insert, add a repair job or transactional RPC.
- Tighten `GET /passengers/.../reputation` to matched / in-trip context only.
