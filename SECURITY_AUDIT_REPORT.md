# KindRide Security & QA Audit Report
**Date:** 2026-04-02  
**Auditor:** Claude Code (AI-assisted static analysis)  
**Scope:** Full codebase — backend (Python/FastAPI), frontend (React Native/Expo), Supabase SQL schemas  

---

## Summary

| Severity | Total Found | Fixed in Code | Requires Manual Action |
|----------|-------------|---------------|------------------------|
| CRITICAL | 4 | 3 | 1 |
| HIGH | 5 | 3 | 2 |
| MEDIUM | 8 | 0 | 8 |
| LOW | 7 | 0 | 7 |
| **Total** | **24** | **6** | **22** |

---

## CRITICAL Issues

### C1 — Wildcard CORS with Credentials ✅ FIXED
**File:** `backend/main.py` (line 160)  
**What it was:** `allow_origins=["*"]` with `allow_credentials=True` — any website could make authenticated requests on behalf of a logged-in user (CSRF attack vector).  
**Fix applied:** CORS now restricted to origins defined in `ALLOWED_ORIGINS` environment variable. Credentials disabled. Methods and headers explicitly listed.  
**Action required:** Set `ALLOWED_ORIGINS=https://yourdomain.com` in `backend/.env` before going to production.

---

### C2 — Hardcoded Default Share Token Secret ✅ FIXED
**File:** `backend/main.py` (line 110)  
**What it was:** `SHARE_TOKEN_SECRET` defaulted to `"kindride-default-share-secret"` — a known, public string. Anyone could forge ride share tokens.  
**Fix applied:** If `SHARE_TOKEN_SECRET` is not set, a cryptographically secure random secret is generated at startup and a warning is logged.  
**Action required:** Set a permanent `SHARE_TOKEN_SECRET` in `backend/.env` so tokens survive restarts.

---

### C3 — `/metrics` and `/logs/recent` Endpoints Were Unauthenticated ✅ FIXED
**File:** `backend/main.py` (lines 669, 695)  
**What it was:** Both endpoints were publicly accessible with no auth. `/logs/recent` exposed raw application logs (user IDs, errors, queries). `/metrics` exposed infrastructure configuration details.  
**Fix applied:** Both endpoints now require admin role (checked against `profiles.role = 'admin'` in Supabase). Log lines containing "key" or "secret" are filtered. Line count capped at 500.

---

### C4 — `.env` Files Must Never Be Committed ⚠️ ACTION REQUIRED
**Files:** `.env`, `backend/.env`  
**What it is:** Both files contain live credentials: Supabase service role key, JWT secret, Stripe secret key, Google Maps API key, and webhook secrets. If ever committed to git, they are permanently exposed in history.  
**Current status:** Both files are correctly listed in `.gitignore` — they should never appear in git.  
**Action required:**
- Run `git log --all --full-history -- .env backend/.env` to confirm they were never committed
- If they appear in history, rotate ALL secrets immediately and use `git filter-repo` or BFG Repo-Cleaner to purge
- Rotate secrets on a regular schedule regardless

---

## HIGH Issues

### H1 — SOS SMS Sent to Duplicate Hardcoded "911" x2 ✅ FIXED
**File:** `backend/sos_routes.py` (line 124)  
**What it was:** Two entries in the SMS loop both had `"phone": "911"` — the same number was messaged twice. No real emergency contact numbers were configured.  
**Fix applied:** Contacts now come from `SOS_EMERGENCY_CONTACTS` environment variable. Deduplication prevents the same number being contacted twice.  
**Action required:** Set `SOS_EMERGENCY_CONTACTS` in `backend/.env`:
```
SOS_EMERGENCY_CONTACTS=KindRide Ops,+12345678900;Safety Admin,+19876543210
```
Format: `Name,+phone;Name2,+phone2` (semicolon-separated)

---

### H2 — SOS Response Was Leaking `user_id` ✅ FIXED
**File:** `backend/sos_routes.py` (line 195)  
**What it was:** The SOS response body included `"user_id": str(user_id)` — unnecessarily exposing the internal user UUID to the client and any network interceptors.  
**Fix applied:** Response now returns only `status`, `message`, `correlation_id`, and `timestamp`.

---

### H3 — SOS Had No Input Validation on Location ✅ FIXED
**File:** `backend/sos_routes.py` (line 37)  
**What it was:** `location` was an untyped `dict | None` — no validation on coordinate ranges. An attacker could send garbage coordinates or overflow values.  
**Fix applied:** New `SosLocation` Pydantic model with `latitude: float (ge=-90, le=90)` and `longitude: float (ge=-180, le=180)`. Message capped at 500 characters.

---

### H4 — Missing Rate Limiting on Several Critical Endpoints ⚠️ ACTION REQUIRED
**File:** `backend/main.py`  
**What it is:** `POST /rides/start-search`, `POST /rides/complete`, `POST /points/award`, and `POST /passengers/rate` have no rate limits. Attackers can spam these to farm points or corrupt ride state.  
**Affected endpoints:**
- `/rides/start-search`
- `/rides/complete`
- `/points/award`
- `/passengers/rate`

**Action required:** Add `@(_limiter.limit("10/minute"))` decorator to each of these endpoints (same pattern as `/rides/request-driver` already uses).

---

### H5 — Push Token Registration Has No Rate Limit ⚠️ ACTION REQUIRED
**File:** `backend/notifications_routes.py`  
**What it is:** `POST /notifications/register-token` has no rate limit. Spamming it could flood the push_tokens table.  
**Action required:** Add `@(_limiter.limit("5/minute"))` to the register-token endpoint.

---

## MEDIUM Issues

### M1 — Race Condition in Ride Completion State Machine ⚠️
**File:** `backend/main.py` (~line 2208)  
**What it is:** The ride completion logic reads the ride status, validates it, then writes `status=completed` as two separate operations. Between the read and write, another request could change the ride state.  
**Risk:** Two requests could simultaneously complete the same ride, or a ride could be completed after cancellation.  
**Recommended fix:** Use PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) or an atomic conditional update (`UPDATE rides SET status='completed' WHERE id=? AND status IN ('accepted','in_progress')`).

---

### M2 — Points Calculation Duplicated Between Frontend and Backend ⚠️
**Files:** `lib/points-award.ts`, `backend/main.py`  
**What it is:** The same points formula exists in both places. Frontend version can be modified but is never used for actual persistence — backend is always the source of truth. However, if they drift out of sync, the UI shows incorrect point predictions.  
**Recommended fix:** Expose a `/points/preview` endpoint that returns the calculated amount; remove the formula from the frontend.

---

### M3 — Deep Link URL Scheme Can Be Hijacked ⚠️
**File:** `app/active-trip.tsx` (line ~561)  
**What it is:** `kindride://` is a custom URL scheme. On Android, any installed app can register the same scheme and intercept deep links, including ride-share tokens.  
**Recommended fix:** Migrate to Android App Links (`https://kindride.app/...`) and iOS Universal Links for security-sensitive deep links.

---

### M4 — No Passenger Consent for Session Recording ⚠️
**Files:** `components/session-recorder/`, `backend/main.py`  
**What it is:** Trip session recordings are enabled without a clear in-app opt-in consent dialog for passengers.  
**Recommended fix:** Show a consent prompt on the passenger's first trip. Store consent flag in user profile. Allow opt-out per trip in settings.

---

### M5 — No Explicit Data Retention Policy Enforced ⚠️
**What it is:** Ride coordinates, session recordings (72h via trigger), and SOS location data have no enforced automatic purge schedule beyond the `trip_recordings` table trigger.  
**Recommended fix:**
- Enable `pg_cron` in Supabase
- Schedule: delete completed ride GPS data after 90 days, SOS records after 30 days
- Document retention policy in privacy policy

---

### M6 — SOS No Idempotency / Anti-Spam Within Session ⚠️
**File:** `backend/sos_routes.py`  
**What it is:** Rate limit is 5/minute, but within that window a user could trigger 5 separate SOS alerts sending 5 separate SMS messages to emergency contacts.  
**Recommended fix:** Track last SOS timestamp per user; if a new SOS is triggered within 60 seconds of a prior one, update the existing record and skip re-sending SMS.

---

### M7 — No Fraud Detection on Point Awards ⚠️
**File:** `backend/main.py` (points/award endpoint)  
**What it is:** Points are awarded based on self-reported `distanceMiles`. There is no cross-check against GPS coordinates submitted during ride completion to verify the distance is plausible.  
**Recommended fix:** If `pickupLat/Lng` and `dropoffLat/Lng` are both present, compare haversine distance against claimed `distanceMiles` and reject if it exceeds claimed distance by more than 50%.

---

### M8 — Demo Passenger ID Fallback Interacts with Real Data ⚠️
**File:** `app/(tabs)/ride-request.tsx` (~line 820)  
**What it is:** When a user is not signed in, `EXPO_PUBLIC_DEMO_PASSENGER_ID` is used as the passenger ID in the rating flow. This demo ID submits real ratings against real rides.  
**Recommended fix:** Block all rating submissions unless the user is authenticated. Remove demo ID from production builds.

---

## LOW Issues

### L1 — API Has No Version Prefix
All endpoints use `/rides/...`, `/points/...` with no version. Future breaking changes affect all clients immediately. **Recommended fix:** Prefix routes with `/v1/`.

### L2 — Error Messages Not Machine-Readable
Most errors return plain text `detail` strings. Clients can't programmatically distinguish error types. **Recommended fix:** Return structured errors: `{"code": "RIDE_NOT_OWNED", "detail": "..."}`.

### L3 — Console Logging May Expose Sensitive Data
Several frontend files use `console.warn()` / `console.error()` which in React Native may be visible in device logs. **Recommended fix:** Integrate Sentry or similar and remove direct console logging of error objects.

### L4 — HTTPS Not Enforced in Production
Local dev uses `http://` backend URLs. Deploying without HTTPS would expose auth tokens in transit. **Recommended fix:** Enforce HTTPS at the reverse proxy level; reject HTTP in the backend CORS config.

### L5 — `KINDRIDE_REQUIRE_ID_VERIFIED` Defaults to `false`
Unverified drivers can be matched to passengers unless this flag is manually set. **Recommended fix:** Document this clearly and default to `true` before public launch.

### L6 — Founding Driver Cohort Cutoff is in the Past
`_FOUNDING_COHORT_CUTOFF = datetime(2025, 12, 31, ...)` has already passed. All new drivers will never receive `is_founding_driver=true`. **Recommended fix:** Remove this feature or update the cutoff date.

### L7 — Missing HTTPS on Stripe Webhook Validation
Stripe webhook signature is validated, but if the backend is ever reachable over HTTP, the raw body could be replayed. **Recommended fix:** Verify webhook endpoint is HTTPS-only at the infrastructure level.

---

## To-Do Action List

### Immediate (Before Any Public Launch)

- [ ] **Confirm `.env` files were never committed** — run `git log --all --full-history -- .env backend/.env`
- [ ] **Rotate all secrets** as a precaution: Supabase service role key, JWT secret, Stripe keys, Google Maps API key
- [ ] **Set `ALLOWED_ORIGINS`** in `backend/.env` to your production domain
- [ ] **Set `SHARE_TOKEN_SECRET`** to a permanent random string in `backend/.env`
- [ ] **Set `SOS_EMERGENCY_CONTACTS`** with real phone numbers in `backend/.env`
- [ ] **Add rate limiting** to `/rides/start-search`, `/rides/complete`, `/points/award`, `/passengers/rate`, `/notifications/register-token`

### Short Term (Sprint 1)

- [ ] Add atomic conditional update to ride completion to fix race condition (M1)
- [ ] Block rating submissions when user is not authenticated — remove demo passenger ID fallback (M8)
- [ ] Add fraud check: compare claimed miles against GPS haversine distance on completion (M7)
- [ ] Add SOS idempotency: skip re-sending SMS if last alert was < 60 seconds ago (M6)
- [ ] Add passenger recording consent dialog on first trip (M4)

### Medium Term (Sprint 2)

- [ ] Set up `pg_cron` in Supabase for data retention purges (M5)
- [ ] Migrate ride-share deep links to Universal Links / App Links (M3)
- [ ] Add `/points/preview` endpoint and remove duplicate formula from frontend (M2)
- [ ] Add machine-readable error codes to all API responses (L2)

### Nice to Have

- [ ] Add API version prefix `/v1/` to all routes (L1)
- [ ] Integrate Sentry for error tracking; remove console.log/warn/error from production (L3)
- [ ] Enforce HTTPS at reverse proxy level (L4)
- [ ] Review `KINDRIDE_REQUIRE_ID_VERIFIED` default before public launch (L5)
- [ ] Clean up or update the founding driver cohort cutoff date (L6)

---

## Fixes Already Applied (Summary)

| What | File | Status |
|------|------|--------|
| CORS wildcard removed | `backend/main.py` | ✅ Done |
| Default share secret hardening | `backend/main.py` | ✅ Done |
| `/metrics` requires admin auth | `backend/main.py` | ✅ Done |
| `/logs/recent` requires admin auth + sanitized | `backend/main.py` | ✅ Done |
| SOS duplicate SMS contacts fixed | `backend/sos_routes.py` | ✅ Done |
| SOS user_id removed from response | `backend/sos_routes.py` | ✅ Done |
| SOS input validation (typed location model) | `backend/sos_routes.py` | ✅ Done |
| "Aisha Bello" dummy name removed from all screens | `app/active-trip.tsx`, `app/post-trip-rating.tsx` | ✅ Done |
| Driver routed to correct post-trip screen | `app/active-trip.tsx` | ✅ Done |
| OTP field length fixed for email (6 digits) | `app/sign-in.tsx` | ✅ Done |
| GPS buttons removed — auto-fill on End Trip | `app/active-trip.tsx` | ✅ Done |
| Driver polling reduced 30s → 4s | `app/(tabs)/driver.tsx` | ✅ Done |
| Alert sound added with on/off toggle | `app/(tabs)/driver.tsx` | ✅ Done |

---

*This report covers the state of the codebase as of 2026-04-02. Re-audit recommended after each major feature addition.*
