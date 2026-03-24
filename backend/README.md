# KindRide Backend (Session 7 — Idempotent Supabase writes)

The module docstring at the top of `main.py` explains the flow for a non-programmer founder: JWT verification, idempotency, and why the service role key stays on the server only.

## Run Locally

1. Copy `backend/.env.example` to `backend/.env` and fill in three values from Supabase (**Project URL**, **service_role** key, **JWT Secret**). Never commit `.env`.

2. In the Supabase SQL Editor, run **`supabase/points_schema.sql`** (if not already), then **`supabase/points_idempotency.sql`** so `point_events` has an `idempotency_key` column and a unique index per driver + ride.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

For phone testing on the same Wi-Fi network, bind to all interfaces:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Set the app env var `EXPO_PUBLIC_POINTS_API_URL` to your laptop LAN IP, e.g.:

```env
EXPO_PUBLIC_POINTS_API_URL=http://192.168.1.20:8000/points/award
```

Use a **real** Supabase **anon JWT** in the app, and sign in on the Points flow so the post-rating call can send `Authorization: Bearer <access_token>`.

## Endpoints

- `GET /health`
- `POST /points/award` — verifies JWT, awards once per (`driver`, `rideId`), updates `points` total + tier via service role

## Example Request

Replace `YOUR_ACCESS_TOKEN` with a token from a signed-in Supabase session:

```bash
curl -X POST "http://127.0.0.1:8000/points/award" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ^
  -d "{\"rideId\":\"demo-ride-001\",\"rating\":5,\"wasZeroDetour\":true,\"distanceMiles\":2.2}"
```

Repeat the same `rideId` and token: the second response returns the same `points_earned` with `"idempotent": true` and does not double the balance.

## Implemented Security

1. Supabase access JWT verified with `SUPABASE_JWT_SECRET`; driver id taken from token `sub`.
2. Idempotency: unique `(driver_id, idempotency_key)` on `point_events` (`idempotency_key` = `rideId` from the request).
3. Writes use `SUPABASE_SERVICE_ROLE_KEY` only on this server (PostgREST).

## Still TODO (later sessions)

- Validate ride completion / ownership against a real `rides` table.
- If `PATCH points` fails after `point_events` insert, add a repair job or single DB transaction/RPC.
