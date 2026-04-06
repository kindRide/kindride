import { useEffect, useRef } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useRouter, type Href } from "expo-router";

/**
 * Registers expo-notifications behavior without static imports (Expo Go Android safety).
 * - Foreground: show alert/banner when a notification arrives.
 * - Response (tap): if payload includes `data.url` (string path starting with `/`), navigate with expo-router.
 *
 * Backend / campaign contract: set `data: { url: "/(tabs)" }` (or another in-app path) on the push payload.
 */
export function useNotificationResponseRouting() {
  const router = useRouter();
  const coldStartHandled = useRef(false);

  useEffect(() => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return;
    }

    let cancelled = false;
    let removeListener = () => {};

    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        // Handle cold start (app opened by tapping a push notification when fully closed)
        if (!coldStartHandled.current) {
          coldStartHandled.current = true;
          const lastResponse = await Notifications.getLastNotificationResponseAsync();
          if (lastResponse && !cancelled) {
            const data = lastResponse.notification.request.content.data;
            if (data && typeof data === "object" && "url" in data) {
              const url = (data as { url: string }).url;
              if (typeof url === "string" && url.startsWith("/")) {
                setTimeout(() => {
                  if (!cancelled) router.push(url as Href);
                }, 100); // slight delay ensures the root layout is fully mounted
              }
            }
          }
        }

        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          if (!data || typeof data !== "object") return;
          const url = "url" in data && typeof (data as { url?: unknown }).url === "string" ? (data as { url: string }).url : null;
          if (url && url.startsWith("/")) {
            router.push(url as Href);
          }
        });

        if (cancelled) {
          sub.remove();
          return;
        }
        removeListener = () => sub.remove();
      } catch {
        /* Expo Go or missing native module — ignore */
      }
    })();

    return () => {
      cancelled = true;
      removeListener();
    };
  }, [router]);
}
