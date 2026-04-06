import AsyncStorage from "@react-native-async-storage/async-storage";

const FEATURE_KEY = "kindride:multileg_feature_v1";
/** `last_resort` = only when no compatible single-leg driver and trip is long (current). `sooner` = per-driver heuristic (more multi-leg prompts). */
const STYLE_KEY = "kindride:multileg_style_v1";

export type MultiLegStyle = "last_resort" | "sooner";

export async function getMultiLegFeatureEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(FEATURE_KEY);
    if (v === null) return true;
    return v === "true";
  } catch {
    return true;
  }
}

export async function setMultiLegFeatureEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(FEATURE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

export async function getMultiLegStyle(): Promise<MultiLegStyle> {
  try {
    const v = await AsyncStorage.getItem(STYLE_KEY);
    return v === "sooner" ? "sooner" : "last_resort";
  } catch {
    return "last_resort";
  }
}

export async function setMultiLegStyle(style: MultiLegStyle): Promise<void> {
  try {
    await AsyncStorage.setItem(STYLE_KEY, style);
  } catch {
    // ignore
  }
}
