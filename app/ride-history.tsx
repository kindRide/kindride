import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type RideHistoryItem = {
  id: string;
  status: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  created_at: string;
  kind_points: number | null;
  driver_id: string | null;
};

function formatRideDate(iso: string) {
  const date = new Date(iso);
  const dateText = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeText = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateText} \u00B7 ${timeText}`;
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "completed":
      return { bg: "#dcfce7", text: "#15803d", label: "Completed" };
    case "cancelled":
    case "expired":
      return { bg: "#fee2e2", text: "#dc2626", label: status === "expired" ? "Expired" : "Cancelled" };
    case "in_progress":
      return { bg: "#dbeafe", text: "#2563eb", label: "In Progress" };
    default:
      return {
        bg: "#e2e8f0",
        text: "#475569",
        label: status ? status.replace(/_/g, " ") : "Unknown",
      };
  }
}

export default function RideHistoryScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRides = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!supabase || !session?.user.id) {
      setRides([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const { data, error } = await supabase
      .from("rides")
      .select("id, status, pickup_address, dropoff_address, created_at, kind_points, driver_id")
      .eq("passenger_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setRides([]);
    } else {
      setRides((data ?? []) as RideHistoryItem[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [session?.user.id]);

  useEffect(() => {
    if (authLoading) return;
    loadRides();
  }, [authLoading, loadRides]);

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => loadRides("refresh")}
        tintColor="#0d9488"
        colors={["#0d9488"]}
      />
    ),
    [loadRides, refreshing]
  );

  if (loading || authLoading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>My Rides</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>{"<"}</Text>
        </Pressable>
        <Text style={styles.title}>My Rides</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={rides}
        keyExtractor={(item) => item.id}
        contentContainerStyle={rides.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={refreshControl}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const badge = getStatusBadge(item.status);
          const points = Number(item.kind_points ?? 0);
          const driverSuffix = item.driver_id ? item.driver_id.slice(-8) : null;

          return (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
                <Text style={styles.dateText}>{formatRideDate(item.created_at)}</Text>
              </View>

              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Pickup</Text>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.addressText}>
                  {item.pickup_address || "Pickup unavailable"}
                </Text>
              </View>

              <Text style={styles.arrow}>{"->"}</Text>

              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Dropoff</Text>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.addressText}>
                  {item.dropoff_address || "Dropoff unavailable"}
                </Text>
              </View>

              <View style={styles.cardFooter}>
                {item.status === "completed" && points > 0 ? (
                  <Text style={styles.pointsText}>+{points} pts</Text>
                ) : (
                  <View />
                )}
                {driverSuffix ? <Text style={styles.driverText}>Driver {driverSuffix}</Text> : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No rides yet.</Text>
            <Text style={styles.emptyBody}>
              Request your first ride from the home screen.
            </Text>
            <Pressable style={styles.emptyButton} onPress={() => router.replace("/(tabs)")}>
              <Text style={styles.emptyButtonText}>Go Home</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const shadow = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.06,
  shadowRadius: 14,
  elevation: 3,
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  backText: {
    fontSize: 28,
    lineHeight: 28,
    color: "#0f172a",
    marginTop: -2,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  separator: {
    height: 12,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    ...shadow,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  dateText: {
    flex: 1,
    textAlign: "right",
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  addressBlock: {
    gap: 4,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#94a3b8",
  },
  addressText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },
  arrow: {
    fontSize: 18,
    color: "#0d9488",
    marginVertical: 8,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  pointsText: {
    color: "#0d9488",
    fontSize: 14,
    fontWeight: "800",
  },
  driverText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: "#0d9488",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  emptyButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
