import { supabase } from '@/lib/supabase';

export async function hasRecordingConsent(userId: string): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('user_consents')
    .select('recording_consent_given')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.recording_consent_given);
}

export async function upsertRecordingConsent(userId: string): Promise<void> {
  if (!supabase) return;

  await supabase.from('user_consents').upsert({
    id: userId,
    recording_consent_given: true,
    recording_consent_timestamp: new Date().toISOString(),
  });
}
