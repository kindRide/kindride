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
  "points_earned": 15
}
```

## Backend Security Requirements

1. Validate JWT and derive user id server-side.
2. Ignore client-provided driver id if it does not match token user.
3. Validate ride state is completed before awarding.
4. Prevent duplicates with idempotency key per ride.
5. Write point events + totals with service role only.

## App Behavior

- If endpoint is not configured or fails, app falls back to local points calculation.
- Fallback keeps UI responsive during backend rollout.
