import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getMatchingDemoDriversUrlOrNull } from "@/lib/backend-api-urls";
import {
  FALLBACK_DEMO_DRIVERS,
  type DriverCard,
  parseDriverCardsFromApi,
} from "@/lib/matching-drivers";
import { supabase } from "@/lib/supabase";

/**
 * After a leg ends, passenger searches again under the same journey (multi-leg handoff).
 * Does not re-register the journey — that happened on Ride Request.
 */
export default function NextLegRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    journeyId?: string;
    legIndex?: string;
    passengerId?: string;
  }>();

  const journeyId =
    typeof params.journeyId === "string" && params.journeyId.length > 0
      ? params.journeyId
      : "";
  const legIndex =
    typeof params.legIndex === "string" && params.legIndex.length > 0
      ? params.legIndex
      : "1";
  const passengerId =
    typeof params.passengerId === "string" && params.passengerId.length > 0
      ? params.passengerId
      : "";

  const [isScanning, setIsScanning] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(150);
  const [drivers, setDrivers] = useState<DriverCard[]>(FALLBACK_DEMO_DRIVERS);

  useEffect(() => {
    const scanTimer = setTimeout(() => {
      setIsScanning(false);
    }, 2500);

    return () => clearTimeout(scanTimer);
  }, []);

  useEffect(() => {
    if (isScanning) return;

    const countdownTimer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [isScanning]);

  useEffect(() => {
    if (isScanning) return;

    let cancelled = false;
    async function loadMatchingList() {
      const url = getMatchingDemoDriversUrlOrNull();
      if (!url) return;

      const accessToken = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : undefined;

      try {
        const response = await fetch(url, {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });
        if (cancelled || !response.ok) return;
        const data: unknown = await response.json();
        const parsed = parseDriverCardsFromApi(data);
        if (parsed && !cancelled) {
          setDrivers(parsed);
        }
      } catch {
        /* keep fallback */
      }
    }

    loadMatchingList();
    return () => {
      cancelled = true;
    };
  }, [isScanning]);

  const countdownText = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  if (!journeyId || !passengerId) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Next leg</Text>
        <Text style={styles.timerText}>Missing journey details. Open Ride Request to start a trip.</Text>
        <Link href="/(tabs)" style={styles.cancelLink}>
          Home
        </Link>
      </View>
    );
  }

  const renderDriverCard = ({ item }: { item: DriverCard }) => {
    const isZeroDetour = item.intent === "already_going";
    return (
      <View style={styles.card}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {item.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.driverName}>{item.name}</Text>
          <Text style={styles.metaText}>
            {item.tier} · {item.etaMinutes} min · {item.distanceMiles} mi away
          </Text>
          <View
            style={[
              styles.intentBadge,
              isZeroDetour ? styles.intentGood : styles.intentDetour,
            ]}
          >
            <Text
              style={[
                styles.intentBadgeText,
                isZeroDetour ? styles.intentGoodText : styles.intentDetourText,
              ]}
            >
              {isZeroDetour ? "Already heading your way" : "Willing to detour"}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => {
            router.push({
              pathname: "/active-trip",
              params: {
                journeyId,
                legIndex,
                driverId: item.id,
                driverName: item.name,
                passengerId,
                wasZeroDetour: item.intent === "already_going" ? "true" : "false",
              },
            });
          }}
          style={styles.requestButton}
        >
          <Text style={styles.requestButtonText}>Continue with this driver</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Next leg</Text>
        <Text style={styles.legHint}>Same trip · leg {legIndex}</Text>
        {!isScanning ? (
          <Text style={styles.timerText}>Searching... ({countdownText} remaining)</Text>
        ) : null}
      </View>

      {isScanning ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.scanningTitle}>Finding your next driver…</Text>
          <Text style={styles.scanningSubtitle}>
            You can keep your journey open until you reach your final stop.
          </Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.centerBlock}>
          <Text style={styles.emptyTitle}>No drivers available right now</Text>
          <Text style={styles.emptySubtitle}>Try again in a moment.</Text>
        </View>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item.id}
          renderItem={renderDriverCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Link href="/(tabs)" style={styles.cancelLink}>
        Cancel
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8faff",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
  },
  legHint: {
    marginTop: 4,
    fontSize: 15,
    color: "#0f766e",
    fontWeight: "600",
  },
  timerText: {
    marginTop: 6,
    fontSize: 14,
    color: "#4b587c",
  },
  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  scanningTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2a44",
    textAlign: "center",
  },
  scanningSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#4b587c",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1f2a44",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#4b587c",
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 14,
    gap: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6ebf5",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 16,
  },
  cardContent: {
    flex: 1,
    marginHorizontal: 10,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2a44",
  },
  metaText: {
    marginTop: 2,
    fontSize: 13,
    color: "#5f6e94",
  },
  intentBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  intentBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  intentGood: {
    backgroundColor: "#dcfce7",
  },
  intentGoodText: {
    color: "#166534",
  },
  intentDetour: {
    backgroundColor: "#fef3c7",
  },
  intentDetourText: {
    color: "#92400e",
  },
  requestButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  requestButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  cancelLink: {
    marginTop: 10,
    textAlign: "center",
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
});
