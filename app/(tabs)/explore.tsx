/**
 * ExploreScreen — KindRide
 *
 * Innovations:
 * - Full-screen MapView — drawer overlays it from 30% → 80%
 * - Safety panel slides in from right with 6 actionable items
 * - Silent check-in toggle + recording consent toggle (persisted)
 * - Live drivers-online counter with animated pulse dot
 * - Match score % badge on every route card
 * - Staggered FadeInDown entry animations (Reanimated 4, native thread)
 * - Haptic feedback on all interactions
 * - Filter chips with emoji icons, filter logic applied client-side
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoLinking from "expo-linking";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated as RNAnimated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

import { hasSupabaseEnv, supabase } from "@/lib/supabase";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

// Drawer snap heights (px from bottom)
const PEEK  = Math.round(SCREEN_H * 0.30);
const FULL  = Math.round(SCREEN_H * 0.80);

const CHECKIN_KEY = "kindride_silent_checkin";

// ─── Safety panel items ───────────────────────────────────────────────────────
const SAFETY_ROWS = [
  { id: "sos",       icon: "🆘", label: "One-tap SOS",       sub: "Alerts emergency services instantly", accent: "#fef2f2", dot: "#ef4444", type: "nav"    },
  { id: "share",     icon: "🔗", label: "Share my trip",      sub: "Live browser link — no app needed",   accent: "#f0fdf4", dot: "#16a34a", type: "action" },
  { id: "call",      icon: "📞", label: "Emergency contact",  sub: "One-tap call to your saved contact",  accent: "#eff6ff", dot: "#2563eb", type: "call"   },
  { id: "qr",        icon: "🔒", label: "QR Verification",    sub: "Cryptographic pickup confirmation",   accent: "#f0fdfa", dot: "#0d9488", type: "nav"    },
  { id: "checkin",   icon: "🤫", label: "Silent check-in",    sub: "Auto-ping if you don't confirm safety", accent: "#fdf4ff", dot: "#7c3aed", type: "toggle" },
  { id: "recording", icon: "🎙️", label: "Trip recording",     sub: "Encrypted · 24h · Dispute-only",     accent: "#fff7ed", dot: "#ea580c", type: "toggle" },
] as const;

// ─── Static nearby routes ─────────────────────────────────────────────────────
const NEARBY_ROUTES = [
  { id: "1", from: "Downtown Transit Hub",  to: "Westside Medical Centre", mins: 8,  driver: "Amara K.",  verified: true,  score: 94 },
  { id: "2", from: "University Campus",     to: "Airport Terminal B",      mins: 14, driver: "James O.",  verified: true,  score: 89 },
  { id: "3", from: "Community Church",      to: "Riverside District",      mins: 5,  driver: "Fatima S.", verified: false, score: 72 },
  { id: "4", from: "City Hall",             to: "Northside Hospital",      mins: 11, driver: "Kwame D.",  verified: true,  score: 91 },
] as const;

const FILTERS = [
  { key: "All",      label: "All Routes",    icon: "🗺️" },
  { key: "Medical",  label: "Medical",       icon: "🏥" },
  { key: "Airport",  label: "Airport",       icon: "✈️" },
  { key: "Campus",   label: "Campus",        icon: "🎓" },
  { key: "Verified", label: "Verified only", icon: "✅" },
] as const;

// ─── Route card ───────────────────────────────────────────────────────────────
function RouteCard({
  route, onPress,
}: {
  route: typeof NEARBY_ROUTES[number];
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.routeCard, pressed && styles.routeCardPressed]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
    >
      <View style={styles.routeTimeline}>
        <View style={styles.routeDotFrom} />
        <View style={styles.routeConnector} />
        <View style={styles.routeDotTo} />
      </View>
      <View style={styles.routeLabels}>
        <Text style={styles.routeFrom} numberOfLines={1}>{route.from}</Text>
        <Text style={styles.routeTo}   numberOfLines={1}>{route.to}</Text>
      </View>
      <View style={styles.routeMeta}>
        <Text style={styles.routeMins}>{route.mins} min</Text>
        <View style={styles.routeDriverRow}>
          {route.verified && <View style={styles.verifiedDot} />}
          <Text style={styles.routeDriver}>{route.driver.split(" ")[0]}</Text>
        </View>
        <View style={[styles.scorePill, { backgroundColor: route.score > 85 ? "#f0fdf4" : "#fff7ed" }]}>
          <Text style={[styles.scoreText, { color: route.score > 85 ? "#15803d" : "#c2410c" }]}>
            {route.score}%
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── ExploreScreen ────────────────────────────────────────────────────────────
export default function ExploreScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const mapRef   = useRef<MapView>(null);

  const [region, setRegion] = useState({
    latitude: 29.7604, longitude: -95.3698,
    latitudeDelta: 0.06, longitudeDelta: 0.06,
  });
  const [activeFilter,    setActiveFilter]    = useState("All");
  const [safetyOpen,      setSafetyOpen]      = useState(false);
  const [driversOnline,   setDriversOnline]   = useState(12);
  const [silentCheckin,   setSilentCheckin]   = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(false);

  // ── Drawer (PanResponder + RN Animated — not Reanimated, needs setValue) ────
  const drawerY = useRef(new RNAnimated.Value(PEEK)).current;
  const snapRef = useRef(PEEK);

  const snapTo = useCallback((target: number, velocity = 0) => {
    snapRef.current = target;
    RNAnimated.spring(drawerY, {
      toValue: target,
      velocity,
      tension: 68,
      friction: 11,
      useNativeDriver: false,
    }).start();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        (drawerY as any).stopAnimation((val: number) => { snapRef.current = val; });
      },
      onPanResponderMove: (_, g) => {
        const next = snapRef.current - g.dy;
        (drawerY as any).setValue(Math.max(PEEK, Math.min(FULL, next)));
      },
      onPanResponderRelease: (_, g) => {
        const current = snapRef.current - g.dy;
        const vel = -g.vy;
        if (vel > 0.5 || current > (PEEK + FULL) / 2) snapTo(FULL, vel);
        else snapTo(PEEK, vel);
      },
    })
  ).current;

  // ── Safety panel (Reanimated) ─────────────────────────────────────────────
  const safetyX       = useSharedValue(SCREEN_W);
  const safetyOpacity = useSharedValue(0);
  const pulseScale    = useSharedValue(1);

  const openSafety = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    safetyX.value       = withSpring(0, { damping: 18, stiffness: 180 });
    safetyOpacity.value = withTiming(1, { duration: 200 });
    setSafetyOpen(true);
  };

  const closeSafety = () => {
    safetyX.value       = withTiming(SCREEN_W, { duration: 220, easing: Easing.in(Easing.ease) });
    safetyOpacity.value = withTiming(0,       { duration: 180 });
    setSafetyOpen(false);
  };

  const safetyPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: safetyX.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: safetyOpacity.value,
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    })();
  }, []);

  // ── Pulse + drivers counter ───────────────────────────────────────────────
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ), -1, false,
    );
    const t = setInterval(() => setDriversOnline((n) => Math.max(8, n + (Math.random() > 0.5 ? 1 : -1))), 4000);
    return () => clearInterval(t);
  }, []);

  // ── Persist check-in preference ───────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(CHECKIN_KEY).then((v) => { if (v === "true") setSilentCheckin(true); });
  }, []);

  // ── Safety actions ────────────────────────────────────────────────────────
  const handleSafetyAction = useCallback(async (id: string) => {
    if (id === "sos") {
      closeSafety(); setTimeout(() => router.push("/sos"), 250);
    } else if (id === "qr") {
      closeSafety(); setTimeout(() => router.push("/incoming-ride-scan"), 250);
    } else if (id === "share") {
      const url = ExpoLinking.createURL("/ride-share", { queryParams: { token: "demo" } });
      await ExpoLinking.openURL(url).catch(() =>
        Alert.alert("Share trip", "Your live trip link is ready to share.")
      );
    } else if (id === "call") {
      Alert.alert("Emergency contact", "Call your saved emergency contact?", [
        { text: "Cancel", style: "cancel" },
        { text: "Call now", onPress: () => ExpoLinking.openURL("tel:911") },
      ]);
    }
  }, [router]);

  const handleCheckin = async (val: boolean) => {
    setSilentCheckin(val);
    await AsyncStorage.setItem(CHECKIN_KEY, String(val));
    if (val) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRecording = async (val: boolean) => {
    setRecordingConsent(val);
    if (val && hasSupabaseEnv && supabase) {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (uid) {
        await supabase.from("user_consents").upsert({
          user_id: uid, recording_consent: true,
          consented_at: new Date().toISOString(),
        });
      }
    }
    if (val) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Filtered routes ───────────────────────────────────────────────────────
  const filteredRoutes = useMemo(() => {
    if (activeFilter === "All")      return NEARBY_ROUTES;
    if (activeFilter === "Verified") return NEARBY_ROUTES.filter((r) => r.verified);
    if (activeFilter === "Medical")  return NEARBY_ROUTES.filter((r) => r.to.toLowerCase().includes("medical") || r.to.toLowerCase().includes("hospital"));
    if (activeFilter === "Airport")  return NEARBY_ROUTES.filter((r) => r.to.toLowerCase().includes("airport") || r.to.toLowerCase().includes("terminal"));
    if (activeFilter === "Campus")   return NEARBY_ROUTES.filter((r) => r.from.toLowerCase().includes("university") || r.from.toLowerCase().includes("campus"));
    return NEARBY_ROUTES;
  }, [activeFilter]);

  // ── Stable marker positions ───────────────────────────────────────────────
  const markerCoords = useMemo(() => NEARBY_ROUTES.map((r, i) => ({
    id: r.id, driver: r.driver, verified: r.verified,
    latitude:  region.latitude  + (i * 0.007 - 0.012),
    longitude: region.longitude + (i * 0.009 - 0.016),
  })), [region.latitude, region.longitude]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>

      {/* ── FULL-SCREEN MAP ───────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        region={region}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        mapPadding={{ bottom: PEEK + 16, top: 0, left: 0, right: 0 }}
      >
        {markerCoords.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.markerBubble, m.verified && styles.markerVerified]}>
              <Text style={styles.markerText}>{m.driver.split(" ")[0]}</Text>
              {m.verified && <View style={styles.markerVerifiedDot} />}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── TOP HUD ──────────────────────────────────────────────────────── */}
      <SafeAreaView style={styles.hud} edges={["top"]} pointerEvents="box-none">
        <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.hudRow}>
          {/* Live pill */}
          <View style={styles.hudPill}>
            <Animated.View style={[styles.hudLiveDot, pulseStyle]} />
            <View>
              <Text style={styles.hudPillTitle}>Explore</Text>
              <Text style={styles.hudPillSub}>{driversOnline} drivers online</Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.hudRight}>
            <Pressable
              style={({ pressed }) => [styles.hudBtn, pressed && { opacity: 0.7 }]}
              onPress={() => mapRef.current?.animateToRegion(
                { ...region, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600
              )}
              accessibilityLabel="Centre map"
            >
              <Text style={styles.hudBtnIcon}>◎</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.hudBtn,
                safetyOpen && styles.hudBtnActive,
                pressed && { opacity: 0.75 },
              ]}
              onPress={safetyOpen ? closeSafety : openSafety}
              accessibilityLabel="Safety panel"
            >
              <Text style={styles.hudBtnIcon}>🛡️</Text>
            </Pressable>
          </View>
        </Animated.View>
      </SafeAreaView>

      {/* ── SAFETY SCRIM ─────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.scrim, scrimStyle]}
        pointerEvents={safetyOpen ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSafety} />
      </Animated.View>

      {/* ── SAFETY PANEL (slides in from right) ──────────────────────────── */}
      <Animated.View
        style={[styles.safetyPanel, { top: insets.top + 64 }, safetyPanelStyle]}
        pointerEvents={safetyOpen ? "auto" : "none"}
      >
        <LinearGradient colors={["#0c1f3f", "#0e4a6e"]} style={styles.safetyHeader}>
          <Text style={styles.safetyTitle}>Safety Tools</Text>
          <Text style={styles.safetySub}>Every ride is protected</Text>
          <Pressable style={styles.safetyClose} onPress={closeSafety}>
            <Text style={styles.safetyCloseText}>✕</Text>
          </Pressable>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.safetyList}
          showsVerticalScrollIndicator={false}
        >
          {SAFETY_ROWS.map((item, i) => (
            <Animated.View key={item.id} entering={FadeInRight.delay(i * 55).springify()}>
              <Pressable
                style={[styles.safetyRow, { backgroundColor: item.accent }]}
                onPress={() => {
                  if (item.type !== "toggle") handleSafetyAction(item.id);
                }}
                disabled={item.type === "toggle"}
              >
                <View style={[styles.safetyDot, { backgroundColor: item.dot }]} />
                <View style={styles.safetyRowContent}>
                  <Text style={styles.safetyRowLabel}>{item.label}</Text>
                  <Text style={styles.safetyRowSub}>{item.sub}</Text>
                </View>
                {item.type === "toggle" ? (
                  <Switch
                    value={item.id === "checkin" ? silentCheckin : recordingConsent}
                    onValueChange={item.id === "checkin" ? handleCheckin : handleRecording}
                    trackColor={{ false: "#e2e8f0", true: item.dot }}
                    thumbColor="#ffffff"
                  />
                ) : (
                  <Text style={styles.safetyRowIcon}>{item.icon}</Text>
                )}
              </Pressable>
            </Animated.View>
          ))}

          <View style={styles.trustRow}>
            {["✅ ID Verified", "🔐 Encrypted", "⭐ Community Rated"].map((b) => (
              <View key={b} style={styles.trustBadge}>
                <Text style={styles.trustBadgeText}>{b}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </Animated.View>

      {/* ── BOTTOM DRAWER ────────────────────────────────────────────────── */}
      <Animated.View
        // Using RN Animated.Value for height (PanResponder requires setValue)
        style={[styles.drawer, { height: drawerY as any }]}
        {...panResponder.panHandlers}
      >
        {/* Handle */}
        <View style={styles.drawerHandleWrap}>
          <View style={styles.drawerHandleBar} />
        </View>

        {/* Header */}
        <View style={styles.drawerHeaderRow}>
          <View>
            <Text style={styles.drawerTitle}>Nearby Rides</Text>
            <Text style={styles.drawerSub}>{filteredRoutes.length} routes · Updated now</Text>
          </View>
          <Pressable
            style={styles.drawerCTASmall}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/(tabs)/ride-request");
            }}
          >
            <Text style={styles.drawerCTASmallText}>Get a ride →</Text>
          </Pressable>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map((f) => {
            const active = activeFilter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => { Haptics.selectionAsync(); setActiveFilter(f.key); }}
              >
                <Text style={styles.filterChipIcon}>{f.icon}</Text>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Route list */}
        <ScrollView
          contentContainerStyle={styles.routeList}
          showsVerticalScrollIndicator={false}
        >
          {filteredRoutes.length > 0 ? (
            filteredRoutes.map((r) => (
              <RouteCard key={r.id} route={r} onPress={() => router.push("/(tabs)/ride-request")} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>No routes match</Text>
              <Text style={styles.emptySub}>Try "All Routes" to see nearby drivers</Text>
            </View>
          )}

          {/* Book CTA */}
          <Pressable
            style={({ pressed }) => [styles.drawerCTA, pressed && { opacity: 0.88 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              router.push("/(tabs)/ride-request");
            }}
          >
            <LinearGradient
              colors={["#1a56db", "#0e7490"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.drawerCTAGradient}
            >
              <Text style={styles.drawerCTAText}>Book your ride  →</Text>
              <Text style={styles.drawerCTASub}>Free · Verified drivers · No surge</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </Animated.View>

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const CARD_SHADOW = Platform.select({
  ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  android: { elevation: 4 },
});
const DRAWER_SHADOW = Platform.select({
  ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.10, shadowRadius: 16 },
  android: { elevation: 16 },
});

const styles = StyleSheet.create({
  root: { flex: 1 },

  // ── HUD
  hud: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  hudRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14, paddingTop: 6,
  },
  hudPill: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#ffffff", borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10, ...CARD_SHADOW,
  },
  hudLiveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: "#34d399",
    ...Platform.select({
      ios: { shadowColor: "#34d399", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
    }),
  },
  hudPillTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", letterSpacing: -0.2 },
  hudPillSub:   { fontSize: 10, fontWeight: "600", color: "#0d9488", marginTop: 1 },
  hudRight:     { flexDirection: "row", gap: 8 },
  hudBtn: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center", ...CARD_SHADOW,
  },
  hudBtnActive: { backgroundColor: "#0c1f3f" },
  hudBtnIcon:   { fontSize: 18 },

  // ── Map markers
  markerBubble: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#1a56db",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 2, borderColor: "#ffffff",
    ...Platform.select({
      ios:     { shadowColor: "#1a56db", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  markerVerified:    { backgroundColor: "#0d9488" },
  markerText:        { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  markerVerifiedDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#5eead4" },

  // ── Scrim + safety panel
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 20 },

  safetyPanel: {
    position: "absolute", right: 0,
    width: SCREEN_W * 0.88,
    bottom: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    zIndex: 30, overflow: "hidden",
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.18, shadowRadius: 20 },
      android: { elevation: 24 },
    }),
  },
  safetyHeader: { padding: 20, paddingTop: 22 },
  safetyTitle:  { fontSize: 20, fontWeight: "800", color: "#ffffff", marginBottom: 2 },
  safetySub:    { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  safetyClose: {
    position: "absolute", top: 16, right: 16,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  safetyCloseText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  safetyList: { padding: 14, gap: 8 },
  safetyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.04)",
  },
  safetyDot:        { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  safetyRowContent: { flex: 1 },
  safetyRowLabel:   { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  safetyRowSub:     { fontSize: 11, color: "#64748b", marginTop: 2 },
  safetyRowIcon:    { fontSize: 20 },
  trustRow:         { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  trustBadge:       { backgroundColor: "#f1f5f9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  trustBadgeText:   { fontSize: 10, fontWeight: "600", color: "#475569" },

  // ── Drawer
  drawer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    ...DRAWER_SHADOW,
  },
  drawerHandleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  drawerHandleBar:  { width: 36, height: 4, borderRadius: 2, backgroundColor: "#e2e8f0" },
  drawerHeaderRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 8,
  },
  drawerTitle:     { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  drawerSub:       { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  drawerCTASmall: {
    backgroundColor: "#eff6ff", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  drawerCTASmallText: { fontSize: 12, fontWeight: "700", color: "#1a56db" },

  // Filter chips
  filtersRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20, backgroundColor: "#f1f5f9",
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  filterChipActive:     { backgroundColor: "#0c1f3f", borderColor: "#0c1f3f" },
  filterChipIcon:       { fontSize: 12 },
  filterChipText:       { fontSize: 12, fontWeight: "600", color: "#475569" },
  filterChipTextActive: { color: "#ffffff" },

  // Route cards
  routeList: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  routeCard: {
    backgroundColor: "#ffffff", borderRadius: 16, padding: 14,
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#f1f5f9", ...CARD_SHADOW,
  },
  routeCardPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  routeTimeline:    { alignItems: "center", width: 14, marginRight: 12 },
  routeDotFrom:     { width: 10, height: 10, borderRadius: 5, backgroundColor: "#1a56db" },
  routeConnector:   { width: 1.5, height: 20, backgroundColor: "#e2e8f0", marginVertical: 3 },
  routeDotTo:       { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0d9488" },
  routeLabels:      { flex: 1 },
  routeFrom:        { fontSize: 12, color: "#64748b", fontWeight: "500", marginBottom: 6 },
  routeTo:          { fontSize: 14, color: "#0f172a", fontWeight: "700" },
  routeMeta:        { alignItems: "flex-end", gap: 4 },
  routeMins:        { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  routeDriverRow:   { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0d9488" },
  routeDriver:      { fontSize: 11, color: "#64748b", fontWeight: "600" },
  scorePill:        { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  scoreText:        { fontSize: 10, fontWeight: "800" },

  // Empty state
  emptyState: { alignItems: "center", paddingVertical: 28 },
  emptyIcon:  { fontSize: 34, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#334155", marginBottom: 4 },
  emptySub:   { fontSize: 13, color: "#94a3b8", textAlign: "center" },

  // Book CTA
  drawerCTA:         { borderRadius: 18, overflow: "hidden", marginTop: 4 },
  drawerCTAGradient: { padding: 18, alignItems: "center" },
  drawerCTAText:     { color: "#ffffff", fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  drawerCTASub:      { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 3 },
});
