import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

// Fun facts pool — randomised per match
const DRIVER_FUN_FACTS = [
  "driverFunFact1",
  "driverFunFact2",
  "driverFunFact3",
  "driverFunFact4",
  "driverFunFact5",
  "driverFunFact6",
  "driverFunFact7",
  "driverFunFact8",
  "driverFunFact9",
  "driverFunFact10",
];

export default function DriverIntroScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    driverName?: string;
    driverId?: string;
    rideId?: string;
    rating?: string;
    yearsActive?: string;
    nextPath?: string;
  }>();

  const driverName = params.driverName ?? t("yourDriver");
  const driverId = params.driverId ?? "";
  const rating = parseFloat(params.rating ?? "5.0");
  const yearsActive = parseInt(params.yearsActive ?? "2", 10);
  const nextPath = (params.nextPath as string) ?? "/(tabs)";

  // Stable fun fact per driver (deterministic by driverId chars)
  const funFactKey = useMemo(() => {
    const seed = driverId
      ? driverId.charCodeAt(0) + driverId.charCodeAt(driverId.length - 1)
      : Math.floor(Math.random() * DRIVER_FUN_FACTS.length);
    return DRIVER_FUN_FACTS[seed % DRIVER_FUN_FACTS.length];
  }, [driverId]);
  const funFact = t(funFactKey);

  const initial = driverName.charAt(0).toUpperCase();
  const stars = "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));

  const handleContinue = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace(nextPath as any);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Avatar */}
        <Reanimated.View entering={FadeIn.delay(100).springify()} style={styles.avatarWrap}>
          <LinearGradient
            colors={["#0d9488", "#2563eb"]}
            style={styles.avatar}
          >
            <Text style={styles.avatarInitial}>{initial}</Text>
          </LinearGradient>
          <View style={styles.onlineDot} />
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.delay(160).springify()} style={styles.heroText}>
          <Text style={styles.matchedLabel}>{t("driverOnTheWay")}</Text>
          <Text style={styles.driverName}>{driverName}</Text>
          <Text style={styles.starsRow}>{stars}</Text>
          <Text style={styles.ratingNum}>
            {t("driverYearsOnKindride", { rating: rating.toFixed(1), years: yearsActive })}
          </Text>
        </Reanimated.View>
      </LinearGradient>

      <Reanimated.View entering={FadeInUp.delay(260).springify()} style={styles.factCard}>
        <Text style={styles.factEyebrow}>{t("funFactAboutDriver", { name: driverName.split(" ")[0] })}</Text>
        <Text style={styles.factText}>💡 {funFact}</Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInUp.delay(340).springify()} style={styles.safetyRow}>
        {[
          { icon: "🛡️", label: t("verifiedId") },
          { icon: "📍", label: t("liveTracking") },
          { icon: "🚨", label: t("sosAvailable") },
        ].map((item) => (
          <View key={item.label} style={styles.safetyStat}>
            <Text style={styles.safetyIcon}>{item.icon}</Text>
            <Text style={styles.safetyLabel}>{item.label}</Text>
          </View>
        ))}
      </Reanimated.View>

      <Reanimated.View entering={FadeInUp.delay(400).springify()} style={styles.btnWrap}>
        <Pressable style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>{t("driverIntroReady")}</Text>
        </Pressable>
        <Text style={styles.waitHint}>{t("driverArriveShortlyTrackLive")}</Text>
      </Reanimated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  hero: { paddingTop: 40, paddingBottom: 36, paddingHorizontal: 24, alignItems: "center" },
  avatarWrap: { position: "relative", marginBottom: 20 },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.3)",
  },
  avatarInitial: { fontSize: 44, fontWeight: "800", color: "#ffffff" },
  onlineDot: {
    position: "absolute", bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#22c55e",
    borderWidth: 2, borderColor: "#0c1f3f",
  },
  heroText: { alignItems: "center", gap: 6 },
  matchedLabel: { color: "#5eead4", fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  driverName: { color: "#ffffff", fontSize: 28, fontWeight: "800", textAlign: "center" },
  starsRow: { color: "#f59e0b", fontSize: 20, letterSpacing: 2 },
  ratingNum: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "500" },
  factCard: {
    margin: 20, padding: 20,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1, borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8,
    elevation: 2,
  },
  factEyebrow: { fontSize: 11, fontWeight: "700", color: "#0d9488", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  factText: { fontSize: 16, color: "#1f2a44", fontWeight: "600", lineHeight: 24 },
  safetyRow: {
    flexDirection: "row", justifyContent: "space-around",
    marginHorizontal: 20, marginBottom: 24,
    padding: 16, backgroundColor: "#f0fdf4",
    borderRadius: 14, borderWidth: 1, borderColor: "#86efac",
  },
  safetyStat: { alignItems: "center", gap: 4 },
  safetyIcon: { fontSize: 22 },
  safetyLabel: { fontSize: 11, fontWeight: "700", color: "#166534" },
  btnWrap: { paddingHorizontal: 20, gap: 10 },
  continueBtn: {
    backgroundColor: "#2563eb", borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
  },
  continueBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  waitHint: { textAlign: "center", color: "#64748b", fontSize: 12, lineHeight: 18 },
});
