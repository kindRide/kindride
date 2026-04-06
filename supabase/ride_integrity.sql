-- Security Feature 1: Ride Integrity Engine (Anti-Replay / Trip Laundering Guard)
-- Stores cryptographic fingerprints of completed rides to prevent duplicate point claims.

CREATE TABLE IF NOT EXISTS public.ride_integrity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
    fingerprint_hash TEXT NOT NULL,
    completed_auth_token_sub UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pickup_lat FLOAT8 NOT NULL,
    pickup_lng FLOAT8 NOT NULL,
    destination_lat FLOAT8 NOT NULL,
    destination_lng FLOAT8 NOT NULL,
    is_valid BOOLEAN DEFAULT TRUE,
    validation_flags JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ride_id)
);

-- Enable RLS
ALTER TABLE public.ride_integrity ENABLE ROW LEVEL SECURITY;

-- Only backend service role can insert/update/read by default
CREATE POLICY "Service role manages ride integrity"
    ON public.ride_integrity
    TO service_role
    USING (true)
    WITH CHECK (true);