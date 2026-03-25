export type DriverTier = "Helper" | "Good Samaritan" | "Champion" | "Leader" | "Elite";

export type DriverCard = {
  id: string;
  name: string;
  tier: DriverTier;
  etaMinutes: number;
  distanceMiles: number;
  intent: "already_going" | "detour";
};

const TIERS = new Set<DriverTier>([
  "Helper",
  "Good Samaritan",
  "Champion",
  "Leader",
  "Elite",
]);

/** Same catalog as backend `/matching/demo-drivers` when offline or unauthenticated. */
export const FALLBACK_DEMO_DRIVERS: DriverCard[] = [
  {
    id: "1",
    name: "Aisha Bello",
    tier: "Champion",
    etaMinutes: 4,
    distanceMiles: 1.1,
    intent: "already_going",
  },
  {
    id: "2",
    name: "Daniel Kim",
    tier: "Good Samaritan",
    etaMinutes: 6,
    distanceMiles: 1.8,
    intent: "detour",
  },
  {
    id: "3",
    name: "Grace Martin",
    tier: "Leader",
    etaMinutes: 7,
    distanceMiles: 2.2,
    intent: "already_going",
  },
];

export function parseDriverCardsFromApi(data: unknown): DriverCard[] | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
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
    out.push({
      id,
      name,
      tier: tier as DriverTier,
      etaMinutes,
      distanceMiles,
      intent,
    });
  }
  return out.length > 0 ? out : null;
}
