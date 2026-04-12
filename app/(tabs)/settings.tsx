import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/lib/auth";
import {
  getMultiLegFeatureEnabled,
  getMultiLegStyle,
  setMultiLegFeatureEnabled,
  setMultiLegStyle,
  type MultiLegStyle,
} from "@/lib/multileg-preference";

const SIMPLIFIED_MODE_KEY = "kindride_simplified_mode";
const DEFAULT_VIBE_KEY = "kindride_default_vibe";
type VibeMode = "silent" | "chat" | "music";

// ── SettingRow ────────────────────────────────────────────────────────────────
function SettingRow({
  icon,
  iconBg,
  label,
  sub,
  onPress,
  rightEl,
  danger,
  last,
  simplified,
}: {
  icon: string;
  iconBg?: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  rightEl?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
  simplified?: boolean;
}) {
  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          simplified && styles.rowSimplified,
          pressed && onPress && styles.rowPressed,
        ]}
        onPress={onPress}
        disabled={!onPress && !rightEl}
      >
        <View
          style={[
            styles.rowIcon,
            simplified && styles.rowIconSimplified,
            danger && styles.rowIconDanger,
            iconBg && { backgroundColor: iconBg },
          ]}
        >
          <Text style={[styles.rowIconText, simplified && styles.rowIconTextSimplified]}>{icon}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.rowLabel, danger && styles.rowLabelDanger, simplified && styles.rowLabelSimplified]}>
            {label}
          </Text>
          {sub && !simplified ? (
            <Text style={styles.rowSub}>{sub}</Text>
          ) : null}
        </View>
        {rightEl ?? (onPress ? (
          <Text style={[styles.chevron, danger && styles.chevronDanger]}>›</Text>
        ) : null)}
      </Pressable>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

// ── SectionLabel ─────────────────────────────────────────────────────────────
function SectionLabel({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <Reanimated.View entering={FadeInDown.delay(delay).springify()}>
      <Text style={styles.groupLabel}>{label}</Text>
    </Reanimated.View>
  );
}

// ── VibeChip ─────────────────────────────────────────────────────────────────
const VIBE_OPTIONS: { key: VibeMode; icon: string; label: string }[] = [
  { key: "silent", icon: "🤫", label: "vibe_silent" },
  { key: "chat",   icon: "💬", label: "vibe_chat" },
  { key: "music",  icon: "🎵", label: "vibe_music" },
];

function VibePicker({ value, onChange }: { value: VibeMode; onChange: (v: VibeMode) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.vibeRow}>
      {VIBE_OPTIONS.map((v) => (
        <Pressable
          key={v.key}
          style={[styles.vibeChip, value === v.key && styles.vibeChipActive]}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(v.key);
          }}
        >
          <Text style={styles.vibeIcon}>{v.icon}</Text>
          <Text style={[styles.vibeLabel, value === v.key && styles.vibeLabelActive]}>
            {t(v.label)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  "use no memo";
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [multiLegOn, setMultiLegOn] = useState(true);
  const [style, setStyle] = useState<MultiLegStyle>("last_resort");
  const [hydrated, setHydrated] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  const [signingOut, setSigningOut] = useState(false);
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const [defaultVibe, setDefaultVibe] = useState<VibeMode>("chat");
  const [notifRideUpdates, setNotifRideUpdates] = useState(true);
  const [notifPoints, setNotifPoints] = useState(true);
  const [notifWeekly, setNotifWeekly] = useState(true);
  const [notifStreak, setNotifStreak] = useState(true);
  const [safetyRecording, setSafetyRecording] = useState(false);

  useEffect(() => {
    const onLngChange = (lng: string) => setCurrentLanguage(lng);
    i18n.on("languageChanged", onLngChange);
    return () => { i18n.off("languageChanged", onLngChange); };
  }, [i18n]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [on, s, sim, vibe] = await Promise.all([
          getMultiLegFeatureEnabled(),
          getMultiLegStyle(),
          AsyncStorage.getItem(SIMPLIFIED_MODE_KEY),
          AsyncStorage.getItem(DEFAULT_VIBE_KEY),
        ]);
        if (!cancelled) {
          setMultiLegOn(on);
          setStyle(s);
          setSimplifiedMode(sim === "true");
          setDefaultVibe((vibe as VibeMode) ?? "chat");
          setHydrated(true);
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const toggleSimplified = async (val: boolean) => {
    setSimplifiedMode(val);
    await AsyncStorage.setItem(SIMPLIFIED_MODE_KEY, String(val));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const toggleFeature = async (val: boolean) => {
    setMultiLegOn(val);
    await setMultiLegFeatureEnabled(val);
  };

  const toggleStyle = async (val: boolean) => {
    const next: MultiLegStyle = val ? "sooner" : "last_resort";
    setStyle(next);
    await setMultiLegStyle(next);
  };

  const changeLanguage = async (lang: string) => {
    await i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
    Haptics.selectionAsync();
  };

  const changeVibe = async (vibe: VibeMode) => {
    setDefaultVibe(vibe);
    await AsyncStorage.setItem(DEFAULT_VIBE_KEY, vibe);
  };

  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      t("signOut", "Sign out"),
      t("areYouSureSignOut", "Are you sure you want to sign out?"),
      [
        { text: t("cancel", "Cancel"), style: "cancel" },
        {
          text: t("signOut", "Sign out"),
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t("deleteAccount", "Delete account"),
      t("deleteAccountWarning", "This permanently deletes your account and all data. This cannot be undone."),
      [
        { text: t("cancel", "Cancel"), style: "cancel" },
        {
          text: t("deletePermanently", "Delete permanently"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t("contactSupport", "Contact support"),
              t("deleteAccountInstructions", "To delete your account, email privacy@kindride.org with your user ID.")
            );
          },
        },
      ]
    );
  };

  // ── Skeleton while loading
  if (!hydrated) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <LinearGradient
          colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
          style={[styles.hero, { justifyContent: "flex-end" }]}
        >
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonSub} />
        </LinearGradient>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.skeletonGroup}>
            {[1, 2].map((j) => (
              <View key={j} style={styles.skeletonRow} />
            ))}
          </View>
        ))}
      </SafeAreaView>
    );
  }

  const S = simplifiedMode; // shorthand — simplified mode flag
  const displayEmail = user?.email ?? user?.phone ?? null;
  const LANGS = [
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "es", label: "Español", flag: "🇲🇽" },
  ] as const;

  return (
    <SafeAreaView style={[styles.root, isDark && { backgroundColor: "#0f172a" }]} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 56 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <LinearGradient
          colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Reanimated.View entering={FadeInDown.delay(0).springify()} style={styles.logoRow}>
            <Text style={styles.logoKind}>Kind</Text>
            <Text style={styles.logoRide}>Ride</Text>
          </Reanimated.View>
          <Reanimated.View entering={FadeInDown.delay(60).springify()} style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>⚙️  {t("settings", "Settings")}</Text>
          </Reanimated.View>
          <Reanimated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={styles.heroHeadline}>
              {t("settingsIntro", "Your preferences,\nyour experience.")}
            </Text>
            {simplifiedMode && (
              <View style={styles.simplifiedBadge}>
                <Text style={styles.simplifiedBadgeText}>🔠  {t("simplifiedModeOn")}</Text>
              </View>
            )}
          </Reanimated.View>
        </LinearGradient>

        {/* ── ACCOUNT ──────────────────────────────────────────────────────── */}
        <SectionLabel label={t("account", "Account")} delay={80} />
        <Reanimated.View entering={FadeInDown.delay(100).springify()} style={styles.group}>
          {user ? (
            <>
              <View style={styles.profileRow}>
                <LinearGradient
                  colors={["#0d9488", "#0369a1"]}
                  style={styles.avatarGradient}
                >
                  <Text style={styles.avatarLetter}>
                    {(displayEmail ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.profileName, S && styles.profileNameLarge]}>
                    {displayEmail ?? t("signedIn", "Signed in")}
                  </Text>
                  <Text style={styles.profileSub}>{t("activeAccount")} ✓</Text>
                </View>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.idBlock}>
                <Text style={styles.idLabel}>{t("userIdLabel")}</Text>
                <Text style={styles.idHint}>{t("shareUserIdWithSupport")}</Text>
                <View style={styles.monoWrap}>
                  <Text style={styles.monoText} selectable>{user.id}</Text>
                </View>
              </View>
            </>
          ) : (
            <SettingRow
              icon="🔑"
              iconBg="#fef3c7"
              label={t("signIn", "Sign in")}
                sub={t("signInToAccessFullAccount")}
              onPress={() => router.push("/sign-in")}
              simplified={S}
              last
            />
          )}
        </Reanimated.View>

        {/* ── RIDE PREFERENCES ─────────────────────────────────────────────── */}
        <SectionLabel label={t("tripPreferencesLabel", "Ride Preferences")} delay={120} />
        <Reanimated.View entering={FadeInDown.delay(140).springify()} style={styles.group}>
          {/* Default vibe */}
          <View style={[styles.row, S && styles.rowSimplified]}>
            <View style={[styles.rowIcon, { backgroundColor: "#fdf4ff" }]}>
              <Text style={styles.rowIconText}>🎭</Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, S && styles.rowLabelSimplified]}>{t("defaultVibe")}</Text>
              {!S && <Text style={styles.rowSub}>{t("shownToDriversBeforePickup")}</Text>}
            </View>
          </View>
          <View style={styles.vibePadding}>
            <VibePicker value={defaultVibe} onChange={changeVibe} />
          </View>
          <View style={styles.rowDivider} />

          {/* Saved places */}
          <SettingRow
            icon="📍"
            iconBg="#fef2f2"
            label={t("savedPlaces")}
            sub={t("savedPlacesSub")}
            onPress={() => Alert.alert(t("savedPlaces"), t("savedPlacesComingSoon"))}
            simplified={S}
          />
          <SettingRow
            icon="🔀"
            iconBg="#f0fdf4"
            label={t("allowMultiLeg", "Multi-leg rides")}
            sub="Allow connecting via multiple drivers"
            rightEl={
              <Switch
                value={multiLegOn}
                onValueChange={toggleFeature}
                trackColor={{ false: "#e2e8f0", true: "#0d9488" }}
                thumbColor="#ffffff"
              />
            }
            simplified={S}
          />
          <SettingRow
            icon="⚡"
            iconBg="#fffbeb"
            label={t("considerMultiLegSooner", "Prefer multi-leg sooner")}
            sub="Offer connections earlier in matching"
            last
            simplified={S}
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
        </Reanimated.View>

        {/* ── NOTIFICATIONS ─────────────────────────────────────────────────── */}
        {!S && (
          <>
            <SectionLabel label="Notifications" delay={160} />
            <Reanimated.View entering={FadeInDown.delay(180).springify()} style={styles.group}>
              <SettingRow
                icon="🚗"
                iconBg="#eff6ff"
                label="Ride updates"
                sub="Driver arriving, trip started"
                rightEl={
                  <Switch value={notifRideUpdates} onValueChange={setNotifRideUpdates}
                    trackColor={{ false: "#e2e8f0", true: "#0d9488" }} thumbColor="#fff" />
                }
              />
              <SettingRow
                icon="⭐"
                iconBg="#f0fdf4"
                label="Points earned"
                sub="When you gain Kind Points"
                rightEl={
                  <Switch value={notifPoints} onValueChange={setNotifPoints}
                    trackColor={{ false: "#e2e8f0", true: "#0d9488" }} thumbColor="#fff" />
                }
              />
              <SettingRow
                icon="📊"
                iconBg="#fdf4ff"
                label="Weekly impact summary"
                sub="Every Monday morning"
                rightEl={
                  <Switch value={notifWeekly} onValueChange={setNotifWeekly}
                    trackColor={{ false: "#e2e8f0", true: "#0d9488" }} thumbColor="#fff" />
                }
              />
              <SettingRow
                icon="🔥"
                iconBg="#fff7ed"
                label="Streak reminder"
                sub="Alert when streak is at risk"
                last
                rightEl={
                  <Switch value={notifStreak} onValueChange={setNotifStreak}
                    trackColor={{ false: "#e2e8f0", true: "#0d9488" }} thumbColor="#fff" />
                }
              />
            </Reanimated.View>
          </>
        )}

        {/* ── SAFETY ────────────────────────────────────────────────────────── */}
        <SectionLabel label={t("safety")} delay={200} />
        <Reanimated.View entering={FadeInDown.delay(220).springify()} style={styles.group}>
          <SettingRow
            icon="🛡️"
            iconBg="#f0fdf4"
            label={t("identityVerification")}
            sub={t("verifyIdForTrustBoost")}
            onPress={() => Alert.alert(t("identity"), t("completeStripeIdentity"))}
            simplified={S}
          />
          <SettingRow
            icon="🎙️"
            iconBg="#eff6ff"
            label={t("audioRecordingConsent")}
            sub={t("audioRecordingConsentSub")}
            simplified={S}
            rightEl={
              <Switch
                value={safetyRecording}
                onValueChange={(val) => {
                  setSafetyRecording(val);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: "#e2e8f0", true: "#0d9488" }}
                thumbColor="#fff"
              />
            }
          />
          <SettingRow
            icon="🆘"
            iconBg="#fef2f2"
            label={t("sosEmergencyContacts")}
            sub={t("contactsCalledIfSosTriggered")}
            onPress={() => router.push("/sos")}
            simplified={S}
            last
          />
        </Reanimated.View>

        {/* ── ACCESSIBILITY ─────────────────────────────────────────────────── */}
        <SectionLabel label={t("accessibility")} delay={240} />
        <Reanimated.View entering={FadeInDown.delay(260).springify()} style={styles.group}>
          <SettingRow
            icon="🔠"
            iconBg="#f0fdf4"
            label={t("simplifiedMode")}
            sub={t("simplifiedModeSub")}
            simplified={S}
            rightEl={
              <Switch
                value={simplifiedMode}
                onValueChange={toggleSimplified}
                trackColor={{ false: "#e2e8f0", true: "#0d9488" }}
                thumbColor="#fff"
              />
            }
            last
          />
        </Reanimated.View>

        {/* ── LANGUAGE ─────────────────────────────────────────────────────── */}
        <SectionLabel label={t("language", "Language")} delay={280} />
        <Reanimated.View entering={FadeInDown.delay(300).springify()} style={styles.group}>
          <View style={styles.langWrap}>
            {!S && <Text style={styles.langHint}>{t("choosePreferredLanguage")}</Text>}
            <View style={styles.langRow}>
              {LANGS.map(({ code, label, flag }) => {
                const active = currentLanguage === code;
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.langChip, active && styles.langChipActive, S && styles.langChipSimplified]}
                    onPress={() => changeLanguage(code)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.langFlag, S && { fontSize: 22 }]}>{flag}</Text>
                    <Text style={[styles.langChipText, active && styles.langChipTextActive, S && styles.langChipTextSimplified]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Reanimated.View>

        {/* ── ABOUT ─────────────────────────────────────────────────────────── */}
        <SectionLabel label={t("about")} delay={320} />
        <Reanimated.View entering={FadeInDown.delay(340).springify()} style={styles.group}>
          <SettingRow
            icon="📖"
            iconBg="#f8fafc"
            label={t("helpFaq", "Help & FAQ")}
            sub={t("answersToCommonQuestions")}
            onPress={() => Alert.alert(t("help", "Help"), t("visitHelpDocumentation"))}
            simplified={S}
          />
          <SettingRow
            icon="🔒"
            iconBg="#f8fafc"
            label={t("privacyPolicy", "Privacy Policy")}
            sub={t("howWeHandleYourData")}
            onPress={() => Alert.alert(t("privacy"), t("viewFullPrivacyPolicy"))}
            simplified={S}
          />
          <SettingRow
            icon="📄"
            iconBg="#f8fafc"
            label={t("termsOfService", "Terms of Service")}
            onPress={() => Alert.alert(t("terms"), t("viewTermsAtKindride"))}
            simplified={S}
            last
          />
        </Reanimated.View>

        {/* ── REFERRALS ─────────────────────────────────────────────────── */}
        <SectionLabel label={t("community")} delay={360} />
        <Reanimated.View entering={FadeInDown.delay(380).springify()} style={styles.group}>
          <SettingRow
            icon="🪪"
            iconBg="#eff6ff"
            label={t("myQrProfile", "My QR Profile")}
            sub={t("myQrProfileSub", "Share your profile at Hub meetups")}
            onPress={() => router.push("/qr-profile")}
            simplified={S}
          />
          <SettingRow
            icon="🎁"
            iconBg="#fefce8"
            label={t("inviteFriends")}
            sub={t("give50Get50")}
            onPress={() => router.push("/referral")}
            simplified={S}
            last
          />
        </Reanimated.View>

        {/* ── Privacy mission card ─────────────────────────────────────────── */}
        <Reanimated.View entering={FadeInDown.delay(400).springify()} style={styles.missionWrap}>
          <LinearGradient
            colors={["#0d9488", "#0369a1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.missionCard}
          >
            <Text style={styles.missionEyebrow}>{t("ourPromise")}</Text>
            <Text style={styles.missionHeadline}>{t("privacyFirstAlways")}</Text>
            <Text style={styles.missionBody}>
              {t("kindrideNeverSellsData")}
            </Text>
          </LinearGradient>
        </Reanimated.View>

        {/* ── DANGER ZONE ──────────────────────────────────────────────────── */}
        {user && (
          <>
            <View style={styles.dangerSpacer} />
            <Reanimated.View entering={FadeInDown.delay(420).springify()} style={styles.dangerGroup}>
              <SettingRow
                icon="↩️"
                iconBg="#fef2f2"
                label={signingOut ? t("signingOut") : t("signOut", "Sign out")}
                danger
                simplified={S}
                onPress={signingOut ? undefined : handleSignOut}
              />
              <SettingRow
                icon="🗑️"
                iconBg="#fef2f2"
                label={t("deleteAccount", "Delete account")}
                sub={t("permanentlyRemovesData")}
                danger
                simplified={S}
                last
                onPress={handleDeleteAccount}
              />
            </Reanimated.View>
          </>
        )}

        {/* ── Back link ────────────────────────────────────────────────────── */}
        <Link href="/(tabs)" style={styles.backLinkWrap}>
          <Text style={[styles.backLinkText, S && { fontSize: 18 }]}>{t("backToHome")}  →</Text>
        </Link>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  // ── Skeleton
  skeletonTitle: {
    height: 28, width: "55%", borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 10,
  },
  skeletonSub: {
    height: 16, width: "70%", borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  skeletonGroup: {
    backgroundColor: "#fff", borderRadius: 20,
    marginHorizontal: 16, marginTop: 16, padding: 12, gap: 10, ...shadow,
  },
  skeletonRow: {
    height: 44, borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },

  // ── Hero
  hero: { paddingTop: 20, paddingBottom: 28, paddingHorizontal: 22 },
  logoRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 16 },
  logoKind: { fontSize: 20, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  logoRide: { fontSize: 20, fontWeight: "300", color: "#5eead4", letterSpacing: -0.5 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14,
  },
  heroBadgeText: { color: "#99f6e4", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  heroHeadline: {
    color: "#ffffff", fontSize: 26, fontWeight: "800",
    lineHeight: 32, letterSpacing: -0.3,
  },
  simplifiedBadge: {
    marginTop: 12, alignSelf: "flex-start",
    backgroundColor: "rgba(94,234,212,0.2)",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
  },
  simplifiedBadgeText: { color: "#5eead4", fontSize: 12, fontWeight: "700" },

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
  dangerSpacer: { height: 12 },
  dangerGroup: {
    backgroundColor: "#fff",
    borderRadius: 20, marginHorizontal: 16,
    borderWidth: 1, borderColor: "#fee2e2", ...shadow,
    overflow: "hidden",
  },

  // ── Rows
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowSimplified: { paddingVertical: 20 },
  rowPressed: { backgroundColor: "#f8fafc" },
  rowIcon: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center",
  },
  rowIconSimplified: { width: 48, height: 48, borderRadius: 14 },
  rowIconDanger: { backgroundColor: "#fef2f2" },
  rowIconText: { fontSize: 17 },
  rowIconTextSimplified: { fontSize: 22 },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  rowLabelSimplified: { fontSize: 18, fontWeight: "700" },
  rowLabelDanger: { color: "#dc2626" },
  rowSub: { fontSize: 12, color: "#94a3b8", marginTop: 2, lineHeight: 16 },
  chevron: { fontSize: 22, color: "#cbd5e1", fontWeight: "300" },
  chevronDanger: { color: "#fca5a5" },
  rowDivider: { height: 1, backgroundColor: "#f1f5f9", marginLeft: 66 },

  // ── Profile
  profileRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 16, gap: 14,
  },
  avatarGradient: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  avatarLetter: { fontSize: 22, fontWeight: "800", color: "#fff" },
  profileName: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 3 },
  profileNameLarge: { fontSize: 18 },
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

  // ── Vibe picker
  vibePadding: { paddingHorizontal: 16, paddingBottom: 14 },
  vibeRow: { flexDirection: "row", gap: 8 },
  vibeChip: {
    flex: 1, flexDirection: "column", alignItems: "center",
    gap: 4, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1.5, borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  vibeChipActive: { backgroundColor: "#f0fdfa", borderColor: "#0d9488" },
  vibeIcon: { fontSize: 20 },
  vibeLabel: { fontSize: 12, fontWeight: "600", color: "#475569" },
  vibeLabelActive: { color: "#0f766e", fontWeight: "700" },

  // ── Language
  langWrap: { padding: 16 },
  langHint: { fontSize: 13, color: "#64748b", marginBottom: 12 },
  langRow: { flexDirection: "row", gap: 8 },
  langChip: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  langChipSimplified: { paddingVertical: 16 },
  langChipActive: { backgroundColor: "#0d9488", borderColor: "#0d9488" },
  langFlag: { fontSize: 14 },
  langChipText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  langChipTextSimplified: { fontSize: 15 },
  langChipTextActive: { color: "#ffffff", fontWeight: "700" },

  // ── Mission card
  missionWrap: { paddingHorizontal: 16, paddingTop: 24, marginBottom: 4 },
  missionCard: { borderRadius: 20, padding: 22 },
  missionEyebrow: {
    color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6,
  },
  missionHeadline: { color: "#ffffff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  missionBody: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 20 },

  // ── Back link
  backLinkWrap: { alignSelf: "center", paddingVertical: 24 },
  backLinkText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
});
