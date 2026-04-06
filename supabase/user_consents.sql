-- Feature 4: In-App Disclosed Session Recording
-- Stores user consent for trip recording.

create table if not exists public.user_consents (
  id uuid primary key references auth.users(id) on delete cascade,
  recording_consent_given boolean not null default false,
  recording_consent_timestamp timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_consents enable row level security;

-- Users can manage their own consent record.
drop policy if exists "user_consents_manage_own" on public.user_consents;
create policy "user_consents_manage_own"
on public.user_consents
for all
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Function to update the updated_at column
create or replace function public.handle_user_consents_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to call the function on update
drop trigger if exists on_user_consents_updated on public.user_consents;
create trigger on_user_consents_updated
before update on public.user_consents
for each row
execute procedure public.handle_user_consents_updated_at();