import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { hasRecordingConsent } from '@/lib/user-consent';
import { useTranslation } from 'react-i18next';

export default function SignInScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signInWithEmailOtp, verifyEmailOtp } = useAuth();
  const router = useRouter();

  const handleSendOtp = async () => {
    setLoading(true);
    if (!email.trim()) {
      Alert.alert(t('emailRequiredTitle', 'Email required'), t('emailRequiredBody', 'Please enter your email address.'));
      setLoading(false);
      return;
    }
    const { error } = await signInWithEmailOtp(email.trim(), true);
    setLoading(false);
    if (error) { Alert.alert(t('couldNotSendCodeTitle', 'Could not send code'), error); } else { setOtpSent(true); }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert(t('codeRequiredTitle', 'Code required'), t('codeRequiredBody', 'Please enter the code from your email.'));
      return;
    }
    setLoading(true);
    const { error } = await verifyEmailOtp(email.trim(), otp.trim());
    setLoading(false);
    if (error) {
      Alert.alert(t('verificationFailedTitle', 'Verification failed'), error);
    } else {
      const session = await supabase?.auth.getSession();
      const user = session?.data.session?.user ?? null;

      if (!user) {
        Alert.alert(t('verificationFailedTitle', 'Verification failed'), t('couldNotLoadSessionBody', 'Could not load your session. Please try again.'));
        return;
      }

      const consentGiven = await hasRecordingConsent(user.id);
      router.replace(consentGiven ? '/(tabs)' : '/complete-signup');
    }
  };

  const handleBack = () => { setOtpSent(false); setOtp(''); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={['#0c1f3f', '#0a5c54']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Logo */}
            <View style={styles.logoRow}>
              <Text style={styles.logoKind}>Kind</Text>
              <Text style={styles.logoRide}>Ride</Text>
            </View>

            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{t('freeHumanitarianRideshare', '🌱  Free Humanitarian Rideshare')}</Text>
            </View>

            <Text style={styles.heroHeadline}>
              {otpSent ? t('checkYourEmailTitle', 'Check your\nemail') : t('welcomeBackTitle', 'Welcome\nback.')}
            </Text>
            <Text style={styles.heroSubcopy}>
              {otpSent
                ? t('enterCodeSentToEmail', 'Enter the code we sent to {{email}}', { email })
                : t('useEmailToSignInOrCreate', 'Use your email to sign in or create your account.')}
            </Text>
          </LinearGradient>
        </View>

        {/* ── Form card ── */}
        <View style={styles.card}>

          {!otpSent ? (
            <>
              <Text style={styles.fieldLabel}>{t('emailAddressLabel', 'Email address')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('emailPlaceholder', 'you@example.com')}
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleSendOtp}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>{t('continueWithEmail', 'Continue with email  →')}</Text>
                }
              </Pressable>
            </>
          ) : (
            <>
              {/* OTP sent banner */}
              <View style={styles.sentBanner}>
                <Text style={styles.sentBannerIcon}>📬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sentBannerTitle}>{t('codeSentTitle', 'Code sent')}</Text>
                  <Text style={styles.sentBannerBody}>
                    {t('checkInboxForKindRideCode', 'Check your inbox for the code from KindRide.')}
                  </Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>{t('emailCodeLabel', 'Email code')}</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder={t('enterCodePlaceholder', 'Enter code')}
                placeholderTextColor="#94a3b8"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                autoFocus
              />

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>{t('continue', 'Continue')}</Text>
                }
              </Pressable>

              <Pressable style={styles.backBtn} onPress={handleBack}>
                <Text style={styles.backBtnText}>{t('tryDifferentEmail', '← Try a different email')}</Text>
              </Pressable>
            </>
          )}

          <View style={styles.divider} />
          <View style={styles.helperBox}>
            <Text style={styles.helperTitle}>{t('oneEmailFlowTitle', 'One email flow')}</Text>
            <Text style={styles.helperBody}>
              {t('oneEmailFlowBody', 'If your email is new, we\'ll help you finish setup after verification. If you already have an account, you\'ll go straight in.')}
            </Text>
          </View>
        </View>

        <Text style={styles.terms}>
          {t('signInTermsNotice', 'By signing in you agree to our Terms of Service and Privacy Policy.')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },

  heroWrap: { margin: 16, marginBottom: 0 },
  heroGradient: { borderRadius: 24, padding: 24, overflow: 'hidden' },

  logoRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
  logoKind: { fontSize: 22, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  logoRide: { fontSize: 22, fontWeight: '300', color: '#5eead4', letterSpacing: -0.5 },

  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  heroBadgeText: { color: '#99f6e4', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  heroHeadline: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroSubcopy: { color: '#a5f3fc', fontSize: 14, lineHeight: 21 },

  card: {
    margin: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    ...shadow,
  },

  methodRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  methodBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  methodBtnActive: { backgroundColor: '#0d9488' },
  methodText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  methodTextActive: { color: '#ffffff' },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldHint: { fontSize: 12, color: '#94a3b8', marginBottom: 6 },

  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  otpInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
  },

  sentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0fdfa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 14,
    marginBottom: 18,
  },
  sentBannerIcon: { fontSize: 22 },
  sentBannerTitle: { fontSize: 14, fontWeight: '700', color: '#0f766e', marginBottom: 2 },
  sentBannerBody: { fontSize: 13, color: '#475569', lineHeight: 18 },

  primaryBtn: {
    backgroundColor: '#0d9488',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  backBtn: { alignItems: 'center', paddingVertical: 12 },
  backBtnText: { color: '#0d9488', fontSize: 14, fontWeight: '600' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#f1f5f9' },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: '#94a3b8' },

  oauthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 10,
    backgroundColor: '#ffffff',
  },
  oauthBtnText: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  appleBtn: { backgroundColor: '#000000', borderColor: '#000000' },
  appleBtnText: { color: '#ffffff' },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 18 },

  helperBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
  },
  helperTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  helperBody: { fontSize: 13, color: '#64748b', lineHeight: 19 },

  terms: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginHorizontal: 24,
    lineHeight: 18,
  },
});
