import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import SocialShareSheet from "@/components/SocialShareSheet";
import { useTranslation } from "react-i18next";
import { useStripe } from "@stripe/stripe-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Reanimated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

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

const APPRECIATION_TAGS = [
  { emoji: "🚗", key: "smoothRide" },
  { emoji: "🛡️", key: "superSafe" },
  { emoji: "💬", key: "greatChat" },
  { emoji: "⏱️", key: "onTime" },
  { emoji: "💙", key: "veryKind" },
  { emoji: "🗺️", key: "topNavigator" },
  { emoji: "🎵", key: "greatMusic" },
  { emoji: "✨", key: "aboveAndBeyond" },
];

const TIP_PRESETS = [
  { label: "$1", cents: 100 },
  { label: "$2", cents: 200 },
  { label: "$5", cents: 500 },
];

export default function PostTripRatingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const appreciationLabel = (key: string) => t(`appreciationTag.${key}`);
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

  const fallbackRideId = useState(() =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return Math.floor(v).toString(16);
    })
  )[0];

  const rideId = typeof params.rideId === "string" && params.rideId.length > 0 ? params.rideId : fallbackRideId;
  const driverName = typeof params.driverName === "string" && params.driverName.length > 0
    ? params.driverName : t("yourDriverFallback", "your driver");
  const journeyId = typeof params.journeyId === "string" && params.journeyId.length > 0 ? params.journeyId : "";
  const passengerIdParam = typeof params.passengerId === "string" && params.passengerId.length > 0 ? params.passengerId : "";
  const legIdx = (() => {
    const n = parseInt(typeof params.legIndex === "string" ? params.legIndex : "1", 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  })();
  const canContinueJourney = Boolean(journeyId && passengerIdParam);
  const completedLegMiles = (() => {
    const n = Number(typeof params.distanceMiles === "string" ? params.distanceMiles : "");
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const completedWasZeroDetour =
    typeof params.wasZeroDetour === "string" ? params.wasZeroDetour === "true" : true;
  const destinationDirection = (() => {
    const raw = typeof params.destinationDirection === "string" ? params.destinationDirection : "";
    return raw === "north" || raw === "south" || raw === "east" || raw === "west"
      ? (raw as TravelDirection) : "north";
  })();
  const destinationLat = typeof params.destinationLat === "string" ? params.destinationLat : "";
  const destinationLng = typeof params.destinationLng === "string" ? params.destinationLng : "";
  const destinationLabel = typeof params.destinationLabel === "string" ? params.destinationLabel : "";

  const nextLegHref = {
    pathname: "/next-leg-request" as const,
    params: {
      journeyId, passengerId: passengerIdParam,
      legIndex: String(legIdx + 1), destinationDirection,
      ...(destinationLat ? { destinationLat } : {}),
      ...(destinationLng ? { destinationLng } : {}),
      ...(destinationLabel ? { destinationLabel } : {}),
    },
  };

  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [pointsSource, setPointsSource] = useState<"backend" | "local">("local");
  const [creditedDriverId, setCreditedDriverId] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<"" | "unauthorized" | "network_or_server">("");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEndingJourney, setIsEndingJourney] = useState(false);
  const [isRegisteringJourney, setIsRegisteringJourney] = useState(false);

  // Share prompt — shown on first ride, then every 5th
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [shareDismissed, setShareDismissed] = useState(false);
  const [shareSheetRole, setShareSheetRole] = useState<"driver" | "passenger" | null>(null);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? null);
    });
    AsyncStorage.getItem("kindride_share_count").then((val) => {
      const count = parseInt(val ?? "0", 10);
      if (count === 0 || count % 5 === 0) setShowSharePrompt(true);
    });
  }, []);

  function buildCaption(role: "driver" | "passenger"): string {
    if (role === "driver") {
      return "Gave a free ride today. No fare. No detour. Just two humans being human. 🚗💚\n\nThis is #KindRide — join the movement → kindride.app";
    }
    const name = driverName ? `Shoutout to ${driverName}` : "Shoutout to my KindRide driver";
    return `${name} — gave me a completely free ride and asked for nothing 🙏✨\n\nThis is #KindRide → kindride.app`;
  }

  function openShareSheet(role: "driver" | "passenger") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShareSheetRole(role);
  }

  async function onShareSheetClose() {
    setShareSheetRole(null);
    setShareDismissed(true);
    const val = await AsyncStorage.getItem("kindride_share_count");
    await AsyncStorage.setItem("kindride_share_count", String(parseInt(val ?? "0", 10) + 1));
  }

  // Tip state
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [selectedTipCents, setSelectedTipCents] = useState<number | null>(null);
  const [customTipStr, setCustomTipStr] = useState("");
  const [tipStatus, setTipStatus] = useState<"idle" | "loading" | "success" | "skipped" | "error">("idle");
  const [tipError, setTipError] = useState<string | null>(null);
  const tipsUrl = getTipsCreateUrlOrNull();

  const activeTipCents = (() => {
    if (selectedTipCents !== null) return selectedTipCents;
    const parsed = parseFloat(customTipStr.replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed) && parsed >= 0.5) return Math.round(parsed * 100);
    return null;
  })();

  const handleFindNextDriver = async () => {
    if (!passengerIdParam) return;
    if (journeyId) { router.push(nextLegHref); return; }
    const url = getJourneysRegisterUrlOrNull();
    if (!url) { Alert.alert(t("notConfiguredTitle"), t("notConfiguredBody")); return; }
    if (!supabase) { Alert.alert(t("signInTitle"), t("signInToContinueJourneyBody")); return; }
    setIsRegisteringJourney(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error(t("signInToFindNextDriverBody"));
      const newJourneyId = createJourneyId();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ journeyId: newJourneyId }),
      });
      const raw = await response.text().catch(() => "");
      if (!response.ok) throw new Error(formatBackendErrorBody(raw, response.status));
      router.push({ pathname: "/next-leg-request", params: { journeyId: newJourneyId, passengerId: passengerIdParam, legIndex: String(legIdx + 1), destinationDirection, ...(destinationLat ? { destinationLat } : {}), ...(destinationLng ? { destinationLng } : {}), ...(destinationLabel ? { destinationLabel } : {}) } });
    } catch (e) {
      Alert.alert(t("nextDriverTitle"), e instanceof Error ? e.message : t("couldNotStartMultiLeg", "Could not start a multi-leg journey."));
    } finally { setIsRegisteringJourney(false); }
  };

  const handleCompleteJourney = async () => {
    if (!journeyId) return;
    const url = getJourneysCompleteUrlOrNull();
    if (!url) { Alert.alert(t("notConfiguredTitle"), t("notConfiguredBody")); return; }
    if (!supabase) { Alert.alert(t("signInTitle"), t("signInToEndJourneyBody")); return; }
    setIsEndingJourney(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error(t("signInToEndJourneyBody"));
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ journeyId }),
      });
      const raw = await response.text().catch(() => "");
      if (!response.ok) throw new Error(formatBackendErrorBody(raw, response.status));
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert(t("journeyNotClosedTitle"), e instanceof Error ? e.message : t("couldNotCompleteJourney", "Could not complete journey."));
    } finally { setIsEndingJourney(false); }
  };

  const handleTip = async () => {
    if (!activeTipCents || !tipsUrl || !supabase) return;
    const driverId = typeof params.driverId === "string" ? params.driverId : "";
    if (!driverId) { setTipError("Driver info unavailable — tip cannot be processed."); setTipStatus("error"); return; }
    setTipStatus("loading");
    setTipError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Sign in to send a tip.");
      const res = await fetch(tipsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ride_id: rideId, driver_id: driverId, amount_cents: activeTipCents }),
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
        if (presentError.code === "Canceled") { setTipStatus("skipped"); }
        else { throw new Error(presentError.message); }
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTipStatus("success");
      }
    } catch (e) {
      setTipError(e instanceof Error ? e.message : "Tip failed.");
      setTipStatus("error");
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || rating < 1) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);
    try {
      const result = await awardPoints({ rideId, rating, wasZeroDetour: completedWasZeroDetour, distanceMiles: completedLegMiles });
      setEarnedPoints(result.pointsEarned);
      setPointsSource(result.source);
      setCreditedDriverId(result.source === "backend" ? result.creditedDriverId ?? null : null);
      setFallbackReason(result.source === "local" ? result.fallbackReason ?? "network_or_server" : "");
      setFallbackMessage(
        result.source === "local" && result.fallbackReason === "unauthorized" ? t("fallbackUnauthorizedMessage")
        : result.source === "local" ? t("fallbackNetworkMessage") : ""
      );
      setSubmitted(true);
    } catch (e) {
      Alert.alert(t("couldNotAwardPointsTitle"), e instanceof Error ? e.message : t("pointsAwardFailed", "Points award failed."));
    } finally { setIsSubmitting(false); }
  };

  const initial = driverName.charAt(0).toUpperCase() || "K";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <LinearGradient
            colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Reanimated.View entering={FadeInDown.delay(0).springify()} style={styles.heroInner}>
              <LinearGradient colors={["#0d9488", "#2563eb"]} style={styles.avatar}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </LinearGradient>
              <Text style={styles.heroTitle}>{t("rateYourTripTitle")}</Text>
              <Text style={styles.heroSub}>{t("rateYourTripSubtitle", { driverName })}</Text>
              {journeyId && passengerIdParam ? (
                <View style={styles.legBadge}>
                  <Text style={styles.legBadgeText}>{t("multiLegTripLegHint", { leg: legIdx })}</Text>
                </View>
              ) : null}
            </Reanimated.View>

            {/* Stars */}
            <Reanimated.View entering={FadeInDown.delay(80).springify()} style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => {
                    setRating(star);
                    void Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.star, star <= rating && styles.starActive]}>★</Text>
                </Pressable>
              ))}
            </Reanimated.View>
          </LinearGradient>

          {/* ── Appreciation tags ─────────────────────────────────────────── */}
          {rating >= 1 && !submitted && (
            <Reanimated.View entering={FadeInDown.delay(60).springify()} style={styles.card}>
              <Text style={styles.cardLabel}>{t("whatMadeItGreat")}</Text>
              <View style={styles.tagsWrap}>
                {APPRECIATION_TAGS.map((tag) => {
                  const label = appreciationLabel(tag.key);
                  const selected = selectedTags.includes(label);
                  return (
                    <Pressable
                      key={tag.key}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setSelectedTags((prev) =>
                          selected ? prev.filter((t) => t !== label) : [...prev, label]
                        );
                      }}
                      style={[styles.tag, selected && styles.tagSelected]}
                    >
                      <Text style={styles.tagEmoji}>{tag.emoji}</Text>
                      <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Reanimated.View>
          )}

          {/* ── Review input ─────────────────────────────────────────────── */}
          {!submitted && (
            <Reanimated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
              <TextInput
                placeholder={t("optionalReviewPlaceholder")}
                value={review}
                onChangeText={setReview}
                multiline
                style={styles.input}
                placeholderTextColor="#94a3b8"
              />
              <Pressable
                onPress={handleSubmit}
                disabled={rating < 1 || isSubmitting}
                style={[styles.primaryBtn, (rating < 1 || isSubmitting) && styles.btnDisabled]}
              >
                <LinearGradient
                  colors={rating >= 1 ? ["#0d9488", "#0369a1"] : ["#cbd5e1", "#cbd5e1"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.primaryBtnGradient}
                >
                  <Text style={styles.primaryBtnText}>
                    {isSubmitting ? t("submitting") : t("submitRating")}
                  </Text>
                </LinearGradient>
              </Pressable>

              {canContinueJourney ? (
                <Pressable onPress={handleFindNextDriver} disabled={isRegisteringJourney} style={styles.ghostBtn}>
                  <Text style={styles.ghostBtnText}>
                    {isRegisteringJourney ? t("starting") : t("continueTripSkipRating")}
                  </Text>
                </Pressable>
              ) : null}
              <Link href="/(tabs)" style={styles.skipLink}>{t("skipToHome")}</Link>
            </Reanimated.View>
          )}

          {/* ── Success state ─────────────────────────────────────────────── */}
          {submitted && (
            <>
              {/* Points celebration */}
              <Reanimated.View entering={FadeInDown.delay(0).springify()} style={styles.successCard}>
                <Text style={styles.successEmoji}>🎉</Text>
                <Text style={styles.successTitle}>{t("ratingRecordedThanks")}</Text>
                <View style={styles.pointsPill}>
                  <Text style={styles.pointsPillText}>+{earnedPoints} pts</Text>
                </View>
                {completedLegMiles > 0 && (
                  <Text style={styles.statLine}>
                    {completedLegMiles.toFixed(1)} mi · {earnedPoints} kind points earned
                  </Text>
                )}
                {fallbackMessage ? (
                  <Text style={styles.fallbackMessage}>{fallbackMessage}</Text>
                ) : null}
              </Reanimated.View>

              {/* ── Kindness Tip card ─────────────────────────────────────── */}
              {tipsUrl && tipStatus !== "success" && tipStatus !== "skipped" ? (
                <Reanimated.View entering={FadeInDown.delay(80).springify()} style={styles.tipCard}>
                  <LinearGradient
                    colors={["#052e16", "#064e3b"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.tipCardInner}
                  >
                    <Text style={styles.tipEyebrow}>💚 {t("leaveVoluntaryTip")}</Text>
                    <Text style={styles.tipHint}>{t("tipHint", { driverName })}</Text>

                    {/* Preset amounts */}
                    <View style={styles.tipPresets}>
                      {TIP_PRESETS.map(({ label, cents }) => (
                        <Pressable
                          key={cents}
                          style={[styles.tipPreset, selectedTipCents === cents && styles.tipPresetSelected]}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setSelectedTipCents(selectedTipCents === cents ? null : cents);
                            setCustomTipStr("");
                          }}
                        >
                          <Text style={[styles.tipPresetText, selectedTipCents === cents && styles.tipPresetTextSelected]}>
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                      {/* Custom amount */}
                      <View style={[styles.tipPreset, styles.tipCustom, customTipStr.length > 0 && styles.tipPresetSelected]}>
                        <Text style={styles.tipCustomPrefix}>$</Text>
                        <TextInput
                          style={[styles.tipCustomInput, customTipStr.length > 0 && styles.tipCustomInputActive]}
                          placeholder="Other"
                          placeholderTextColor="rgba(255,255,255,0.4)"
                          keyboardType="decimal-pad"
                          value={customTipStr}
                          onChangeText={(v) => {
                            setCustomTipStr(v);
                            setSelectedTipCents(null);
                          }}
                          maxLength={5}
                        />
                      </View>
                    </View>

                    {tipError ? (
                      <Text style={styles.tipError}>{tipError}</Text>
                    ) : null}

                    <Pressable
                      style={[styles.tipSendBtn, (!activeTipCents || tipStatus === "loading") && styles.tipSendBtnDisabled]}
                      disabled={!activeTipCents || tipStatus === "loading"}
                      onPress={handleTip}
                    >
                      <Text style={styles.tipSendBtnText}>
                        {tipStatus === "loading"
                          ? t("processing")
                          : activeTipCents
                            ? `Send $${(activeTipCents / 100).toFixed(2)} tip`
                            : t("sendTipWithAmount", { amount: "" })}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setTipStatus("skipped")}>
                      <Text style={styles.tipSkip}>{t("noThanks")}</Text>
                    </Pressable>
                  </LinearGradient>
                </Reanimated.View>
              ) : null}

              {tipStatus === "success" && (
                <Reanimated.View entering={FadeIn.springify()} style={styles.tipSuccessCard}>
                  <Text style={styles.tipSuccessEmoji}>💚</Text>
                  <Text style={styles.tipSuccessText}>{t("tipSentThanks")}</Text>
                </Reanimated.View>
              )}

              {/* ── Journey controls ────────────────────────────────────── */}
              {canContinueJourney && (
                <Reanimated.View entering={FadeInUp.delay(120).springify()} style={styles.journeyCard}>
                  <Pressable
                    onPress={handleFindNextDriver}
                    disabled={isRegisteringJourney}
                    style={styles.nextLegBtn}
                  >
                    <LinearGradient
                      colors={["#2563eb", "#1d4ed8"]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.nextLegBtnGradient}
                    >
                      <Text style={styles.nextLegBtnText}>
                        {isRegisteringJourney ? t("starting") : t("continueTripNextDriver")}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                  {journeyId ? (
                    <Pressable
                      onPress={handleCompleteJourney}
                      disabled={isEndingJourney}
                      style={[styles.ghostBtn, { marginTop: 4 }]}
                    >
                      <Text style={styles.ghostBtnText}>
                        {isEndingJourney ? t("closing") : t("reachedDestination")}
                      </Text>
                    </Pressable>
                  ) : null}
                </Reanimated.View>
              )}

              {/* ── Action buttons ──────────────────────────────────────── */}
              <Reanimated.View entering={FadeInUp.delay(160).springify()} style={styles.actionsRow}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: "/(tabs)/points", params: { earned: String(earnedPoints), role: "driver", source: pointsSource, fallbackReason } })}
                >
                  <Text style={styles.actionBtnText}>{t("viewPoints")}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionBtnHome]} onPress={() => router.replace("/(tabs)")}>
                  <Text style={[styles.actionBtnText, { color: "#0d9488" }]}>{t("backToHome")}</Text>
                </Pressable>
              </Reanimated.View>

              {/* ── Social share prompt ─────────────────────────────────── */}
              {showSharePrompt && !shareDismissed && (
                <Reanimated.View entering={FadeInUp.delay(200).springify()} style={styles.shareWrap}>
                  <LinearGradient
                    colors={["#0c1f3f", "#0a5c54"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.shareCard}
                  >
                    <Text style={styles.shareCardEyebrow}>✨ {t("shareInspireEyebrow", "Tell people the amazing things you do")}</Text>
                    <Text style={styles.shareCardTitle}>{t("shareInspireTitle", "You might inspire someone else today")}</Text>
                    <Text style={styles.shareCardBody}>{t("shareInspireBody", "Sharing is 100% optional — but one post could bring the next kind driver into this community.")}</Text>

                    {/* Driver share */}
                    {currentUserId && currentUserId === params.driverId && (
                      <Pressable style={styles.shareBtn} onPress={() => openShareSheet("driver")}>
                        <Text style={styles.shareBtnText}>🚗 Share my ride</Text>
                      </Pressable>
                    )}

                    {/* Passenger share */}
                    {(!params.driverId || currentUserId !== params.driverId) && (
                      <Pressable style={[styles.shareBtn, styles.shareBtnPassenger]} onPress={() => openShareSheet("passenger")}>
                        <Text style={styles.shareBtnText}>🙏 Share my experience</Text>
                      </Pressable>
                    )}

                    <Pressable onPress={() => setShareDismissed(true)} style={styles.shareDismiss}>
                      <Text style={styles.shareDismissText}>{t("maybeLater", "Maybe later")}</Text>
                    </Pressable>
                  </LinearGradient>
                </Reanimated.View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SocialShareSheet
        visible={shareSheetRole !== null}
        caption={shareSheetRole ? buildCaption(shareSheetRole) : ""}
        onClose={() => void onShareSheetClose()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  // Hero
  hero: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 24, alignItems: "center" },
  heroInner: { alignItems: "center", gap: 10 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 30, fontWeight: "800", color: "#ffffff" },
  heroTitle: { color: "#ffffff", fontSize: 24, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 14, textAlign: "center" },
  legBadge: {
    backgroundColor: "rgba(13,148,136,0.25)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: "#0d9488", marginTop: 4,
  },
  legBadgeText: { color: "#5eead4", fontSize: 12, fontWeight: "700" },
  starsRow: { flexDirection: "row", gap: 14, marginTop: 16 },
  star: { fontSize: 40, color: "rgba(255,255,255,0.25)" },
  starActive: { color: "#f59e0b" },

  // Cards
  card: {
    margin: 16, marginBottom: 0, padding: 20,
    backgroundColor: "#ffffff", borderRadius: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    borderWidth: 1, borderColor: "#e2e8f0", gap: 14,
  },
  cardLabel: { fontSize: 13, fontWeight: "700", color: "#334155" },

  // Appreciation tags
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  tagSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  tagEmoji: { fontSize: 13 },
  tagText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  tagTextSelected: { color: "#1d4ed8" },

  // Input + buttons
  input: {
    backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0",
    borderRadius: 14, minHeight: 100, padding: 14,
    textAlignVertical: "top", fontSize: 15, color: "#1f2a44",
  },
  primaryBtn: { borderRadius: 16, overflow: "hidden" },
  primaryBtnGradient: { paddingVertical: 16, alignItems: "center" },
  primaryBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  ghostBtn: { paddingVertical: 12, alignItems: "center" },
  ghostBtnText: { color: "#2563eb", fontSize: 14, fontWeight: "700" },
  skipLink: { color: "#94a3b8", fontSize: 13, fontWeight: "600", textAlign: "center", paddingVertical: 4 },

  // Success
  successCard: {
    margin: 16, marginBottom: 0, padding: 24,
    backgroundColor: "#f0fdf4", borderRadius: 20,
    alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: "#86efac",
  },
  successEmoji: { fontSize: 40 },
  successTitle: { fontSize: 16, fontWeight: "700", color: "#166534", textAlign: "center" },
  pointsPill: {
    backgroundColor: "#16a34a", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  pointsPillText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },
  statLine: { fontSize: 13, color: "#166534", fontWeight: "600" },
  fallbackMessage: { color: "#9a3412", fontSize: 12, textAlign: "center", maxWidth: 300 },

  // Tip card
  tipCard: { margin: 16, marginBottom: 0, borderRadius: 20, overflow: "hidden" },
  tipCardInner: { padding: 20, gap: 14 },
  tipEyebrow: { color: "#86efac", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  tipHint: { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 18 },
  tipPresets: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tipPreset: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tipPresetSelected: {
    backgroundColor: "#16a34a", borderColor: "#16a34a",
  },
  tipPresetText: { color: "rgba(255,255,255,0.8)", fontWeight: "700", fontSize: 15 },
  tipPresetTextSelected: { color: "#ffffff" },
  tipCustom: { flexDirection: "row", alignItems: "center", minWidth: 80, gap: 2 },
  tipCustomPrefix: { color: "rgba(255,255,255,0.5)", fontSize: 15, fontWeight: "700" },
  tipCustomInput: { color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: "700", minWidth: 48 },
  tipCustomInputActive: { color: "#ffffff" },
  tipError: { color: "#fca5a5", fontSize: 12, textAlign: "center" },
  tipSendBtn: {
    backgroundColor: "#16a34a", borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  tipSendBtnDisabled: { opacity: 0.45 },
  tipSendBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  tipSkip: { color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center" },
  tipSuccessCard: {
    margin: 16, marginBottom: 0, padding: 20,
    backgroundColor: "#f0fdf4", borderRadius: 20,
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: "#86efac",
  },
  tipSuccessEmoji: { fontSize: 28 },
  tipSuccessText: { fontSize: 14, fontWeight: "700", color: "#166534", flex: 1 },

  // Journey controls
  journeyCard: { margin: 16, marginBottom: 0, gap: 4 },
  nextLegBtn: { borderRadius: 16, overflow: "hidden" },
  nextLegBtnGradient: { paddingVertical: 16, alignItems: "center" },
  nextLegBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },

  // Action buttons
  actionsRow: { flexDirection: "row", margin: 16, marginBottom: 0, gap: 12 },
  actionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: "#0c1f3f", alignItems: "center",
  },
  actionBtnHome: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac" },
  actionBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },

  // Social share card
  shareWrap: { margin: 16, marginBottom: 0 },
  shareCard: { borderRadius: 20, padding: 20, gap: 14 },
  shareCardEyebrow: { color: "#5eead4", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  shareCardTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800", lineHeight: 26 },
  shareCardBody: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 20 },
  shareBtn: {
    backgroundColor: "#2563eb", borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  shareBtnPassenger: { backgroundColor: "#0d9488" },
  shareBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  shareDismiss: { paddingVertical: 4, alignItems: "center" },
  shareDismissText: { color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: "600" },
});
