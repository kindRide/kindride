import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { shouldPromptPassengerRating } from "@/lib/passenger-rating-prompt";
import { supabase } from "@/lib/supabase";

export default function ActiveTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ driverName?: string; passengerId?: string }>();
  const driverName =
    typeof params.driverName === "string" && params.driverName.length > 0
      ? params.driverName
      : "Aisha Bello";
  const passengerId =
    typeof params.passengerId === "string" && params.passengerId.length > 0
      ? params.passengerId
      : undefined;
  const [secondsLeft, setSecondsLeft] = useState(120); // 2:00
  // Unique id for THIS trip session (used as `idempotency_key` on the backend).
  // We generate a real UUIDv4 so we can store it in `point_events.ride_id` (uuid column).
  const [rideId] = useState(() => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return Math.floor(v).toString(16);
    });
  });

  const [isCompletingRide, setIsCompletingRide] = useState(false);
  const [passengerRep, setPassengerRep] = useState<{
    total_score: number;
    rating_count: number;
  } | null>(null);

  const pointsApiUrl = process.env.EXPO_PUBLIC_POINTS_API_URL;
  const ridesCompleteEndpoint = pointsApiUrl
    ? pointsApiUrl.replace("/points/award", "/rides/complete")
    : undefined;

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPassengerRep() {
      if (!passengerId || !pointsApiUrl) {
        setPassengerRep(null);
        return;
      }
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const token = sessionResult?.data.session?.access_token;
      if (!token) return;
      const url = pointsApiUrl.replace(
        "/points/award",
        `/passengers/${encodeURIComponent(passengerId)}/reputation`
      );
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as {
          total_score?: number;
          rating_count?: number;
        };
        if (!cancelled) {
          setPassengerRep({
            total_score: Number(j.total_score ?? 0),
            rating_count: Number(j.rating_count ?? 0),
          });
        }
      } catch {
        if (!cancelled) setPassengerRep(null);
      }
    }
    loadPassengerRep();
    return () => {
      cancelled = true;
    };
  }, [passengerId, pointsApiUrl]);

  const boardingTimeText = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  const tripStatus =
    secondsLeft > 0 ? `Boarding now (${boardingTimeText})` : "Trip in Progress";

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Active Trip</Text>
        <Pressable style={styles.sosButton}>
          <Text style={styles.sosButtonText}>SOS</Text>
        </Pressable>
      </View>

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderTitle}>Map Placeholder</Text>
        <Text style={styles.mapPlaceholderText}>
          Live map and moving driver marker will be added in the next phase.
        </Text>
      </View>

      <View style={styles.bottomCard}>
        <Text style={styles.driverName}>Driver: {driverName}</Text>
        <Text style={styles.meta}>Car: Toyota Camry - Blue</Text>
        <Text style={styles.meta}>ETA to pickup: 2 mins</Text>
        {passengerRep && passengerRep.rating_count > 0 ? (
          <Text style={styles.repText}>
            Passenger community score: {passengerRep.total_score} · from{" "}
            {passengerRep.rating_count} driver rating
            {passengerRep.rating_count === 1 ? "" : "s"}
          </Text>
        ) : passengerId ? (
          <Text style={styles.repHint}>Passenger profile: no ratings yet (or sign in to load).</Text>
        ) : null}
        <Text style={styles.statusText}>{tripStatus}</Text>
        <Pressable
          onPress={async () => {
            if (isCompletingRide) return;
            if (!ridesCompleteEndpoint) {
              Alert.alert(
                "Backend not configured",
                "EXPO_PUBLIC_POINTS_API_URL is missing, so we cannot mark the ride as completed."
              );
              return;
            }

            try {
              setIsCompletingRide(true);
              const sessionResult = supabase
                ? await supabase.auth.getSession()
                : null;
              const accessToken = sessionResult?.data.session?.access_token;

              const response = await fetch(ridesCompleteEndpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({
                  rideId,
                  wasZeroDetour: true,
                  distanceMiles: 2.2,
                  ...(passengerId ? { passengerId } : {}),
                }),
              });

              if (!response.ok) {
                throw new Error(`Ride completion failed (${response.status})`);
              }

              const promptPassenger =
                Boolean(passengerId) && shouldPromptPassengerRating(rideId);

              if (promptPassenger) {
                router.push({
                  pathname: "/rate-passenger",
                  params: { rideId, passengerId: passengerId!, driverName },
                });
              } else {
                router.push({
                  pathname: "/post-trip-rating",
                  params: { rideId, driverName },
                });
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : "Ride completion failed.";
              Alert.alert(
                "Could not complete ride",
                message +
                  "\n\nIf you see 401, sign in on the Points tab before testing."
              );
            } finally {
              setIsCompletingRide(false);
            }
          }}
          disabled={isCompletingRide}
          style={styles.endTripButton}
        >
          <Text style={styles.endTripButtonText}>
            {isCompletingRide ? "Completing..." : "End Trip"}
          </Text>
        </Pressable>
      </View>

      <Link href="/(tabs)/ride-request" style={styles.link}>
        Back to Ride Request
      </Link>
      <Link href="/(tabs)" style={styles.linkSecondary}>
        Go to Home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8faff",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
  },
  sosButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sosButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  mapPlaceholder: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    backgroundColor: "#eaf0ff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  mapPlaceholderTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2a44",
  },
  mapPlaceholderText: {
    marginTop: 8,
    textAlign: "center",
    color: "#4b587c",
    fontSize: 15,
  },
  bottomCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6ebf5",
    backgroundColor: "#ffffff",
    padding: 14,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2a44",
  },
  meta: {
    marginTop: 6,
    fontSize: 14,
    color: "#4b587c",
  },
  repText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#0f766e",
  },
  repHint: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748b",
  },
  statusText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f766e",
  },
  endTripButton: {
    marginTop: 14,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  endTripButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  link: {
    marginTop: 12,
    textAlign: "center",
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
  linkSecondary: {
    marginTop: 8,
    textAlign: "center",
    color: "#4b587c",
    fontSize: 15,
    fontWeight: "600",
  },
});
