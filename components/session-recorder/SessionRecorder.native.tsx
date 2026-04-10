import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useState, useEffect, useRef } from "react";
import { Alert, Pressable, StyleSheet, Text, View, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getRideStatusUrlOrNull } from "@/lib/backend-api-urls";

type Props = { isActive: boolean; rideId: string };

export default function SessionRecorder({ isActive, rideId }: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [flagged, setFlagged] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const isRecordingRef = useRef(false);

  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [blinkAnim]);

  useEffect(() => {
    let isMounted = true;

    const startRecording = async () => {
      if (!isActive || !permission?.granted || !micPermission?.granted) return;
      if (!cameraRef.current || isRecordingRef.current) return;
      
      try {
        isRecordingRef.current = true;
        // Record video (maxes out or runs until component unmounts and stopRecording is called)
        const video = await cameraRef.current.recordAsync();
        if (video && isMounted) {
          await uploadVideo(video.uri);
        }
      } catch (e) {
        console.error("Recording failed", e);
      } finally {
        isRecordingRef.current = false;
      }
    };

    const timer = setTimeout(startRecording, 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (isRecordingRef.current && cameraRef.current) {
        cameraRef.current.stopRecording();
      }
    };
  }, [isActive, permission, micPermission]);

  const uploadVideo = async (uri: string) => {
    if (!supabase) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      const fileName = `${rideId}-${Date.now()}.mp4`;
      const filePath = `${sessionData.session.user.id}/${fileName}`;
      
      // React Native on Android does not reliably support Blob from local file URIs.
      // ArrayBuffer is fully supported by RN's fetch and by the Supabase storage client.
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("trip-recordings")
        .upload(filePath, arrayBuffer, { contentType: "video/mp4", upsert: false });

      if (uploadError) throw uploadError;

      // Derive the base API url dynamically so we hit the exact same server
      const baseUrl = getRideStatusUrlOrNull("dummy")?.split("/rides/")[0];
      if (baseUrl) {
        await fetch(`${baseUrl}/recordings/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rideId, storagePath: filePath })
        });
      }
    } catch (e) {
      console.error("Upload failed", e);
    }
  };

  const handleFlagTrip = async () => {
    setFlagged(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token || !supabase) return;

      const baseUrl = getRideStatusUrlOrNull("dummy")?.split("/rides/")[0];
      if (baseUrl) {
        await fetch(`${baseUrl}/recordings/flag/${rideId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: "User flagged trip during ride" })
        });
      }
      Alert.alert("Trip Flagged", "This session recording will be retained for 30 days for review.");
    } catch (e) {
      console.error("Failed to flag trip", e);
    }
  };

  if (!isActive) return null;

  const hasPermissions = permission?.granted && micPermission?.granted;
  if (permission === null || micPermission === null) return null; // loading

  if (!hasPermissions) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>
          Safety recording is enabled for this trip. Camera and microphone access are required.
        </Text>
        <Pressable 
          style={styles.btn} 
          onPress={async () => {
            await requestPermission();
            await requestMicPermission();
          }}
        >
          <Text style={styles.btnText}>{t("enableRecording")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.previewRow}>
        <CameraView
          ref={cameraRef}
          style={styles.preview}
          facing="front"
          mode="video"
        />
        {/* Semi-transparent top bar — does NOT cover the live preview */}
        <View style={styles.recordingBar}>
          <Text style={styles.recordingBarText}>🔴  {t("recordingStoredSecurely")}</Text>
        </View>
        <View style={styles.badge}>
          <Animated.View style={[styles.recDot, { opacity: blinkAnim }]} />
          <Text style={styles.recLabel}>{t("rec")}</Text>
        </View>
      </View>
      <Pressable
        style={[styles.btn, flagged && styles.btnFlagged]}
        onPress={handleFlagTrip}
        disabled={flagged}
      >
        <Text style={styles.btnText}>{flagged ? "Trip Flagged" : "Flag Trip"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  previewRow: {
    position: "relative",
    width: "100%",
    height: 120,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: "#0f172a",
  },
  preview: {
    flex: 1,
  },
  recordingBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  recordingBarText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  recLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  hint: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 8,
    lineHeight: 18,
  },
  btn: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  btnFlagged: {
    backgroundColor: "#dc2626",
  },
  btnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
