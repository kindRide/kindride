import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

import { supabase } from "@/lib/supabase";

type VehicleForm = {
  car_make: string;
  car_model: string;
  car_color: string;
  car_year: string;
  car_plate: string;
};

const EMPTY: VehicleForm = {
  car_make: "",
  car_model: "",
  car_color: "",
  car_year: "",
  car_plate: "",
};

export default function VehicleDetailsScreen() {
  const router = useRouter();
  const [form, setForm] = useState<VehicleForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Load existing vehicle details
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setUserId(session.user.id);
      const { data } = await supabase
        .from("profiles")
        .select("car_make,car_model,car_color,car_year,car_plate")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setForm({
          car_make:  data.car_make  ?? "",
          car_model: data.car_model ?? "",
          car_color: data.car_color ?? "",
          car_year:  data.car_year  ?? "",
          car_plate: data.car_plate ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const isComplete =
    form.car_make.trim().length > 0 &&
    form.car_model.trim().length > 0 &&
    form.car_color.trim().length > 0 &&
    form.car_plate.trim().length > 0;

  const handleSave = async () => {
    if (!isComplete) {
      Alert.alert("Missing details", "Please fill in make, model, color, and plate number.");
      return;
    }
    if (!supabase || !userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        car_make:  form.car_make.trim(),
        car_model: form.car_model.trim(),
        car_color: form.car_color.trim(),
        car_year:  form.car_year.trim() || null,
        car_plate: form.car_plate.trim().toUpperCase(),
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </Pressable>
            <Text style={styles.title}>My Vehicle</Text>
            <View style={{ width: 60 }} />
          </View>

          <Text style={styles.subtitle}>
            Passengers see your vehicle details before requesting a ride. This builds trust.
          </Text>

          {/* Car icon */}
          <View style={styles.carIconWrap}>
            <Text style={styles.carIcon}>🚗</Text>
            {isComplete && (
              <View style={styles.completeBadge}>
                <Text style={styles.completeBadgeText}>✓ Complete</Text>
              </View>
            )}
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Field
              label="Car Make *"
              placeholder="e.g. Toyota"
              value={form.car_make}
              onChangeText={(v) => setForm((f) => ({ ...f, car_make: v }))}
            />
            <Field
              label="Car Model *"
              placeholder="e.g. Camry"
              value={form.car_model}
              onChangeText={(v) => setForm((f) => ({ ...f, car_model: v }))}
            />
            <Field
              label="Car Color *"
              placeholder="e.g. Silver"
              value={form.car_color}
              onChangeText={(v) => setForm((f) => ({ ...f, car_color: v }))}
            />
            <Field
              label="Year (optional)"
              placeholder="e.g. 2019"
              value={form.car_year}
              onChangeText={(v) => setForm((f) => ({ ...f, car_year: v }))}
              keyboardType="numeric"
              maxLength={4}
            />
            <Field
              label="License Plate *"
              placeholder="e.g. ABC-1234"
              value={form.car_plate}
              onChangeText={(v) => setForm((f) => ({ ...f, car_plate: v.toUpperCase() }))}
              autoCapitalize="characters"
              last
            />
          </View>

          {/* Preview */}
          {isComplete && (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Passengers will see:</Text>
              <Text style={styles.previewText}>
                {form.car_color} {form.car_make} {form.car_model}
                {form.car_year ? ` (${form.car_year})` : ""} · {form.car_plate.toUpperCase()}
              </Text>
            </View>
          )}

          {/* Save button */}
          <Pressable
            style={[styles.saveBtn, !isComplete && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || !isComplete}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Vehicle Details</Text>
            )}
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field component ───────────────────────────────────────────────────────────
function Field({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  maxLength,
  autoCapitalize,
  last,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "numeric";
  maxLength?: number;
  autoCapitalize?: "none" | "characters" | "words";
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldWrap, !last && styles.fieldBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize ?? "words"}
        returnKeyType="next"
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 20, paddingBottom: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backBtn: { paddingVertical: 4, paddingRight: 12 },
  backBtnText: { fontSize: 17, color: "#2563eb", fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  carIconWrap: { alignItems: "center", marginBottom: 20 },
  carIcon: { fontSize: 56 },
  completeBadge: {
    marginTop: 8,
    backgroundColor: "#dcfce7",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  completeBadgeText: { fontSize: 13, fontWeight: "700", color: "#15803d" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  fieldWrap: { paddingHorizontal: 16, paddingVertical: 14 },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldInput: { fontSize: 16, color: "#0f172a", fontWeight: "500" },
  preview: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93c5fd",
    padding: 14,
    marginBottom: 20,
  },
  previewLabel: { fontSize: 11, fontWeight: "700", color: "#1d4ed8", marginBottom: 4, textTransform: "uppercase" },
  previewText: { fontSize: 15, fontWeight: "600", color: "#1e40af" },
  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: "#94a3b8" },
  saveBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
