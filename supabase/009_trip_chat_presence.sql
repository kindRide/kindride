-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: Trip chat typing-presence table
-- Tracks per-user typing state for the in-trip chat screen.
-- Safe to re-run (IF NOT EXISTS + idempotent policy drops).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trip_chat_presence (
  ride_id     text      NOT NULL,
  user_id     uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_typing   boolean   NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_id, user_id)
);

-- Enable realtime so the app receives instant UPDATE events
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_chat_presence;

-- Enable RLS
ALTER TABLE public.trip_chat_presence ENABLE ROW LEVEL SECURITY;

-- Each user may read all presence rows for a given ride (needed to show "typing…")
DROP POLICY IF EXISTS "trip_chat_presence_select" ON public.trip_chat_presence;
CREATE POLICY "trip_chat_presence_select"
  ON public.trip_chat_presence
  FOR SELECT
  TO authenticated
  USING (true);

-- Each user may only insert/update their own row
DROP POLICY IF EXISTS "trip_chat_presence_upsert_own" ON public.trip_chat_presence;
CREATE POLICY "trip_chat_presence_upsert_own"
  ON public.trip_chat_presence
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast ride-scoped queries
CREATE INDEX IF NOT EXISTS trip_chat_presence_ride_idx
  ON public.trip_chat_presence (ride_id);

COMMENT ON TABLE public.trip_chat_presence IS
  'Stores live typing indicators for in-trip chat. Rows are upserted by the app every ~2 s while typing and cleared on send/blur.';
