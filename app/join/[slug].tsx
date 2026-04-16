import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";

type HubInfo = {
  id: string;
  name: string;
  type: string;
  slug: string;
  logo_url: string | null;
  subscription_tier: string;
};

type JoinState = "loading" | "not_found" | "already_member" | "ready" | "joining" | "done";

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

export default function JoinHubScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const [state, setState] = useState<JoinState>("loading");
  const [hub, setHub] = useState<HubInfo | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) { setState("not_found"); return; }
    loadHub(slug);
  }, [slug]);

  async function loadHub(hubSlug: string) {
    if (!supabase) { setState("not_found"); return; }
    try {
      // Fetch hub (RLS: only verified + approved hubs are readable)
      const { data: hubData, error: hubErr } = await supabase
        .from("hubs")
        .select("id, name, type, slug, logo_url, subscription_tier")
        .eq("slug", hubSlug)
        .single();

      if (hubErr || !hubData) { setState("not_found"); return; }
      setHub(hubData as HubInfo);

      // Member count
      const { count } = await supabase
        .from("hub_members")
        .select("user_id", { count: "exact", head: true })
        .eq("hub_id", hubData.id)
        .eq("is_active", true);
      setMemberCount(count ?? null);

      // Check if current user is already a member
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: existing } = await supabase
          .from("hub_members")
          .select("user_id")
          .eq("hub_id", hubData.id)
          .eq("user_id", session.user.id)
          .eq("is_active", true)
          .maybeSingle();
        if (existing) { setState("already_member"); return; }
      }

      setState("ready");
    } catch {
      setState("not_found");
    }
  }

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

      const { error } = await supabase.from("hub_members").insert({
        hub_id: hub.id,
        user_id: session.user.id,
        role: "member",
      });

      if (error) {
        if (error.code === "23505") {
          // Duplicate — already a member
          setState("already_member");
          return;
        }
        throw error;
      }

      setState("done");
    } catch {
      Alert.alert("Error", "Could not join hub. Please try again.");
      setState("ready");
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
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

  const typeIcon = HUB_TYPE_ICON[hub?.type ?? ""] ?? "🏘️";
  const typeLabel = HUB_TYPE_LABEL[hub?.type ?? ""] ?? hub?.type ?? "";

  // ── Done / already member ─────────────────────────────────────────────────
  if (state === "done" || state === "already_member") {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <LinearGradient
          colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
          style={styles.hero}
        >
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
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={styles.primaryBtnText}>Go to KindRide</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Ready to join ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
        style={styles.hero}
      >
        <Text style={styles.heroIcon}>{typeIcon}</Text>
        <Text style={styles.heroTitle}>{hub?.name}</Text>
        <Text style={styles.heroSub}>{typeLabel} · KindRide Hub</Text>
      </LinearGradient>

      <View style={styles.content}>
        {/* Info card */}
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
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Plan</Text>
            <Text style={[styles.infoValue, styles.infoValueCap]}>
              {hub?.subscription_tier ?? "free"}
            </Text>
          </View>
        </View>

        {/* Benefit list */}
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>What you get</Text>
          {[
            "Hub drivers shown first in your ride request list",
            "\"" + (hub?.name ?? "Hub") + " Driver\" badge on matching cards",
            "Contribute to your community's ride stats",
          ].map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Text style={styles.benefitCheck}>✓</Text>
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
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

  // Hero
  hero: {
    paddingTop: 32, paddingBottom: 36, paddingHorizontal: 24,
    alignItems: "center",
  },
  heroIcon: { fontSize: 52, marginBottom: 12 },
  heroTitle: {
    fontSize: 28, fontWeight: "800", color: "#ffffff",
    letterSpacing: -0.5, textAlign: "center",
  },
  heroSub: {
    fontSize: 14, color: "rgba(255,255,255,0.7)",
    fontWeight: "600", marginTop: 6,
  },

  // Content
  content: { flex: 1, padding: 20, gap: 16 },

  // Info card
  infoCard: {
    backgroundColor: "#fff", borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: "#e2e8f0",
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
  infoLabel: { fontSize: 14, color: "#64748b", fontWeight: "500" },
  infoValue: { fontSize: 14, color: "#0f172a", fontWeight: "700" },
  infoValueCap: { textTransform: "capitalize" },
  infoDivider: { height: 1, backgroundColor: "#f1f5f9" },

  // Benefits
  benefitsCard: {
    backgroundColor: "#f0fdf4", borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: "#bbf7d0",
  },
  benefitsTitle: {
    fontSize: 13, fontWeight: "700", color: "#166534",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12,
  },
  benefitRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  benefitCheck: { fontSize: 14, color: "#16a34a", fontWeight: "800", marginTop: 1 },
  benefitText: { flex: 1, fontSize: 14, color: "#0f172a", lineHeight: 20 },

  // Buttons
  primaryBtn: {
    backgroundColor: "#0d9488", borderRadius: 14,
    paddingVertical: 16, alignItems: "center",
  },
  primaryBtnBusy: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipLink: { alignItems: "center", paddingVertical: 12 },
  skipLinkText: { fontSize: 14, color: "#94a3b8", fontWeight: "600" },
  backBtn: {
    marginTop: 20, backgroundColor: "#0d9488",
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32,
  },
  backBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Not found
  notFoundIcon: { fontSize: 48, marginBottom: 16 },
  notFoundTitle: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  notFoundBody: {
    fontSize: 15, color: "#64748b", textAlign: "center",
    lineHeight: 22, maxWidth: 300,
  },

  // Done
  doneCard: {
    flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 16,
  },
  doneIcon: { fontSize: 56 },
  doneTitle: {
    fontSize: 22, fontWeight: "800", color: "#0f172a",
    textAlign: "center", letterSpacing: -0.3,
  },
  doneBody: {
    fontSize: 15, color: "#475569", textAlign: "center",
    lineHeight: 22, maxWidth: 320,
  },
});
