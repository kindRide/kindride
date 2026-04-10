import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import {
  getMatchingDemoDriversUrlOrNull,
  getMatchingSearchUrlOrNull,
  getRideStatusUrlOrNull,
  getRidesCancelPendingUrlOrNull,
  getRidesRequestDriverUrlOrNull,
  getRidesStartSearchUrlOrNull,
} from "@/lib/backend-api-urls";
import {
  type DriverCard,
  type TravelDirection,
  parseDriverCardsFromApi,
} from "@/lib/matching-drivers";
import { directionFromPoints } from "@/lib/geo-direction";
import {
  computeNeedsHandoffForTrip,
  pickDriverBForDirection,
  shouldUseMultiLeg,
} from "@/lib/multileg-decision";
import { getMultiLegConsent, setMultiLegConsent, shouldRandomlyReaskConsent } from "@/lib/multileg-consent";
import { getMultiLegFeatureEnabled, getMultiLegStyle } from "@/lib/multileg-preference";
import {
  getRecentDestinations,
  rememberDestination,
  type RecentDestination,
} from "@/lib/recent-destinations";
import { createJourneyId } from "@/lib/journey-id";
import { rideInviteQrValue } from "@/lib/parse-ride-id-from-qr";
import { getRoadRouteSummary } from "@/lib/road-route";
import { supabase } from "@/lib/supabase";

/** Real auth driver ids from `driver_presence` / matching API are UUIDs; embedded demo catalog uses small strings. */
function isAuthUserUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

/** Background driver search: easy on battery; interval is time between checks, not the first check. */
const BACKGROUND_POLL_FIRST_MS = 35_000;
const BACKGROUND_POLL_INTERVAL_MS = 5 * 60_000;
/** Stop endless polling on this screen; user can tap "Search again now" to start a new session. */
/** Automatic re-checks at a 5-minute cadence after the first (~35s) poll. */
const BACKGROUND_POLL_MAX_SESSION_MS = 40 * 60_000;

type MatchingFeed = "idle" | "loading" | "live" | "demo" | "fallback";

export default function RideRequestScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    destinationLat?: string;
    destinationLng?: string;
    destinationLabel?: string;
  }>();
  const [isScanning, setIsScanning] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(150); // 2:30
  const [drivers, setDrivers] = useState<DriverCard[]>([]);
  const [destinationDirection, setDestinationDirection] = useState<TravelDirection>("north");
  const [routeMiles, setRouteMiles] = useState<number | null>(null);
  const [routeNote, setRouteNote] = useState<string>("");
  const [driverRequestStatus, setDriverRequestStatus] = useState<string>("");
  const [driverRequestInFlight, setDriverRequestInFlight] = useState<boolean>(false);
  const [driverStartSearchError, setDriverStartSearchError] = useState<string | null>(null);
  const [originPoint, setOriginPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const [matchingFeed, setMatchingFeed] = useState<MatchingFeed>("idle");
  const [matchingFeedError, setMatchingFeedError] = useState<string | null>(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  /** Set on manual refresh so empty-state retries give visible feedback (live search often returns []). */
  const [manualRefreshHint, setManualRefreshHint] = useState<string | null>(null);
  /** Updated by silent background polls (no full-screen loading). */
  const [backgroundPollNote, setBackgroundPollNote] = useState<string | null>(null);
  /** After max session length, we stop auto-polling until the user taps search again (battery UX). */
  const [backgroundAutoPaused, setBackgroundAutoPaused] = useState(false);
  const emptySearchSessionRef = useRef<{ key: string; startedAt: number } | null>(null);
  const widenedNotifiedRef = useRef(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  /** One id per visit to this screen: binds `rides/start-search`, `request-driver`, and Active Trip completion. */
  const [sessionRideId] = useState(() => createJourneyId());

  useEffect(() => {
    const sub = AppState.addEventListener("change", setAppState);
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const list = await getRecentDestinations();
        if (!cancelled) setRecents(list);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );
  const destination = useMemo(() => {
    const latRaw = typeof params.destinationLat === "string" ? params.destinationLat.trim() : "";
    const lngRaw = typeof params.destinationLng === "string" ? params.destinationLng.trim() : "";
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const label =
      typeof params.destinationLabel === "string" && params.destinationLabel.length > 0
        ? params.destinationLabel
        : "";
    if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Treat the common "unset" coordinate as no destination.
    if (lat === 0 && lng === 0) return null;
    return {
      latitude: lat,
      longitude: lng,
      label: label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    };
  }, [params.destinationLat, params.destinationLng, params.destinationLabel]);

  useEffect(() => {
    let cancelled = false;
    async function computeRoute() {
      if (!destination) {
        setRouteMiles(null);
        setRouteNote("");
        return;
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setRouteMiles(null);
          setRouteNote(t("enableLocationToEstimateRoute"));
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setOriginPoint({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const computedDir = directionFromPoints(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
          { latitude: destination.latitude, longitude: destination.longitude }
        );
        setDestinationDirection(computedDir);
        const summary = await getRoadRouteSummary(
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
          { latitude: destination.latitude, longitude: destination.longitude }
        );
        if (cancelled) return;
        setRouteMiles(summary.distanceMiles);
        setRouteNote(
          summary.source === "google_directions"
            ? t("roadRouteEstimate", { miles: summary.distanceMiles })
            : t("distanceEstimate", { miles: summary.distanceMiles })
        );
      } catch {
        if (!cancelled) {
          setRouteMiles(null);
          setRouteNote("");
        }
      }
    }
    computeRoute();
    return () => {
      cancelled = true;
    };
  }, [destination, t]);

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

  const loadMatchingList = useCallback(
    async (opts?: { signal?: AbortSignal; manual?: boolean; background?: boolean }) => {
      const signal = opts?.signal;
      const isManual = Boolean(opts?.manual);
      const isBackground = Boolean(opts?.background);
      if (isManual) {
        setManualRefreshHint(null);
        setBackgroundPollNote(null);
        setBackgroundAutoPaused(false);
        const sk =
          originPoint != null
            ? `${originPoint.latitude},${originPoint.longitude},${destinationDirection}`
            : "";
        if (sk) {
          emptySearchSessionRef.current = { key: sk, startedAt: Date.now() };
        }
        setListRefreshing(true);
        setMatchingFeed("loading");
        widenedNotifiedRef.current = false;
      } else if (isBackground) {
        setMatchingFeedError(null);
        // Silent poll: keep current feed label; no pull-to-refresh spinner.
      } else if (!signal?.aborted) {
        setMatchingFeed("loading");
      }

      const accessToken = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : undefined;
        
      const sess = emptySearchSessionRef.current;
      const elapsedMinutes = sess ? (Date.now() - sess.startedAt) / 60000 : 0;
      // Widen the radius from 5km to 15km if we have been searching for >= 5 minutes
      const searchRadius = elapsedMinutes >= 5 ? 15000 : 5000;

      try {
        const searchUrl = getMatchingSearchUrlOrNull();
        const demoUrl = getMatchingDemoDriversUrlOrNull();
        let urlToUse = demoUrl;
        if (searchUrl && originPoint) {
          urlToUse = `${searchUrl}?originLat=${encodeURIComponent(String(originPoint.latitude))}&originLng=${encodeURIComponent(String(originPoint.longitude))}&destinationDirection=${encodeURIComponent(destinationDirection)}&radiusMeters=${searchRadius}`;
          if (destination) {
            urlToUse += `&destinationLat=${encodeURIComponent(String(destination.latitude))}&destinationLng=${encodeURIComponent(String(destination.longitude))}`;
          }
        }
        if (!urlToUse) {
          if (!signal?.aborted) setMatchingFeed("fallback");
          if (isManual || !isBackground) {
            setManualRefreshHint(t("pointsApiMissing"));
          }
          if (isBackground) {
            setBackgroundPollNote(null);
          }
          return;
        }

        const response = await fetch(urlToUse, {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          signal,
        });
        if (signal?.aborted) return;
        if (!response.ok) {
          setMatchingFeed("fallback");
          const detail = (await response.text().catch(() => "")).trim().slice(0, 200);
          if (isManual) {
            setManualRefreshHint(
              t("searchFailedWithStatus", {
                status: response.status,
                detail: detail ? detail.replace(/\s+/g, " ").trim() : t("checkBackend"),
              })
            );
          } else if (!isBackground) {
            setMatchingFeedError(
              t("liveSearchFailedStatusDetail", {
                status: response.status,
                detail: detail || t("checkBackendServer"),
              })
            );
          }
          if (isBackground) {
            setBackgroundPollNote(
              t("backgroundCheckFailed", { status: response.status })
            );
          }
          return;
        }
        const data: unknown = await response.json();
        if (signal?.aborted) return;
        const parsed = parseDriverCardsFromApi(data);
        if (parsed === null) {
          if (!signal?.aborted) setMatchingFeed("fallback");
          if (isManual) {
            setManualRefreshHint(t("invalidServerResponse"));
          }
          if (isBackground) {
            setBackgroundPollNote(t("couldNotReadSearchResults"));
          }
          return;
        }
        setDrivers(parsed);
        setMatchingFeedError(null);
        const usedLiveSearch = Boolean(searchUrl && originPoint && urlToUse.startsWith(searchUrl));
        setMatchingFeed(usedLiveSearch ? "live" : "demo");
        const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (isManual) {
          if (parsed.length === 0 && usedLiveSearch) {
            setManualRefreshHint(
              t("updatedStillNoDriversHeading", {
                timestamp,
                direction: destinationDirection,
              })
            );
          } else {
            setManualRefreshHint(t("updatedDriverCount", { timestamp, count: parsed.length }));
          }
        }
        if (isBackground) {
          if (parsed.length > 0) {
            setBackgroundPollNote(t("foundDriversAtTime", { count: parsed.length, timestamp }));
          } else if (usedLiveSearch) {
            setBackgroundPollNote(t("stillNoMatchLastChecked", { timestamp }));
          } else {
            setBackgroundPollNote(t("checkedDemoListEmptyAt", { timestamp }));
          }
        }
      } catch (e) {
        if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) return;
        setMatchingFeed("fallback");
        if (!isBackground) {
          setMatchingFeedError(e instanceof Error ? e.message : t("networkErrorDuringSearch"));
        } else if (isManual) {
          setManualRefreshHint(e instanceof Error ? e.message : t("networkErrorDuringSearch"));
        }
        if (isBackground) {
          setBackgroundPollNote(t("networkHiccupRetry"));
        }
      } finally {
        if (!isBackground) {
          setListRefreshing(false);
        }
      }
    },
    [originPoint, destinationDirection, destination, t]
  );

  useEffect(() => {
    if (isScanning) return;

    const ac = new AbortController();
    loadMatchingList({ signal: ac.signal });
    return () => ac.abort();
  }, [isScanning, loadMatchingList]);

  /**
   * Create/update the `rides` row as soon as destination + pickup exist and the passenger is signed in.
   * Without this, `sessionRideId` is visible in the UI but `GET /rides/status/{id}` returns 404 until
   * "Request Ride" runs — drivers polling Incoming ride would see no row.
   */
  useEffect(() => {
    if (!destination || !originPoint) return;
    const startUrl = getRidesStartSearchUrlOrNull();
    if (!startUrl || !supabase) {
      setDriverStartSearchError(t("startSearchUrlMissing"));
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;
      try {
        setDriverStartSearchError(null);
        const r = await fetch(startUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rideId: sessionRideId,
            pickupLat: originPoint.latitude,
            pickupLng: originPoint.longitude,
            destinationLat: destination.latitude,
            destinationLng: destination.longitude,
            destinationLabel: destination.label,
          }),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          setDriverStartSearchError(
            t("startSearchFailed", { status: r.status, details: txt.slice(0, 200) })
          );
          if (__DEV__) {
            console.warn("[ride-request] start-search failed:", r.status, txt.slice(0, 200));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network request failed";
        setDriverStartSearchError(t("startSearchNetworkError", { message: msg }));
        if (__DEV__) console.warn("[ride-request] start-search error:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destination, originPoint, sessionRideId, t]);

  /**
   * While live search returns no drivers: gentle background polling on a long interval.
   * Pauses when app is backgrounded (saves battery) and stops after max session unless user taps search again.
   */
  useEffect(() => {
    if (drivers.length > 0) {
      setBackgroundPollNote(null);
      setBackgroundAutoPaused(false);
      emptySearchSessionRef.current = null;
      return;
    }
    if (appState !== "active") {
      return;
    }
    if (backgroundAutoPaused) {
      return;
    }
    if (isScanning || matchingFeed === "loading" || matchingFeed === "idle") {
      return;
    }
    const searchUrl = getMatchingSearchUrlOrNull();
    if (!searchUrl || !originPoint) {
      return;
    }
    if (matchingFeed !== "live" && matchingFeed !== "fallback") {
      return;
    }

    const sessionKey = `${originPoint.latitude},${originPoint.longitude},${destinationDirection}`;
    if (emptySearchSessionRef.current?.key !== sessionKey) {
      emptySearchSessionRef.current = { key: sessionKey, startedAt: Date.now() };
      setBackgroundAutoPaused(false);
    }

    const run = () => {
      if (AppState.currentState !== "active") return;
      const sess = emptySearchSessionRef.current;
      if (!sess || sess.key !== sessionKey) return;
      
      const elapsedMs = Date.now() - sess.startedAt;

      if (elapsedMs >= 15 * 60_000 && !backgroundAutoPaused) {
        setBackgroundAutoPaused(true);
        setBackgroundPollNote(
          t("longWaitBackgroundNote")
        );
        Alert.alert(
          t("longWaitTitle"),
          t("longWaitBody"),
          [
            { text: t("adjustDestination"), onPress: () => router.push("/destination-picker") },
            { text: t("keepWaiting"), style: "cancel" }
          ]
        );
        return;
      }

      if (elapsedMs >= 5 * 60_000 && !widenedNotifiedRef.current) {
        widenedNotifiedRef.current = true;
        Alert.alert(
          t("searchExpandedTitle"),
          t("searchExpandedBody")
        );
      }

      if (elapsedMs >= BACKGROUND_POLL_MAX_SESSION_MS) {
        setBackgroundAutoPaused(true);
        setBackgroundPollNote(
          t("backgroundChecksPausedLongStretch")
        );
        return;
      }
      void loadMatchingList({ background: true });
    };

    const firstId = setTimeout(run, BACKGROUND_POLL_FIRST_MS);
    const intervalId = setInterval(run, BACKGROUND_POLL_INTERVAL_MS);
    return () => {
      clearTimeout(firstId);
      clearInterval(intervalId);
    };
  }, [
    appState,
    backgroundAutoPaused,
    isScanning,
    drivers.length,
    matchingFeed,
    originPoint,
    destinationDirection,
    loadMatchingList,
  ]);

  const countdownText = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  const matchingFeedHint = useMemo(() => {
    switch (matchingFeed) {
      case "loading":
        return t("matchingFeedUpdating");
      case "live":
        return t("matchingFeedLive");
      case "demo":
        return originPoint
          ? t("matchingFeedDemoOrigin")
          : t("matchingFeedDemoNoOrigin");
      case "fallback":
        return t("matchingFeedFallback");
      default:
        return "";
    }
  }, [matchingFeed, originPoint, t]);

  /**
   * When the driver card id is a real Supabase user UUID and the backend is configured,
   * register the ride, request that driver, poll until accept — otherwise no-op (returns true).
   */
  const runFormalAcceptanceFlow = useCallback(
    async (
      firstChoice: DriverCard,
      accessToken: string | undefined,
      dest: { latitude: number; longitude: number; label: string }
    ): Promise<{ success: boolean; assignedDriver?: DriverCard }> => {
      try {
        const formalApplicable =
          isAuthUserUuid(firstChoice.id) &&
          Boolean(accessToken) &&
          Boolean(getRidesRequestDriverUrlOrNull()) &&
          Boolean(getRidesStartSearchUrlOrNull());
        if (!formalApplicable) {
          return { success: true, assignedDriver: firstChoice };
        }

        let originForServer = originPoint;
        if (!originForServer) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === "granted") {
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              originForServer = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
              setOriginPoint(originForServer);
            }
          } catch {
            originForServer = null;
          }
        }
        if (!originForServer) {
          Alert.alert(t("locationNeeded"), t("locationNeededBody"));
          return { success: false };
        }

        const startUrl = getRidesStartSearchUrlOrNull();
        if (!startUrl) {
          setDriverRequestStatus(t("startSearchUrlMissing"));
          return { success: false };
        }

        let startResp: Response;
        try {
          startResp = await fetch(startUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              rideId: sessionRideId,
              pickupLat: originForServer.latitude,
              pickupLng: originForServer.longitude,
              destinationLat: dest.latitude,
              destinationLng: dest.longitude,
              destinationLabel: dest.label,
            }),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Network request failed";
          setDriverRequestStatus(t("startSearchNetworkError", { message: msg }));
          return { success: false };
        }

        if (!startResp.ok) {
          const errTxt = await startResp.text().catch(() => "");
          Alert.alert(
            t("cannotStartRideSession"),
            errTxt.slice(0, 400) || t("rideSessionNotes")
          );
          return { success: false };
        }

        const reqUrl = getRidesRequestDriverUrlOrNull();
        const cancelUrl = getRidesCancelPendingUrlOrNull();
        if (!reqUrl) {
          setDriverRequestStatus(t("requestDriverUrlMissing"));
          return { success: false };
        }

        const doRequestDriver = (driverId: string) =>
          fetch(reqUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ rideId: sessionRideId, driverId }),
          });

        const candidates = [
          firstChoice,
          ...drivers.filter((d) => d.id !== firstChoice.id && isAuthUserUuid(d.id)),
        ];

        for (const candidate of candidates) {
          setDriverRequestStatus(t("requestingDriverWithName", { name: candidate.name }));
          setDriverRequestInFlight(true);

          if (candidate.id !== firstChoice.id && cancelUrl && accessToken) {
            await fetch(cancelUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ rideId: sessionRideId }),
            }).catch(() => {});
          }

          let reqResp: Response;
          try {
            reqResp = await doRequestDriver(candidate.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Network request failed";
            setDriverRequestStatus(t("requestDriverNetworkError", { message: msg }));
            if (candidate.id === firstChoice.id) {
              setDriverRequestInFlight(false);
              return { success: false };
            }
            setDriverRequestInFlight(false);
            continue;
          }

          if (reqResp.status === 409 && cancelUrl) {
            await fetch(cancelUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ rideId: sessionRideId }),
            }).catch(() => {});
            try {
              reqResp = await doRequestDriver(candidate.id);
            } catch {
              // Retry already failed; continue to next candidate
            }
          }

          if (!reqResp.ok) {
            const errBody = await reqResp.text().catch(() => "");
            if (candidate.id === firstChoice.id) {
              setDriverRequestStatus(t("requestFailedForSelectedDriver"));
              setDriverRequestInFlight(false);
              Alert.alert(
                t("requestFailed"),
                errBody.includes("Already waiting")
                  ? `${errBody}\n\n${t("requestFailedRetryTip")}`
                  : errBody
              );
              return { success: false };
            }
            setDriverRequestInFlight(false);
            continue;
          }

          const statusUrl = getRideStatusUrlOrNull(sessionRideId);
          if (!statusUrl) {
            setDriverRequestStatus(t("rideStatusUrlMissing"));
            setDriverRequestInFlight(false);
            return { success: false };
          }

          const deadline = Date.now() + 70_000;
          let acceptanceFound = false;
          while (Date.now() < deadline && !acceptanceFound) {
            await new Promise((res) => setTimeout(res, 2000));
            try {
              const sr = await fetch(statusUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (!sr.ok) {
                // Network issue on status poll; retry
                continue;
              }
              const st = (await sr.json()) as { status?: string };
              if (st.status === "accepted") {
                setDriverRequestStatus(t("acceptedByDriver", { name: candidate.name }));
                setDriverRequestInFlight(false);
                return { success: true, assignedDriver: candidate };
              }
              if (
                st.status === "searching" ||
                st.status === "declined" ||
                st.status === "expired"
              ) {
                setDriverRequestStatus(t("noResponseThenTryNext", { name: candidate.name }));
                acceptanceFound = false;
                break;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Network request failed";
              setDriverRequestStatus(t("statusPollNetworkError", { message: msg }));
              // Continue polling; transient network errors are expected
              continue;
            }
          }
          setDriverRequestInFlight(false);
        }

        setDriverRequestStatus(t("noDriverAccepted"));
        setDriverRequestInFlight(false);
        Alert.alert(
          t("waitingForDriver"),
          `${t("waitingForDriverHint")}\n\n• ${t("expoPushHint")}\n• ${t("driverOpenIncomingRide", { rideId: sessionRideId })}\n\n${t("retryRequestRide")}`
        );
        return { success: false };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network request failed";
        setDriverRequestStatus(t("rideRequestFlowError", { message: msg }));
        setDriverRequestInFlight(false);
        Alert.alert(t("requestFailed"), msg);
        return { success: false };
      }
    },
    [originPoint, sessionRideId, drivers, t]
  );

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
          <Text style={styles.metaText}>
            {t("heading")}: {item.headingDirection[0].toUpperCase() + item.headingDirection.slice(1)}
          </Text>
          {typeof item.matchScore === "number" ? (
            <Text style={styles.metaText}>{t("matchScore", { score: (item.matchScore * 100).toFixed(0) })}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            {item.isFoundingDriver ? (
              <View style={styles.foundingBadge}>
                <Text style={styles.foundingBadgeText}>⭐ {t("foundingDriver")}</Text>
              </View>
            ) : null}
            {item.idVerified ? (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>✓ {t("verified")}</Text>
              </View>
            ) : null}
          </View>
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
          onPress={async () => {
            if (!destination) {
              Alert.alert(
                t("destinationRequired"),
                t("destinationRequiredBody")
              );
              return;
            }
            let passengerId = "";
            if (supabase) {
              const { data } = await supabase.auth.getSession();
              passengerId = data.session?.user?.id ?? "";
            }
            if (!passengerId) {
              Alert.alert("Sign In Required", "Please sign in to request a ride.");
              return;
            }

            // Compute route direction from pickup (current GPS) to destination pin.
            let computedDirection: TravelDirection = destinationDirection;
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === "granted") {
                const loc = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                });
                computedDirection = directionFromPoints(
                  { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
                  { latitude: destination.latitude, longitude: destination.longitude }
                );
                setDestinationDirection(computedDirection);
              }
            } catch {
              // Keep latest known direction fallback.
            }

            const multiLegOn = await getMultiLegFeatureEnabled();
            const multiLegStyle = await getMultiLegStyle();
            let needsHandoff = false;
            if (multiLegOn) {
              if (multiLegStyle === "sooner") {
                needsHandoff = shouldUseMultiLeg(item, computedDirection, routeMiles);
              } else {
                needsHandoff = computeNeedsHandoffForTrip(drivers, computedDirection, routeMiles);
              }
            }

            // Try to pre-pair Driver B immediately at first pairing.
            const driverB = needsHandoff
              ? pickDriverBForDirection(drivers, item.id, computedDirection)
              : null;
            const effectiveDriverB = driverB;

            // Only ask for consent when:
            // - multi-leg seems needed AND
            // - we cannot pre-pair a next driver (Driver B) at pairing time.
            if (needsHandoff && !effectiveDriverB) {
              const alreadyConsented = await getMultiLegConsent();
              const shouldAsk = !alreadyConsented || shouldRandomlyReaskConsent();
              if (shouldAsk) {
                const message =
                  t("multiLegConsentMessage");
                const allow = await new Promise<boolean>((resolve) => {
                  Alert.alert(t("multiLegHandoffTitle"), message, [
                    { text: t("no"), style: "cancel", onPress: () => resolve(false) },
                    { text: t("yesAllow"), onPress: () => resolve(true) },
                  ]);
                });
                if (!allow) {
                  const accessTokenEarly = supabase
                    ? (await supabase.auth.getSession()).data.session?.access_token
                    : undefined;
                  if (!(await runFormalAcceptanceFlow(item, accessTokenEarly, destination))) {
                    return;
                  }
                  // Proceed as single-leg only (no background handoff search).
                  router.push({
                    pathname: "/active-trip",
                    params: {
                      rideId: sessionRideId,
                      driverId: item.id,
                      driverName: item.name,
                      wasZeroDetour: item.intent === "already_going" ? "true" : "false",
                      needsHandoff: "false",
                      destinationDirection: computedDirection,
                      destinationLat: String(destination.latitude),
                      destinationLng: String(destination.longitude),
                      destinationLabel: destination.label,
                      ...(passengerId ? { passengerId } : {}),
                    },
                  });
                  return;
                }
                await setMultiLegConsent(true);
              }
            }

            void rememberDestination({
              label: destination.label,
              latitude: destination.latitude,
              longitude: destination.longitude,
            });

            const accessToken = supabase
              ? (await supabase.auth.getSession()).data.session?.access_token
              : undefined;
            const acceptanceResult = await runFormalAcceptanceFlow(item, accessToken, destination);
            if (!acceptanceResult.success) {
              return;
            }
            const acceptedDriver = acceptanceResult.assignedDriver ?? item;

            router.push({
              pathname: "/active-trip",
              params: {
                rideId: sessionRideId,
                driverId: acceptedDriver.id,
                driverName: acceptedDriver.name,
                wasZeroDetour: acceptedDriver.intent === "already_going" ? "true" : "false",
                needsHandoff: needsHandoff ? "true" : "false",
                destinationDirection: computedDirection,
                destinationLat: String(destination.latitude),
                destinationLng: String(destination.longitude),
                destinationLabel: destination.label,
                ...(effectiveDriverB
                  ? {
                      preMatchedNextDriverId: effectiveDriverB.id,
                      preMatchedNextDriverName: effectiveDriverB.name,
                      preMatchedNextDriverEtaMinutes: String(effectiveDriverB.etaMinutes),
                      preMatchedNextDriverHeading: effectiveDriverB.headingDirection,
                    }
                  : {}),
                ...(passengerId ? { passengerId } : {}),
              },
            });
          }}
          style={styles.requestButton}
        >
          <Text style={styles.requestButtonText}>{t("requestRide")}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("rideRequest")}</Text>
        <Text style={styles.destinationLabel}>{t("destinationPointB")}</Text>
        {recents.length > 0 ? (
          <View style={styles.recentsSection}>
            <Text style={styles.recentsTitle}>{t("recentDestinations")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsRow}>
              {recents.map((r) => (
                <Pressable
                  key={`${r.latitude},${r.longitude},${r.label}`}
                  style={styles.recentChip}
                  onPress={() => {
                    void rememberDestination({
                      label: r.label,
                      latitude: r.latitude,
                      longitude: r.longitude,
                    });
                    router.setParams({
                      destinationLat: String(r.latitude),
                      destinationLng: String(r.longitude),
                      destinationLabel: r.label,
                    });
                  }}
                >
                  <Text style={styles.recentChipText} numberOfLines={2}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <View style={styles.destinationCard}>
          <Text style={styles.destinationValue}>
            {destination ? destination.label : t("noDestinationSelected")}
          </Text>
          <Text style={styles.destinationSub}>
            {t("routeHeadingUsed", {
              direction: destinationDirection[0].toUpperCase() + destinationDirection.slice(1),
            })}
          </Text>
          {routeNote ? <Text style={styles.destinationSub}>{routeNote}</Text> : null}
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/destination-picker",
                params: destination
                  ? {
                      destinationLat: String(destination.latitude),
                      destinationLng: String(destination.longitude),
                      destinationLabel: destination.label,
                    }
                  : {},
              })
            }
            style={styles.destinationButton}
          >
            <Text style={styles.destinationButtonText}>
              {destination ? t("updateDestinationPin") : t("pickDestinationPin")}
            </Text>
          </Pressable>
          <Text style={styles.sessionRideHint}>
            {t("rideShareHint")}
          </Text>
          <Text style={styles.sessionRideId} selectable>
            {sessionRideId}
          </Text>
          {Platform.OS !== "web" ? (
            <View style={styles.qrBlock}>
              <Text style={styles.qrCaption}>{t("rideQrCaption")}</Text>
              <View style={styles.qrWrap}>
                <QRCode
                  value={rideInviteQrValue(sessionRideId)}
                  size={168}
                  color="#0f172a"
                  backgroundColor="#ffffff"
                />
              </View>
            </View>
          ) : null}
        </View>
        {!isScanning ? (
          <Text style={styles.timerText}>{t("searchingRemaining", { time: countdownText })}</Text>
        ) : null}
        {!isScanning && matchingFeedHint ? <Text style={styles.feedHint}>{matchingFeedHint}</Text> : null}
        {driverStartSearchError ? (
          <Text style={styles.error}>{driverStartSearchError}</Text>
        ) : null}
        {matchingFeedError ? (
          <Text style={styles.error}>{matchingFeedError}</Text>
        ) : null}
        {driverRequestInFlight ? (
          <Text style={styles.driverRequestStatus}> {driverRequestStatus || t("requestingDriver")} </Text>
        ) : driverRequestStatus ? (
          <Text style={styles.driverRequestStatus}>{driverRequestStatus}</Text>
        ) : null}
      </View>

      {isScanning ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.scanningTitle}>{t("scanningDrivers")}</Text>
          <Text style={styles.scanningSubtitle}>{t("scanningDriversSubtitle")}</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.centerBlock}>
          <Text style={styles.emptyTitle}>
            {matchingFeed === "live" ? t("noMatchingDriversNearby") : t("noDriversAvailableNow")}
          </Text>
          <Text style={styles.emptySubtitle}>
            {matchingFeed === "live"
              ? t("liveNoDriversHint")
              : t("noDriversHint")}
          </Text>
          {matchingFeed === "live" && getMatchingSearchUrlOrNull() && originPoint && !backgroundAutoPaused ? (
            <View style={styles.backgroundPollRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.backgroundPollText}>{t("backgroundSearching")}</Text>
            </View>
          ) : null}
          {matchingFeed === "live" && backgroundAutoPaused ? (
            <Text style={styles.backgroundPausedText}>
              {t("backgroundPausedText")}
            </Text>
          ) : null}
          {(matchingFeed === "live" || matchingFeed === "fallback") && (getMatchingSearchUrlOrNull() || getMatchingDemoDriversUrlOrNull()) ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.emptyRefreshBtn, listRefreshing && styles.emptyRefreshBtnDisabled]}
              disabled={listRefreshing}
              onPress={() => void loadMatchingList({ manual: true })}
              accessibilityRole="button"
              accessibilityLabel={t("refreshDriverSearchNow")}
            >
              {listRefreshing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.emptyRefreshBtnText}>{t("searchAgainNow")}</Text>
              )}
            </TouchableOpacity>
          ) : null}
          {backgroundPollNote ? (
            <Text style={styles.manualRefreshHint}>{backgroundPollNote}</Text>
          ) : null}
          {manualRefreshHint ? (
            <Text style={styles.manualRefreshHint}>{manualRefreshHint}</Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item.id}
          renderItem={renderDriverCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={listRefreshing}
              onRefresh={() => loadMatchingList({ manual: true })}
              tintColor="#2563eb"
            />
          }
        />
      )}

      <Pressable
        onPress={async () => {
          const cancelUrl = getRidesCancelPendingUrlOrNull();
          if (cancelUrl && supabase) {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (token) {
              fetch(cancelUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ rideId: sessionRideId }),
              }).catch(() => {});
            }
          }
          router.replace("/(tabs)");
        }}
      >
        <Text style={styles.cancelLink}>{t("cancelAndGoBack")}</Text>
      </Pressable>
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
  timerText: {
    marginTop: 6,
    fontSize: 14,
    color: "#4b587c",
  },
  feedHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
  },
  recentsSection: {
    marginTop: 8,
  },
  recentsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  recentsRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  recentChip: {
    maxWidth: 200,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  recentChipText: {
    fontSize: 13,
    color: "#1d4ed8",
    fontWeight: "600",
  },
  destinationLabel: {
    marginTop: 8,
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
  destinationCard: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 10,
    gap: 8,
  },
  destinationValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2a44",
  },
  destinationSub: {
    fontSize: 12,
    color: "#64748b",
  },
  destinationButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#eff6ff",
  },
  destinationButtonText: {
    fontSize: 12,
    color: "#1d4ed8",
    fontWeight: "700",
  },
  sessionRideHint: {
    marginTop: 14,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 18,
  },
  sessionRideId: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: "monospace",
    color: "#0f172a",
  },
  qrBlock: { marginTop: 14, alignItems: "center" },
  qrCaption: { fontSize: 12, color: "#64748b", marginBottom: 8, textAlign: "center" },
  qrWrap: {
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
  emptyRefreshBtn: {
    marginTop: 16,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  emptyRefreshBtnDisabled: {
    opacity: 0.85,
  },
  emptyRefreshBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  manualRefreshHint: {
    marginTop: 12,
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  backgroundPollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  backgroundPollText: {
    fontSize: 14,
    color: "#334155",
    fontWeight: "600",
  },
  backgroundPausedText: {
    marginTop: 12,
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
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
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 4,
  },
  foundingBadge: {
    backgroundColor: "#fef3c7",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  foundingBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
  },
  verifiedBadge: {
    backgroundColor: "#f0fdf4",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
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
  error: {
    marginTop: 12,
    fontSize: 13,
    color: "#dc2626",
    textAlign: "center",
    lineHeight: 18,
  },
  driverRequestStatus: {
    marginTop: 12,
    fontSize: 13,
    color: "#0369a1",
    textAlign: "center",
    lineHeight: 18,
  },
  cancelLink: {
    marginTop: 10,
    textAlign: "center",
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
});
