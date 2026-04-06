import type { DriverCard, TravelDirection } from "@/lib/matching-drivers";

export function isDriverDirectionCompatible(
  driverDirection: TravelDirection,
  destinationDirection: TravelDirection
): boolean {
  return driverDirection === destinationDirection;
}

export function shouldUseMultiLeg(
  driverA: DriverCard,
  destinationDirection: TravelDirection,
  routeMiles: number | null
): boolean {
  // Last-resort heuristic:
  // - If trip is short, don't use multi-leg at all.
  // - If driver is already going in the right direction, treat as single-leg.
  // - Otherwise, consider multi-leg only when the trip is likely "far".
  const miles = routeMiles ?? null;
  if (miles !== null && Number.isFinite(miles) && miles < 8) return false;
  return !(
    driverA.intent === "already_going" &&
    isDriverDirectionCompatible(driverA.headingDirection, destinationDirection)
  );
}

export function computeNeedsHandoffForTrip(
  drivers: DriverCard[],
  destinationDirection: TravelDirection,
  routeMiles: number | null
): boolean {
  // Multi-leg is a last resort ONLY when we cannot find a clear single-leg driver
  // (already going + compatible direction) for a far trip.
  const hasGoodSingleLeg = drivers.some(
    (d) =>
      d.intent === "already_going" &&
      isDriverDirectionCompatible(d.headingDirection, destinationDirection)
  );
  if (hasGoodSingleLeg) return false;

  const miles = routeMiles ?? null;
  if (miles !== null && Number.isFinite(miles) && miles < 8) return false;
  return true;
}

export function pickDriverBForDirection(
  drivers: DriverCard[],
  driverAId: string,
  destinationDirection: TravelDirection
): DriverCard | null {
  const compatible = drivers.filter(
    (d) =>
      d.id !== driverAId &&
      isDriverDirectionCompatible(d.headingDirection, destinationDirection)
  );
  if (compatible.length === 0) return null;
  return compatible.sort((a, b) => a.etaMinutes - b.etaMinutes)[0];
}

