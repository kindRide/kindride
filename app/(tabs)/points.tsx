import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  { name: "Helper",        min: 0,   color: "#64748b", icon: "🤝" },
  { name: "Supporter",     min: 50,  color: "#0d9488", icon: "⭐" },
  { name: "Good Samaritan",min: 100, color: "#2563eb", icon: "🌟" },
  { name: "Guardian",      min: 250, color: "#7c3aed", icon: "🛡️" },
  { name: "Champion",      min: 500, color: "#d97706", icon: "🏆" },
];

// Redemption options
const REDEMPTIONS = [
  { icon: "🎁", title: "Donate to Shelter",   desc: "Give 25 pts to a local shelter",  cost: 25,  color: "#f0fdf4", border: "#86efac" },
  { icon: "🏅", title: "Unlock verified badge", desc: "Display your champion status",  cost: 50,  color: "#eff6ff", border: "#93c5fd" },
  { icon: "📣", title: "Community shoutout",   desc: "Featured in the KindRide feed",  cost: 100, color: "#fdf4ff", border: "#d8b4fe" },
];

export default function PointsScreen() {
  const { t } = useTranslation();
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

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  const driverIdToQuery = sessionUserId ?? null;

  // ── Auth ─────────────────────────────────────────────────────────────────────
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

  // ── Entrance animation ────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Points data ───────────────────────────────────────────────────────────────
  const { totalPoints, tier: currentTier, loading: isLoading, error: pointsError } = useDriverPoints(driverIdToQuery);
  const dataSource = driverIdToQuery && !pointsError ? "supabase" : "local";

  useEffect(() => {
    const loadPoints = async () => {
      if (!hasSupabaseEnv || !supabase || !driverIdToQuery) return;
      try {
        const { data: eventsRows, error: eventsError } = await supabase
          .from("point_events")
          .select("id,action,points_change")
          .eq("driver_id", driverIdToQuery)
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
  }, [driverIdToQuery, earnedPoints]);

  // ── Tier progress ─────────────────────────────────────────────────────────────
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

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Hero ─────────────────────────────────────────────────────────── */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              {/* Logo row */}
              <View style={styles.logoRow}>
                <Text style={styles.logoKind}>Kind</Text>
                <Text style={styles.logoRide}>Ride</Text>
                {isLoading && <ActivityIndicator color="rgba(255,255,255,0.5)" size="small" style={{ marginLeft: 8 }} />}
              </View>

              {/* Badge */}
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>⭐  Impact Score</Text>
              </View>

              {/* Points — large and bold */}
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Text style={styles.heroPoints}>{totalPoints}</Text>
              </Animated.View>
              <Text style={styles.heroPointsLabel}>humanitarian points</Text>

              {/* Tier pill */}
              <View style={[styles.tierPill, { backgroundColor: activeTier.color + "33" }]}>
                <Text style={styles.tierEmoji}>{activeTier.icon}</Text>
                <Text style={styles.tierPillText}>{currentTier || activeTier.name}</Text>
              </View>

              {/* Progress bar */}
              {nextTier && (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {ptsToNext} pts to {nextTier.name}
                  </Text>
                </>
              )}
              {!nextTier && (
                <Text style={styles.progressText}>🏆  Maximum tier reached — you're a Champion!</Text>
              )}
            </LinearGradient>
          </View>

          {/* ── Quick stat cards (horizontal scroll) ─────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsScroll}
          >
            <View style={[styles.statCard, { borderTopColor: activeTier.color }]}>
              <Text style={[styles.statValue, { color: activeTier.color }]}>{currentTier || activeTier.name}</Text>
              <Text style={styles.statLabel}>{t("currentTier", "Current tier")}</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: "#2563eb" }]}>
              <Text style={[styles.statValue, { color: "#2563eb" }]}>+{lastTripReward}</Text>
              <Text style={styles.statLabel}>{t("lastTripReward", "Last trip")}</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: "#10b981" }]}>
              <Text style={[styles.statValue, { color: "#10b981" }]}>{ptsToNext > 0 ? ptsToNext : "MAX"}</Text>
              <Text style={styles.statLabel}>to next tier</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: "#f59e0b" }]}>
              <Text style={[styles.statValue, { color: "#f59e0b" }]}>{pointEvents.length}</Text>
              <Text style={styles.statLabel}>recent events</Text>
            </View>
          </ScrollView>

          {/* ── Not signed in ────────────────────────────────────────────────── */}
          {!sessionUserId && hasSupabaseEnv && (
            <View style={styles.signInBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.signInBannerTitle}>Sign in for live points</Text>
                <Text style={styles.signInBannerBody}>
                  Your real impact score syncs from the cloud when you're logged in.
                </Text>
              </View>
              <Pressable style={styles.signInBannerBtn} onPress={() => router.push("/sign-in")}>
                <Text style={styles.signInBannerBtnText}>Sign in</Text>
              </Pressable>
            </View>
          )}

          {/* ── Warnings ─────────────────────────────────────────────────────── */}
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

          {/* ── Tier progression ladder ───────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tier Progression</Text>
          </View>

          <View style={styles.card}>
            {TIERS.map((tier, i) => {
              const isActive = i === tierIndex;
              const isPast = i < tierIndex;
              return (
                <View key={tier.name}>
                  <View style={styles.tierRow}>
                    <View style={[
                      styles.tierBadge,
                      { backgroundColor: (isActive || isPast) ? tier.color + "20" : "#f1f5f9" },
                    ]}>
                      <Text style={styles.tierRowEmoji}>{tier.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tierRowName, isActive && { color: tier.color }]}>
                        {tier.name}
                        {isActive ? "  ← you are here" : ""}
                      </Text>
                      <Text style={styles.tierRowMin}>{tier.min}+ pts</Text>
                    </View>
                    {isPast && <Text style={styles.tierCheck}>✓</Text>}
                    {isActive && (
                      <View style={[styles.tierActivePill, { backgroundColor: tier.color }]}>
                        <Text style={styles.tierActivePillText}>Active</Text>
                      </View>
                    )}
                  </View>
                  {i < TIERS.length - 1 && <View style={styles.tierConnector} />}
                </View>
              );
            })}
          </View>

          {/* ── Redemption options ───────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Redeem Points</Text>
            <Text style={styles.sectionSub}>Coming soon</Text>
          </View>

          <View style={styles.redemptionGrid}>
            {REDEMPTIONS.map((item) => {
              const canRedeem = totalPoints >= item.cost;
              return (
                <View
                  key={item.title}
                  style={[styles.redemptionCard, { backgroundColor: item.color, borderColor: item.border }, !canRedeem && styles.redemptionDisabled]}
                >
                  <Text style={styles.redemptionIcon}>{item.icon}</Text>
                  <Text style={styles.redemptionTitle}>{item.title}</Text>
                  <Text style={styles.redemptionDesc}>{item.desc}</Text>
                  <View style={styles.redemptionCost}>
                    <Text style={styles.redemptionCostText}>{item.cost} pts</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Point history ─────────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {dataSource === "supabase" ? t("pointHistorySupabase", "Live History") : t("pointHistoryLocal", "History")}
            </Text>
            <Text style={styles.sectionSub}>Most recent first</Text>
          </View>

          <View style={styles.card}>
            {pointEvents.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>📋</Text>
                <Text style={styles.emptyHistoryText}>No activity yet. Complete your first ride to earn points.</Text>
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
          </View>

          {/* ── Mission card ─────────────────────────────────────────────────── */}
          <View style={styles.missionWrap}>
            <LinearGradient
              colors={["#0d9488", "#0369a1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.missionCard}
            >
              <Text style={styles.missionEyebrow}>Why Points Matter</Text>
              <Text style={styles.missionHeadline}>Every ride is an act of kindness.</Text>
              <Text style={styles.missionBody}>
                Points reflect your real impact — each one represents a person helped, a mile driven, and a community strengthened.
              </Text>
            </LinearGradient>
          </View>

          {/* ── Auth links ───────────────────────────────────────────────────── */}
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
      </Animated.View>
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
  heroWrap: { margin: 16, marginBottom: 4 },
  heroGradient: { borderRadius: 24, padding: 22, overflow: "hidden" },
  logoRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 20 },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16,
  },
  heroBadgeText: { color: "#99f6e4", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  heroPoints: {
    color: "#ffffff", fontSize: 72, fontWeight: "800",
    lineHeight: 76, letterSpacing: -3,
  },
  heroPointsLabel: {
    color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "500",
    marginBottom: 16, marginTop: 2,
  },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, marginBottom: 18,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  tierEmoji: { fontSize: 14 },
  tierPillText: { color: "#ffffff", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  progressTrack: {
    height: 8, backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 999, overflow: "hidden", marginBottom: 8,
  },
  progressFill: { height: "100%", backgroundColor: "#5eead4", borderRadius: 999 },
  progressText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "500" },

  // ── Stat cards
  statsScroll: {
    paddingHorizontal: 16, gap: 12, paddingVertical: 16,
  },
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
    borderRadius: 16, marginHorizontal: 16, marginBottom: 8,
    padding: 16,
  },
  signInBannerTitle: { fontSize: 14, fontWeight: "700", color: "#0f766e", marginBottom: 2 },
  signInBannerBody: { fontSize: 12, color: "#475569", lineHeight: 17 },
  signInBannerBtn: {
    backgroundColor: "#0d9488", borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 9,
  },
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
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", flex: 1 },
  sectionSub: { fontSize: 12, color: "#94a3b8", fontWeight: "500" },

  // ── Cards
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20, marginHorizontal: 16, padding: 18, ...shadow,
  },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 12 },

  // ── Tier ladder
  tierRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  tierBadge: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  tierRowEmoji: { fontSize: 18 },
  tierRowName: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  tierRowMin: { fontSize: 12, color: "#94a3b8", marginTop: 1 },
  tierCheck: { fontSize: 16, color: "#10b981" },
  tierActivePill: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  tierActivePillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  tierConnector: {
    width: 2, height: 14, backgroundColor: "#f1f5f9",
    marginLeft: 19, marginVertical: 2,
  },

  // ── Redemption grid
  redemptionGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, gap: 10,
  },
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

  // ── History rows
  emptyHistory: { alignItems: "center", paddingVertical: 20 },
  emptyHistoryText: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 19 },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
  },
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
});
