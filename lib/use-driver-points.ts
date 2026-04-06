import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import { supabase } from "@/lib/supabase";

export type DriverPointsData = {
  totalPoints: number;
  tier: string;
  loading: boolean;
  error: string | null;
};

export function useDriverPoints(driverId: string | null): DriverPointsData & { refresh: () => void } {
  const [totalPoints, setTotalPoints] = useState(0);
  const [tier, setTier] = useState("Helper");
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
        // No row exists, use defaults
        setTotalPoints(0);
        setTier("Helper");
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

  return { totalPoints, tier, loading, error, refresh: fetchPoints };
}
