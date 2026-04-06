-- =============================================================================
-- tips_schema.sql
-- Voluntary tip support via Stripe Connect Express.
--
-- Apply via Supabase Dashboard → SQL Editor.
-- =============================================================================

-- Add Stripe Connect account ID to driver presence.
ALTER TABLE public.driver_presence
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

-- -------------------------------------------------------------------------
-- tip_events — one row per completed tip payment.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tip_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id               UUID NOT NULL,
  passenger_id          UUID NOT NULL REFERENCES auth.users(id),
  driver_id             UUID NOT NULL REFERENCES auth.users(id),
  amount_cents          INTEGER NOT NULL CHECK (amount_cents >= 50),  -- Stripe minimum $0.50
  currency              TEXT NOT NULL DEFAULT 'usd',
  stripe_payment_intent TEXT NOT NULL,
  stripe_connect_account TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'succeeded', 'failed')),
  idempotency_key       TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  CONSTRAINT tip_events_idempotency UNIQUE (idempotency_key)
);

-- Index for driver tip history
CREATE INDEX IF NOT EXISTS tip_events_driver_idx ON public.tip_events (driver_id, created_at DESC);

-- -------------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------------
ALTER TABLE public.tip_events ENABLE ROW LEVEL SECURITY;

-- Passengers can see their own tips
CREATE POLICY "passenger_own_tips" ON public.tip_events
  FOR SELECT USING (auth.uid() = passenger_id);

-- Drivers can see tips credited to them
CREATE POLICY "driver_own_tips" ON public.tip_events
  FOR SELECT USING (auth.uid() = driver_id);

-- Only service role can insert/update (backend writes after Stripe confirms)
CREATE POLICY "service_all" ON public.tip_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
