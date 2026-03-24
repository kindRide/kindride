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
    };
  }

  try {
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Backend responded ${response.status}`);
    }

    const data = (await response.json()) as { points_earned?: number };
    const pointsEarned = Number(data.points_earned ?? 0);

    if (!Number.isFinite(pointsEarned) || pointsEarned < 0) {
      throw new Error("Invalid points payload");
    }

    return { pointsEarned, source: "backend" };
  } catch {
    return {
      pointsEarned: calcLocalPoints(input.rating),
      source: "local",
    };
  }
}
