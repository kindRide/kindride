import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth";
import {
  getMultiLegFeatureEnabled,
  getMultiLegStyle,
  setMultiLegFeatureEnabled,
  setMultiLegStyle,
  type MultiLegStyle,
} from "@/lib/multileg-preference";

// ── Row helper ────────────────────────────────────────────────────────────────
function SettingRow({
  icon, label, sub, onPress, rightEl, danger, last,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  rightEl?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
        onPress={onPress}
        disabled={!onPress && !rightEl}
      >
        <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
          <Text style={styles.rowIconText}>{icon}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        {rightEl ?? (onPress ? <Text style={[styles.chevron, danger && styles.chevronDanger]}>›</Text> : null)}
      </Pressable>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [multiLegOn, setMultiLegOn] = useState(true);
  const [style, setStyle] = useState<MultiLegStyle>("last_resort");
  const [hydrated, setHydrated] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  const [signingOut, setSigningOut] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const onLanguageChanged = (lng: string) => setCurrentLanguage(lng);
    i18n.on("languageChanged", onLanguageChanged);
    return () => { i18n.off("languageChanged", onLanguageChanged); };
  }, [i18n]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [on, s] = await Promise.all([getMultiLegFeatureEnabled(), getMultiLegStyle()]);
        if (!cancelled) {
          setMultiLegOn(on);
          setStyle(s);
          setHydrated(true);
          Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const toggleFeature = async (value: boolean) => {
    setMultiLegOn(value);
    await setMultiLegFeatureEnabled(value);
  };

  const toggleStyle = async (value: boolean) => {
    const next: MultiLegStyle = value ? "sooner" : "last_resort";
    setStyle(next);
    await setMultiLegStyle(next);
  };

  const changeLanguage = async (lang: string) => {
    await i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            await signOut();
            setSigningOut(false);
            router.replace("/sign-in");
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete permanently", style: "destructive", onPress: () => {
          Alert.alert("Contact support", "To delete your account, email privacy@kindride.org with your user ID.");
        }},
      ]
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (!hydrated) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.loadingCenter}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayEmail = user?.email ?? user?.phone ?? null;
  const LANGS = [
    { code: "en", label: t("english", "English"), flag: "🇺🇸" },
    { code: "es", label: t("spanish", "Español"),  flag: "🇲🇽" },
    { code: "ar", label: t("arabic", "العربية"),   flag: "🇸🇦" },
  ] as const;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Hero ───────────────────────────────────────────────────────── */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={styles.logoRow}>
                <Text style={styles.logoKind}>Kind</Text>
                <Text style={styles.logoRide}>Ride</Text>
              </View>

              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>⚙️  Settings</Text>
              </View>

              <Text style={styles.heroHeadline}>{t("settingsIntro", "Your preferences,\nyour experience.")}</Text>
              <Text style={styles.heroSub}>
                Language, ride matching, and privacy — all in one place.
              </Text>
            </LinearGradient>
          </View>

          {/* ── Account ────────────────────────────────────────────────────── */}
          <Text style={styles.groupLabel}>Account</Text>
          <View style={styles.group}>
            {user ? (
              <>
                {/* Profile row */}
                <View style={styles.profileRow}>
                  <View style={styles.avatar}>
                    <Text style={{ fontSize: 24 }}>👤</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{displayEmail ?? "Signed in"}</Text>
                    <Text style={styles.profileSub}>Active driver account</Text>
                  </View>
                </View>
                <View style={styles.rowDivider} />

                {/* User ID row */}
                <View style={styles.idBlock}>
                  <Text style={styles.idLabel}>{t("testingAccountId", "User ID")}</Text>
                  <Text style={styles.idHint}>{t("testingAccountHint1", "Share this with support if you need help.")}</Text>
                  <View style={styles.monoWrap}>
                    <Text style={styles.monoText} selectable>{user.id}</Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <SettingRow
                  icon="🔑"
                  label={t("signIn", "Sign in")}
                  sub={t("driverNotShowingHint", "Sign in to access your full account")}
                  onPress={() => router.push("/sign-in")}
                  last
                />
              </>
            )}
          </View>

          {/* ── Trip Preferences ───────────────────────────────────────────── */}
          <Text style={styles.groupLabel}>Trip Preferences</Text>
          <View style={styles.group}>
            <SettingRow
              icon="🔀"
              label={t("allowMultiLeg", "Multi-leg rides")}
              sub={t("allowMultiLegHint", "Allow connecting via multiple drivers")}
              rightEl={
                <Switch
                  value={multiLegOn}
                  onValueChange={toggleFeature}
                  trackColor={{ false: "#e2e8f0", true: "#0d9488" }}
                  thumbColor="#ffffff"
                />
              }
            />
            <SettingRow
              icon="⚡"
              label={t("considerMultiLegSooner", "Prefer multi-leg sooner")}
              sub={t("considerMultiLegSoonerHint", "Offer connections earlier in matching")}
              last
              rightEl={
                <Switch
                  value={style === "sooner"}
                  onValueChange={toggleStyle}
                  disabled={!multiLegOn}
                  trackColor={{ false: "#e2e8f0", true: "#0d9488" }}
                  thumbColor="#ffffff"
                  style={{ opacity: multiLegOn ? 1 : 0.4 }}
                />
              }
            />
          </View>

          {/* ── Language ───────────────────────────────────────────────────── */}
          <Text style={styles.groupLabel}>{t("language", "Language")}</Text>
          <View style={styles.group}>
            <View style={styles.langWrap}>
              <Text style={styles.langHint}>{t("choosePreferredLanguage", "Choose your preferred language")}</Text>
              <View style={styles.langRow}>
                {LANGS.map(({ code, label, flag }) => {
                  const active = currentLanguage === code;
                  return (
                    <TouchableOpacity
                      key={code}
                      style={[styles.langChip, active && styles.langChipActive]}
                      onPress={() => changeLanguage(code)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.langFlag}>{flag}</Text>
                      <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── Support ────────────────────────────────────────────────────── */}
          <Text style={styles.groupLabel}>Support</Text>
          <View style={styles.group}>
            <SettingRow
              icon="📖"
              label="Help & FAQ"
              sub="Answers to common questions"
              onPress={() => Alert.alert("Help", "Visit kindride.org/help for full documentation.")}
            />
            <SettingRow
              icon="🔒"
              label="Privacy Policy"
              sub="How we handle your data"
              onPress={() => Alert.alert("Privacy", "View our full policy at kindride.org/privacy.")}
            />
            <SettingRow
              icon="📄"
              label="Terms of Service"
              onPress={() => Alert.alert("Terms", "View terms at kindride.org/terms.")}
              last
            />
          </View>

          {/* ── Privacy card ─────────────────────────────────────────────── */}
          <View style={styles.missionWrap}>
            <LinearGradient
              colors={["#0d9488", "#0369a1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.missionCard}
            >
              <Text style={styles.missionEyebrow}>Our Promise</Text>
              <Text style={styles.missionHeadline}>Privacy-first, always.</Text>
              <Text style={styles.missionBody}>
                KindRide never sells your data. Your location stays on your device until you choose to share a ride.
              </Text>
            </LinearGradient>
          </View>

          {/* ── Danger zone ───────────────────────────────────────────────── */}
          {user && (
            <>
              <Text style={styles.groupLabel}>Account Actions</Text>
              <View style={styles.group}>
                <SettingRow
                  icon="↩️"
                  label={signingOut ? "Signing out…" : "Sign out"}
                  danger
                  onPress={signingOut ? undefined : handleSignOut}
                />
                <SettingRow
                  icon="🗑️"
                  label="Delete account"
                  sub="Permanently removes all your data"
                  danger
                  last
                  onPress={handleDeleteAccount}
                />
              </View>
            </>
          )}

          {/* ── Back link ─────────────────────────────────────────────────── */}
          <Link href="/(tabs)" style={styles.backLinkWrap}>
            <Text style={styles.backLinkText}>{t("backToHome", "Back to home")}  →</Text>
          </Link>

        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 15, color: "#94a3b8" },

  // ── Hero
  heroWrap: { margin: 16, marginBottom: 8 },
  heroGradient: { borderRadius: 24, padding: 22, overflow: "hidden" },
  logoRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 18 },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16,
  },
  heroBadgeText: { color: "#99f6e4", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  heroHeadline: {
    color: "#ffffff", fontSize: 26, fontWeight: "800",
    lineHeight: 32, letterSpacing: -0.3, marginBottom: 10,
  },
  heroSub: { color: "#a5f3fc", fontSize: 14, lineHeight: 21 },

  // ── Group layout
  groupLabel: {
    fontSize: 12, fontWeight: "700", color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.8,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  group: {
    backgroundColor: "#ffffff",
    borderRadius: 20, marginHorizontal: 16, ...shadow,
    overflow: "hidden",
  },

  // ── Rows
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowPressed: { backgroundColor: "#f8fafc" },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
  },
  rowIconDanger: { backgroundColor: "#fef2f2" },
  rowIconText: { fontSize: 17 },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  rowLabelDanger: { color: "#dc2626" },
  rowSub: { fontSize: 12, color: "#94a3b8", marginTop: 2, lineHeight: 16 },
  chevron: { fontSize: 22, color: "#cbd5e1", fontWeight: "300" },
  chevronDanger: { color: "#fca5a5" },
  rowDivider: { height: 1, backgroundColor: "#f1f5f9", marginLeft: 64 },

  // ── Account / profile
  profileRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: "#f0fdfa", alignItems: "center", justifyContent: "center",
  },
  profileName: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 2 },
  profileSub: { fontSize: 12, color: "#0d9488", fontWeight: "600" },
  idBlock: { paddingHorizontal: 16, paddingBottom: 16 },
  idLabel: {
    fontSize: 11, fontWeight: "700", color: "#334155",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
  },
  idHint: { fontSize: 12, color: "#94a3b8", marginBottom: 8 },
  monoWrap: {
    backgroundColor: "#f8fafc", borderRadius: 10,
    borderWidth: 1, borderColor: "#e2e8f0",
    paddingHorizontal: 12, paddingVertical: 10,
  },
  monoText: { fontFamily: "monospace", fontSize: 11, color: "#0f172a", lineHeight: 18 },

  // ── Language
  langWrap: { padding: 16 },
  langHint: { fontSize: 13, color: "#64748b", marginBottom: 12 },
  langRow: { flexDirection: "row", gap: 8 },
  langChip: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  langChipActive: { backgroundColor: "#0d9488", borderColor: "#0d9488" },
  langFlag: { fontSize: 14 },
  langChipText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  langChipTextActive: { color: "#ffffff", fontWeight: "700" },

  // ── Mission card
  missionWrap: { paddingHorizontal: 16, paddingTop: 20, marginBottom: 4 },
  missionCard: { borderRadius: 20, padding: 22 },
  missionEyebrow: {
    color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6,
  },
  missionHeadline: { color: "#ffffff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  missionBody: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 20 },

  // ── Back link
  backLinkWrap: { alignSelf: "center", paddingVertical: 20 },
  backLinkText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
});
