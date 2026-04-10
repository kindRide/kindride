import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import {
  getRideStatusUrlOrNull,
  getRidesRespondUrlOrNull,
} from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";
import { savePendingPassengerRating } from "@/lib/driver-pending-passenger-rating";
import { registerRouteCommitment } from "@/lib/route-commitment";
import { supabase } from "@/lib/supabase";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type RideStatusPayload = {
  ride_id?: string;
  status?: string;
  passenger_id?: string | null;
  destination_label?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  request_expires_at?: string | null;
};

export default function IncomingRideScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ rideId?: string; rideid?: string }>();
  const rideIdRaw = params.rideId ?? params.rideid;
  const rideId = typeof rideIdRaw === "string" ? rideIdRaw.trim() : "";
  const [manualRideId, setManualRideId] = useState("");

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [detail, setDetail] = useState<RideStatusPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const respondGuard = useRef(false);

  const refresh = useCallback(async () => {
    const url = getRideStatusUrlOrNull(rideId);
    if (!url || !supabase) {
      setDetail(null);
      setFetchError(!supabase ? t("supabaseNotConfigured", "Supabase is not configured.") : t("backendUrlNotConfigured", "Backend URL is not configured."));
      setLoading(false);
      return;
    }
    setFetchError(null);
    setRespondError(null);
    let token: string | undefined;
    for (let i = 0; i < 6; i++) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
      if (token) break;
      await sleep(180);
    }
    if (!token) {
      setDetail(null);
      setLoading(false);
      setFetchError(t("signInToLoadRide", "Sign in to load this ride. Use the same driver account the passenger selected."));
      return;
    }
    // After QR scan the passenger may still be registering the ride — brief 404 is common.
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const text = await r.text();
      if (r.ok) {
        try {
          setDetail(JSON.parse(text) as RideStatusPayload);
        } catch {
          setDetail(null);
          setFetchError(t("invalidServerResponse"));
        }
        setLoading(false);
        return;
      }
      if (r.status === 404 && attempt < maxAttempts - 1) {
        await sleep(420);
        continue;
      }
      setDetail(null);
      setLoading(false);
      setFetchError(formatBackendErrorBody(text, r.status));
      return;
    }
  }, [rideId, t]);

  useEffect(() => {
    if (!rideId) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [rideId, refresh]);

  const respond = async (accept: boolean) => {
    if (respondGuard.current) return;
    respondGuard.current = true;
    const endpoint = getRidesRespondUrlOrNull();
    if (!endpoint || !supabase) {
      respondGuard.current = false;
      Alert.alert(t("unavailable", "Unavailable"), t("backendOrSignInNotConfigured", "Backend or sign-in is not configured."));
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      respondGuard.current = false;
      Alert.alert(t("signInRequiredTitle"), t("signInAsDriverReceivedRequest", "Sign in as the driver account that received this request."));
      return;
    }
    setRespondError(null);
    try {
      setActing(true);
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rideId, accept }),
      });
      const raw = await r.text();
      if (!r.ok) {
        if (r.status === 409) {
          await refresh();
        }
        setRespondError(formatBackendErrorBody(raw, r.status));
        return;
      }
      if (accept) {
        const statusUrl = getRideStatusUrlOrNull(rideId);
        if (statusUrl) {
          const sr = await fetch(statusUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (sr.ok) {
            const sj = (await sr.json()) as {
              passenger_id?: string | null;
              pickup_lat?: number | null;
              pickup_lng?: number | null;
              destination_lat?: number | null;
              destination_lng?: number | null;
              destination_label?: string | null;
            };
            const pid = sj.passenger_id;
            if (pid) {
              await savePendingPassengerRating({ rideId, passengerId: String(pid) });
            }
            const currentDriverId = data.session?.user?.id;
            if (
              currentDriverId &&
              typeof sj.pickup_lat === "number" &&
              typeof sj.pickup_lng === "number" &&
              typeof sj.destination_lat === "number" &&
              typeof sj.destination_lng === "number"
            ) {
              const { data: presence } = await supabase
                .from("driver_presence")
                .select("intent")
                .eq("driver_id", currentDriverId)
                .single();
              try {
                await registerRouteCommitment({
                  rideId,
                  pickup: { latitude: sj.pickup_lat, longitude: sj.pickup_lng },
                  destination: { latitude: sj.destination_lat, longitude: sj.destination_lng },
                  declaredIntent: presence?.intent === "detour" ? "detour" : "zero_detour",
                });
              } catch (e) {
                console.warn("[route-commitment] incoming-ride registration failed", e);
              }
            }
            await refresh();
            router.replace({
              pathname: "/active-trip",
              params: {
                rideId,
                ...(typeof sj.destination_label === "string" && sj.destination_label
                  ? { destinationLabel: sj.destination_label }
                  : {}),
                ...(typeof sj.destination_lat === "number"
                  ? { destinationLat: String(sj.destination_lat) }
                  : {}),
                ...(typeof sj.destination_lng === "number"
                  ? { destinationLng: String(sj.destination_lng) }
                  : {}),
              },
            });
            return;
          }
        }
      }
      await refresh();
      if (accept) {
        Alert.alert(
          t("accepted", "Accepted"),
          t("passengerNotifiedRouting", "The passenger has been notified. Routing you to the Active Trip map."),
          [
            { text: t("startTrip", "Start Trip"), onPress: () => router.replace({ pathname: "/active-trip", params: { rideId } }) },
            { text: t("close", "Close"), onPress: () => router.back() }
          ]
        );
      } else {
        router.back();
      }
    } catch (e) {
      setRespondError(e instanceof Error ? e.message : t("unknownError", "Unknown error"));
    } finally {
      respondGuard.current = false;
      setActing(false);
    }
  };

  if (!rideId) {
    const openManual = () => {
      const id = manualRideId.trim();
      if (!id) {
        Alert.alert(t("rideIdTitle", "Ride id"), t("pasteRideId", "Paste the ride id from the passenger screen."));
        return;
      }
      router.replace({ pathname: "/incoming-ride", params: { rideId: id } });
    };
    return (
      <ScrollView contentContainerStyle={styles.manualScroll}>
        <Text style={styles.title}>{t("incomingRide", "Incoming ride")}</Text>
        <Text style={styles.body}>
          {t("preferDriverTab", "Prefer the Driver tab: when a passenger requests you, a card appears there—no typing needed.\n\nOr scan the passenger's QR on their Ride Request screen. Use manual entry only as a fallback. Do not paste kindride://… into Google Search.")}
        </Text>
        {Platform.OS !== "web" ? (
          <Pressable style={styles.primaryBtn} onPress={() => router.push("/incoming-ride-scan")}>
            <Text style={styles.primaryBtnText}>{t("scanQrCode", "Scan QR code")}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.orDivider}>{t("orTypeRideId", "or type the ride id")}</Text>
        <TextInput
          style={styles.input}
          value={manualRideId}
          onChangeText={setManualRideId}
          placeholder={t("rideIdUuid", "Ride id (UUID)")}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.primaryBtn} onPress={openManual}>
          <Text style={styles.primaryBtnText}>{t("loadRide", "Load ride")}</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>{t("goBack", "Go back")}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.hint}>{t("loadingRequest", "Loading request…")}</Text>
      </View>
    );
  }

  const st = detail?.status ?? "";

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>{t("rideRequest")}</Text>
      {fetchError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerTitle}>{t("cannotLoadRideStatus", "Cannot load ride status")}</Text>
          <Text style={styles.errorBannerBody}>{fetchError}</Text>
        </View>
      ) : null}
      {respondError ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerTitle}>{t("couldNotApplyChoice", "Could not apply your choice")}</Text>
          <Text style={styles.warnBannerBody}>{respondError}</Text>
        </View>
      ) : null}
      <Text style={styles.statusLine}>{t("statusLabel", "Status: {{status}}", { status: st || t("unknown", "unknown") })}</Text>
      <Text style={styles.rideIdLabel}>{t("rideIdCopyIfNeed", "Ride id (copy if you need it)")}</Text>
      <Text style={styles.rideIdMono} selectable>
        {rideId}
      </Text>
      {detail?.destination_label ? (
        <Text style={styles.body}>{t("destinationLabel", "Destination: {{dest}}", { dest: detail.destination_label })}</Text>
      ) : null}
      {st === "requested" ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, acting && styles.disabled]}
            disabled={acting}
            onPress={() => void respond(true)}
          >
            <Text style={styles.primaryBtnText}>{t("accept", "Accept")}</Text>
          </Pressable>
          <Pressable
            style={[styles.dangerBtn, acting && styles.disabled]}
            disabled={acting}
            onPress={() => void respond(false)}
          >
            <Text style={styles.dangerBtnText}>{t("decline", "Decline")}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.body}>
          {st === "accepted"
            ? t("requestAlreadyAccepted", "This request was already accepted.")
            : st === "declined"
              ? t("requestDeclined", "You declined this request. The passenger will be shown the next available driver.")
              : st === "expired"
                ? t("requestExpired", "This request expired (60 s window passed). The passenger can request another driver.")
                : st === "searching"
                  ? t("requestNoLongerPending", "This request is no longer pending.")
                  : t("noPendingDriverAction", "No pending driver action for this ride.")}
        </Text>
      )}
      <Pressable style={styles.secondaryBtn} onPress={() => void refresh()}>
        <Text style={styles.secondaryBtnText}>{t("refresh")}</Text>
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
        <Text style={styles.secondaryBtnText}>{t("close")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  manualScroll: { flexGrow: 1, padding: 24, paddingTop: 56 },
  scroll: { padding: 24, paddingTop: 56 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12, color: "#0f172a" },
  statusLine: { fontSize: 16, color: "#334155", marginBottom: 8 },
  rideIdLabel: { fontSize: 13, color: "#64748b", marginBottom: 4 },
  rideIdMono: { fontSize: 13, fontFamily: "monospace", color: "#0f172a", marginBottom: 12 },
  body: { fontSize: 15, color: "#475569", marginBottom: 16, lineHeight: 22 },
  orDivider: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "600",
  },
  mono: { fontFamily: "monospace", fontSize: 13, color: "#0f172a" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0f172a",
    marginBottom: 16,
  },
  hint: { marginTop: 12, color: "#64748b" },
  actions: { gap: 12, marginVertical: 20 },
  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  dangerBtn: {
    backgroundColor: "#fef2f2",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  dangerBtnText: { color: "#b91c1c", fontSize: 16, fontWeight: "600" },
  secondaryBtn: { marginTop: 8, paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { color: "#2563eb", fontSize: 16, fontWeight: "500" },
  disabled: { opacity: 0.6 },
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerTitle: { fontSize: 15, fontWeight: "700", color: "#991b1b", marginBottom: 6 },
  errorBannerBody: { fontSize: 14, color: "#7f1d1d", lineHeight: 20 },
  warnBanner: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  warnBannerTitle: { fontSize: 15, fontWeight: "700", color: "#92400e", marginBottom: 6 },
  warnBannerBody: { fontSize: 14, color: "#78350f", lineHeight: 20 },
});
