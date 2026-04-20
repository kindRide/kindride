"use no memo";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type PassengerPreference =
  | "no_preference"
  | "women_only"
  | "elderly"
  | "children_teens"
  | "women_children";

const PREFERENCE_OPTIONS: {
  key: PassengerPreference;
  icon: string;
  title: string;
  sub: string;
}[] = [
  {
    key: "no_preference",
    icon: "🤝",
    title: "No preference — everyone welcome",
    sub: "You're open to giving rides to anyone in the community.",
  },
  {
    key: "women_only",
    icon: "👩",
    title: "Women and girls only",
    sub: "You prefer to give rides to women and girls. This may reflect a personal or religious choice and is fully respected.",
  },
  {
    key: "elderly",
    icon: "👴",
    title: "Older adults (60+) preferred",
    sub: "You'd like to prioritise giving rides to elderly community members who may have limited mobility or transport options.",
  },
  {
    key: "children_teens",
    icon: "🧒",
    title: "Children and teenagers (with guardian)",
    sub: "You'd like to help young passengers. Passengers under 18 must be accompanied by a parent or legal guardian.",
  },
  {
    key: "women_children",
    icon: "👩‍👦",
    title: "Women and children preferred",
    sub: "You'd like to assist women and children in the community. This preference is common for religious or cultural reasons.",
  },
];

export default function DriverPreferencesScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [preference, setPreference] = useState<PassengerPreference>("no_preference");
  const [insuranceConfirmed, setInsuranceConfirmed] = useState(false);
  const [insuranceExpiry, setInsuranceExpiry] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session || !supabase) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("passenger_preference, insurance_confirmed, insurance_expiry")
          .eq("id", session.user.id)
          .single();
        if (data) {
          setPreference((data.passenger_preference as PassengerPreference) ?? "no_preference");
          setInsuranceConfirmed(data.insurance_confirmed ?? false);
          setInsuranceExpiry(data.insurance_expiry ?? "");
        }
      } catch {
        // silently ignore — defaults remain
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const handleSave = async () => {
    if (!session || !supabase) return;

    // Validate insurance expiry format if provided
    if (insuranceExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(insuranceExpiry)) {
      Alert.alert("Invalid date", "Please enter the insurance expiry date as YYYY-MM-DD (e.g. 2027-06-30).");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          passenger_preference: preference,
          insurance_confirmed: insuranceConfirmed,
          insurance_expiry: insuranceExpiry || null,
        })
        .eq("id", session.user.id);

      if (error) {
        Alert.alert("Error", "Could not save your preferences. Please try again.");
        return;
      }
      Alert.alert("Saved", "Your driver preferences have been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Driver Settings</Text>
        <Text style={styles.heroTitle}>Passenger Preferences</Text>
        <Text style={styles.heroSub}>
          Choose the type of community member you'd most like to help.
          This will filter the ride requests you see.
        </Text>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* Preference options */}
        <Text style={styles.sectionLabel}>WHO WOULD YOU LIKE TO HELP?</Text>
        {PREFERENCE_OPTIONS.map((opt, i) => {
          const selected = preference === opt.key;
          return (
            <Reanimated.View key={opt.key} entering={FadeInDown.delay(i * 60).springify()}>
              <Pressable
                style={[styles.optionCard, selected && styles.optionCardSelected]}
                onPress={() => setPreference(opt.key)}
              >
                <View style={styles.optionLeft}>
                  <Text style={styles.optionIcon}>{opt.icon}</Text>
                </View>
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
                    {opt.title}
                  </Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            </Reanimated.View>
          );
        })}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Insurance declaration */}
        <Text style={styles.sectionLabel}>INSURANCE DECLARATION</Text>
        <Reanimated.View entering={FadeInDown.delay(350).springify()} style={styles.insuranceCard}>
          <Text style={styles.insuranceHeadline}>
            Do you have valid auto insurance for your vehicle?
          </Text>
          <Text style={styles.insuranceSub}>
            As a driver on KindRide, you are required by law to maintain at minimum the
            state-required auto liability coverage. KindRide does not provide insurance —
            please confirm you have verified your policy covers community rideshare use.
          </Text>

          {/* Yes/No toggle */}
          <View style={styles.insuranceToggleRow}>
            <Pressable
              style={[styles.toggleBtn, insuranceConfirmed && styles.toggleBtnYes]}
              onPress={() => setInsuranceConfirmed(true)}
            >
              <Text style={[styles.toggleBtnText, insuranceConfirmed && styles.toggleBtnTextActive]}>
                ✓ Yes, I have valid insurance
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, !insuranceConfirmed && styles.toggleBtnNo]}
              onPress={() => setInsuranceConfirmed(false)}
            >
              <Text style={[styles.toggleBtnText, !insuranceConfirmed && styles.toggleBtnTextNo]}>
                No / Not yet
              </Text>
            </Pressable>
          </View>

          {insuranceConfirmed && (
            <Reanimated.View entering={FadeInDown.duration(300)}>
              <Text style={styles.expiryLabel}>Insurance policy expiry date (YYYY-MM-DD)</Text>
              <View style={styles.expiryInputWrap}>
                <Text style={styles.expiryInputText}>
                  {insuranceExpiry || "e.g. 2027-06-30"}
                </Text>
              </View>
              {/* Inline date entry — simple text field via TextInput */}
              <ExpiryInput value={insuranceExpiry} onChange={setInsuranceExpiry} />
              <Text style={styles.expiryHint}>
                We may remind you before your policy lapses. Expired policies will be flagged to admins.
              </Text>
            </Reanimated.View>
          )}

          {!insuranceConfirmed && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                You must hold valid insurance to legally drive in the US. You can still save
                your preference settings, but you will not be shown as an available driver until
                you confirm your insurance.
              </Text>
            </View>
          )}
        </Reanimated.View>

        {/* Save button */}
        <Reanimated.View entering={FadeInDown.delay(400).springify()} style={{ marginTop: 24 }}>
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnLoading]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Preferences</Text>
            )}
          </Pressable>
        </Reanimated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Minimal inline TextInput wrapper to keep imports clean
import { TextInput } from "react-native";
function ExpiryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      style={styles.expiryField}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      placeholderTextColor="#94a3b8"
      keyboardType="numeric"
      maxLength={10}
      returnKeyType="done"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Hero
  hero: { paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20 },
  backBtn: { marginBottom: 16, alignSelf: "flex-start", paddingVertical: 8, paddingRight: 16 },
  backBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "600" },
  eyebrow: {
    color: "#5eead4", fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6,
  },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "800", marginBottom: 8 },
  heroSub: { color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 20 },

  // Content
  content: { padding: 16, gap: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#94a3b8",
    letterSpacing: 0.8, textTransform: "uppercase",
    marginTop: 8, marginBottom: 4, paddingHorizontal: 4,
  },
  divider: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 16 },

  // Option cards
  optionCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#fff", borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  optionCardSelected: { borderColor: "#0d9488", backgroundColor: "#f0fdfa" },
  optionLeft: { paddingTop: 2 },
  optionIcon: { fontSize: 24 },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b", marginBottom: 4, lineHeight: 20 },
  optionTitleSelected: { color: "#0f766e" },
  optionSub: { fontSize: 12.5, color: "#64748b", lineHeight: 19 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: "#cbd5e1",
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  radioSelected: { borderColor: "#0d9488" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0d9488" },

  // Insurance
  insuranceCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  insuranceHeadline: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  insuranceSub: { fontSize: 13, color: "#64748b", lineHeight: 20, marginBottom: 16 },
  insuranceToggleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: "#e2e8f0", alignItems: "center",
  },
  toggleBtnYes: { borderColor: "#0d9488", backgroundColor: "#f0fdfa" },
  toggleBtnNo: { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  toggleBtnText: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  toggleBtnTextActive: { color: "#0f766e" },
  toggleBtnTextNo: { color: "#64748b" },

  expiryLabel: { fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 6 },
  expiryInputWrap: { display: "none" }, // hidden — using TextInput directly
  expiryInputText: { display: "none" } as never,
  expiryField: {
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: "#0f172a", backgroundColor: "#f8fafc",
    marginBottom: 8,
  },
  expiryHint: { fontSize: 11.5, color: "#94a3b8", lineHeight: 17 },

  warningBox: {
    backgroundColor: "#fef9c3", borderRadius: 10,
    borderWidth: 1, borderColor: "#fde68a",
    paddingHorizontal: 14, paddingVertical: 12,
  },
  warningText: { fontSize: 12.5, color: "#92400e", lineHeight: 19 },

  // Save
  saveBtn: {
    backgroundColor: "#0d9488", borderRadius: 16,
    paddingVertical: 16, alignItems: "center",
  },
  saveBtnLoading: { backgroundColor: "#99f6e4" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
