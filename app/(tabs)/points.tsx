import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function PointsScreen() {
  const params = useLocalSearchParams<{ earned?: string; role?: string }>();
  const earnedValue = Number(params.earned ?? "0");
  const earnedPoints = Number.isFinite(earnedValue) ? earnedValue : 0;
  const userRole = params.role === "passenger" ? "passenger" : "driver";
  const currentTier = "Helper";
  const totalPoints = earnedPoints;
  const nextTierTarget = 100;
  const progressPercent = Math.min((totalPoints / nextTierTarget) * 100, 100);
  const pointEvents = [
    { id: "1", label: "Ride completed", value: 10 },
    ...(earnedPoints >= 15 ? [{ id: "2", label: "5-star bonus", value: 5 }] : []),
  ];

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Points</Text>
      <Text style={styles.subtitle}>Starter local points screen (no database yet)</Text>

      {userRole !== "driver" ? (
        <View style={styles.guardCard}>
          <Text style={styles.guardText}>
            This area is driver-only. Passenger accounts do not collect points.
          </Text>
        </View>
      ) : null}

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

        <Text style={[styles.label, styles.labelTop]}>Point History (Local)</Text>
        <View style={styles.historyWrap}>
          {pointEvents.map((event) => (
            <View key={event.id} style={styles.historyRow}>
              <Text style={styles.historyLabel}>{event.label}</Text>
              <Text style={styles.historyValue}>+{event.value}</Text>
            </View>
          ))}
        </View>
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
  guardCard: {
    marginTop: 14,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 10,
    padding: 10,
  },
  guardText: {
    color: "#92400e",
    fontWeight: "600",
    fontSize: 13,
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
  historyWrap: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    gap: 8,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyLabel: {
    fontSize: 14,
    color: "#1f2a44",
  },
  historyValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f766e",
  },
});
