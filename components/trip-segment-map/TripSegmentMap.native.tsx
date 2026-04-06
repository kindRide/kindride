import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { StyleProp, ViewStyle } from "react-native";

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

export default function TripSegmentMap(props: TripSegmentMapProps) {
  const { style, mapRegion, pickupPoint, dropoffPoint, driverLocation, useGoogleProvider } = props;

  return (
    <MapView
      style={style}
      initialRegion={mapRegion}
      provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {pickupPoint ? <Marker coordinate={pickupPoint} title="Pickup" pinColor="#16a34a" /> : null}
      {dropoffPoint ? <Marker coordinate={dropoffPoint} title="Drop-off" pinColor="#2563eb" /> : null}
      {driverLocation ? <Marker coordinate={driverLocation} title="Driver" pinColor="purple" /> : null}
      {pickupPoint && dropoffPoint ? (
        <Polyline coordinates={[pickupPoint, dropoffPoint]} strokeColor="#2563eb" strokeWidth={3} />
      ) : null}
    </MapView>
  );
}
