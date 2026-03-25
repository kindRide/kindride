-- KindRide: per-leg distance + zero-detour flag on rides (audit + reporting)
-- Run in Supabase SQL Editor after rides / journeys migrations. Safe to re-run.

alter table public.rides add column if not exists distance_miles double precision;
alter table public.rides add column if not exists was_zero_detour boolean;

comment on column public.rides.distance_miles is 'Passenger-reported or future GPS-derived miles for THIS leg (pickup to dropoff segment).';
comment on column public.rides.was_zero_detour is 'True when driver was already going this way (minimal detour), matches intent / scoring multiplier.';
