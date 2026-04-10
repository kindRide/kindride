import { Link, useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth";

export default function ReferralScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  if (!user) {
    // In a real app, you might want a sign-in prompt. For now, we redirect.
    if (router.canGoBack()) router.back();
    else router.replace("/sign-in");
    return null;
  }

  // Mock referral code generation. In production, this would come from the user's profile.
  const referralCode = (user.email?.split("@")[0] ?? "KIND")
    .slice(0, 6)
    .toUpperCase();

  const shareMessage = t("referralShareMessage", { referralCode });

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: shareMessage,
        title: t("referralShareTitle"),
      });
    } catch (error: any) {
      Alert.alert(error.message);
    }
  };

  const handleCopy = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await Share.share({
        message: t("referralCodeShareMessage", { referralCode }),
        title: t("referralCodeShareTitle"),
      });
    } catch {
      Alert.alert(t("referralCodeLabel"), referralCode);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 56 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Reanimated.View entering={FadeInDown.delay(0).springify()} style={styles.logoRow}>
            <Text style={styles.logoKind}>Kind</Text>
            <Text style={styles.logoRide}>Ride</Text>
          </Reanimated.View>
          <Reanimated.View entering={FadeInDown.delay(60).springify()} style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>🎁  {t("referralBadge")}</Text>
          </Reanimated.View>
          <Reanimated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={styles.heroHeadline}>{t("referralHeadline")}</Text>
            <Text style={styles.heroSub}>
              {t("referralSubPrefix")} <Text style={{ fontWeight: "800", color: "#5eead4" }}>{t("referralBonusPoints")}</Text>.
            </Text>
          </Reanimated.View>
        </LinearGradient>

        {/* Code Card */}
        <Reanimated.View entering={FadeInDown.delay(120).springify()} style={styles.cardWrap}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t("referralCodeLabel")}</Text>
            <Pressable onPress={handleCopy}>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{referralCode}</Text>
                <Text style={styles.copyIcon}>📋</Text>
              </View>
            </Pressable>
            <Text style={styles.cardHint}>{t("referralCodeHint")}</Text>
          </View>
        </Reanimated.View>

        {/* Share Button */}
        <Reanimated.View entering={FadeInDown.delay(160).springify()} style={styles.ctaWrap}>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [styles.shareBtn, pressed && styles.shareBtnPressed]}
          >
            <LinearGradient
              colors={["#0d9488", "#0369a1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shareBtnGradient}
            >
              <Text style={styles.shareBtnText}>{t("shareInviteLink")}</Text>
            </LinearGradient>
          </Pressable>
        </Reanimated.View>

        {/* How it works */}
        <Reanimated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.sectionTitle}>{t("howItWorks")}</Text>
          <View style={styles.stepsCard}>
            <View style={styles.stepRow}>
              <Text style={styles.stepNumber}>1.</Text>
              <Text style={styles.stepText}>{t("referralStep1")}</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepNumber}>2.</Text>
              <Text style={styles.stepText}>{t("referralStep2")}</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepNumber}>3.</Text>
              <Text style={styles.stepText}>{t("referralStep3")}</Text>
            </View>
          </View>
        </Reanimated.View>

        <Link href="/(tabs)/settings" style={styles.backLinkWrap}>
          <Text style={styles.backLinkText}>← {t("backToSettings")}</Text>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  hero: { paddingTop: 20, paddingBottom: 28, paddingHorizontal: 22 },
  logoRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 16 },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14,
  },
  heroBadgeText: { color: "#99f6e4", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  heroHeadline: {
    color: "#ffffff", fontSize: 26, fontWeight: "800",
    lineHeight: 32, letterSpacing: -0.3, marginBottom: 8,
  },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 14, lineHeight: 21 },
  cardWrap: { padding: 16, marginTop: -10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12,
    elevation: 5,
  },
  cardLabel: {
    fontSize: 12, fontWeight: "700", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12,
  },
  codeBox: {
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
    letterSpacing: 2,
  },
  copyIcon: { fontSize: 18 },
  cardHint: { fontSize: 13, color: "#64748b", marginTop: 14 },
  ctaWrap: { paddingHorizontal: 16, marginTop: 0 },
  shareBtn: { borderRadius: 16, overflow: "hidden" },
  shareBtnPressed: { opacity: 0.9 },
  shareBtnGradient: { padding: 18, alignItems: "center" },
  shareBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sectionTitle: {
    fontSize: 17, fontWeight: "700", color: "#0f172a",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  stepsCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    marginHorizontal: 16,
    padding: 20,
    gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
    elevation: 3,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNumber: { fontSize: 15, fontWeight: "800", color: "#0d9488", width: 20 },
  stepText: { flex: 1, fontSize: 14, color: "#334155", lineHeight: 21 },
  backLinkWrap: { alignSelf: "center", paddingVertical: 32 },
  backLinkText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
});
