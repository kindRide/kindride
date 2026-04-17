import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

type Stats = {
  lifetimeRides: number;
  lifetimePts: number;
  todayRides: number;
  weekRides: number;
  monthRides: number;
  todayPts: number;
  weekPts: number;
  monthPts: number;
  longestStreak: number;
  currentStreak: number;
  hubName: string | null;
};

const EMPTY: Stats = {
  lifetimeRides: 0, lifetimePts: 0,
  todayRides: 0, weekRides: 0, monthRides: 0,
  todayPts: 0, weekPts: 0, monthPts: 0,
  longestStreak: 0, currentStreak: 0,
  hubName: null,
};

function computeStreak(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };
  const days = [...new Set(dates.map(d => d.slice(0, 10)))].sort().reverse();
  let current = 0;
  let longest = 0;
  let streak = 1;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== yesterday) {
    current = 0;
  } else {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const curr = new Date(days[i]);
      const diff = (prev.getTime() - curr.getTime()) / 86400000;
      if (diff === 1) { streak++; current = streak; }
      else { longest = Math.max(longest, streak); streak = 1; }
    }
    longest = Math.max(longest, streak);
  }
  return { current, longest };
}

export default function DriverImpactScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          if (!supabase) return;
          const { data: { session } } = await supabase.auth.getSession();
          if (!session || cancelled) return;
          const uid = session.user.id;

          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          const startOfWeek  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

          const [ridesRes, hubRes] = await Promise.all([
            supabase
              .from("rides")
              .select("created_at, kind_points")
              .eq("driver_id", uid)
              .eq("status", "completed"),
            supabase
              .from("hub_members")
              .select("hub:hubs(name)")
              .eq("user_id", uid)
              .eq("is_active", true)
              .maybeSingle(),
          ]);

          if (cancelled) return;
          const rides = ridesRes.data ?? [];
          const sum = (arr: typeof rides) => arr.reduce((a, r) => a + (r.kind_points ?? 0), 0);

          const todayArr = rides.filter(r => r.created_at >= startOfToday);
          const weekArr  = rides.filter(r => r.created_at >= startOfWeek);
          const monthArr = rides.filter(r => r.created_at >= startOfMonth);
          const streak   = computeStreak(rides.map(r => r.created_at));

          const hubObj = hubRes.data?.hub as { name: string } | null | undefined;

          setStats({
            lifetimeRides: rides.length,
            lifetimePts:   sum(rides),
            todayRides:    todayArr.length,
            weekRides:     weekArr.length,
            monthRides:    monthArr.length,
            todayPts:      sum(todayArr),
            weekPts:       sum(weekArr),
            monthPts:      sum(monthArr),
            currentStreak: streak.current,
            longestStreak: streak.longest,
            hubName:       hubObj?.name ?? null,
          });
        } catch { /* non-critical */ } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  const impactEquivalents = [
    { icon: "🚗", label: "Uber trips replaced", value: stats.lifetimeRides },
    { icon: "🌱", label: "kg CO₂ saved (est.)", value: Math.round(stats.lifetimeRides * 2.1) },
    { icon: "💰", label: "Saved passengers ($)", value: stats.lifetimeRides * 12 },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <LinearGradient colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]} style={styles.hero}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.heroEyebrow}>Your Impact</Text>
          <Text style={styles.heroTitle}>{stats.lifetimeRides}</Text>
          <Text style={styles.heroSub}>
            rides given · {stats.lifetimePts.toLocaleString()} Kind Points earned
          </Text>
          {stats.hubName && (
            <View style={styles.hubChip}>
              <Text style={styles.hubChipText}>🏫 {stats.hubName} Driver</Text>
            </View>
          )}
        </LinearGradient>

        {/* Streak */}
        <View style={styles.streakCard}>
          <View style={styles.streakItem}>
            <Text style={styles.streakValue}>{stats.currentStreak}</Text>
            <Text style={styles.streakLabel}>🔥 Current streak</Text>
            <Text style={styles.streakSub}>days driving</Text>
          </View>
          <View style={styles.streakDivider} />
          <View style={styles.streakItem}>
            <Text style={styles.streakValue}>{stats.longestStreak}</Text>
            <Text style={styles.streakLabel}>🏆 Best streak</Text>
            <Text style={styles.streakSub}>days ever</Text>
          </View>
        </View>

        {/* Period breakdown */}
        <Text style={styles.sectionLabel}>RIDES BY PERIOD</Text>
        <View style={styles.periodGrid}>
          {[
            { label: "Today",      rides: stats.todayRides,  pts: stats.todayPts  },
            { label: "This week",  rides: stats.weekRides,   pts: stats.weekPts   },
            { label: "This month", rides: stats.monthRides,  pts: stats.monthPts  },
          ].map((p) => (
            <View key={p.label} style={styles.periodCard}>
              <Text style={styles.periodRides}>{p.rides}</Text>
              <Text style={styles.periodLabel}>{p.label}</Text>
              <Text style={styles.periodPts}>+{p.pts} pts</Text>
            </View>
          ))}
        </View>

        {/* Real-world impact */}
        <Text style={styles.sectionLabel}>REAL-WORLD EQUIVALENT</Text>
        <View style={styles.impactCard}>
          {impactEquivalents.map((item) => (
            <View key={item.label} style={styles.impactRow}>
              <Text style={styles.impactIcon}>{item.icon}</Text>
              <Text style={styles.impactLabel}>{item.label}</Text>
              <Text style={styles.impactValue}>{item.value.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        {/* Mission note */}
        <View style={styles.missionCard}>
          <Text style={styles.missionTitle}>Why your rides matter</Text>
          <Text style={styles.missionBody}>
            Every ride you give is one fewer Uber trip, one less stranger in a car, and one more person who
            feels safe in their community. KindRide drivers like you are the reason this works.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  hero: { paddingTop: 12, paddingBottom: 32, paddingHorizontal: 22 },
  backBtn: { marginBottom: 20 },
  backText: { color: "rgba(255,255,255,0.75)", fontSize: 16, fontWeight: "600" },
  heroEyebrow: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 },
  heroTitle: { color: "#ffffff", fontSize: 72, fontWeight: "900", letterSpacing: -2, lineHeight: 76 },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: "500", marginTop: 4 },
  hubChip: { marginTop: 14, alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6 },
  hubChipText: { color: "#99f6e4", fontSize: 12, fontWeight: "700" },

  streakCard: { flexDirection: "row", backgroundColor: "#fff", marginHorizontal: 16,
    marginTop: -16, borderRadius: 16, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  streakItem: { flex: 1, alignItems: "center" },
  streakDivider: { width: 1, backgroundColor: "#f1f5f9", marginVertical: 4 },
  streakValue: { fontSize: 36, fontWeight: "900", color: "#0f172a", letterSpacing: -1 },
  streakLabel: { fontSize: 13, fontWeight: "700", color: "#0f172a", marginTop: 2 },
  streakSub: { fontSize: 11, color: "#94a3b8", fontWeight: "500" },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8",
    letterSpacing: 0.8, textTransform: "uppercase",
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10 },

  periodGrid: { flexDirection: "row", paddingHorizontal: 16, gap: 10 },
  periodCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 16,
    alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  periodRides: { fontSize: 28, fontWeight: "800", color: "#0f172a" },
  periodLabel: { fontSize: 12, color: "#64748b", fontWeight: "600", marginTop: 2 },
  periodPts: { fontSize: 12, color: "#0d9488", fontWeight: "700", marginTop: 4 },

  impactCard: { backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: "#e2e8f0" },
  impactRow: { flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  impactIcon: { fontSize: 22, width: 36 },
  impactLabel: { flex: 1, fontSize: 14, color: "#0f172a", fontWeight: "500" },
  impactValue: { fontSize: 16, fontWeight: "800", color: "#0d9488" },

  missionCard: { margin: 16, backgroundColor: "#f0fdf4", borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: "#bbf7d0" },
  missionTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  missionBody: { fontSize: 13, color: "#475569", lineHeight: 20 },
});
