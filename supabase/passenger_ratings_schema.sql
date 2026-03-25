-- KindRide: driver → passenger face ratings + cumulative reputation
-- Run in Supabase SQL Editor. Safe to re-run where noted.

-- Individual ratings (one row per driver per ride when they submit)
create table if not exists public.passenger_ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null,
  driver_id uuid not null references auth.users (id) on delete cascade,
  passenger_id uuid not null references auth.users (id) on delete cascade,
  face text not null check (face in ('smile', 'neutral', 'sad')),
  score_delta smallint not null check (score_delta in (-1, 0, 1)),
  comment text null,
  created_at timestamptz not null default now(),
  constraint passenger_ratings_driver_ride_uniq unique (driver_id, ride_id)
);

create index if not exists passenger_ratings_passenger_id_idx
  on public.passenger_ratings (passenger_id);

-- Aggregate profile (updated by trigger below)
create table if not exists public.passenger_reputation (
  passenger_id uuid primary key references auth.users (id) on delete cascade,
  total_score int not null default 0,
  rating_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.passenger_ratings enable row level security;
alter table public.passenger_reputation enable row level security;

-- No direct client writes; backend uses service role.
revoke insert, update, delete on public.passenger_ratings from anon, authenticated;
revoke insert, update, delete on public.passenger_reputation from anon, authenticated;

-- Passengers can see their own summary (optional; app may use API instead)
drop policy if exists "passenger_reputation_select_own" on public.passenger_reputation;
create policy "passenger_reputation_select_own"
on public.passenger_reputation
for select
to authenticated
using (auth.uid() = passenger_id);

-- Keep totals in sync when a new rating row is inserted
create or replace function public.bump_passenger_reputation_from_rating ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.passenger_reputation (passenger_id, total_score, rating_count, updated_at)
  values (new.passenger_id, new.score_delta, 1, now())
  on conflict (passenger_id) do update set
    total_score = public.passenger_reputation.total_score + excluded.total_score,
    rating_count = public.passenger_reputation.rating_count + 1,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_passenger_ratings_bump_reputation on public.passenger_ratings;
create trigger trg_passenger_ratings_bump_reputation
after insert on public.passenger_ratings
for each row
execute procedure public.bump_passenger_reputation_from_rating ();
