import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function EditProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [originalBio, setOriginalBio] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !session?.user.id) {
      setLoading(false);
      return;
    }
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, bio")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;
        if (data) {
          const fetchedName = data.display_name || "";
          const fetchedBio = data.bio || "";
          setDisplayName(fetchedName);
          setOriginalName(fetchedName);
          setBio(fetchedBio);
          setOriginalBio(fetchedBio);
        }
      } catch {
        // silent — user can still type from scratch
      } finally {
        setLoading(false);
      }
    };
    void loadProfile();
  }, [session?.user.id]);

  const handleSave = async () => {
    if (!supabase || !session?.user.id) return;
    const nameTrimmed = displayName.trim();
    const bioTrimmed = bio.trim();

    if (nameTrimmed.length < 2 || nameTrimmed.length > 40) {
      setErrorMsg("Display name must be between 2 and 40 characters.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: nameTrimmed, bio: bioTrimmed || null })
        .eq("id", session.user.id);

      if (error) throw error;

      Alert.alert("Saved", "Your profile has been updated.");
      router.back();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Failed to update profile.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>Edit Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      </SafeAreaView>
    );
  }

  const hasChanged = displayName.trim() !== originalName || bio.trim() !== originalBio;
  const canSave = displayName.trim().length >= 2 && displayName.trim().length <= 40 && bio.length <= 120 && hasChanged;
  const initial = displayName.trim().charAt(0).toUpperCase() || session?.user.email?.charAt(0).toUpperCase() || "?";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>{"<"}</Text>
        </Pressable>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <LinearGradient colors={["#0d9488", "#2563eb"]} style={styles.avatar}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </LinearGradient>
        </View>

        <Text style={styles.sectionLabel}>DISPLAY NAME</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="How others see you"
            placeholderTextColor="#94a3b8"
            maxLength={40}
          />
        </View>
        <Text style={styles.hintText}>
          This is what drivers and passengers see when you share a ride.
        </Text>

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>BIO (optional)</Text>
        <View style={[styles.inputContainer, styles.textAreaContainer]}>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            placeholder="A short line about yourself..."
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={120}
          />
        </View>
        <View style={styles.bioHintRow}>
          <Text style={styles.hintText}>A short line about yourself. Optional.</Text>
          <Text style={styles.hintText}>{bio.length} / 120</Text>
        </View>

        <View style={styles.footer}>
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          <Pressable
            style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
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
  title: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  headerSpacer: { width: 40, height: 40 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  avatarContainer: { alignItems: "center", marginBottom: 32 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 8 },
  inputContainer: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", overflow: "hidden" },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#0f172a" },
  textAreaContainer: { minHeight: 100 },
  textArea: { textAlignVertical: "top", paddingTop: 14 },
  hintText: { fontSize: 13, color: "#64748b", marginTop: 8 },
  bioHintRow: { flexDirection: "row", justifyContent: "space-between" },
  footer: { marginTop: "auto", marginBottom: 20, paddingTop: 20 },
  errorText: { color: "#ef4444", fontSize: 14, textAlign: "center", marginBottom: 12, fontWeight: "500" },
  saveButton: { backgroundColor: "#0d9488", borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", minHeight: 52 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});