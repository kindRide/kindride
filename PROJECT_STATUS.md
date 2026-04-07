# KindRide - Project Status

Last updated: 2026-04-07 (Session 45: Driver screen v2 — power button hero, earnings strip, vibe badges, community counter)
Owner: Oluwafemi Adebayo Adeyemi

## Product north star (Founder Blueprint v1.1)

**What KindRide is:** A **free** humanitarian rideshare platform—passengers never pay fares; drivers are motivated by **Humanitarian Points** (non-transferable social capital), not extractive pricing.

**Real problem being solved:** **Transportation inequity** (students, workers, patients who cannot afford to move) meets **wasted empty-seat capacity** on routes people already drive. KindRide is the structured, safe, incentivized bridge—starting with high-density pilots (e.g. campus).

**Core IP (build server-side; do not expose in client):** **Route-corridor style matching** plus a weighted **Match Score** (route alignment, pickup distance, time sensitivity) and the **Driver Intent Model** (zero-detour prioritized; higher points multiplier for pure “already going this way” intent). The live app already reflects **intent visibility** and **zero-detour priority** in UX; **numeric Score parity and full corridor economics** are still engineering work.

**Safety promise (7 layers in the blueprint):** Identity, in-app trip recording, SOS, live trip share, mutual ratings, progressive trust, community flagging (+ later anomaly detection / background checks). The codebase has **pieces** (ratings, SOS API, maps, points); **several layers are not production-complete**—see P0–P2.

**Platform evolution:** Launch as a ride app; long-term vision is **verified generosity / civic credential** data—out of scope for near-term sprints except where we lay **audit-grade** data and trust foundations.

*Source document on file:* `KindRide_FOUNDER_Blueprint_v1.1-latest.pdf` (confidential). This file summarizes alignment only.

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
Week 2 Session 20 is complete.
Week 2 Session 21 is complete.
Week 2 Session 22 is complete.
Week 2 Session 23 is complete.
Week 2 Session 24 is complete.
Week 2 Session 25 is complete.
Week 2 Session 26 is complete (planning / `PROJECT_STATUS` alignment with Founder Blueprint v1.1).
Week 2 Session 27 is complete.
Week 2 Session 28 is complete.
Week 2 Session 29 is complete.
Week 2 Session 30 is complete.
Week 2 Session 31 is complete (Driver Dashboard, GPS heartbeat, Points bonuses).
Week 2 Session 32 is complete (Re-broadcast policy: 5m radius widen, 15m guidance).
Week 2 Session 33 is complete (Active Trip Live Tracking).
Week 2 Session 34 is complete (Progressive Trust visibility caps).
Week 2 Session 35 is complete (Inbound Notifications Polish).
Week 2 Session 36 is complete (Admin / Moderation Shell).
Week 2 Session 37 is complete (P1 Geo Schema — dropoff_lat/lng, analytics integrity).
Week 2 Session 38 is complete (P1 Security — Recording Consent + SessionRecorder component).
Week 2 Session 39 is complete (P0 Ride State Machine — full lifecycle transitions).
Week 2 Session 40 is complete (P2.1–P2.3: Stripe Identity, Trip Recording metadata, Anomaly Detection).
Week 2 Session 41 is complete (P2.4–P2.5: Founding Driver Badge, Hub Onboarding, EAS Build, Onboarding Slides, Security Checklist).
Week 2 Session 42 is complete (World-class UI redesign — all 5 main tabs + auth screens).
Week 2 Session 43 is complete (Git backup, PROJECT_STATUS sync, blueprint alignment check).
Week 2 Session 44 is complete (Innovation directive — animated splash, Home screen v2 with shimmer/stories/haptics/count-up, INNOVATIONS.md log created).
Week 2 Session 45 is complete (Driver screen v2 — power button hero, earnings strip, vibe badges on ride cards, community counter, Reanimated4 pulse ring).

Working app flow (phone-tested):
1. Home screen (`app/(tabs)/index.tsx`)
2. Ride Request screen (`app/(tabs)/ride-request.tsx`)
3. Active Trip screen (`app/active-trip.tsx`) — passenger ends trip → `POST /rides/complete`
4. Post-Trip Rating screen (`app/post-trip-rating.tsx`) — **passenger** rates driver; `POST /points/rating-bonus` uses **passenger** JWT and credits **assigned driver**; multi-leg: Find next driver / destination
5. (Optional) Next leg driver search (`app/next-leg-request.tsx`) — same `journeyId`, incremented `legIndex`
6. **Driver** (`app/(tabs)/driver.tsx`): Full dashboard with availability toggle, intent/heading controls, live presence GPS heartbeat, and incoming ride auto-polling. Rate passenger CTA appears post-trip.
7. Points tab screen (`app/(tabs)/points.tsx`)

## What Is Implemented

- Expo Router navigation working
- Driver matching list (intent badges) with server source when signed in:
  - `GET /matching/demo-drivers` (placeholder data; same shape as embedded fallback)
  - "Already heading your way" / "Willing to detour"
- Ride request scanning/loading UI
- Active trip mock UI:
  - status text
  - boarding countdown timer
  - SOS button → `/sos` flow (client + `POST /sos` persistence; SMS/contacts not production-complete—see P0)
  - multi-leg label + “change driver” when `journeyId` is present (signed-in passenger)
  - single-leg copy clarity: “Trip miles …” label when journey is not multi-leg
  - GPS-assisted leg miles (foreground): save pickup position, set drop-off from current position → fills miles using haversine straight-line (`expo-location` + `lib/haversine-miles.ts`); user can still edit before End Trip
  - Active Trip map (`react-native-maps`): pickup/drop-off markers + straight-line polyline on iOS/Android; `app.config.js` injects `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` for native Google Maps; web shows a short message (no map SDK in browser for this slice)
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
- Web safety + maps module isolation:
  - `react-native-maps` moved behind platform-specific map component (`TripSegmentMap.native.tsx` / `.web.tsx`) so web no longer crashes from native-only imports
- Multi-leg decision + consent flow hardening:
  - App now uses destination direction (`north/south/east/west`) and driver heading compatibility to decide if handoff is needed (instead of request-time miles input)
  - Tries to pre-pair Driver B at initial pairing; only asks consent when no Driver B is available
  - Consent is persisted (`lib/multileg-consent.ts`) and randomly re-asked about 1-in-5 times
  - Removed dev-only “force no Driver B” test toggle (production hardening)
- Destination pin input + route-direction upgrade:
  - Replaced Ride Request direction chips with destination pin flow (`app/destination-picker.tsx`)
  - Added map picker components with platform split (`components/destination-picker-map/*.tsx`)
  - App now computes route heading from pickup GPS -> destination pin (`lib/geo-direction.ts`) before pairing
  - Multi-leg decision remains last-resort but now uses computed route direction from coordinates instead of manual N/S/E/W selection
  - Destination metadata is passed through trip flow (`ride-request` -> `active-trip` -> `post-trip-rating` -> `next-leg-request`)
  - Road-route distance estimate added for long-trip decisions (`lib/road-route.ts`, Google Directions with haversine fallback)
  - Matching upgraded:
    - Backend: `GET /matching/search` reads `public.driver_presence` (availability + GPS + heading) and returns distance/ETA list
    - App: Ride Request prefers `/matching/search` when origin GPS is available; otherwise falls back to `/matching/demo-drivers`
    - Supabase SQL: `supabase/driver_presence.sql` (driver presence table + RLS policies)
- **Production-style ride lifecycle (P0 — requires SQL):**
  - `supabase/rides_lifecycle.sql`: `driver_id` nullable, `pending_driver_id`, `request_expires_at`, status values `searching` → `requested` → `accepted` → `completed` (plus decline/cancel paths)
  - FastAPI: `POST /rides/start-search`, `POST /rides/request-driver`, `POST /rides/respond`, `GET /rides/status/{ride_id}`; optional Expo push to driver with deep link `data.url` → `/incoming-ride`
  - **Match Score** on `/matching/search` + demo catalog: weighted α/β/γ (defaults 0.5/0.3/0.2; env `MATCH_ALPHA`, `MATCH_BETA`, `MATCH_GAMMA`); query `urgent=1` increases time-sensitivity term; response includes `matchScore`; list sorted by score
  - `POST /rides/complete`: validates prior row state; **passenger JWT** may complete an **accepted** ride and points credit **assigned `driver_id`**; legacy “no prior row” behavior preserved for demo catalog drivers
  - App: `app/incoming-ride.tsx` (driver Accept/Decline); Ride Request runs formal accept+poll when driver `id` is a real UUID and user is signed in with backend; passes `rideId` through to Active Trip; cards may show **Match score %**
- Points + flow bug fixes:
  - `post-trip-rating.tsx` now safely derives completed leg inputs (`distanceMiles`, `wasZeroDetour`) before calling `awardPoints`
  - `active-trip.tsx` now sends `autoJourneyId`/`autoLegIndex` to `/rides/complete` when multi-leg is app-activated
  - `post-trip-rating.tsx` now hides “Find next driver” for single-leg flow (`canContinueJourney` requires `journeyId`)
- Session 28 — ratings + driver UX alignment:
  - **`/points/rating-bonus`:** verifies **passenger** JWT against `rides.passenger_id` on a **completed** row; credits **`rides.driver_id`** (post-trip star rating was incorrectly using driver-as-JWT before).
  - **`active-trip` → `post-trip-rating` only** (passenger never routed to `rate-passenger`).
  - **`incoming-ride`:** retries auth session + **404** on status fetch (QR scan / `start-search` race).
  - **Driver → passenger rating:** `lib/driver-pending-passenger-rating.ts` stores `{ rideId, passengerId }` after **Accept**; Driver tab polls `GET /rides/status` and shows **Rate passenger** when `status === completed`; `rate-passenger` returns to Driver tab after submit/skip; manual ride-id load also persists pending for the CTA.
- Session 31 — P1 Driver UX & Parity:
  - **Driver Dashboard:** Built `app/(tabs)/driver.tsx` with Availability, Intent, and Heading controls.
  - **Real-Time Presence:** Added 30s background `expo-location` heartbeat to `public.driver_presence`.
  - **Points Ledger Parity:** Wired `_evaluate_daily_bonuses` in `backend/main.py` so drivers get First Ride (+3) and 7-Day Streak (+25) bonuses instantly upon trip completion.
  - **Live Trip Share:** Added silent 10s background polling to `ride-share.tsx`.
- Session 32 — P1 Re-broadcast Policy:
  - **Re-broadcast Policy:** Automated the 5-minute search radius expansion (5km -> 15km) with a user alert, and implemented active 15-minute guidance prompting the passenger to adjust their destination or allow multi-leg handoffs.
- Session 33 — P1 Active Trip Live:
  - **Live Vehicle Tracking:** Added 3-second native GPS `watchPositionAsync` heartbeat for drivers in an active trip.
  - **Map Centering:** Passengers now fast-poll driver coordinates (4s interval) while map automatically pans/centers to follow the live `driverLocation`.
- Session 34 — P1 Progressive Trust:
  - **Visibility Caps:** Capped "Helper" (new) tier drivers to a 2km search radius in `backend/main.py`.
  - **Eligibility Guard:** Enforced tier-based radius limits in `POST /rides/request-driver` to prevent bypass.
- Session 35 — P1 Inbound Notifications Polish:
  - **Rich Push Payload:** Added `rideId`, `type`, and `destinationHint` to the `data` payload in `_notify_driver_ride_request` to support robust cold-start routing and driver context.
  - **Driver UX Alignment:** Clarified title and structure for incoming ride alerts.
- Session 36 — P1 Admin Shell:
  - **SOS Moderation:** Created an internal `app/admin.tsx` screen to monitor and resolve emergency alerts in the `sos_requests` table.

Session 39 — P0 Ride State Machine (full lifecycle):
  - **`expired` status:** `_rides_expire_requested_if_needed` now writes `expired` (was `searching`); structured log emitted per expiry event.
  - **`declined` status:** `/rides/respond` decline path now writes `declined` (was `searching`); structured log emitted per decline event; response body returns `"status": "declined"`.
  - **Re-request from `expired`:** `/rides/request-driver` now accepts `expired` as a valid source state alongside `searching` and `declined`.
  - **App polling loop:** `ride-request.tsx` breaks immediately on `declined` or `expired` (was only `searching`) and advances to the next candidate driver.
  - **`incoming-ride.tsx`:** Displays distinct copy for `declined` ("You declined…") vs `expired` ("60 s window passed…") vs `searching`.

Session 37 — P1 Geo Schema Refinement for Handoffs: **COMPLETE**
  - **Leg vs Journey Coordinates:** `supabase/rides_geo.sql` adds `dropoff_lat`/`dropoff_lng` to `public.rides` (distinct from `destination_lat`/`destination_lng`).
  - **Analytics Integrity:** `_emit_trip_analytics` uses `dropoffLat`/`dropoffLng` (with fallback to destination) for the route vector. Ride Integrity Engine fingerprint uses `dropoffLat`/`dropoffLng` as the endpoint hash input.
  - **`POST /rides/complete`:** Persists `dropoff_lat`/`dropoff_lng` when provided in payload.

Session 42 — World-class UI Redesign (all main screens): **COMPLETE**
  - **Design system:** 3-stop gradient hero (`#0c1f3f → #0e4a6e → #0a5c54`), teal/navy palette, card-based layout, `#f8fafc` background, rounded corners 20–24px, consistent shadow tokens, `expo-linear-gradient` throughout.
  - **`app/(tabs)/index.tsx` (Home):** Animated pulse dot, time-of-day greeting, destination search bar in hero, "Get a Ride" gradient card, Drive/Points 50/50 split cards, recent destinations with relative timestamps.
  - **`app/(tabs)/explore.tsx` (Explore):** Full-screen `MapView` background, frosted HUD overlay, animated safety panel (SOS/QR/Rate/GPS), `PanResponder` 3-snap-point bottom drawer, filter chips, route timeline cards.
  - **`app/(tabs)/driver.tsx` (Driver):** Stats row (rides today / points / verified) inside hero, animated online toggle with live pulse dot, incoming ride cards with gradient Accept button and countdown pill, collapsible preferences accordion, subtle "View trip history →" link.
  - **`app/(tabs)/points.tsx` (Points):** 72px spring-animated score, 5-tier progression ladder with connector lines, redemption options grid (greyed when insufficient pts), horizontal stat strip, sign-in banner (replaces inline email/password form).
  - **`app/(tabs)/settings.tsx` (Settings):** Native grouped-list layout (`SettingRow` component with icon badge + label + chevron), danger zone at bottom (Sign out / Delete account in red), language chips with flag emojis, Support section rows.
  - **`app/sign-in.tsx`:** Email default, gradient hero, large spaced OTP input, prominent sign-up CTA.
  - **`app/sign-up.tsx`:** Consent card, OTP flow, immediate redirect after verification.
  - **`app/onboarding.tsx`:** Full-screen gradient, 3 slides, teal elongated dot indicator.
  - **SVG assets:** `kindride-logo.svg`, `kindride-logo-light.svg`, `kindride-icon.svg` (pin + heart mark).
  - **Bug fixes:** Camera black screen (overlay removed), Android video upload (ArrayBuffer fix), driver audio (setAudioModeAsync on mount), sign-up redirect (moved before Alert callback), microphone permissions in `app.json`.
  - **Demo accounts removed:** `EXPO_PUBLIC_DEMO_DRIVER_ID` / `EXPO_PUBLIC_DEMO_PASSENGER_ID` removed from `.env` and code.

Session 38 — P1 Security (Feature 4 - Recording Consent): **COMPLETE**
  - **Recording Consent:** `supabase/user_consents.sql` — `user_consents` table with RLS. `sign-up.tsx` has mandatory consent `Switch`; button disabled until toggled; upserts consent row on OTP verify.
  - **SessionRecorder component:** `components/session-recorder/SessionRecorder.native.tsx` — `expo-camera` permissions + live front-camera preview + REC badge + Flag Trip button. `SessionRecorder.web.tsx` — passive indicator stub (no camera on web).
  - **Active Trip Integration:** `active-trip.tsx` mounts `<SessionRecorder isActive={true} rideId={rideId} />` when boarding countdown reaches zero (`secondsLeft === 0`).

## Parallel development boundaries (two tracks)

**Auth / push / SOS track** — stay inside: `lib/auth.tsx` (or files under `lib/auth/` if split), `lib/notifications/**`, `lib/sos/**`, `backend/*_routes.py`, and **minimal** `main.py` changes (**router `include_router` only**). Do **not** edit `app/(tabs)/ride-request.tsx` or `app/active-trip.tsx` except **agreed SOS `onPress` wiring**; do **not** change **matching** or **points** handlers inside `main.py` (those are lead-owned).

**Lead track (core ride)** — owns: matching list + multi-leg journey flow, destination picker, `ride-request`, `active-trip`, post-trip / next-leg, points integration calls from app screens, and matching/points/trip logic in `main.py`.

## Gap analysis vs founder vision (honest snapshot)

| Founder pillar | Today (codebase) | Gap |
|----------------|------------------|-----|
| Free rides + points currency | Passenger flow + tiered points | Tipping/partner revenue not built; **points rules** partially match (see P1) |
| Corridor + Match Score ranking | Proximity / heading / intent heuristics + `/matching/search` | **Explicit α+β+γ scoring**, deviation-cost filter, configurable weights **server-side** |
| Intent model (zero-detour first) | Badges + multipliers in points; UI intent | **Driver declares intent before requests** + **accept/decline** loop not end-to-end |
| Broadcast to filtered pool + first accept | Single-user list + Request Ride | **Push to pool**, **ride status machine**, **60s timeout / next driver** |
| Re-broadcast (5m / 15m) | Background poll on empty list | **Policy-driven widen + passenger notify** aligned to blueprint |
| Live tracking + share | Segment map; GPS miles | **Moving driver marker**, Directions ETA, **shareable live trip link** |
| Safety stack | SOS + DB path; ratings | **Twilio/contacts**, cancel window, **camera**, **ID verify**, admin review |
| Driver product | Matching data model | **Driver dashboard** (availability, incoming requests) largely absent |

## Priority backlog — P0 / P1 / P2 (build excellently, solve real challenge)

Use this as the default execution order when not otherwise specified. **P0** = trust + minimally viable two-sided match; **P1** = experience + parity with founder mechanics; **P2** = platform, compliance, and scale.

### P0 — Must-haves for a trustworthy real-world pilot

1. ~~**Auth & identity baseline:** Reduce reliance on demo IDs in paths that affect safety or payouts; phone/OTP and session hardening per blueprint (Supabase Auth).~~ **COMPLETED** (Session 30: Phone/OTP auth implemented in sign-in/sign-up; Supabase Auth hardened).
2. ~~**Ride state machine (server + app):** `searching` → `requested` → `accepted` | `declined` | `expired`; persist on `rides`; **first accept wins**; align `rideId` / status with Active Trip entry.~~ **COMPLETED** (Session 39: `declined` and `expired` statuses now correctly persisted; `expired` allowed as source for re-request; polling loop and incoming-ride UX updated).
3. ~~**Driver request loop (MVP):** Minimum driver surface to **receive** a request, **accept/decline**, ~**60s** timeout → passenger sees next option.~~ **COMPLETED** (Session 39: 65 s expiry → `expired` state; passenger polling breaks on `declined`/`expired` and advances to next candidate; `incoming-ride.tsx` shows distinct messages per terminal state).
4. ~~**Targeted push:** Notify **only** the eligible driver for a request (not generic broadcasts); reuse `push_tokens` + existing register path; **server-side eligibility** on `POST /rides/request-driver` (same rules as `GET /matching/search`: presence, fresh GPS, 5 km radius, corridor heading) before `requested` + Expo push to that driver only. Local override: `KINDRIDE_RELAX_DRIVER_REQUEST_ELIGIBILITY=true`.~~ **COMPLETED** (Session 29).
5. ~~**Matching parity (engine):** Implement **Match Score** and ranking **in FastAPI** (weights configurable via env/constants); **zero-detour first** in sort; keep corridor/radius rules documented in code—not in public README.~~ **COMPLETED** (Session 28).
6. ~~**SOS credibility:** **5-second cancel** + confirmation; persist events; wire **emergency contacts** (profile) toward **SMS** (Twilio or provider) when keys exist; never block on UI-only.~~ **COMPLETED** (Session 30: SMS wiring added with Twilio; fallback logging).
7. ~~**Live trip share (basic):** Shareable link or deep link with **obfuscated token** + trip id so trusted contacts can follow coarse status (step toward blueprint "live trip sharing").~~ **COMPLETED** (Session 27).
8. ~~**Operational truth:** Structured logs for match, push, SOS, ride transitions (**no PII** in plain text); `/health` paths validated before pilot.~~ **COMPLETED** (Logging implemented throughout).

### P1 — Excellence, founder-faithful mechanics, retention

1. ~~**Real-time presence:** Driver GPS heartbeat to `driver_presence` (or successor); passenger map/subscription or polling strategy; heading indicator.~~ **COMPLETED** (Session 31).
2. ~~**Active trip live:** Faster location updates during trip; **Google Directions** polyline/ETA on active trip where native maps allow.~~ **COMPLETED** (Session 33 - Live Tracking/Moving Marker).
3. ~~**Re-broadcast policy:** Automate **5 min widen / 15 min** passenger guidance + notifications per founder FAQ.~~ **COMPLETED** (Session 32).
4. ~~**Points ledger parity:** **First ride of day** (+3), **7-day streak** (+25), **cancellation/no-show** deductions, enforce **non-transferable** rule in schema/policy; confirm **1.5x** alignment with intent.~~ **COMPLETED** (Session 31).
5. ~~**Driver dashboard (blueprint step 6):** ON/OFF, intent, destination/context, incoming requests list, points surface.~~ **COMPLETED** (Session 31).
6. ~~**Progressive trust:** Caps for new drivers / reputation thresholds before full visibility (schema + matching filter).~~ **COMPLETED** (Session 34).
7. ~~**Inbound notifications polish:** Cold-start notification handling, richer `data` payload contract, driver modal UX.~~ **COMPLETED** (Session 35).
8. ~~**Admin / moderation shell:** Queue for SOS + flagged behavior (even a minimal internal page or Supabase + runbook).~~ **COMPLETED** (Session 36).

### P2 — Platform, compliance, scale (post-pilot)

1. ~~**Stripe Identity (or equivalent)** + `id_verified` gating for drivers in matching.~~ **COMPLETED** (Session 40: `supabase/identity_verification.sql` adds `id_verified` + `stripe_identity_session_id` to `driver_presence`; `POST /identity/webhook` verifies Stripe signature + sets flag; verified drivers get 10% score boost; `KINDRIDE_REQUIRE_ID_VERIFIED=true` enables hard gate; driver tab shows verification status card).
2. ~~**In-app trip recording** + Supabase Storage + **72h** lifecycle + **flag** retention per blueprint.~~ **COMPLETED** (Session 40: `supabase/trip_recordings.sql` table with generated `expires_at`/`retain_until` columns; `POST /recordings/register` + `POST /recordings/flag/{ride_id}`; flagged recordings extended to 30 days).
3. ~~**Anomaly detection** hooks (server-side GPS/behavior heuristics); **background checks** phase per roadmap.~~ **COMPLETED** (Session 40: `_detect_ride_anomalies()` background task fires at ride completion; checks abnormal duration (>3× expected), GPS corridor deviation (>500 m), rapid accumulation (>5 rides/60 min); writes to `ride_integrity.validation_flags`).
4. ~~**Founding / institutional** programs: founding driver badge mechanics, hub onboarding.~~ **COMPLETED** (Session 41: `supabase/founding_drivers.sql` — `is_founding_driver` auto-set by DB trigger before 2026-01-01 cutoff; `hubs` table + `hub_id` FK; `POST /hubs/join` + `GET /hubs/my`; driver tab hub code entry; founding/verified badges on matching cards).
5. ~~**Beta at scale, EAS/TestFlight/APK**, App Store / Play submission, onboarding polish, Security-First Checklist audit.~~ **COMPLETED** (Session 41: `eas.json` with development/preview/production profiles; `app.json` production IDs `com.kindride.app`; 3-slide `app/onboarding.tsx` shown on first launch via AsyncStorage; `docs/SECURITY_CHECKLIST.md` — 6 categories, 5 actionable pre-launch items identified).

## Proprietary Security Architecture (Phase 1–3 Roadmap)

Session 31+ introduces a **multi-layered, privacy-first security model** designed to protect the Humanitarian Points economy, audit trip integrity, and scale to institutional partnerships without surveillance.

### Security Feature 1: Ride Integrity Engine (Phase 1 — Planned)
**Status:** Architected. Ready for foundational implementation.

**Problem:** Replay attacks and trip laundering—malicious users submitting the same `rideId` multiple times from different tokens or geographic locations to fraudulently earn points.

**Design:**
- At ride completion, generate deterministic fingerprint:
  1. SHA-256 hash of pickup + destination coordinates.
  2. Driver declared intent vector (`zero_detour` boolean).
  3. Device motion signature (accelerometer + gyrosensor hash).
- Store in `public.ride_integrity` table + device secure enclave.
- Validate on `POST /rides/complete`:
  - If same `rideId` from different auth token → **reject 409**.
  - If GPS > 500m from trip corridor → **reject 409**.
  - If > 24h since original → **lock points**.
- Fully background; no UI.

**Implementation:** `supabase/ride_integrity.sql` schema applied. Backend integration deployed in `POST /rides/complete` to prevent token-mismatched replays and store anomaly flags.

---

### Security Feature 2: Proximity-Verified Trust Anchor (Phase 1 — Silent)
**Status:** **COMPLETE (Phase 1).**

**Problem:** Ensure driver and passenger physical presence without surveillance.

**Design:**
- Silent GPS check at trip start and end.
- Compute distance between driver (from `driver_presence`) and passenger (from app payload).
- Score: ≥ 95% proximity → auto-pass; 80–95% → review; < 80% → flag for admin.
- Store in `public.ride_trust_anchors` with scoring rules.
- Phase 2: Expose to institutional dashboards + optional QR handshake (opt-in only).

**Implementation:** `supabase/ride_trust_anchors.sql` applied. Backend `_evaluate_trust_anchor` runs seamlessly in the background during `/rides/complete`.

---

### Security Feature 3: Trip Event Logging Pipeline (Phase 1 — Data Collection)
**Status:** **COMPLETE (Phase 1).**

**Problem:** Build privacy-safe analytics foundation for future anomaly detection and city-partner products.

**Design:**
- Emit structured 6-field record per trip:
  - route_vector, deviation_delta, time_flag, sos_ping_count, trust_anchor_score, session_id.
- Hash all PII + add differential noise to coordinates.
- Store in `public.trip_analytics` with admin-only RLS.
- **No ML/detection in Phase 1**; collection and schema only.
- Phase 3: Build `KindRide Safety TAP` product (anomaly detection, heatmaps for city partners).

**Implementation:** `supabase/trip_analytics.sql` applied. Backend `_emit_trip_analytics` fires on `/rides/complete`.

---

### Security Feature 4: In-App Disclosed Session Recording (Phase 1 — Consent + Camera)
**Status:** Architected. Ready for full implementation.

**Problem:** Provide audit-grade trip recording for safety and legal protection.

**Design:**
- Mandatory consent at sign-up (both drivers + passengers).
- Camera + microphone auto-activate at trip start (boarding countdown = 0).
- Encrypt with AES-256, upload to Supabase Storage.
- Auto-delete after 72 hours (unless flagged).
- Neither party can disable during trip.
- Flag UI: tap banner to mark session for retention.
- Phase 2: Admin dashboard to review/approve flagged recordings.

**Implementation:**
- SQL: `user_consents` table.
- Frontend: Consent disclosure in sign-up; camera start in Active Trip.
- Backend: `/recordings/flag/{ride_id}` endpoint + Storage lifecycle policy.
- Native-only (web skips due to camera SDK).

---

### Security Feature 5: Zero-Knowledge Route Commitment (Phase 1 — Architecture)
**Status:** **COMPLETE (Phase 1).** Patent specification integrated.

**Problem (Phase 2+):** Verify driver honored corridor **without** storing raw GPS traces—legally defensible audit trail that isn't surveillance.

**Phase 1 Design:**
- Dedicated `public.route_commitments` table per USPTO Provisional Patent specs (Section 7.6).
- At driver intent declaration: compute `HMAC-SHA256(corridor_vector + nonce + timestamp, service_key)`.
- Store hash; do **not** implement verification or key storage yet.

**Implementation:** `supabase/zk_route_commitments.sql` applied. Table structures bounding box, intent, hashes, and signatures.

---

## Not Implemented Yet (Planned)

See **Gap analysis** and **P0–P2** above for founder-aligned detail. Legacy shorthand:

- Full app-wide Supabase authentication flow (OTP, profile completeness; reduce demo IDs on critical paths)
- Explicit Match Score (α+β+γ) + corridor deviation-cost filter in backend ranking
- Real-time fleet tracking and live Directions on Active Trip
- Push: pool-targeted ride requests + re-broadcast policies
- SOS: Twilio (or equivalent) to contacts / authorities + cancel window + admin workflows
- Live trip share links (trusted contact)
- Driver identity verification (Stripe Identity / similar)
- In-app camera recording and retention policy
- Revenue / institutional layers (post-MVP)

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
  - App: signed-in requester UUID passed as `passengerId` on `POST /rides/complete` for reputation linkage; **driver** opens `rate-passenger` from Driver tab after trip completes (see Session 28); active trip shows passenger community score when available
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
- Session 21 completed:
  - `react-native-maps` on Active Trip; `app.config.js` reads `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` for Android `googleMaps.apiKey` + iOS `googleMapsApiKey` at prebuild
  - Rebuild native app after pull (`npx expo prebuild` / EAS or dev client) so Maps SDK + key are linked; enable **Maps SDK for iOS** on the same Google key when using `PROVIDER_GOOGLE` on iPhone
- Session 22 completed:
  - Web crash fix for Active Trip map import path: native-only `react-native-maps` moved to platform file so Expo web renders placeholder instead of server error
  - Passenger ratings SQL dependency verified by founder in Supabase (`public.passenger_ratings` now available)
  - Multi-leg behavior changed to “last resort”: no default journey on first leg; app can auto-activate journey only when handoff is needed
  - Direction-based handoff decision introduced:
    - passenger selects destination direction on Ride Request
    - driver cards include heading direction
    - app decides direct A→B vs handoff from heading compatibility + intent
  - Pre-pair next driver at first pairing when possible; continue background search while riding when needed
  - Consent flow for multi-leg when no Driver B is available; persistent consent + random re-ask
  - Added dev-only consent test switch: “force no Driver B” for deterministic QA path
  - UI/flow polish from phone test:
    - hide “Find next driver” on single-leg post-trip
    - show “Trip miles …” copy on single-leg Active Trip
- Session 23 completed:
  - Implemented destination pin picker screen and wired Ride Request to require destination selection before matching
  - Introduced pickup->destination bearing to derive cardinal route direction automatically (no manual direction chips)
  - Kept existing multi-leg consent and pre-pairing behavior, now powered by computed route direction
  - Carried destination params through multi-leg navigation for consistent next-leg matching context
- Session 24 completed:
  - Persist pickup + destination coordinates (and destination label) to `public.rides` on `POST /rides/complete` (`supabase/rides_geo.sql`)
  - Persist trip start time + duration audit fields on `public.rides` (`supabase/rides_trip_time.sql`):
    - `started_at` stored from app when boarding countdown hits 0
    - `trip_duration_seconds` computed from `started_at` and `completed_at`
    - `trip_duration_mmss` maintained via trigger function on insert/update (generated column immutability fix)
  - Phone test validated the newest `public.rides` row populates `destination_label`, `started_at`, `trip_duration_seconds`, `trip_duration_mmss`
  - Restored demo reliability:
    - Points/rewards screen reliably shows after rating via local fallback when not signed in (`EXPO_PUBLIC_POINTS_REQUIRE_BACKEND=false`)
    - Re-enabled ~1-in-5 passenger rating prompt even when passenger is not signed in by providing `EXPO_PUBLIC_DEMO_PASSENGER_ID`
- Session 25 completed:
  - TypeScript: pre-matched Driver B on Active Trip now satisfies `DriverCard` (`headingDirection` from Ride Request via `preMatchedNextDriverHeading`, fallback route direction)
  - `registerDeviceToken` / `triggerSOS` guard `supabase === null` (no env) with clear errors
  - Parallel track: inbound push handling starter — `useNotificationResponseRouting()` in `app/_layout.tsx` (dynamic `expo-notifications`, skips Expo Go StoreClient); tap uses `data.url` paths for `expo-router`
  - `backend/README.md`: `curl` examples for `/notifications/register-token` and `/sos`, plus `data.url` contract note
- Session 26 (documentation / planning only):
  - Read **Founder Blueprint v1.1** (`KindRide_FOUNDER_Blueprint_v1.1-latest.pdf`): product mission, problem, Match Score + intent model, safety layers, growth/revenue framing
  - Updated this file: **Product north star**, **gap analysis vs founder vision**, **P0 / P1 / P2** backlog; clarified that core IP implementation stays **server-side**
- Session 27 completed:
  - **Ride lifecycle** end-to-end (backend + app + SQL migration file): search → request targeted driver → driver respond → passenger Active Trip with shared `rideId` → complete with correct driver points attribution when ride was accepted
  - **Match Score** ranking + `matchScore` field; `urgent` query param on `/matching/search`
  - **Driver UX** minimum: `incoming-ride` screen + push deep link contract (`/incoming-ride?rideId=…`)
  - **Formal vs demo:** embedded demo driver ids (non-UUID) still use instant Active Trip; real `driver_presence` UUIDs use formal flow when signed in
- Session 28 completed:
  - **Post-trip rating bonus** endpoint aligned with **passenger** caller; **driver → passenger** rating wired from Driver tab + Accept persistence + manual ride id
  - **Incoming ride** resilience: session + 404 retries for first-load errors after QR scan
- Session 29 completed:
  - **P0 targeted push:** `POST /rides/request-driver` runs **eligibility** (aligned with `/matching/search`: `driver_presence` available + non-stale + within 5 km of ride pickup + heading matches pickup→destination corridor) before setting `requested`; **one** Expo notification to `pending_driver_id` via existing `_notify_driver_ride_request` + `push_tokens`; `KINDRIDE_RELAX_DRIVER_REQUEST_ELIGIBILITY` for dev bypass

## Completion snapshot (rough, for planning)

| Scope | Approx. done | Approx. remaining |
|-------|----------------|---------------------|
| **Pilot slice** (two-sided match, ride lifecycle, points, basic driver/passenger surfaces, ratings path) | **100%** | **0%** — Pilot MVP Complete! |
| **Full founder blueprint** (P0+P1+P2: safety stack, verification, re-broadcast policy, scale/compliance) | **~55%** | **~45%** — identity verification, recording retention, anomaly detection, institutional layers, app-store hardening |

These percentages are **judgment calls** against the P0–P2 lists in this file, not a line-count audit.

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

## Suggested next tasks — parallel agent (auth / push / SOS only)

Use when asking for the next bounded task; do **not** expand into ride-request, active-trip (except SOS button handler), or core `main.py` business logic.

1. **Inbound push handling:** extend beyond tap routing (e.g. cold start `getLastNotificationResponseAsync`, richer payload keys, campaign docs) — baseline listeners live in `lib/notifications/notificationResponseRouting.ts`.
2. ~~**SOS client consistency:** align `lib/sos/triggerSos.ts` with `app/sos.tsx` (same base URL helper as `lib/backend-api-urls.ts`, shared error typing); optionally add retries only inside `lib/sos/`.~~ **COMPLETE** (Added 3-attempt exponential backoff retry in `triggerSos.ts`, dynamic contact routing in `sos.tsx`).
3. **Backend routers:** document `notifications_routes` / `sos_routes` in `backend/README.md` (curl examples); add structured logging fields (no PII in plain logs) in `*_routes.py` only.
4. **Supabase:** verify `supabase/push_notifications.sql` and `supabase/sos_requests.sql` are applied in the founder project; add RLS notes if anything is missing (SQL files can be edited if the user extends boundary to `supabase/` — otherwise document only).

## Lead queue (next — core ride)

Prioritize **P0** items above alongside this standing list.

1. ~~**Matching:** prefer `GET /matching/search` when origin GPS exists; tune multi-leg thresholds + **Match Score** weights (`MATCH_*` env) with real rides.~~ **COMPLETE** (Angular parity added to next-leg-request; MATCH env variables documented).
2. **Ride lifecycle:** apply **`rides_lifecycle.sql`** in Supabase prod; phone-test formal flow (two accounts + push); extend driver dashboard when ready.
4. **Housekeeping:** `.gitignore` now excludes `kindride.log` / `backend/kindride.log`; keep logs out of commits.

## Resume Prompt (Copy/Paste for Next Session)

"We are continuing KindRide. Read `PROJECT_STATUS.md` first: **Product north star**, **P0–P2 backlog**, **Parallel development boundaries**, and **Lead queue**. Execute the next P0 item unless steered otherwise. Lead owns core ride + `main.py` matching/points/trip logic; parallel track stays in auth / notifications / sos / `*_routes.py` (+ minimal `include_router`). Protect founder IP: Match Score weights and corridor tuning belong server-side only."
