-- KindRide: multi-leg journeys (parent) + ride legs
-- Run in Supabase SQL Editor after rides_schema.sql. Safe to re-run.

create table if not exists public.journeys (
  id uuid primary key,
  passenger_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journeys enable row level security;

drop policy if exists "journeys_select_own_passenger" on public.journeys;
create policy "journeys_select_own_passenger"
on public.journeys
for select
to authenticated
using (auth.uid() = passenger_id);

revoke insert, update, delete on public.journeys from anon, authenticated;

-- Each completed row in rides is one leg; journey_id groups legs for handoffs.
alter table public.rides add column if not exists journey_id uuid references public.journeys (id) on delete set null;
alter table public.rides add column if not exists leg_index int not null default 1;
