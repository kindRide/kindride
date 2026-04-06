import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kindride:multileg_consent_v1";

export async function getMultiLegConsent(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === "true";
  } catch {
    return false;
  }
}

export async function setMultiLegConsent(consented: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, consented ? "true" : "false");
  } catch {
    // non-fatal: treat as non-persistent device
  }
}

/**
 * Even if the user already consented historically, we still ask sometimes.
 * Product goal: occasional reaffirmation without nagging.
 */
export function shouldRandomlyReaskConsent(): boolean {
  return Math.random() < 0.2; // ~1 in 5
}

