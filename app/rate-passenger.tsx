import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getPassengersRateUrl } from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { supabase } from "@/lib/supabase";

type Face = "smile" | "neutral" | "sad";

export default function RatePassengerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rideId?: string;
    passengerId?: string;
    driverName?: string;
    journeyId?: string;
    legIndex?: string;
  }>();

  const rideId =
    typeof params.rideId === "string" && params.rideId.length > 0
      ? params.rideId
      : "";
  const passengerId =
    typeof params.passengerId === "string" && params.passengerId.length > 0
      ? params.passengerId
      : "";
  const driverName =
    typeof params.driverName === "string" && params.driverName.length > 0
      ? params.driverName
      : "your driver";

  const [face, setFace] = useState<Face | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goToDriverRating = () => {
    const meta: Record<string, string> = {};
    if (typeof params.journeyId === "string" && params.journeyId.length > 0) {
      meta.journeyId = params.journeyId;
    }
    if (typeof params.legIndex === "string" && params.legIndex.length > 0) {
      meta.legIndex = params.legIndex;
    }
    if (passengerId) meta.passengerId = passengerId;
    router.replace({
      pathname: "/post-trip-rating",
      params: { rideId, driverName, ...meta },
    });
  };

  const handleSubmit = async () => {
    if (!face || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) {
        Alert.alert("Sign in required", "Sign in as the driver before submitting.");
        return;
      }
      const endpoint = getPassengersRateUrl();
      const trimmed = comment.trim();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          rideId,
          face,
          comment: trimmed.length > 0 ? trimmed : null,
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(formatBackendErrorBody(raw, response.status));
      }
      goToDriverRating();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save rating.";
      Alert.alert("Rating failed", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!rideId || !passengerId) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Rate passenger</Text>
        <Text style={styles.subtitle}>Missing trip details. Go back and end the trip again.</Text>
        <Link href="/(tabs)" style={styles.link}>
          Home
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>How was this passenger?</Text>
      <Text style={styles.subtitle}>
        We only ask on some trips (~1 in 5) to keep things light. Optional comment below.
      </Text>

      <View style={styles.facesRow}>
        <Pressable
          onPress={() => setFace("smile")}
          style={[styles.faceButton, face === "smile" && styles.faceButtonActive]}
        >
          <Text style={styles.faceEmoji}>😊</Text>
          <Text style={styles.faceLabel}>Great</Text>
        </Pressable>
        <Pressable
          onPress={() => setFace("neutral")}
          style={[styles.faceButton, face === "neutral" && styles.faceButtonActive]}
        >
          <Text style={styles.faceEmoji}>😐</Text>
          <Text style={styles.faceLabel}>Okay</Text>
        </Pressable>
        <Pressable
          onPress={() => setFace("sad")}
          style={[styles.faceButton, face === "sad" && styles.faceButtonActive]}
        >
          <Text style={styles.faceEmoji}>😞</Text>
          <Text style={styles.faceLabel}>Difficult</Text>
        </Pressable>
      </View>

      <TextInput
        placeholder="Optional comment for internal use…"
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={500}
        style={styles.input}
      />

      <Pressable
        onPress={handleSubmit}
        disabled={!face || isSubmitting}
        style={[styles.submitButton, (!face || isSubmitting) && styles.submitDisabled]}
      >
        <Text style={styles.submitText}>{isSubmitting ? "Saving…" : "Submit"}</Text>
      </Pressable>

      <Pressable onPress={goToDriverRating} style={styles.skipPress}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8faff",
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1f2a44",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: "#4b587c",
    lineHeight: 22,
  },
  facesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
    gap: 10,
  },
  faceButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  faceButtonActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  faceEmoji: {
    fontSize: 36,
  },
  faceLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  input: {
    marginTop: 22,
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    backgroundColor: "#fff",
    padding: 12,
    fontSize: 15,
    color: "#1f2a44",
    textAlignVertical: "top",
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  skipPress: {
    marginTop: 14,
    alignItems: "center",
  },
  skipText: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "600",
  },
  link: {
    marginTop: 20,
    textAlign: "center",
    color: "#2563eb",
    fontWeight: "600",
  },
});
