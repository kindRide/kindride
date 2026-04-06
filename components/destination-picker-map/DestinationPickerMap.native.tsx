import MapView, { Marker } from "react-native-maps";
import type { StyleProp, ViewStyle } from "react-native";

type LatLng = {
  latitude: number;
  longitude: number;
};

type RegionLike = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type DestinationPickerMapProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion: RegionLike;
  marker: LatLng | null;
  onSelect: (point: LatLng) => void;
  onRegionChangeComplete?: (center: LatLng) => void;
};

export default function DestinationPickerMap(props: DestinationPickerMapProps) {
  const { style, initialRegion, marker, onSelect, onRegionChangeComplete } = props;
  return (
    <MapView
      style={style}
      initialRegion={initialRegion}
      onPress={(e) => onSelect(e.nativeEvent.coordinate)}
      onRegionChangeComplete={(region) =>
        onRegionChangeComplete?.({
          latitude: region.latitude,
          longitude: region.longitude,
        })
      }
      showsUserLocation
      showsMyLocationButton
    >
      {marker ? <Marker coordinate={marker} title="Destination" /> : null}
    </MapView>
  );
}

