-- ── Ride Context ─────────────────────────────────────────────────────────────
-- Tracks whether a ride was taken in hub mode (no points, counts toward hub
-- analytics) or open/free-tier mode (earns Kind Points, platform-wide pool).

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS ride_context  text    NOT NULL DEFAULT 'open'
    CHECK (ride_context IN ('hub', 'open')),
  ADD COLUMN IF NOT EXISTS context_hub_id uuid   REFERENCES public.hubs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rides.ride_context IS
  'open = free tier, earns Kind Points; hub = hub subscription, no points';
COMMENT ON COLUMN public.rides.context_hub_id IS
  'The hub this ride was made under (set when ride_context = hub)';

CREATE INDEX IF NOT EXISTS rides_ride_context_idx     ON public.rides(ride_context);
CREATE INDEX IF NOT EXISTS rides_context_hub_id_idx   ON public.rides(context_hub_id);
