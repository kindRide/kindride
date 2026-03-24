-- Idempotent points awards (run once in Supabase SQL Editor)
-- Purpose: prevent the same trip from awarding points twice if the app
-- retries, the user taps twice, or the network blips and resends the request.

-- 1) Add a stable "idempotency key" per award (we use the client rideId string,
--    e.g. "demo-ride-001" or a real UUID from your rides table later).
alter table public.point_events
  add column if not exists idempotency_key text;

-- 2) Enforce uniqueness: one award row per (driver, idempotency_key).
--    Partial index ignores rows that did not set the key (legacy rows).
create unique index if not exists point_events_driver_idempotency_uniq
  on public.point_events (driver_id, idempotency_key)
  where idempotency_key is not null;
