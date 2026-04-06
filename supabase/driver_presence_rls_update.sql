-- Allow drivers to UPDATE their own driver_presence row (required for client heartbeat upserts).
-- Run in Supabase SQL Editor after driver_presence.sql.

drop policy if exists "driver_presence_update_self" on public.driver_presence;

create policy "driver_presence_update_self"
on public.driver_presence
for update
to authenticated
using (auth.uid() = driver_id)
with check (auth.uid() = driver_id);
