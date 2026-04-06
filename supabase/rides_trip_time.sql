-- KindRide: ride start time + computed trip duration (audit)
-- Run in Supabase SQL Editor after rides_schema.sql. Safe to re-run.

alter table public.rides add column if not exists started_at timestamptz;

-- Store numeric duration for analytics and sorting.
alter table public.rides
  add column if not exists trip_duration_seconds integer
  generated always as (
    case
      when started_at is null or completed_at is null then null
      else greatest(0, floor(extract(epoch from (completed_at - started_at)))::int)
    end
  ) stored;

-- Store a human-friendly mm:ss (e.g., 12:02) for easy auditing.
-- NOTE: Generated columns must be IMMUTABLE; formatting functions like to_char/make_interval are not.
-- So we maintain this via a trigger instead.
alter table public.rides drop column if exists trip_duration_mmss;
alter table public.rides add column if not exists trip_duration_mmss text;

create or replace function public._kindride_set_trip_duration_mmss()
returns trigger
language plpgsql
as $$
declare
  seconds int;
  mins int;
  secs int;
begin
  if new.started_at is null or new.completed_at is null then
    new.trip_duration_mmss := null;
    return new;
  end if;

  seconds := greatest(0, floor(extract(epoch from (new.completed_at - new.started_at)))::int);
  mins := seconds / 60;
  secs := seconds % 60;

  new.trip_duration_mmss := lpad(mins::text, 2, '0') || ':' || lpad(secs::text, 2, '0');
  return new;
end;
$$;

drop trigger if exists kindride_set_trip_duration_mmss on public.rides;
create trigger kindride_set_trip_duration_mmss
before insert or update of started_at, completed_at
on public.rides
for each row
execute function public._kindride_set_trip_duration_mmss();

comment on column public.rides.started_at is 'When passenger is considered "in car" / trip begins (set by app).';
comment on column public.rides.trip_duration_seconds is 'Computed seconds from started_at to completed_at.';
comment on column public.rides.trip_duration_mmss is 'Computed mm:ss duration from started_at to completed_at.';

