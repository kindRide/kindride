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
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';

type Method = 'email' | 'phone';

export default function SignInScreen() {
  const [method, setMethod] = useState<Method>('email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const { signInWithOtp, verifyOtp, signInWithEmailOtp, verifyEmailOtp, signInWithOAuth } = useAuth();
  const router = useRouter();

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    const { error } = await signInWithOAuth(provider);
    setOauthLoading(null);
    if (error) {
      Alert.alert('Sign in failed', error);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleSendOtp = async () => {
    setLoading(true);
    if (method === 'phone') {
      if (!phone.trim()) {
        Alert.alert('Phone required', 'Please enter your phone number with country code.');
        setLoading(false);
        return;
      }
      const { error } = await signInWithOtp(phone.trim());
      setLoading(false);
      if (error) { Alert.alert('Could not send code', error); } else { setOtpSent(true); }
    } else {
      if (!email.trim()) {
        Alert.alert('Email required', 'Please enter your email address.');
        setLoading(false);
        return;
      }
      const { error } = await signInWithEmailOtp(email.trim());
      setLoading(false);
      if (error) { Alert.alert('Could not send code', error); } else { setOtpSent(true); }
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert('Code required', 'Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    if (method === 'phone') {
      const { error } = await verifyOtp(phone.trim(), otp.trim());
      setLoading(false);
      if (error) { Alert.alert('Verification failed', error); } else { router.replace('/(tabs)'); }
    } else {
      const { error } = await verifyEmailOtp(email.trim(), otp.trim());
      setLoading(false);
      if (error) { Alert.alert('Verification failed', error); } else { router.replace('/(tabs)'); }
    }
  };

  const handleBack = () => { setOtpSent(false); setOtp(''); };
  const switchMethod = (m: Method) => { setMethod(m); setOtpSent(false); setOtp(''); };

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
              <Text style={styles.heroBadgeText}>🌱  Free Humanitarian Rideshare</Text>
            </View>

            <Text style={styles.heroHeadline}>
              {otpSent ? 'Check your\n' + (method === 'phone' ? 'phone' : 'email') : 'Welcome\nback.'}
            </Text>
            <Text style={styles.heroSubcopy}>
              {otpSent
                ? `Enter the 6-digit code we sent to ${method === 'phone' ? phone : email}`
                : 'Sign in to continue making a difference.'}
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

              {/* OAuth */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={[styles.oauthBtn, oauthLoading === 'google' && styles.btnDisabled]}
                onPress={() => handleOAuth('google')}
                disabled={oauthLoading !== null}
              >
                {oauthLoading === 'google'
                  ? <ActivityIndicator color="#334155" />
                  : <Text style={styles.oauthBtnText}>🇬  Sign in with Google</Text>
                }
              </Pressable>

              {Platform.OS === 'ios' && (
                <Pressable
                  style={[styles.oauthBtn, styles.appleBtn, oauthLoading === 'apple' && styles.btnDisabled]}
                  onPress={() => handleOAuth('apple')}
                  disabled={oauthLoading !== null}
                >
                  {oauthLoading === 'apple'
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[styles.oauthBtnText, styles.appleBtnText]}>  Sign in with Apple</Text>
                  }
                </Pressable>
              )}
            </>
          ) : (
            <>
              {/* OTP sent banner */}
              <View style={styles.sentBanner}>
                <Text style={styles.sentBannerIcon}>📬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sentBannerTitle}>Code sent</Text>
                  <Text style={styles.sentBannerBody}>
                    Check your {method === 'phone' ? 'messages' : 'inbox'} for a 6-digit code from KindRide.
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
                autoFocus
              />

              <Pressable
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Sign in</Text>
                }
              </Pressable>

              <Pressable style={styles.backBtn} onPress={handleBack}>
                <Text style={styles.backBtnText}>← Try a different {method === 'phone' ? 'number' : 'email'}</Text>
              </Pressable>
            </>
          )}

          <View style={styles.divider} />

          {/* Sign-up CTA — prominent, not a tiny link */}
          <View style={styles.signUpRow}>
            <Text style={styles.signUpPrompt}>New to KindRide?</Text>
            <Link href="/sign-up">
              <Text style={styles.signUpLink}>Create an account  →</Text>
            </Link>
          </View>
        </View>

        <Text style={styles.terms}>
          By signing in you agree to our Terms of Service and Privacy Policy.
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

  signUpRow: { alignItems: 'center', gap: 6 },
  signUpPrompt: { fontSize: 13, color: '#64748b' },
  signUpLink: { fontSize: 15, fontWeight: '700', color: '#0d9488' },

  terms: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginHorizontal: 24,
    lineHeight: 18,
  },
});
