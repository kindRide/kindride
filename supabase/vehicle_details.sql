-- Vehicle details on driver profiles + driver_presence
-- Run in Supabase SQL Editor

-- 1. Add vehicle columns to profiles (source of truth)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS car_make  text,
  ADD COLUMN IF NOT EXISTS car_model text,
  ADD COLUMN IF NOT EXISTS car_color text,
  ADD COLUMN IF NOT EXISTS car_year  text,
  ADD COLUMN IF NOT EXISTS car_plate text;

-- 2. Add vehicle columns to driver_presence (denormalized for fast matching queries)
ALTER TABLE driver_presence
  ADD COLUMN IF NOT EXISTS car_make  text,
  ADD COLUMN IF NOT EXISTS car_model text,
  ADD COLUMN IF NOT EXISTS car_color text,
  ADD COLUMN IF NOT EXISTS car_year  text,
  ADD COLUMN IF NOT EXISTS car_plate text;

-- Index for quick lookup by driver_id in matching
CREATE INDEX IF NOT EXISTS profiles_car_idx ON profiles (id) WHERE car_make IS NOT NULL;
