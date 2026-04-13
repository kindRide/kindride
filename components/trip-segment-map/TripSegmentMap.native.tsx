import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { LatLng } from "@/lib/haversine-miles";

type RegionLike = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type TripSegmentMapProps = {
  style?: StyleProp<ViewStyle>;
  mapRegion: RegionLike;
  pickupPoint: LatLng | null;
  dropoffPoint: LatLng | null;
  driverLocation?: LatLng | null;
  useGoogleProvider: boolean;
};

function DriverMarkerView() {
  return (
    <View style={markerStyles.wrap}>
      <Text style={markerStyles.icon}>🚗</Text>
    </View>
  );
}

const markerStyles = StyleSheet.create({
  wrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#2563eb",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#ffffff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  icon: { fontSize: 20 },
});

export default function TripSegmentMap(props: TripSegmentMapProps) {
  const { t } = useTranslation();
  const { style, mapRegion, pickupPoint, dropoffPoint, driverLocation, useGoogleProvider } = props;

  return (
    <MapView
      style={style}
      region={mapRegion}
      provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {pickupPoint ? <Marker coordinate={pickupPoint} title={t("pickup")} pinColor="#16a34a" /> : null}
      {dropoffPoint ? <Marker coordinate={dropoffPoint} title={t("dropoff")} pinColor="#2563eb" /> : null}
      {driverLocation ? (
        <Marker coordinate={driverLocation} title={t("driver")} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <DriverMarkerView />
        </Marker>
      ) : null}
      {pickupPoint && dropoffPoint ? (
        <Polyline coordinates={[pickupPoint, dropoffPoint]} strokeColor="#2563eb" strokeWidth={3} />
      ) : null}
    </MapView>
  );
}
