-- KindRide P2.1: Stripe Identity verification gating for drivers.
-- Run in Supabase SQL Editor after driver_presence.sql. Safe to re-run.

-- Add identity fields to driver_presence.
alter table public.driver_presence
  add column if not exists id_verified boolean not null default false,
  add column if not exists stripe_identity_session_id text;

comment on column public.driver_presence.id_verified
  is 'True when driver has completed Stripe Identity (or equivalent) verification.';
comment on column public.driver_presence.stripe_identity_session_id
  is 'Stripe Identity verification session ID — audit trail only.';

-- Index for matching filter (verified-first sort).
create index if not exists driver_presence_verified_idx
  on public.driver_presence (id_verified, is_available);
