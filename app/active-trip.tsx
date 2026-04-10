import { Link, type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import {
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import SessionRecorder from "@/components/session-recorder/SessionRecorder";
import TripSegmentMap from "@/components/trip-segment-map/TripSegmentMap";
import {
  getJourneysRegisterUrlOrNull,
  getMatchingDemoDriversUrlOrNull,
  getMatchingSearchUrlOrNull,
  getPassengerReputationUrlOrNull,
  getRidesCompleteUrlOrNull,
  getRideStatusUrlOrNull,
  getRidesShareTokenUrlOrNull,
} from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { clampLegMilesStraightLine, haversineMiles, type LatLng } from "@/lib/haversine-miles";
import { createJourneyId } from "@/lib/journey-id";
import {
  parseDriverCardsFromApi,
  type DriverCard,
  type TravelDirection,
} from "@/lib/matching-drivers";
import { attestRouteCommitment } from "@/lib/route-commitment";
import { supabase } from "@/lib/supabase";

export default function ActiveTripScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    driverName?: string;
    driverId?: string;
    passengerId?: string;
    journeyId?: string;
    legIndex?: string;
    wasZeroDetour?: string;
    needsHandoff?: string;
    destinationDirection?: string;
    destinationLat?: string;
    destinationLng?: string;
    destinationLabel?: string;
    preMatchedNextDriverId?: string;
    preMatchedNextDriverName?: string;
    preMatchedNextDriverEtaMinutes?: string;
    preMatchedNextDriverHeading?: string;
    rideId?: string;
  }>();
  const driverId = typeof params.driverId === "string" && params.driverId.length > 0 ? params.driverId : "";
  const driverName =
    typeof params.driverName === "string" && params.driverName.length > 0
      ? params.driverName
      : "";
  const passengerId =
    typeof params.passengerId === "string" && params.passengerId.length > 0
      ? params.passengerId
      : undefined;
  const journeyId =
    typeof params.journeyId === "string" && params.journeyId.length > 0
      ? params.journeyId
      : undefined;
  const legIndexNum = (() => {
    const raw = typeof params.legIndex === "string" ? params.legIndex : "1";
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  })();

  const wasZeroDetourFromDriver =
    typeof params.wasZeroDetour === "string" && params.wasZeroDetour.length > 0
      ? params.wasZeroDetour === "true"
      : true;

  const needsHandoff =
    typeof params.needsHandoff === "string" && params.needsHandoff.length > 0
      ? params.needsHandoff === "true"
      : false;
  const destinationDirection = (() => {
    const raw = typeof params.destinationDirection === "string" ? params.destinationDirection : "";
    return raw === "north" || raw === "south" || raw === "east" || raw === "west"
      ? (raw as TravelDirection)
      : "north";
  })();
  const destinationLat = typeof params.destinationLat === "string" ? params.destinationLat : "";
  const destinationLng = typeof params.destinationLng === "string" ? params.destinationLng : "";
  const destinationLabel = typeof params.destinationLabel === "string" ? params.destinationLabel : "";

  const [autoJourneyId, setAutoJourneyId] = useState<string | null>(journeyId ?? null);
  const [autoLegIndex, setAutoLegIndex] = useState<number>(legIndexNum);
  const [nextDriver, setNextDriver] = useState<DriverCard | null>(null);
  const [isSearchingNextDriver, setIsSearchingNextDriver] = useState(false);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [ridePassengerId, setRidePassengerId] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [liveDriverLocation, setLiveDriverLocation] = useState<LatLng | null>(null);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setCurrentUserId(data.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    // If Ride Request pre-matched Driver B, display it immediately.
    if (nextDriver) return;
    const id =
      typeof params.preMatchedNextDriverId === "string" ? params.preMatchedNextDriverId : "";
    const name =
      typeof params.preMatchedNextDriverName === "string" ? params.preMatchedNextDriverName : "";
    const etaRaw =
      typeof params.preMatchedNextDriverEtaMinutes === "string"
        ? params.preMatchedNextDriverEtaMinutes
        : "";
    const etaMinutes = Number(etaRaw);
    if (!id || !name || !Number.isFinite(etaMinutes)) return;
    const headingRaw =
      typeof params.preMatchedNextDriverHeading === "string"
        ? params.preMatchedNextDriverHeading.trim().toLowerCase()
        : "";
    const headingDirection: TravelDirection =
      headingRaw === "north" || headingRaw === "south" || headingRaw === "east" || headingRaw === "west"
        ? headingRaw
        : destinationDirection;
    setNextDriver({
      id,
      name,
      tier: t("helperTier"),
      etaMinutes,
      distanceMiles: 0,
      intent: "already_going",
      headingDirection,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToSearchHref: Href =
    autoJourneyId && passengerId
      ? {
          pathname: "/next-leg-request",
          params: {
            journeyId: autoJourneyId,
            legIndex: String(autoLegIndex),
            passengerId,
            destinationDirection,
            ...(destinationLat && destinationLng
              ? {
                  destinationLat,
                  destinationLng,
                  ...(destinationLabel ? { destinationLabel } : {}),
                }
              : {}),
          },
        }
      : "/(tabs)/ride-request";
  const [secondsLeft, setSecondsLeft] = useState(120); // 2:00
  // Stable ride session id: reuse server `rides/start-search` id when passed from Ride Request; else new UUIDv4.
  const rideId = useMemo(() => {
    const raw = typeof params.rideId === "string" ? params.rideId.trim() : "";
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (raw && uuidRe.test(raw)) return raw;
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return Math.floor(v).toString(16);
    });
  }, [params.rideId]);

  const [isCompletingRide, setIsCompletingRide] = useState(false);
  const [tripStartedAtIso, setTripStartedAtIso] = useState<string | null>(null);
  /** Miles for this leg only (pickup → dropoff segment). Entered before End Trip. */
  const [legMilesText, setLegMilesText] = useState("");
  const [wasZeroDetour, setWasZeroDetour] = useState(wasZeroDetourFromDriver);
  const [pickupPoint, setPickupPoint] = useState<LatLng | null>(null);
  const [dropoffPoint, setDropoffPoint] = useState<LatLng | null>(null);
  const [passengerRep, setPassengerRep] = useState<{
    total_score: number;
    rating_count: number;
  } | null>(null);

  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const ridesCompleteEndpoint = getRidesCompleteUrlOrNull();

  // Auto-start a journey ONLY when the app believes a handoff will be needed.
  // This keeps multi-leg as a last resort, app-driven behavior.
  useEffect(() => {
    if (!needsHandoff || !passengerId) return;
    if (autoJourneyId) return;

    const url = getJourneysRegisterUrlOrNull();
    if (!url || !supabase) return;

    let cancelled = false;
    (async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token || cancelled) return;
        const newJourneyId = createJourneyId();
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ journeyId: newJourneyId }),
        });
        if (!resp.ok || cancelled) return;
        setAutoJourneyId(newJourneyId);
        setAutoLegIndex(1);
      } catch {
        // Keep running without multi-leg; passenger can still complete single leg.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoJourneyId, needsHandoff, passengerId]);

  useEffect(() => {
    if (!rideId) return;
    const statusUrl = getRideStatusUrlOrNull(rideId);
    if (!statusUrl || !supabase) return;

    let cancelled = false;
    const supabaseClient = supabase;
    const fetchStatus = async () => {
      if (!supabaseClient) return;
      try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        if (!token || cancelled) return;
        const resp = await fetch(statusUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
        if (!resp.ok) {
          return;
        }
        const body = (await resp.json()) as { status?: string; passenger_id?: string | null };
        if (cancelled) return;
        setRideStatus(body.status ?? null);
        if (body.passenger_id) setRidePassengerId(body.passenger_id);
      } catch {
        if (!cancelled) {
          setRideStatus(null);
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rideId]);

  // Live GPS Watcher: If current user is the driver, broadcast location rapidly
  useEffect(() => {
    if (!currentUserId || currentUserId !== driverId) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function startWatch() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          if (cancelled) return;
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setLiveDriverLocation(coords);
          
          // Fast background heartbeat for active trip
          supabase?.from("driver_presence").upsert({
            driver_id: currentUserId,
            current_lat: coords.latitude,
            current_lng: coords.longitude,
            updated_at: new Date().toISOString(),
            is_available: false, // Hide from matching while in an active trip
            display_name: driverName,
            heading_direction: destinationDirection
          }).catch(() => {});
        }
      );
    }
    
    startWatch();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [currentUserId, driverId, driverName, destinationDirection]);

  // Live GPS Poller: If current user is the passenger, pull the driver's location rapidly
  useEffect(() => {
    if (!currentUserId || currentUserId === driverId || !driverId) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || !supabase) return;
      const { data } = await supabase
        .from("driver_presence")
        .select("current_lat, current_lng")
        .eq("driver_id", driverId)
        .single();
      if (data && !cancelled && data.current_lat && data.current_lng) {
        setLiveDriverLocation({ latitude: data.current_lat, longitude: data.current_lng });
      }
    };
    poll();
    const intervalId = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentUserId, driverId]);

  // Background search for the next driver while riding with current driver.
  // We only do this when multi-leg is active (autoJourneyId) and after boarding countdown ends.
  useEffect(() => {
    if (!autoJourneyId || !passengerId) return;
    if (secondsLeft > 0) return;
    // If we already pre-matched a next driver, no need to poll.
    if (nextDriver) return;

    const demoUrl = getMatchingDemoDriversUrlOrNull();
    const searchUrl = getMatchingSearchUrlOrNull();
    if (!demoUrl && !searchUrl) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      if (cancelled) return;
      setIsSearchingNextDriver(true);
      try {
        const accessToken = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;

        let urlToUse: string | null = null;
        let usedLiveSearch = false;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted" && searchUrl) {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (!cancelled) {
              urlToUse = `${searchUrl}?originLat=${encodeURIComponent(String(loc.coords.latitude))}&originLng=${encodeURIComponent(
                String(loc.coords.longitude)
              )}&destinationDirection=${encodeURIComponent(destinationDirection)}`;
              usedLiveSearch = true;
            }
          }
        } catch {
          // Fall through to demo URL.
        }
        if (!urlToUse) {
          urlToUse = demoUrl;
        }
        if (!urlToUse || cancelled) return;

        let resp = await fetch(urlToUse, {
          headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        });
        if (cancelled) return;

        if (!resp.ok && usedLiveSearch && demoUrl) {
          usedLiveSearch = false;
          resp = await fetch(demoUrl, {
            headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          });
        }

        if (cancelled) return;
        const data: unknown = resp.ok ? await resp.json() : null;
        const parsed = data ? parseDriverCardsFromApi(data) : null;
        let list: DriverCard[];
        if (parsed !== null) {
          list = parsed;
        } else if (usedLiveSearch) {
          list = [];
        } else {
          list = [];
        }
        const candidate =
          list.find(
            (d) =>
              (driverId ? d.id !== driverId : true) &&
              d.headingDirection === destinationDirection
          ) ?? null;
        if (candidate && !cancelled) {
          setNextDriver(candidate);
        }
      } catch {
        // ignore; keep polling
      } finally {
        if (!cancelled) setIsSearchingNextDriver(false);
      }
    }

    poll();
    intervalId = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoJourneyId, passengerId, secondsLeft, nextDriver, driverId, destinationDirection]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Mark trip start time when boarding countdown finishes.
    if (secondsLeft === 0 && !tripStartedAtIso) {
      setTripStartedAtIso(new Date().toISOString());
    }
  }, [secondsLeft, tripStartedAtIso]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setPickupPoint({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch {
        // GPS unavailable — pickup will be captured at End Trip instead
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPassengerRep() {
      const url = passengerId ? getPassengerReputationUrlOrNull(passengerId) : null;
      if (!url) {
        setPassengerRep(null);
        return;
      }
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const token = sessionResult?.data.session?.access_token;
      if (!token) return;
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as {
          total_score?: number;
          rating_count?: number;
        };
        if (!cancelled) {
          setPassengerRep({
            total_score: Number(j.total_score ?? 0),
            rating_count: Number(j.rating_count ?? 0),
          });
        }
      } catch {
        if (!cancelled) setPassengerRep(null);
      }
    }
    loadPassengerRep();
    return () => {
      cancelled = true;
    };
  }, [passengerId]);

  const boardingTimeText = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const useGoogleProvider = googleMapsApiKey.length > 0;

  const mapRegion = useMemo(() => {
    const a = liveDriverLocation || pickupPoint;
    const b = dropoffPoint;
    if (a && b) {
      const lat = (a.latitude + b.latitude) / 2;
      const lng = (a.longitude + b.longitude) / 2;
      const latDelta = Math.max(Math.abs(a.latitude - b.latitude) * 2.4, 0.025);
      const lngDelta = Math.max(Math.abs(a.longitude - b.longitude) * 2.4, 0.025);
      return { latitude: lat, longitude: lng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
    }
    if (a) {
      return {
        latitude: a.latitude,
        longitude: a.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      };
    }
    return { latitude: 37.78, longitude: -122.4, latitudeDelta: 0.12, longitudeDelta: 0.12 };
  }, [pickupPoint, dropoffPoint]);

  const shareTrip = async () => {
    if (!rideId) {
      Alert.alert(t("shareTrip"), t("shareTripNoRideId"));
      return;
    }

    const url = getRidesShareTokenUrlOrNull();
    if (!url) {
      Alert.alert(t("shareTrip"), t("backendNotConfigured"));
      return;
    }

    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const token = sessionResult?.data.session?.access_token;
    if (!token) {
      Alert.alert(t("shareTrip"), t("shareTripSignInRequired"));
      return;
    }

    setShareError(null);
    setIsSharing(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rideId }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(formatBackendErrorBody(text, response.status));
      }
      const body = JSON.parse(text) as { rideId: string; shareToken: string };
      const tokenGot = body.shareToken;
      const deepLink = `kindride://ride-share?shareToken=${encodeURIComponent(tokenGot)}`;

      setShareToken(tokenGot);
      setShareUrl(deepLink);

      await Share.share({ message: t("trackMyRide", { deepLink }) });
    } catch (e) {
      const message = e instanceof Error ? e.message : t("shareTripLinkError");
      setShareError(message);
      Alert.alert(t("shareTrip"), message);
    } finally {
      setIsSharing(false);
    }
  };

  // Avoid remounting the map on every GPS tweak (prevents full-screen “blink”).

  const tripStatus =
    secondsLeft > 0 ? t("boardingNow", { time: boardingTimeText }) : t("tripInProgress");


  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t("activeTrip")}</Text>
        <Link href="/sos" asChild>
          <Pressable style={styles.sosButton}>
            <Text style={styles.sosButtonText}>{t("sosShort")}</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.mapWrap}>
        {Platform.OS === "web" ? (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderTitle}>{t("tripSegment")}</Text>
            <Text style={styles.mapPlaceholderText}>
              {t("liveMapsHint")}
            </Text>
          </View>
        ) : (
          <TripSegmentMap
            key="trip-segment-map"
            style={styles.map}
            mapRegion={mapRegion}
            pickupPoint={pickupPoint}
            dropoffPoint={dropoffPoint}
            driverLocation={liveDriverLocation}
            useGoogleProvider={useGoogleProvider}
          />
        )}
        <View style={styles.mapCaption} pointerEvents="none">
          <Text style={styles.mapCaptionText}>
            {useGoogleProvider
              ? t("straightLineHint")
              : t("addGoogleMapsKeyHint")}
          </Text>
        </View>
      </View>

      <View style={styles.bottomCard}>
        {secondsLeft === 0 && <SessionRecorder isActive={true} rideId={rideId} />}
        {autoJourneyId ? (
          <Text style={[styles.legLabel, secondsLeft === 0 && { marginTop: 12 }]}>{t("multiLegLegX", { leg: autoLegIndex })}</Text>
        ) : null}
        {destinationLabel || (destinationLat && destinationLng) ? (
          <Text style={styles.destText}>
            {t("destination", { dest: destinationLabel ? destinationLabel : `${destinationLat}, ${destinationLng}` })}
          </Text>
        ) : null}
        <Text style={styles.driverName}>{t("driverName", { name: driverName })}</Text>
        <Text style={styles.meta}>{t("carInfo")}</Text>
        <Text style={styles.meta}>{t("etaToPickup")}</Text>
        {autoJourneyId ? (
          <Text style={styles.repHint}>
            {nextDriver
              ? t("nextDriverFound", { name: nextDriver.name, eta: nextDriver.etaMinutes })
              : isSearchingNextDriver
                ? t("searchingNextDriver")
                : t("handoffSearchActive")}
          </Text>
        ) : null}
        {passengerRep && passengerRep.rating_count > 0 ? (
          <Text style={styles.repText}>
            {t("passengerReputation", {
              score: passengerRep.total_score,
              count: passengerRep.rating_count,
              s: passengerRep.rating_count === 1 ? "" : "s"
            })}
          </Text>
        ) : passengerId ? (
          <Text style={styles.repHint}>{t("passengerProfileNoRatings")}</Text>
        ) : null}
        <Text style={styles.statusText}>{tripStatus}</Text>
        <Text style={styles.legDistanceLabel}>
          {autoJourneyId ? t("thisLegMiles") : t("tripMiles")}
        </Text>
        <TextInput
          value={legMilesText}
          onChangeText={setLegMilesText}
          placeholder={t("autoFilledOnEndTrip")}
          keyboardType="decimal-pad"
          style={styles.legMilesInput}
        />
        <Text style={styles.detourHint}>
          {t("detourHint")}
        </Text>
        <View style={styles.switchRow}>
          <Switch value={wasZeroDetour} onValueChange={setWasZeroDetour} />
          <Text style={styles.switchLabel}>{t("minimalDetour")}</Text>
        </View>
        <Pressable
          onPress={async () => {
            if (isCompletingRide) return;
            if (!ridesCompleteEndpoint) {
              Alert.alert(
                t("backendNotConfigured"),
                t("backendMissingEndpoint")
              );
              return;
            }

            if (rideStatus && !["accepted", "in_progress", "completed"].includes(rideStatus)) {
              Alert.alert(
                t("rideNotReady"),
                t("rideStatusWait", { status: rideStatus })
              );
              return;
            }

            // Auto-calculate drop-off GPS and miles if not already set
            let resolvedMilesText = legMilesText;
            let resolvedDropoff = dropoffPoint;
            if (!resolvedDropoff || !resolvedMilesText.trim()) {
              try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === "granted") {
                  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  resolvedDropoff = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
                  setDropoffPoint(resolvedDropoff);
                  if (pickupPoint) {
                    const straightMi = clampLegMilesStraightLine(haversineMiles(pickupPoint, resolvedDropoff));
                    resolvedMilesText = String(straightMi);
                    setLegMilesText(resolvedMilesText);
                  }
                }
              } catch {
                // GPS unavailable — fall through to manual validation below
              }
            }

            const normalizedMiles = resolvedMilesText.trim().replace(",", ".");
            const miles = parseFloat(normalizedMiles);
            if (!Number.isFinite(miles) || miles < 0.1 || miles > 500) {
              Alert.alert(
                t("tripDistance"),
                t("enterMilesWarning")
              );
              return;
            }

            try {
              setIsCompletingRide(true);
              const sessionResult = supabase
                ? await supabase.auth.getSession()
                : null;
              const accessToken = sessionResult?.data.session?.access_token;

              const startedAtToSend =
                tripStartedAtIso ?? (secondsLeft === 0 ? new Date().toISOString() : null);

              const destLatNum = Number(destinationLat);
              const destLngNum = Number(destinationLng);
              const hasDest =
                destinationLat.length > 0 &&
                destinationLng.length > 0 &&
                Number.isFinite(destLatNum) &&
                Number.isFinite(destLngNum);

              const payload = {
                rideId,
                wasZeroDetour,
                distanceMiles: miles,
                ...(pickupPoint ? { pickupLat: pickupPoint.latitude, pickupLng: pickupPoint.longitude } : {}),
                ...(resolvedDropoff ? { dropoffLat: resolvedDropoff.latitude, dropoffLng: resolvedDropoff.longitude } : {}),
                ...(passengerId ? { passengerId } : {}),
                ...(autoJourneyId ? { journeyId: autoJourneyId, legIndex: autoLegIndex } : {}),
                ...(hasDest
                  ? {
                      destinationLat: destLatNum,
                      destinationLng: destLngNum,
                      ...(destinationLabel ? { destinationLabel } : {}),
                    }
                  : {}),
                ...(startedAtToSend ? { startedAt: startedAtToSend } : {}),
              };

              const isDriverFlow = !driverId;
              if (isDriverFlow) {
                try {
                  await attestRouteCommitment({
                    rideId,
                    declaredIntent: wasZeroDetour ? "zero_detour" : "detour",
                    pickup: pickupPoint,
                    dropoff: resolvedDropoff,
                    destination: hasDest
                      ? { latitude: destLatNum, longitude: destLngNum }
                      : null,
                    distanceMiles: miles,
                  });
                } catch (e) {
                  console.warn("[route-commitment] attestation failed", e);
                }
              }

              const response = await fetch(ridesCompleteEndpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify(payload),
              });

              const rawErr = await response.text().catch(() => "");
              if (!response.ok) {
                throw new Error(formatBackendErrorBody(rawErr, response.status));
              }

              // Driver-only: POST /passengers/rate requires JWT driver_id == rides.driver_id.
              // This screen runs as the passenger — never open rate-passenger here (would 400).
              const ratingMeta = {
                distanceMiles: String(miles),
                wasZeroDetour: wasZeroDetour ? "true" : "false",
              };
              const tripMeta = {
                ...ratingMeta,
                destinationDirection,
                ...(destinationLat ? { destinationLat } : {}),
                ...(destinationLng ? { destinationLng } : {}),
                ...(destinationLabel ? { destinationLabel } : {}),
                ...(passengerId ? { passengerId } : {}),
                ...(autoJourneyId ? { journeyId: autoJourneyId, legIndex: String(autoLegIndex) } : {}),
              };
              // If driverId was not passed, the current user IS the driver (came from incoming-ride).
              // Route them to rate-passenger. Otherwise this is the passenger — rate the driver.
              if (isDriverFlow) {
                const effectivePassengerId = ridePassengerId ?? passengerId ?? "";
                router.push({
                  pathname: "/rate-passenger",
                  params: { rideId, passengerId: effectivePassengerId, ...ratingMeta },
                });
              } else {
                router.push({
                  pathname: "/post-trip-rating",
                  params: { rideId, driverName, driverId, ...tripMeta },
                });
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : t("rideCompletionFailed");
              Alert.alert(
                t("couldNotCompleteRide"),
                message + "\n\n" + t("signInOnPointsTab")
              );
            } finally {
              setIsCompletingRide(false);
            }
          }}
          disabled={isCompletingRide}
          style={styles.endTripButton}
        >
          <Text style={styles.endTripButtonText}>
            {isCompletingRide ? t("completing") : t("endTrip")}
          </Text>
        </Pressable>

        <Pressable
          onPress={shareTrip}
          disabled={isSharing}
          style={[styles.shareButton, isSharing && styles.shareButtonDisabled]}
        >
          <Text style={styles.shareButtonText}>{isSharing ? t("sharing") : t("shareTrip")}</Text>
        </Pressable>
        {shareError ? <Text style={styles.errorBannerBody}>{shareError}</Text> : null}
        {shareUrl ? (
          <View style={styles.shareLinkBlock}>
            <Text style={styles.shareLinkLabel}>{t("shareToken")}</Text>
            <Text style={styles.shareLinkValue} selectable>
              {shareToken}
            </Text>
            <Text style={[styles.shareLinkLabel, { marginTop: 6 }]}>{t("deepLink")}</Text>
            <Text style={styles.shareLinkValue} selectable>
              {shareUrl}
            </Text>
          </View>
        ) : null}
      </View>

      <Link href={backToSearchHref} style={styles.link}>
        {autoJourneyId ? t("chooseDifferentNextDriver") : t("goBackToRideRequest")}
      </Link>
      <Link href="/(tabs)" style={styles.linkSecondary}>
        {t("goToHome")}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
  },
  sosButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sosButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  mapWrap: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    overflow: "hidden",
    backgroundColor: "#eaf0ff",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapCaption: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  mapCaptionText: {
    fontSize: 12,
    color: "#334155",
    textAlign: "center",
  },
  mapPlaceholder: {
    flex: 1,
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  mapPlaceholderTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2a44",
  },
  mapPlaceholderText: {
    marginTop: 8,
    textAlign: "center",
    color: "#4b587c",
    fontSize: 15,
  },
  bottomCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6ebf5",
    backgroundColor: "#ffffff",
    padding: 14,
  },
  legLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f766e",
    marginBottom: 6,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2a44",
  },
  meta: {
    marginTop: 6,
    fontSize: 14,
    color: "#4b587c",
  },
  repText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#0f766e",
  },
  repHint: {
    marginTop: 7,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 18,
  },
  destText: {
    marginTop: 6,
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
    lineHeight: 18,
  },
  statusText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f766e",
  },
  legDistanceLabel: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  legMilesInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#1f2a44",
    backgroundColor: "#f8fafc",
  },
  detourHint: {
    marginTop: 10,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 10,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    color: "#334155",
    fontWeight: "500",
  },
  endTripButton: {
    marginTop: 14,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 11,
    minHeight: 44,
    alignItems: "center",
  },
  endTripButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  shareButton: {
    marginTop: 10,
    backgroundColor: "#10b981",
    borderRadius: 10,
    paddingVertical: 11,
    minHeight: 44,
    alignItems: "center",
  },
  shareButtonDisabled: {
    opacity: 0.65,
  },
  shareButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  shareLinkBlock: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f0fdfa",
  },
  shareLinkLabel: {
    fontSize: 12,
    color: "#0f766e",
    fontWeight: "700",
    marginBottom: 2,
  },
  shareLinkValue: {
    fontSize: 12,
    color: "#334155",
  },
  link: {
    marginTop: 12,
    textAlign: "center",
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
  linkSecondary: {
    marginTop: 8,
    textAlign: "center",
    color: "#4b587c",
    fontSize: 15,
    fontWeight: "600",
  },
  errorBannerBody: {
    marginTop: 12,
    fontSize: 13,
    color: "#dc2626",
    textAlign: "center",
    lineHeight: 18,
  },
});
