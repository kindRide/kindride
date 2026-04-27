import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type HubType = "university" | "church" | "nonprofit" | "corporate";

type HubRecord = {
  id: string;
  name: string;
  type: HubType;
  slug: string;
  verified: boolean | null;
  subscription_tier: string | null;
};

type HubMembershipRow = {
  hub_id: string;
  role: string | null;
  joined_at: string;
  is_active: boolean;
  hubs: HubRecord | null;
};

function getTypeBadge(type: HubType | null | undefined) {
  switch (type) {
    case "university":
      return { label: "University", bg: "#ccfbf1", text: "#0f766e" };
    case "church":
      return { label: "Church", bg: "#ede9fe", text: "#6d28d9" };
    case "nonprofit":
      return { label: "Nonprofit", bg: "#ffedd5", text: "#c2410c" };
    case "corporate":
      return { label: "Corporate", bg: "#dbeafe", text: "#1d4ed8" };
    default:
      return { label: "Hub", bg: "#e2e8f0", text: "#475569" };
  }
}

function formatJoinedAt(iso: string) {
  return `Joined ${new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })}`;
}

function formatRole(role: string | null) {
  return role === "hub_admin" ? "Hub Admin" : "Member";
}

export default function MyHubsScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();

  const [hubs, setHubs] = useState<HubMembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leavingHubId, setLeavingHubId] = useState<string | null>(null);

  const loadHubs = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!supabase || !session?.user.id) {
      setHubs([]);
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
      const { data, error } = await supabase
        .from("hub_members")
        .select("hub_id, role, joined_at, is_active, hubs(id, name, type, slug, verified, subscription_tier)")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: false });

      if (error) {
        throw error;
      }

      const rows = (data ?? []).map((r) => ({
        ...r,
        hubs: Array.isArray(r.hubs) ? (r.hubs[0] ?? null) : (r.hubs ?? null),
      })) as HubMembershipRow[];
      setHubs(rows.filter((item) => item.hubs));
    } catch {
      setHubs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    loadHubs();
  }, [authLoading, loadHubs]);

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => loadHubs("refresh")}
        tintColor="#0d9488"
        colors={["#0d9488"]}
      />
    ),
    [loadHubs, refreshing]
  );

  const handleLeave = useCallback((membership: HubMembershipRow) => {
    if (!session?.user.id || !supabase || !membership.hubs) {
      return;
    }

    Alert.alert("Leave hub?", "You can rejoin using the invite link.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            setLeavingHubId(membership.hub_id);
            const { error } = await supabase
              .from("hub_members")
              .update({ is_active: false })
              .eq("hub_id", membership.hub_id)
              .eq("user_id", session.user.id);

            if (error) {
              throw error;
            }

            setHubs((current) => current.filter((item) => item.hub_id !== membership.hub_id));
          } catch {
            Alert.alert("Could not leave hub", "Please try again.");
          } finally {
            setLeavingHubId(null);
          }
        },
      },
    ]);
  }, [session?.user.id]);

  if (loading || authLoading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>My Hubs</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingWrap}>
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
        <Text style={styles.title}>My Hubs</Text>
        <View style={styles.headerSpacer} />
      </View>

      {hubs.length > 0 ? (
        <View style={styles.statsWrap}>
          <View style={styles.statsChip}>
            <Text style={styles.statsChipText}>
              {hubs.length} active hub{hubs.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
      ) : null}

      <FlatList
        data={hubs}
        keyExtractor={(item) => item.hub_id}
        refreshControl={refreshControl}
        contentContainerStyle={hubs.length === 0 ? styles.emptyContent : styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          if (!item.hubs) {
            return null;
          }

          const badge = getTypeBadge(item.hubs.type);
          const isLeaving = leavingHubId === item.hub_id;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.hubName}>{item.hubs.name}</Text>
                  <Text style={styles.joinedText}>{formatJoinedAt(item.joined_at)}</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.typeBadgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.roleChip}>
                  <Text style={styles.roleChipText}>{formatRole(item.role)}</Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                {item.role === "hub_admin" && (
                  <Pressable
                    style={styles.manageButton}
                    onPress={() => router.push(
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      { pathname: "/hub-admin/[hubId]" as any, params: { hubId: item.hub_id, hubName: item.hubs?.name ?? "" } }
                    )}
                  >
                    <Text style={styles.manageButtonText}>Manage</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.leaveButton, isLeaving && styles.buttonDisabled]}
                  onPress={() => handleLeave(item)}
                  disabled={isLeaving}
                >
                  {isLeaving ? (
                    <ActivityIndicator size="small" color="#ef4444" />
                  ) : (
                    <Text style={styles.leaveButtonText}>Leave</Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>You haven{"\u2019"}t joined any hubs yet.</Text>
            <Pressable style={styles.browseButton} onPress={() => router.back()}>
              <Text style={styles.browseButtonText}>Browse Hubs</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const shadow = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
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
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 28,
    lineHeight: 30,
    color: "#0f172a",
    fontWeight: "700",
  },
  title: {
    fontSize: 20,
    color: "#0f172a",
    fontWeight: "800",
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statsWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  statsChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ccfbf1",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statsChipText: {
    color: "#0d9488",
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  separator: {
    height: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 16,
    ...shadow,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleWrap: {
    flex: 1,
    gap: 6,
  },
  hubName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  joinedText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metaRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  roleChip: {
    borderRadius: 999,
    backgroundColor: "#ccfbf1",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleChipText: {
    color: "#0d9488",
    fontSize: 12,
    fontWeight: "700",
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  viewButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#0d9488",
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  viewButtonText: {
    color: "#0d9488",
    fontSize: 14,
    fontWeight: "700",
  },
  manageButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#7c3aed",
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  manageButtonText: {
    color: "#7c3aed",
    fontSize: 14,
    fontWeight: "700",
  },
  leaveButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#ef4444",
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  leaveButtonText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 64,
  },
  emptyState: {
    alignItems: "center",
  },
  emptyTitle: {
    textAlign: "center",
    color: "#0f172a",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 18,
  },
  browseButton: {
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#0d9488",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  browseButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
