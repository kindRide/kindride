import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getRidesCancelPendingUrlOrNull } from "@/lib/backend-api-urls";
import { supabase } from "@/lib/supabase";

const REASONS = [
  "Plans changed",
  "Emergency",
  "Driver is taking too long",
  "I selected the wrong destination",
  "Other",
];

export default function CancelRideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rideId: string;
    driverName?: string;
    context?: string;
  }>();

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rideId = params.rideId || "";
  const driverName = params.driverName || "";
  const context = params.context || "searching";

  const submitCancel = async () => {
    if (!selectedReason || !rideId) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const url = getRidesCancelPendingUrlOrNull();
      if (!url) throw new Error("Backend not configured.");

      if (!supabase) throw new Error("Supabase not configured.");
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      if (!token) throw new Error("Not signed in.");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rideId, reason: selectedReason }),
      });

      if (!response.ok) {
        throw new Error("Could not cancel ride. Please try again.");
      }

      Alert.alert("Ride cancelled", "Your driver has been notified.");
      router.replace("/(tabs)");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "An unknown error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>{"<"}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Cancel Ride</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.driverName}>{driverName || "Your ride"}</Text>
        <Text style={styles.contextText}>
          {context === "accepted" ? "Driver has been assigned" : "Still searching for a driver"}
        </Text>

        <Text style={styles.sectionLabel}>Why are you cancelling?</Text>

        <View style={styles.radioList}>
          {REASONS.map((reason) => {
            const isSelected = selectedReason === reason;
            return (
              <Pressable
                key={reason}
                style={styles.radioRow}
                onPress={() => setSelectedReason(reason)}
              >
                <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                  {isSelected && <View style={styles.radioFill} />}
                </View>
                <Text style={styles.radioText}>{reason}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <Pressable
            style={[styles.cancelButton, (!selectedReason || isSubmitting) && styles.cancelButtonDisabled]}
            disabled={!selectedReason || isSubmitting}
            onPress={submitCancel}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel this ride</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  backButton: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0" },
  backText: { fontSize: 28, lineHeight: 28, color: "#0f172a", marginTop: -2 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  headerSpacer: { width: 40, height: 40 },
  
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  driverName: { fontSize: 24, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  contextText: { fontSize: 16, color: "#64748b", marginBottom: 32 },
  
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 16 },
  
  radioList: { backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", overflow: "hidden" },
  radioRow: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", marginRight: 14 },
  radioCircleSelected: { borderColor: "#0d9488" },
  radioFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0d9488" },
  radioText: { fontSize: 16, fontWeight: "500", color: "#0f172a" },
  
  footer: { marginTop: "auto", marginBottom: 20, paddingTop: 20 },
  errorText: { color: "#ef4444", fontSize: 14, textAlign: "center", marginBottom: 12, fontWeight: "500" },
  cancelButton: { 
    backgroundColor: "#0d9488", 
    borderRadius: 14, 
    paddingVertical: 14, 
    alignItems: "center", 
    justifyContent: "center",
    minHeight: 52 
  },
  cancelButtonDisabled: { opacity: 0.6 },
  cancelButtonText: { 
    color: "#ffffff", 
    fontSize: 16, 
    fontWeight: "700" 
  },
});