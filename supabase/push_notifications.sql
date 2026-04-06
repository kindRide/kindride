-- KindRide push notifications schema
-- Run in Supabase SQL Editor.
-- Stores Expo push tokens for sending notifications to users.

create table if not exists public.push_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_token text not null,
  updated_at timestamptz not null default now()
);

-- Enable row-level security
alter table public.push_tokens enable row level security;

-- Users can read/write only their own push tokens
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
on public.push_tokens
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
on public.push_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
on public.push_tokens
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Service role can read all tokens (for sending notifications)
drop policy if exists "push_tokens_select_service" on public.push_tokens;
create policy "push_tokens_select_service"
on public.push_tokens
for select
to service_role
using (true);