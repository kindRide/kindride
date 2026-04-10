import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';
import { upsertRecordingConsent } from '@/lib/user-consent';

export default function CompleteSignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [hasConsented, setHasConsented] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!hasConsented) {
      Alert.alert(t('consentRequiredTitle', 'Consent required'), t('consentRequiredBody', 'Please accept the safety recording disclosure to continue.'));
      return;
    }

    if (!supabase) {
      Alert.alert(t('unavailable', 'Unavailable'), t('supabaseNotConfigured', 'Supabase is not configured.'));
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) {
        Alert.alert(t('sessionMissingTitle', 'Session missing'), t('pleaseSignInAgain', 'Please sign in again.'));
        router.replace('/sign-in');
        return;
      }

      await upsertRecordingConsent(userId);
      router.replace('/(tabs)');
    } catch {
      Alert.alert(t('couldNotFinishSetupTitle', 'Could not finish setup'), t('pleaseTryAgain', 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={['#0c1f3f', '#0a5c54']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{t('completeSetupBadge', '🌱 Complete setup')}</Text>
            </View>
            <Text style={styles.heroHeadline}>{t('oneLastStepTitle', 'One last step')}</Text>
            <Text style={styles.heroSubcopy}>
              {t('completeSetupBody', 'Before entering KindRide, please confirm the safety recording disclosure.')}
            </Text>
          </LinearGradient>
        </View>

        <View style={styles.card}>
          <View style={[styles.consentCard, hasConsented && styles.consentCardActive]}>
            <View style={styles.consentRow}>
              <Switch
                value={hasConsented}
                onValueChange={setHasConsented}
                trackColor={{ false: '#e2e8f0', true: '#0d9488' }}
                thumbColor="#ffffff"
              />
              <Text style={styles.consentLabel}>{t('safetyRecordingConsent', 'Safety recording consent')}</Text>
            </View>
            <Text style={styles.consentBody}>
              {t('safetyRecordingConsentBody', 'KindRide records in-app sessions for passenger and driver safety. Recordings are stored securely and auto-deleted after 72 hours unless flagged for review.')}
            </Text>
          </View>

          <Pressable
            style={[styles.primaryBtn, (!hasConsented || loading) && styles.btnDisabled]}
            onPress={handleContinue}
            disabled={!hasConsented || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{t('continueCta', 'Continue  →')}</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 36 },
  heroWrap: { marginTop: 8, marginBottom: 18 },
  heroGradient: { borderRadius: 28, paddingHorizontal: 22, paddingVertical: 24 },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  heroBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroHeadline: { color: '#fff', fontSize: 30, fontWeight: '800', marginBottom: 8 },
  heroSubcopy: { color: 'rgba(255,255,255,0.86)', fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  consentCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    backgroundColor: '#f8fafc',
  },
  consentCardActive: {
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  consentLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  consentBody: { fontSize: 14, lineHeight: 22, color: '#475569' },
  primaryBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.55 },
});
