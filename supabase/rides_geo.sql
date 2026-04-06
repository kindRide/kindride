-- KindRide: persist pickup + destination coordinates on rides
-- Run in Supabase SQL Editor after rides_schema.sql (and safe to re-run).

alter table public.rides add column if not exists pickup_lat double precision;
alter table public.rides add column if not exists pickup_lng double precision;

alter table public.rides add column if not exists dropoff_lat double precision;
alter table public.rides add column if not exists dropoff_lng double precision;

alter table public.rides add column if not exists destination_lat double precision;
alter table public.rides add column if not exists destination_lng double precision;
alter table public.rides add column if not exists destination_label text;

comment on column public.rides.pickup_lat is 'Pickup latitude for this leg/trip.';
comment on column public.rides.pickup_lng is 'Pickup longitude for this leg/trip.';
comment on column public.rides.dropoff_lat is 'Actual drop-off latitude for THIS leg (where the driver left the passenger).';
comment on column public.rides.dropoff_lng is 'Actual drop-off longitude for THIS leg (where the driver left the passenger).';
comment on column public.rides.destination_lat is 'Final destination latitude (point B).';
comment on column public.rides.destination_lng is 'Final destination longitude (point B).';
comment on column public.rides.destination_label is 'Human-readable destination label (typed address or formatted address).';
