import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Audio } from "expo-av";

import { getConnectOnboardUrlOrNull, getConnectStatusUrlOrNull, getRidesIncomingForDriverUrlOrNull, getRidesRespondUrlOrNull, getRideStatusUrlOrNull } from "@/lib/backend-api-urls";
import { savePendingPassengerRating } from "@/lib/driver-pending-passenger-rating";
import { supabase } from "@/lib/supabase";

type IncomingRide = {
  ride_id: string;
  destination_label?: string | null;
  pickup_label?: string | null;
  passenger_name?: string | null;
  request_expires_at?: string | null;
};

export default function DriverDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  // ── State ────────────────────────────────────────────────────────────────────
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

  const soundRef = useRef<Audio.Sound | null>(null);
  const knownRideIdsRef = useRef<Set<string>>(new Set());
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Audio setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  // ── Countdown tick ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (incomingRides.length === 0) return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [incomingRides.length]);

  // ── Accept / Decline ─────────────────────────────────────────────────────────
  const respondInline = useCallback(async (rideId: string, accept: boolean) => {
    const endpoint = getRidesRespondUrlOrNull();
    if (!endpoint || !supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setActingRideId(rideId);
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

  // ── Auth listener ────────────────────────────────────────────────────────────
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

  // ── Presence sync ─────────────────────────────────────────────────────────────
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

  // ── Incoming rides poll ───────────────────────────────────────────────────────
  const loadIncoming = useCallback(async () => {
    if (!session?.access_token) return;
    const url = getRidesIncomingForDriverUrlOrNull();
    if (!url) return;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
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
            // Audio not available — ignore
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

  // ── Status / hub / connect ────────────────────────────────────────────────────
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

  // ── Not signed in ─────────────────────────────────────────────────────────────
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
            <Text style={styles.signInBtnText}>Sign in to continue  →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const firstName = displayName.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Main dashboard ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0d9488" />}
        >

          {/* ── Hero ──────────────────────────────────────────────────────────── */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              {/* Logo + status row */}
              <View style={styles.heroTopRow}>
                <View style={styles.logoRow}>
                  <Text style={styles.logoKind}>Kind</Text>
                  <Text style={styles.logoRide}>Ride</Text>
                </View>
                <View style={[styles.statusPill, isAvailable ? styles.statusPillOn : styles.statusPillOff]}>
                  <View style={[styles.statusDot, isAvailable ? styles.statusDotOn : styles.statusDotOff]} />
                  <Text style={[styles.statusPillText, isAvailable ? styles.statusTextOn : styles.statusTextOff]}>
                    {isAvailable ? "Online" : "Offline"}
                  </Text>
                </View>
              </View>

              {/* Greeting */}
              <Text style={styles.heroEyebrow}>{greeting}</Text>
              <Text style={styles.heroHeadline}>{firstName}</Text>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statNumber}>{ridesGiven}</Text>
                  <Text style={styles.statLabel}>Rides today</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statNumber}>{ridesGiven * 15}</Text>
                  <Text style={styles.statLabel}>Points earned</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statNumber}>{idVerified ? "✓" : "—"}</Text>
                  <Text style={styles.statLabel}>Verified</Text>
                </View>
              </View>

              {/* Online toggle */}
              <Pressable
                style={[styles.toggleRow, isAvailable && styles.toggleRowOn]}
                onPress={() => { if (!syncing) syncPresence(!isAvailable); }}
                disabled={syncing}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>
                    {syncing ? "Syncing location…" : isAvailable ? "You're online — accepting rides" : "Go online to receive requests"}
                  </Text>
                  {lastSync && !syncing && (
                    <Text style={styles.toggleSub}>
                      Synced {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  )}
                </View>
                <Switch
                  value={isAvailable}
                  onValueChange={(val) => syncPresence(val)}
                  disabled={syncing}
                  trackColor={{ false: "rgba(255,255,255,0.2)", true: "#0d9488" }}
                  thumbColor="#ffffff"
                />
              </Pressable>
            </LinearGradient>
          </View>

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
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🕐</Text>
              <Text style={styles.emptyTitle}>
                {isAvailable ? "Waiting for requests…" : "You're offline"}
              </Text>
              <Text style={styles.emptyBody}>
                {isAvailable
                  ? "Sit tight — new ride requests appear here automatically."
                  : "Toggle online above to start receiving ride requests from nearby passengers."}
              </Text>
            </View>
          ) : (
            <View style={styles.rideList}>
              {incomingRides.map((r) => {
                const expiresAt = r.request_expires_at ? new Date(r.request_expires_at).getTime() : null;
                const secsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - nowMs) / 1000)) : null;
                const isUrgent = secsLeft !== null && secsLeft <= 20;
                const isActing = actingRideId === r.ride_id;
                return (
                  <View key={r.ride_id} style={[styles.rideCard, isUrgent && styles.rideCardUrgent]}>
                    {/* Card header */}
                    <View style={styles.rideCardTop}>
                      <View style={styles.rideNewBadge}>
                        <Text style={styles.rideNewText}>{t("driverNewRideRequest", "New Request")}</Text>
                      </View>
                      {secsLeft !== null && (
                        <View style={[styles.countdownPill, isUrgent && styles.countdownPillUrgent]}>
                          <Text style={[styles.countdownText, isUrgent && styles.countdownUrgent]}>
                            {secsLeft}s
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Route */}
                    <View style={styles.routeBlock}>
                      <View style={styles.routeDotRow}>
                        <View style={styles.routeDotBlue} />
                        <Text style={styles.routeFrom} numberOfLines={1}>
                          {r.pickup_label || "Pickup location"}
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

                    {r.passenger_name && (
                      <Text style={styles.passengerName}>👤  {r.passenger_name}</Text>
                    )}

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
                        <Text style={styles.detailText}>Details</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Preferences (collapsible) ──────────────────────────────────────── */}
          <Pressable style={styles.sectionHeader} onPress={() => setPrefsOpen((o) => !o)}>
            <Text style={styles.sectionTitle}>Preferences</Text>
            <Text style={styles.chevron}>{prefsOpen ? "▲" : "▼"}</Text>
          </Pressable>

          {prefsOpen && (
            <View style={styles.card}>
              {/* Display name */}
              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name shown to passengers"
                placeholderTextColor="#94a3b8"
                onBlur={() => { if (isAvailable) syncPresence(true); }}
              />

              <View style={styles.divider} />

              {/* Alert sound */}
              <View style={styles.prefRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Alert sound</Text>
                  <Text style={styles.fieldHint}>Chime when a new ride request arrives</Text>
                </View>
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  trackColor={{ false: "#e2e8f0", true: "#0d9488" }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.divider} />

              {/* Intent */}
              <Text style={styles.fieldLabel}>{t("driverIntent", "Ride intent")}</Text>
              <Text style={styles.fieldHint}>Are you already heading somewhere, or willing to detour?</Text>
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

              {/* Heading */}
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
            </View>
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
                    else { Alert.alert("Hub join failed", data?.detail ?? "Invalid or inactive hub code."); }
                  } catch {
                    Alert.alert("Network error", "Could not reach the server.");
                  } finally {
                    setJoiningHub(false);
                  }
                }}
              >
                <Text style={styles.outlineBtnText}>{joiningHub ? "Joining…" : "Join Hub"}</Text>
              </Pressable>
            </View>
          )}

          {/* ── Identity Verification ─────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Identity Verification</Text>
          </View>

          {idVerified === null ? (
            <View style={[styles.card, { paddingVertical: 20 }]}>
              <Text style={styles.fieldHint}>Checking verification status…</Text>
            </View>
          ) : idVerified ? (
            <View style={[styles.card, styles.successCard]}>
              <View style={styles.cardRow}>
                <Text style={{ fontSize: 22 }}>✅</Text>
                <Text style={[styles.successValue, { flex: 1 }]}>
                  Identity verified — you appear first in passenger matching.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.card, styles.warningCard]}>
              <View style={[styles.cardRow, { marginBottom: 8 }]}>
                <Text style={{ fontSize: 22 }}>⚠️</Text>
                <Text style={styles.warningTitle}>Not yet verified</Text>
              </View>
              <Text style={styles.warningBody}>
                Verified drivers receive a match score boost and are prioritised when operators enable strict mode.
              </Text>
              <Text style={[styles.warningBody, { marginTop: 6, fontWeight: "700" }]}>
                To verify: complete Stripe Identity from the web portal or ask your operator for the verification link.
              </Text>
            </View>
          )}

          {/* ── Receive Tips ──────────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Receive Tips</Text>
          </View>

          {connectChargesEnabled ? (
            <View style={[styles.card, styles.successCard]}>
              <View style={styles.cardRow}>
                <Text style={{ fontSize: 22 }}>💳</Text>
                <Text style={[styles.successValue, { flex: 1 }]}>
                  Tip payments enabled — passengers can tip you after rides.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.fieldHint}>
                Set up your payout account to receive voluntary tips.{"\n"}KindRide takes 0% — every cent goes to you.
              </Text>
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
                      Alert.alert("Setup failed", data?.detail ?? "Could not start account setup.");
                    }
                  } catch {
                    Alert.alert("Network error", "Could not reach the server.");
                  } finally {
                    setConnectOnboarding(false);
                  }
                }}
              >
                <Text style={styles.primaryBtnText}>
                  {connectOnboarding ? "Opening…" : "Set up payout account  →"}
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
              <Text style={styles.missionEyebrow}>Community</Text>
              <Text style={styles.missionHeadline}>{t("driverRatePassengerSection", "Rate your passenger")}</Text>
              <Text style={styles.missionBody}>
                Help build trust in the KindRide network by rating passengers after your trips.
              </Text>
              <Pressable
                style={styles.missionBtn}
                onPress={() => router.push("/rate-passenger")}
              >
                <Text style={styles.missionBtnText}>{t("driverRatePassengerManual", "Rate a passenger")}  →</Text>
              </Pressable>
            </LinearGradient>
          </View>

          {/* ── Trip history subtle link ──────────────────────────────────────── */}
          <Pressable style={styles.historyLink} onPress={() => router.push("/(tabs)/points")}>
            <Text style={styles.historyLinkText}>View trip history & points  →</Text>
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
  signInBtn: {
    backgroundColor: "#0d9488", borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  signInBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // ── Hero
  heroWrap: { margin: 16, marginBottom: 4 },
  heroGradient: { borderRadius: 24, padding: 22, overflow: "hidden" },
  heroTopRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 20,
  },
  logoRow: { flexDirection: "row", alignItems: "baseline" },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },

  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  statusPillOn: { backgroundColor: "rgba(16,185,129,0.2)" },
  statusPillOff: { backgroundColor: "rgba(255,255,255,0.1)" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusDotOn: { backgroundColor: "#4ade80" },
  statusDotOff: { backgroundColor: "rgba(255,255,255,0.4)" },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  statusTextOn: { color: "#4ade80" },
  statusTextOff: { color: "rgba(255,255,255,0.6)" },

  heroEyebrow: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "500", marginBottom: 2 },
  heroHeadline: {
    color: "#ffffff", fontSize: 36, fontWeight: "800",
    letterSpacing: -0.5, marginBottom: 20,
  },

  // Stats row inside hero
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  statCell: { flex: 1, alignItems: "center" },
  statNumber: { color: "#ffffff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 4 },

  // Toggle row
  toggleRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    gap: 12,
  },
  toggleRowOn: { backgroundColor: "rgba(13,148,136,0.25)" },
  toggleLabel: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  toggleSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },

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
  rideNewText: { fontSize: 12, fontWeight: "700", color: "#0369a1", letterSpacing: 0.3 },
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
  passengerName: { fontSize: 13, color: "#475569", marginBottom: 14 },

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
  primaryBtn: {
    backgroundColor: "#0d9488", borderRadius: 14, paddingVertical: 14, alignItems: "center",
  },
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
  historyLinkText: { color: "#0d9488", fontSize: 14, fontWeight: "600" },
});
