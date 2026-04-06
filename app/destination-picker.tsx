import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";

import DestinationPickerMap from "@/components/destination-picker-map/DestinationPickerMap";
import { geocodeAddressGoogle } from "@/lib/geocode-google";
import { getRecentDestinations, rememberDestination, type RecentDestination } from "@/lib/recent-destinations";

type LatLng = {
  latitude: number;
  longitude: number;
};

export default function DestinationPickerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    destinationLat?: string;
    destinationLng?: string;
    destinationLabel?: string;
  }>();

  const initialFallback: LatLng = { latitude: 37.78, longitude: -122.4 };

  const [destinationPoint, setDestinationPoint] = useState<LatLng | null>(null);
  const [initialCenter, setInitialCenter] = useState<LatLng>(initialFallback);
  const [isLoadingCenter, setIsLoadingCenter] = useState(true);

  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [destinationLabelOverride, setDestinationLabelOverride] = useState<string>("");
  const [recents, setRecents] = useState<RecentDestination[]>([]);

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

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const lat = Number(latText);
    const lng = Number(lngText);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setDestinationPoint({ latitude: lat, longitude: lng });
    }
  }, [latText, lngText]);

  useEffect(() => {
    const latRaw = typeof params.destinationLat === "string" ? params.destinationLat.trim() : "";
    const lngRaw = typeof params.destinationLng === "string" ? params.destinationLng.trim() : "";
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (
      latRaw.length > 0 &&
      lngRaw.length > 0 &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0)
    ) {
      setDestinationPoint({ latitude: lat, longitude: lng });
      setInitialCenter({ latitude: lat, longitude: lng });
      setLatText(lat.toString());
      setLngText(lng.toString());
      setDestinationLabelOverride(
        typeof params.destinationLabel === "string" ? params.destinationLabel : ""
      );
      setIsLoadingCenter(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const next = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setDestinationPoint(next);
        setInitialCenter(next);
        setLatText(next.latitude.toString());
        setLngText(next.longitude.toString());
        setDestinationLabelOverride("");
      } finally {
        if (!cancelled) setIsLoadingCenter(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.destinationLat, params.destinationLng, params.destinationLabel]);

  const initialRegion = useMemo(
    () => ({
      latitude: initialCenter.latitude,
      longitude: initialCenter.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    }),
    [initialCenter]
  );

  const destinationLabel = useMemo(() => {
    if (destinationPoint) {
      if (destinationLabelOverride) return destinationLabelOverride;
      return `${destinationPoint.latitude.toFixed(5)}, ${destinationPoint.longitude.toFixed(5)}`;
    }
    return typeof params.destinationLabel === "string" && params.destinationLabel.length > 0
      ? params.destinationLabel
      : "No destination selected";
  }, [destinationPoint, destinationLabelOverride, params.destinationLabel]);

  const handleGeocodeSearch = async () => {
    // Some users accidentally paste trailing characters like `|` (from copied UI text),
    // which can cause Google Geocoding to return ZERO_RESULTS.
    const qRaw = addressQuery.trim();
    const qClean = qRaw.includes("|") ? qRaw.split("|")[0].trim() : qRaw.replace(/\|/g, "").trim();
    const q = qClean.replace(/\s+/g, " ");
    if (!q) return;
    setIsGeocoding(true);
    setGeocodeError(null);
    try {
      const google = await geocodeAddressGoogle(q);
      if (google.ok) {
        const { point } = google;
        setDestinationPoint({ latitude: point.latitude, longitude: point.longitude });
        setInitialCenter({ latitude: point.latitude, longitude: point.longitude });
        setLatText(point.latitude.toString());
        setLngText(point.longitude.toString());
        setDestinationLabelOverride(point.label);
        setIsLoadingCenter(false);
        return;
      }

      // Fallback: device geocoder (works without Google Geocoding API enabled).
      const deviceResults = await Location.geocodeAsync(q);
      const first = deviceResults?.[0];
      if (first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)) {
        setDestinationPoint({ latitude: first.latitude, longitude: first.longitude });
        setInitialCenter({ latitude: first.latitude, longitude: first.longitude });
        setLatText(String(first.latitude));
        setLngText(String(first.longitude));
        setDestinationLabelOverride(q);
        setIsLoadingCenter(false);
        return;
      }

      const detail = google.errorMessage ? ` (${google.status}: ${google.errorMessage})` : ` (${google.status})`;
      setGeocodeError(`Could not find that address. Try a more specific place.${detail}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Geocoding failed.";
      setGeocodeError(message);
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Pick Destination</Text>
      <Text style={styles.subtitle}>Tap the map to drop a destination pin.</Text>

      {recents.length > 0 ? (
        <View style={styles.recentsSection}>
          <Text style={styles.recentsTitle}>Recent</Text>
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
                  setDestinationPoint({ latitude: r.latitude, longitude: r.longitude });
                  setInitialCenter({ latitude: r.latitude, longitude: r.longitude });
                  setLatText(String(r.latitude));
                  setLngText(String(r.longitude));
                  setDestinationLabelOverride(r.label);
                  setIsLoadingCenter(false);
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

      <View style={styles.addressBox}>
        <Text style={styles.addressLabel}>Type address</Text>
        <TextInput
          value={addressQuery}
          onChangeText={setAddressQuery}
          placeholder="e.g. 123 Main St, City"
          autoCapitalize="none"
          style={styles.addressInput}
        />
        <Pressable
          onPress={handleGeocodeSearch}
          disabled={isGeocoding || addressQuery.trim().length === 0}
          style={[
            styles.addressSearchBtn,
            (isGeocoding || addressQuery.trim().length === 0) && styles.addressSearchBtnDisabled,
          ]}
        >
          <Text style={styles.addressSearchBtnText}>
            {isGeocoding ? "Searching..." : "Search address"}
          </Text>
        </Pressable>
        {geocodeError ? <Text style={styles.geocodeError}>{geocodeError}</Text> : null}
      </View>

      {Platform.OS === "web" ? (
        <View style={styles.webForm}>
          <Text style={styles.webLabel}>Latitude</Text>
          <TextInput
            value={latText}
            onChangeText={setLatText}
            keyboardType="decimal-pad"
            style={styles.webInput}
          />
          <Text style={styles.webLabel}>Longitude</Text>
          <TextInput
            value={lngText}
            onChangeText={setLngText}
            keyboardType="decimal-pad"
            style={styles.webInput}
          />
          <Text style={styles.webHint}>
            Web picker uses manual lat/lng input so testing doesn’t depend on native map taps.
          </Text>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          {isLoadingCenter ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingText}>Loading map…</Text>
            </View>
          ) : (
            <DestinationPickerMap
              style={styles.map}
              initialRegion={initialRegion}
              marker={destinationPoint}
              onSelect={(p) => setDestinationPoint(p)}
              onRegionChangeComplete={(center) => setDestinationPoint(center)}
            />
          )}
        </View>
      )}

      <Text style={styles.coordsLabel}>Selected destination</Text>
      <Text style={styles.coordsValue}>{destinationLabel}</Text>

      <Pressable
        onPress={() => {
          const lat = Number(latText);
          const lng = Number(lngText);
          const point =
            Platform.OS === "web"
              ? { latitude: lat, longitude: lng }
              : destinationPoint ?? { latitude: lat, longitude: lng };
          if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;
          const labelToStore =
            destinationLabelOverride || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
          void rememberDestination({
            label: labelToStore,
            latitude: point.latitude,
            longitude: point.longitude,
          });
          router.replace({
            pathname: "/(tabs)/ride-request",
            params: {
              destinationLat: String(point.latitude),
              destinationLng: String(point.longitude),
              destinationLabel: labelToStore,
            },
          });
        }}
        disabled={isLoadingCenter || !destinationPoint}
        style={[styles.confirmButton, !destinationPoint && styles.confirmDisabled]}
      >
        <Text style={styles.confirmText}>Use this destination</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8faff",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1f2a44",
  },
  subtitle: {
    marginTop: 6,
    color: "#4b587c",
    fontSize: 14,
  },
  recentsSection: {
    marginTop: 12,
  },
  recentsTitle: {
    fontSize: 13,
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
  addressBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#ffffff",
    gap: 8,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  addressInput: {
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#f8fafc",
  },
  addressSearchBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  addressSearchBtnDisabled: {
    opacity: 0.45,
  },
  addressSearchBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  geocodeError: {
    color: "#9a3412",
    fontSize: 12,
    marginTop: 2,
  },
  mapWrap: {
    marginTop: 14,
    height: 300,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dbe4f5",
    backgroundColor: "#eef2ff",
  },
  map: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#4b587c",
    fontSize: 14,
    fontWeight: "600",
  },
  coordsLabel: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  coordsValue: {
    marginTop: 4,
    fontSize: 14,
    color: "#1f2a44",
    fontWeight: "600",
  },
  confirmButton: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmDisabled: {
    opacity: 0.45,
  },
  webForm: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#ffffff",
  },
  webLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  webInput: {
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1f2a44",
    backgroundColor: "#f8fafc",
    marginBottom: 12,
  },
  webHint: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    lineHeight: 16,
  },
  confirmText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
});

