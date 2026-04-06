-- KindRide: ride lifecycle for passenger search → request → driver respond → trip.
-- Run in Supabase SQL Editor after rides_schema.sql + rides_geo (and related migrations). Safe to re-run.
--
-- States:
--   searching    Passenger has started a session; browsing drivers.
--   requested    Passenger selected a driver; waiting for accept/decline (see request_expires_at).
--   accepted     Driver accepted; passenger may proceed to Active Trip.
--   in_progress  Optional intermediate (e.g. after boarding); may merge with accepted in app.
--   completed    Leg finished (existing completion flow).
--   declined     Driver declined (legacy single-shot; app may reset to searching via API instead).
--   expired      Request timed out without response.
--   cancelled    Passenger or system cancelled before completion.

-- Allow rides to exist before a driver is assigned (passenger-led flow).
alter table public.rides alter column driver_id drop not null;

alter table public.rides add column if not exists pending_driver_id uuid references auth.users (id) on delete set null;
alter table public.rides add column if not exists request_expires_at timestamptz null;

comment on column public.rides.pending_driver_id is 'Driver UUID currently asked to accept this ride.';
comment on column public.rides.request_expires_at is 'When the pending driver request expires (HTTP API enforces).';

-- Replace status check with expanded lifecycle.
alter table public.rides drop constraint if exists rides_status_check;
alter table public.rides add constraint rides_status_check check (
  status in (
    'searching',
    'requested',
    'accepted',
    'in_progress',
    'completed',
    'declined',
    'expired',
    'cancelled'
  )
);

create index if not exists rides_passenger_status_idx on public.rides (passenger_id, status);
create index if not exists rides_pending_driver_idx on public.rides (pending_driver_id) where pending_driver_id is not null;
