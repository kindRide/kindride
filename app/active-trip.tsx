import * as Location from "expo-location";
import { Link, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
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
  getMatchingSearchUrlOrNull,
  getPassengerReputationUrlOrNull,
  getRidesCancelPendingUrlOrNull,
  getRidesCompleteUrlOrNull,
  getRidesShareTokenUrlOrNull,
  getRideStatusUrlOrNull,
} from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { clampLegMilesStraightLine, haversineMiles, type LatLng } from "@/lib/haversine-miles";
import { createJourneyId } from "@/lib/journey-id";
import {
  parseDriverCardsFromApi,
  type DriverCard,
  type TravelDirection,
} from "@/lib/matching-drivers";
import {
  createRideTraceId,
  logRideLifecycleEvent,
  logRideStatusTransition,
  withRideTraceHeaders,
} from "@/lib/ride-lifecycle-observability";
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
    driverRideCount?: string;
    driverThumbsUp?: string;
    driverThumbsDown?: string;
    driverHearts?: string;
    vehicleInfo?: string;
    seatCapacity?: string;
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
  const driverRideCount = typeof params.driverRideCount === "string" && params.driverRideCount.length > 0 ? params.driverRideCount : null;
  const driverThumbsUp = params.driverThumbsUp ? parseInt(params.driverThumbsUp, 10) : null;
  const driverThumbsDown = params.driverThumbsDown ? parseInt(params.driverThumbsDown, 10) : null;
  const driverHearts = params.driverHearts ? parseInt(params.driverHearts, 10) : null;
  const vehicleInfo = typeof params.vehicleInfo === "string" && params.vehicleInfo.length > 0 ? params.vehicleInfo : null;
  const seatCapacity = params.seatCapacity ? parseInt(params.seatCapacity, 10) : null;

  const [autoJourneyId, setAutoJourneyId] = useState<string | null>(journeyId ?? null);
  const [autoLegIndex, setAutoLegIndex] = useState<number>(legIndexNum);
  const [nextDriver, setNextDriver] = useState<DriverCard | null>(null);
  const [isSearchingNextDriver, setIsSearchingNextDriver] = useState(false);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [ridePassengerId, setRidePassengerId] = useState<string | null>(null);
  const statusRequestSeqRef = useRef(0);
  const lastPolledStatusRef = useRef<string | null>(null);
  const lastPollErrorAtRef = useRef<number>(0);
  const completeInFlightRef = useRef(false);
  const cancelInFlightRef = useRef(false);
  const shareInFlightRef = useRef(false);
  const ratingNavigatedRef = useRef(false);
  const proximityAutoStartedRef = useRef(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [liveDriverLocation, setLiveDriverLocation] = useState<LatLng | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

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
      tier: "Helper" as const,
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
  const [isCancellingRide, setIsCancellingRide] = useState(false);
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

  // Detect when the OTHER party ends the trip remotely (status → "completed" without us pressing End Trip)
  useEffect(() => {
    if (rideStatus !== "completed") return;
    if (completeInFlightRef.current) return;
    if (ratingNavigatedRef.current) return;
    ratingNavigatedRef.current = true;
    const isDriverFlow = !driverId;
    if (isDriverFlow) {
      const effectivePassengerId = ridePassengerId ?? passengerId ?? "";
      router.push({
        pathname: "/rate-passenger",
        params: { rideId, passengerId: effectivePassengerId, distanceMiles: "0", wasZeroDetour: "false" },
      });
    } else {
      router.push({
        pathname: "/post-trip-rating",
        params: { rideId, driverName, driverId, distanceMiles: "0", wasZeroDetour: "false" },
      });
    }
  }, [rideStatus, driverId, driverName, rideId, passengerId, ridePassengerId, router]);

  const ridesCompleteEndpoint = getRidesCompleteUrlOrNull();
  const fetchRideStatusOnce = useCallback(async () => {
    if (!rideId || !supabase) return null;
    const statusUrl = getRideStatusUrlOrNull(rideId);
    if (!statusUrl) return null;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return null;
    const traceId = createRideTraceId("active-trip", rideId, "status-poll");
    const resp = await fetch(statusUrl, {
      method: "GET",
      headers: withRideTraceHeaders({
        Authorization: `Bearer ${token}`,
      }, traceId),
    });
    if (!resp.ok) {
      return null;
    }
    return (await resp.json()) as { status?: string; passenger_id?: string | null };
  }, [rideId]);

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
    if (!supabase) return;

    let cancelled = false;
    const fetchStatus = async () => {
      const requestSeq = ++statusRequestSeqRef.current;
      try {
        const body = await fetchRideStatusOnce();
        if (!body || cancelled || requestSeq !== statusRequestSeqRef.current) return;
        logRideStatusTransition(
          "active-trip",
          rideId,
          lastPolledStatusRef.current,
          body.status ?? null
        );
        lastPolledStatusRef.current = body.status ?? null;
        setRideStatus(body.status ?? null);
        if (body.passenger_id) setRidePassengerId(body.passenger_id);
      } catch {
        if (cancelled) return;
        const now = Date.now();
        if (now - lastPollErrorAtRef.current > 20_000) {
          lastPollErrorAtRef.current = now;
          logRideLifecycleEvent("active-trip", "status_poll_error", { rideId });
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchRideStatusOnce, rideId]);

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
          }).then(() => {}, () => {});
        }
      );
    }
    
    startWatch();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [currentUserId, driverId, driverName, destinationDirection]);

  // Live GPS: If current user is the passenger, subscribe via Realtime for instant driver location
  useEffect(() => {
    if (!currentUserId || currentUserId === driverId || !driverId || !supabase) return;

    // Initial fetch so there's no blank period before the first realtime event
    supabase
      .from("driver_presence")
      .select("current_lat, current_lng")
      .eq("driver_id", driverId)
      .single()
      .then(({ data }) => {
        if (data?.current_lat && data?.current_lng) {
          setLiveDriverLocation({ latitude: data.current_lat, longitude: data.current_lng });
        }
      });

    const channel = supabase
      .channel(`driver-location-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "driver_presence",
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const row = payload.new as { current_lat?: number; current_lng?: number };
          if (row.current_lat && row.current_lng) {
            setLiveDriverLocation({ latitude: row.current_lat, longitude: row.current_lng });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, driverId]);

  // Chat unread badge: count INSERT events from the other party while not on chat screen.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const chatEligible =
    (rideStatus === "accepted" || rideStatus === "in_progress") &&
    uuidRe.test(rideId) &&
    !!currentUserId &&
    !!supabase;

  useEffect(() => {
    if (!chatEligible) return;

    const channel = supabase!
      .channel(`chat-badge:${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const msg = payload.new as { sender_id?: string };
          if (msg.sender_id && msg.sender_id !== currentUserId) {
            setUnreadChatCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [chatEligible, rideId, currentUserId]);

  // Background search for the next driver while riding with current driver.
  // We only do this when multi-leg is active (autoJourneyId) and after boarding countdown ends.
  useEffect(() => {
    if (!autoJourneyId || !passengerId) return;
    if (secondsLeft > 0) return;
    // If we already pre-matched a next driver, no need to poll.
    if (nextDriver) return;

    const searchUrl = getMatchingSearchUrlOrNull();
    if (!searchUrl) return;

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
          // Could not get location
        }
        if (!urlToUse || cancelled) return;

        const resp = await fetch(urlToUse, {
          headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        });

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

  // Proximity auto-start: skip countdown when driver arrives within ~80m of passenger
  useEffect(() => {
    if (!driverId) return; // only passenger flow (driver has no driverId param)
    if (!liveDriverLocation || !pickupPoint) return;
    if (secondsLeft === 0) return;
    if (proximityAutoStartedRef.current) return;
    const dist = haversineMiles(liveDriverLocation, pickupPoint);
    if (dist < 0.05) { // ~80 metres
      proximityAutoStartedRef.current = true;
      setSecondsLeft(0);
    }
  }, [liveDriverLocation, pickupPoint, secondsLeft, driverId]);

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
  const rideCancelEndpoint = getRidesCancelPendingUrlOrNull();

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
  }, [pickupPoint, dropoffPoint, liveDriverLocation]);

  const shareTrip = async () => {
    if (shareInFlightRef.current) return;
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
    shareInFlightRef.current = true;
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
      shareInFlightRef.current = false;
      setIsSharing(false);
    }
  };

  // Avoid remounting the map on every GPS tweak (prevents full-screen “blink”).

  const tripStatus =
    secondsLeft > 0 ? t("boardingNow", { time: boardingTimeText }) : t("tripInProgress");

  const confirmCancelRide = () => {
    if (isCancellingRide || cancelInFlightRef.current) return;
    router.push({
      pathname: "/cancel-ride",
      params: {
        rideId,
        driverName,
        context: rideStatus === "accepted" ? "accepted" : "searching",
      },
    });
  };


  // Route progress (0–1) — only meaningful once trip starts and we have all 3 points
  const routeProgress = (() => {
    if (!tripStartedAtIso || !pickupPoint || !dropoffPoint || !liveDriverLocation) return null;
    const total = haversineMiles(pickupPoint, dropoffPoint);
    if (total <= 0) return null;
    const remaining = haversineMiles(liveDriverLocation, dropoffPoint);
    return Math.max(0, Math.min(1, (total - remaining) / total));
  })();

  const driverDistMiles =
    liveDriverLocation && pickupPoint && currentUserId !== driverId
      ? haversineMiles(liveDriverLocation, pickupPoint)
      : null;
  const driverEtaMins = driverDistMiles !== null ? Math.max(1, Math.round(driverDistMiles / 0.3)) : null;
  const isDriverArrivingNow = driverDistMiles !== null && driverDistMiles < 0.1;
  const driverInitials =
    driverName
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  return (
    <View style={styles.screen}>
      {/* ── Full-screen map ── */}
      {Platform.OS === "web" ? (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderTitle}>{t("tripSegment")}</Text>
          <Text style={styles.mapPlaceholderText}>{t("liveMapsHint")}</Text>
        </View>
      ) : (
        <TripSegmentMap
          key="trip-segment-map"
          style={StyleSheet.absoluteFillObject}
          mapRegion={mapRegion}
          pickupPoint={pickupPoint}
          dropoffPoint={dropoffPoint}
          driverLocation={liveDriverLocation}
          useGoogleProvider={useGoogleProvider}
          isBoardingPhase={secondsLeft > 0}
        />
      )}

      {/* ── Header overlay (top) ── */}
      <View style={styles.headerOverlay} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t("activeTrip")}</Text>
          <Link href="/sos" asChild>
            <Pressable style={styles.sosButton}>
              <Text style={styles.sosButtonText}>{t("sosShort")}</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {/* ── Bottom sheet ── */}
      <View style={styles.bottomSheet}>
        {/* Fixed driver panel — always visible */}
        <View style={styles.driverPanel}>
          <View style={styles.sheetHandle} />

          {/* ETA strip */}
          <View style={styles.etaStrip}>
            <Text style={styles.etaMainText}>
              {isDriverArrivingNow
                ? "🚗  Driver arriving now!"
                : driverEtaMins !== null
                ? `🚗  Arrives in ${driverEtaMins} min`
                : tripStatus}
            </Text>
          </View>

          {/* Driver / passenger card */}
          <View style={styles.driverCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{driverInitials}</Text>
            </View>
            <View style={styles.driverMeta}>
              <View style={styles.driverNameRow}>
                <Text style={styles.driverNameText}>
                  {driverName || (passengerId ? "Passenger" : "Driver")}
                </Text>
                {driverRideCount ? (
                  <Text style={styles.rideCount}>{driverRideCount} rides</Text>
                ) : null}
              </View>
              {(driverThumbsUp !== null || driverThumbsDown !== null || driverHearts !== null) ? (
                <View style={styles.driverStatsRow}>
                  {driverThumbsUp !== null && <Text style={styles.statChip}>👍 {driverThumbsUp}</Text>}
                  {driverThumbsDown !== null && <Text style={styles.statChip}>👎 {driverThumbsDown}</Text>}
                  {driverHearts !== null && <Text style={styles.statChip}>❤️ {driverHearts}</Text>}
                </View>
              ) : null}
              {(vehicleInfo || seatCapacity) ? (
                <View style={styles.vehicleRow}>
                  {vehicleInfo ? <Text style={styles.vehicleText}>{vehicleInfo}</Text> : null}
                  {seatCapacity ? <Text style={styles.seatBadge}>👥 {seatCapacity}</Text> : null}
                </View>
              ) : null}
              {passengerRep && passengerRep.rating_count > 0 ? (
                <Text style={styles.passengerRepChip}>
                  ⭐ {passengerRep.total_score} · {passengerRep.rating_count} rating{passengerRep.rating_count === 1 ? "" : "s"}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Primary action row */}
          <View style={styles.actionRow}>
            {rideStatus === "accepted" ? (
              <Pressable
                onPress={confirmCancelRide}
                disabled={isCancellingRide}
                style={[styles.actionBtn, styles.editRideBtn]}
              >
                {isCancellingRide ? (
                  <ActivityIndicator color="#334155" />
                ) : (
                  <Text style={styles.editRideBtnText}>✏️  Edit Ride</Text>
                )}
              </Pressable>
            ) : null}
            {(rideStatus === "accepted" || rideStatus === "in_progress") ? (
              <Pressable
                onPress={() => {
                  setUnreadChatCount(0);
                  router.push({ pathname: "/trip-chat", params: { rideId } });
                }}
                style={[styles.actionBtn, styles.contactBtn, unreadChatCount > 0 && styles.contactBtnUnread]}
              >
                <View style={styles.contactBtnInner}>
                  <Text style={[styles.contactBtnText, unreadChatCount > 0 && styles.contactBtnTextUnread]}>
                    💬  {unreadChatCount > 0
                      ? `${unreadChatCount} new`
                      : driverId ? "Contact Driver" : "Contact Rider"}
                  </Text>
                  {unreadChatCount > 0 ? (
                    <View style={styles.chatBadge}>
                      <Text style={styles.chatBadgeText}>
                        {unreadChatCount > 9 ? "9+" : String(unreadChatCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Scrollable secondary content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.bottomSheetContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Route progress bar */}
          {routeProgress !== null && (
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Route progress</Text>
                <Text style={styles.progressPct}>{Math.round(routeProgress * 100)}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(routeProgress * 100)}%` }]} />
              </View>
            </View>
          )}

          {secondsLeft === 0 && <SessionRecorder isActive={true} rideId={rideId} />}
          {autoJourneyId ? (
            <Text style={[styles.legLabel, secondsLeft === 0 && { marginTop: 12 }]}>{t("multiLegLegX", { leg: autoLegIndex })}</Text>
          ) : null}
          {destinationLabel || (destinationLat && destinationLng) ? (
            <Text style={styles.destText}>
              {t("destination", { dest: destinationLabel ? destinationLabel : `${destinationLat}, ${destinationLng}` })}
            </Text>
          ) : null}
          {autoJourneyId ? (
            <Text style={styles.repHint}>
              {nextDriver
                ? t("nextDriverFound", { name: nextDriver.name, eta: nextDriver.etaMinutes })
                : isSearchingNextDriver
                  ? t("searchingNextDriver")
                  : t("handoffSearchActive")}
            </Text>
          ) : null}
          {passengerId && (!passengerRep || passengerRep.rating_count === 0) ? (
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
              if (isCompletingRide || completeInFlightRef.current) return;
              completeInFlightRef.current = true;
              if (!ridesCompleteEndpoint) {
                Alert.alert(
                  t("backendNotConfigured"),
                  t("backendMissingEndpoint")
                );
                completeInFlightRef.current = false;
                return;
              }

              let latestStatusResponse: { status?: string; passenger_id?: string | null } | null = null;
              try {
                latestStatusResponse = await fetchRideStatusOnce();
              } catch {
                completeInFlightRef.current = false;
                Alert.alert(t("rideNotReady"), t("checkConnection", "Check your connection."));
                return;
              }
              const effectiveStatus = latestStatusResponse?.status ?? rideStatus;
              if (latestStatusResponse?.passenger_id) {
                setRidePassengerId(latestStatusResponse.passenger_id);
              }
              if (effectiveStatus && !["accepted", "in_progress", "completed"].includes(effectiveStatus)) {
                setRideStatus(effectiveStatus);
                Alert.alert(
                  t("rideNotReady"),
                  t("rideStatusWait", { status: effectiveStatus })
                );
                completeInFlightRef.current = false;
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
                completeInFlightRef.current = false;
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
                  headers: withRideTraceHeaders({
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                  }, createRideTraceId("active-trip", rideId, "complete")),
                  body: JSON.stringify(payload),
                });

                const rawErr = await response.text().catch(() => "");
                if (!response.ok) {
                  throw new Error(formatBackendErrorBody(rawErr, response.status));
                }

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
                completeInFlightRef.current = false;
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

          <Link href={backToSearchHref} style={styles.link}>
            {autoJourneyId ? t("chooseDifferentNextDriver") : t("goBackToRideRequest")}
          </Link>
          <Link href="/(tabs)" style={styles.linkSecondary}>
            {t("goToHome")}
          </Link>
        </ScrollView>
      </View>  {/* end bottomSheet */}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#c8d8e8",
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sosButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  sosButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#eaf0ff",
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
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "35%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 14,
  },
  driverPanel: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  etaStrip: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  etaMainText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: "800",
    color: "#4f46e5",
  },
  driverMeta: {
    flex: 1,
    gap: 2,
  },
  driverNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  },
  driverNameText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1f2a44",
  },
  rideCount: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  driverStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  statChip: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  vehicleText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  seatBadge: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  passengerRepChip: {
    fontSize: 12,
    color: "#0f766e",
    fontWeight: "600",
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  editRideBtn: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  editRideBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  contactBtn: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1.5,
    borderColor: "#0d9488",
  },
  contactBtnUnread: {
    backgroundColor: "#0d9488",
    borderColor: "#0d9488",
  },
  contactBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0d9488",
  },
  contactBtnTextUnread: {
    color: "#ffffff",
  },
  bottomSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  progressContainer: {
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  progressPct: {
    fontSize: 12,
    color: "#0d9488",
    fontWeight: "700",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0d9488",
    borderRadius: 4,
  },
  legLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f766e",
    marginBottom: 6,
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
  chatBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  chatBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
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
