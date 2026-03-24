import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { hasSupabaseEnv, supabase } from "@/lib/supabase";

type EventItem = {
  id: string;
  label: string;
  value: number;
};

export default function PointsScreen() {
  const params = useLocalSearchParams<{ earned?: string; role?: string }>();
  const earnedValue = Number(params.earned ?? "0");
  const earnedPoints = Number.isFinite(earnedValue) ? earnedValue : 0;
  const userRole = params.role === "passenger" ? "passenger" : "driver";
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"local" | "supabase">("local");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentTier, setCurrentTier] = useState("Helper");
  const [totalPoints, setTotalPoints] = useState(earnedPoints);
  const [lastTripReward, setLastTripReward] = useState(earnedPoints);
  const [pointEvents, setPointEvents] = useState<EventItem[]>([
    { id: "1", label: "Ride completed", value: 10 },
    ...(earnedPoints >= 15 ? [{ id: "2", label: "5-star bonus", value: 5 }] : []),
  ]);
  const nextTierTarget = 100;
  const progressPercent = Math.min((totalPoints / nextTierTarget) * 100, 100);

  const demoDriverId = process.env.EXPO_PUBLIC_DEMO_DRIVER_ID;
  const driverIdToQuery = sessionUserId ?? demoDriverId ?? null;

  useEffect(() => {
    const loadSession = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      setSessionUserId(data.session?.user.id ?? null);
    };

    loadSession();

    if (!supabase) return;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user.id ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    if (!supabase) return;
    if (!email || !password) {
      Alert.alert("Missing fields", "Enter your email and password.");
      return;
    }

    setIsAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsAuthLoading(false);

    if (error) {
      Alert.alert("Sign in failed", error.message);
      return;
    }

    Alert.alert("Signed in", "You can now read your live points.");
  };

  useEffect(() => {
    const loadPoints = async () => {
      if (!hasSupabaseEnv || !supabase || !driverIdToQuery) {
        setDataSource("local");
        return;
      }

      setIsLoading(true);
      try {
        const { data: pointsRow } = await supabase
          .from("points")
          .select("total_points,tier")
          .eq("driver_id", driverIdToQuery)
          .maybeSingle();

        const { data: eventsRows, error: eventsError } = await supabase
          .from("point_events")
          .select("id,action,points_change")
          .eq("driver_id", driverIdToQuery)
          .order("created_at", { ascending: false })
          .limit(10);

        if (pointsRow) {
          setTotalPoints(pointsRow.total_points ?? earnedPoints);
          setCurrentTier(pointsRow.tier ?? "Helper");
          setDataSource("supabase");
        }

        if (eventsRows && eventsRows.length > 0) {
          const mapped = eventsRows.map((row) => ({
            id: row.id,
            label: String(row.action).replaceAll("_", " "),
            value: row.points_change,
          }));
          setPointEvents(mapped);
          // Last trip reward = sum of positive events returned for latest trip seed data.
          const positiveSum = mapped.reduce(
            (acc, item) => (item.value > 0 ? acc + item.value : acc),
            0
          );
          setLastTripReward(positiveSum);
        }
        if (!eventsError && (!eventsRows || eventsRows.length === 0)) {
          setLastTripReward(earnedPoints);
        }
      } catch {
        setDataSource("local");
        setLastTripReward(earnedPoints);
      } finally {
        setIsLoading(false);
      }
    };

    loadPoints();
  }, [driverIdToQuery, earnedPoints]);

  const headerSubtitle = useMemo(() => {
    if (isLoading) return "Loading points...";
    if (!sessionUserId && hasSupabaseEnv) return "Sign in to load live points";
    return dataSource === "supabase"
      ? "Live points from Supabase"
      : "Starter local points screen (no database yet)";
  }, [dataSource, isLoading, sessionUserId]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Points</Text>
      <Text style={styles.subtitle}>{headerSubtitle}</Text>

      {isLoading ? <ActivityIndicator color="#2563eb" style={styles.loader} /> : null}

      {!sessionUserId && hasSupabaseEnv ? (
        <View style={styles.authCard}>
          <Text style={styles.authTitle}>Secure Sign In (Driver)</Text>
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />
          <Pressable onPress={handleSignIn} style={styles.signInButton}>
            <Text style={styles.signInButtonText}>
              {isAuthLoading ? "Signing in..." : "Sign In to Load Live Points"}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
        <Text style={styles.reward}>+{lastTripReward} points</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {totalPoints}/{nextTierTarget} to Good Samaritan
        </Text>

        <Text style={[styles.label, styles.labelTop]}>
          Point History ({dataSource === "supabase" ? "Supabase" : "Local"})
        </Text>
        <View style={styles.historyWrap}>
          {pointEvents.map((event) => (
            <View key={event.id} style={styles.historyRow}>
              <Text style={styles.historyLabel}>{event.label}</Text>
              <Text style={styles.historyValue}>
                {event.value > 0 ? "+" : ""}
                {event.value}
              </Text>
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
  loader: {
    marginTop: 10,
  },
  authCard: {
    marginTop: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  authTitle: {
    color: "#1f2a44",
    fontWeight: "700",
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#1f2a44",
    backgroundColor: "#ffffff",
  },
  signInButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  signInButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
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
