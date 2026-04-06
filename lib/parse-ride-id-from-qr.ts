/**
 * Extract a KindRide ride UUID from QR / barcode text.
 * Accepts: raw UUID, deep link kindride://incoming-ride?rideId=..., or https URL with rideId/rideid.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_IN_TEXT = new RegExp(
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
  "i"
);

function normalizeUuid(s: string): string | null {
  const t = s.trim();
  return UUID_RE.test(t) ? t.toLowerCase() : null;
}

export function extractRideIdFromQrPayload(raw: string): string | null {
  const trimmed = raw.trim();
  const direct = normalizeUuid(trimmed);
  if (direct) return direct;

  if (trimmed.startsWith("kindride://")) {
    const qIdx = trimmed.indexOf("?");
    if (qIdx >= 0) {
      const qs = trimmed.slice(qIdx + 1);
      const params = new URLSearchParams(qs);
      for (const key of ["rideId", "rideid"]) {
        const v = params.get(key);
        if (v) {
          const n = normalizeUuid(decodeURIComponent(v));
          if (n) return n;
        }
      }
    }
  }

  if (trimmed.includes("?")) {
    const q = trimmed.includes("://") ? trimmed.split("?")[1] ?? "" : trimmed;
    const params = new URLSearchParams(q.includes("&") || q.includes("=") ? q : "");
    for (const key of ["rideId", "rideid", "id"]) {
      const fromParsed = params.get(key);
      if (fromParsed) {
        const n = normalizeUuid(fromParsed);
        if (n) return n;
      }
    }
    const rideMatch = trimmed.match(/[?&](rideId|rideid)=([^&]+)/i);
    if (rideMatch?.[2]) {
      const decoded = decodeURIComponent(rideMatch[2].trim());
      const n = normalizeUuid(decoded);
      if (n) return n;
    }
  }

  const anywhere = trimmed.match(UUID_IN_TEXT);
  if (anywhere?.[0]) return anywhere[0].toLowerCase();

  return null;
}

/** Payload encoded in passenger QR (deep link; scanner extracts ride id). */
export function rideInviteQrValue(rideId: string): string {
  return `kindride://incoming-ride?rideId=${encodeURIComponent(rideId.trim())}`;
}
