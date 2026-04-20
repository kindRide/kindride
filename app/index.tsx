import { useEffect, useState } from "react";
import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * Root `/` route:
 *  - While session is loading  → loading screen
 *  - Not authenticated         → sign-in
 *  - Authenticated, no ToS     → terms-of-service (blocks the app until accepted)
 *  - Authenticated, ToS OK     → into the app
 */
export default function RootIndex() {
  const { loading, session } = useAuth();
  const [tosChecking, setTosChecking] = useState(true);
  const [tosAccepted, setTosAccepted] = useState(false);

  useEffect(() => {
    if (!session || !supabase) {
      setTosChecking(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("tos_accepted_at")
          .eq("id", session.user.id)
          .single();
        setTosAccepted(!!data?.tos_accepted_at);
      } catch {
        // Network failure — fail open so a bad connection doesn't permanently lock users out.
        setTosAccepted(true);
      } finally {
        setTosChecking(false);
      }
    })();
  }, [session]);

  if (loading || (session && tosChecking)) {
    return <Redirect href="/loading" />;
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  if (!tosAccepted) {
    return <Redirect href="/terms-of-service" />;
  }

  return <Redirect href="/(tabs)" />;
}
