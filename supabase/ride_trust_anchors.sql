-- Feature 2: Proximity-Verified Trust Anchor (Phase 1)
-- Verifies physical co-location of driver and passenger at trip checkpoints.

CREATE TABLE IF NOT EXISTS public.ride_trust_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Proximity metrics
    checkpoint_type VARCHAR(20) NOT NULL CHECK (checkpoint_type IN ('pickup', 'dropoff')),
    passenger_lat FLOAT8,
    passenger_lng FLOAT8,
    driver_lat FLOAT8,
    driver_lng FLOAT8,
    proximity_meters NUMERIC,
    
    -- Scoring
    trust_score NUMERIC,
    status VARCHAR(20) DEFAULT 'review' CHECK (status IN ('auto-pass', 'review', 'flagged')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ride_id, checkpoint_type)
);

-- Enable Row Level Security
ALTER TABLE public.ride_trust_anchors ENABLE ROW LEVEL SECURITY;

-- Only the backend service role writes to this table
CREATE POLICY "Service role manages trust anchors"
    ON public.ride_trust_anchors
    TO service_role
    USING (true)
    WITH CHECK (true);