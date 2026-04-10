import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform, Pressable, Alert } from "react-native";
import { useCameraPermissions, CameraView } from "expo-camera";
import { useTranslation } from "react-i18next";

export default function SessionRecorder({ isActive, rideId }: { isActive: boolean; rideId: string }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (isActive && permission?.granted) {
      setIsRecording(true);
    } else {
      setIsRecording(false);
    }
  }, [isActive, permission]);

  if (!isActive) return null;

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>{t("cameraPermissionRequiredTrip")}</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>{t("grantPermission")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.recordingIndicator}>
        <View style={[styles.redDot, isRecording && styles.recordingBlink]} />
        <Text style={styles.text}>{isRecording ? t("recordingTrip") : t("cameraReady")}</Text>
      </View>
      <Pressable 
        style={styles.flagButton} 
        onPress={() => Alert.alert(t("tripFlagged"), t("sessionRecordingRetainedReview"))}
      >
        <Text style={styles.flagButtonText}>{t("flagTrip")}</Text>
      </Pressable>
      {/* The CameraView can be hidden or styled as a small thumbnail depending on your UI needs */}
      <CameraView style={StyleSheet.absoluteFillObject} visible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    backgroundColor: "#fff1f2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecdd3",
    marginBottom: 12,
  },
  recordingIndicator: { flexDirection: "row", alignItems: "center", gap: 8 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#e11d48" },
  recordingBlink: { opacity: 0.8 },
  text: { fontSize: 14, fontWeight: "600", color: "#be123c" },
  button: { backgroundColor: "#e11d48", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  buttonText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  flagButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e11d48",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  flagButtonText: { color: "#e11d48", fontSize: 12, fontWeight: "700" },
});
