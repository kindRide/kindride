-- KindRide SOS (emergency) requests schema
-- Run in Supabase SQL Editor.
-- Stores emergency SOS requests from users.

create table if not exists public.sos_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location jsonb null, -- {latitude: float, longitude: float}
  message text null,
  status text not null default 'initial' check (status in ('initial', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists sos_requests_user_idx
  on public.sos_requests (user_id, created_at desc);

create index if not exists sos_requests_status_idx
  on public.sos_requests (status, created_at desc);

-- Enable row-level security
alter table public.sos_requests enable row level security;

-- Users can read their own SOS requests
drop policy if exists "sos_requests_select_own" on public.sos_requests;
create policy "sos_requests_select_own"
on public.sos_requests
for select
to authenticated
using (auth.uid() = user_id);

-- Users can insert their own SOS requests
drop policy if exists "sos_requests_insert_own" on public.sos_requests;
create policy "sos_requests_insert_own"
on public.sos_requests
for insert
to authenticated
with check (auth.uid() = user_id);

-- Service role can read all SOS requests (for emergency responders)
drop policy if exists "sos_requests_select_service" on public.sos_requests;
create policy "sos_requests_select_service"
on public.sos_requests
for select
to service_role
using (true);

-- Service role can update SOS requests (to acknowledge/resolve)
drop policy if exists "sos_requests_update_service" on public.sos_requests;
create policy "sos_requests_update_service"
on public.sos_requests
for update
to service_role
using (true);

-- Admins can read all SOS requests
drop policy if exists "sos_requests_select_admin" on public.sos_requests;
create policy "sos_requests_select_admin"
on public.sos_requests
for select
to authenticated
using (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Admins can update all SOS requests
drop policy if exists "sos_requests_update_admin" on public.sos_requests;
create policy "sos_requests_update_admin"
on public.sos_requests
for update
to authenticated
using (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
