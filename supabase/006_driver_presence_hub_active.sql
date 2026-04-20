-- Migration 006: Add hub_active flag to driver_presence
-- When a driver sets hub_active = false, they appear on the platform
-- as a regular member only — no Hub badge, no Hub broadcast notification.
-- Run in Supabase SQL Editor.

ALTER TABLE driver_presence
  ADD COLUMN IF NOT EXISTS hub_active boolean NOT NULL DEFAULT true;
