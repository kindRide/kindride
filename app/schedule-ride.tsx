import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { getRidesRequestUrlOrNull } from "@/lib/backend-api-urls";
import { supabase } from "@/lib/supabase";

function parseScheduleInput(raw: string): string | null {
  const value = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const localDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );
  if (Number.isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

export default function ScheduleRideScreen() {
  const router = useRouter();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [scheduleInput, setScheduleInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scheduleIso = useMemo(() => parseScheduleInput(scheduleInput), [scheduleInput]);

  const submit = async () => {
    if (!pickup.trim() || !dropoff.trim() || !scheduleIso) {
      Alert.alert("Missing details", "Enter pickup, dropoff, and a valid date like YYYY-MM-DD HH:mm.");
      return;
    }

    const url = getRidesRequestUrlOrNull();
    if (!url || !supabase) {
      Alert.alert("Backend unavailable", "Ride scheduling is not configured right now.");
      return;
    }

    setSubmitting(true);
    try {
      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data.session?.access_token;
      if (!accessToken) {
        throw new Error("missing-token");
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          pickup: pickup.trim(),
          dropoff: dropoff.trim(),
          scheduled_for: scheduleIso,
        }),
      });

      if (!response.ok) {
        throw new Error("schedule-failed");
      }

      Alert.alert("Ride scheduled", "Your trip has been saved for later.");
      router.replace("/(tabs)/ride-request");
    } catch {
      Alert.alert("Could not schedule ride", "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>{"< Back"}</Text>
            </Pressable>
            <Text style={styles.title}>Schedule Ride</Text>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.subtitle}>
            Plan a ride ahead of time and we will save it for your requested departure window.
          </Text>

          <View style={styles.card}>
            <Field
              label="Pickup location"
              placeholder="Enter pickup address"
              value={pickup}
              onChangeText={setPickup}
            />
            <Field
              label="Dropoff location"
              placeholder="Enter dropoff address"
              value={dropoff}
              onChangeText={setDropoff}
            />
            <Field
              label="Date and time"
              placeholder="YYYY-MM-DD HH:mm"
              value={scheduleInput}
              onChangeText={setScheduleInput}
              last
            />
          </View>

          <Text style={styles.helperText}>
            Use your local time. We will convert it to UTC before sending it to the backend.
          </Text>

          <Pressable
            onPress={() => void submit()}
            disabled={submitting}
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>Schedule Ride</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  last,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldWrap, !last && styles.fieldBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        style={styles.fieldInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    minWidth: 72,
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerSpacer: {
    width: 72,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748b",
    marginBottom: 18,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  fieldWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldInput: {
    fontSize: 16,
    color: "#0f172a",
  },
  helperText: {
    marginTop: 12,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
  },
  submitButton: {
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: "#0d9488",
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
