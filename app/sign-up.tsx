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
  Switch,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Method = 'phone' | 'email';

export default function SignUpScreen() {
  const [method, setMethod] = useState<Method>('email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signInWithOtp, verifyOtp, signInWithEmailOtp, verifyEmailOtp } = useAuth();
  const router = useRouter();

  const handleSendOtp = async () => {
    setLoading(true);
    if (method === 'phone') {
      if (!phone.trim()) {
        Alert.alert('Phone required', 'Please enter your phone number with country code (e.g. +1234567890).');
        setLoading(false);
        return;
      }
      const { error } = await signInWithOtp(phone.trim());
      setLoading(false);
      if (error) {
        Alert.alert('Could not send code', error);
      } else {
        setOtpSent(true);
      }
    } else {
      if (!email.trim()) {
        Alert.alert('Email required', 'Please enter your email address.');
        setLoading(false);
        return;
      }
      const { error } = await signInWithEmailOtp(email.trim());
      setLoading(false);
      if (error) {
        Alert.alert('Could not send code', error);
      } else {
        setOtpSent(true);
      }
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert('Code required', 'Please enter the 6-digit code from your ' + (method === 'phone' ? 'SMS' : 'email') + '.');
      return;
    }
    if (!hasConsented) {
      Alert.alert('Consent required', 'Please accept the safety recording disclosure to continue.');
      return;
    }

    setLoading(true);
    let sessionData: { session: import('@supabase/supabase-js').Session | null } | null | undefined;
    let err: string | undefined;

    if (method === 'phone') {
      const result = await verifyOtp(phone.trim(), otp.trim());
      err = result.error;
      sessionData = result.data;
    } else {
      const result = await verifyEmailOtp(email.trim(), otp.trim());
      err = result.error;
      sessionData = result.data;
    }

    if (err || !sessionData?.session) {
      setLoading(false);
      Alert.alert('Verification failed', err || 'Invalid or expired code. Please try again.');
      return;
    }

    // Record consent before navigating
    if (supabase) {
      try {
        await supabase.from('user_consents').upsert({
          id: sessionData.session.user.id,
          recording_consent_given: true,
          recording_consent_timestamp: new Date().toISOString(),
        });
      } catch {
        // Non-blocking — consent record failure should not prevent sign-up
      }
    }

    setLoading(false);
    // Navigate immediately — do not rely on Alert callback (unreliable on Android)
    router.replace('/(tabs)');
  };

  const handleBack = () => {
    setOtpSent(false);
    setOtp('');
  };

  const switchMethod = (m: Method) => {
    setMethod(m);
    setOtpSent(false);
    setOtp('');
  };

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
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>🌱  Join KindRide</Text>
            </View>
            <Text style={styles.heroHeadline}>Create your{'\n'}account</Text>
            <Text style={styles.heroSubcopy}>
              {otpSent
                ? `Check your ${method === 'phone' ? 'phone' : 'email'} for a 6-digit code.`
                : 'Enter your contact details to get started.'}
            </Text>
          </LinearGradient>
        </View>

        {/* ── Form card ── */}
        <View style={styles.card}>

          {!otpSent ? (
            <>
              {/* Method toggle */}
              <View style={styles.methodRow}>
                <Pressable
                  style={[styles.methodBtn, method === 'email' && styles.methodBtnActive]}
                  onPress={() => switchMethod('email')}
                >
                  <Text style={[styles.methodText, method === 'email' && styles.methodTextActive]}>
                    Email
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.methodBtn, method === 'phone' && styles.methodBtnActive]}
                  onPress={() => switchMethod('phone')}
                >
                  <Text style={[styles.methodText, method === 'phone' && styles.methodTextActive]}>
                    Phone
                  </Text>
                </Pressable>
              </View>

              {method === 'email' ? (
                <>
                  <Text style={styles.fieldLabel}>Email address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="#94a3b8"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Phone number</Text>
                  <Text style={styles.fieldHint}>Include country code — e.g. +1 for USA</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+1234567890"
                    placeholderTextColor="#94a3b8"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="tel"
                  />
                </>
              )}

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleSendOtp}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Send verification code  →</Text>
                }
              </Pressable>
            </>
          ) : (
            <>
              {/* OTP entry */}
              <View style={styles.sentBanner}>
                <Text style={styles.sentBannerIcon}>📬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sentBannerTitle}>Code sent</Text>
                  <Text style={styles.sentBannerBody}>
                    We sent a 6-digit code to{' '}
                    <Text style={{ fontWeight: '700' }}>
                      {method === 'phone' ? phone : email}
                    </Text>
                  </Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>6-digit code</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="000000"
                placeholderTextColor="#94a3b8"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={6}
              />

              {/* Safety recording consent */}
              <View style={[styles.consentCard, hasConsented && styles.consentCardActive]}>
                <View style={styles.consentRow}>
                  <Switch
                    value={hasConsented}
                    onValueChange={setHasConsented}
                    trackColor={{ false: '#e2e8f0', true: '#0d9488' }}
                    thumbColor="#ffffff"
                  />
                  <Text style={styles.consentLabel}>Safety recording consent</Text>
                </View>
                <Text style={styles.consentBody}>
                  KindRide records in-app sessions for passenger and driver safety. Recordings are stored securely and auto-deleted after 72 hours unless flagged for review.
                </Text>
                {!hasConsented && (
                  <Text style={styles.consentRequired}>
                    ⚠️  Toggle to accept before creating your account.
                  </Text>
                )}
              </View>

              <Pressable
                style={[styles.primaryBtn, (!hasConsented || loading) && styles.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading || !hasConsented}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Create account</Text>
                }
              </Pressable>

              <Pressable style={styles.backBtn} onPress={handleBack}>
                <Text style={styles.backBtnText}>← Try a different {method === 'phone' ? 'number' : 'email'}</Text>
              </Pressable>
            </>
          )}

          <View style={styles.divider} />

          <Link href="/sign-in" style={{ alignSelf: 'center' }}>
            <Text style={styles.linkText}>Already have an account?  <Text style={styles.linkEmphasis}>Sign in</Text></Text>
          </Link>
        </View>

        <Text style={styles.terms}>
          By creating an account you agree to our Terms of Service and Privacy Policy.
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
  scroll: {
    paddingBottom: 40,
  },
  heroWrap: {
    margin: 16,
    marginBottom: 0,
  },
  heroGradient: {
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  heroBadgeText: {
    color: '#99f6e4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroHeadline: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  heroSubcopy: {
    color: '#a5f3fc',
    fontSize: 14,
    lineHeight: 20,
  },
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
  methodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  methodBtnActive: {
    backgroundColor: '#0d9488',
  },
  methodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  methodTextActive: {
    color: '#ffffff',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
  },
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
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
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
  sentBannerIcon: {
    fontSize: 22,
  },
  sentBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f766e',
    marginBottom: 2,
  },
  sentBannerBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  consentCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 16,
  },
  consentCardActive: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  consentLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  consentBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
  consentRequired: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 8,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#0d9488',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  backBtnText: {
    color: '#0d9488',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 16,
  },
  linkText: {
    color: '#64748b',
    fontSize: 14,
  },
  linkEmphasis: {
    color: '#0d9488',
    fontWeight: '700',
  },
  terms: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginHorizontal: 24,
    lineHeight: 18,
  },
});
