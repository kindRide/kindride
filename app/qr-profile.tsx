import { useRouter } from "expo-router";
import { Share, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import Reanimated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth";

export default function QRProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useTranslation();

  const userId = session?.user?.id ?? "guest";
  const email = session?.user?.email ?? "";
  const initial = email ? email.charAt(0).toUpperCase() : "K";

  // Deep-link URL that opens the user's profile when scanned
  const profileUrl = `kindride://profile/${userId}`;

  const handleShare = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: t("qrProfileShareMessage", { profileUrl }),
      title: t("qrProfileShareTitle"),
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Reanimated.View entering={FadeInDown.delay(60).springify()} style={styles.heroText}>
          <Text style={styles.heroEyebrow}>{t("myKindrideProfile")}</Text>
          <View style={styles.avatarRow}>
            <LinearGradient colors={["#0d9488", "#2563eb"]} style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </LinearGradient>
            <View>
              <Text style={styles.heroName}>{email || t("kindrideMember")}</Text>
              <Text style={styles.heroSub}>{t("scanToConnect")}</Text>
            </View>
          </View>
        </Reanimated.View>
      </LinearGradient>

      <Reanimated.View entering={FadeIn.delay(200).springify()} style={styles.qrCard}>
        <Text style={styles.qrHint}>{t("scanAnyCameraProfile")}</Text>
        <View style={styles.qrWrap}>
          <QRCode
            value={profileUrl}
            size={200}
            color="#0c1f3f"
            backgroundColor="#ffffff"
            logoSize={36}
          />
        </View>
        <Text style={styles.qrUrl} numberOfLines={1}>{profileUrl}</Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInUp.delay(300).springify()} style={styles.actions}>
        <Pressable style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>{t("shareMyProfile")}</Text>
        </Pressable>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t("back")}</Text>
        </Pressable>
      </Reanimated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  hero: { paddingTop: 32, paddingBottom: 28, paddingHorizontal: 24 },
  heroEyebrow: { color: "#5eead4", fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 16 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  heroText: {},
  heroName: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  heroSub: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 },
  qrCard: {
    margin: 20, padding: 24,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    alignItems: "center",
    gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  qrHint: { fontSize: 13, color: "#64748b", textAlign: "center" },
  qrWrap: { padding: 16, backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  qrUrl: { fontSize: 11, color: "#94a3b8", textAlign: "center", maxWidth: 260 },
  actions: { paddingHorizontal: 20, gap: 12 },
  shareBtn: { backgroundColor: "#2563eb", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  shareBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  backBtn: { paddingVertical: 12, alignItems: "center" },
  backBtnText: { color: "#64748b", fontSize: 14, fontWeight: "600" },
});
