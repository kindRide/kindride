import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import { supabase } from "@/lib/supabase";
import { getDriverStreakUrlOrNull } from "@/lib/backend-api-urls";

export type DriverPointsData = {
  totalPoints: number;
  tier: string;
  streakDays: number;
  loading: boolean;
  error: string | null;
};

export function useDriverPoints(driverId: string | null): DriverPointsData & { refresh: () => void } {
  const [totalPoints, setTotalPoints] = useState(0);
  const [tier, setTier] = useState("Helper");
  const [streakDays, setStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPoints = useCallback(async () => {
    if (!supabase || !driverId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Fetch points + tier from Supabase
      const { data, error: fetchError } = await supabase
        .from("points")
        .select("total_points,tier")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (data) {
        setTotalPoints(data.total_points ?? 0);
        setTier(data.tier ?? "Helper");
      } else {
        setTotalPoints(0);
        setTier("Helper");
      }

      // Fetch real streak from backend — non-fatal
      const streakUrl = getDriverStreakUrlOrNull();
      if (streakUrl) {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (token) {
            const res = await fetch(streakUrl, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const json = await res.json();
              setStreakDays(json.streak_days ?? 0);
            }
          }
        } catch {
          // Streak fetch failed — keep 0, don't block
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch points.");
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useFocusEffect(
    useCallback(() => {
      void fetchPoints();
    }, [fetchPoints])
  );

  return { totalPoints, tier, streakDays, loading, error, refresh: fetchPoints };
}
