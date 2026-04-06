-- Feature 5: Zero-Knowledge Route Corridor Commitment System
-- Based precisely on Section 7.6 Database Schema from the USPTO Provisional Patent

CREATE TABLE IF NOT EXISTS public.route_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    corridor_hash TEXT NOT NULL,                -- 64-character hex HMAC-SHA256 digest
    commitment_sig TEXT NOT NULL,               -- Base64-encoded ECDSA device signature
    corridor_bbox JSONB NOT NULL,               -- Bounding box {minLat, maxLat, minLng, maxLng}
    declared_intent VARCHAR(20) CHECK (declared_intent IN ('zero_detour', 'detour')),
    committed_at TIMESTAMPTZ DEFAULT NOW(),
    attestation_payload TEXT,                   -- Canonical JSON string of the post-trip payload
    attestation_sig TEXT,                       -- Base64-encoded ECDSA attestation signature
    attested_at TIMESTAMPTZ,
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'passed', 'failed')),
    deviation_flag BOOLEAN DEFAULT false,
    multiplier_awarded BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    UNIQUE(ride_id, driver_id)                  -- Enforce 1 commitment per driver per ride
);

-- Enable Row Level Security
ALTER TABLE public.route_commitments ENABLE ROW LEVEL SECURITY;

-- Drivers can only insert and view their own route commitments
CREATE POLICY "Drivers can insert own route commitments"
    ON public.route_commitments
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can view own route commitments"
    ON public.route_commitments
    FOR SELECT
    TO authenticated
    USING (auth.uid() = driver_id);

-- Backend matching server manages verifications and awards
CREATE POLICY "Service role manages route commitments"
    ON public.route_commitments
    TO service_role
    USING (true)
    WITH CHECK (true);