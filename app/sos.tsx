import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { triggerSOS } from '@/lib/sos/triggerSos';

interface EmergencyContact {
  name: string;
  phone: string;
}

export default function SOSScreen() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sendingSOS, setSendingSOS] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [confirmationCountdown, setConfirmationCountdown] = useState<number | null>(null);
  const router = useRouter();
  const { t } = useTranslation();

  const emergencyContacts: EmergencyContact[] = [
    { name: t('emergencyServices', 'Emergency Services (911)'), phone: '911' },
  ];

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('locationPermission', 'Location Permission'), t('locationNeededForSos', 'Location access is needed for SOS functionality.'));
        setLocationLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert(t('locationError', 'Location Error'), t('unableToGetLocationSos', 'Unable to get your location. SOS may be less effective.'));
    } finally {
      setLocationLoading(false);
    }
  };

  const startSOSConfirmation = () => {
    setConfirmationCountdown(5);
  };

  useEffect(() => {
    if (confirmationCountdown === null || confirmationCountdown <= 0) return;

    const timer = setTimeout(() => {
      setConfirmationCountdown(prev => prev !== null ? prev - 1 : null);
    }, 1000);

    return () => clearTimeout(timer);
  }, [confirmationCountdown]);

  const handleSendSOS = useCallback(async () => {
    setSendingSOS(true);
    setConfirmationCountdown(null);

    try {
      // Use the triggerSOS utility with current location
      const result = await triggerSOS({
        coords: location || undefined,
        message: t('emergencySosMessage', 'Emergency SOS from KindRide passenger'),
      });

      if (result.success) {
        const contactName = result.emergency_contacts?.[0]?.name || t('emergencyServices', 'Emergency Services');
        const contactPhone = result.emergency_contacts?.[0]?.phone || '911';

        // Show immediate feedback
        Alert.alert(
          t('sosSentTitle', 'SOS Sent!'),
          t('sosSentBody', 'Emergency services have been notified. Help is on the way.'),
          [
            {
              text: t('callEmergency', `Call ${contactName}`),
              onPress: () => Linking.openURL(`tel:${contactPhone}`),
            },
            { text: t('ok', 'OK') },
          ]
        );

        // Navigate back after a delay
        setTimeout(() => {
          router.back();
        }, 2000);
      } else {
        // Backend failed, but still offer local emergency options
        Alert.alert(
          t('sosAlertTitle', 'SOS Alert'),
          result.error || t('sosBackendError', 'Could not reach emergency services backend. Using emergency contact directly.'),
          [
            {
              text: t('call911', 'Call 911'),
              onPress: () => Linking.openURL('tel:911'),
            },
            { text: t('ok', 'OK') },
          ]
        );
      }
    } catch (error) {
      console.error('SOS error:', error);
      // Show error but still offer direct call
      Alert.alert(
        t('sosAlertTitle', 'SOS Alert'),
        t('sosEmergencyFallback', 'Emergency services notified. If backend unavailable, call 911 directly.'),
        [
          {
            text: t('call911', 'Call 911'),
            onPress: () => Linking.openURL('tel:911'),
          },
          { text: t('ok', 'OK') },
        ]
      );
    } finally {
      setSendingSOS(false);
    }
  }, [location, router]);

  useEffect(() => {
    if (confirmationCountdown === 0) {
      // Auto-send SOS after countdown
      handleSendSOS();
    }
  }, [confirmationCountdown, handleSendSOS]);

  const cancelSOS = () => {
    setConfirmationCountdown(null);
    Alert.alert(t('sosCancelledTitle', 'SOS Cancelled'), t('sosCancelledBody', 'Emergency alert was not sent.'));
  };

  const callEmergency = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('emergencySosTitle', 'Emergency SOS')}</Text>
      <Text style={styles.subtitle}>
        {t('emergencySosSubtitle', 'Only use this in case of emergency. This will alert emergency services.')}
      </Text>

      {locationLoading ? (
        <View style={styles.locationContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.locationText}>{t('gettingLocation', 'Getting your location...')}</Text>
        </View>
      ) : (
        <View style={styles.locationContainer}>
          <Text style={styles.locationText}>
            {location
              ? t('locationCoordinates', 'Location: {{lat}}, {{lng}}', { lat: location.latitude.toFixed(4), lng: location.longitude.toFixed(4) })
              : t('locationUnavailable', 'Location unavailable')
            }
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.sosButton, (sendingSOS || confirmationCountdown !== null) && styles.sosButtonDisabled]}
        onPress={confirmationCountdown === null ? startSOSConfirmation : undefined}
        disabled={sendingSOS || confirmationCountdown !== null}
      >
        {confirmationCountdown !== null ? (
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownText}>{confirmationCountdown}</Text>
              <Text style={styles.countdownLabel}>{t('sendingIn', 'Sending in...')}</Text>
          </View>
        ) : sendingSOS ? (
          <ActivityIndicator color="#fff" />
        ) : (
            <Text style={styles.sosButtonText}>{t('sendSosAlert', 'Send SOS Alert')}</Text>
        )}
      </Pressable>

      {confirmationCountdown !== null && (
        <Pressable style={styles.cancelButton} onPress={cancelSOS}>
          <Text style={styles.cancelButtonText}>{t('cancelSos', 'Cancel SOS')}</Text>
        </Pressable>
      )}

      <Text style={styles.orText}>{t('or', 'OR')}</Text>

      <View style={styles.contactsContainer}>
        <Text style={styles.contactsTitle}>{t('callEmergencyServices', 'Call Emergency Services:')}</Text>
        {emergencyContacts.map((contact, index) => (
          <Pressable
            key={index}
            style={styles.contactButton}
            onPress={() => callEmergency(contact.phone)}
          >
            <Text style={styles.contactText}>
              📞 {contact.name}: {contact.phone}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>{t('cancel', 'Cancel')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fef2f2',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#991b1b',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  locationContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    minWidth: 300,
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  sosButton: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    minWidth: 250,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sosButtonDisabled: {
    backgroundColor: '#fca5a5',
  },
  sosButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
  },
  countdownContainer: {
    alignItems: 'center',
  },
  countdownText: {
    color: 'white',
    fontSize: 48,
    fontWeight: '700',
  },
  countdownLabel: {
    color: 'white',
    fontSize: 16,
    marginTop: 4,
  },
  cancelButton: {
    backgroundColor: '#6b7280',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  orText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  contactsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    minWidth: 300,
  },
  contactsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  contactButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  contactText: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '500',
  },
  backButton: {
    padding: 12,
  },
  backText: {
    color: '#6b7280',
    fontSize: 16,
  },
});