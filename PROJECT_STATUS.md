# KindRide - Project Status

Last updated: 2026-03-25 (Week 2 Session 20)
Owner: Oluwafemi Adebayo Adeyemi

## Current Build State

Week 1 is complete.
Week 2 Session 1 is complete.
Week 2 Session 2 is complete.
Week 2 Session 3 is complete.
Week 2 Session 4 is complete.
Week 2 Session 5 is complete.
Week 2 Session 6 is complete.
Week 2 Session 7 is complete.
Week 2 Session 8 is complete.
Week 2 Session 9 is complete.
Week 2 Session 10 is complete.
Week 2 Session 11 is complete.
Week 2 Session 12 is complete.
Week 2 Session 13 is complete.
Week 2 Session 15 is complete.
Week 2 Session 16 is complete.
Week 2 Session 17 is complete.
Week 2 Session 18 is complete.
Week 2 Session 19 is complete.

Working app flow (phone-tested):
1. Home screen (`app/(tabs)/index.tsx`)
2. Ride Request screen (`app/(tabs)/ride-request.tsx`)
3. Active Trip screen (`app/active-trip.tsx`)
4. (Sometimes) Rate passenger screen (`app/rate-passenger.tsx`) — about 1 in 5 trips, deterministic from `rideId`
5. Post-Trip Rating screen (`app/post-trip-rating.tsx`); multi-leg: Find next driver / destination
6. (Optional) Next leg driver search (`app/next-leg-request.tsx`) — same `journeyId`, incremented `legIndex`
7. Back to Home after submission
8. Driver rating bonus (+5 on 5 stars) from backend after post-trip submit
9. Points tab screen (`app/(tabs)/points.tsx`)

## What Is Implemented

- Expo Router navigation working
- Driver matching list (intent badges) with server source when signed in:
  - `GET /matching/demo-drivers` (placeholder data; same shape as embedded fallback)
  - "Already heading your way" / "Willing to detour"
- Ride request scanning/loading UI
- Active trip mock UI:
  - status text
  - boarding countdown timer
  - SOS button (UI only for now)
  - multi-leg label + “change driver” when `journeyId` is present (signed-in passenger)
  - GPS-assisted leg miles (foreground): save pickup position, set drop-off from current position → fills miles using haversine straight-line (`expo-location` + `lib/haversine-miles.ts`); user can still edit before End Trip
- Rating UI:
  - 1-5 stars
  - optional review text
  - submit + skip + back to home
  - local points reward message after submit
- Starter Points tab:
  - current tier and total points from Supabase read path
  - local fallback when not authenticated/unavailable
  - progress bar toward next tier
  - point history list (local or Supabase source)
  - role-safe UI guard (driver-focused points actions)
  - secure sign-in card for authenticated points access
- Backend-ready points award service:
  - `lib/points-award.ts` for secure write-path integration
  - fallback to local calculation when API unavailable
  - API contract doc (`docs/POINTS_AWARD_API_CONTRACT.md`)
- FastAPI backend (idempotent awards):
  - `backend/main.py` with `/health` and `/points/award`
  - Supabase JWT verification, server-side scoring, service-role writes
  - `point_events` insert + `points` balance/tier update; duplicate `rideId` returns `idempotent: true`
  - SQL migration `supabase/points_idempotency.sql`; `backend/.env.example` and run guide (`backend/README.md`)
- Founder-friendly fallback diagnostics:
  - Post-trip screen now explains why local fallback happened (not signed in vs backend/network issue)
  - Points tab now displays the same fallback reason so device-specific auth issues are obvious
  - Backend has `/health/supabase` diagnostic to verify service-role access quickly

## Not Implemented Yet (Planned)

- Full app-wide Supabase authentication flow (only points screen has minimal auth currently)
- Real map / road routing and live tracking (app has straight-line GPS estimate only for now)
- Real geo / availability matching (replace `/matching/demo-drivers` implementation)
- Push notifications
- Real SOS integrations (Twilio/contacts)
- Real trip `rideId` from app navigation state (wired Active Trip → Post Trip Rating)
- Driver identity verification
- In-app camera recording and retention policy

## Week Tracking

Week 1:
- Sessions completed: 5/5
- Goal achieved: yes

Week 2:
- Session 1 completed: yes
  - Local points reward after rating: done
  - Starter Points screen: done
  - Phone flow stability check: passed
- Session 2 completed: yes
  - Local point history list (mock): done
  - Role-safe points UI guard: done
  - Phone test: passed
- Session 3 completed: yes
  - Added Supabase points SQL schema (`supabase/points_schema.sql`)
  - Added RLS policies for points and point_events
  - Added secure points architecture doc (`docs/SECURE_POINTS_FLOW.md`)
- Session 4 completed: yes
  - Ran SQL in Supabase and validated table creation
  - Wired points tab Supabase read integration
  - Added secure sign-in gate and preserved local fallback
  - Final UI cleanup after verification (removed temporary diagnostics)
- Session 5 completed: yes
  - Added backend-ready points award service layer
  - Wired post-rating submit to backend-ready interface with fallback
  - Added points award API contract documentation
- Session 6 completed: yes
  - Implemented FastAPI points award starter endpoint
  - Added auth-token forwarding from app request headers
  - Added backend setup docs and local run instructions
- Session 7 completed: yes
  - Backend verifies Supabase JWT and derives `driver_id` from `sub`
  - Service role writes: `point_events` (+ `idempotency_key`), `points` total + tier
  - Race-safe idempotency: only the request that wins the insert updates the balance
  - Migration `supabase/points_idempotency.sql`; founder-oriented comments in `main.py`
- Session 8 completed: yes
  - Validated end-to-end mobile flow: phone uses Backend API when signed in; local fallback when unauthorized
  - Added explicit fallback reasons in app UI to reduce debugging guesswork
  - Added backend `/health/supabase` endpoint and clearer config error messages for `.env` issues
- Session 9 completed:
  - Pass real `rideId` from trip flow into post-trip rating (backend idempotency uses it)
  - Keep local fallback for now (so you can still debug during backend rollout)
- Session 10 completed:
  - Generate a real UUIDv4 `rideId` and store it in `point_events.ride_id` (UUID column)
  - Backend writes remain idempotent via `idempotency_key = rideId`
- Session 11 completed:
  - Fix driver display wiring (Ride Request → Active Trip → Post Trip Rating)
  - Show the `credited_driver_id` returned by the backend to remove confusion about which account received points

- Session 12 completed:
  - Added `EXPO_PUBLIC_POINTS_REQUIRE_BACKEND=true` toggle to disable local fallback and surface backend errors
  - Kept the next focus: validate ride completion/ownership server-side when the `rides` table exists
- Session 13 completed:
  - Production hardening + debug clarity: when backend fails, show backend error detail instead of only generic fallback
  - Backend awards now also validate ride completion (`/rides/complete` + points/award check)
- Session 14 completed:
  - Updated points scoring to match blueprint Step 17:
    - base 10 points
    - distance bonus = 1 point per mile
    - zero-detour multiplier = 1.5x
    - 5-star rating adds +5 after multiplier
  - Kept local fallback formula consistent for debugging alignment
  - Founder note: `distanceMiles` means the passenger's trip distance (pickup -> dropoff) used for the distance points bonus.
    Session 19+: miles are entered on Active Trip per leg (pickup→dropoff segment). Session 20: optional haversine fill from device GPS; road distance often higher than straight-line.
  - Scoring example (2.2 miles, 5 stars, zero-detour=true):
    - base + distance = 10 + (2.2 * 1) = 12.2
    - apply 1.5x multiplier => 12.2 * 1.5 = 18.3
    - add 5-star bonus => 18.3 + 5 = 23.3
    - round to integer => 23 points
- Session 15 completed:
  - Implemented non-blocking leg flow:
    - `/rides/complete` now awards base leg points immediately (base + distance, with zero-detour multiplier)
    - `/points/rating-bonus` now awards only deferred +5 bonus for 5-star ratings
  - Updated app flow:
    - Active Trip sends distance/zero-detour at ride completion
    - Post-trip rating now displays rating bonus points from backend
- Session 16 completed:
  - Driver → passenger face ratings (smile / neutral / sad → +1 / 0 / −1) with optional comment (max 500 chars)
  - SQL: `supabase/passenger_ratings_schema.sql` — run in Supabase SQL Editor (tables + trigger updating cumulative `passenger_reputation`)
  - Backend: optional `passengerId` on `POST /rides/complete`; `POST /passengers/rate`; `GET /passengers/{passenger_id}/reputation`
  - App: signed-in requester UUID passed as `passengerId`; ~1-in-5 trips open rate-passenger before driver star rating; active trip shows passenger community score when available
  - Session 16 follow-up (finish): centralized `lib/backend-api-urls.ts` + `lib/backend-error.ts` (strict URL + FastAPI error parsing); `backend/README.md` updated to list all endpoints and SQL order
- Session 17 completed:
  - Backend `GET /matching/demo-drivers` (JWT required): server-owned driver list placeholder for real matching later
  - App: `lib/matching-drivers.ts` (fallback + JSON validation); Ride Request fetches list after scan when signed in; offline / 401 keeps embedded fallback
- Session 18 completed:
  - Multi-leg handoffs: `public.journeys` + `rides.journey_id` / `rides.leg_index` (`supabase/journeys_multileg.sql`)
  - `POST /journeys/register` (passenger JWT), `POST /journeys/complete` (end whole trip), `POST /rides/complete` accepts optional `journeyId` + `legIndex` with passenger/journey validation
  - App: new `journeyId` per Ride Request when signed in (`lib/journey-id.ts`); `next-leg-request` screen; post-trip flow can chain legs or close journey
- Session 19 completed:
  - Per-leg distance: Active Trip collects miles (0.1–500) and detour toggle (default from driver card intent); values stored on `rides` via `supabase/rides_leg_distance.sql` + `POST /rides/complete`
  - Backend API v0.6.0: validates leg miles; base points use entered `distanceMiles` and `wasZeroDetour`
  - `lib/points-award` calls `/points/rating-bonus` with `{ rideId, rating }` only; completed leg miles still passed through navigation for display / future UI
- Session 20 completed:
  - Active Trip: `expo-location` foreground permission + “Save pickup GPS” / “Set drop-off GPS → miles” using haversine miles (`lib/haversine-miles.ts`); `app.json` plugin with usage strings
  - No backend change: `POST /rides/complete` still receives `distanceMiles` (edited or GPS-filled). Rebuild dev client / store builds after native dependency add

## Security-First Checklist (Always On)

Application security:
- Do not hardcode secrets in source files
- Use environment variables for keys
- Enforce role checks for driver/passenger views
- Use least-privilege access in backend/database

Data security:
- Enable RLS on all user-related tables
- Restrict read/write to authorized user records only
- Log sensitive actions (SOS, moderation, bans)

Passenger and driver safety:
- Keep SOS as one-tap and reliable
- Add emergency contact validation
- Add report/flag flow with admin review queue
- Add no-show/cancellation abuse controls

Operations:
- Commit to GitHub after each session
- Test every major change on real phone
- Keep this file updated at end of each session

## Resume Prompt (Copy/Paste for Next Session)

"We are continuing KindRide. Read PROJECT_STATUS.md first. Next session ideas: optional road distance (OSRM / Directions API), or persist `pickup_lat/lng` / `dropoff_lat/lng` on `rides` if you want auditability."
