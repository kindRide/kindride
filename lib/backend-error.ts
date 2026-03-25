/**
 * FastAPI often returns JSON: { "detail": "..." } or { "detail": [ { "msg": "..." } ] }.
 */

export function formatBackendErrorBody(raw: string, httpStatus: number): string {
  if (!raw?.trim()) {
    return `Backend responded ${httpStatus}`;
  }
  try {
    const parsed = JSON.parse(raw) as {
      detail?: string | Array<{ msg?: string }>;
      message?: string;
      error?: string;
    };
    const d = parsed?.detail;
    if (Array.isArray(d)) {
      return d
        .map((item) => (typeof item?.msg === "string" ? item.msg : JSON.stringify(item)))
        .join("; ");
    }
    if (typeof d === "string") {
      return d;
    }
    if (parsed?.message && typeof parsed.message === "string") {
      return parsed.message;
    }
    if (parsed?.error && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // not JSON
  }
  return raw;
}
