import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

type PublicProfile = {
  displayName: string;
  tier: string;
  totalPoints: number;
  isVerified: boolean;
};

const TIER_COLORS: Record<string, string> = {
  Bronze: "#d97706",
  Silver: "#94a3b8",
  Gold: "#f59e0b",
  Platinum: "#6366f1",
  Diamond: "#0d9488",
};

export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!userId || !supabase) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    async function loadPublicProfile() {
      try {
        const { data: presence } = await supabase!
          .from("driver_presence")
          .select("display_name")
          .eq("driver_id", userId)
          .single();

        const { data: pts } = await supabase!
          .from("points")
          .select("total_points, tier")
          .eq("driver_id", userId)
          .single();

        if (!presence && !pts) {
          setNotFound(true);
          return;
        }

        setProfile({
          displayName: presence?.display_name ?? t("kindrideMember"),
          tier: pts?.tier ?? "Bronze",
          totalPoints: pts?.total_points ?? 0,
          isVerified: true,
        });
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    void loadPublicProfile();
  }, [userId, t]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#0d9488" />
      </SafeAreaView>
    );
  }

  if (notFound || !profile) {
    return (
      <SafeAreaView style={styles.centered}>
        <Reanimated.View entering={FadeIn.springify()} style={styles.notFoundCard}>
          <Text style={styles.notFoundEmoji}>🔍</Text>
          <Text style={styles.notFoundTitle}>{t("profileNotFound")}</Text>
          <Text style={styles.notFoundSub}>{t("profileNotFoundSub")}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}>
            <Text style={styles.backBtnText}>{t("backToApp")}</Text>
          </Pressable>
        </Reanimated.View>
      </SafeAreaView>
    );
  }

  const initial = profile.displayName.charAt(0).toUpperCase() || "K";
  const tierColor = TIER_COLORS[profile.tier] ?? "#0d9488";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* Hero */}
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Reanimated.View entering={FadeInDown.delay(0).springify()} style={styles.heroInner}>
          <Text style={styles.eyebrow}>{t("publicDriverProfile")}</Text>

          {/* Avatar */}
          <LinearGradient colors={["#0d9488", "#2563eb"]} style={styles.avatar}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </LinearGradient>

          <Text style={styles.name}>{profile.displayName}</Text>

          {profile.isVerified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓ {t("verified")}</Text>
            </View>
          )}
        </Reanimated.View>
      </LinearGradient>

      {/* Stats */}
      <Reanimated.View entering={FadeInDown.delay(100).springify()} style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.totalPoints.toLocaleString()}</Text>
          <Text style={styles.statLabel}>{t("impactScore")}</Text>
        </View>
        <View style={[styles.statCard, styles.statCardMiddle]}>
          <Text style={[styles.statValue, { color: tierColor }]}>{profile.tier}</Text>
          <Text style={styles.statLabel}>{t("driverTier")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>🌱</Text>
          <Text style={styles.statLabel}>{t("kindDriver")}</Text>
        </View>
      </Reanimated.View>

      {/* CTA */}
      <Reanimated.View entering={FadeInUp.delay(180).springify()} style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>{t("joinToConnect")}</Text>
        <Text style={styles.ctaBody}>{t("joinToConnectBody")}</Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace("/sign-in")}
        >
          <LinearGradient
            colors={["#0d9488", "#0369a1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtnGradient}
          >
            <Text style={styles.primaryBtnText}>{t("joinKindRide")}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
        >
          <Text style={styles.secondaryBtnText}>{t("backToApp")}</Text>
        </Pressable>
      </Reanimated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  centered: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center" },

  hero: { paddingTop: 36, paddingBottom: 32, paddingHorizontal: 24, alignItems: "center" },
  heroInner: { alignItems: "center", gap: 12 },
  eyebrow: { color: "#5eead4", fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
  avatarInitial: { fontSize: 36, fontWeight: "800", color: "#ffffff" },
  name: { color: "#ffffff", fontSize: 22, fontWeight: "800", marginTop: 4 },
  verifiedBadge: {
    backgroundColor: "rgba(13,148,136,0.25)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: "#0d9488",
  },
  verifiedText: { color: "#5eead4", fontSize: 12, fontWeight: "700" },

  statsRow: {
    flexDirection: "row", margin: 16, gap: 12,
  },
  statCard: {
    flex: 1, backgroundColor: "#ffffff", borderRadius: 16, padding: 16,
    alignItems: "center", gap: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  statCardMiddle: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  statLabel: { fontSize: 11, color: "#64748b", fontWeight: "600", textAlign: "center" },

  ctaSection: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  ctaTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a", textAlign: "center" },
  ctaBody: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 20 },
  primaryBtn: { borderRadius: 16, overflow: "hidden" },
  primaryBtnGradient: { paddingVertical: 16, alignItems: "center" },
  primaryBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  secondaryBtn: { paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },

  notFoundCard: {
    alignItems: "center", padding: 32, gap: 12,
    backgroundColor: "#ffffff", borderRadius: 20,
    margin: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  notFoundEmoji: { fontSize: 48 },
  notFoundTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  notFoundSub: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 20 },
  backBtn: { marginTop: 8, backgroundColor: "#f1f5f9", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backBtnText: { color: "#334155", fontSize: 14, fontWeight: "700" },
});
