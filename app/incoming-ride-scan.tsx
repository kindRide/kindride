import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function IncomingRideScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();

  // Camera permissions are still loading
  if (!permission) {
    return <View style={styles.container} />;
  }

  // Camera permissions are denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>{t("cameraPermissionNeededForQr")}</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>{t("grantPermission")}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>{t("goBack", "Go back")}</Text>
        </Pressable>
      </View>
    );
  }

  const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    // Extract UUID from the scanned string (handles plain UUIDs or custom URI schemes)
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
    const match = data.match(uuidRegex);

    if (match && match[0]) {
      const rideId = match[0];
      // Navigate back to the incoming ride screen with the scanned ride ID populated
      router.replace({ pathname: "/incoming-ride", params: { rideId } });
    } else {
      Alert.alert(
        t("invalidQrCode"),
        t("invalidKindrideRideQr"),
        [{ text: t("tryAgain"), onPress: () => setScanned(false) }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanBox} />
          <Text style={styles.promptText}>
            {t("scanRideQr", "Scan ride QR")}
          </Text>
        </View>
        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>{t("cancel", "Cancel")}</Text>
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black', justifyContent: 'center' },
  camera: { flex: 1 },
  message: { textAlign: 'center', paddingBottom: 20, color: 'white', fontSize: 16, marginHorizontal: 24 },
  button: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 10,
    marginHorizontal: 40,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#475569' },
  secondaryButtonText: { color: '#cbd5e1', fontSize: 16, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scanBox: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
    borderRadius: 16,
    marginBottom: 24,
  },
  promptText: { color: 'white', fontSize: 18, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  cancelButton: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  cancelButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
