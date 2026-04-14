import { useCallback, useEffect, useRef, useState } from "react";
import { getBackendBaseUrlOrNull } from "@/lib/backend-api-urls";

export type BackendStatus = "unknown" | "waking" | "online" | "offline";

/**
 * Polls GET /health every `intervalMs` while the component is mounted.
 * Returns the current status and a manual `retry` trigger.
 *
 * - "unknown"  — first check not done yet
 * - "waking"   — server responded but took > 3 s (Render cold-start)
 * - "online"   — healthy
 * - "offline"  — no response or non-2xx after 10 s
 */
export function useBackendHealth(intervalMs = 30_000) {
  const [status, setStatus] = useState<BackendStatus>("unknown");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    const base = getBackendBaseUrlOrNull();
    if (!base) {
      setStatus("offline");
      return;
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      if (res.ok) {
        setStatus(elapsed > 3_000 ? "waking" : "online");
      } else {
        setStatus("offline");
      }
    } catch {
      setStatus(Date.now() - start >= 10_000 ? "waking" : "offline");
    }
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    void check();
    timerRef.current = setInterval(() => void check(), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [check, intervalMs]);

  return { status, lastChecked, retry: check };
}
