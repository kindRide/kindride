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

export default function TripSegmentMap(_props: TripSegmentMapProps) {
  // Web build: we intentionally do not import `react-native-maps`.
  // `Active Trip` already shows a placeholder on web, so this can be a no-op.
  return null;
}
