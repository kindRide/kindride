import { haversineMiles, type LatLng } from "@/lib/haversine-miles";

export type RoadRouteSummary = {
  distanceMiles: number;
  durationMinutes: number | null;
  source: "google_directions" | "haversine_fallback";
};

function clampMiles(mi: number): number {
  if (!Number.isFinite(mi) || mi <= 0) return 0;
  if (mi > 5000) return 5000;
  return Math.round(mi * 100) / 100;
}

/**
 * Road-route distance/time from Google Directions API when configured.
 * Falls back to straight-line haversine (distance only) when unavailable.
 */
export async function getRoadRouteSummary(from: LatLng, to: LatLng): Promise<RoadRouteSummary> {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  if (!key) {
    const mi = clampMiles(haversineMiles(from, to));
    return { distanceMiles: mi, durationMinutes: null, source: "haversine_fallback" };
  }

  const origin = `${from.latitude},${from.longitude}`;
  const destination = `${to.latitude},${to.longitude}`;
  const url =
    "https://maps.googleapis.com/maps/api/directions/json" +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const resp = await fetch(url);
    const data = (await resp.json()) as {
      status?: string;
      error_message?: string;
      routes?: Array<{
        legs?: Array<{
          distance?: { value?: number };
          duration?: { value?: number };
        }>;
      }>;
    };

    const leg = data.routes?.[0]?.legs?.[0];
    const meters = Number(leg?.distance?.value ?? NaN);
    const seconds = Number(leg?.duration?.value ?? NaN);
    if (
      resp.ok &&
      data.status === "OK" &&
      Number.isFinite(meters) &&
      meters > 0
    ) {
      const miles = clampMiles(meters / 1609.344);
      const durationMinutes = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : null;
      return { distanceMiles: miles, durationMinutes, source: "google_directions" };
    }
    // Fall back quietly (common causes: billing not enabled, API not enabled, OVER_QUERY_LIMIT).
    const mi = clampMiles(haversineMiles(from, to));
    return { distanceMiles: mi, durationMinutes: null, source: "haversine_fallback" };
  } catch {
    const mi = clampMiles(haversineMiles(from, to));
    return { distanceMiles: mi, durationMinutes: null, source: "haversine_fallback" };
  }
}

