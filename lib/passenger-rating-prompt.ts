/**
 * Deterministic ~20% chance from rideId so the same trip always gets the same
 * "ask vs skip" decision (stable for retries, no server round-trip).
 * Product target: about 1 passenger-rating prompt every 5 completed trips.
 */
export function shouldPromptPassengerRating(rideId: string): boolean {
  let h = 0;
  for (let i = 0; i < rideId.length; i++) {
    h = (Math.imul(31, h) + rideId.charCodeAt(i)) >>> 0;
  }
  return h % 5 === 0;
}
