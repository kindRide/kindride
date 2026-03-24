import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function PointsScreen() {
  const params = useLocalSearchParams<{ earned?: string }>();
  const earnedValue = Number(params.earned ?? "0");
  const earnedPoints = Number.isFinite(earnedValue) ? earnedValue : 0;
  const currentTier = "Helper";
  const totalPoints = earnedPoints;
  const nextTierTarget = 100;
  const progressPercent = Math.min((totalPoints / nextTierTarget) * 100, 100);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Points</Text>
      <Text style={styles.subtitle}>Starter local points screen (no database yet)</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Current Tier</Text>
        <Text style={styles.value}>{currentTier}</Text>

        <Text style={[styles.label, styles.labelTop]}>Total Points</Text>
        <Text style={styles.value}>{totalPoints}</Text>

        <Text style={[styles.label, styles.labelTop]}>Last Trip Reward</Text>
        <Text style={styles.reward}>+{earnedPoints} points</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {totalPoints}/{nextTierTarget} to Good Samaritan
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8faff",
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#4b587c",
  },
  card: {
    marginTop: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 12,
    padding: 14,
  },
  label: {
    fontSize: 13,
    color: "#4b587c",
  },
  labelTop: {
    marginTop: 12,
  },
  value: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a44",
  },
  reward: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "700",
    color: "#0f766e",
  },
  progressTrack: {
    marginTop: 14,
    height: 10,
    backgroundColor: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 999,
  },
  progressText: {
    marginTop: 8,
    fontSize: 13,
    color: "#4b587c",
  },
});
