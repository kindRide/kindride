/**
 * Derives KindRide FastAPI URLs from EXPO_PUBLIC_POINTS_API_URL.
 * Convention: that env var points at POST /points/award (see backend/README.md).
 */

export function getBackendBaseUrl(): string {
  const award = process.env.EXPO_PUBLIC_POINTS_API_URL?.trim();
  if (!award) {
    throw new Error("EXPO_PUBLIC_POINTS_API_URL is not configured.");
  }
  const base = award.replace(/\/points\/award\/?$/, "");
  if (base === award) {
    throw new Error(
      "EXPO_PUBLIC_POINTS_API_URL must end with /points/award " +
        "(example: http://192.168.1.10:8000/points/award)."
    );
  }
  return base;
}

export function getBackendBaseUrlOrNull(): string | null {
  try {
    return getBackendBaseUrl();
  } catch {
    return null;
  }
}

export function getRidesCompleteUrl(): string {
  return `${getBackendBaseUrl()}/rides/complete`;
}

export function getPointsRatingBonusUrl(): string {
  return `${getBackendBaseUrl()}/points/rating-bonus`;
}

export function getPassengersRateUrl(): string {
  return `${getBackendBaseUrl()}/passengers/rate`;
}

export function getPassengerReputationUrl(passengerId: string): string {
  return `${getBackendBaseUrl()}/passengers/${encodeURIComponent(passengerId)}/reputation`;
}

/** Same paths as above, without throwing when EXPO env is missing (UI can disable actions). */
export function getRidesCompleteUrlOrNull(): string | null {
  const b = getBackendBaseUrlOrNull();
  return b ? `${b}/rides/complete` : null;
}

export function getPassengerReputationUrlOrNull(passengerId: string): string | null {
  const b = getBackendBaseUrlOrNull();
  return b ? `${b}/passengers/${encodeURIComponent(passengerId)}/reputation` : null;
}
