import { supabase } from "@/lib/supabase";

type AwardPointsInput = {
  rideId: string;
  driverId?: string;
  rating: number;
  wasZeroDetour: boolean;
  distanceMiles: number;
};

type AwardPointsResult = {
  pointsEarned: number;
  source: "backend" | "local";
  fallbackReason?: "unauthorized" | "network_or_server";
  creditedDriverId?: string;
};

const calcLocalPoints = (rating: number) => {
  const basePoints = 10;
  const fiveStarBonus = rating === 5 ? 5 : 0;
  return basePoints + fiveStarBonus;
};

export async function awardPoints(input: AwardPointsInput): Promise<AwardPointsResult> {
  const endpoint = process.env.EXPO_PUBLIC_POINTS_API_URL;

  if (!endpoint) {
    return {
      pointsEarned: calcLocalPoints(input.rating),
      source: "local",
      fallbackReason: "network_or_server",
    };
  }

  try {
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;

    const controller = new AbortController();
    // First-time JWT verification via JWKS can be slightly slow; give the backend
    // enough time to respond before we fall back to local points.
    const timeoutId = setTimeout(() => controller.abort(), 45_000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (response.status === 401) {
      return {
        pointsEarned: calcLocalPoints(input.rating),
        source: "local",
        fallbackReason: "unauthorized",
      };
    }

    if (!response.ok) {
      throw new Error(`Backend responded ${response.status}`);
    }

    const data = (await response.json()) as {
      points_earned?: number;
      credited_driver_id?: string;
    };
    const pointsEarned = Number(data.points_earned ?? 0);

    if (!Number.isFinite(pointsEarned) || pointsEarned < 0) {
      throw new Error("Invalid points payload");
    }

    return {
      pointsEarned,
      source: "backend",
      creditedDriverId: data.credited_driver_id,
    };
  } catch {
    return {
      pointsEarned: calcLocalPoints(input.rating),
      source: "local",
      fallbackReason: "network_or_server",
    };
  }
}
