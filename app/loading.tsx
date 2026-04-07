import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

// ─── Animated heart-in-pin icon ──────────────────────────────────────────────
function KindRideIcon({ scaleAnim }: { scaleAnim: Animated.Value }) {
  return (
    <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
      {/* Outer pin ring */}
      <View style={styles.pinRing} />
      {/* Inner glow */}
      <View style={styles.pinInner}>
        <Text style={styles.heartEmoji}>🤍</Text>
      </View>
    </Animated.View>
  );
}

// ─── Animated dot ─────────────────────────────────────────────────────────────
function LoadingDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        Animated.delay(600 - delay),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[
      styles.dot,
      { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }
    ]} />
  );
}

// ─── Main loading screen ──────────────────────────────────────────────────────
export default function LoadingScreen() {
  const router = useRouter();
  const { loading } = useAuth();

  // Animations
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(32)).current;
  const scaleAnim   = useRef(new Animated.Value(0.6)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance sequence
    Animated.sequence([
      // 1. Icon pops in
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      // 2. Wordmark slides up
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(taglineAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    if (loading) return;
    // Fade out then navigate
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      router.replace("/(tabs)");
    });
  }, [loading, router]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Radial ambient glow */}
      <View style={styles.glow} />

      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.centerWrap, { opacity: fadeAnim }]}>

          {/* Icon */}
          <KindRideIcon scaleAnim={scaleAnim} />

          {/* Wordmark */}
          <Animated.View style={[
            styles.wordmarkRow,
            { transform: [{ translateY: slideAnim }], opacity: taglineAnim }
          ]}>
            <Text style={styles.wordKind}>Kind</Text>
            <Text style={styles.wordRide}>Ride</Text>
          </Animated.View>

          {/* Tagline */}
          <Animated.Text style={[styles.tagline, { opacity: taglineAnim }]}>
            Free rides. Real impact. Every time.
          </Animated.Text>

          {/* Loading dots */}
          <View style={styles.dotsRow}>
            <LoadingDot delay={0} />
            <LoadingDot delay={150} />
            <LoadingDot delay={300} />
          </View>

        </Animated.View>

        {/* Bottom badge */}
        <Animated.View style={[styles.bottomBadge, { opacity: taglineAnim }]}>
          <Text style={styles.bottomBadgeText}>🌱  Humanitarian · Community · Care</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0c1f3f" },

  glow: {
    position: "absolute",
    width: 320, height: 320,
    borderRadius: 160,
    backgroundColor: "#0d9488",
    opacity: 0.12,
    top: "30%", alignSelf: "center",
    // soft blur via scale
    transform: [{ scaleX: 1.6 }],
  },

  safe: { flex: 1, alignItems: "center", justifyContent: "center" },

  centerWrap: { alignItems: "center" },

  // Icon
  iconWrap: {
    width: 100, height: 100,
    alignItems: "center", justifyContent: "center",
    marginBottom: 28,
  },
  pinRing: {
    position: "absolute",
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2,
    borderColor: "rgba(94,234,212,0.35)",
    backgroundColor: "rgba(13,148,136,0.18)",
  },
  pinInner: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#0d9488", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  heartEmoji: { fontSize: 34 },

  // Wordmark
  wordmarkRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 10 },
  wordKind: {
    fontSize: 44, fontWeight: "800", color: "#ffffff", letterSpacing: -1.5,
    ...Platform.select({
      ios: { shadowColor: "#fff", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 10 },
    }),
  },
  wordRide: { fontSize: 44, fontWeight: "300", color: "#5eead4", letterSpacing: -1 },

  tagline: {
    fontSize: 14, color: "rgba(255,255,255,0.55)",
    fontWeight: "500", letterSpacing: 0.2,
    marginBottom: 40,
  },

  // Dots
  dotsRow: { flexDirection: "row", gap: 8 },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: "#5eead4",
  },

  // Bottom
  bottomBadge: {
    position: "absolute", bottom: 40, alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  bottomBadgeText: {
    color: "rgba(255,255,255,0.45)", fontSize: 11,
    fontWeight: "600", letterSpacing: 1.5,
  },
});
