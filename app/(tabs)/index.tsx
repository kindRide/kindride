import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { useAuth } from "@/lib/auth";
import { getRecentDestinations, type RecentDestination } from "@/lib/recent-destinations";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(user: any): string {
  const meta = user?.user_metadata;
  const raw =
    meta?.full_name || meta?.name ||
    user?.email?.split("@")[0] ||
    user?.phone?.slice(-4) ||
    "there";
  return raw.split(/[\s._]/)[0];
}

// ─── component ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load recent destinations on focus
  useFocusEffect(
    useCallback(() => {
      getRecentDestinations().then(setRecents);
    }, [])
  );

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  // Subtle pulse on the impact counter dot
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleSignOut = () => {
    Alert.alert(t("signOut"), t("areYouSureSignOut"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("signOut"),
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/sign-in");
        },
      },
    ]);
  };

  const name = firstName(user);

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Top bar ──────────────────────────────────────────────── */}
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <View className="flex-row items-baseline gap-0.5">
              <Text className="text-xl font-black tracking-tight text-slate-900">Kind</Text>
              <Text className="text-xl font-light tracking-tight text-teal-600">Ride</Text>
            </View>

            {user && (
              <Pressable
                onPress={handleSignOut}
                className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center active:opacity-60"
                accessibilityLabel="Sign out"
              >
                <Text className="text-sm font-bold text-slate-500">
                  {name.charAt(0).toUpperCase()}
                </Text>
              </Pressable>
            )}
          </View>

          {/* ── Hero ─────────────────────────────────────────────────── */}
          <View className="mx-4 mt-1 mb-5">
            <LinearGradient
              colors={["#0c1f3f", "#0e4a6e", "#065f46"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              {/* Live indicator */}
              <View style={styles.liveRow}>
                <Animated.View
                  style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]}
                />
                <Text style={styles.liveText}>4,280 rides given · 18 communities</Text>
              </View>

              {/* Greeting */}
              <Text style={styles.heroGreeting}>
                {greeting()},{"\n"}
                <Text style={styles.heroName}>{name}.</Text>
              </Text>

              {/* Destination search bar — tappable */}
              <Pressable
                onPress={() => router.push("/(tabs)/ride-request")}
                style={({ pressed }) => [
                  styles.searchBar,
                  pressed && { opacity: 0.88 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Where to?"
              >
                <View style={styles.searchDot} />
                <Text style={styles.searchPlaceholder}>Where to?</Text>
                <View style={styles.searchArrow}>
                  <Text style={styles.searchArrowText}>→</Text>
                </View>
              </Pressable>
            </LinearGradient>
          </View>

          {/* ── Action cards ─────────────────────────────────────────── */}
          {/* Get a Ride — full width primary */}
          <View className="px-4 mb-3">
            <Pressable
              onPress={() => router.push("/(tabs)/ride-request")}
              style={({ pressed }) => [
                styles.rideCard,
                pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
              ]}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={["#1a56db", "#0e7490"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.rideCardGradient}
              >
                <View>
                  <Text style={styles.rideCardLabel}>GET A RIDE</Text>
                  <Text style={styles.rideCardTitle}>Book your trip</Text>
                  <Text style={styles.rideCardSub}>Free · Verified drivers · Safe</Text>
                </View>
                <View style={styles.rideCardIconWrap}>
                  <Text style={styles.rideCardIcon}>🚗</Text>
                </View>
              </LinearGradient>
            </Pressable>
          </View>

          {/* Drive + Points — 50/50 */}
          <View className="flex-row px-4 gap-3 mb-6">
            <Pressable
              onPress={() => router.push("/(tabs)/driver")}
              style={({ pressed }) => [
                styles.secondaryCard,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
              className="flex-1"
              accessibilityRole="button"
            >
              <View style={[styles.secondaryIconWrap, { backgroundColor: "#f0fdfa" }]}>
                <Text style={styles.secondaryIcon}>🙌</Text>
              </View>
              <Text style={styles.secondaryTitle}>Drive</Text>
              <Text style={styles.secondarySub}>Earn points</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(tabs)/points")}
              style={({ pressed }) => [
                styles.secondaryCard,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
              className="flex-1"
              accessibilityRole="button"
            >
              <View style={[styles.secondaryIconWrap, { backgroundColor: "#fefce8" }]}>
                <Text style={styles.secondaryIcon}>⭐</Text>
              </View>
              <Text style={styles.secondaryTitle}>Points</Text>
              <Text style={styles.secondarySub}>My impact</Text>
            </Pressable>
          </View>

          {/* ── Recent destinations ──────────────────────────────────── */}
          {recents.length > 0 && (
            <>
              <View className="px-5 mb-3">
                <Text className="text-base font-bold text-slate-900 tracking-tight">
                  Recent
                </Text>
              </View>

              <View className="mx-4 mb-5" style={styles.recentsCard}>
                {recents.slice(0, 4).map((dest, idx) => (
                  <View key={`${dest.label}-${idx}`}>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/(tabs)/ride-request",
                          params: {
                            prefillLabel: dest.label,
                            prefillLat: String(dest.latitude),
                            prefillLng: String(dest.longitude),
                          },
                        })
                      }
                      style={({ pressed }) => [
                        styles.recentRow,
                        pressed && { backgroundColor: "#f8fafc" },
                      ]}
                      accessibilityRole="button"
                    >
                      {/* Timeline dot */}
                      <View style={styles.recentDotWrap}>
                        <View style={styles.recentDot} />
                        {idx < recents.slice(0, 4).length - 1 && (
                          <View style={styles.recentLine} />
                        )}
                      </View>

                      <View style={styles.recentContent}>
                        <Text style={styles.recentLabel} numberOfLines={1}>
                          {dest.label}
                        </Text>
                        <Text style={styles.recentTime}>
                          {formatRelative(dest.usedAt)}
                        </Text>
                      </View>

                      <Text style={styles.recentChevron}>›</Text>
                    </Pressable>

                    {idx < recents.slice(0, 4).length - 1 && (
                      <View style={styles.recentDivider} />
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Mission strip ────────────────────────────────────────── */}
          <View className="mx-4">
            <LinearGradient
              colors={["#065f46", "#0e7490"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.missionStrip}
            >
              <Text style={styles.missionEyebrow}>Our Promise</Text>
              <Text style={styles.missionHeadline}>Kindness is the engine.</Text>
              <Text style={styles.missionBody}>
                No surge pricing. No algorithms. Just humans helping humans get where they need to go.
              </Text>
            </LinearGradient>
          </View>

        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── utils ───────────────────────────────────────────────────────────────────

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ─── styles ──────────────────────────────────────────────────────────────────

const shadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
  },
  android: { elevation: 4 },
});

const shadowSm = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  // Hero
  hero: {
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 16,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#34d399",
  },
  liveText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  heroGreeting: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
    marginBottom: 4,
  },
  heroName: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 40,
  },

  // Search bar (inside hero)
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 20,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  searchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0d9488",
    flexShrink: 0,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#94a3b8",
    letterSpacing: 0.1,
  },
  searchArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
  },
  searchArrowText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    marginTop: -1,
  },

  // Get a Ride card
  rideCard: {
    borderRadius: 20,
    overflow: "hidden",
    ...shadow,
  },
  rideCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 22,
    borderRadius: 20,
  },
  rideCardLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 5,
  },
  rideCardTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  rideCardSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "500",
  },
  rideCardIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  rideCardIcon: { fontSize: 26 },

  // Secondary cards
  secondaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    ...shadow,
  },
  secondaryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  secondaryIcon: { fontSize: 22 },
  secondaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  secondarySub: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
  },

  // Recents
  recentsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    overflow: "hidden",
    ...shadow,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 0,
  },
  recentDotWrap: {
    width: 20,
    alignItems: "center",
    marginRight: 14,
    alignSelf: "stretch",
    justifyContent: "flex-start",
    paddingTop: 3,
  },
  recentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0d9488",
  },
  recentLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: "#e2e8f0",
    marginTop: 4,
    alignSelf: "center",
  },
  recentContent: { flex: 1 },
  recentLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 2,
  },
  recentTime: { fontSize: 11, color: "#94a3b8", fontWeight: "500" },
  recentChevron: { fontSize: 20, color: "#cbd5e1", marginLeft: 8 },
  recentDivider: { height: 1, backgroundColor: "#f8fafc", marginLeft: 50 },

  // Mission strip
  missionStrip: {
    borderRadius: 20,
    padding: 22,
  },
  missionEyebrow: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  missionHeadline: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  missionBody: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 13,
    lineHeight: 20,
  },
});
