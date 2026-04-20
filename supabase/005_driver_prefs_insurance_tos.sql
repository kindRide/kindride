-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Driver passenger preferences + insurance declaration + ToS
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Terms of Service acceptance tracking
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tos_accepted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS tos_version      text;

-- 2. Driver: what type of passengers they prefer to help
--    no_preference  = everyone welcome (default)
--    women_only     = women and girls only (religious/personal preference)
--    elderly        = older adults (60+) preferred
--    children_teens = children / teenagers (must be accompanied) preferred
--    women_children = women and children preferred
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS passenger_preference text
    NOT NULL DEFAULT 'no_preference'
    CHECK (passenger_preference IN (
      'no_preference',
      'women_only',
      'elderly',
      'children_teens',
      'women_children'
    ));

-- 3. Driver insurance declaration (self-declared; verified by admin)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS insurance_confirmed  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_expiry     date;

-- 4. Index for matching queries that filter on passenger_preference
CREATE INDEX IF NOT EXISTS idx_profiles_passenger_preference
  ON profiles (passenger_preference);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: existing policies on profiles already cover these columns since
-- they are part of the same row. No new policies needed.
-- Users can read/update their own profile row (handled by existing RLS).
-- ─────────────────────────────────────────────────────────────────────────────
