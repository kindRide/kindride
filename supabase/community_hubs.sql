-- Community Hub Phase 1 schema
-- Run this in the Supabase SQL editor.

-- ── hubs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hubs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('university','church','nonprofit','corporate')),
  slug              text NOT NULL UNIQUE,          -- e.g. "umd"
  logo_url          text,
  verified          boolean NOT NULL DEFAULT false,
  subscription_tier text NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free','basic','pro')),
  admin_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- founder approval
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── hub_members ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_members (
  hub_id      uuid NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('member','hub_admin')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  is_active   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (hub_id, user_id)
);

-- ── hub_subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_subscriptions (
  hub_id                  uuid PRIMARY KEY REFERENCES hubs(id) ON DELETE CASCADE,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  plan                    text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','basic','pro')),
  seats                   int NOT NULL DEFAULT 25,
  renews_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS hub_members_user_id_idx ON hub_members(user_id);
CREATE INDEX IF NOT EXISTS hub_members_hub_id_idx  ON hub_members(hub_id);
CREATE INDEX IF NOT EXISTS hubs_slug_idx           ON hubs(slug);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE hubs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_subscriptions ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read verified/approved hubs (needed for /join/:slug screen)
CREATE POLICY "hubs_public_read" ON hubs
  FOR SELECT USING (verified = true AND approved_by IS NOT NULL);

-- Hub admins can read their own hub's full row
CREATE POLICY "hubs_admin_read" ON hubs
  FOR SELECT USING (admin_user_id = auth.uid());

-- Members can read their own membership row
CREATE POLICY "hub_members_self_read" ON hub_members
  FOR SELECT USING (user_id = auth.uid());

-- Members can join (insert their own row) — hub must be approved/verified
CREATE POLICY "hub_members_self_join" ON hub_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM hubs
      WHERE hubs.id = hub_id
        AND hubs.verified = true
        AND hubs.approved_by IS NOT NULL
    )
  );

-- Members can deactivate themselves (soft leave)
CREATE POLICY "hub_members_self_leave" ON hub_members
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Hub admins can read their own subscription
CREATE POLICY "hub_subscriptions_admin_read" ON hub_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hubs
      WHERE hubs.id = hub_id AND hubs.admin_user_id = auth.uid()
    )
  );

-- ── Helper view: current user's active hub memberships ───────────────────────
CREATE OR REPLACE VIEW my_hubs AS
  SELECT
    h.id,
    h.name,
    h.slug,
    h.type,
    h.logo_url,
    h.subscription_tier,
    hm.role,
    hm.joined_at
  FROM hub_members hm
  JOIN hubs h ON h.id = hm.hub_id
  WHERE hm.user_id = auth.uid()
    AND hm.is_active = true;
