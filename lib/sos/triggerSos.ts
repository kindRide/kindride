/**
 * SOS (emergency alert) trigger utility.
 * Handles emergency requests with location capture and backend persistence.
 */

import { supabase } from '@/lib/supabase';
import * as Location from 'expo-location';
import { getBackendBaseUrlOrNull } from '@/lib/backend-api-urls';

export interface SOSPayload {
  rideId?: string;
  coords?: { latitude: number; longitude: number } | null;
  message?: string;
}

export interface SOSResponse {
  success: boolean;
  status?: string;
  emergency_contacts?: { name: string; phone: string }[];
  error?: string;
}

/**
 * Get current location for SOS, with timeout to avoid blocking.
 */
async function getLocationForSOS(timeoutMs: number = 5000): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Location permission not granted for SOS');
      return null;
    }

    // Use timeout promise race to avoid hanging
    const locationPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location timeout')), timeoutMs)
    );

    const position = await Promise.race([locationPromise, timeoutPromise]);
    
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (error) {
    console.warn('Could not get location for SOS:', error);
    return null;
  }
}

/**
 * Trigger SOS emergency alert.
 * Fetches location (with timeout), sends to backend with auth token.
 * Returns emergency contact info and response status.
 */
export async function triggerSOS(payload: SOSPayload = {}): Promise<SOSResponse> {
  try {
    if (!supabase) {
      return {
        success: false,
        error: 'Sign-in is not configured. Please call emergency services directly.',
      };
    }
    // Get auth session to obtain access token
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      return {
        success: false,
        error: 'Not signed in. Please sign in to send emergency alerts.',
      };
    }

    const accessToken = session.data.session.access_token;

    // Attempt to get location (non-blocking with timeout)
    const location = payload.coords || (await getLocationForSOS());

    // Build SOS request
    const sosRequest = {
      location: location ? { latitude: location.latitude, longitude: location.longitude } : null,
      message: payload.message || 'Emergency SOS from KindRide',
    };

    // Send to backend
    const baseUrl = getBackendBaseUrlOrNull();
    if (!baseUrl) {
      return {
        success: false,
        error: 'Service unavailable. Please call emergency services directly.',
      };
    }

    // Retry logic (up to 3 attempts) for emergency reliability
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/sos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(sosRequest),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.error(`SOS backend request failed (attempt ${attempt}):`, response.status, text);
          if (response.status === 401) {
            return {
              success: false,
              error: 'Authentication expired. Please sign in again.',
            };
          }
          // For 5xx or network errors, we want to throw to trigger a retry
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        return {
          success: true,
          status: data.status,
          emergency_contacts: data.emergency_contacts,
        };
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          // Exponential backoff: Wait 1s, then 2s before retrying
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    console.error('SOS trigger exhausted retries. Last error:', lastError);
    return {
      success: false,
      error: 'Network error or server unavailable. Please call emergency services directly.',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('SOS trigger error:', errorMsg);
    return {
      success: false,
      error: 'Network error. Please call emergency services directly.',
    };
  }
}
