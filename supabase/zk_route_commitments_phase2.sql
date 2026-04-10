-- KindRide Feature 5 Phase 2: protocol fields needed for client signatures and server verification.
-- Apply after `supabase/zk_route_commitments.sql`.

ALTER TABLE public.route_commitments
  ADD COLUMN IF NOT EXISTS signed_payload TEXT,
  ADD COLUMN IF NOT EXISTS device_public_key TEXT,
  ADD COLUMN IF NOT EXISTS signature_algorithm TEXT NOT NULL DEFAULT 'ecdsa-p256-sha256',
  ADD COLUMN IF NOT EXISTS nonce TEXT;

COMMENT ON COLUMN public.route_commitments.signed_payload
  IS 'Canonical JSON payload that the client signed during the initial corridor commitment.';

COMMENT ON COLUMN public.route_commitments.device_public_key
  IS 'Client device public signing key (JSON Web Key string) used to verify commitment and attestation signatures.';

COMMENT ON COLUMN public.route_commitments.signature_algorithm
  IS 'Current signing scheme for route commitments. Phase 2 uses ecdsa-p256-sha256.';

COMMENT ON COLUMN public.route_commitments.nonce
  IS 'Client-generated nonce bound into the original commitment payload.';
