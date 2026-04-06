-- KindRide P2.4: Founding driver cohort + institutional hub membership.
-- Run in Supabase SQL Editor after driver_presence.sql and identity_verification.sql. Safe to re-run.

-- ── Founding Driver ──────────────────────────────────────────────────────────
-- Drivers who register during the founding window earn a permanent badge.
alter table public.driver_presence
  add column if not exists is_founding_driver boolean not null default false;

comment on column public.driver_presence.is_founding_driver
  is 'True when driver joined during the founding cohort window (set server-side at first presence upsert).';

-- ── Institutional Hubs ───────────────────────────────────────────────────────
create table if not exists public.hubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,  -- short join code, e.g. "CAMPUS2025"
  hub_type    text not null default 'campus'
                check (hub_type in ('campus', 'hospital', 'corporate', 'community')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.hubs is
  'Institutional / community hub registry. Drivers and passengers join via a hub code.';

-- Join codes are public-readable so the app can validate them.
alter table public.hubs enable row level security;

drop policy if exists "hubs_select_authenticated" on public.hubs;
create policy "hubs_select_authenticated"
on public.hubs for select to authenticated using (true);

-- Service role manages hub rows.
drop policy if exists "hubs_service_all" on public.hubs;
create policy "hubs_service_all"
on public.hubs for all using (true) with check (true);

-- Add hub membership to driver_presence.
alter table public.driver_presence
  add column if not exists hub_id uuid references public.hubs(id) on delete set null;

comment on column public.driver_presence.hub_id
  is 'Institutional hub this driver is affiliated with (null = independent).';

create index if not exists driver_presence_hub_idx
  on public.driver_presence (hub_id) where hub_id is not null;

-- ── Founding cohort trigger ───────────────────────────────────────────────────
-- On the very first INSERT into driver_presence, auto-set is_founding_driver=true
-- if the wall-clock time is before the founding cohort cutoff (2025-12-31).
create or replace function public.handle_founding_driver()
returns trigger as $$
begin
  if TG_OP = 'INSERT' and now() < '2026-01-01 00:00:00+00'::timestamptz then
    NEW.is_founding_driver := true;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists founding_driver_trigger on public.driver_presence;
create trigger founding_driver_trigger
  before insert on public.driver_presence
  for each row execute function public.handle_founding_driver();
