# KindRide Backend (Session 6 Starter)

## Run Locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

For phone testing on the same Wi-Fi network, run with host binding:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Then set app env var `EXPO_PUBLIC_POINTS_API_URL` to your laptop LAN IP, e.g.:

```env
EXPO_PUBLIC_POINTS_API_URL=http://192.168.1.20:8000/points/award
```

## Endpoints

- `GET /health`
- `POST /points/award`

## Example Request

```bash
curl -X POST "http://127.0.0.1:8000/points/award" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer test-token" ^
  -d "{\"rideId\":\"demo-ride-001\",\"rating\":5,\"wasZeroDetour\":true,\"distanceMiles\":2.2}"
```

## Next Security Steps

1. Verify Supabase JWT token server-side.
2. Validate ride ownership and completion state.
3. Add idempotency key by `rideId`.
4. Write to `point_events` + `points` with service role key.
