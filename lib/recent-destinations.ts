import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kindride:recent_destinations_v1";
const MAX = 12;

export type RecentDestination = {
  label: string;
  latitude: number;
  longitude: number;
  usedAt: number;
};

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function getRecentDestinations(): Promise<RecentDestination[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): RecentDestination | null => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const lat = toNum(o.latitude);
        const lng = toNum(o.longitude);
        const usedAt = toNum(o.usedAt) ?? 0;
        if (!label || lat === null || lng === null) return null;
        return { label, latitude: lat, longitude: lng, usedAt };
      })
      .filter((row): row is RecentDestination => row !== null)
      .sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0));
  } catch {
    return [];
  }
}

/**
 * Save or bump a destination to the top of recents (deduped by rounded lat/lng + label).
 */
export async function rememberDestination(input: {
  label: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const label = input.label.trim();
  if (!label) return;
  const lat = roundCoord(input.latitude);
  const lng = roundCoord(input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat === 0 && lng === 0) return;

  try {
    const existing = await getRecentDestinations();
    const now = Date.now();
    const next: RecentDestination[] = [
      { label, latitude: lat, longitude: lng, usedAt: now },
      ...existing.filter(
        (d) =>
          !(roundCoord(d.latitude) === lat && roundCoord(d.longitude) === lng) &&
          d.label.toLowerCase() !== label.toLowerCase()
      ),
    ].slice(0, MAX);

    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // non-fatal
  }
}
