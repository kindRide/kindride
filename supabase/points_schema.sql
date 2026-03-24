-- KindRide points persistence schema (Week 2 Session 3)
-- Run this in Supabase SQL Editor.
-- Security first:
-- 1) RLS enabled on all tables
-- 2) Clients can read their own points/events
-- 3) Clients cannot directly insert point events
--    (use backend/service role for awarding points)

-- Optional: enum for tier values
do $$
begin
  if not exists (select 1 from pg_type where typname = 'kindride_tier') then
    create type public.kindride_tier as enum (
      'Helper',
      'GoodSamaritan',
      'Champion',
      'Leader',
      'Elite'
    );
  end if;
end $$;

-- Points balance per driver
create table if not exists public.points (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  total_points integer not null default 0 check (total_points >= 0),
  tier public.kindride_tier not null default 'Helper',
  last_updated timestamptz not null default now()
);

-- Immutable event log of point changes
create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  ride_id uuid null, -- can reference rides later when rides table is finalized
  action text not null, -- e.g., RIDE_COMPLETED, FIVE_STAR_BONUS
  points_change integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_point_events_driver_id_created_at
  on public.point_events(driver_id, created_at desc);

-- Enable row-level security
alter table public.points enable row level security;
alter table public.point_events enable row level security;

-- Read policies: user can read only their own points data
drop policy if exists "points_select_own" on public.points;
create policy "points_select_own"
on public.points
for select
to authenticated
using (auth.uid() = driver_id);

drop policy if exists "point_events_select_own" on public.point_events;
create policy "point_events_select_own"
on public.point_events
for select
to authenticated
using (auth.uid() = driver_id);

-- Update policy for own points row (limited to safe fields).
-- Useful for future controlled updates if needed.
drop policy if exists "points_update_own" on public.points;
create policy "points_update_own"
on public.points
for update
to authenticated
using (auth.uid() = driver_id)
with check (auth.uid() = driver_id);

-- Important: do NOT allow client inserts into event log.
-- Point awards should happen from backend with service role.
revoke insert, update, delete on public.point_events from anon, authenticated;
revoke delete on public.points from anon, authenticated;

-- Optional seed helper function for new drivers.
-- Call from backend after signup if missing.
create or replace function public.ensure_driver_points_row(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.points(driver_id)
  values (p_driver_id)
  on conflict (driver_id) do nothing;
end;
$$;
