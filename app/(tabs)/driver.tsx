import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  Dimensions,
  Linking,
  Platform,
  Pressable,
t hit  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Reanimated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Audio } from "expo-av";

import {
  getConnectOnboardUrlOrNull,
  getConnectStatusUrlOrNull,
  getRidesIncomingForDriverUrlOrNull,
  getRidesRespondUrlOrNull,
  getRideStatusUrlOrNull,
} from "@/lib/backend-api-urls";
import { savePendingPassengerRating } from "@/lib/driver-pending-passenger-rating";
import { supabase } from "@/lib/supabase";

const SCREEN_W = Dimensions.get("window").width;

type VibeMode = "silent" | "chat" | "music";

type IncomingRide = {
  ride_id: string;
  destination_label?: string | null;
  pickup_label?: string | null;
  passenger_name?: string | null;
  request_expires_at?: string | null;
  vibe?: VibeMode | null;
  distance_km?: number | null;
  kind_points?: number | null;
};

// ── Vibe badge ────────────────────────────────────────────────────────────────
const VIBE_META: Record<VibeMode, { icon: string; label: string; color: string; bg: string }> = {
  silent: { icon: "🤫", label: "Silent ride", color: "#6366f1", bg: "#eef2ff" },
  chat:   { icon: "💬", label: "Let's chat",  color: "#0ea5e9", bg: "#e0f2fe" },
  music:  { icon: "🎵", label: "Music on",    color: "#d946ef", bg: "#fdf4ff" },
};

function VibeBadge({ vibe }: { vibe: VibeMode }) {
  const meta = VIBE_META[vibe];
  return (
    <View style={[vibeBadgeStyles.pill, { backgroundColor: meta.bg }]}>
      <Text style={vibeBadgeStyles.icon}>{meta.icon}</Text>
      <Text style={[vibeBadgeStyles.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}
const vibeBadgeStyles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  icon: { fontSize: 12 },
  label: { fontSize: 12, fontWeight: "700" },
});

// ── Power button ──────────────────────────────────────────────────────────────
function PowerButton({
  isOn,
  syncing,
  onPress,
  t,
}: {
  isOn: boolean;
  syncing: boolean;
  onPress: () => void;
  t: any;
}) {
  const scale = useSharedValue(1);
  const ringOpacity = useSharedValue(isOn ? 1 : 0);
  const ringScale = useSharedValue(isOn ? 1 : 0.85);

  useEffect(() => {
    ringOpacity.value = withTiming(isOn ? 1 : 0, { duration: 400 });
    ringScale.value = withSpring(isOn ? 1 : 0.85);
  }, [isOn]);

  // Pulse ring when online
  const pulseOpacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (isOn) {
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(0.5, { duration: 900 }), withTiming(0, { duration: 900 })),
        -1
      );
      pulseScale.value = withRepeat(
        withSequence(withTiming(1.45, { duration: 900 }), withTiming(1, { duration: 900 })),
        -1
      );
    } else {
      pulseOpacity.value = withTiming(0);
      pulseScale.value = withTiming(1);
    }
  }, [isOn]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (syncing) return;
    scale.value = withSequence(withSpring(0.91), withSpring(1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onPress();
  };

  return (
    <View style={powerStyles.wrap}>
      {/* Pulse ring */}
      <Reanimated.View
        style={[
          powerStyles.pulseRing,
          { borderColor: isOn ? "#4ade80" : "transparent" },
          pulseStyle,
        ]}
      />
      {/* Glow ring */}
      <Reanimated.View
        style={[
          powerStyles.glowRing,
          { borderColor: isOn ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.12)" },
          ringStyle,
        ]}
      />
      <Reanimated.View style={btnStyle}>
        <Pressable
          onPress={handlePress}
          style={[
            powerStyles.btn,
            {
              backgroundColor: isOn
                ? "rgba(74,222,128,0.18)"
                : "rgba(255,255,255,0.08)",
              borderColor: isOn ? "#4ade80" : "rgba(255,255,255,0.25)",
            },
          ]}
        >
          <LinearGradient
            colors={
              isOn
                ? ["rgba(74,222,128,0.3)", "rgba(13,148,136,0.2)"]
                : ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.02)"]
            }
            style={powerStyles.btnInner}
          >
            <Text style={powerStyles.icon}>⏻</Text>
            <Text
              style={[
                powerStyles.label,
                { color: isOn ? "#4ade80" : "rgba(255,255,255,0.5)" },
              ]}
            >
            {syncing ? t("syncing", "Syncing…") : isOn ? t("online", "Online") : t("offline", "Offline")}
            </Text>
          </LinearGradient>
        </Pressable>
      </Reanimated.View>
    </View>
  );
}
const powerStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", width: 160, height: 160 },
  pulseRing: {
    position: "absolute",
    width: 160, height: 160,
    borderRadius: 80, borderWidth: 2,
  },
  glowRing: {
    position: "absolute",
    width: 140, height: 140,
    borderRadius: 70, borderWidth: 2,
  },
  btn: {
    width: 120, height: 120,
    borderRadius: 60, borderWidth: 2, overflow: "hidden",
  },
  btnInner: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 4,
  },
  icon: { fontSize: 30 },
  label: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
});

// ── Earnings card ─────────────────────────────────────────────────────────────
function EarningsStrip({ rides, t }: { rides: number; t: any }) {
  const today = rides * 15;
  const week = today + 48 * 15; // mock weekly
  const month = week + 180 * 15;
  const cells = [
    { label: t("today", "Today"), value: today, unit: t("pts", "pts") },
    { label: t("thisWeek", "This week"), value: week, unit: t("pts", "pts") },
    { label: t("thisMonth", "This month"), value: month, unit: t("pts", "pts") },
  ];
  return (
    <Reanimated.View entering={FadeInDown.delay(100).springify()} style={earningStyles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={earningStyles.scroll}>
        {cells.map((c, i) => (
          <View key={c.label} style={[earningStyles.cell, i < cells.length - 1 && earningStyles.cellBorder]}>
            <Text style={earningStyles.cellValue}>{c.value.toLocaleString()}</Text>
            <Text style={earningStyles.cellUnit}>{c.unit}</Text>
            <Text style={earningStyles.cellLabel}>{c.label}</Text>
          </View>
        ))}
      </ScrollView>
    </Reanimated.View>
  );
}
const earningStyles = StyleSheet.create({
  strip: {
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: "#fff",
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  scroll: { paddingHorizontal: 4 },
  cell: { paddingVertical: 16, paddingHorizontal: 24, alignItems: "center", gap: 2 },
  cellBorder: { borderRightWidth: 1, borderRightColor: "#f1f5f9" },
  cellValue: { fontSize: 24, fontWeight: "800", color: "#0f172a", letterSpacing: -0.5 },
  cellUnit: { fontSize: 11, fontWeight: "700", color: "#0d9488", letterSpacing: 0.5, textTransform: "uppercase" },
  cellLabel: { fontSize: 12, color: "#94a3b8", fontWeight: "500" },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DriverDashboardScreen() {
  "use no memo";
  const { t } = useTranslation();
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [intent, setIntent] = useState<"already_going" | "detour">("already_going");
  const [heading, setHeading] = useState<"north" | "south" | "east" | "west">("north");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [displayName, setDisplayName] = useState("Driver");
  const [incomingRides, setIncomingRides] = useState<IncomingRide[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [idVerified, setIdVerified] = useState<boolean | null>(null);
  const [hubName, setHubName] = useState<string | null>(null);
  const [hubCodeInput, setHubCodeInput] = useState("");
  const [joiningHub, setJoiningHub] = useState(false);
  const [connectChargesEnabled, setConnectChargesEnabled] = useState<boolean | null>(null);
  const [connectOnboarding, setConnectOnboarding] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [actingRideId, setActingRideId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ridesGiven, setRidesGiven] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [communityCount, setCommunityCount] = useState(4380);

  const soundRef = useRef<Audio.Sound | null>(null);
  const knownRideIdsRef = useRef<Set<string>>(new Set());
  const [fadeAnim] = useState(() => new Animated.Value(0));

  // ── Audio setup
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  // ── Community counter fluctuation
  useEffect(() => {
    const tick = setInterval(() => {
      setCommunityCount((n) => n + Math.floor(Math.random() * 2));
    }, 8000);
    return () => clearInterval(tick);
  }, []);

  // ── Countdown tick
  useEffect(() => {
    if (incomingRides.length === 0) return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [incomingRides.length]);

  // ── Accept / Decline
  const respondInline = useCallback(async (rideId: string, accept: boolean) => {
    const endpoint = getRidesRespondUrlOrNull();
    if (!endpoint || !supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setActingRideId(rideId);
    Haptics.impactAsync(accept ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rideId, accept }),
      });
      if (r.ok && accept) {
        const statusUrl = getRideStatusUrlOrNull(rideId);
        if (statusUrl) {
          const sr = await fetch(statusUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (sr.ok) {
            const sj = (await sr.json()) as { passenger_id?: string | null };
            if (sj.passenger_id) {
              await savePendingPassengerRating({ rideId, passengerId: String(sj.passenger_id) });
            }
          }
        }
        setIncomingRides((prev) => prev.filter((rd) => rd.ride_id !== rideId));
        setRidesGiven((n) => n + 1);
        Alert.alert(
          t("accepted", "Accepted"),
          t("passengerNotifiedRouting", "The passenger has been notified. Routing you to the Active Trip map."),
          [
            { text: t("startTrip", "Start Trip"), onPress: () => router.push({ pathname: "/active-trip", params: { rideId } }) },
            { text: t("later", "Later") },
          ]
        );
      } else if (r.ok && !accept) {
        setIncomingRides((prev) => prev.filter((rd) => rd.ride_id !== rideId));
      } else {
        const txt = await r.text().catch(() => "");
        Alert.alert(t("error", "Error"), txt || t("unknownError", "Unknown error"));
      }
    } catch {
      Alert.alert(t("networkError", "Network error"), t("checkConnection", "Check your connection."));
    } finally {
      setActingRideId(null);
    }
  }, [router, t]);

  // ── Auth listener
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        const meta = data.session.user.user_metadata;
        const fallback = data.session.user.phone || data.session.user.email?.split("@")[0] || "Driver";
        setDisplayName(meta?.full_name || meta?.name || fallback);
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const meta = newSession.user.user_metadata;
        const fallback = newSession.user.phone || newSession.user.email?.split("@")[0] || "Driver";
        setDisplayName(meta?.full_name || meta?.name || fallback);
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  // ── Presence sync
  const syncPresence = useCallback(
    async (available: boolean, overrideHeading?: string, overrideIntent?: string) => {
      if (!supabase || !session?.user?.id) return;
      setSyncing(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (available) Alert.alert(t("locationTitle"), t("driverLocationDenied"));
          setIsAvailable(false);
          setSyncing(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { error } = await supabase.from("driver_presence").upsert({
          driver_id: session.user.id,
          is_available: available,
          current_lat: loc.coords.latitude,
          current_lng: loc.coords.longitude,
          heading_direction: overrideHeading || heading,
          intent: overrideIntent || intent,
          updated_at: new Date().toISOString(),
          display_name: displayName.trim() || "Driver",
          tier: "Helper",
        });
        if (error) throw error;
        setLastSync(new Date());
        setIsAvailable(available);
      } catch (e) {
        console.warn(e);
        Alert.alert(t("driverSyncError"), e instanceof Error ? e.message : String(e));
        setIsAvailable(false);
      } finally {
        setSyncing(false);
      }
    },
    [session, heading, intent, displayName, t]
  );

  // ── Incoming rides poll
  const loadIncoming = useCallback(async () => {
    if (!session?.access_token) return;
    const url = getRidesIncomingForDriverUrlOrNull();
    if (!url) return;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        const rides: IncomingRide[] = data.rides || [];
        setIncomingRides(rides);
        const newRides = rides.filter((r) => !knownRideIdsRef.current.has(r.ride_id));
        const isFirstLoad = knownRideIdsRef.current.size === 0;
        if (newRides.length > 0 && !isFirstLoad && soundEnabled) {
          try {
            if (soundRef.current) {
              await soundRef.current.replayAsync();
            } else {
              const { sound } = await Audio.Sound.createAsync(
                require("@/assets/sounds/new_ride.wav"),
                { shouldPlay: true }
              );
              soundRef.current = sound;
            }
          } catch {
            // Audio not available
          }
        }
        knownRideIdsRef.current = new Set(rides.map((r) => r.ride_id));
      }
    } catch {
      // Silent — prevent background poll disruptions
    }
  }, [session, soundEnabled]);

  useEffect(() => {
    if (!isAvailable || !session) return;
    const poll = setInterval(() => { void loadIncoming(); }, 4000);
    return () => clearInterval(poll);
  }, [isAvailable, session, loadIncoming]);

  useEffect(() => {
    if (!isAvailable || !session) return;
    const heartbeat = setInterval(() => { void syncPresence(true); }, 30000);
    return () => clearInterval(heartbeat);
  }, [isAvailable, session, syncPresence]);

  // ── Status / hub / connect
  useEffect(() => {
    if (!session?.access_token) return;
    const base = process.env.EXPO_PUBLIC_POINTS_API_URL?.replace("/points/award", "") ?? "";
    if (!base) return;
    const token = session.access_token;
    fetch(`${base}/identity/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setIdVerified(Boolean(data.id_verified)); })
      .catch(() => {});
    fetch(`${base}/hubs/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.hub) setHubName(data.hub.name); })
      .catch(() => {});
    const connectStatusUrl = getConnectStatusUrlOrNull();
    if (connectStatusUrl) {
      fetch(connectStatusUrl, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data) setConnectChargesEnabled(Boolean(data.charges_enabled)); })
        .catch(() => {});
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      if (session) loadIncoming();
    }, [session, loadIncoming])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadIncoming();
    if (isAvailable) await syncPresence(true);
    setRefreshing(false);
  };

  // ── Not signed in
  if (!session) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.signInCenter}>
          <View style={styles.signInIconWrap}>
            <Text style={{ fontSize: 40 }}>🚗</Text>
          </View>
          <Text style={styles.signInTitle}>{t("driverMode")}</Text>
          <Text style={styles.signInBody}>{t("driverSignInPrompt")}</Text>
          <Pressable style={styles.signInBtn} onPress={() => router.push("/sign-in")}>
            <Text style={styles.signInBtnText}>{t("signInToContinue", "Sign in to continue")}  →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const firstName = displayName.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("goodMorning", "Good morning") : hour < 17 ? t("goodAfternoon", "Good afternoon") : t("goodEvening", "Good evening");

  // ── Main dashboard
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 56 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0d9488" />}
        >

          {/* ── Hero ──────────────────────────────────────────────────────────── */}
          <LinearGradient
            colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            {/* Top row: logo + status pill */}
            <View style={styles.heroTopRow}>
              <View style={styles.logoRow}>
                <Text style={styles.logoKind}>Kind</Text>
                <Text style={styles.logoRide}>Ride</Text>
                <View style={styles.driverBadge}>
                  <Text style={styles.driverBadgeText}>DRIVER</Text>
                </View>
              </View>
              {idVerified && (
                <View style={styles.verifiedPill}>
                  <Text style={styles.verifiedText}>✓ Verified</Text>
                </View>
              )}
            </View>

            {/* Greeting */}
            <Text style={styles.heroEyebrow}>{greeting},</Text>
            <Text style={styles.heroHeadline}>{firstName}</Text>

            {/* Community counter */}
            <View style={styles.communityBadge}>
              <Text style={styles.communityDot}>●</Text>
              <Text style={styles.communityText}>{communityCount.toLocaleString()} {t("ridesGivenInCity", "rides given in your city today")}</Text>
            </View>

            {/* Power button */}
            <View style={styles.powerWrap}>
              <PowerButton
                isOn={isAvailable}
                syncing={syncing}
                onPress={() => syncPresence(!isAvailable)}
                t={t}
              />
              <Text style={styles.powerHint}>
                {syncing
                  ? t("syncingLocation", "Syncing your location…")
                  : isAvailable
                  ? t("liveWaitingRequests", "You're live — waiting for requests")
                  : t("tapToGoOnline", "Tap to go online")}
              </Text>
              {lastSync && !syncing && (
                <Text style={styles.powerSync}>
                  {t("lastSynced", "Last synced")} {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              )}
            </View>
          </LinearGradient>

          {/* ── Earnings strip ────────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("earnings", "Earnings")}</Text>
          </View>
          <EarningsStrip rides={ridesGiven} t={t} />

          {/* ── Incoming Requests ─────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("driverIncomingSection", "Ride Requests")}</Text>
            {incomingRides.length > 0 && (
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{incomingRides.length}</Text>
              </View>
            )}
          </View>

          {incomingRides.length === 0 ? (
            <Reanimated.View entering={FadeInDown.delay(200).springify()} style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>{isAvailable ? "🕐" : "💤"}</Text>
              <Text style={styles.emptyTitle}>
                {isAvailable ? t("waitingForRequests", "Waiting for requests…") : t("youAreOffline", "You're offline")}
              </Text>
              <Text style={styles.emptyBody}>
                {isAvailable
                  ? t("sitTight", "Sit tight — new ride requests appear here automatically every 4 seconds.")
                  : t("tapPowerButton", "Tap the power button above to start receiving nearby ride requests.")}
              </Text>
            </Reanimated.View>
          ) : (
            <View style={styles.rideList}>
              {incomingRides.map((r, idx) => {
                const expiresAt = r.request_expires_at ? new Date(r.request_expires_at).getTime() : null;
                const secsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - nowMs) / 1000)) : null;
                const isUrgent = secsLeft !== null && secsLeft <= 20;
                const isActing = actingRideId === r.ride_id;
                const pts = r.kind_points ?? 15;
                const dist = r.distance_km != null ? `${r.distance_km.toFixed(1)} km` : null;
                const vibe: VibeMode | null = (r.vibe as VibeMode) ?? null;

                return (
                  <Reanimated.View
                    key={r.ride_id}
                    entering={FadeInRight.delay(idx * 80).springify()}
                  >
                    <View style={[styles.rideCard, isUrgent && styles.rideCardUrgent]}>
                      {/* Card header */}
                      <View style={styles.rideCardTop}>
                        <View style={styles.rideNewBadge}>
                          <Text style={styles.rideNewText}>{t("newRequest", "NEW REQUEST")}</Text>
                        </View>
                        <View style={styles.rideMetaRight}>
                          {dist && <Text style={styles.rideDist}>{dist}</Text>}
                          {secsLeft !== null && (
                            <View style={[styles.countdownPill, isUrgent && styles.countdownPillUrgent]}>
                              <Text style={[styles.countdownText, isUrgent && styles.countdownUrgent]}>
                                {secsLeft}s
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Route */}
                      <View style={styles.routeBlock}>
                        <View style={styles.routeDotRow}>
                          <View style={styles.routeDotBlue} />
                          <Text style={styles.routeFrom} numberOfLines={1}>
                            {r.pickup_label || t("pickupLocation", "Pickup location")}
                          </Text>
                        </View>
                        <View style={styles.routeLine} />
                        <View style={styles.routeDotRow}>
                          <View style={styles.routeDotTeal} />
                          <Text style={styles.routeTo} numberOfLines={1}>
                            {r.destination_label || t("driverNoDestinationLabel", "Destination not set")}
                          </Text>
                        </View>
                      </View>

                      {/* Passenger row: name + vibe + kind points */}
                      <View style={styles.passengerRow}>
                        {r.passenger_name && (
                          <Text style={styles.passengerName}>👤  {r.passenger_name}</Text>
                        )}
                        <View style={styles.rideTagsRight}>
                          {vibe && <VibeBadge vibe={vibe} t={t} />}
                          <View style={styles.ptsBadge}>
                            <Text style={styles.ptsBadgeText}>+{pts} pts</Text>
                          </View>
                        </View>
                      </View>

                      {/* Actions */}
                      <View style={styles.rideActions}>
                        <Pressable
                          style={[styles.acceptBtn, (isActing || actingRideId !== null) && styles.btnDisabled]}
                          disabled={isActing || actingRideId !== null}
                          onPress={() => void respondInline(r.ride_id, true)}
                        >
                          <LinearGradient
                            colors={["#0d9488", "#0369a1"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.acceptGradient}
                          >
                            <Text style={styles.acceptText}>{isActing ? "…" : t("accept", "Accept")}</Text>
                          </LinearGradient>
                        </Pressable>
                        <Pressable
                          style={[styles.declineBtn, (isActing || actingRideId !== null) && styles.btnDisabled]}
                          disabled={isActing || actingRideId !== null}
                          onPress={() => void respondInline(r.ride_id, false)}
                        >
                          <Text style={styles.declineText}>{t("decline", "Decline")}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.detailBtn}
                          onPress={() => router.push({ pathname: "/incoming-ride", params: { rideId: r.ride_id } })}
                        >
                          <Text style={styles.detailText}>{t("details", "Details")}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Reanimated.View>
                );
              })}
            </View>
          )}

          {/* ── Preferences (collapsible) ──────────────────────────────────────── */}
          <Pressable
            style={styles.sectionHeader}
            onPress={() => {
              setPrefsOpen((o) => !o);
              Haptics.selectionAsync();
            }}
          >
          <Text style={styles.sectionTitle}>{t("preferences", "Preferences")}</Text>
            <Text style={styles.chevron}>{prefsOpen ? "▲" : "▼"}</Text>
          </Pressable>

          {prefsOpen && (
            <Reanimated.View entering={FadeInDown.duration(300)} style={styles.card}>
            <Text style={styles.fieldLabel}>{t("displayName", "Display name")}</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
              placeholder={t("displayNameHint", "Your name shown to passengers")}
                placeholderTextColor="#94a3b8"
                onBlur={() => { if (isAvailable) syncPresence(true); }}
              />
              <View style={styles.divider} />
              <View style={styles.prefRow}>
                <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t("alertSound", "Alert sound")}</Text>
                <Text style={styles.fieldHint}>{t("alertSoundHint", "Chime when a new ride request arrives")}</Text>
                </View>
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  trackColor={{ false: "#e2e8f0", true: "#0d9488" }}
                  thumbColor="#ffffff"
                />
              </View>
              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>{t("driverIntent", "Ride intent")}</Text>
            <Text style={styles.fieldHint}>{t("driverIntentHint", "Are you already heading somewhere, or willing to detour?")}</Text>
              <View style={styles.chipRow}>
                {(["already_going", "detour"] as const).map((v) => (
                  <Pressable
                    key={v}
                    style={[styles.chip, intent === v && styles.chipActive]}
                    onPress={() => { setIntent(v); if (isAvailable) syncPresence(true, undefined, v); }}
                  >
                    <Text style={[styles.chipText, intent === v && styles.chipTextActive]}>
                      {v === "already_going" ? t("driverIntentAlreadyGoing", "Already going") : t("driverIntentDetour", "Open to detour")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>{t("heading", "Heading")}</Text>
              <View style={styles.chipRow}>
                {(["north", "south", "east", "west"] as const).map((dir) => (
                  <Pressable
                    key={dir}
                    style={[styles.chip, heading === dir && styles.chipActive]}
                    onPress={() => { setHeading(dir); if (isAvailable) syncPresence(true, dir, undefined); }}
                  >
                    <Text style={[styles.chipText, heading === dir && styles.chipTextActive]}>
                      {dir.charAt(0).toUpperCase() + dir.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Reanimated.View>
          )}

          {/* ── Community Hub ─────────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Community Hub</Text>
          </View>

          {hubName ? (
            <View style={[styles.card, styles.successCard]}>
              <View style={styles.cardRow}>
                <Text style={{ fontSize: 22 }}>🏛️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.successLabel}>Hub affiliated</Text>
                  <Text style={styles.successValue}>{hubName}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.fieldHint}>
                Join a campus, hospital, or community hub with a code from your coordinator.
              </Text>
              <TextInput
                style={[styles.input, { marginTop: 10, marginBottom: 10 }]}
                value={hubCodeInput}
                onChangeText={setHubCodeInput}
                placeholder="Hub code — e.g. CAMPUS2025"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.outlineBtn, (joiningHub || !hubCodeInput.trim()) && styles.btnDisabled]}
                disabled={joiningHub || !hubCodeInput.trim()}
                onPress={async () => {
                  const base = process.env.EXPO_PUBLIC_POINTS_API_URL?.replace("/points/award", "") ?? "";
                  if (!base || !session?.access_token) return;
                  setJoiningHub(true);
                  try {
                    const r = await fetch(`${base}/hubs/join`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                      body: JSON.stringify({ hubCode: hubCodeInput.trim().toUpperCase() }),
                    });
                    const data = await r.json();
                    if (r.ok) { setHubName(data.hub_name); setHubCodeInput(""); }
                  else { Alert.alert(t("hubJoinFailed", "Hub join failed"), data?.detail ?? t("invalidHubCode", "Invalid or inactive hub code.")); }
                  } catch {
                  Alert.alert(t("networkError", "Network error"), t("couldNotReachServer", "Could not reach the server."));
                  } finally {
                    setJoiningHub(false);
                  }
                }}
              >
              <Text style={styles.outlineBtnText}>{joiningHub ? t("joining", "Joining…") : t("joinHub", "Join Hub")}</Text>
              </Pressable>
            </View>
          )}

          {/* ── Identity Verification ─────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("identityVerification", "Identity Verification")}</Text>
          </View>

          {idVerified === null ? (
            <View style={[styles.card, { paddingVertical: 20 }]}>
            <Text style={styles.fieldHint}>{t("checkingVerification", "Checking verification status…")}</Text>
            </View>
          ) : idVerified ? (
            <View style={[styles.card, styles.successCard]}>
              <View style={styles.cardRow}>
                <Text style={{ fontSize: 22 }}>✅</Text>
                <Text style={[styles.successValue, { flex: 1 }]}>
                {t("identityVerifiedText", "Identity verified — you appear first in passenger matching.")}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.card, styles.warningCard]}>
              <View style={[styles.cardRow, { marginBottom: 8 }]}>
                <Text style={{ fontSize: 22 }}>⚠️</Text>
              <Text style={styles.warningTitle}>{t("notYetVerified", "Not yet verified")}</Text>
              </View>
              <Text style={styles.warningBody}>
              {t("verifiedDriversHint", "Verified drivers receive a match score boost and are prioritised when operators enable strict mode.")}
              </Text>
              <Text style={[styles.warningBody, { marginTop: 6, fontWeight: "700" }]}>
              {t("completeStripeIdentity", "Complete Stripe Identity from the web portal or ask your operator for the verification link.")}
              </Text>
            </View>
          )}

          {/* ── Receive Tips ──────────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("receiveTips", "Receive Tips")}</Text>
          </View>

          {connectChargesEnabled ? (
            <View style={[styles.card, styles.successCard]}>
              <View style={styles.cardRow}>
                <Text style={{ fontSize: 22 }}>💳</Text>
                <Text style={[styles.successValue, { flex: 1 }]}>
                {t("tipPaymentsEnabled", "Tip payments enabled — passengers can tip you after rides.")}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
            <Text style={styles.fieldHint}>{t("setupPayoutHint", "Set up your payout account to receive voluntary tips.\nKindRide takes 0% — every cent goes to you.")}</Text>
              <Pressable
                style={[styles.primaryBtn, connectOnboarding && styles.btnDisabled, { marginTop: 14 }]}
                disabled={connectOnboarding}
                onPress={async () => {
                  const onboardUrl = getConnectOnboardUrlOrNull();
                  if (!onboardUrl || !session?.access_token) return;
                  setConnectOnboarding(true);
                  try {
                    const r = await fetch(onboardUrl, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    const data = await r.json();
                    if (r.ok && data.onboarding_url) {
                      await Linking.openURL(data.onboarding_url);
                    } else {
                    Alert.alert(t("setupFailed", "Setup failed"), data?.detail ?? t("couldNotStartSetup", "Could not start account setup."));
                    }
                  } catch {
                  Alert.alert(t("networkError", "Network error"), t("couldNotReachServer", "Could not reach the server."));
                  } finally {
                    setConnectOnboarding(false);
                  }
                }}
              >
                <Text style={styles.primaryBtnText}>
                {connectOnboarding ? t("opening", "Opening…") : t("setupPayoutBtn", "Set up payout account  →")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* ── Rate Passenger mission card ───────────────────────────────────── */}
          <View style={styles.missionWrap}>
            <LinearGradient
              colors={["#0d9488", "#0369a1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.missionCard}
            >
            <Text style={styles.missionEyebrow}>{t("community", "Community")}</Text>
              <Text style={styles.missionHeadline}>{t("driverRatePassengerSection", "Rate your passenger")}</Text>
              <Text style={styles.missionBody}>
              {t("helpBuildTrust", "Help build trust in the KindRide network by rating passengers after your trips.")}
              </Text>
              <Pressable style={styles.missionBtn} onPress={() => router.push("/rate-passenger")}>
                <Text style={styles.missionBtnText}>{t("driverRatePassengerManual", "Rate a passenger")}  →</Text>
              </Pressable>
            </LinearGradient>
          </View>

          {/* ── Trip history subtle link ──────────────────────────────────────── */}
          <Pressable style={styles.historyLink} onPress={() => router.push("/(tabs)/points")}>
          <Text style={styles.historyLinkText}>{t("tripHistoryLink", "Trip history & points  →")}</Text>
          </Pressable>

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

  // ── Sign-in state
  signInCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  signInIconWrap: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: "#f0fdfa", alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  signInTitle: { fontSize: 24, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  signInBody: { fontSize: 15, color: "#64748b", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  signInBtn: { backgroundColor: "#0d9488", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  signInBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // ── Hero
  hero: { paddingTop: 20, paddingBottom: 36, paddingHorizontal: 22 },
  heroTopRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 16,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },
  driverBadge: {
    backgroundColor: "rgba(94,234,212,0.18)",
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    marginLeft: 4,
  },
  driverBadgeText: { fontSize: 10, fontWeight: "800", color: "#5eead4", letterSpacing: 1 },
  verifiedPill: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(74,222,128,0.3)",
  },
  verifiedText: { fontSize: 12, fontWeight: "700", color: "#4ade80" },

  heroEyebrow: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "500" },
  heroHeadline: {
    color: "#ffffff", fontSize: 34, fontWeight: "800",
    letterSpacing: -0.5, marginBottom: 12,
  },

  communityBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 28,
  },
  communityDot: { fontSize: 8, color: "#4ade80" },
  communityText: { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "500" },

  powerWrap: { alignItems: "center", gap: 14 },
  powerHint: {
    color: "rgba(255,255,255,0.75)", fontSize: 14,
    fontWeight: "600", textAlign: "center",
  },
  powerSync: { color: "rgba(255,255,255,0.4)", fontSize: 11 },

  // ── Section headers
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", flex: 1 },
  sectionBadge: {
    backgroundColor: "#ef4444", borderRadius: 12,
    minWidth: 22, height: 22, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 6,
  },
  sectionBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  chevron: { fontSize: 12, color: "#94a3b8" },

  // ── Cards
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20, marginHorizontal: 16,
    padding: 18, marginBottom: 4, ...shadow,
  },
  successCard: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac" },
  warningCard: { backgroundColor: "#fefce8", borderWidth: 1, borderColor: "#fde047" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  successLabel: {
    fontSize: 11, fontWeight: "700", color: "#15803d",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2,
  },
  successValue: { fontSize: 14, fontWeight: "600", color: "#166534" },
  warningTitle: { fontSize: 15, fontWeight: "700", color: "#854d0e", flex: 1 },
  warningBody: { fontSize: 13, color: "#854d0e", lineHeight: 19 },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20, marginHorizontal: 16,
    padding: 28, alignItems: "center", ...shadow,
  },
  emptyIcon: { fontSize: 32, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#334155", marginBottom: 6 },
  emptyBody: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 19 },

  // ── Incoming ride cards
  rideList: { paddingHorizontal: 16 },
  rideCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: "#bae6fd",
    marginBottom: 12, ...shadow,
  },
  rideCardUrgent: { backgroundColor: "#fff7ed", borderColor: "#fdba74" },
  rideCardTop: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 14,
  },
  rideNewBadge: {
    backgroundColor: "#e0f2fe", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  rideNewText: { fontSize: 11, fontWeight: "800", color: "#0369a1", letterSpacing: 0.5 },
  rideMetaRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rideDist: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  countdownPill: {
    backgroundColor: "#dbeafe", borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  countdownPillUrgent: { backgroundColor: "#fed7aa" },
  countdownText: { fontSize: 13, fontWeight: "700", color: "#1d4ed8" },
  countdownUrgent: { color: "#c2410c" },

  routeBlock: { marginBottom: 10 },
  routeDotRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeDotBlue: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },
  routeDotTeal: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0d9488" },
  routeLine: { width: 1.5, height: 16, backgroundColor: "#e2e8f0", marginLeft: 4.5, marginVertical: 2 },
  routeFrom: { fontSize: 13, color: "#1e3a5f", fontWeight: "600", flex: 1 },
  routeTo: { fontSize: 14, color: "#0f172a", fontWeight: "700", flex: 1 },

  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  passengerName: { fontSize: 13, color: "#475569", flex: 1 },
  rideTagsRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  ptsBadge: {
    backgroundColor: "#f0fdf4", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "#86efac",
  },
  ptsBadgeText: { fontSize: 12, fontWeight: "700", color: "#15803d" },

  rideActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  acceptBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  acceptGradient: { paddingVertical: 12, alignItems: "center" },
  acceptText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  declineBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12,
    alignItems: "center", borderWidth: 1, borderColor: "#fca5a5",
    backgroundColor: "#fff",
  },
  declineText: { color: "#b91c1c", fontWeight: "600", fontSize: 14 },
  detailBtn: { paddingHorizontal: 8, paddingVertical: 12, alignItems: "center" },
  detailText: { color: "#94a3b8", fontSize: 13, fontWeight: "500" },
  btnDisabled: { opacity: 0.45 },

  // ── Preferences
  fieldLabel: {
    fontSize: 12, fontWeight: "700", color: "#334155",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
  },
  fieldHint: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 4 },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 14 },
  prefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: {
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: "#f8fafc", color: "#1e293b", fontSize: 14,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  chipActive: { backgroundColor: "#f0fdfa", borderColor: "#0d9488" },
  chipText: { fontSize: 13, color: "#475569", fontWeight: "500" },
  chipTextActive: { color: "#0f766e", fontWeight: "700" },

  // ── Buttons
  primaryBtn: { backgroundColor: "#0d9488", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  outlineBtn: {
    borderRadius: 14, paddingVertical: 12, alignItems: "center",
    borderWidth: 1.5, borderColor: "#0d9488",
  },
  outlineBtnText: { color: "#0d9488", fontSize: 14, fontWeight: "700" },

  // ── Mission card
  missionWrap: { paddingHorizontal: 16, paddingTop: 20, marginBottom: 4 },
  missionCard: { borderRadius: 20, padding: 22 },
  missionEyebrow: {
    color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6,
  },
  missionHeadline: { color: "#ffffff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  missionBody: { color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 19, marginBottom: 16 },
  missionBtn: {
    alignSelf: "flex-start", backgroundColor: "#ffffff",
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10,
  },
  missionBtnText: { color: "#0d9488", fontSize: 14, fontWeight: "700" },

  // ── Trip history subtle link
  historyLink: { alignItems: "center", paddingVertical: 20 },
  historyLinkText: { fontSize: 14, color: "#94a3b8", fontWeight: "500" },
});
