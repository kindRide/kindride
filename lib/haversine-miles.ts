/**
 * Great-circle distance between two WGS84 points (straight line on Earth).
 * Road distance is often ~1.1–1.4× this in urban areas; passengers can edit miles.
 */
export type LatLng = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_MI = 3958.7613;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const h = sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_MI * c;
}

/** Clamp to backend-friendly leg range; bump tiny noise to minimum. */
export function clampLegMilesStraightLine(mi: number): number {
  if (!Number.isFinite(mi) || mi <= 0) return 0.1;
  if (mi < 0.1) return 0.1;
  if (mi > 500) return 500;
  return Math.round(mi * 100) / 100;
}
