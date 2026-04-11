import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Reanimated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useDriverPoints } from "@/lib/use-driver-points";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";

type EventItem = {
  id: string;
  label: string;
  value: number;
};

// Tier progression ladder
const TIERS = [
  { key: "helper",         min: 0,   color: "#64748b", icon: "🤝" },
  { key: "supporter",      min: 50,  color: "#0d9488", icon: "⭐" },
  { key: "goodSamaritan",  min: 100, color: "#2563eb", icon: "🌟" },
  { key: "guardian",       min: 250, color: "#7c3aed", icon: "🛡️" },
  { key: "champion",       min: 500, color: "#d97706", icon: "🏆" },
];

// Milestone thresholds for celebration badge
const MILESTONES = [50, 100, 250, 500, 1000, 5000];

// Redemption options
const REDEMPTIONS = [
  { icon: "🎁", titleKey: "donateToShelter", descKey: "donateToShelterDesc", cost: 25,  color: "#f0fdf4", border: "#86efac" },
  { icon: "🏅", titleKey: "unlockBadge", descKey: "unlockBadgeDesc", cost: 50,  color: "#eff6ff", border: "#93c5fd" },
  { icon: "📣", titleKey: "communityShoutout", descKey: "communityShoutoutDesc", cost: 100, color: "#fdf4ff", border: "#d8b4fe" },
];

// ── Animated count-up score display ──────────────────────────────────────────
function AnimatedScore({ target, color }: { target: number; color: string }) {
  const [displayed, setDisplayed] = useState(0);
  const animVal = useSharedValue(0);

  useEffect(() => {
    if (target === 0) return;
    const start = Math.max(0, target - 120);
    setDisplayed(start);
    const step = Math.ceil((target - start) / 40);
    let current = start;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplayed(current);
      if (current >= target) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [target]);

  const scale = useSharedValue(0.75);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 100 });
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Reanimated.View style={style}>
      <Text style={[scoreStyles.num, { color }]}>{displayed.toLocaleString()}</Text>
    </Reanimated.View>
  );
}
const scoreStyles = StyleSheet.create({
  num: { fontSize: 76, fontWeight: "800", lineHeight: 80, letterSpacing: -3 },
});

// ── Animated progress bar ─────────────────────────────────────────────────────
function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(percent, { duration: 900 });
  }, [percent]);
  const style = useAnimatedStyle(() => ({
    width: `${width.value}%` as any,
    height: "100%" as any,
    backgroundColor: color,
    borderRadius: 999,
  }));
  return (
    <View style={progressStyles.track}>
      <Reanimated.View style={style} />
    </View>
  );
}
const progressStyles = StyleSheet.create({
  track: {
    height: 8, backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 999, overflow: "hidden", marginBottom: 8,
  },
});

// ── Flame streak dot ──────────────────────────────────────────────────────────
function FlameStreak({ days }: { days: number }) {
  const bobY = useSharedValue(0);
  useEffect(() => {
    bobY.value = withRepeat(
      withSequence(withTiming(-3, { duration: 500 }), withTiming(0, { duration: 500 })),
      -1
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bobY.value }] }));
  return (
    <View style={flameStyles.row}>
      <Reanimated.Text style={[flameStyles.icon, style]}>🔥</Reanimated.Text>
      <Text style={flameStyles.text}>
        {days} day streak
      </Text>
    </View>
  );
}
const flameStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  icon: { fontSize: 16 },
  text: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
});

// ── Confetti burst (animated falling particles on milestone) ─────────────────
const CONFETTI_COLORS = ["#f59e0b", "#2563eb", "#10b981", "#ec4899", "#8b5cf6", "#f97316"];
function ConfettiParticle({ index }: { index: number }) {
  const x = useSharedValue((index % 7) * 50 - 50);
  const y = useSharedValue(-20);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const delay = index * 60;
    x.value = withDelay(delay, withTiming(x.value + (Math.random() * 80 - 40), { duration: 1400 }));
    y.value = withDelay(delay, withTiming(340, { duration: 1400 }));
    rotate.value = withDelay(delay, withRepeat(withTiming(360, { duration: 600 }), 3));
    opacity.value = withDelay(delay + 900, withTiming(0, { duration: 500 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
    backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  }));

  return <Reanimated.View style={[confettiStyles.particle, style]} />;
}

function ConfettiBurst({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={confettiStyles.container} pointerEvents="none">
      {Array.from({ length: 18 }).map((_, i) => (
        <ConfettiParticle key={i} index={i} />
      ))}
    </View>
  );
}

const confettiStyles = StyleSheet.create({
  container: {
    position: "absolute", top: 0, left: 0, right: 0, height: 360,
    zIndex: 99, overflow: "hidden",
  },
  particle: {
    position: "absolute", width: 10, height: 10, borderRadius: 3,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PointsScreen() {
  const { t } = useTranslation();
  const tierLabel = (key: string) => t(`pointsTier.${key}`);
  const normalizeTierKey = (value?: string | null) => {
    switch (value) {
      case "Helper": return "helper";
      case "Supporter": return "supporter";
      case "Good Samaritan": return "goodSamaritan";
      case "Guardian": return "guardian";
      case "Champion": return "champion";
      default: return null;
    }
  };
  const router = useRouter();
  const params = useLocalSearchParams<{
    earned?: string;
    role?: string;
    source?: "backend" | "local";
    fallbackReason?: "unauthorized" | "network_or_server";
  }>();

  const earnedValue = Number(params.earned ?? "0");
  const earnedPoints = Number.isFinite(earnedValue) ? earnedValue : 0;
  const userRole = params.role === "passenger" ? "passenger" : "driver";

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [lastTripReward, setLastTripReward] = useState(earnedPoints);
  const [pointEvents, setPointEvents] = useState<EventItem[]>([
    { id: "1", label: t("rideCompleted"), value: 10 },
    ...(earnedPoints >= 15 ? [{ id: "2", label: t("fiveStarBonus"), value: 5 }] : []),
  ]);
  // Mock streak — in production this would come from a consecutive_days field
  const [streak] = useState(3);
  const [showMilestoneBadge, setShowMilestoneBadge] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ── Auth
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user.id ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user.id ?? null);
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  // ── Points data
  const { totalPoints, tier: currentTier, loading: isLoading, error: pointsError } = useDriverPoints(sessionUserId ?? null);
  const dataSource = sessionUserId && !pointsError ? "supabase" : "local";
  const currentTierLabel = currentTier
    ? tierLabel(normalizeTierKey(currentTier) ?? currentTier)
    : null;

  useEffect(() => {
    const loadPoints = async () => {
      if (!hasSupabaseEnv || !supabase || !sessionUserId) return;
      try {
        const { data: eventsRows, error: eventsError } = await supabase
          .from("point_events")
          .select("id,action,points_change")
          .eq("driver_id", sessionUserId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (eventsRows && eventsRows.length > 0) {
          const mapped = eventsRows.map((row) => ({
            id: row.id,
            label: t(String(row.action), { defaultValue: String(row.action).replaceAll("_", " ") }),
            value: row.points_change,
          }));
          setPointEvents(mapped);
          const positiveSum = mapped.reduce((acc, item) => (item.value > 0 ? acc + item.value : acc), 0);
          setLastTripReward(positiveSum);
        }
        if (!eventsError && (!eventsRows || eventsRows.length === 0)) {
          setLastTripReward(earnedPoints);
        }
      } catch {
        setLastTripReward(earnedPoints);
      }
    };
    loadPoints();
  }, [sessionUserId, earnedPoints, t]);

  // ── Milestone check + confetti burst
  useEffect(() => {
    if (MILESTONES.includes(totalPoints)) {
      setShowMilestoneBadge(true);
      setShowConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setShowMilestoneBadge(false), 4000);
      setTimeout(() => setShowConfetti(false), 2000);
    }
  }, [totalPoints]);

  // ── Tier progress
  const tierIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < TIERS.length; i++) {
      if (totalPoints >= TIERS[i].min) idx = i;
    }
    return idx;
  }, [totalPoints]);

  const nextTier = TIERS[tierIndex + 1] ?? null;
  const prevTierMin = TIERS[tierIndex].min;
  const nextTierMin = nextTier?.min ?? TIERS[tierIndex].min;
  const progressPercent = nextTier
    ? Math.min(((totalPoints - prevTierMin) / (nextTierMin - prevTierMin)) * 100, 100)
    : 100;
  const ptsToNext = nextTier ? Math.max(nextTierMin - totalPoints, 0) : 0;

  const fallbackNotice = useMemo(() => {
    if (params.source !== "local") return "";
    if (params.fallbackReason === "unauthorized") return t("fallbackUnauthorizedNotice");
    if (params.fallbackReason === "network_or_server") return t("fallbackNetworkNotice");
    return "";
  }, [params.fallbackReason, params.source, t]);

  const activeTier = TIERS[tierIndex];
  // People helped: 1 person per 10 pts is a rough proxy
  const peopleHelped = Math.floor(totalPoints / 10);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ConfettiBurst visible={showConfetti} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 56 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <LinearGradient
          colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* Top row */}
          <Reanimated.View entering={FadeInDown.delay(0).springify()} style={styles.heroTopRow}>
            <View style={styles.logoRow}>
              <Text style={styles.logoKind}>Kind</Text>
              <Text style={styles.logoRide}>Ride</Text>
              {isLoading && <ActivityIndicator color="rgba(255,255,255,0.5)" size="small" style={{ marginLeft: 8 }} />}
            </View>
            <FlameStreak days={streak} />
          </Reanimated.View>

          {/* Badge */}
          <Reanimated.View entering={FadeInDown.delay(80).springify()} style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>⭐  {t("impactScore")}</Text>
          </Reanimated.View>

          {/* Animated count-up score */}
          <Reanimated.View entering={FadeInDown.delay(120).springify()}>
            <AnimatedScore target={totalPoints} color="#ffffff" />
          </Reanimated.View>
          <Reanimated.View entering={FadeInDown.delay(160).springify()} style={styles.scoreSubRow}>
                <Text style={styles.heroPointsLabel}>{t("humanitarianPoints")}</Text>
            {peopleHelped > 0 && (
              <View style={styles.peopleBadge}>
                  <Text style={styles.peopleText}>{t("peopleHelpedApprox", { count: peopleHelped })}</Text>
              </View>
            )}
          </Reanimated.View>

          {/* Tier pill */}
          <Reanimated.View entering={FadeInDown.delay(200).springify()}>
            <View style={[styles.tierPill, { backgroundColor: activeTier.color + "33" }]}>
              <Text style={styles.tierEmoji}>{activeTier.icon}</Text>
              <Text style={styles.tierPillText}>{currentTierLabel || tierLabel(activeTier.key)}</Text>
            </View>
          </Reanimated.View>

          {/* Animated progress bar */}
          <Reanimated.View entering={FadeInDown.delay(240).springify()} style={{ marginTop: 16 }}>
            {nextTier ? (
              <>
                <ProgressBar percent={progressPercent} color="#5eead4" />
                <Text style={styles.progressText}>
                  {t("pointsToNextTier", { points: ptsToNext, tier: tierLabel(nextTier.key) })}
                </Text>
              </>
            ) : (
              <Text style={styles.progressText}>{t("maximumTierReached")}</Text>
            )}
          </Reanimated.View>

          {/* Milestone celebration */}
          {showMilestoneBadge && (
            <Reanimated.View entering={FadeInUp.springify()} style={styles.milestoneBadge}>
              <Text style={styles.milestoneText}>{t("milestoneReachedPoints", { points: totalPoints })}</Text>
            </Reanimated.View>
          )}
        </LinearGradient>

        {/* ── Quick stat strip ─────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScroll}
        >
          {[
            { value: currentTierLabel || tierLabel(activeTier.key), label: t("currentTier"), color: activeTier.color },
            { value: `+${lastTripReward}`, label: t("lastTrip"), color: "#2563eb" },
            { value: ptsToNext > 0 ? String(ptsToNext) : t("max"), label: t("toNextTier"), color: "#10b981" },
            { value: String(streak), label: t("dayStreak"), color: "#f59e0b" },
            { value: String(peopleHelped), label: t("peopleHelped"), color: "#8b5cf6" },
          ].map((s) => (
            <Reanimated.View key={s.label} entering={FadeInDown.delay(80).springify()}>
              <View style={[styles.statCard, { borderTopColor: s.color }]}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </Reanimated.View>
          ))}
        </ScrollView>

        {/* ── Sign-in banner ───────────────────────────────────────────────────── */}
        {!sessionUserId && hasSupabaseEnv && (
          <Reanimated.View entering={FadeInDown.delay(100).springify()} style={styles.signInBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.signInBannerTitle}>{t("signInForLivePoints")}</Text>
              <Text style={styles.signInBannerBody}>
                {t("realImpactScoreSyncs")}
              </Text>
            </View>
            <Pressable style={styles.signInBannerBtn} onPress={() => router.push("/sign-in")}>
              <Text style={styles.signInBannerBtnText}>{t("signIn")}</Text>
            </Pressable>
          </Reanimated.View>
        )}

        {/* ── Warnings ────────────────────────────────────────────────────────── */}
        {(fallbackNotice || pointsError) && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⚠️  {fallbackNotice || pointsError}</Text>
          </View>
        )}
        {userRole !== "driver" && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>🚫  {t("driverOnlyArea", "Points are earned by drivers only.")}</Text>
          </View>
        )}

        {/* ── Tier progression ladder ──────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("tierProgression")}</Text>
          <View style={styles.sectionBadgeWrap}>
            <Text style={styles.sectionBadgeText}>{tierIndex + 1} / {TIERS.length}</Text>
          </View>
        </View>

        <Reanimated.View entering={FadeInDown.delay(160).springify()} style={styles.card}>
          {TIERS.map((tier, i) => {
            const isActive = i === tierIndex;
            const isPast = i < tierIndex;
            return (
              <View key={tier.key}>
                <View style={styles.tierRow}>
                  <View style={[
                    styles.tierBadge,
                    { backgroundColor: (isActive || isPast) ? tier.color + "20" : "#f1f5f9" },
                  ]}>
                    <Text style={styles.tierRowEmoji}>{tier.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierRowName, isActive && { color: tier.color, fontWeight: "800" }]}>
                      {tierLabel(tier.key)}
                    </Text>
                    <Text style={styles.tierRowMin}>{t("pointsThreshold", { points: tier.min.toLocaleString() })}</Text>
                  </View>
                  {isPast && <Text style={styles.tierCheck}>✓</Text>}
                  {isActive && (
                    <View style={[styles.tierActivePill, { backgroundColor: tier.color }]}>
                       <Text style={styles.tierActivePillText}>{t("youAreHere")}</Text>
                    </View>
                  )}
                </View>
                {i < TIERS.length - 1 && (
                  <View style={[styles.tierConnector, isPast && { backgroundColor: "#0d9488" }]} />
                )}
              </View>
            );
          })}
        </Reanimated.View>

        {/* ── Leaderboard teaser ───────────────────────────────────────────────── */}
        <Reanimated.View entering={FadeInDown.delay(180).springify()} style={styles.leaderboardTeaser}>
          <Pressable onPress={() => router.push("/leaderboard")}>
            <LinearGradient
              colors={["#1e1b4b", "#2e1065"]}
              style={styles.leaderboardGradient}
            >
              <Text style={styles.leaderboardIcon}>📊</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaderboardTitle}>{t("weeklyLeaderboard")}</Text>
                <Text style={styles.leaderboardSub}>{t("cityRankingsComingSoon")}</Text>
              </View>
              <Text style={styles.leaderboardChevron}>→</Text>
            </LinearGradient>
          </Pressable>
        </Reanimated.View>

        {/* ── Redemption options ───────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("redeemPoints")}</Text>
          <Text style={styles.sectionSub}>{t("comingSoon")}</Text>
        </View>

        <Reanimated.View entering={FadeInDown.delay(200).springify()} style={styles.redemptionGrid}>
          {REDEMPTIONS.map((item) => {
            const canRedeem = totalPoints >= item.cost;
            return (
              <Pressable
                key={item.titleKey}
                onPress={() => {
                  if (!canRedeem) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } else {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                }}
                style={[
                  styles.redemptionCard,
                  { backgroundColor: item.color, borderColor: item.border },
                  !canRedeem && styles.redemptionDisabled,
                ]}
              >
                <Text style={styles.redemptionIcon}>{item.icon}</Text>
                <Text style={styles.redemptionTitle}>{t(`pointsRedemption.${item.titleKey}`)}</Text>
                <Text style={styles.redemptionDesc}>{t(`pointsRedemption.${item.descKey}`)}</Text>
                <View style={styles.redemptionCost}>
                  <Text style={styles.redemptionCostText}>{t("pointsCost", { points: item.cost })}</Text>
                </View>
                {!canRedeem && (
                  <Text style={styles.redemptionNeed}>
                    {t("needMorePoints", { points: item.cost - totalPoints })}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </Reanimated.View>

        {/* ── Pay It Forward ───────────────────────────────────────────────────── */}
        <Reanimated.View entering={FadeInDown.delay(210).springify()} style={styles.payItForwardCard}>
          <LinearGradient
            colors={["#fef3c7", "#fde68a"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.payItForwardGradient}
          >
            <Text style={styles.payItForwardIcon}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.payItForwardTitle}>{t("payItForward")}</Text>
              <Text style={styles.payItForwardSub}>{t("payItForwardSub")}</Text>
            </View>
          </LinearGradient>
          <View style={styles.payItForwardActions}>
            {[50, 100, 200].map((cost) => {
              const canAfford = totalPoints >= cost;
              return (
                <Pressable
                  key={cost}
                  style={[styles.payItForwardBtn, !canAfford && styles.payItForwardBtnDisabled]}
                  onPress={() => {
                    if (!canAfford) return;
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert(
                      t("giftRideTitle"),
                      t("giftRideBody", { points: cost }),
                      [
                        { text: t("cancel"), style: "cancel" },
                        { text: t("giftIt"), onPress: () => Alert.alert(t("comingSoon"), t("payItForwardLaunchesSoon")) },
                      ]
                    );
                  }}
                >
                  <Text style={[styles.payItForwardBtnText, !canAfford && styles.payItForwardBtnTextDisabled]}>
                    {cost} pts
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Reanimated.View>

        {/* ── Point history ────────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {dataSource === "supabase" ? t("pointHistorySupabase", "Live History") : t("pointHistoryLocal", "History")}
          </Text>
          <Text style={styles.sectionSub}>{t("mostRecentFirst")}</Text>
        </View>

        <Reanimated.View entering={FadeInDown.delay(220).springify()} style={styles.card}>
          {pointEvents.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>📋</Text>
              <Text style={styles.emptyHistoryText}>
                {t("noActivityYetEarnPoints")}
              </Text>
            </View>
          ) : (
            pointEvents.map((event, idx) => (
              <View key={event.id}>
                <View style={styles.historyRow}>
                  <View style={[styles.historyDot, event.value > 0 ? styles.dotPos : styles.dotNeg]} />
                  <Text style={styles.historyLabel} numberOfLines={1}>{event.label}</Text>
                  <Text style={[styles.historyValue, event.value < 0 && styles.historyNeg]}>
                    {event.value > 0 ? "+" : ""}{event.value}
                  </Text>
                </View>
                {idx < pointEvents.length - 1 && <View style={styles.divider} />}
              </View>
            ))
          )}
        </Reanimated.View>

        {/* ── Mission card ─────────────────────────────────────────────────────── */}
        <Reanimated.View entering={FadeInDown.delay(240).springify()} style={styles.missionWrap}>
          <LinearGradient
            colors={["#0d9488", "#0369a1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.missionCard}
          >
            <Text style={styles.missionEyebrow}>{t("whyPointsMatter")}</Text>
            <Text style={styles.missionHeadline}>{t("everyRideActOfKindness")}</Text>
            <Text style={styles.missionBody}>
              {t("pointsReflectRealImpact")}
            </Text>
          </LinearGradient>
        </Reanimated.View>

        {/* ── Auth links ───────────────────────────────────────────────────────── */}
        {!sessionUserId && (
          <View style={styles.authLinks}>
            <Link href="/sign-up">
              <Text style={styles.authLinkPrimary}>{t("createAccountSignUp", "Create an account")}</Text>
            </Link>
            <Text style={styles.authLinkDot}>·</Text>
            <Link href="/sign-in">
              <Text style={styles.authLinkMuted}>{t("fullSignInScreen", "Sign in")}</Text>
            </Link>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  // ── Hero
  hero: { paddingTop: 20, paddingBottom: 32, paddingHorizontal: 22 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  logoRow: { flexDirection: "row", alignItems: "baseline", gap: 0 },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12,
  },
  heroBadgeText: { color: "#99f6e4", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  scoreSubRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 14 },
  heroPointsLabel: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "500" },
  peopleBadge: {
    backgroundColor: "rgba(94,234,212,0.2)",
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  peopleText: { color: "#5eead4", fontSize: 11, fontWeight: "700" },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  tierEmoji: { fontSize: 14 },
  tierPillText: { color: "#ffffff", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  progressText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "500" },
  milestoneBadge: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: "flex-start",
  },
  milestoneText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },

  // ── Stat strip
  statsScroll: { paddingHorizontal: 16, gap: 12, paddingVertical: 16 },
  statCard: {
    backgroundColor: "#ffffff", borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 14,
    minWidth: 120, borderTopWidth: 3, ...shadow,
  },
  statValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, marginBottom: 4 },
  statLabel: { fontSize: 11, color: "#94a3b8", fontWeight: "600" },

  // ── Sign-in banner
  signInBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#f0fdfa", borderWidth: 1, borderColor: "#5eead4",
    borderRadius: 16, marginHorizontal: 16, marginBottom: 8, padding: 16,
  },
  signInBannerTitle: { fontSize: 14, fontWeight: "700", color: "#0f766e", marginBottom: 2 },
  signInBannerBody: { fontSize: 12, color: "#475569", lineHeight: 17 },
  signInBannerBtn: { backgroundColor: "#0d9488", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  signInBannerBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // ── Warnings
  warningBanner: {
    backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fdba74",
    borderRadius: 14, marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  warningText: { color: "#9a3412", fontSize: 13, lineHeight: 18 },

  // ── Section headers
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", flex: 1 },
  sectionSub: { fontSize: 12, color: "#94a3b8", fontWeight: "500" },
  sectionBadgeWrap: {
    backgroundColor: "#f0fdfa", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  sectionBadgeText: { fontSize: 12, fontWeight: "700", color: "#0d9488" },

  // ── Cards
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20, marginHorizontal: 16, padding: 18, ...shadow,
  },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 12 },

  // ── Tier ladder
  tierRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  tierBadge: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  tierRowEmoji: { fontSize: 18 },
  tierRowName: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  tierRowMin: { fontSize: 12, color: "#94a3b8", marginTop: 1 },
  tierCheck: { fontSize: 16, color: "#10b981" },
  tierActivePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tierActivePillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  tierConnector: {
    width: 2, height: 14, backgroundColor: "#f1f5f9",
    marginLeft: 20, marginVertical: 2,
  },

  // ── Leaderboard teaser
  leaderboardTeaser: { marginHorizontal: 16, marginTop: 20, borderRadius: 20, overflow: "hidden" },
  leaderboardGradient: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18 },
  leaderboardIcon: { fontSize: 28 },
  leaderboardTitle: { fontSize: 15, fontWeight: "700", color: "#ffffff", marginBottom: 3 },
  leaderboardSub: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  leaderboardComingSoon: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  leaderboardComingSoonText: { fontSize: 11, fontWeight: "700", color: "#c4b5fd" },
  leaderboardChevron: { fontSize: 18, color: "rgba(255,255,255,0.6)", fontWeight: "700" },

  // ── Redemption grid
  redemptionGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10 },
  redemptionCard: {
    flex: 1, minWidth: "44%", borderRadius: 16,
    borderWidth: 1, padding: 16, ...shadow,
  },
  redemptionDisabled: { opacity: 0.5 },
  redemptionIcon: { fontSize: 26, marginBottom: 8 },
  redemptionTitle: { fontSize: 13, fontWeight: "800", color: "#1e293b", marginBottom: 4 },
  redemptionDesc: { fontSize: 11, color: "#64748b", lineHeight: 16, marginBottom: 10 },
  redemptionCost: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.07)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  redemptionCostText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  redemptionNeed: { fontSize: 10, color: "#94a3b8", marginTop: 4 },

  // ── History rows
  emptyHistory: { alignItems: "center", paddingVertical: 20 },
  emptyHistoryText: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 19 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  historyDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dotPos: { backgroundColor: "#0d9488" },
  dotNeg: { backgroundColor: "#f87171" },
  historyLabel: { fontSize: 14, color: "#1e293b", flex: 1 },
  historyValue: { fontSize: 15, fontWeight: "700", color: "#0d9488" },
  historyNeg: { color: "#dc2626" },

  // ── Mission card
  missionWrap: { paddingHorizontal: 16, paddingTop: 20, marginBottom: 4 },
  missionCard: { borderRadius: 20, padding: 22 },
  missionEyebrow: {
    color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6,
  },
  missionHeadline: { color: "#ffffff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  missionBody: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 20 },

  // ── Auth links
  authLinks: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 20,
  },
  authLinkPrimary: { color: "#0d9488", fontSize: 14, fontWeight: "700" },
  authLinkDot: { color: "#cbd5e1", fontSize: 14 },
  authLinkMuted: { color: "#94a3b8", fontSize: 14, fontWeight: "500" },

  // ── Pay It Forward
  payItForwardCard: { marginHorizontal: 16, marginTop: 20, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#fcd34d" },
  payItForwardGradient: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  payItForwardIcon: { fontSize: 32 },
  payItForwardTitle: { fontSize: 15, fontWeight: "800", color: "#78350f", marginBottom: 3 },
  payItForwardSub: { fontSize: 12, color: "#92400e", lineHeight: 17 },
  payItForwardActions: { flexDirection: "row", gap: 10, padding: 14, backgroundColor: "#fffbeb" },
  payItForwardBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: "#f59e0b", alignItems: "center",
  },
  payItForwardBtnDisabled: { backgroundColor: "#fef3c7" },
  payItForwardBtnText: { fontWeight: "800", fontSize: 13, color: "#ffffff" },
  payItForwardBtnTextDisabled: { color: "#d97706" },
});
