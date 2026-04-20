-- Migration 007: Hub access types + member approval status
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Hub access type
--    open   : anyone with the link can self-join instantly (church, community org)
--    closed : join requests require hub admin approval (estate, company)
--    hybrid : open to join, but Hub-priority matching requires admin verification
ALTER TABLE hubs
  ADD COLUMN IF NOT EXISTS access_type text NOT NULL DEFAULT 'open'
    CHECK (access_type IN ('open', 'closed', 'hybrid'));

-- 2. Hub member approval status
--    active  : full Hub member — gets Hub-priority matching and broadcast
--    pending : awaiting hub admin approval (closed/hybrid hubs)
--    rejected: request was declined (informational, not shown in app)
ALTER TABLE hub_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'rejected'));

-- 3. Back-fill: all existing members are already active
UPDATE hub_members SET status = 'active' WHERE status IS NULL;

-- 4. Index for admin approval queue queries
CREATE INDEX IF NOT EXISTS idx_hub_members_status
  ON hub_members (hub_id, status);
