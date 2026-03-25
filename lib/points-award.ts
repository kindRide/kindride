import { getPointsRatingBonusUrl } from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
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
  backendErrorDetail?: string;
};

const calcLocalPoints = (
  rating: number,
  wasZeroDetour: boolean,
  distanceMiles: number
) => {
  // Blueprint-aligned scoring (Phase 4 Step 17):
  // base=10, distance bonus=1 point per mile, zero-detour multiplies subtotal by 1.5,
  // and a 5-star rating adds +5 after the multiplier.
  const basePoints = 10;
  const distanceBonus = distanceMiles * 1.0;
  let subtotal = basePoints + distanceBonus;
  if (wasZeroDetour) subtotal *= 1.5;
  const ratingBonus = rating === 5 ? 5 : 0;
  return Math.round(subtotal + ratingBonus);
};

export async function awardPoints(input: AwardPointsInput): Promise<AwardPointsResult> {
  const endpoint = getPointsRatingBonusUrl();
  // Production hardening: backend is REQUIRED.
  // We do not silently fall back to local points for awarding.
  // If anything fails, we throw and let the UI show an error.

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
      body: JSON.stringify({ rideId: input.rideId, rating: input.rating }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (response.status === 401) {
      throw new Error(
        "Unauthorized: please sign in on the Points tab so backend can award points."
      );
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new Error(formatBackendErrorBody(raw, response.status));
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
      backendErrorDetail: undefined,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Backend points request failed.";
    throw new Error(message);
  }
}
