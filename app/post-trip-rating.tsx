import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getJourneysCompleteUrlOrNull } from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { awardPoints } from "@/lib/points-award";
import { supabase } from "@/lib/supabase";

export default function PostTripRatingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rideId?: string;
    driverName?: string;
    journeyId?: string;
    legIndex?: string;
    passengerId?: string;
  }>();

  // Fallback rideId if you land on this screen directly (should not happen often).
  // Must be UUIDv4 compatible because backend stores it into `point_events.ride_id` (uuid).
  const fallbackRideId = useState(() => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return Math.floor(v).toString(16);
    });
  })[0];

  const rideId =
    typeof params.rideId === "string" && params.rideId.length > 0
      ? params.rideId
      : fallbackRideId;

  const driverName =
    typeof params.driverName === "string" && params.driverName.length > 0
      ? params.driverName
      : "Aisha Bello";
  const journeyId =
    typeof params.journeyId === "string" && params.journeyId.length > 0 ? params.journeyId : "";
  const passengerIdParam =
    typeof params.passengerId === "string" && params.passengerId.length > 0
      ? params.passengerId
      : "";
  const legIdx = (() => {
    const n = parseInt(typeof params.legIndex === "string" ? params.legIndex : "1", 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  })();
  const isMultiLeg = Boolean(journeyId && passengerIdParam);
  const nextLegHref = {
    pathname: "/next-leg-request" as const,
    params: {
      journeyId,
      passengerId: passengerIdParam,
      legIndex: String(legIdx + 1),
    },
  };

  const currentUserRole: "driver" | "passenger" = "driver";
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [pointsSource, setPointsSource] = useState<"backend" | "local">("local");
  const [creditedDriverId, setCreditedDriverId] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<"" | "unauthorized" | "network_or_server">("");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [backendErrorDetail, setBackendErrorDetail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEndingJourney, setIsEndingJourney] = useState(false);

  const handleCompleteJourney = async () => {
    if (!journeyId) return;
    const url = getJourneysCompleteUrlOrNull();
    if (!url) {
      Alert.alert("Not configured", "Backend URL is missing (EXPO_PUBLIC_POINTS_API_URL).");
      return;
    }
    if (!supabase) {
      Alert.alert("Sign in", "Sign in end this journey on the server.");
      return;
    }
    setIsEndingJourney(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error("Sign in as the passenger to mark your destination.");
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ journeyId }),
      });
      const raw = await response.text().catch(() => "");
      if (!response.ok) {
        throw new Error(formatBackendErrorBody(raw, response.status));
      }
      router.replace("/(tabs)");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not complete journey.";
      Alert.alert("Journey not closed", message);
    } finally {
      setIsEndingJourney(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (rating < 1) return;
    setIsSubmitting(true);

    try {
      const result = await awardPoints({
        rideId,
        rating,
        wasZeroDetour: true,
        distanceMiles: 2.2,
      });

      setEarnedPoints(result.pointsEarned);
      setPointsSource(result.source);
      setCreditedDriverId(
        result.source === "backend" ? result.creditedDriverId ?? null : null
      );
      setFallbackReason(
        result.source === "local"
          ? result.fallbackReason ?? "network_or_server"
          : ""
      );
      setBackendErrorDetail(
        result.source === "local" && result.fallbackReason === "network_or_server"
          ? result.backendErrorDetail ?? null
          : null
      );
      setFallbackMessage(
        result.source === "local" && result.fallbackReason === "unauthorized"
          ? "You are not signed in on this device. Points are local only. Sign in on the Points tab to sync with backend."
          : result.source === "local"
            ? "Backend is temporarily unavailable. Points shown are local fallback."
            : ""
      );
      setSubmitted(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Points award failed.";
      Alert.alert("Could not award points", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Rate Your Trip</Text>
      <Text style={styles.subtitle}>How was your ride with {driverName}?</Text>
      {isMultiLeg ? (
        <Text style={styles.multiLegHint}>
          Multi-leg trip (leg {legIdx}). You can find the next driver after this — or say you’ve arrived.
        </Text>
      ) : null}

      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setRating(star)}>
            <Text style={star <= rating ? styles.starActive : styles.starInactive}>★</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        placeholder="Optional review..."
        value={review}
        onChangeText={setReview}
        multiline
        style={styles.input}
      />

      <Pressable
        onPress={handleSubmit}
        disabled={rating < 1 || isSubmitting}
        style={[styles.submitButton, rating < 1 && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? "Submitting..." : "Submit Rating"}
        </Text>
      </Pressable>

      <View style={styles.skipRow}>
        {isMultiLeg ? (
          <Pressable
            onPress={() => router.push(nextLegHref)}
            style={styles.skipSecondaryPress}
          >
            <Text style={styles.skipSecondaryText}>Find next driver (skip rating)</Text>
          </Pressable>
        ) : null}
        <Link href="/(tabs)" style={styles.skipLink}>
          Skip to home
        </Link>
      </View>

      {submitted ? (
        <View style={styles.successBlock}>
          <Text style={styles.successText}>Thanks! Your rating has been recorded.</Text>
          {currentUserRole === "driver" ? (
            <>
              <Text style={styles.pointsText}>Rating bonus earned: +{earnedPoints} points</Text>
              <Text style={styles.sourceText}>
                Source: {pointsSource === "backend" ? "Backend API" : "Local fallback"}
              </Text>
              {fallbackMessage ? (
                <Text style={styles.fallbackMessage}>{fallbackMessage}</Text>
              ) : null}
              {backendErrorDetail && pointsSource === "local" ? (
                <Text style={styles.backendErrorDetail}>
                  Details: {backendErrorDetail}
                </Text>
              ) : null}
              {pointsSource === "backend" && creditedDriverId ? (
                <Text style={styles.creditText}>
                  Credited to driver id: ...{creditedDriverId.slice(-6)}
                </Text>
              ) : null}
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/points",
                    params: {
                      earned: String(earnedPoints),
                      role: currentUserRole,
                      source: pointsSource,
                      fallbackReason,
                    },
                  })
                }
                style={styles.pointsButton}
              >
                <Text style={styles.pointsButtonText}>View Points</Text>
              </Pressable>
              {isMultiLeg ? (
                <>
                  <Pressable
                    onPress={() => router.push(nextLegHref)}
                    style={styles.nextLegButton}
                  >
                    <Text style={styles.nextLegButtonText}>Find next driver</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCompleteJourney}
                    disabled={isEndingJourney}
                    style={[styles.destButton, isEndingJourney && styles.destButtonDisabled]}
                  >
                    <Text style={styles.destButtonText}>
                      {isEndingJourney ? "Closing…" : "I’ve reached my destination"}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : (
            <Text style={styles.passengerNote}>Points are shown for driver accounts only.</Text>
          )}
          <Pressable onPress={() => router.replace("/(tabs)")} style={styles.homeButton}>
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8faff",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
  },
  subtitle: {
    marginTop: 8,
    color: "#4b587c",
    fontSize: 16,
  },
  multiLegHint: {
    marginTop: 10,
    fontSize: 14,
    color: "#0f766e",
    fontWeight: "600",
    lineHeight: 20,
  },
  starsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    marginBottom: 18,
  },
  starActive: {
    fontSize: 36,
    color: "#f59e0b",
  },
  starInactive: {
    fontSize: 36,
    color: "#cbd5e1",
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 12,
    minHeight: 110,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 15,
    color: "#1f2a44",
  },
  submitButton: {
    marginTop: 14,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  skipRow: {
    marginTop: 14,
    gap: 10,
    alignItems: "center",
  },
  skipLink: {
    textAlign: "center",
    color: "#4b587c",
    fontSize: 15,
    fontWeight: "600",
  },
  skipSecondaryPress: {
    paddingVertical: 6,
  },
  skipSecondaryText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  successText: {
    textAlign: "center",
    color: "#166534",
    fontWeight: "600",
    fontSize: 15,
  },
  successBlock: {
    marginTop: 16,
    alignItems: "center",
    gap: 10,
  },
  pointsText: {
    color: "#0f766e",
    fontWeight: "700",
    fontSize: 16,
  },
  sourceText: {
    color: "#4b587c",
    fontSize: 12,
  },
  fallbackMessage: {
    color: "#9a3412",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 320,
  },
  backendErrorDetail: {
    color: "#7c2d12",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
    maxWidth: 320,
  },
  creditText: {
    color: "#4b587c",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
  pointsButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  pointsButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  passengerNote: {
    color: "#4b587c",
    fontSize: 14,
    textAlign: "center",
  },
  homeButton: {
    backgroundColor: "#0f766e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  homeButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  nextLegButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 4,
  },
  nextLegButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },
  destButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  destButtonDisabled: {
    opacity: 0.55,
  },
  destButtonText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },
});
