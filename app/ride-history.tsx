import { useRouter } from "expo-router";
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
  passenger_id: string | null;
  distance_miles: number | null;
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
  
  const [activeTab, setActiveTab] = useState<"passenger" | "driver">("passenger");
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRides = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!supabase || !session?.user.id) {
      setRides([]);
      setProfiles({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const columnToMatch = activeTab === "passenger" ? "passenger_id" : "driver_id";
      
      const { data: ridesData, error: ridesError } = await supabase
        .from("rides")
        .select("id, status, pickup_address, dropoff_address, created_at, kind_points, driver_id, passenger_id, distance_miles")
        .eq(columnToMatch, session.user.id)
        .order("created_at", { ascending: false })
        .limit(60);

      if (ridesError) throw ridesError;

      const fetchedRides = (ridesData ?? []) as RideHistoryItem[];
      setRides(fetchedRides);

      // Batch fetch display names
      const profileIdsToFetch = Array.from(
        new Set(
          fetchedRides
            .map((r) => (activeTab === "passenger" ? r.driver_id : r.passenger_id))
            .filter(Boolean) as string[]
        )
      );

      if (profileIdsToFetch.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIdsToFetch);

        if (profilesData) {
          const profileMap: Record<string, string> = {};
          profilesData.forEach((p) => {
            if (p.id && p.display_name) {
              profileMap[p.id] = p.display_name;
            }
          });
          setProfiles(profileMap);
        }
      } else {
        setProfiles({});
      }
    } catch {
      setRides([]);
      setProfiles({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user.id, activeTab]);

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

  // Stats calculations
  const totalRides = rides.length;
  const completedRides = rides.filter((r) => r.status === "completed");
  const totalPoints = completedRides.reduce((acc, r) => acc + Number(r.kind_points ?? 0), 0);
  const totalMiles = completedRides
    .reduce((acc, r) => acc + Number(r.distance_miles ?? 0), 0)
    .toFixed(1);

  if (loading || authLoading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>Ride History</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.tabContainer}>
          <Pressable style={styles.tab} onPress={() => setActiveTab("passenger")}>
            <Text style={[styles.tabText, activeTab === "passenger" && styles.activeTabText]}>As Passenger</Text>
            {activeTab === "passenger" && <View style={styles.activeTabIndicator} />}
          </Pressable>
          <Pressable style={styles.tab} onPress={() => setActiveTab("driver")}>
            <Text style={[styles.tabText, activeTab === "driver" && styles.activeTabText]}>As Driver</Text>
            {activeTab === "driver" && <View style={styles.activeTabIndicator} />}
          </Pressable>
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
        <Text style={styles.title}>Ride History</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabContainer}>
        <Pressable style={styles.tab} onPress={() => setActiveTab("passenger")}>
          <Text style={[styles.tabText, activeTab === "passenger" && styles.activeTabText]}>As Passenger</Text>
          {activeTab === "passenger" && <View style={styles.activeTabIndicator} />}
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setActiveTab("driver")}>
          <Text style={[styles.tabText, activeTab === "driver" && styles.activeTabText]}>As Driver</Text>
          {activeTab === "driver" && <View style={styles.activeTabIndicator} />}
        </Pressable>
      </View>

      <View style={styles.statsStrip}>
        <View style={styles.statChip}><Text style={styles.statChipText}>{totalRides} rides</Text></View>
        <View style={styles.statChip}><Text style={styles.statChipText}>{totalPoints} pts</Text></View>
        <View style={styles.statChip}><Text style={styles.statChipText}>{totalMiles} mi</Text></View>
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
          const miles = Number(item.distance_miles ?? 0).toFixed(1);
          
          let otherPersonLabel = "";
          if (activeTab === "passenger" && item.driver_id) {
            otherPersonLabel = `Driver: ${profiles[item.driver_id] || item.driver_id.slice(-8)}`;
          } else if (activeTab === "driver" && item.passenger_id) {
            otherPersonLabel = `Passenger: ${profiles[item.passenger_id] || item.passenger_id.slice(-8)}`;
          }
          
          const showRebook = activeTab === "passenger" && item.status === "completed";

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

              <Text style={styles.arrow}>{"→"}</Text>

              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Dropoff</Text>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.addressText}>
                  {item.dropoff_address || "Dropoff unavailable"}
                </Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.footerInfoText}>
                  {miles} mi {otherPersonLabel ? `· ${otherPersonLabel}` : ""}
                </Text>
                {item.status === "completed" && points > 0 && (
                  <Text style={styles.pointsText}>+{points} pts</Text>
                )}
              </View>
              
              {showRebook && (
                <Pressable 
                  style={styles.rebookButton} 
                  onPress={() => router.push({ pathname: "/(tabs)/ride-request" })}
                >
                  <Text style={styles.rebookButtonText}>Rebook →</Text>
                </Pressable>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {activeTab === "passenger" ? "No rides as a passenger yet." : "No rides as a driver yet."}
            </Text>
            <Pressable 
              style={styles.emptyButton} 
              onPress={() => router.replace(activeTab === "passenger" ? "/(tabs)/ride-request" : "/(tabs)/driver")}
            >
              <Text style={styles.emptyButtonText}>
                {activeTab === "passenger" ? "Find a Ride" : "Start Driving"}
              </Text>
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
    paddingBottom: 8,
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
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    position: "relative",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
  },
  activeTabText: {
    color: "#0d9488",
    fontWeight: "800",
  },
  activeTabIndicator: {
    position: "absolute",
    bottom: -1,
    left: "20%",
    right: "20%",
    height: 3,
    backgroundColor: "#0d9488",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  statsStrip: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statChip: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  statChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
    fontSize: 16,
    color: "#94a3b8",
    marginVertical: 6,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
  },
  footerInfoText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  pointsText: {
    color: "#0d9488",
    fontSize: 14,
    fontWeight: "800",
  },
  rebookButton: {
    marginTop: 12,
    alignSelf: "flex-end",
  },
  rebookButtonText: {
    color: "#0d9488",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    marginBottom: 24,
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
