import { Link, type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getPassengerReputationUrlOrNull,
  getRidesCompleteUrlOrNull,
} from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { clampLegMilesStraightLine, haversineMiles, type LatLng } from "@/lib/haversine-miles";
import { shouldPromptPassengerRating } from "@/lib/passenger-rating-prompt";
import { supabase } from "@/lib/supabase";

export default function ActiveTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    driverName?: string;
    passengerId?: string;
    journeyId?: string;
    legIndex?: string;
    wasZeroDetour?: string;
  }>();
  const driverName =
    typeof params.driverName === "string" && params.driverName.length > 0
      ? params.driverName
      : "Aisha Bello";
  const passengerId =
    typeof params.passengerId === "string" && params.passengerId.length > 0
      ? params.passengerId
      : undefined;
  const journeyId =
    typeof params.journeyId === "string" && params.journeyId.length > 0
      ? params.journeyId
      : undefined;
  const legIndexNum = (() => {
    const raw = typeof params.legIndex === "string" ? params.legIndex : "1";
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  })();

  const wasZeroDetourFromDriver =
    typeof params.wasZeroDetour === "string" && params.wasZeroDetour.length > 0
      ? params.wasZeroDetour === "true"
      : true;

  const backToSearchHref: Href =
    journeyId && passengerId
      ? {
          pathname: "/next-leg-request",
          params: { journeyId, legIndex: String(legIndexNum), passengerId },
        }
      : "/(tabs)/ride-request";
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
  /** Miles for this leg only (pickup → dropoff segment). Entered before End Trip. */
  const [legMilesText, setLegMilesText] = useState("");
  const [wasZeroDetour, setWasZeroDetour] = useState(wasZeroDetourFromDriver);
  const [pickupPoint, setPickupPoint] = useState<LatLng | null>(null);
  const [dropoffPoint, setDropoffPoint] = useState<LatLng | null>(null);
  const [gpsNote, setGpsNote] = useState("");
  const [isGpsBusy, setIsGpsBusy] = useState(false);
  const [passengerRep, setPassengerRep] = useState<{
    total_score: number;
    rating_count: number;
  } | null>(null);

  const ridesCompleteEndpoint = getRidesCompleteUrlOrNull();

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") {
          setGpsNote("Location off or denied — type miles manually, or enable location in settings.");
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setPickupPoint({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setGpsNote("Pickup saved from GPS. At your drop-off, tap “Set drop-off from GPS” below.");
      } catch {
        if (!cancelled) {
          setGpsNote("Could not read pickup GPS — use the button to retry or type miles.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPassengerRep() {
      const url = passengerId ? getPassengerReputationUrlOrNull(passengerId) : null;
      if (!url) {
        setPassengerRep(null);
        return;
      }
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const token = sessionResult?.data.session?.access_token;
      if (!token) return;
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
  }, [passengerId]);

  const boardingTimeText = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  const tripStatus =
    secondsLeft > 0 ? `Boarding now (${boardingTimeText})` : "Trip in Progress";

  const savePickupFromGps = async () => {
    setIsGpsBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location",
          "Allow location to save pickup. You can still enter miles by hand."
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPickupPoint({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      setGpsNote("Pickup updated from GPS. At drop-off, use “Set drop-off from GPS”.");
    } catch {
      setGpsNote("GPS error saving pickup — try again or type miles.");
    } finally {
      setIsGpsBusy(false);
    }
  };

  const saveDropoffAndFillMiles = async () => {
    setIsGpsBusy(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location",
          "Allow location to estimate miles from GPS, or type miles manually."
        );
        return;
      }
      const origin = pickupPoint;
      if (!origin) {
        Alert.alert("Pickup missing", "Save pickup from GPS first (or tap retry below).");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const drop: LatLng = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setDropoffPoint(drop);
      const straightMi = clampLegMilesStraightLine(haversineMiles(origin, drop));
      setLegMilesText(String(straightMi));
      setGpsNote(
        `Straight-line GPS ≈ ${straightMi} mi (roads are often longer — edit the field if needed).`
      );
    } catch {
      Alert.alert("GPS", "Could not read drop-off location.");
    } finally {
      setIsGpsBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Active Trip</Text>
        <Pressable style={styles.sosButton}>
          <Text style={styles.sosButtonText}>SOS</Text>
        </Pressable>
      </View>

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderTitle}>Trip segment</Text>
        <Text style={styles.mapPlaceholderText}>
          Use GPS below for a straight-line mile estimate (road routing can be added later), or type miles
          yourself.
        </Text>
      </View>

      <View style={styles.bottomCard}>
        {journeyId ? (
          <Text style={styles.legLabel}>Multi-leg trip · leg {legIndexNum}</Text>
        ) : null}
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
        <Text style={styles.legDistanceLabel}>This leg’s miles (pickup → your drop-off)</Text>
        {gpsNote ? <Text style={styles.gpsNote}>{gpsNote}</Text> : null}
        {isGpsBusy ? (
          <ActivityIndicator style={styles.gpsSpinner} color="#2563eb" />
        ) : null}
        <View style={styles.gpsButtonsRow}>
          <Pressable
            onPress={savePickupFromGps}
            disabled={isGpsBusy}
            style={[styles.gpsButton, isGpsBusy && styles.gpsButtonDisabled]}
          >
            <Text style={styles.gpsButtonText}>Save pickup GPS</Text>
          </Pressable>
          <Pressable
            onPress={saveDropoffAndFillMiles}
            disabled={isGpsBusy}
            style={[styles.gpsButton, styles.gpsButtonPrimary, isGpsBusy && styles.gpsButtonDisabled]}
          >
            <Text style={styles.gpsButtonPrimaryText}>Set drop-off GPS → miles</Text>
          </Pressable>
        </View>
        {pickupPoint ? (
          <Text style={styles.gpsMeta}>
            Pickup GPS saved
            {dropoffPoint ? " · Drop-off GPS saved" : ""}
          </Text>
        ) : null}
        <TextInput
          value={legMilesText}
          onChangeText={setLegMilesText}
          placeholder="e.g. 2.2"
          keyboardType="decimal-pad"
          style={styles.legMilesInput}
        />
        <Text style={styles.detourHint}>
          Zero/low detour (driver was already heading this way) affects the points multiplier.
        </Text>
        <View style={styles.switchRow}>
          <Switch value={wasZeroDetour} onValueChange={setWasZeroDetour} />
          <Text style={styles.switchLabel}>Minimal detour / already going this way</Text>
        </View>
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

            const normalizedMiles = legMilesText.trim().replace(",", ".");
            const miles = parseFloat(normalizedMiles);
            if (!Number.isFinite(miles) || miles < 0.1 || miles > 500) {
              Alert.alert(
                "Trip distance",
                "Enter miles for this leg only: a number from 0.1 to 500 (e.g. 2.2)."
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
                  wasZeroDetour,
                  distanceMiles: miles,
                  ...(passengerId ? { passengerId } : {}),
                  ...(journeyId ? { journeyId, legIndex: legIndexNum } : {}),
                }),
              });

              const rawErr = await response.text().catch(() => "");
              if (!response.ok) {
                throw new Error(formatBackendErrorBody(rawErr, response.status));
              }

              const promptPassenger =
                Boolean(passengerId) && shouldPromptPassengerRating(rideId);

              const ratingMeta = {
                distanceMiles: String(miles),
                wasZeroDetour: wasZeroDetour ? "true" : "false",
              };
              const tripMeta =
                journeyId && passengerId
                  ? {
                      journeyId,
                      legIndex: String(legIndexNum),
                      passengerId,
                      ...ratingMeta,
                    }
                  : { ...ratingMeta };
              if (promptPassenger) {
                router.push({
                  pathname: "/rate-passenger",
                  params: { rideId, passengerId: passengerId!, driverName, ...tripMeta },
                });
              } else {
                router.push({
                  pathname: "/post-trip-rating",
                  params: { rideId, driverName, ...tripMeta },
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

      <Link href={backToSearchHref} style={styles.link}>
        {journeyId ? "Change driver (back to search)" : "Back to Ride Request"}
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
  legLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f766e",
    marginBottom: 6,
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
  legDistanceLabel: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  gpsNote: {
    marginTop: 8,
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
  gpsSpinner: {
    marginTop: 8,
  },
  gpsButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  gpsButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
    minWidth: "44%",
    flexGrow: 1,
  },
  gpsButtonPrimary: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  gpsButtonDisabled: {
    opacity: 0.55,
  },
  gpsButtonText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
  gpsButtonPrimaryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
  gpsMeta: {
    marginTop: 8,
    fontSize: 12,
    color: "#0f766e",
    fontWeight: "600",
  },
  legMilesInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#1f2a44",
    backgroundColor: "#f8fafc",
  },
  detourHint: {
    marginTop: 10,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 10,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    color: "#334155",
    fontWeight: "500",
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
