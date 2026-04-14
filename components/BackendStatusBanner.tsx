import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import type { BackendStatus } from "@/lib/use-backend-health";

type Props = {
  status: BackendStatus;
  onRetry: () => void;
};

/**
 * Renders a dismissable banner when the backend is waking (Render cold-start)
 * or offline. Hidden when status is "online" or "unknown".
 */
export default function BackendStatusBanner({ status, onRetry }: Props) {
  const { t } = useTranslation();

  if (status === "online" || status === "unknown") return null;

  const isWaking = status === "waking";

  return (
    <Reanimated.View
      entering={FadeInDown.springify()}
      exiting={FadeOutUp.springify()}
      style={[styles.banner, isWaking ? styles.bannerWaking : styles.bannerOffline]}
    >
      <View style={styles.row}>
        {isWaking ? (
          <ActivityIndicator size="small" color="#92400e" style={styles.spinner} />
        ) : (
          <Text style={styles.icon}>⚠️</Text>
        )}
        <View style={styles.textWrap}>
          <Text style={[styles.title, isWaking ? styles.titleWaking : styles.titleOffline]}>
            {isWaking
              ? t("backendWakingTitle", "Server is waking up…")
              : t("backendOfflineTitle", "Cannot reach server")}
          </Text>
          <Text style={[styles.body, isWaking ? styles.bodyWaking : styles.bodyOffline]}>
            {isWaking
              ? t("backendWakingBody", "KindRide's server is starting up. This takes ~15 seconds on the free tier. Hang tight.")
              : t("backendOfflineBody", "Check your connection. The server may be temporarily down.")}
          </Text>
        </View>
      </View>
      <Pressable style={[styles.retryBtn, isWaking ? styles.retryWaking : styles.retryOffline]} onPress={onRetry}>
        <Text style={[styles.retryText, isWaking ? styles.retryTextWaking : styles.retryTextOffline]}>
          {t("retryNow", "Retry")}
        </Text>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
  },
  bannerWaking: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  bannerOffline: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  spinner: { marginTop: 2 },
  icon: { fontSize: 18, marginTop: 1 },
  textWrap: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: "700" },
  titleWaking: { color: "#92400e" },
  titleOffline: { color: "#991b1b" },
  body: { fontSize: 12, lineHeight: 18 },
  bodyWaking: { color: "#a16207" },
  bodyOffline: { color: "#7f1d1d" },
  retryBtn: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  retryWaking: { backgroundColor: "#fef3c7", borderColor: "#f59e0b" },
  retryOffline: { backgroundColor: "#fee2e2", borderColor: "#f87171" },
  retryText: { fontSize: 13, fontWeight: "700" },
  retryTextWaking: { color: "#b45309" },
  retryTextOffline: { color: "#b91c1c" },
});
