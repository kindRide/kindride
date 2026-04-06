import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useStripe } from "@stripe/stripe-react-native";

import {
  getJourneysCompleteUrlOrNull,
  getJourneysRegisterUrlOrNull,
  getTipsCreateUrlOrNull,
} from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { createJourneyId } from "@/lib/journey-id";
import type { TravelDirection } from "@/lib/matching-drivers";
import { awardPoints } from "@/lib/points-award";
import { supabase } from "@/lib/supabase";

// Preset tip amounts in cents. Passenger picks one or skips.
const TIP_PRESETS = [
  { label: "$1", cents: 100 },
  { label: "$2", cents: 200 },
  { label: "$5", cents: 500 },
];

export default function PostTripRatingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    rideId?: string;
    driverId?: string;
    driverName?: string;
    journeyId?: string;
    legIndex?: string;
    passengerId?: string;
    distanceMiles?: string;
    wasZeroDetour?: string;
    destinationDirection?: string;
    destinationLat?: string;
    destinationLng?: string;
    destinationLabel?: string;
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
      : t("yourDriverFallback", "your driver");
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
  const canContinueJourney = Boolean(journeyId && passengerIdParam);

  const completedLegMiles = (() => {
    const raw = typeof params.distanceMiles === "string" ? params.distanceMiles : "";
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  const completedWasZeroDetour =
    typeof params.wasZeroDetour === "string" ? params.wasZeroDetour === "true" : true;
  const destinationDirection = (() => {
    const raw = typeof params.destinationDirection === "string" ? params.destinationDirection : "";
    return raw === "north" || raw === "south" || raw === "east" || raw === "west"
      ? (raw as TravelDirection)
      : "north";
  })();
  const destinationLat = typeof params.destinationLat === "string" ? params.destinationLat : "";
  const destinationLng = typeof params.destinationLng === "string" ? params.destinationLng : "";
  const destinationLabel = typeof params.destinationLabel === "string" ? params.destinationLabel : "";

  const nextLegHref = {
    pathname: "/next-leg-request" as const,
    params: {
      journeyId,
      passengerId: passengerIdParam,
      legIndex: String(legIdx + 1),
      destinationDirection,
      ...(destinationLat ? { destinationLat } : {}),
      ...(destinationLng ? { destinationLng } : {}),
      ...(destinationLabel ? { destinationLabel } : {}),
    },
  };

  // This screen is used in the passenger flow (passenger rates driver),
  // but we still show the points impact for the driver for demo clarity.
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
  const [isRegisteringJourney, setIsRegisteringJourney] = useState(false);

  // Voluntary tip state — only shown after rating is submitted.
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [selectedTipCents, setSelectedTipCents] = useState<number | null>(null);
  const [tipStatus, setTipStatus] = useState<"idle" | "loading" | "success" | "skipped" | "error">("idle");
  const [tipError, setTipError] = useState<string | null>(null);
  const tipsUrl = getTipsCreateUrlOrNull();

  const handleFindNextDriver = async () => {
    if (!passengerIdParam) return;

    // If a journeyId already exists, keep using it.
    if (journeyId) {
      router.push(nextLegHref);
      return;
    }

    const url = getJourneysRegisterUrlOrNull();
    if (!url) {
      Alert.alert(t("notConfiguredTitle"), t("notConfiguredBody"));
      return;
    }
    if (!supabase) {
      Alert.alert(t("signInTitle"), t("signInToContinueJourneyBody"));
      return;
    }

    setIsRegisteringJourney(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error(t("signInToFindNextDriverBody"));
      }
      const newJourneyId = createJourneyId();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ journeyId: newJourneyId }),
      });
      const raw = await response.text().catch(() => "");
      if (!response.ok) {
        throw new Error(formatBackendErrorBody(raw, response.status));
      }
      router.push({
        pathname: "/next-leg-request",
        params: {
          journeyId: newJourneyId,
          passengerId: passengerIdParam,
          legIndex: String(legIdx + 1),
          destinationDirection,
          ...(destinationLat ? { destinationLat } : {}),
          ...(destinationLng ? { destinationLng } : {}),
          ...(destinationLabel ? { destinationLabel } : {}),
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : t("couldNotStartMultiLeg", "Could not start a multi-leg journey.");
      Alert.alert(t("nextDriverTitle"), message);
    } finally {
      setIsRegisteringJourney(false);
    }
  };

  const handleCompleteJourney = async () => {
    if (!journeyId) return;
    const url = getJourneysCompleteUrlOrNull();
    if (!url) {
      Alert.alert(t("notConfiguredTitle"), t("notConfiguredBody"));
      return;
    }
    if (!supabase) {
      Alert.alert(t("signInTitle"), t("signInToEndJourneyBody"));
      return;
    }
    setIsEndingJourney(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error(t("signInToEndJourneyBody"));
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
      const message = e instanceof Error ? e.message : t("couldNotCompleteJourney", "Could not complete journey.");
      Alert.alert(t("journeyNotClosedTitle"), message);
    } finally {
      setIsEndingJourney(false);
    }
  };

  const handleTip = async (cents: number) => {
    if (!tipsUrl || !supabase) return;
    const driverId = typeof params.driverId === "string" ? params.driverId : "";
    if (!driverId) {
      setTipError("Driver info unavailable — tip cannot be processed.");
      setTipStatus("error");
      return;
    }
    setTipStatus("loading");
    setTipError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Sign in to send a tip.");
      const res = await fetch(tipsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ride_id: rideId, driver_id: driverId, amount_cents: cents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "Could not create tip.");

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.client_secret,
        merchantDisplayName: "KindRide",
        returnURL: "kindride://tip/return",
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === "Canceled") {
          setTipStatus("skipped");
        } else {
          throw new Error(presentError.message);
        }
      } else {
        setTipStatus("success");
      }
    } catch (e) {
      setTipError(e instanceof Error ? e.message : "Tip failed.");
      setTipStatus("error");
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
        wasZeroDetour: completedWasZeroDetour,
        distanceMiles: completedLegMiles,
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
          ? t("fallbackUnauthorizedMessage")
          : result.source === "local"
            ? t("fallbackNetworkMessage")
            : ""
      );
      setSubmitted(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : t("pointsAwardFailed", "Points award failed.");
      Alert.alert(t("couldNotAwardPointsTitle"), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t("rateYourTripTitle")}</Text>
      <Text style={styles.subtitle}>{t("rateYourTripSubtitle", { driverName })}</Text>
      {journeyId && passengerIdParam ? (
        <Text style={styles.multiLegHint}>
          Multi-leg trip (leg {legIdx}). Continue to your next driver, or confirm you have arrived.
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
        placeholder={t("optionalReviewPlaceholder")}
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
          {isSubmitting ? t("submitting") : t("submitRating")}
        </Text>
      </Pressable>

      <View style={styles.skipRow}>
        {canContinueJourney ? (
          <Pressable
            onPress={handleFindNextDriver}
            disabled={isRegisteringJourney}
            style={styles.skipSecondaryPress}
          >
            <Text style={styles.skipSecondaryText}>
              {isRegisteringJourney ? t("starting") : t("continueTripSkipRating")}
            </Text>
          </Pressable>
        ) : null}
        <Link href="/(tabs)" style={styles.skipLink}>
          {t("skipToHome")}
        </Link>
      </View>

      {submitted ? (
        <View style={styles.successBlock}>
          <Text style={styles.successText}>{t("ratingRecordedThanks")}</Text>
          <>
            <Text style={styles.pointsText}>{t("driverBonusEarned", { points: earnedPoints })}</Text>
            <Text style={styles.sourceText}>
              {t("source", { source: pointsSource === "backend" ? t("sourceBackend") : t("sourceLocalFallback") })}
            </Text>
            {fallbackMessage ? (
              <Text style={styles.fallbackMessage}>{fallbackMessage}</Text>
            ) : null}
            {backendErrorDetail && pointsSource === "local" ? (
              <Text style={styles.backendErrorDetail}>
                {t("details", { detail: backendErrorDetail })}
              </Text>
            ) : null}
            {pointsSource === "backend" && creditedDriverId ? (
              <Text style={styles.creditText}>
                {t("creditedToDriverId", { id: creditedDriverId.slice(-6) })}
              </Text>
            ) : null}
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/points",
                  params: {
                    earned: String(earnedPoints),
                    role: "driver",
                    source: pointsSource,
                    fallbackReason,
                  },
                })
              }
              style={styles.pointsButton}
            >
              <Text style={styles.pointsButtonText}>{t("viewPoints")}</Text>
            </Pressable>
            {canContinueJourney ? (
              <>
                <Pressable
                  onPress={handleFindNextDriver}
                  disabled={isRegisteringJourney}
                  style={styles.nextLegButton}
                >
                  <Text style={styles.nextLegButtonText}>{t("continueTripNextDriver")}</Text>
                </Pressable>
                {journeyId ? (
                  <Pressable
                    onPress={handleCompleteJourney}
                    disabled={isEndingJourney}
                    style={[styles.destButton, isEndingJourney && styles.destButtonDisabled]}
                  >
                    <Text style={styles.destButtonText}>
                      {isEndingJourney ? t("closing") : t("reachedDestination")}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </>
          {/* Voluntary tip — shown only after rating, never prompted by driver */}
          {tipsUrl && tipStatus !== "success" && tipStatus !== "skipped" ? (
            <View style={styles.tipBlock}>
              <Text style={styles.tipTitle}>Leave a voluntary tip?</Text>
              <Text style={styles.tipHint}>
                100% goes to {driverName}. Completely optional — drivers never see whether you tipped.
              </Text>
              <View style={styles.tipRow}>
                {TIP_PRESETS.map(({ label, cents }) => (
                  <Pressable
                    key={cents}
                    style={[styles.tipBtn, selectedTipCents === cents && styles.tipBtnSelected]}
                    onPress={() => setSelectedTipCents(cents)}
                  >
                    <Text style={[styles.tipBtnText, selectedTipCents === cents && styles.tipBtnTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {tipError ? <Text style={styles.tipError}>{tipError}</Text> : null}
              <View style={styles.tipActions}>
                <Pressable
                  style={[styles.tipSendBtn, (!selectedTipCents || tipStatus === "loading") && styles.tipSendBtnDisabled]}
                  disabled={!selectedTipCents || tipStatus === "loading"}
                  onPress={() => selectedTipCents && handleTip(selectedTipCents)}
                >
                  <Text style={styles.tipSendBtnText}>
                    {tipStatus === "loading" ? "Processing…" : `Send tip${selectedTipCents ? ` (${TIP_PRESETS.find(p => p.cents === selectedTipCents)?.label})` : ""}`}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setTipStatus("skipped")}>
                  <Text style={styles.tipSkip}>No thanks</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {tipStatus === "success" ? (
            <Text style={styles.tipSuccess}>Tip sent — thank you for your kindness!</Text>
          ) : null}

          <Pressable onPress={() => router.replace("/(tabs)")} style={styles.homeButton}>
            <Text style={styles.homeButtonText}>{t("backToHome")}</Text>
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
    marginTop: 8,
    fontSize: 13,
    color: "#0f766e",
    fontWeight: "600",
    lineHeight: 19,
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
    paddingVertical: 11,
    minWidth: 220,
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
    fontSize: 14,
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
    paddingVertical: 11,
    paddingHorizontal: 18,
    minWidth: 190,
    alignItems: "center",
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
    paddingVertical: 11,
    paddingHorizontal: 18,
    minWidth: 190,
    alignItems: "center",
  },
  homeButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  nextLegButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 18,
    minWidth: 220,
    alignItems: "center",
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
    paddingVertical: 11,
    paddingHorizontal: 18,
    minWidth: 220,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
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
  tipBlock: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#86efac",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#166534",
  },
  tipHint: {
    fontSize: 12,
    color: "#4b587c",
    textAlign: "center",
    lineHeight: 17,
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
  },
  tipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#86efac",
    backgroundColor: "#fff",
  },
  tipBtnSelected: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  tipBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#166534",
  },
  tipBtnTextSelected: {
    color: "#fff",
  },
  tipActions: {
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  tipSendBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 24,
    minWidth: 200,
    alignItems: "center",
  },
  tipSendBtnDisabled: {
    opacity: 0.45,
  },
  tipSendBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  tipSkip: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "500",
  },
  tipError: {
    color: "#b91c1c",
    fontSize: 12,
    textAlign: "center",
  },
  tipSuccess: {
    color: "#166534",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
});
