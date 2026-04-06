-- Feature 3: Trip Event Logging Pipeline (Phase 1)
-- Stores privacy-safe analytics records emitted by the backend ride completion task.
-- Includes one-way hashed session IDs and noised geographic route vectors.

CREATE TABLE IF NOT EXISTS public.trip_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,          -- Opaque SHA-256 hash of rideId:passengerId:driverId
    route_vector JSONB NOT NULL,              -- JSON containing differential-noised pickup/dropoff coords
    deviation_delta NUMERIC,                  -- Deviation delta (stubbed to intent for now)
    time_flag VARCHAR(50),                    -- 'normal' or 'abnormal_duration'
    sos_ping_count INTEGER DEFAULT 0,         -- Count of SOS triggers during the session
    trust_anchor_score NUMERIC,               -- Trust Anchor proximity score (Feature 2)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.trip_analytics ENABLE ROW LEVEL SECURITY;

-- The backend service role emits the analytics
CREATE POLICY "Service role can insert trip analytics"
    ON public.trip_analytics
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Only admins can query analytics (using the 'admin' role check, or service role)
CREATE POLICY "Service role can view trip analytics"
    ON public.trip_analytics
    FOR SELECT
    TO service_role
    USING (true);