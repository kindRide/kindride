-- KindRide P2.2: Trip recording metadata + 72h auto-expiry + flag retention.
-- Run in Supabase SQL Editor after rides_schema.sql. Safe to re-run.
--
-- NOTE: Generated columns cannot use NOW() (it is STABLE, not IMMUTABLE).
-- expires_at and retain_until are computed by a BEFORE INSERT/UPDATE trigger instead.

create table if not exists public.trip_recordings (
  id             uuid primary key default gen_random_uuid(),
  ride_id        uuid not null references public.rides(id) on delete cascade,
  storage_path   text not null,           -- e.g. trip-recordings/{ride_id}.mp4
  uploaded_at    timestamptz not null default now(),
  expires_at     timestamptz not null,    -- set by trigger: uploaded_at + 72h
  flagged        boolean not null default false,
  flagged_at     timestamptz,
  flag_reason    text,
  -- Flagged recordings retained for 30 days; unflagged for 72 h.
  retain_until   timestamptz not null     -- set by trigger
);

-- Trigger function: compute expires_at and retain_until on insert and flag update.
create or replace function public.set_recording_expiry()
returns trigger
language plpgsql
as $$
begin
  new.expires_at   := new.uploaded_at + interval '72 hours';
  new.retain_until := case
    when new.flagged then new.uploaded_at + interval '30 days'
    else new.uploaded_at + interval '72 hours'
  end;
  return new;
end;
$$;

drop trigger if exists trip_recordings_set_expiry on public.trip_recordings;
create trigger trip_recordings_set_expiry
before insert or update on public.trip_recordings
for each row execute function public.set_recording_expiry();

create index if not exists trip_recordings_ride_id_idx     on public.trip_recordings (ride_id);
create index if not exists trip_recordings_retain_until_idx on public.trip_recordings (retain_until);

alter table public.trip_recordings enable row level security;

-- Service role (backend) manages all recording rows.
drop policy if exists "trip_recordings_service_all" on public.trip_recordings;
create policy "trip_recordings_service_all"
on public.trip_recordings
for all
to service_role
using (true)
with check (true);

-- Admins can view all recordings.
drop policy if exists "trip_recordings_admin_select" on public.trip_recordings;
create policy "trip_recordings_admin_select"
on public.trip_recordings
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

comment on table public.trip_recordings is
  'Metadata for in-app trip session recordings. Actual files live in Supabase Storage bucket trip-recordings/. '
  'Auto-expire after 72 h; flagged recordings retained 30 days. Expiry columns are set by trigger.';
