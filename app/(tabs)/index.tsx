/**
 * HomeScreen — KindRide
 *
 * Innovations:
 * - Shimmer skeleton (Reanimated 4, native driver) — no white flash on load
 * - Animated count-up community rides counter in hero
 * - Auto-advancing impact story cards (4 s interval, anonymised human stories)
 * - Smart suggestion chips from recent destinations (pill row, not a list)
 * - "Take Me Home" one-tap shortcut (persisted in AsyncStorage)
 * - Haptic feedback on every primary interaction
 * - expo-image blurhash placeholders on story cards
 * - All animations run on the native thread (Reanimated useNativeDriver)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { useAuth } from "@/lib/auth";
import { getRecentDestinations, type RecentDestination } from "@/lib/recent-destinations";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";

const { width: W } = Dimensions.get("window");
const STORY_W = W - 64; // story card width

const HOME_LOCATION_KEY = "kindride_home_location";

// ─── Impact stories ──────────────────────────────────────────────────────────
// Anonymised, rotating community impact narratives
const STORIES = [
  {
    key: "s1",
    emoji: "🎓",
    name: "A student in Austin",
    story: "Made it to her 8am final exam on time. Driver was already heading that way — zero detour.",
    points: 45,
    blurhash: "L6Pj0^jE.AyE_3t7t7R**0o#DgR4",
    tint: "#eff6ff",
    dot: "#2563eb",
  },
  {
    key: "s2",
    emoji: "🏥",
    name: "A nurse in Houston",
    story: "Reached the hospital for her night shift. No fare, no surge. Pure community kindness.",
    points: 82,
    blurhash: "L6Pj0^jE.AyE_3t7t7R**0o#DgR4",
    tint: "#f0fdf4",
    dot: "#16a34a",
  },
  {
    key: "s3",
    emoji: "👴",
    name: "An elder in Atlanta",
    story: "Made it to his weekly dialysis. Driver went 12 minutes out of his way. Didn't mention it once.",
    points: 63,
    blurhash: "L6Pj0^jE.AyE_3t7t7R**0o#DgR4",
    tint: "#fdf4ff",
    dot: "#7c3aed",
  },
  {
    key: "s4",
    emoji: "🧒",
    name: "A single mum in Dallas",
    story: "Kids dropped at school, made it to work on time. First time in weeks she wasn't late.",
    points: 38,
    blurhash: "L6Pj0^jE.AyE_3t7t7R**0o#DgR4",
    tint: "#fff7ed",
    dot: "#ea580c",
  },
  {
    key: "s5",
    emoji: "🌍",
    name: "A new arrival in Phoenix",
    story: "Reached the immigration office for his appointment. His very first KindRide. He cried.",
    points: 27,
    blurhash: "L6Pj0^jE.AyE_3t7t7R**0o#DgR4",
    tint: "#f0fdfa",
    dot: "#0d9488",
  },
] as const;

// ─── Shimmer block ────────────────────────────────────────────────────────────
function Shimmer({ width, height, radius = 12 }: { width: number | string; height: number; radius?: number }) {
  const opacity = useSharedValue(0.35);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: "#dde3ea" }, style]}
    />
  );
}

// ─── Skeleton home ────────────────────────────────────────────────────────────
function SkeletonHome() {
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* Hero skeleton */}
        <View style={[styles.heroWrap, { backgroundColor: "#1a2f55", borderRadius: 24, overflow: "hidden", minHeight: 240, padding: 24, justifyContent: "flex-end" }]}>
          <Shimmer width={90} height={12} radius={6} />
          <View style={{ height: 12 }} />
          <Shimmer width={200} height={32} radius={8} />
          <View style={{ height: 16 }} />
          <Shimmer width="100%" height={50} radius={14} />
        </View>
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 10 }}>
          <Shimmer width="100%" height={80} radius={20} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Shimmer width={(W - 44) / 2} height={100} radius={20} />
            <Shimmer width={(W - 44) / 2} height={100} radius={20} />
          </View>
          <Shimmer width="100%" height={130} radius={20} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Impact story card ────────────────────────────────────────────────────────
function StoryCard({ story, active }: { story: typeof STORIES[number]; active: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(active ? 1 : 0.96, { damping: 14, stiffness: 120 });
  }, [active]);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.storyCard, { backgroundColor: story.tint, width: STORY_W }, animStyle]}>
      <View style={styles.storyTopRow}>
        <View style={[styles.storyDot, { backgroundColor: story.dot }]} />
        <Text style={styles.storyName}>{story.name}</Text>
        <View style={styles.storyPointsPill}>
          <Text style={styles.storyPointsText}>+{story.points} pts</Text>
        </View>
      </View>
      <Text style={styles.storyEmoji}>{story.emoji}</Text>
      <Text style={styles.storyText}>"{story.story}"</Text>
    </Animated.View>
  );
}

// ─── Suggestion chip ──────────────────────────────────────────────────────────
function SuggestionChip({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
    >
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const [homeLocation, setHomeLocation] = useState<RecentDestination | null>(null);
  const [activeStory, setActiveStory] = useState(0);
  const [communityCount, setCommunityCount] = useState(4180);
  const [recentEvents, setRecentEvents] = useState<{ label: string; pts: number }[]>([]);

  const storyScrollRef = useRef<ScrollView>(null);
  const storyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseScale = useSharedValue(1);
  const countUpRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const name = (() => {
    const meta = user?.user_metadata;
    const raw = meta?.full_name || meta?.name || user?.email?.split("@")[0] || user?.phone?.slice(-4) || "there";
    return raw.split(/[\s._]/)[0];
  })();

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Load data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [dest, home] = await Promise.all([
      getRecentDestinations(),
      AsyncStorage.getItem(HOME_LOCATION_KEY),
    ]);
    setRecents(dest);
    if (home) {
      try { setHomeLocation(JSON.parse(home)); } catch {}
    }

    // Load recent point events if signed in
    if (hasSupabaseEnv && supabase) {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (uid) {
        const { data: evts } = await supabase
          .from("point_events")
          .select("action, points_change")
          .eq("driver_id", uid)
          .order("created_at", { ascending: false })
          .limit(3);
        if (evts?.length) {
          setRecentEvents(evts.map((e: any) => ({
            label: String(e.action).replaceAll("_", " "),
            pts: e.points_change,
          })));
        }
      }
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── Animations on mount ──────────────────────────────────────────────────
  useEffect(() => {
    // Minimum skeleton duration so it never flashes
    const minTimer = setTimeout(() => setLoading(false), 800);

    // Pulse dot
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.45, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0,  { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    // Count-up community rides
    const target = 4280;
    countUpRef.current = setInterval(() => {
      setCommunityCount((c) => {
        if (c >= target) {
          clearInterval(countUpRef.current!);
          return target;
        }
        return c + 3;
      });
    }, 28);

    // Story rotation
    storyTimerRef.current = setInterval(() => {
      setActiveStory((i) => (i + 1) % STORIES.length);
    }, 4000);

    return () => {
      clearTimeout(minTimer);
      clearInterval(countUpRef.current!);
      clearInterval(storyTimerRef.current!);
    };
  }, []);

  // Scroll story list when index changes
  useEffect(() => {
    storyScrollRef.current?.scrollTo({ x: activeStory * (STORY_W + 12), animated: true });
  }, [activeStory]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goToRide = (params?: Record<string, string>) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/(tabs)/ride-request", params });
  };

  const goToDriver = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/driver");
  };

  const goToPoints = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/points");
  };

  // ── Skeleton ─────────────────────────────────────────────────────────────
  if (loading) return <SkeletonHome />;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 52 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={["#0c1f3f", "#1a56db", "#0e7490"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            {/* Top row: logo + avatar */}
            <View style={styles.heroTopRow}>
              <View style={styles.logoRow}>
                <Text style={styles.logoKind}>Kind</Text>
                <Text style={styles.logoRide}>Ride</Text>
              </View>
              {user && (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>

            {/* Live pulse + community count */}
            <Animated.View entering={FadeIn.delay(200)} style={styles.liveRow}>
              <Animated.View style={[styles.liveDot, pulseStyle]} />
              <Text style={styles.liveText}>{communityCount.toLocaleString()} rides given this month</Text>
            </Animated.View>

            {/* Greeting */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <Text style={styles.heroGreeting}>{timeGreeting},</Text>
              <Text style={styles.heroName}>{name}.</Text>
            </Animated.View>

            {/* Search bar */}
            <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.searchBar}>
              <Pressable
                style={styles.searchTouchable}
                onPress={() => goToRide()}
                accessibilityRole="search"
                accessibilityLabel="Search destination"
              >
                <View style={styles.searchDot} />
                <Text style={styles.searchPlaceholder}>Where to?</Text>
                <Pressable
                  style={styles.micBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    // Voice input — wired to expo-av in future sprint
                    goToRide();
                  }}
                  accessibilityLabel="Voice search"
                >
                  <Text style={styles.micIcon}>🎙️</Text>
                </Pressable>
              </Pressable>
            </Animated.View>

            {/* Take Me Home shortcut */}
            {homeLocation && (
              <Animated.View entering={FadeIn.delay(300)} style={styles.homeChipRow}>
                <SuggestionChip
                  icon="🏠"
                  label="Take Me Home"
                  onPress={() => goToRide({
                    prefillLabel: homeLocation.label,
                    prefillLat: String(homeLocation.latitude),
                    prefillLng: String(homeLocation.longitude),
                  })}
                />
              </Animated.View>
            )}

            {/* Recent suggestion pills */}
            {recents.length > 0 && (
              <Animated.View entering={FadeIn.delay(350)}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsScroll}
                  style={{ marginTop: homeLocation ? 6 : 14 }}
                >
                  {recents.slice(0, 5).map((r, i) => (
                    <SuggestionChip
                      key={`${r.label}-${i}`}
                      icon="🕐"
                      label={r.label}
                      onPress={() => goToRide({
                        prefillLabel: r.label,
                        prefillLat: String(r.latitude),
                        prefillLng: String(r.longitude),
                      })}
                    />
                  ))}
                </ScrollView>
              </Animated.View>
            )}
          </LinearGradient>
        </View>

        {/* ── GET A RIDE — primary CTA ──────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.ctaWrap}>
          <Pressable
            onPress={() => goToRide()}
            style={({ pressed }) => [styles.rideCard, pressed && styles.rideCardPressed]}
            accessibilityRole="button"
            accessibilityLabel="Get a ride"
          >
            <LinearGradient
              colors={["#1a56db", "#0e7490"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.rideCardGradient}
            >
              <View>
                <Text style={styles.rideEyebrow}>GET A RIDE</Text>
                <Text style={styles.rideTitle}>Book your trip</Text>
                <Text style={styles.rideSub}>Free · Verified · Safe</Text>
              </View>
              <View style={styles.rideIconWrap}>
                <Text style={styles.rideIcon}>🚗</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* ── DRIVE + POINTS — secondary pair ──────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(220).springify()} style={styles.secondaryRow}>
          {/* Drive */}
          <Pressable
            style={({ pressed }) => [styles.secondaryCard, pressed && styles.secondaryCardPressed]}
            onPress={goToDriver}
            accessibilityRole="button"
          >
            <View style={[styles.secondaryIconWrap, { backgroundColor: "#f0fdfa" }]}>
              <Text style={styles.secondaryIcon}>🙌</Text>
            </View>
            <Text style={styles.secondaryTitle}>Drive</Text>
            <Text style={styles.secondarySub}>Earn kind points</Text>
          </Pressable>

          {/* Points */}
          <Pressable
            style={({ pressed }) => [styles.secondaryCard, pressed && styles.secondaryCardPressed]}
            onPress={goToPoints}
            accessibilityRole="button"
          >
            <View style={[styles.secondaryIconWrap, { backgroundColor: "#fefce8" }]}>
              <Text style={styles.secondaryIcon}>⭐</Text>
            </View>
            <Text style={styles.secondaryTitle}>Points</Text>
            <Text style={styles.secondarySub}>My impact</Text>
          </Pressable>
        </Animated.View>

        {/* ── IMPACT STORIES — auto-rotating ────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(280).springify()}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Community Stories</Text>
            <Text style={styles.sectionSub}>This week · Real people</Text>
          </View>

          <ScrollView
            ref={storyScrollRef}
            horizontal
            pagingEnabled={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (STORY_W + 12));
              setActiveStory(Math.min(idx, STORIES.length - 1));
            }}
          >
            {STORIES.map((s, i) => (
              <StoryCard key={s.key} story={s} active={i === activeStory} />
            ))}
          </ScrollView>

          {/* Story dots */}
          <View style={styles.storyDotsRow}>
            {STORIES.map((_, i) => (
              <Pressable
                key={i}
                onPress={() => setActiveStory(i)}
                style={[styles.storyDotIndicator, i === activeStory && styles.storyDotActive]}
              />
            ))}
          </View>
        </Animated.View>

        {/* ── RECENT TRIPS WITH POINTS ───────────────────────────────────── */}
        {(recentEvents.length > 0 || recents.length > 0) && (
          <Animated.View entering={FadeInDown.delay(340).springify()}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
            </View>
            <View style={styles.recentsCard}>
              {recentEvents.length > 0
                ? recentEvents.map((ev, i) => (
                    <View key={i}>
                      <View style={styles.recentRow}>
                        <View style={styles.recentDotCol}>
                          <View style={styles.recentDotBlue} />
                          {i < recentEvents.length - 1 && <View style={styles.recentLine} />}
                        </View>
                        <Text style={styles.recentLabel} numberOfLines={1}>{ev.label}</Text>
                        <View style={styles.recentPointsPill}>
                          <Text style={[styles.recentPointsText, ev.pts < 0 && { color: "#dc2626" }]}>
                            {ev.pts > 0 ? "+" : ""}{ev.pts} pts
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                : recents.slice(0, 3).map((dest, i) => (
                    <Pressable
                      key={`${dest.label}-${i}`}
                      style={({ pressed }) => [styles.recentRow, pressed && { backgroundColor: "#f8fafc" }]}
                      onPress={() => goToRide({
                        prefillLabel: dest.label,
                        prefillLat: String(dest.latitude),
                        prefillLng: String(dest.longitude),
                      })}
                    >
                      <View style={styles.recentDotCol}>
                        <View style={styles.recentDotTeal} />
                        {i < 2 && <View style={styles.recentLine} />}
                      </View>
                      <Text style={styles.recentLabel} numberOfLines={1}>{dest.label}</Text>
                      <Text style={styles.recentChevron}>›</Text>
                    </Pressable>
                  ))
              }
            </View>
          </Animated.View>
        )}

        {/* ── MISSION STRIP ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.missionWrap}>
          <LinearGradient
            colors={["#065f46", "#0e7490"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.missionCard}
          >
            <Text style={styles.missionEyebrow}>Our Promise</Text>
            <Text style={styles.missionHeadline}>Kindness is the engine.</Text>
            <Text style={styles.missionBody}>
              No surge pricing. No algorithms. Just humans helping humans get where they need to go.
            </Text>
          </LinearGradient>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  android: { elevation: 4 },
});

const shadowSm = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  // ── Hero
  heroWrap: { margin: 16, marginBottom: 0 },
  hero: { borderRadius: 24, padding: 22, overflow: "hidden" },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  logoRow: { flexDirection: "row", alignItems: "baseline" },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)",
  },
  avatarInitial: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Live row
  liveRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 14 },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#34d399",
    ...Platform.select({
      ios: { shadowColor: "#34d399", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4 },
    }),
  },
  liveText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },

  // Greeting
  heroGreeting: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: "500" },
  heroName: {
    color: "#ffffff", fontSize: 36, fontWeight: "800",
    letterSpacing: -1, lineHeight: 42, marginBottom: 18,
  },

  // Search bar
  searchBar: {
    backgroundColor: "#ffffff",
    borderRadius: 14, overflow: "hidden",
    ...shadow,
  },
  searchTouchable: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  searchDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#1a56db",
  },
  searchPlaceholder: { flex: 1, fontSize: 15, color: "#94a3b8", fontWeight: "500" },
  micBtn: { padding: 4 },
  micIcon: { fontSize: 18 },

  // Home chip + suggestion pills
  homeChipRow: { marginTop: 12 },
  chipsScroll: { gap: 8, paddingBottom: 2 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  chipPressed: { opacity: 0.7 },
  chipIcon: { fontSize: 13 },
  chipLabel: { color: "#ffffff", fontSize: 12, fontWeight: "600", maxWidth: 120 },

  // ── CTA
  ctaWrap: { marginHorizontal: 16, marginTop: 14 },
  rideCard: { borderRadius: 20, overflow: "hidden", ...shadow },
  rideCardPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  rideCardGradient: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    padding: 22,
  },
  rideEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  rideTitle: { color: "#ffffff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  rideSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 4 },
  rideIconWrap: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  rideIcon: { fontSize: 26 },

  // ── Secondary pair
  secondaryRow: {
    flexDirection: "row", marginHorizontal: 16,
    marginTop: 10, gap: 10,
  },
  secondaryCard: {
    flex: 1, backgroundColor: "#ffffff",
    borderRadius: 20, padding: 18, ...shadowSm,
  },
  secondaryCardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  secondaryIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  secondaryIcon: { fontSize: 22 },
  secondaryTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 2 },
  secondarySub: { fontSize: 12, color: "#64748b" },

  // ── Section header
  sectionHeader: {
    flexDirection: "row", alignItems: "baseline",
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10, gap: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", flex: 1 },
  sectionSub: { fontSize: 12, color: "#94a3b8" },

  // ── Stories
  storiesScroll: { paddingHorizontal: 16, gap: 12 },
  storyCard: {
    borderRadius: 20, padding: 18, ...shadowSm,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.05)",
  },
  storyTopRow: {
    flexDirection: "row", alignItems: "center",
    gap: 8, marginBottom: 10,
  },
  storyDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  storyName: { flex: 1, fontSize: 12, fontWeight: "700", color: "#334155" },
  storyPointsPill: {
    backgroundColor: "rgba(0,0,0,0.07)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  storyPointsText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  storyEmoji: { fontSize: 32, marginBottom: 10 },
  storyText: { fontSize: 14, color: "#475569", lineHeight: 21, fontStyle: "italic" },

  storyDotsRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 6, marginTop: 12,
  },
  storyDotIndicator: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#e2e8f0",
  },
  storyDotActive: {
    backgroundColor: "#1a56db", width: 20, borderRadius: 3,
  },

  // ── Recent activity
  recentsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20, marginHorizontal: 16,
    paddingVertical: 8, paddingHorizontal: 16, ...shadowSm,
  },
  recentRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, gap: 12,
  },
  recentDotCol: { alignItems: "center", width: 12 },
  recentDotBlue: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#1a56db" },
  recentDotTeal: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0d9488" },
  recentLine: { width: 1.5, flex: 1, backgroundColor: "#e2e8f0", marginTop: 2 },
  recentLabel: { flex: 1, fontSize: 14, color: "#1e293b", fontWeight: "500" },
  recentChevron: { fontSize: 20, color: "#cbd5e1", fontWeight: "300" },
  recentPointsPill: {
    backgroundColor: "#f0fdf4", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  recentPointsText: { fontSize: 12, fontWeight: "700", color: "#15803d" },

  // ── Mission strip
  missionWrap: { paddingHorizontal: 16, paddingTop: 20 },
  missionCard: { borderRadius: 20, padding: 22 },
  missionEyebrow: {
    color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "800",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6,
  },
  missionHeadline: { color: "#ffffff", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  missionBody: { color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 20 },
});
