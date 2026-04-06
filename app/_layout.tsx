import "../global.css";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { I18nManager, LogBox, View } from "react-native";
import "react-native-reanimated";
import { StripeProvider } from "@stripe/stripe-react-native";

import { I18nextProvider } from "react-i18next";

import { AuthProvider } from "@/lib/auth";
import i18n from "@/lib/i18n";
import { useNotificationResponseRouting } from "@/lib/notifications/notificationResponseRouting";
import { ONBOARDING_SEEN_KEY } from "./onboarding";

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

/**
 * Single Stack + file-based routes (no conditional screen lists).
 * StatusBar sits outside Stack so Stack only contains navigator screens (no Expo warning).
 */
export default function RootLayout() {
  useNotificationResponseRouting();
  const router = useRouter();
  const [language, setLanguage] = useState(i18n.language);

  // Show onboarding on very first launch only (before auth check).
  // index.tsx handles auth gating after onboarding is done.
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((seen) => {
      if (!seen) router.replace("/onboarding");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Expo Go on some Android builds cannot acquire a wake lock; dependencies may still call keep-awake.
    // Suppress the warning with multiple pattern matches for robustness
    LogBox.ignoreLogs([
      /Unable to activate keep awake/i,
      /Error: Unable to activate keep awake/i,
      /keep awake/i,
    ]);

    // Handle RTL for Arabic
    const handleLanguageChange = (lng: string) => {
      I18nManager.forceRTL(lng === 'ar');
      setLanguage(lng);
    };

    i18n.on('languageChanged', handleLanguageChange);
    handleLanguageChange(i18n.language); // Set initial

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <ThemeProvider value={DefaultTheme}>
            <View style={{ flex: 1 }}>
              <StatusBar style="auto" />
              <Stack
                screenOptions={{
                  headerShown: false,
                }}
              />
            </View>
          </ThemeProvider>
        </AuthProvider>
      </I18nextProvider>
    </StripeProvider>
  );
}
