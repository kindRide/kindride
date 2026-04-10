import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    key: "slide1",
    emoji: "🤝",
    eyebrow: "Zero Cost",
    title: "Free rides,\nreal impact.",
    body: "KindRide connects passengers who need a lift with drivers already heading their way — no fares, no surge pricing, ever.",
    accent: "#0d9488",
  },
  {
    key: "slide2",
    emoji: "⭐",
    eyebrow: "Earn Points",
    title: "Kindness is\nyour currency.",
    body: "Drivers earn Humanitarian Points — non-transferable social capital that grows with every act of generosity.",
    accent: "#2563eb",
  },
  {
    key: "slide3",
    emoji: "🛡️",
    eyebrow: "Always Protected",
    title: "Safety built\ninto every ride.",
    body: "Identity checks, in-app session recording (auto-deleted in 72h), one-tap SOS, and live trip sharing — for you and your loved ones.",
    accent: "#0d9488",
  },
] as const;

export const ONBOARDING_SEEN_KEY = "kindride_onboarding_seen";

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    router.replace("/sign-in");
  };

  const next = () => {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      void finish();
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      {/* Full-screen gradient background that transitions with slides */}
      <LinearGradient
        colors={["#0c1f3f", "#0a5c54"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>

        {/* Logo row */}
        <View style={styles.logoRow}>
          <Text style={styles.logoKind}>Kind</Text>
          <Text style={styles.logoRide}>Ride</Text>
        </View>

        {/* Slides */}
        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(s) => s.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          style={{ flexGrow: 0 }}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              {/* Icon badge */}
              <View style={[styles.iconBadge, { borderColor: "rgba(255,255,255,0.2)" }]}>
                <Text style={styles.emoji}>{item.emoji}</Text>
              </View>

              {/* Eyebrow */}
              <View style={styles.eyebrowRow}>
                <View style={[styles.eyebrowDot, { backgroundColor: item.accent }]} />
                <Text style={styles.eyebrow}>{t(`onboarding.${item.key}.eyebrow`)}</Text>
              </View>

              {/* Headline */}
              <Text style={styles.title}>{t(`onboarding.${item.key}.title`)}</Text>

              {/* Body */}
              <Text style={styles.body}>{t(`onboarding.${item.key}.body`)}</Text>
            </View>
          )}
        />

        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
            onPress={next}
          >
            <Text style={styles.primaryBtnText}>
              {isLast ? `${t("onboardingGetStarted")}  →` : t("next")}
            </Text>
          </Pressable>

          {isLast ? (
            <Pressable style={styles.secondaryBtn} onPress={finish}>
              <Text style={styles.secondaryBtnText}>{t("onboardingAlreadyHaveAccount")}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.skipBtn} onPress={() => void finish()}>
              <Text style={styles.skipText}>{t("skip")}</Text>
            </Pressable>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0c1f3f",
  },
  safe: {
    flex: 1,
    alignItems: "center",
  },
  logoRow: {
    flexDirection: "row",
    marginTop: 20,
    marginBottom: 8,
    alignItems: "baseline",
  },
  logoKind: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  logoRide: {
    fontSize: 28,
    fontWeight: "300",
    color: "#5eead4",
    letterSpacing: -0.5,
  },
  slide: {
    width,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingTop: 24,
    paddingBottom: 24,
  },
  iconBadge: {
    width: 110,
    height: 110,
    borderRadius: 32,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: "#0d9488",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  emoji: {
    fontSize: 52,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    color: "rgba(255,255,255,0.70)",
    textAlign: "center",
    lineHeight: 25,
    maxWidth: 320,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: "#0d9488",
    width: 24,
    borderRadius: 4,
  },
  actions: {
    width: "100%",
    paddingHorizontal: 28,
    paddingBottom: 8,
    alignItems: "center",
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: "#0d9488",
    borderRadius: 16,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0d9488",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 14,
    fontWeight: "500",
  },
  skipBtn: {
    paddingVertical: 12,
  },
  skipText: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 14,
  },
});
