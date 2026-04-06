-- KindRide driver presence (geo + availability) for real matching (MVP v1).
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / DROP POLICY).

create table if not exists public.driver_presence (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  tier text not null default 'Helper',
  intent text not null default 'already_going'
    check (intent in ('already_going', 'detour')),
  heading_direction text not null default 'north'
    check (heading_direction in ('north', 'south', 'east', 'west')),
  current_lat float8 null,
  current_lng float8 null,
  is_available boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists driver_presence_available_idx
  on public.driver_presence (is_available, updated_at desc);

alter table public.driver_presence enable row level security;

-- Anyone authenticated can read available drivers for matching (tighten later).
drop policy if exists "driver_presence_select_authenticated" on public.driver_presence;
create policy "driver_presence_select_authenticated"
on public.driver_presence
for select
to authenticated
using (true);

-- Drivers can upsert their own presence row (used by future driver app background ping).
drop policy if exists "driver_presence_upsert_self" on public.driver_presence;
create policy "driver_presence_upsert_self"
on public.driver_presence
for insert
to authenticated
with check (auth.uid() = driver_id);

-- Trigger to update location geometry when lat/lng change
create or replace function update_driver_location()
returns trigger as $$
begin
  if NEW.current_lat is not null and NEW.current_lng is not null then
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.current_lng, NEW.current_lat), 4326);
  else
    NEW.location = null;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger driver_presence_location_trigger
  before insert or update on public.driver_presence
  for each row execute function update_driver_location();

