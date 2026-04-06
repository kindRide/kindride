import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth";

/**
 * Root `/` route:
 *  - While session is loading  → show loading screen
 *  - Authenticated             → go straight into the app (session persists across restarts)
 *  - Not authenticated         → go to sign-in
 */
export default function RootIndex() {
  const { loading, session } = useAuth();

  if (loading) {
    return <Redirect href="/loading" />;
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/(tabs)" />;
}
