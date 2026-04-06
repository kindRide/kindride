import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { getPassengersRateUrl, getRideStatusUrlOrNull } from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { clearPendingPassengerRating, savePendingPassengerRating } from "@/lib/driver-pending-passenger-rating";
import { supabase } from "@/lib/supabase";

type Face = "smile" | "neutral" | "sad";

export default function RatePassengerScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    rideId?: string;
    passengerId?: string;
    driverName?: string;
    journeyId?: string;
    legIndex?: string;
    distanceMiles?: string;
    wasZeroDetour?: string;
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
      : t("yourDriverFallback");

  const [face, setFace] = useState<Face | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualRideId, setManualRideId] = useState(rideId);
  const [isLoadingRide, setIsLoadingRide] = useState(false);

  const loadRideDetails = async () => {
    if (!manualRideId.trim()) {
      Alert.alert(t("enterRideIdAlertTitle"), t("enterRideIdAlertBody"));
      return;
    }
    setIsLoadingRide(true);
    try {
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) {
        Alert.alert(t("signInRequiredTitle"), t("signInDriverLoadDetails"));
        return;
      }
      const url = getRideStatusUrlOrNull(manualRideId.trim());
      if (!url) {
        Alert.alert(t("notConfiguredTitle"), t("cannotLoadRideDetails"));
        return;
      }
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(formatBackendErrorBody(raw, response.status));
      }
      const data = await response.json();
      if (data.status !== "completed") {
        Alert.alert(t("rideNotCompletedTitle"), t("rideNotCompletedBody"));
        return;
      }
      if (!data.passenger_id) {
        Alert.alert(t("noPassengerTitle"), t("noPassengerBody"));
        return;
      }
      await savePendingPassengerRating({
        rideId: manualRideId.trim(),
        passengerId: String(data.passenger_id),
      });
      router.replace({
        pathname: "/rate-passenger",
        params: {
          rideId: manualRideId.trim(),
          passengerId: String(data.passenger_id),
          driverName: driverName,
          journeyId: params.journeyId,
          legIndex: params.legIndex,
          distanceMiles: params.distanceMiles,
          wasZeroDetour: params.wasZeroDetour,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : t("couldNotLoadRideDetails");
      Alert.alert(t("loadFailedTitle"), message);
    } finally {
      setIsLoadingRide(false);
    }
  };

  const exitToDriverHome = async () => {
    await clearPendingPassengerRating();
    router.replace("/(tabs)/driver");
  };

  const handleSubmit = async () => {
    if (!face || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) {
        Alert.alert(t("signInRequiredTitle"), t("signInDriverSubmit"));
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
      await exitToDriverHome();
    } catch (e) {
      const message = e instanceof Error ? e.message : t("couldNotSaveRating");
      Alert.alert(t("ratingFailedTitle"), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!rideId || !passengerId) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t("ratePassengerTitle")}</Text>
        <Text style={styles.subtitle}>
          {t("enterRideIdSubtitle")}
        </Text>
        <TextInput
          placeholder={t("rideIdPlaceholder")}
          value={manualRideId}
          onChangeText={setManualRideId}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={loadRideDetails}
          disabled={isLoadingRide}
          style={[styles.submitButton, isLoadingRide && styles.submitDisabled]}
        >
          {isLoadingRide ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{t("loadRideButton")}</Text>
          )}
        </Pressable>
        <Link href="/(tabs)" style={styles.link}>
          {t("backToHome")}
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t("howWasPassengerTitle")}</Text>
      <Text style={styles.subtitle}>
        {t("passengerFeedbackSubtitle")}
      </Text>

      <View style={styles.facesRow}>
        <Pressable
          onPress={() => setFace("smile")}
          style={[styles.faceButton, face === "smile" && styles.faceButtonActive]}
        >
          <Text style={styles.faceEmoji}>😊</Text>
          <Text style={styles.faceLabel}>{t("ratingGreat")}</Text>
        </Pressable>
        <Pressable
          onPress={() => setFace("neutral")}
          style={[styles.faceButton, face === "neutral" && styles.faceButtonActive]}
        >
          <Text style={styles.faceEmoji}>😐</Text>
          <Text style={styles.faceLabel}>{t("ratingOkay")}</Text>
        </Pressable>
        <Pressable
          onPress={() => setFace("sad")}
          style={[styles.faceButton, face === "sad" && styles.faceButtonActive]}
        >
          <Text style={styles.faceEmoji}>😞</Text>
          <Text style={styles.faceLabel}>{t("ratingDifficult")}</Text>
        </Pressable>
      </View>

      <TextInput
        placeholder={t("optionalCommentInternal")}
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
        <Text style={styles.submitText}>{isSubmitting ? t("saving") : t("submit")}</Text>
      </Pressable>

      <Pressable onPress={() => void exitToDriverHome()} style={styles.skipPress}>
        <Text style={styles.skipText}>{t("skip")}</Text>
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
