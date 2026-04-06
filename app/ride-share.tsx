import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getRideShareStatusUrlOrNull } from "@/lib/backend-api-urls";
import { formatBackendErrorBody } from "@/lib/backend-error";

function RideShareScreen() {
  const params = useLocalSearchParams<{ shareToken?: string }>();
  const initialShareToken = typeof params.shareToken === "string" ? params.shareToken : "";

  const [shareToken, setShareToken] = useState(initialShareToken);
  const [detail, setDetail] = useState<null | {
    rideId: string;
    status: string;
    destinationLabel?: string | null;
    pickupLat?: number | null;
    pickupLng?: number | null;
    destinationLat?: number | null;
    destinationLng?: number | null;
    driverId?: string | null;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSharedRide = useCallback(async (silent = false) => {
    if (!shareToken) {
      setDetail(null);
      setError("Enter a share token.");
      return;
    }

    const url = getRideShareStatusUrlOrNull(shareToken);
    if (!url) {
      setDetail(null);
      setError("Backend is not configured.");
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const r = await fetch(url);
      const text = await r.text();
      if (!r.ok) {
        const err = formatBackendErrorBody(text, r.status);
        setError(err);
        setDetail(null);
        return;
      }
      const json = JSON.parse(text) as {
        rideId: string;
        status: string;
        destinationLabel?: string | null;
        pickupLat?: number | null;
        pickupLng?: number | null;
        destinationLat?: number | null;
        destinationLng?: number | null;
        driverId?: string | null;
      };
      setDetail(json);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "Failed loading shared ride.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    if (initialShareToken) {
      void loadSharedRide();
    }
  }, [initialShareToken, loadSharedRide]);

  // Live polling: automatically refresh the status every 10 seconds if we have a ride loaded
  useEffect(() => {
    if (!detail?.rideId) return;
    const intervalId = setInterval(() => {
      void loadSharedRide(true); // Silent refresh
    }, 10000);
    return () => clearInterval(intervalId);
  }, [detail?.rideId, loadSharedRide]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Shared trip</Text>
      <Text style={styles.body}>
        Enter the share token from the driver/passenger to view an active trip status.
      </Text>

      <TextInput
        style={styles.input}
        value={shareToken}
        placeholder="Share token"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setShareToken}
      />
      <Pressable style={styles.primaryBtn} onPress={() => loadSharedRide(false)} disabled={loading}>
        <Text style={styles.primaryBtnText}>{loading ? "Loading..." : "Load shared ride"}</Text>
      </Pressable>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerTitle}>Error</Text>
          <Text style={styles.errorBannerBody}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" />
      ) : detail ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ride</Text>
          <Text style={styles.cardLine}>ID: {detail.rideId}</Text>
          <Text style={styles.cardLine}>Status: {detail.status}</Text>
          {detail.destinationLabel ? <Text style={styles.cardLine}>Destination: {detail.destinationLabel}</Text> : null}
          {detail.pickupLat != null && detail.pickupLng != null ? (
            <Text style={styles.cardLine}>Pickup: {detail.pickupLat.toFixed(5)}, {detail.pickupLng.toFixed(5)}</Text>
          ) : null}
          {detail.destinationLat != null && detail.destinationLng != null ? (
            <Text style={styles.cardLine}>Dropoff: {detail.destinationLat.toFixed(5)}, {detail.destinationLng.toFixed(5)}</Text>
          ) : null}
          {detail.driverId ? <Text style={styles.cardLine}>Driver ID: {detail.driverId}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.hint}>
        Tip: call /rides/share-token from driver or passenger device using the current rideId, then open this screen with that token.
      </Text>
    </ScrollView>
  );
}

export default RideShareScreen;

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    backgroundColor: "#f8faff",
    minHeight: "100%",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
    marginBottom: 12,
  },
  body: {
    color: "#334155",
    marginBottom: 10,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    color: "#0f172a",
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginBottom: 16,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  card: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "700",
    marginBottom: 6,
    color: "#1f2a44",
  },
  cardLine: {
    color: "#334155",
    marginBottom: 4,
  },
  hint: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorBannerTitle: {
    fontWeight: "700",
    color: "#991b1b",
    marginBottom: 2,
  },
  errorBannerBody: {
    color: "#991b1b",
  },
});