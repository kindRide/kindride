export type RideLifecycleContext =
  | "ride-request"
  | "incoming-ride"
  | "driver-dashboard"
  | "active-trip";

type RideLifecyclePayload = Record<string, unknown>;

export function logRideLifecycleEvent(
  context: RideLifecycleContext,
  event: string,
  payload: RideLifecyclePayload
) {
  const stamp = new Date().toISOString();
  // Lightweight structured logs for polling/transition diagnosis.
  console.info(`[ride-lifecycle][${context}][${event}]`, {
    at: stamp,
    ...payload,
  });
}

export function logRideStatusTransition(
  context: RideLifecycleContext,
  rideId: string,
  previousStatus: string | null,
  nextStatus: string | null,
  payload: RideLifecyclePayload = {}
) {
  if (previousStatus === nextStatus) return;
  logRideLifecycleEvent(context, "status_transition", {
    rideId,
    previousStatus,
    nextStatus,
    ...payload,
  });
}

export function createRideTraceId(
  context: RideLifecycleContext,
  rideId: string,
  stage: string
) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const ride = rideId ? rideId.slice(0, 8) : "no-ride";
  return `${context}:${stage}:${ride}:${stamp}:${rand}`;
}

export function withRideTraceHeaders(
  headers: Record<string, string>,
  traceId: string
) {
  return {
    ...headers,
    "X-KindRide-Trace-Id": traceId,
  };
}
