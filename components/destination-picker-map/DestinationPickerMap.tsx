import type { ComponentProps } from "react";
import { Platform } from "react-native";

import DestinationPickerMapNative from "./DestinationPickerMap.native";
import DestinationPickerMapWeb from "./DestinationPickerMap.web";

export type DestinationPickerMapProps = ComponentProps<typeof DestinationPickerMapNative>;

/**
 * Metro normally resolves `.native` / `.web` from a single import, but ESLint needs a real file here.
 */
export default function DestinationPickerMap(props: DestinationPickerMapProps) {
  const Comp = Platform.OS === "web" ? DestinationPickerMapWeb : DestinationPickerMapNative;
  return <Comp {...props} />;
}
