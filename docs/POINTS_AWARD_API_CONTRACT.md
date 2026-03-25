# Points Award API Contract (Session 5)

This is the backend contract that the mobile app now expects for secure point awarding.

## Endpoint

- Method: `POST`
- URL: value from `EXPO_PUBLIC_POINTS_API_URL`
- Auth: Bearer token (Supabase access token) - required in production

## Request Body

```json
{
  "rideId": "demo-ride-001",
  "driverId": "optional-driver-uuid",
  "rating": 5,
  "wasZeroDetour": true,
  "distanceMiles": 2.2
}
```

## Response Body

```json
{
  "points_earned": 15,
  "source": "backend",
  "idempotent": false,
  "credited_driver_id": "a6cf26a4-2a23-4dc0-a2c0-fe1d355f198b"
}
```

- `idempotent`: `true` when this trip was **already** awarded before (retry / duplicate request). Points balance is not increased again; `points_earned` matches the original award for that ride.

## Backend Security Requirements

1. Validate JWT and derive user id server-side.
2. Ignore client-provided driver id if it does not match token user.
3. Validate ride state is completed before awarding.
4. Prevent duplicates with idempotency key per ride (store `rideId` as `idempotency_key` on `point_events`; unique per driver).
5. Write point events + totals with service role only.

## App Behavior

- By default, if endpoint is not configured or fails, app falls back to local points calculation (so the UI stays responsive).
- If you set `EXPO_PUBLIC_POINTS_REQUIRE_BACKEND=true` in `KindRide/.env`, the app will NOT use local fallback. Instead, it will show an error when backend awarding fails (unauthorized, network/server error, or timeout).
- Production hardening: backend is now REQUIRED by default.
  - To re-enable local fallback for debugging, set `EXPO_PUBLIC_POINTS_REQUIRE_BACKEND=false` in `KindRide/.env`.
