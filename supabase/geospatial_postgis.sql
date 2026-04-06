-- KindRide geospatial PostGIS setup for improved matching performance
-- Run in Supabase SQL Editor after enabling PostGIS extension
-- This replaces float8 lat/lng columns with PostGIS geometry for spatial queries

-- Enable PostGIS extension (if not already enabled)
create extension if not exists postgis;

-- Add geometry column to driver_presence table
alter table public.driver_presence
add column if not exists location geometry(Point, 4326);

-- Create spatial index for fast proximity queries
create index if not exists driver_presence_location_idx
  on public.driver_presence using gist (location);

-- Update existing rows to populate geometry from lat/lng
update public.driver_presence
set location = ST_SetSRID(ST_MakePoint(current_lng, current_lat), 4326)
where current_lat is not null and current_lng is not null and location is null;

-- Function to find nearby available drivers within radius (in meters)
create or replace function find_nearby_drivers(
  passenger_lat float8,
  passenger_lng float8,
  search_radius_meters float8 default 5000, -- 5km default
  max_results int default 20
)
returns table (
  driver_id uuid,
  display_name text,
  tier text,
  intent text,
  heading_direction text,
  current_lat float8,
  current_lng float8,
  distance_meters float8,
  is_available boolean,
  updated_at timestamptz
) as $$
begin
  return query
  select
    dp.driver_id,
    dp.display_name,
    dp.tier,
    dp.intent,
    dp.heading_direction,
    dp.current_lat,
    dp.current_lng,
    ST_Distance(dp.location, ST_SetSRID(ST_MakePoint(passenger_lng, passenger_lat), 4326)) as distance_meters,
    dp.is_available,
    dp.updated_at
  from public.driver_presence dp
  where
    dp.is_available = true
    and dp.location is not null
    and ST_DWithin(
      dp.location,
      ST_SetSRID(ST_MakePoint(passenger_lng, passenger_lat), 4326),
      search_radius_meters
    )
    and dp.updated_at > (now() - interval '10 minutes') -- recent presence only
  order by distance_meters asc
  limit max_results;
end;
$$ language plpgsql security definer;

-- Grant execute permission to service role
grant execute on function find_nearby_drivers(float8, float8, float8, int) to service_role;