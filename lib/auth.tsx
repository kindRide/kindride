import React, { createContext, useContext, useEffect, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { registerDeviceToken } from './notifications/registerDeviceToken';

// Warm up Android browser for faster OAuth sheet
WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithOtp: (phone: string) => Promise<{ error?: string }>;
  verifyOtp: (phone: string, token: string) => Promise<{ data?: { session: Session | null } | null; error?: string }>;
  signInWithEmailOtp: (email: string) => Promise<{ error?: string }>;
  verifyEmailOtp: (email: string, token: string) => Promise<{ data?: { session: Session | null } | null; error?: string }>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Remote push tokens are not supported in Expo Go on Android (SDK 53+); requiring
   * `expo-notifications` at module load throws and breaks the whole app (tabs, etc.).
   * Skip in StoreClient; use a dev build / production app for push.
   */
  const registerPushTokenAsync = async () => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return;
    }
    try {
      const PushNotifications = await import('expo-notifications');
      const token = await PushNotifications.getExpoPushTokenAsync();
      if (token.data) {
        const result = await registerDeviceToken(token.data);
        if (!result.success) {
          console.warn('Push token registration failed:', result.error);
        }
      }
    } catch (error) {
      console.warn('Failed to get or register push token:', error);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session — always clear loading (reject/network must not brick the app).
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        // Register push token if authenticated
        if (session) {
          registerPushTokenAsync();
        }
      })
      .catch(() => {
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        // Register push token on sign-in
        if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
          registerPushTokenAsync();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        // Map common Supabase errors to user-friendly messages
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Invalid email or password. Please check and try again.' };
        }
        if (error.message.includes('Email not confirmed')) {
          return { error: 'Please check your email and click the confirmation link.' };
        }
        if (error.message.includes('Too many requests')) {
          return { error: 'Too many attempts. Please wait a few minutes and try again.' };
        }
        return { error: 'Sign in failed. Please try again.' };
      }
      return {};
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        // Map common Supabase errors to user-friendly messages
        if (error.message.includes('User already registered')) {
          return { error: 'An account with this email already exists. Try signing in instead.' };
        }
        if (error.message.includes('Password should be at least')) {
          return { error: 'Password must be at least 6 characters long.' };
        }
        if (error.message.includes('Unable to validate email address')) {
          return { error: 'Please enter a valid email address.' };
        }
        return { error: 'Sign up failed. Please try again.' };
      }
      return {};
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        // Map common Supabase errors to user-friendly messages
        if (error.message.includes('Unable to validate email address')) {
          return { error: 'Please enter a valid email address.' };
        }
        return { error: 'Password reset failed. Please try again.' };
      }
      return {};
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const signInWithOtp = async (phone: string) => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) {
        if (error.message.includes('Too many requests') || error.message.includes('rate limit')) {
          return { error: 'Too many attempts. Please wait a few minutes and try again.' };
        }
        return { error: 'Failed to send OTP. Please check your phone number (include country code, e.g. +1234567890).' };
      }
      return {};
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const verifyOtp = async (phone: string, token: string) => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });
      if (error) {
        return { error: 'Invalid or expired OTP. Please try again.' };
      }
      return { data };
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const signInWithEmailOtp = async (email: string) => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        if (error.message.includes('Too many requests') || error.message.includes('rate limit')) {
          return { error: 'Too many attempts. Please wait a few minutes and try again.' };
        }
        return { error: 'Failed to send OTP. Please check your email address and try again.' };
      }
      return {};
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const redirectTo = 'kindride://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        return { error: error?.message ?? 'OAuth sign in failed. Please try again.' };
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') {
        return { error: result.type === 'cancel' ? 'Sign in was cancelled.' : 'OAuth sign in failed.' };
      }

      // Try PKCE code exchange first, then implicit token extraction
      const parsed = new URL(result.url);
      const code = parsed.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        return exchangeError ? { error: exchangeError.message } : {};
      }

      const hashParams = new URLSearchParams(parsed.hash.substring(1));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
        return sessionError ? { error: sessionError.message } : {};
      }

      return { error: 'Could not complete sign in. Please try again.' };
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    if (!supabase) return { error: 'Service unavailable. Please try again later.' };

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) {
        return { error: 'Invalid or expired OTP. Please try again.' };
      }
      return { data };
    } catch {
      return { error: 'Network error. Please check your connection and try again.' };
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signInWithOtp,
    verifyOtp,
    signInWithEmailOtp,
    verifyEmailOtp,
    signInWithOAuth,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};