export type DriverTier = "Helper" | "Good Samaritan" | "Champion" | "Leader" | "Elite";
export type TravelDirection = "north" | "south" | "east" | "west";

export type DriverCard = {
  id: string;
  name: string;
  tier: DriverTier;
  etaMinutes: number;
  distanceMiles: number;
  intent: "already_going" | "detour";
  headingDirection: TravelDirection;
  /** Server-ranked composite score (0–1); absent for offline fallback catalog. */
  matchScore?: number;
  /** True for founding cohort drivers (joined before cutoff). */
  isFoundingDriver?: boolean;
  /** True when driver has completed Stripe Identity verification. */
  idVerified?: boolean;
};

const TIERS = new Set<DriverTier>([
  "Helper",
  "Good Samaritan",
  "Champion",
  "Leader",
  "Elite",
]);

/** Empty fallback — no dummy drivers shown when backend is unavailable. */
export const FALLBACK_DEMO_DRIVERS: DriverCard[] = [];

export function parseDriverCardsFromApi(data: unknown): DriverCard[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  /** Valid API response with zero rows — do not treat as parse failure (avoids stale demo list). */
  if (data.length === 0) {
    return [];
  }
  const out: DriverCard[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const tier = r.tier;
    const etaMinutes = Number(r.etaMinutes);
    const distanceMiles = Number(r.distanceMiles);
    const intent = r.intent;
    const headingDirection =
      r.headingDirection === "north" ||
      r.headingDirection === "south" ||
      r.headingDirection === "east" ||
      r.headingDirection === "west"
        ? r.headingDirection
        : "north";
    if (
      !id ||
      !name ||
      !TIERS.has(tier as DriverTier) ||
      !Number.isFinite(etaMinutes) ||
      !Number.isFinite(distanceMiles) ||
      (intent !== "already_going" && intent !== "detour")
    ) {
      continue;
    }
    const matchScore =
      typeof r.matchScore === "number" && Number.isFinite(r.matchScore) ? r.matchScore : undefined;
    out.push({
      id,
      name,
      tier: tier as DriverTier,
      etaMinutes,
      distanceMiles,
      intent,
      headingDirection,
      ...(matchScore !== undefined ? { matchScore } : {}),
      ...(r.isFoundingDriver === true ? { isFoundingDriver: true } : {}),
      ...(r.idVerified === true ? { idVerified: true } : {}),
    });
  }
  return out.length > 0 ? out : null;
}
