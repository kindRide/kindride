# Ride Lifecycle Contract

This contract defines canonical ride states, allowed transitions, and expected API behavior for lifecycle endpoints.

## Canonical Statuses

- `searching`: Passenger has started a ride search session.
- `requested`: Passenger has requested a specific driver and is waiting for response.
- `accepted`: Driver accepted the request.
- `in_progress`: Optional active-trip marker after boarding.
- `completed`: Ride leg is finished.
- `declined`: Driver declined the request.
- `expired`: Driver did not respond before `request_expires_at`.
- `cancelled`: Passenger/system cancelled before completion.

## Allowed Transitions

| From | Action | To | Endpoint |
|---|---|---|---|
| `searching` | request specific driver | `requested` | `POST /rides/request-driver` |
| `declined` | request next driver | `requested` | `POST /rides/request-driver` |
| `expired` | request next driver | `requested` | `POST /rides/request-driver` |
| `requested` | same driver retries request | `requested` | `POST /rides/request-driver` (idempotent refresh) |
| `requested` | requested driver accepts | `accepted` | `POST /rides/respond` (`accept=true`) |
| `requested` | requested driver declines | `declined` | `POST /rides/respond` (`accept=false`) |
| `accepted` | trip progresses | `in_progress` | internal/app-driven |
| `accepted` | complete ride | `completed` | `POST /rides/complete` |
| `in_progress` | complete ride | `completed` | `POST /rides/complete` |

## Transition Rules

- `POST /rides/request-driver` is only valid from `searching`, `declined`, or `expired`.
- `POST /rides/respond` is only valid when row is still `requested` and `pending_driver_id` matches the caller.
- `POST /rides/complete` is valid from `accepted` or `in_progress` for assigned driver or passenger.
- `POST /rides/complete` from `searching`/`requested` is only allowed for the passenger legacy flow.
- `declined`/`expired`/`cancelled` rides cannot be completed.

## Conflict Error Contract (HTTP 409)

Lifecycle conflicts return details prefixed with `Transition blocked:` and include status context. This behavior is centralized in backend code via `_ride_transition_conflict_detail(...)`.

Examples:

- `Transition blocked: ride is already requested with another driver.`
- `Transition blocked: no pending request (status=searching). The request may have expired (~1 minute) or been reset by the passenger.`
- `Transition blocked: declined rides cannot be completed.`

## Race-Safety Notes

- Driver respond writes are atomic against `id`, `status=requested`, and `pending_driver_id=caller`.
- If a race occurs after read, APIs return deterministic conflict details rather than ambiguous generic errors.
- Frontend should re-fetch status on `409` for accept flows to resolve idempotent success cases.

## Endpoint Test Checklist (Day 2)

Use this as the fast regression matrix when updating lifecycle code.

| Endpoint | Pre-status | Expected | Notes |
|---|---|---|---|
| `POST /rides/request-driver` | `searching` | `200`, status `requested` | baseline request path |
| `POST /rides/request-driver` | `declined` | `200`, status `requested` | next-driver retry |
| `POST /rides/request-driver` | `expired` | `200`, status `requested` | request after timeout |
| `POST /rides/request-driver` | `requested` (different driver pending) | `409` + `Transition blocked:` | cannot override active pending request |
| `POST /rides/respond` | `requested` + matching `pending_driver_id` | `200`, status `accepted`/`declined` | happy path |
| `POST /rides/respond` | non-`requested` | `409` + `Transition blocked:` | stale/expired/terminal state |
| `POST /rides/respond` | race changed row before update | `409` + `Transition blocked:` OR idempotent accept | deterministic race behavior |
| `POST /rides/complete` | `accepted`/`in_progress` | `200`, status `completed` | standard completion |
| `POST /rides/complete` | `declined`/`expired`/`cancelled` | `409` + `Transition blocked:` | terminal-state guard |

### Automated coverage in repo

- `backend/tests/test_ride_transition_contract.py` validates conflict-message stability.

### Run command

```bash
cd backend
python -m unittest tests.test_ride_transition_contract -v
```

## Day 3 Manual QA Sweep Script

Use this script when validating expiry/cancel reliability and race handling across passenger and driver flows.

### Preconditions

- Backend running with latest `backend/main.py`.
- App running on at least one passenger session and one driver session.
- Both users authenticated with valid Supabase JWT sessions.
- `rides_lifecycle.sql` already applied.

### Case 1 - `requested -> expired` while driver sees request

**Goal:** confirm stale requests do not allow late accept/decline and UX stays clear.

1. Passenger requests a driver and does not respond further.
2. Driver opens incoming request card and waits for timeout (`request_expires_at`).
3. Observe driver request card/countdown behavior after expiry.
4. Attempt Accept/Decline immediately after expiry.

**Expected:**

- Driver card auto-disappears or actions disable as expired.
- If action is attempted near race boundary, backend returns conflict (`Transition blocked:`) and UI does not enter active trip incorrectly.
- Passenger remains in retry-able flow (next driver / request again).

### Case 2 - `requested -> cancelled` during polling

**Goal:** confirm cancellation propagates cleanly to both sides.

1. Passenger requests driver.
2. Before driver accepts, passenger cancels/reset request path.
3. Driver keeps incoming screen/dashboard open.

**Expected:**

- Driver side eventually shows non-pending state (`cancelled` or equivalent no-action state).
- Driver cannot submit successful accept on cancelled request.
- UI copy explains no pending action instead of generic failure.

### Case 3 - `409` conflict with eventual `accepted`

**Goal:** confirm idempotent/racy accept still lands in active trip.

1. Driver taps Accept under spotty network (or double-tap race simulation).
2. Ensure one accept succeeds server-side but client receives `409` on one path.
3. Observe incoming ride screen behavior after `409`.

**Expected:**

- Client re-fetches status.
- If ride is already accepted by current driver, app routes to active trip.
- No dead-end warning banner requiring manual recovery.

### Case 4 - wrong-account / unauthorized status fetch

**Goal:** confirm auth boundary errors are actionable and safe.

1. Open incoming ride with a driver account that is not pending/assigned.
2. Poll status or attempt respond.

**Expected:**

- Backend returns 403 with explicit context.
- UI shows error banner/warning without crashing or navigating to active trip.
- User can back out and re-open with correct account.

### Result capture template

Use this quick template per run:

```text
Date:
Build/Commit:
Passenger user:
Driver user:

Case 1 (requested->expired): PASS/FAIL
Notes:

Case 2 (requested->cancelled): PASS/FAIL
Notes:

Case 3 (409 then accepted): PASS/FAIL
Notes:

Case 4 (wrong account auth): PASS/FAIL
Notes:

Follow-up fixes:
```
