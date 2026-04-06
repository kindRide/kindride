-- =============================================================================
-- recording_cleanup_cron.sql
-- Scheduled cleanup of expired trip recordings (pg_cron).
--
-- Prerequisites:
--   1. pg_cron extension enabled in Supabase Dashboard → Extensions.
--   2. trip_recordings table exists (see trip_recordings.sql).
--   3. Supabase Storage bucket "trip-recordings" must be set to private.
--
-- Apply via Supabase Dashboard → SQL Editor.
-- =============================================================================

-- Enable pg_cron (idempotent — safe to run if already enabled).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role (required by Supabase hosted pg_cron).
GRANT USAGE ON SCHEMA cron TO postgres;

-- ---------------------------------------------------------------------------
-- Job 1: Delete expired recording metadata rows (and log Storage keys to
--         delete). Runs daily at 02:00 UTC.
--
-- NOTE: Actual Storage file deletion (removing objects from the
--       "trip-recordings" bucket) must be handled by a separate process
--       (Edge Function or backend cron) that calls the Storage API.
--       This job cleans the metadata table so the backend knows which
--       Storage keys are no longer referenced.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'kindride-recording-cleanup',        -- job name (unique)
    '0 2 * * *',                         -- daily at 02:00 UTC
    $$
    DELETE FROM public.trip_recordings
    WHERE retain_until < NOW();
    $$
);

-- ---------------------------------------------------------------------------
-- Job 2: Delete expired ride-integrity rows older than 90 days to prevent
--         unbounded table growth. Runs weekly on Sunday at 03:00 UTC.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'kindride-integrity-prune',
    '0 3 * * 0',
    $$
    DELETE FROM public.ride_integrity
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND validation_flags = '{}';   -- keep flagged rows indefinitely
    $$
);

-- ---------------------------------------------------------------------------
-- Verify jobs were registered.
-- ---------------------------------------------------------------------------
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname LIKE 'kindride-%';
