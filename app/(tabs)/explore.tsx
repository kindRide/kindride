import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

// Drawer snap points (from bottom of screen)
const DRAWER_PEEK   = 220;   // collapsed — shows handle + top content
const DRAWER_HALF   = 420;   // mid — nearby + filters visible
const DRAWER_FULL   = SCREEN_H * 0.72; // full open

// Features with routes — for the safety panel
const SAFETY_ITEMS = [
  { icon: "🆘", label: "One-tap SOS",         sub: "Alerts emergency services",   route: "/sos" as const,                  accent: "#fef2f2", dot: "#ef4444" },
  { icon: "🔒", label: "QR Verification",      sub: "Cryptographic pickup check",  route: "/incoming-ride-scan" as const,   accent: "#f0fdfa", dot: "#0d9488" },
  { icon: "⭐", label: "Rate your ride",        sub: "Mutual trust scoring",        route: "/rate-passenger" as const,       accent: "#eff6ff", dot: "#2563eb" },
  { icon: "📍", label: "Live GPS tracking",    sub: "Driver presence synced",      route: "/(tabs)/driver" as const,        accent: "#fdf4ff", dot: "#7c3aed" },
];

const NEARBY_ROUTES = [
  { id: "1", from: "Downtown Transit Hub",  to: "Westside Medical Centre", mins: 8,  driver: "Amara K.", verified: true,  dir: "North" },
  { id: "2", from: "University Campus",     to: "Airport Terminal B",      mins: 14, driver: "James O.", verified: true,  dir: "East"  },
  { id: "3", from: "Community Church",      to: "Riverside District",      mins: 5,  driver: "Fatima S.", verified: false, dir: "South" },
];

const FILTERS = ["All Routes", "Medical", "Airport", "Campus", "Verified only"];

// ─── component ───────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // Map region — defaults to a readable world view, updates to user location
  const [region, setRegion] = useState({
    latitude: 29.7604,
    longitude: -95.3698,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });

  // Safety panel visibility
  const [safetyOpen, setSafetyOpen] = useState(false);
  const safetyAnim = useRef(new Animated.Value(0)).current;

  // Active filter
  const [activeFilter, setActiveFilter] = useState("All Routes");

  // ── Drawer animation ────────────────────────────────────────────────────────
  const drawerY = useRef(new Animated.Value(DRAWER_PEEK)).current;
  const drawerSnap = useRef(DRAWER_PEEK);

  const snapTo = (target: number, velocity = 0) => {
    drawerSnap.current = target;
    Animated.spring(drawerY, {
      toValue: target,
      velocity,
      tension: 68,
      friction: 11,
      useNativeDriver: false,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        drawerY.stopAnimation((val) => { drawerSnap.current = val; });
      },
      onPanResponderMove: (_, g) => {
        const next = drawerSnap.current - g.dy;
        drawerY.setValue(Math.max(DRAWER_PEEK, Math.min(DRAWER_FULL, next)));
      },
      onPanResponderRelease: (_, g) => {
        const current = drawerSnap.current - g.dy;
        const vel = -g.vy;
        if (vel > 0.5 || current > (DRAWER_HALF + DRAWER_FULL) / 2) {
          snapTo(DRAWER_FULL, vel);
        } else if (current > (DRAWER_PEEK + DRAWER_HALF) / 2) {
          snapTo(DRAWER_HALF, vel);
        } else {
          snapTo(DRAWER_PEEK, vel);
        }
      },
    })
  ).current;

  // ── Safety panel toggle ─────────────────────────────────────────────────────
  const toggleSafety = () => {
    const toVal = safetyOpen ? 0 : 1;
    Animated.spring(safetyAnim, {
      toValue: toVal,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();
    setSafetyOpen(!safetyOpen);
  };

  // ── Location ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      });
    })();
  }, []);

  const safetyPanelTranslate = safetyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-320, 0],
  });

  const safetyOverlayOpacity = safetyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  return (
    <View style={styles.root}>

      {/* ── MAP — fills top ~60% ─────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        region={region}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        mapPadding={{ bottom: DRAWER_PEEK + 20, top: 0, left: 0, right: 0 }}
      >
        {/* Sample nearby driver markers */}
        {NEARBY_ROUTES.map((r) => (
          <Marker
            key={r.id}
            coordinate={{
              latitude: region.latitude + (Math.random() - 0.5) * 0.04,
              longitude: region.longitude + (Math.random() - 0.5) * 0.04,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.markerBubble}>
              <Text style={styles.markerText}>{r.driver.split(" ")[0]}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── TOP HUD ──────────────────────────────────────────────────────────── */}
      <SafeAreaView style={styles.hud} edges={["top"]} pointerEvents="box-none">
        <View style={styles.hudRow}>
          {/* Screen title */}
          <View style={styles.hudTitle}>
            <Text style={styles.hudTitleText}>Explore</Text>
            <Text style={styles.hudTitleSub}>Rides near you</Text>
          </View>

          {/* Shield icon — safety panel trigger */}
          <Pressable
            onPress={toggleSafety}
            style={({ pressed }) => [
              styles.shieldBtn,
              safetyOpen && styles.shieldBtnActive,
              pressed && { opacity: 0.75 },
            ]}
            accessibilityLabel="Safety panel"
            accessibilityRole="button"
          >
            <Text style={styles.shieldIcon}>🛡️</Text>
          </Pressable>
        </View>

        {/* My location button */}
        <Pressable
          style={({ pressed }) => [styles.locBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion({ ...region, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600);
            }
          }}
          accessibilityLabel="Centre map on my location"
        >
          <Text style={{ fontSize: 18 }}>◎</Text>
        </Pressable>
      </SafeAreaView>

      {/* ── SAFETY PANEL (slides in from top-right) ──────────────────────────── */}
      {/* Scrim */}
      <Animated.View
        style={[styles.safetyScrim, { opacity: safetyOverlayOpacity }]}
        pointerEvents={safetyOpen ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={toggleSafety} />
      </Animated.View>

      <Animated.View
        style={[
          styles.safetyPanel,
          { top: insets.top + 56, transform: [{ translateY: safetyPanelTranslate }] },
        ]}
        pointerEvents={safetyOpen ? "auto" : "none"}
      >
        <Text style={styles.safetyTitle}>Safety Tools</Text>
        <Text style={styles.safetySub}>Protected on every ride</Text>

        {SAFETY_ITEMS.map((item) => (
          <Pressable
            key={item.label}
            style={({ pressed }) => [
              styles.safetyRow,
              { backgroundColor: item.accent },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => { toggleSafety(); setTimeout(() => router.push(item.route), 250); }}
          >
            <View style={[styles.safetyDot, { backgroundColor: item.dot }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.safetyRowLabel}>{item.label}</Text>
              <Text style={styles.safetyRowSub}>{item.sub}</Text>
            </View>
            <Text style={styles.safetyRowIcon}>{item.icon}</Text>
          </Pressable>
        ))}

        {/* Trust badges */}
        <View style={styles.safetyBadgeRow}>
          {["✅ ID Verified", "🔐 Encrypted", "📋 Community Rated"].map((b) => (
            <View key={b} style={styles.safetyBadge}>
              <Text style={styles.safetyBadgeText}>{b}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* ── BOTTOM DRAWER ────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.drawer, { height: drawerY }]}
        {...panResponder.panHandlers}
      >
        {/* Handle */}
        <View style={styles.drawerHandle} />

        {/* Filters — horizontal chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>
                {f}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Section header */}
        <View style={styles.drawerSectionRow}>
          <Text style={styles.drawerSectionTitle}>Nearby Drivers</Text>
          <Pressable onPress={() => router.push("/(tabs)/ride-request")}>
            <Text style={styles.drawerSectionLink}>Get a ride →</Text>
          </Pressable>
        </View>

        {/* Route cards */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={drawerSnap.current >= DRAWER_HALF}
        >
          {NEARBY_ROUTES.map((r) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.routeCard, pressed && { opacity: 0.85 }]}
              onPress={() => router.push("/(tabs)/ride-request")}
            >
              {/* Route timeline */}
              <View style={styles.routeTimeline}>
                <View style={styles.routeDotFrom} />
                <View style={styles.routeLine} />
                <View style={styles.routeDotTo} />
              </View>

              {/* Labels */}
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={styles.routeFrom} numberOfLines={1}>{r.from}</Text>
                <Text style={styles.routeTo}   numberOfLines={1}>{r.to}</Text>
              </View>

              {/* Meta */}
              <View style={styles.routeMeta}>
                <Text style={styles.routeMins}>{r.mins} min</Text>
                <View style={styles.routeDriverRow}>
                  {r.verified && (
                    <View style={styles.verifiedDot} />
                  )}
                  <Text style={styles.routeDriver}>{r.driver.split(" ")[0]}</Text>
                </View>
              </View>
            </Pressable>
          ))}

          {/* CTA row */}
          <Pressable
            onPress={() => router.push("/(tabs)/ride-request")}
            style={({ pressed }) => [styles.drawerCta, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={["#1a56db", "#0e7490"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.drawerCtaGradient}
            >
              <Text style={styles.drawerCtaText}>Book your ride  →</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </Animated.View>

    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 12 },
  android: { elevation: 12 },
});

const CARD_SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#e5e7eb" },

  // Map
  map: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // HUD
  hud: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  hudRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  hudTitle: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...CARD_SHADOW,
  },
  hudTitleText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  hudTitleSub: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0d9488",
    letterSpacing: 0.3,
    marginTop: 1,
  },
  shieldBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },
  shieldBtnActive: {
    backgroundColor: "#0d9488",
  },
  shieldIcon: { fontSize: 20 },

  // Location button
  locBtn: {
    position: "absolute",
    right: 16,
    top: 72,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },

  // Map markers
  markerBubble: {
    backgroundColor: "#0d9488",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: "#ffffff",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  markerText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },

  // Safety panel
  safetyScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 10,
  },
  safetyPanel: {
    position: "absolute",
    right: 12,
    width: SCREEN_W * 0.82,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    zIndex: 20,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 },
      android: { elevation: 20 },
    }),
  },
  safetyTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginBottom: 2 },
  safetySub: { fontSize: 12, color: "#94a3b8", fontWeight: "500", marginBottom: 14 },
  safetyRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  safetyDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  safetyRowLabel: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginBottom: 1 },
  safetyRowSub: { fontSize: 11, color: "#64748b" },
  safetyRowIcon: { fontSize: 20 },
  safetyBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  safetyBadge: {
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  safetyBadgeText: { fontSize: 10, fontWeight: "600", color: "#475569" },

  // Bottom drawer
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...SHADOW,
  },
  drawerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 14,
  },

  // Filters
  filtersRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  filterChipActive: {
    backgroundColor: "#0c1f3f",
    borderColor: "#0c1f3f",
  },
  filterChipText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  filterChipTextActive: { color: "#ffffff" },

  // Drawer section header
  drawerSectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  drawerSectionTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", letterSpacing: -0.2 },
  drawerSectionLink: { fontSize: 13, fontWeight: "600", color: "#0d9488" },

  // Route cards
  routeCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  routeTimeline: { alignItems: "center", width: 12 },
  routeDotFrom: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0d9488" },
  routeLine: { width: 1.5, height: 22, backgroundColor: "#cbd5e1", marginVertical: 3 },
  routeDotTo: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1a56db" },
  routeFrom: { fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8 },
  routeTo: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  routeMeta: { alignItems: "flex-end", marginLeft: 12 },
  routeMins: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  routeDriverRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0d9488" },
  routeDriver: { fontSize: 11, fontWeight: "600", color: "#64748b" },

  // Drawer CTA
  drawerCta: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  drawerCtaGradient: { paddingVertical: 16, alignItems: "center", borderRadius: 16 },
  drawerCtaText: { color: "#ffffff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
});
