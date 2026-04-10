import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

// Mock weekly city leaderboard — first name only for privacy
const LEADERBOARD_ENTRIES = [
  { rank: 1,  name: "Adaeze",   pts: 1840, badge: "🏆", streak: 14 },
  { rank: 2,  name: "Tunde",    pts: 1620, badge: "🥈", streak: 9  },
  { rank: 3,  name: "Fatima",   pts: 1505, badge: "🥉", streak: 12 },
  { rank: 4,  name: "Chidi",    pts: 1290, badge: "🛡️", streak: 7  },
  { rank: 5,  name: "Amara",    pts: 1140, badge: "⭐", streak: 5  },
  { rank: 6,  name: "Emeka",    pts:  980, badge: "⭐", streak: 8  },
  { rank: 7,  name: "Blessing", pts:  870, badge: "⭐", streak: 3  },
  { rank: 8,  name: "Kemi",     pts:  750, badge: "⭐", streak: 6  },
  { rank: 9,  name: "Seun",     pts:  620, badge: "⭐", streak: 2  },
  { rank: 10, name: "Ifeanyi",  pts:  540, badge: "⭐", streak: 4  },
];

const MEDAL_COLORS: Record<number, string> = { 1: "#f59e0b", 2: "#94a3b8", 3: "#d97706" };

export default function LeaderboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const top3 = LEADERBOARD_ENTRIES.slice(0, 3);
  const rest = LEADERBOARD_ENTRIES.slice(3);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <LinearGradient
          colors={["#1e1b4b", "#2e1065", "#0c1f3f"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Reanimated.View entering={FadeInDown.delay(0).springify()}>
            <Text style={styles.heroEyebrow}>📊 {t("weeklyCityLeaderboard")}</Text>
            <Text style={styles.heroTitle}>{t("topKindDrivers")}</Text>
            <Text style={styles.heroSub}>{t("leaderboardPrivacySub")}</Text>
          </Reanimated.View>

          {/* Top 3 podium */}
          <Reanimated.View entering={FadeInDown.delay(100).springify()} style={styles.podium}>
            {/* 2nd place — left */}
            <View style={[styles.podiumSlot, { marginTop: 30 }]}>
              <Text style={styles.podiumBadge}>{top3[1].badge}</Text>
              <View style={[styles.podiumAvatar, { borderColor: "#94a3b8" }]}>
                <Text style={styles.podiumInitial}>{top3[1].name.charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName}>{top3[1].name}</Text>
              <Text style={styles.podiumPts}>{top3[1].pts.toLocaleString()} pts</Text>
            </View>
            {/* 1st place — center */}
            <View style={styles.podiumSlot}>
              <Text style={[styles.podiumBadge, { fontSize: 28 }]}>{top3[0].badge}</Text>
              <View style={[styles.podiumAvatar, styles.podiumAvatarLarge, { borderColor: "#f59e0b" }]}>
                <Text style={[styles.podiumInitial, { fontSize: 26 }]}>{top3[0].name.charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName}>{top3[0].name}</Text>
              <Text style={[styles.podiumPts, { color: "#f59e0b" }]}>{t("numberPoints", { count: top3[0].pts.toLocaleString() })}</Text>
              <View style={styles.crownBadge}><Text style={styles.crownText}>{t("rankOneThisWeek")}</Text></View>
            </View>
            {/* 3rd place — right */}
            <View style={[styles.podiumSlot, { marginTop: 48 }]}>
              <Text style={styles.podiumBadge}>{top3[2].badge}</Text>
              <View style={[styles.podiumAvatar, { borderColor: "#d97706" }]}>
                <Text style={styles.podiumInitial}>{top3[2].name.charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName}>{top3[2].name}</Text>
              <Text style={styles.podiumPts}>{t("numberPoints", { count: top3[2].pts.toLocaleString() })}</Text>
            </View>
          </Reanimated.View>
        </LinearGradient>

        {/* Ranks 4–10 */}
        <Reanimated.View entering={FadeInUp.delay(200).springify()} style={styles.listCard}>
          {rest.map((entry, i) => (
            <View key={entry.rank}>
              <View style={styles.listRow}>
                <Text style={styles.listRank}>#{entry.rank}</Text>
                <View style={[styles.listAvatar, { backgroundColor: MEDAL_COLORS[entry.rank] ?? "#e2e8f0" }]}>
                  <Text style={styles.listInitial}>{entry.name.charAt(0)}</Text>
                </View>
                <Text style={styles.listName}>{entry.name}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.listStreak}>🔥 {entry.streak}d</Text>
                <Text style={styles.listPts}>{t("numberPoints", { count: entry.pts.toLocaleString() })}</Text>
              </View>
              {i < rest.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Reanimated.View>

        {/* CTA */}
        <Reanimated.View entering={FadeInUp.delay(280).springify()} style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>{t("wantToClimbTheRanks")}</Text>
          <Text style={styles.ctaBody}>{t("leaderboardCtaBody")}</Text>
          <Pressable style={styles.ctaBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.ctaBtnText}>{t("giveRideNow")}</Text>
          </Pressable>
        </Reanimated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  hero: { paddingTop: 24, paddingBottom: 32, paddingHorizontal: 20 },
  heroEyebrow: { color: "#a5b4fc", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
  heroTitle: { color: "#ffffff", fontSize: 28, fontWeight: "800" },
  heroSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4, marginBottom: 24 },
  podium: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 16 },
  podiumSlot: { alignItems: "center", gap: 6, minWidth: 90 },
  podiumBadge: { fontSize: 22 },
  podiumAvatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
  },
  podiumAvatarLarge: { width: 76, height: 76, borderRadius: 38 },
  podiumInitial: { fontSize: 22, fontWeight: "800", color: "#ffffff" },
  podiumName: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  podiumPts: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  crownBadge: {
    backgroundColor: "rgba(245,158,11,0.2)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#f59e0b",
  },
  crownText: { color: "#f59e0b", fontSize: 10, fontWeight: "800" },
  listCard: {
    margin: 16, backgroundColor: "#ffffff", borderRadius: 16,
    borderWidth: 1, borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    overflow: "hidden",
  },
  listRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  listRank: { fontSize: 13, fontWeight: "700", color: "#94a3b8", width: 28 },
  listAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  listInitial: { fontSize: 15, fontWeight: "800", color: "#ffffff" },
  listName: { fontSize: 15, fontWeight: "700", color: "#1f2a44" },
  listStreak: { fontSize: 12, color: "#f59e0b", fontWeight: "600", marginRight: 8 },
  listPts: { fontSize: 13, fontWeight: "800", color: "#0d9488" },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginHorizontal: 16 },
  ctaCard: {
    margin: 16, padding: 20, backgroundColor: "#eff6ff",
    borderRadius: 16, borderWidth: 1, borderColor: "#bfdbfe", gap: 10,
  },
  ctaTitle: { fontSize: 16, fontWeight: "800", color: "#1e40af" },
  ctaBody: { fontSize: 13, color: "#3b82f6", lineHeight: 19 },
  ctaBtn: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  ctaBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
});
