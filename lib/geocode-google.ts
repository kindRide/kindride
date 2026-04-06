export type GeocodedPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

export type GeocodeGoogleResult =
  | { ok: true; point: GeocodedPoint }
  | { ok: false; status: string; errorMessage?: string };

export async function geocodeAddressGoogle(address: string): Promise<GeocodeGoogleResult> {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return { ok: false, status: "MISSING_KEY", errorMessage: "Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY." };
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;

  const resp = await fetch(url);
  if (!resp.ok) return { ok: false, status: "HTTP_ERROR", errorMessage: `HTTP ${resp.status}` };

  const json: unknown = await resp.json();
  const data = json as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : "";
  const errorMessage = typeof data.error_message === "string" ? data.error_message : undefined;

  if (status !== "OK") return { ok: false, status: status || "UNKNOWN", errorMessage };
  const results = Array.isArray(data.results) ? (data.results as any[]) : [];
  if (!results[0]?.geometry?.location) return { ok: false, status: "NO_GEOMETRY" };

  const lat = Number(results[0].geometry.location.lat);
  const lng = Number(results[0].geometry.location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, status: "BAD_COORDS" };

  const label =
    typeof results[0].formatted_address === "string" && results[0].formatted_address.length > 0
      ? results[0].formatted_address
      : address;

  return { ok: true, point: { latitude: lat, longitude: lng, label } };
}

