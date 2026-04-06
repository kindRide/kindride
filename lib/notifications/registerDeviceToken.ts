/**
 * Push notification device token registration.
 * Registers Expo push token with backend for push notification delivery.
 */

import { supabase } from '@/lib/supabase';
import { getBackendBaseUrlOrNull } from '@/lib/backend-api-urls';

export async function registerDeviceToken(pushToken: string): Promise<{ success: boolean; error?: string }> {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken[')) {
    return { success: false, error: 'Invalid device token. Please restart the app.' };
  }

  try {
    if (!supabase) {
      return {
        success: false,
        error: 'Sign-in is not configured on this build. Notifications require a configured app environment.',
      };
    }
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      return { success: false, error: 'Not signed in. Please sign in to enable notifications.' };
    }

    const accessToken = session.data.session.access_token;

    const baseUrl = getBackendBaseUrlOrNull();
    if (!baseUrl) {
      return { success: false, error: 'Service unavailable. Notifications will be enabled when service is restored.' };
    }

    const response = await fetch(`${baseUrl}/notifications/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ push_token: pushToken }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Push token registration failed:', text);
      if (response.status === 401) {
        return { success: false, error: 'Authentication expired. Please sign in again.' };
      }
      if (response.status >= 500) {
        return { success: false, error: 'Server error. Notifications will be enabled when service is restored.' };
      }
      return { success: false, error: 'Failed to enable notifications. Please try again.' };
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Push token registration error:', errorMsg);
    return { success: false, error: 'Network error. Notifications will be enabled when connection is restored.' };
  }
}

/**
 * Optional hook-like function to register device token after auth session is available.
 * Call this after successful sign-in or in a useEffect that watches the session.
 */
export async function registerTokenIfAuthenticated(getToken: () => Promise<string | null>): Promise<boolean> {
  try {
    const token = await getToken();
    if (!token) {
      console.log('No push token available.');
      return false;
    }

    const result = await registerDeviceToken(token);
    if (result.success) {
      console.log('Push token registered successfully');
      return true;
    } else {
      console.warn('Push token registration failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('Error in registerTokenIfAuthenticated:', error);
    return false;
  }
}
