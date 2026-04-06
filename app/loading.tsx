import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/lib/auth";

export default function LoadingScreen() {
  const router = useRouter();
  const { loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // Auth resolved — leave this route so we never sit on a screen that was conditionally removed.
    router.replace("/(tabs)");
  }, [loading, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.text}>Loading KindRide...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: "#4b587c",
  },
});
