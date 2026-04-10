import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return (
    <View style={props.style}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          backgroundColor: "#eef2ff",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#1f2a44" }}>{t("mapPicker")}</Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: "#475569" }}>
          {t("destinationMapPickingMobileOnly")}
        </Text>
      </View>
    </View>
  );
}
