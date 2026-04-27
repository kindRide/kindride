import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/lib/auth";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "members" | "invites";

type PendingMember = {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
  joined_at: string;
  role: string;
};

type Invite = {
  id: string;
  token: string;
  label: string | null;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  created_at: string;
  status: "active" | "expired" | "exhausted";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function memberName(m: PendingMember): string {
  return m.full_name?.trim() || m.display_name?.trim() || m.email?.split("@")[0] || "Unknown";
}

function memberInitial(m: PendingMember): string {
  return memberName(m).charAt(0).toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function inviteLink(token: string): string {
  return `https://kindride.app/join/hub?token=${token}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HubAdminScreen() {
  const { hubId, hubName: hubNameParam } = useLocalSearchParams<{ hubId: string; hubName?: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [tab, setTab] = useState<Tab>("members");

  // Members state
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [actingUserId, setActingUserId] = useState<string | null>(null);

  // Invites state
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("1");
  const [newExpiresHours, setNewExpiresHours] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const authHeader = { Authorization: `Bearer ${session?.access_token}` };

  // ── Load pending members ────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    if (!session || !hubId) return;
    setMembersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hubs/${hubId}/members/pending`, { headers: authHeader });
      if (res.ok) setPendingMembers(await res.json());
    } finally {
      setMembersLoading(false);
    }
  }, [hubId, session?.access_token]);

  // ── Load invites ────────────────────────────────────────────────────────────

  const loadInvites = useCallback(async () => {
    if (!session || !hubId) return;
    setInvitesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hubs/${hubId}/invites`, { headers: authHeader });
      if (res.ok) setInvites(await res.json());
    } finally {
      setInvitesLoading(false);
    }
  }, [hubId, session?.access_token]);

  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { loadInvites(); }, [loadInvites]);

  // ── Approve / reject ────────────────────────────────────────────────────────

  async function handleApprove(userId: string) {
    setActingUserId(userId);
    try {
      const res = await fetch(`${API_BASE}/hubs/${hubId}/members/${userId}/approve`, {
        method: "POST", headers: authHeader,
      });
      if (res.ok) setPendingMembers((prev) => prev.filter((m) => m.user_id !== userId));
      else Alert.alert("Error", "Could not approve. Please try again.");
    } finally {
      setActingUserId(null);
    }
  }

  async function handleReject(userId: string, name: string) {
    Alert.alert("Reject request?", `${name}'s request will be declined.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive",
        onPress: async () => {
          setActingUserId(userId);
          try {
            const res = await fetch(`${API_BASE}/hubs/${hubId}/members/${userId}/reject`, {
              method: "POST", headers: authHeader,
            });
            if (res.ok) setPendingMembers((prev) => prev.filter((m) => m.user_id !== userId));
            else Alert.alert("Error", "Could not reject. Please try again.");
          } finally {
            setActingUserId(null);
          }
        },
      },
    ]);
  }

  // ── Create invite ───────────────────────────────────────────────────────────

  async function handleCreateInvite() {
    if (!session) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = { max_uses: parseInt(newMaxUses) || 1 };
      if (newLabel.trim()) body.label = newLabel.trim();
      if (newExpiresHours.trim()) body.expires_in_hours = parseInt(newExpiresHours);

      const res = await fetch(`${API_BASE}/hubs/${hubId}/invites`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewLabel(""); setNewMaxUses("1"); setNewExpiresHours("");
        loadInvites();
      } else {
        Alert.alert("Error", "Could not create invite. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  }

  // ── Revoke invite ───────────────────────────────────────────────────────────

  async function handleRevoke(token: string) {
    Alert.alert("Revoke invite?", "This link will stop working immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke", style: "destructive",
        onPress: async () => {
          const res = await fetch(`${API_BASE}/hubs/invite/${token}`, {
            method: "DELETE", headers: authHeader,
          });
          if (res.ok) setInvites((prev) => prev.filter((i) => i.token !== token));
          else Alert.alert("Error", "Could not revoke. Please try again.");
        },
      },
    ]);
  }

  // ── Copy invite link ────────────────────────────────────────────────────────

  async function handleCopy(token: string) {
    try {
      const { Clipboard } = await import("@react-native-clipboard/clipboard");
      Clipboard.setString(inviteLink(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      Alert.alert("Link", inviteLink(token));
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{"<"}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{hubNameParam ?? "Hub Admin"}</Text>
          <Text style={styles.headerSub}>Admin Panel</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["members", "invites"] as Tab[]).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "members" ? `Pending Members${pendingMembers.length > 0 ? ` (${pendingMembers.length})` : ""}` : "Invite Links"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Members tab ── */}
      {tab === "members" && (
        membersLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#0d9488" /></View>
        ) : pendingMembers.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>No pending requests</Text>
            <Text style={styles.emptySub}>All membership requests have been reviewed.</Text>
          </View>
        ) : (
          <FlatList
            data={pendingMembers}
            keyExtractor={(m) => m.user_id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            renderItem={({ item: m }) => {
              const acting = actingUserId === m.user_id;
              return (
                <View style={styles.memberCard}>
                  <View style={styles.memberRow}>
                    {/* Avatar */}
                    <LinearGradient colors={["#0d9488", "#0284c7"]} style={styles.avatar}>
                      <Text style={styles.avatarInitial}>{memberInitial(m)}</Text>
                    </LinearGradient>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{memberName(m)}</Text>
                      <Text style={styles.memberEmail}>{m.email || "No email"}</Text>
                      <Text style={styles.memberDate}>Requested {formatDate(m.joined_at)}</Text>
                    </View>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.rejectBtn, acting && styles.btnBusy]}
                      onPress={() => handleReject(m.user_id, memberName(m))}
                      disabled={acting}
                    >
                      {acting ? <ActivityIndicator size="small" color="#ef4444" /> : <Text style={styles.rejectText}>Decline</Text>}
                    </Pressable>
                    <Pressable
                      style={[styles.approveBtn, acting && styles.btnBusy]}
                      onPress={() => handleApprove(m.user_id)}
                      disabled={acting}
                    >
                      {acting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.approveText}>Approve</Text>}
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )
      )}

      {/* ── Invites tab ── */}
      {tab === "invites" && (
        <View style={styles.flex}>
          <View style={styles.inviteHeader}>
            <Text style={styles.inviteHeaderLabel}>
              {invites.length} invite link{invites.length !== 1 ? "s" : ""}
            </Text>
            <Pressable style={styles.createBtn} onPress={() => setShowCreateModal(true)}>
              <Text style={styles.createBtnText}>+ New Link</Text>
            </Pressable>
          </View>

          {invitesLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#0d9488" /></View>
          ) : invites.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🔗</Text>
              <Text style={styles.emptyTitle}>No invite links yet</Text>
              <Text style={styles.emptySub}>Create a link to invite members to this hub.</Text>
            </View>
          ) : (
            <FlatList
              data={invites}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              renderItem={({ item: inv }) => {
                const copied = copiedToken === inv.token;
                const statusColor = inv.status === "active" ? "#16a34a" : inv.status === "expired" ? "#dc2626" : "#d97706";
                const statusBg   = inv.status === "active" ? "#f0fdf4" : inv.status === "expired" ? "#fef2f2" : "#fffbeb";
                return (
                  <View style={styles.inviteCard}>
                    <View style={styles.inviteTopRow}>
                      <View style={styles.inviteLabelWrap}>
                        <Text style={styles.inviteLabel}>{inv.label ?? "Unnamed link"}</Text>
                        <Text style={styles.inviteDate}>Created {formatDate(inv.created_at)}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.inviteStatsRow}>
                      <Text style={styles.inviteStat}>
                        Uses: <Text style={styles.inviteStatVal}>{inv.use_count} / {inv.max_uses}</Text>
                      </Text>
                      {inv.expires_at && (
                        <Text style={styles.inviteStat}>
                          Expires: <Text style={styles.inviteStatVal}>{formatDate(inv.expires_at)}</Text>
                        </Text>
                      )}
                    </View>

                    <View style={styles.inviteActions}>
                      {inv.status === "active" && (
                        <Pressable style={styles.copyBtn} onPress={() => handleCopy(inv.token)}>
                          <Text style={styles.copyBtnText}>{copied ? "✓ Copied!" : "Copy Link"}</Text>
                        </Pressable>
                      )}
                      <Pressable style={styles.revokeBtn} onPress={() => handleRevoke(inv.token)}>
                        <Text style={styles.revokeBtnText}>Revoke</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── Create invite modal ── */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Invite Link</Text>

            <Text style={styles.fieldLabel}>Label (optional)</Text>
            <TextInput
              style={styles.input}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. Orientation Week 2025"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.fieldLabel}>Max uses</Text>
            <TextInput
              style={styles.input}
              value={newMaxUses}
              onChangeText={setNewMaxUses}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.fieldHint}>1 = single-use. Set higher for group events.</Text>

            <Text style={styles.fieldLabel}>Expires in (hours, optional)</Text>
            <TextInput
              style={styles.input}
              value={newExpiresHours}
              onChangeText={setNewExpiresHours}
              keyboardType="number-pad"
              placeholder="e.g. 48"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.fieldHint}>Leave blank for no expiry (max_uses only).</Text>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.approveBtn, creating && styles.btnBusy]} onPress={handleCreateInvite} disabled={creating}>
                {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.approveText}>Create</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 22, color: "#0f172a", fontWeight: "700" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  headerSub: { fontSize: 12, color: "#64748b", fontWeight: "600" },

  tabRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 16, backgroundColor: "#e2e8f0", borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: "#fff", shadowColor: "#0f172a", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: "700", color: "#64748b" },
  tabTextActive: { color: "#0d9488" },

  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  // Member card
  memberCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e2e8f0" },
  memberRow: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 20, fontWeight: "800", color: "#fff" },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  memberEmail: { fontSize: 13, color: "#64748b" },
  memberDate: { fontSize: 12, color: "#94a3b8" },
  actionRow: { flexDirection: "row", gap: 10 },
  rejectBtn: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: "#ef4444" },
  rejectText: { fontSize: 14, fontWeight: "700", color: "#ef4444" },
  approveBtn: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12, backgroundColor: "#0d9488" },
  approveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnBusy: { opacity: 0.6 },

  // Invite header
  inviteHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  inviteHeaderLabel: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  createBtn: { backgroundColor: "#0d9488", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  createBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // Invite card
  inviteCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e2e8f0", marginHorizontal: 16 },
  inviteTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  inviteLabelWrap: { flex: 1, gap: 2 },
  inviteLabel: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  inviteDate: { fontSize: 12, color: "#94a3b8" },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  inviteStatsRow: { flexDirection: "row", gap: 16, marginBottom: 12 },
  inviteStat: { fontSize: 13, color: "#64748b" },
  inviteStatVal: { fontWeight: "700", color: "#0f172a" },
  inviteActions: { flexDirection: "row", gap: 10 },
  copyBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: "#f0fdfa", borderWidth: 1, borderColor: "#0d9488" },
  copyBtnText: { fontSize: 13, fontWeight: "700", color: "#0d9488" },
  revokeBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: "#fca5a5" },
  revokeBtnText: { fontSize: 13, fontWeight: "700", color: "#ef4444" },

  // Empty state
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  emptySub: { fontSize: 14, color: "#64748b", textAlign: "center" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 4 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 4, marginTop: 8 },
  fieldHint: { fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: "#0f172a", backgroundColor: "#f8fafc" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#e2e8f0" },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: "#64748b" },
});
