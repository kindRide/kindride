import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Reanimated, {
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export const DRIVER_ONBOARDING_KEY = "kindride_driver_onboarding_done_v1";

const { width: SCREEN_W } = Dimensions.get("window");

type Slide = {
  id: string;
  icon: string;
  gradientColors: [string, string];
  titleKey: string;
  bodyKey: string;
  bullets: string[];
};

const SLIDES: Slide[] = [
  {
    id: "welcome",
    icon: "🌱",
    gradientColors: ["#0c1f3f", "#0a5c54"],
    titleKey: "onbWelcomeTitle",
    bodyKey: "onbWelcomeBody",
    bullets: [],
  },
  {
    id: "howrides",
    icon: "🚗",
    gradientColors: ["#1e3a5f", "#0d6b5e"],
    titleKey: "onbHowRidesTitle",
    bodyKey: "onbHowRidesBody",
    bullets: ["onbHowRidesBullet1", "onbHowRidesBullet2", "onbHowRidesBullet3", "onbHowRidesBullet4"],
  },
  {
    id: "points",
    icon: "⭐",
    gradientColors: ["#1e1b4b", "#4c1d95"],
    titleKey: "onbPointsTitle",
    bodyKey: "onbPointsBody",
    bullets: ["onbPointsBullet1", "onbPointsBullet2", "onbPointsBullet3"],
  },
  {
    id: "tips",
    icon: "💚",
    gradientColors: ["#064e3b", "#065f46"],
    titleKey: "onbTipsTitle",
    bodyKey: "onbTipsBody",
    bullets: ["onbTipsBullet1", "onbTipsBullet2", "onbTipsBullet3"],
  },
  {
    id: "safety",
    icon: "🛡️",
    gradientColors: ["#1e3a5f", "#1e1b4b"],
    titleKey: "onbSafetyTitle",
    bodyKey: "onbSafetyBody",
    bullets: ["onbSafetyBullet1", "onbSafetyBullet2", "onbSafetyBullet3"],
  },
];

export default function DriverOnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const goTo = (index: number) => {
    flatRef.current?.scrollToIndex({ index, animated: true });
    setActiveIndex(index);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      goTo(activeIndex + 1);
    } else {
      void finish();
    }
  };

  const finish = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(DRIVER_ONBOARDING_KEY, "1");
    router.replace("/(tabs)/driver");
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* Slide pager */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        renderItem={({ item: slide }) => (
          <SlideView slide={slide} t={t} />
        )}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setActiveIndex(idx);
        }}
      />

      {/* Bottom controls */}
      <Reanimated.View entering={FadeInUp.delay(300).springify()} style={styles.controls}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)}>
              <View style={[styles.dot, i === activeIndex && styles.dotActive]} />
            </Pressable>
          ))}
        </View>

        {/* Primary CTA */}
        <Pressable style={styles.nextBtn} onPress={handleNext}>
          <LinearGradient
            colors={isLast ? ["#0d9488", "#0f766e"] : ["#2563eb", "#1d4ed8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextBtnGradient}
          >
            <Text style={styles.nextBtnText}>
              {isLast ? t("onbStartDriving", "Start driving  →") : t("onbNext", "Next  →")}
            </Text>
          </LinearGradient>
        </Pressable>

        {/* Skip — hidden on last slide */}
        {!isLast && (
          <Pressable style={styles.skipBtn} onPress={() => void finish()}>
            <Text style={styles.skipText}>{t("onbSkip", "Skip walkthrough")}</Text>
          </Pressable>
        )}
      </Reanimated.View>
    </SafeAreaView>
  );
}

function SlideView({ slide, t }: { slide: Slide; t: (k: string, fb?: string) => string }) {
  return (
    <View style={{ width: SCREEN_W }}>
      <LinearGradient
        colors={slide.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Reanimated.View entering={FadeInDown.delay(80).springify()} style={styles.iconWrap}>
          <Text style={styles.slideIcon}>{slide.icon}</Text>
        </Reanimated.View>
        <Reanimated.View entering={FadeInDown.delay(160).springify()}>
          <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
          <Text style={styles.slideBody}>{t(slide.bodyKey)}</Text>
        </Reanimated.View>
      </LinearGradient>

      {slide.bullets.length > 0 && (
        <Reanimated.View entering={FadeInUp.delay(200).springify()} style={styles.bulletCard}>
          {slide.bullets.map((bk, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{t(bk)}</Text>
            </View>
          ))}
        </Reanimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  hero: {
    paddingTop: 48,
    paddingBottom: 40,
    paddingHorizontal: 28,
    minHeight: 320,
    justifyContent: "flex-end",
  },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 24,
  },
  slideIcon: { fontSize: 38 },
  slideTitle: {
    color: "#ffffff", fontSize: 28, fontWeight: "800",
    lineHeight: 34, marginBottom: 10,
  },
  slideBody: {
    color: "rgba(255,255,255,0.78)", fontSize: 15,
    lineHeight: 23,
  },
  bulletCard: {
    margin: 20,
    padding: 20,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1, borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  bulletDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#0d9488", marginTop: 6, flexShrink: 0,
  },
  bulletText: { fontSize: 15, color: "#1f2a44", lineHeight: 22, flex: 1, fontWeight: "500" },
  controls: {
    paddingHorizontal: 24, paddingBottom: 12, gap: 8,
    backgroundColor: "#f8fafc",
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 8 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#cbd5e1",
  },
  dotActive: {
    width: 24, backgroundColor: "#0d9488",
  },
  nextBtn: { borderRadius: 14, overflow: "hidden" },
  nextBtnGradient: { paddingVertical: 16, alignItems: "center" },
  nextBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  skipBtn: { paddingVertical: 10, alignItems: "center" },
  skipText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
});
