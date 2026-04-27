import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

type JoinState =
  | "loading"
  | "invalid_token"   // token expired / exhausted / not found
  | "not_found"       // hub slug not found (slugOnly flow)
  | "already_member"
  | "ready"
  | "joining"
  | "done";

type HubInfo = {
  id: string;
  name: string;
  type: string;
  slug: string;
  logo_url: string | null;
  subscription_tier: string;
  access_type: "open" | "closed" | "hybrid";
};

type UserIdentity = {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const HUB_TYPE_LABEL: Record<string, string> = {
  university: "University",
  church: "Church",
  nonprofit: "Nonprofit",
  corporate: "Corporate",
};

const HUB_TYPE_ICON: Record<string, string> = {
  university: "🎓",
  church: "⛪",
  nonprofit: "🤝",
  corporate: "🏢",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(identity: UserIdentity): string {
  return (
    identity.full_name?.trim() ||
    identity.display_name?.trim() ||
    identity.email?.split("@")[0] ||
    "You"
  );
}

function avatarInitial(identity: UserIdentity): string {
  const name = displayName(identity);
  return name.charAt(0).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JoinHubScreen() {
  const { slug, token } = useLocalSearchParams<{ slug: string; token?: string }>();
  const router = useRouter();

  const [state, setState] = useState<JoinState>("loading");
  const [hub, setHub] = useState<HubInfo | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [invalidReason, setInvalidReason] = useState<string>("");

  useEffect(() => {
    if (!slug) { setState("not_found"); return; }
    if (token) {
      loadViaToken(token);
    } else {
      loadViaSlug(slug);
    }
  }, [slug, token]);

  // ── Token-based flow ────────────────────────────────────────────────────────

  async function loadViaToken(inviteToken: string) {
    if (!supabase) { setState("not_found"); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session ? `Bearer ${session.access_token}` : undefined;

      const url = `${API_BASE}/hubs/invite/${encodeURIComponent(inviteToken)}`;
      const res = await fetch(url, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });

      if (!res.ok) { setState("not_found"); return; }
      const data = await res.json();

      if (!data.valid) {
        setInvalidReason(data.reason ?? "This invite is no longer valid.");
        setState("invalid_token");
        return;
      }

      // Build hub object from token validation response
      setHub({
        id: data.hub_id,
        name: data.hub_name,
        type: data.hub_type,
        slug: data.hub_slug,
        logo_url: null,
        subscription_tier: "basic",
        access_type: "open", // token bypass — treat as open
      });

      // Member count
      const { count } = await supabase
        .from("hub_members")
        .select("user_id", { count: "exact", head: true })
        .eq("hub_id", data.hub_id)
        .eq("is_active", true);
      setMemberCount(count ?? null);

      if (data.already_member) {
        setState("already_member");
        return;
      }

      if (data.user_id) {
        setIdentity({
          user_id: data.user_id,
          full_name: data.user_full_name ?? null,
          display_name: data.user_display_name ?? null,
          avatar_url: data.user_avatar_url ?? null,
          email: data.user_email ?? null,
        });
      }

      setState("ready");
    } catch {
      setState("not_found");
    }
  }

  // ── Slug-only flow (open hubs, no token) ────────────────────────────────────

  async function loadViaSlug(hubSlug: string) {
    if (!supabase) { setState("not_found"); return; }
    try {
      const { data: hubData, error: hubErr } = await supabase
        .from("hubs")
        .select("id, name, type, slug, logo_url, subscription_tier, access_type")
        .eq("slug", hubSlug)
        .single();

      if (hubErr || !hubData) { setState("not_found"); return; }
      setHub(hubData as HubInfo);

      const { count } = await supabase
        .from("hub_members")
        .select("user_id", { count: "exact", head: true })
        .eq("hub_id", hubData.id)
        .eq("is_active", true);
      setMemberCount(count ?? null);

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: existing } = await supabase
          .from("hub_members")
          .select("user_id, status")
          .eq("hub_id", hubData.id)
          .eq("user_id", session.user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (existing) { setState("already_member"); return; }

        // Load user identity for display
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, display_name, avatar_url")
          .eq("id", session.user.id)
          .maybeSingle();

        setIdentity({
          user_id: session.user.id,
          full_name: (profile as { full_name?: string } | null)?.full_name ?? null,
          display_name: (profile as { display_name?: string } | null)?.display_name ?? null,
          avatar_url: (profile as { avatar_url?: string } | null)?.avatar_url ?? null,
          email: session.user.email ?? null,
        });
      }

      setState("ready");
    } catch {
      setState("not_found");
    }
  }

  // ── Join action ─────────────────────────────────────────────────────────────

  async function handleJoin() {
    if (!supabase || !hub) return;
    setState("joining");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert("Sign in required", "Please sign in to join a hub.", [
          { text: "Cancel", onPress: () => setState("ready") },
          { text: "Sign in", onPress: () => router.push("/sign-in") },
        ]);
        return;
      }

      if (token) {
        // Token flow — backend validates + consumes atomically
        const res = await fetch(
          `${API_BASE}/hubs/invite/${encodeURIComponent(token)}/join`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );
        const data = await res.json();
        if (!res.ok) {
          Alert.alert("Could not join", data.detail ?? "Please try again.");
          setState("ready");
          return;
        }
        setState(data.status === "already_member" ? "already_member" : "done");
        return;
      }

      // Slug-only flow — direct Supabase insert
      const memberStatus = hub.access_type === "closed" ? "pending" : "active";
      const { error } = await supabase.from("hub_members").insert({
        hub_id: hub.id,
        user_id: session.user.id,
        role: "member",
        status: memberStatus,
      });

      if (error) {
        if (error.code === "23505") { setState("already_member"); return; }
        throw error;
      }
      setState("done");
    } catch {
      Alert.alert("Error", "Could not join hub. Please try again.");
      setState("ready");
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  const typeIcon  = HUB_TYPE_ICON[hub?.type ?? ""]  ?? "🏘️";
  const typeLabel = HUB_TYPE_LABEL[hub?.type ?? ""] ?? hub?.type ?? "";

  if (state === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (state === "not_found") {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.notFoundIcon}>🔍</Text>
          <Text style={styles.notFoundTitle}>Hub not found</Text>
          <Text style={styles.notFoundBody}>
            This invite link may be expired or the hub hasn't been approved yet.
          </Text>
          <Pressable style={styles.backBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.backBtnText}>Go home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (state === "invalid_token") {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.notFoundIcon}>🔒</Text>
          <Text style={styles.notFoundTitle}>Invite unavailable</Text>
          <Text style={styles.notFoundBody}>{invalidReason}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.backBtnText}>Go home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (state === "done" || state === "already_member") {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <LinearGradient colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]} style={styles.hero}>
          <Text style={styles.heroIcon}>{typeIcon}</Text>
          <Text style={styles.heroTitle}>{hub?.name}</Text>
          <Text style={styles.heroSub}>{typeLabel} · KindRide Hub</Text>
        </LinearGradient>
        <View style={styles.doneCard}>
          <Text style={styles.doneIcon}>{state === "done" ? "🎉" : "✅"}</Text>
          <Text style={styles.doneTitle}>
            {state === "done" ? `Welcome to ${hub?.name}!` : `You're already in ${hub?.name}`}
          </Text>
          <Text style={styles.doneBody}>
            {state === "done"
              ? "You're now part of this hub. Hub drivers will be prioritized when you request a ride."
              : "You joined this hub earlier. Hub drivers are already prioritized for your rides."}
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.primaryBtnText}>Go to KindRide</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Ready to join ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <LinearGradient colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]} style={styles.hero}>
        <Text style={styles.heroIcon}>{typeIcon}</Text>
        <Text style={styles.heroTitle}>{hub?.name}</Text>
        <Text style={styles.heroSub}>{typeLabel} · KindRide Hub</Text>
      </LinearGradient>

      <View style={styles.content}>

        {/* ── Who is joining ── */}
        {identity ? (
          <View style={styles.identityCard}>
            <Text style={styles.identityLabel}>Joining as</Text>
            <View style={styles.identityRow}>
              {identity.avatar_url ? (
                <Image source={{ uri: identity.avatar_url }} style={styles.avatarImg} />
              ) : (
                <LinearGradient
                  colors={["#0d9488", "#0284c7"]}
                  style={styles.avatarGradient}
                >
                  <Text style={styles.avatarInitial}>{avatarInitial(identity)}</Text>
                </LinearGradient>
              )}
              <View style={styles.identityTextBlock}>
                <Text style={styles.identityName}>{displayName(identity)}</Text>
                {identity.email ? (
                  <Text style={styles.identityEmail}>{identity.email}</Text>
                ) : null}
              </View>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>✓ Verified</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.identityCard}>
            <Text style={styles.identityLabel}>Not signed in</Text>
            <Text style={styles.identityEmail}>
              You'll need to sign in before you can join.
            </Text>
          </View>
        )}

        {/* ── Hub stats ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hub type</Text>
            <Text style={styles.infoValue}>{typeLabel}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Members</Text>
            <Text style={styles.infoValue}>
              {memberCount != null ? `${memberCount} active` : "—"}
            </Text>
          </View>
          {token && (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Access</Text>
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenBadgeText}>🔑 Invite only</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Benefits ── */}
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>What you get</Text>
          {[
            "Hub drivers shown first in your ride request list",
            `"${hub?.name ?? "Hub"} Driver" badge on matching cards`,
            "Contribute to your community's ride stats",
          ].map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Text style={styles.benefitCheck}>✓</Text>
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>

        {/* ── CTA ── */}
        <Pressable
          style={[styles.primaryBtn, state === "joining" && styles.primaryBtnBusy]}
          onPress={handleJoin}
          disabled={state === "joining"}
        >
          {state === "joining" ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Join {hub?.name}</Text>
          )}
        </Pressable>

        <Pressable style={styles.skipLink} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.skipLinkText}>Maybe later</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },

  hero: {
    paddingTop: 32, paddingBottom: 36, paddingHorizontal: 24,
    alignItems: "center",
  },
  heroIcon:  { fontSize: 52, marginBottom: 12 },
  heroTitle: { fontSize: 28, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5, textAlign: "center" },
  heroSub:   { fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: "600", marginTop: 6 },

  content: { flex: 1, padding: 20, gap: 14 },

  // Identity card
  identityCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#0d948833",
    gap: 10,
  },
  identityLabel: { fontSize: 11, fontWeight: "700", color: "#0d9488", textTransform: "uppercase", letterSpacing: 0.6 },
  identityRow:   { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarImg:     { width: 48, height: 48, borderRadius: 24 },
  avatarGradient: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial:  { fontSize: 20, fontWeight: "800", color: "#fff" },
  identityTextBlock: { flex: 1, gap: 2 },
  identityName:   { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  identityEmail:  { fontSize: 13, color: "#64748b" },
  verifiedBadge:  { backgroundColor: "#f0fdf4", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedBadgeText: { fontSize: 12, fontWeight: "700", color: "#16a34a" },

  // Info card
  infoCard: {
    backgroundColor: "#fff", borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: "#e2e8f0",
  },
  infoRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  infoLabel:  { fontSize: 14, color: "#64748b", fontWeight: "500" },
  infoValue:  { fontSize: 14, color: "#0f172a", fontWeight: "700" },
  infoDivider:{ height: 1, backgroundColor: "#f1f5f9" },

  tokenBadge:     { backgroundColor: "#fef3c7", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tokenBadgeText: { fontSize: 12, fontWeight: "700", color: "#d97706" },

  // Benefits
  benefitsCard: {
    backgroundColor: "#f0fdf4", borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: "#bbf7d0",
  },
  benefitsTitle: {
    fontSize: 13, fontWeight: "700", color: "#166534",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12,
  },
  benefitRow:  { flexDirection: "row", gap: 10, marginBottom: 8 },
  benefitCheck:{ fontSize: 14, color: "#16a34a", fontWeight: "800", marginTop: 1 },
  benefitText: { flex: 1, fontSize: 14, color: "#0f172a", lineHeight: 20 },

  // Buttons
  primaryBtn:     { backgroundColor: "#0d9488", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryBtnBusy: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipLink:       { alignItems: "center", paddingVertical: 12 },
  skipLinkText:   { fontSize: 14, color: "#94a3b8", fontWeight: "600" },
  backBtn: {
    marginTop: 20, backgroundColor: "#0d9488",
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32,
  },
  backBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  notFoundIcon:  { fontSize: 48, marginBottom: 16 },
  notFoundTitle: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  notFoundBody:  { fontSize: 15, color: "#64748b", textAlign: "center", lineHeight: 22, maxWidth: 300 },

  doneCard:  { flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 16 },
  doneIcon:  { fontSize: 56 },
  doneTitle: { fontSize: 22, fontWeight: "800", color: "#0f172a", textAlign: "center", letterSpacing: -0.3 },
  doneBody:  { fontSize: 15, color: "#475569", textAlign: "center", lineHeight: 22, maxWidth: 320 },
});
