-- =============================================================================
-- referral_codes.sql
-- Referral system: unique codes per user, tracking, bonus award on first ride.
-- Apply via Supabase Dashboard → SQL Editor.
-- =============================================================================

-- ── referral_codes ─────────────────────────────────────────────────────────
-- One row per user. Code is generated on first call to /referrals/generate.
CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_codes_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS referral_codes_code_idx ON public.referral_codes (code);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Users can read their own code
DROP POLICY IF EXISTS "referral_codes_select_own" ON public.referral_codes;
CREATE POLICY "referral_codes_select_own"
  ON public.referral_codes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Service role has full access (backend reads/writes)
DROP POLICY IF EXISTS "referral_codes_service_all" ON public.referral_codes;
CREATE POLICY "referral_codes_service_all"
  ON public.referral_codes FOR ALL
  TO service_role USING (true) WITH CHECK (true);


-- ── referral_redemptions ────────────────────────────────────────────────────
-- One row per referred user (one referral per account).
-- bonus_awarded flips to true after the referred user completes their first ride.
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  bonus_awarded   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  awarded_at      TIMESTAMPTZ,
  CONSTRAINT referral_redemptions_referred_unique UNIQUE (referred_id)
);

CREATE INDEX IF NOT EXISTS referral_redemptions_referrer_idx
  ON public.referral_redemptions (referrer_id);

ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "referral_redemptions_service_all" ON public.referral_redemptions;
CREATE POLICY "referral_redemptions_service_all"
  ON public.referral_redemptions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Users can read redemptions where they are the referrer (to see who they recruited)
DROP POLICY IF EXISTS "referral_redemptions_select_referrer" ON public.referral_redemptions;
CREATE POLICY "referral_redemptions_select_referrer"
  ON public.referral_redemptions FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id);
