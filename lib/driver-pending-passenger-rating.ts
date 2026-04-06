import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kindride_driver_pending_passenger_rating_v1";

export type PendingPassengerRating = {
  rideId: string;
  passengerId: string;
};

export async function savePendingPassengerRating(p: PendingPassengerRating): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // "Native module is null, cannot access legacy storage" — Expo Go / broken native link; non-fatal.
  }
}

export async function loadPendingPassengerRating(): Promise<PendingPassengerRating | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (
      typeof j === "object" &&
      j !== null &&
      "rideId" in j &&
      "passengerId" in j &&
      typeof (j as PendingPassengerRating).rideId === "string" &&
      typeof (j as PendingPassengerRating).passengerId === "string"
    ) {
      return { rideId: (j as PendingPassengerRating).rideId, passengerId: (j as PendingPassengerRating).passengerId };
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingPassengerRating(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* same as save — storage may be unavailable */
  }
}
