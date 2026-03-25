import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { awardPoints } from "@/lib/points-award";

export default function PostTripRatingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rideId?: string; driverName?: string }>();

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
  const currentUserRole: "driver" | "passenger" = "driver";
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [pointsSource, setPointsSource] = useState<"backend" | "local">("local");
  const [creditedDriverId, setCreditedDriverId] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<"" | "unauthorized" | "network_or_server">("");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (rating < 1) return;
    setIsSubmitting(true);

    const result = await awardPoints({
      rideId,
      rating,
      wasZeroDetour: true,
      distanceMiles: 2.2,
    });

    setEarnedPoints(result.pointsEarned);
    setPointsSource(result.source);
    setCreditedDriverId(result.source === "backend" ? result.creditedDriverId ?? null : null);
    setFallbackReason(result.source === "local" ? (result.fallbackReason ?? "network_or_server") : "");
    setFallbackMessage(
      result.source === "local" && result.fallbackReason === "unauthorized"
        ? "You are not signed in on this device. Points shown are local only. Sign in on the Points tab to sync with backend."
        : result.source === "local"
          ? "Backend is temporarily unavailable. Points shown are local fallback."
          : ""
    );
    setSubmitted(true);
    setIsSubmitting(false);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Rate Your Trip</Text>
      <Text style={styles.subtitle}>How was your ride with {driverName}?</Text>

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

      <Link href="/(tabs)" style={styles.skipLink}>
        Skip
      </Link>

      {submitted ? (
        <View style={styles.successBlock}>
          <Text style={styles.successText}>Thanks! Your rating has been recorded.</Text>
          {currentUserRole === "driver" ? (
            <>
              <Text style={styles.pointsText}>You earned +{earnedPoints} points</Text>
              <Text style={styles.sourceText}>
                Source: {pointsSource === "backend" ? "Backend API" : "Local fallback"}
              </Text>
              {fallbackMessage ? (
                <Text style={styles.fallbackMessage}>{fallbackMessage}</Text>
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
  skipLink: {
    marginTop: 14,
    textAlign: "center",
    color: "#4b587c",
    fontSize: 15,
    fontWeight: "600",
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
});
