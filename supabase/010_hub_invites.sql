-- ── Hub Invites ───────────────────────────────────────────────────────────────
-- Secure, single-use or time-limited invite tokens for Community Hubs.
-- Replaces permanent share links which could be forwarded indefinitely.

create table if not exists hub_invites (
  id           uuid        primary key default gen_random_uuid(),
  hub_id       uuid        not null references hubs(id) on delete cascade,
  token        text        not null unique default encode(gen_random_bytes(24), 'base64url'),
  created_by   uuid        not null references profiles(id),
  label        text,                          -- optional note e.g. "Orientation Week 2025"
  max_uses     int         not null default 1, -- 1 = single-use; set higher for batch events
  use_count    int         not null default 0,
  expires_at   timestamptz,                   -- null = no expiry (relies on max_uses only)
  created_at   timestamptz not null default now()
);

-- Track who used each invite (for audit trail)
create table if not exists hub_invite_uses (
  id         uuid        primary key default gen_random_uuid(),
  invite_id  uuid        not null references hub_invites(id) on delete cascade,
  used_by    uuid        not null references profiles(id),
  used_at    timestamptz not null default now(),
  unique (invite_id, used_by)   -- one person can only consume a given invite once
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists hub_invites_hub_id_idx  on hub_invites(hub_id);
create index if not exists hub_invites_token_idx   on hub_invites(token);
create index if not exists hub_invite_uses_invite_idx on hub_invite_uses(invite_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table hub_invites      enable row level security;
alter table hub_invite_uses  enable row level security;

-- Hub admins can create invites for their own hub
create policy "hub_admin_create_invite" on hub_invites
  for insert with check (
    exists (
      select 1 from hub_members
      where hub_members.hub_id  = hub_invites.hub_id
        and hub_members.user_id = auth.uid()
        and hub_members.role    = 'hub_admin'
        and hub_members.is_active = true
    )
  );

-- Hub admins can read invites for their own hub
create policy "hub_admin_read_invites" on hub_invites
  for select using (
    exists (
      select 1 from hub_members
      where hub_members.hub_id  = hub_invites.hub_id
        and hub_members.user_id = auth.uid()
        and hub_members.role    = 'hub_admin'
        and hub_members.is_active = true
    )
  );

-- Hub admins can delete (revoke) invites for their own hub
create policy "hub_admin_delete_invite" on hub_invites
  for delete using (
    exists (
      select 1 from hub_members
      where hub_members.hub_id  = hub_invites.hub_id
        and hub_members.user_id = auth.uid()
        and hub_members.role    = 'hub_admin'
        and hub_members.is_active = true
    )
  );

-- Any authenticated user can insert their own use record (backend validates token first)
create policy "user_log_invite_use" on hub_invite_uses
  for insert with check (used_by = auth.uid());

-- Users can read their own use records
create policy "user_read_own_uses" on hub_invite_uses
  for select using (used_by = auth.uid());
