# Day 3 QA Run Log

Linked contract: `docs/RIDE_LIFECYCLE_CONTRACT.md` (Day 3 Manual QA Sweep Script)

## Quick Commands

```bash
# Backend (new terminal)
cd backend
python -m unittest tests.test_ride_transition_contract -v
uvicorn main:app --reload --port 8000

# App (new terminal from repo root)
npx expo start
```

### PowerShell Variants (Windows)

```powershell
# Backend (new terminal)
Set-Location backend
python -m unittest tests.test_ride_transition_contract -v
uvicorn main:app --reload --port 8000

# App (new terminal from repo root)
Set-Location "C:\Users\mcfem\OneDrive\Desktop\AWS_Training\MYprivateRideProject\KindRide"
npx expo start
```

## Run Metadata

- Date/Time: 2026-04-15 16:32:45 +02:00
- Branch: `main`
- Base commit (short): `bae1208`
- Tester: _fill in_
- Passenger user: _fill in_
- Driver user: _fill in_
- Environment (web/ios/android/device): _fill in_

## Case 1 - requested -> expired (driver viewing request)

- Status: TODO (PASS / FAIL)
- Notes:
  - 

## Case 2 - requested -> cancelled (during polling)

- Status: TODO (PASS / FAIL)
- Notes:
  - 

## Case 3 - 409 conflict with eventual accepted

- Status: TODO (PASS / FAIL)
- Notes:
  - 

## Case 4 - wrong-account / unauthorized status fetch

- Status: TODO (PASS / FAIL)
- Notes:
  - 

## Issues Found

- Issue 1:
  - Repro:
  - Expected:
  - Actual:
  - Severity:
  - Owner:

## Follow-Up Actions

- [ ] Fix issue(s) from this run
- [ ] Re-run failed case(s)
- [ ] Update `PROJECT_STATUS.md` with Day 3 QA outcomes
