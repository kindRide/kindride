import type { ComponentProps } from "react";
import { Platform } from "react-native";

import TripSegmentMapNative from "./TripSegmentMap.native";
import TripSegmentMapWeb from "./TripSegmentMap.web";

export type TripSegmentMapProps = ComponentProps<typeof TripSegmentMapNative>;

/**
 * Metro normally resolves `.native` / `.web` from a single import, but ESLint needs a real file here.
 */
export default function TripSegmentMap(props: TripSegmentMapProps) {
  const Comp = Platform.OS === "web" ? TripSegmentMapWeb : TripSegmentMapNative;
  return <Comp {...props} />;
}
