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
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";

import { getMatchingDemoDriversUrlOrNull, getMatchingSearchUrlOrNull } from "@/lib/backend-api-urls";
import {
  type DriverCard,
  type TravelDirection,
  parseDriverCardsFromApi,
} from "@/lib/matching-drivers";
import { directionFromPoints } from "@/lib/geo-direction";
import { rememberDestination } from "@/lib/recent-destinations";
import { supabase } from "@/lib/supabase";

/**
 * After a leg ends, passenger searches again under the same journey (multi-leg handoff).
 * The journey is registered when the app decides a handoff is needed (Active Trip),
 * or when the passenger explicitly continues. This screen only continues the search.
 */
export default function NextLegRequestScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    journeyId?: string;
    legIndex?: string;
    passengerId?: string;
    destinationDirection?: string;
    destinationLat?: string;
    destinationLng?: string;
    destinationLabel?: string;
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
  const destinationDirection = (() => {
    const raw = typeof params.destinationDirection === "string" ? params.destinationDirection : "";
    return raw === "north" || raw === "south" || raw === "east" || raw === "west"
      ? (raw as TravelDirection)
      : "north";
  })();
  const destinationLat = typeof params.destinationLat === "string" ? params.destinationLat : "";
  const destinationLng = typeof params.destinationLng === "string" ? params.destinationLng : "";
  const destinationLabel = typeof params.destinationLabel === "string" ? params.destinationLabel : "";

  const [computedDirection, setComputedDirection] = useState<TravelDirection>(destinationDirection);
  const [originPoint, setOriginPoint] = useState<{ latitude: number; longitude: number } | null>(null);

  const [isScanning, setIsScanning] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(150);
  const [drivers, setDrivers] = useState<DriverCard[]>([]);

  // Current GPS + route direction toward final destination B (for matching).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) {
          setOriginPoint(null);
          setComputedDirection(destinationDirection);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setOriginPoint({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const lat = Number(destinationLat);
        const lng = Number(destinationLng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
          setComputedDirection(
            directionFromPoints(
              { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
              { latitude: lat, longitude: lng }
            )
          );
        } else {
          setComputedDirection(destinationDirection);
        }
      } catch {
        if (!cancelled) {
          setOriginPoint(null);
          setComputedDirection(destinationDirection);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinationDirection, destinationLat, destinationLng]);

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
      const searchUrl = getMatchingSearchUrlOrNull();
      const demoUrl = getMatchingDemoDriversUrlOrNull();
      let urlToUse = demoUrl;
      if (searchUrl && originPoint) {
        urlToUse = `${searchUrl}?originLat=${encodeURIComponent(String(originPoint.latitude))}&originLng=${encodeURIComponent(String(originPoint.longitude))}&destinationDirection=${encodeURIComponent(computedDirection)}`;
        if (destinationLat && destinationLng && destinationLat !== "0" && destinationLng !== "0") {
          urlToUse += `&destinationLat=${encodeURIComponent(destinationLat)}&destinationLng=${encodeURIComponent(destinationLng)}`;
        }
      }
      if (!urlToUse) return;

      const accessToken = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : undefined;

      try {
        let resolvedFromLive = Boolean(searchUrl && originPoint && urlToUse.startsWith(searchUrl));
        let response = await fetch(urlToUse, {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });
        if (cancelled) return;
        if (!response.ok && resolvedFromLive && demoUrl) {
          resolvedFromLive = false;
          response = await fetch(demoUrl, {
            headers: {
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
          });
        }
        if (cancelled || !response.ok) return;
        const data: unknown = await response.json();
        const parsed = parseDriverCardsFromApi(data);
        if (parsed === null || cancelled) return;
        const filtered = parsed.filter((d) => d.headingDirection === computedDirection);
        const nextList = filtered.length > 0 ? filtered : parsed;
        setDrivers(
          nextList.length > 0 ? nextList : []
        );
      } catch {
        /* keep fallback */
      }
    }

    loadMatchingList();
    return () => {
      cancelled = true;
    };
  }, [isScanning, computedDirection, originPoint]);

  const countdownText = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  if (!journeyId || !passengerId) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t("nextLegTitle", "Next leg")}</Text>
        <Text style={styles.timerText}>{t("missingJourneyDetails", "Missing journey details. Open Ride Request to start a trip.")}</Text>
        <Link href="/(tabs)" style={styles.cancelLink}>
          {t("home", "Home")}
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
            {item.tier} · {item.etaMinutes} {t("min", "min")} · {item.distanceMiles} {t("miAway", "mi away")}
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
              {isZeroDetour ? t("alreadyHeadingYourWay") : t("willingToDetour")}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => {
            const lat = Number(destinationLat);
            const lng = Number(destinationLng);
            if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
              const label =
                destinationLabel.trim() ||
                `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
              void rememberDestination({ label, latitude: lat, longitude: lng });
            }
            router.push({
              pathname: "/active-trip",
              params: {
                journeyId,
                legIndex,
                driverId: item.id,
                driverName: item.name,
                passengerId,
                destinationDirection: computedDirection,
                ...(destinationLat ? { destinationLat } : {}),
                ...(destinationLng ? { destinationLng } : {}),
                ...(destinationLabel ? { destinationLabel } : {}),
                wasZeroDetour: item.intent === "already_going" ? "true" : "false",
              },
            });
          }}
          style={styles.requestButton}
        >
          <Text style={styles.requestButtonText}>{t("continueWithDriver", "Continue with this driver")}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("nextLegTitle", "Next leg")}</Text>
        <Text style={styles.legHint}>{t("sameTripLeg", "Same trip · leg {{legIndex}}", { legIndex })}</Text>
        <Text style={styles.dirHint}>
          {t("destinationLabel", "Destination: {{dest}}", { dest: destinationLabel ? destinationLabel : `${destinationLat || "?"}, ${destinationLng || "?"}` })}
        </Text>
        <Text style={styles.dirHint}>
          {t("routeDirection", "Route direction (this leg): {{dir}}", { dir: computedDirection[0].toUpperCase() + computedDirection.slice(1) })}
        </Text>
        {!isScanning ? (
          <Text style={styles.timerText}>
            {t("searchingRemaining", "Searching... ({{time}} remaining)", { time: countdownText })}
          </Text>
        ) : null}
      </View>

      {isScanning ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.scanningTitle}>{t("findingNextDriver", "Finding your next driver…")}</Text>
          <Text style={styles.scanningSubtitle}>
            {t("matchingDriversHeading", "We are matching drivers heading toward your destination direction.")}
          </Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.centerBlock}>
          <Text style={styles.emptyTitle}>{t("noDriversAvailableNow", "No drivers available right now")}</Text>
          <Text style={styles.emptySubtitle}>{t("tryAgainInAMoment", "Try again in a moment.")}</Text>
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
        {t("cancel")}
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
    fontSize: 14,
    color: "#0f766e",
    fontWeight: "600",
  },
  dirHint: {
    marginTop: 3,
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    lineHeight: 18,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  requestButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  cancelLink: {
    marginTop: 10,
    textAlign: "center",
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
});
