# Secure Points Flow (Week 2 Session 3)

This document defines the secure data flow for points in KindRide.

## Goal

Move from local/demo points to persistent points in Supabase **without letting clients self-award points**.

## Threat To Prevent

If the mobile app can directly insert `point_events`, a malicious user can fake points.

## Secure Architecture

1. Mobile app sends a trusted event request to backend (FastAPI), e.g. `trip_completed`.
2. Backend validates:
   - authenticated user identity
   - user role is `driver`
   - ride ownership and ride state (completed)
   - rating value and eligibility rules
3. Backend calculates points server-side.
4. Backend writes:
   - append row(s) to `point_events`
   - update `points.total_points`, `tier`, `last_updated`
5. Mobile app only reads points and event history.

## Database Rules (RLS)

- `points`: user can `select` only own row (`auth.uid() = driver_id`)
- `point_events`: user can `select` only own rows
- Client insert/update/delete on `point_events`: denied
- Point awarding inserts/updates: backend service role only

## Minimum Backend Endpoints

1. `POST /points/award`
   - Input: `ride_id`, `driver_id`, `rating`, `was_zero_detour`, `distance_miles`
   - Validates event integrity
   - Writes events and updates total

2. `GET /points/me`
   - Returns current balance and tier for logged-in user

3. `GET /points/me/events`
   - Returns paginated event history

## Tier Rule (Current)

- Helper: `< 100`
- GoodSamaritan: `< 300`
- Champion: `< 600`
- Leader: `< 1000`
- Elite: `>= 1000`

## Week 2 Integration Plan

1. Keep current local UI.
2. Add Supabase reads in `points.tsx` behind feature flag.
3. Replace local submit reward with backend call.
4. Show backend response in points screen.
5. Keep local fallback if backend unavailable.

## Security Notes

- Never store service role keys in mobile app.
- Keep all scoring logic in backend (single source of truth).
- Log suspicious events (rapid repeats, impossible ride states).
- Add idempotency key per award request to prevent duplicate awards.
