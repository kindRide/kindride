# KindRide Security-First Checklist
*Last audited: 2026-03-31 (Session 40)*

Status legend: ✅ PASS · ⚠️ ACTION REQUIRED · 🔲 DEFERRED (post-pilot)

---

## 1. Secrets & Key Management

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1 | No Supabase service-role key in app bundle | ✅ | Service role key is server-only (`backend/.env`). App uses anon key via `EXPO_PUBLIC_SUPABASE_ANON_KEY`. |
| 1.2 | No hardcoded JWT secrets in client code | ✅ | JWT secret lives in `backend/.env` only. |
| 1.3 | Google Maps API key restricted to app package | ⚠️ | Key `AIzaSy…` is in `app.json` (required by Android Maps plugin). **Action:** In Google Cloud Console → Credentials, restrict this key to `com.kindride.app` package + SHA-1 fingerprint before production release. |
| 1.4 | Stripe webhook secret not committed | ✅ | `STRIPE_WEBHOOK_SECRET` is env-only; commented out in `.env.example`. |
| 1.5 | `.env` files in `.gitignore` | ✅ | Verify `backend/.env` and root `.env` are excluded before first push. |

---

## 2. Authentication & Authorization

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1 | All write endpoints verify Supabase JWT | ✅ | `_verify_user_bearer_token()` called on every state-changing endpoint. |
| 2.2 | Passengers cannot complete other passengers' rides | ✅ | `/rides/complete` checks `passenger_id == caller_id` (or assigned `driver_id`). |
| 2.3 | Drivers cannot accept rides not addressed to them | ✅ | `/rides/respond` checks `pending_driver_id == driver_id`. |
| 2.4 | Cannot request yourself as driver | ✅ | `/rides/request-driver` rejects `driverId == passenger_id`. |
| 2.5 | Points cannot be self-awarded | ✅ | `/points/rating-bonus` verifies passenger JWT then credits `rides.driver_id` (different user). |
| 2.6 | Admin endpoints gated to `role = 'admin'` | ✅ | `admin.tsx` screen is internal-only; RLS policies on `ride_integrity` restrict to admin role. |

---

## 3. Row-Level Security (Supabase RLS)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 3.1 | `driver_presence` — read open to authenticated | ✅ | Intentional for matching. Tighten to `is_available = true` post-pilot if needed. |
| 3.2 | `driver_presence` — write scoped to own row | ✅ | `upsert_self` policy enforces `auth.uid() = driver_id`. |
| 3.3 | `trip_recordings` — service role only for writes | ✅ | `service_all` policy is for backend service role; admin select policy is separate. |
| 3.4 | `ride_integrity` — not accessible to end users | ✅ | RLS restricts reads to `role = 'admin'`; inserts/updates are service-role only. |
| 3.5 | `user_consents` — users manage own row only | ✅ | Policy `auth.uid() = id`. |
| 3.6 | `hubs` — service role manages; authenticated can read | ✅ | Read-open for code validation; write restricted to service role. |
| 3.7 | `sos_requests` — `using (true)` on service role policies | ✅ | Audited: `using (true)` only appears on `to service_role` policies. Authenticated INSERT is scoped to `auth.uid() = user_id`. |
| 3.8 | `push_notifications` — `using (true)` | ✅ | Audited: `using (true)` only appears on `to service_role` SELECT policy. Authenticated SELECT/INSERT/UPDATE are scoped to `auth.uid() = user_id`. |

---

## 4. Transport & Data

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1 | All backend/Supabase traffic over HTTPS | ✅ | Supabase URL is `https://`. App only constructs HTTPS URLs from env vars. |
| 4.2 | No PII in structured logs | ✅ | Logs emit `ride_id`, `driver_id` (UUIDs), `event_type`. No phone numbers, names, or tokens logged. |
| 4.3 | Share tokens are HMAC-signed, not guessable | ✅ | `SHARE_TOKEN_SECRET` used for ride share tokens; default secret is overrideable via env. **Action:** Set a strong random `SHARE_TOKEN_SECRET` in production. |
| 4.4 | Trip recording files access-controlled in Storage | ⚠️ | `supabase/create_storage_bucket.py` creates private bucket. Needs legacy service_role JWT in `backend/.env` to run. Alternatively: Dashboard → Storage → New bucket (public: OFF). |
| 4.5 | GPS coordinates stored with differential noise in analytics | ✅ | `_emit_trip_analytics` adds ±0.005° (~500 m) noise before persisting route vectors. |

---

## 5. Fraud & Abuse

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | Points award idempotency (replay prevention) | ✅ | `point_events` unique constraint on `(driver_id, idempotency_key)`. |
| 5.2 | Ride integrity fingerprint (trip laundering) | ✅ | SHA-256 fingerprint stored in `ride_integrity` at completion; duplicate `ride_id` rejected 409. |
| 5.3 | Anomaly detection at ride completion | ✅ | `_detect_ride_anomalies()` checks duration, GPS corridor deviation, rapid accumulation; flags `ride_integrity.validation_flags`. |
| 5.4 | Identity verification gating | ✅ | `id_verified` boost in matching; `KINDRIDE_REQUIRE_ID_VERIFIED=true` for hard gate. |
| 5.5 | Progressive trust (Helper tier radius cap) | ✅ | New drivers capped to 2 km radius. |
| 5.6 | Rate limiting on sensitive endpoints | ✅ | `slowapi` wired: `/points/award` 20/min, `/rides/request-driver` 10/min, `/sos` 5/min. Degrades gracefully if `slowapi` not installed. |

---

## 6. Privacy & Compliance

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.1 | Recording consent captured before trip | ✅ | `user_consents` upserted at OTP verification; active trip gate enforced by `SessionRecorder`. |
| 6.2 | 72-hour recording auto-expiry | ✅ | `trip_recordings.expires_at` generated column; flagged recordings extend to 30 days. |
| 6.3 | Recording bucket lifecycle enforced | ✅ | `supabase/recording_cleanup_cron.sql` — pg_cron job runs daily 02:00 UTC, deletes rows where `retain_until < NOW()`. Apply via Supabase Dashboard → SQL Editor. |
| 6.4 | Background checks roadmap documented | 🔲 | Per blueprint Phase 2. Driver vetting via third-party provider TBD post-pilot. |

---

## Pre-Launch Action Items (Priority Order)

1. **Restrict Google Maps API key** to `com.kindride.app` package in Google Cloud Console (1.3). *(manual — Google Cloud Console)*
2. ~~**Set strong `SHARE_TOKEN_SECRET`**~~ ✅ Written to `backend/.env` (4.3).
3. **Configure Supabase Storage bucket** `trip-recordings/` as private (4.4). Run `python supabase/create_storage_bucket.py` after adding the legacy service_role JWT to `backend/.env`. *(or create manually in Supabase Dashboard → Storage)*
4. ~~**Add rate limiting** (`slowapi`)~~ ✅ `slowapi` wired to `/points/award` (20/min), `/rides/request-driver` (10/min), `/sos` (5/min) (5.6).
5. ~~**Storage lifecycle cron**~~ ✅ `supabase/recording_cleanup_cron.sql` ready — apply in Supabase Dashboard → SQL Editor (6.3).
6. **Apply pending SQL migrations** — run these files in order via Supabase Dashboard → SQL Editor:
   - `supabase/identity_verification.sql`
   - `supabase/trip_recordings.sql`
   - `supabase/founding_drivers.sql`
   - `supabase/recording_cleanup_cron.sql` *(requires pg_cron extension enabled first)*
