// Web: camera-based session recording is not available on the web build.
// Displays a passive recording indicator only.
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

type Props = { isActive: boolean; rideId: string };

export default function SessionRecorder({ isActive }: Props) {
  const { t } = useTranslation();
  if (!isActive) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={styles.label}>{t("sessionRecordingActiveMobileOnly")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  label: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "600",
  },
});
