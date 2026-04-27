import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  caption: string;       // pre-written caption (copied to clipboard for all platforms)
  url?: string;          // link to include (defaults to kindride.app)
  onClose: () => void;
};

type Platform = {
  key: string;
  label: string;
  emoji: string;
  bg: string;
  action: (caption: string, url: string) => Promise<void>;
};

async function tryOpen(primary: string, fallback: string) {
  const can = await Linking.canOpenURL(primary);
  await Linking.openURL(can ? primary : fallback);
}

function encodeText(text: string) {
  return encodeURIComponent(text);
}

const PLATFORMS: Platform[] = [
  {
    key: "instagram",
    label: "Instagram",
    emoji: "📸",
    bg: "#c13584",
    action: async (caption) => {
      await Clipboard.setStringAsync(caption);
      await tryOpen("instagram://story-camera", "https://www.instagram.com");
    },
  },
  {
    key: "tiktok",
    label: "TikTok",
    emoji: "🎵",
    bg: "#010101",
    action: async (caption) => {
      await Clipboard.setStringAsync(caption);
      await tryOpen("tiktok://", "https://www.tiktok.com");
    },
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    emoji: "𝕏",
    bg: "#000000",
    action: async (caption, url) => {
      const text = encodeText(`${caption}\n${url}`);
      await tryOpen(
        `twitter://post?message=${text}`,
        `https://twitter.com/intent/tweet?text=${text}`
      );
    },
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    emoji: "💬",
    bg: "#25d366",
    action: async (caption, url) => {
      const text = encodeText(`${caption}\n${url}`);
      await tryOpen(
        `whatsapp://send?text=${text}`,
        `https://wa.me/?text=${text}`
      );
    },
  },
  {
    key: "facebook",
    label: "Facebook",
    emoji: "👥",
    bg: "#1877f2",
    action: async (caption, url) => {
      await Clipboard.setStringAsync(caption);
      await tryOpen(
        `fb://share?link=${encodeText(url)}`,
        `https://www.facebook.com/sharer/sharer.php?u=${encodeText(url)}`
      );
    },
  },
  {
    key: "snapchat",
    label: "Snapchat",
    emoji: "👻",
    bg: "#fffc00",
    action: async (caption) => {
      await Clipboard.setStringAsync(caption);
      await tryOpen("snapchat://", "https://www.snapchat.com");
    },
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    emoji: "💼",
    bg: "#0a66c2",
    action: async (caption, url) => {
      await Clipboard.setStringAsync(caption);
      await tryOpen(
        `linkedin://`,
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeText(url)}&summary=${encodeText(caption)}`
      );
    },
  },
  {
    key: "copy",
    label: "Copy Caption",
    emoji: "📋",
    bg: "#475569",
    action: async (caption, url) => {
      await Clipboard.setStringAsync(`${caption}\n${url}`);
    },
  },
  {
    key: "more",
    label: "More",
    emoji: "↗️",
    bg: "#0d9488",
    action: async (caption, url) => {
      await Share.share({ message: `${caption}\n${url}`, title: "KindRide" });
    },
  },
];

export default function SocialShareSheet({ visible, caption, url = "kindride.app", onClose }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  async function handlePlatform(platform: Platform) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await platform.action(caption, url);
      const msg =
        platform.key === "copy"
          ? "Caption copied!"
          : platform.key === "more"
          ? null
          : "Caption copied — paste it into your post!";
      if (msg) showToast(msg);
    } catch {
      showToast("Could not open app — try the Copy button.");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
          // prevent tap-through to overlay
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>Share to</Text>
          <Text style={styles.previewCaption} numberOfLines={2}>{caption}</Text>

          {/* Platform grid */}
          <View style={styles.grid}>
            {PLATFORMS.map((p) => (
              <Pressable key={p.key} style={styles.platformBtn} onPress={() => handlePlatform(p)}>
                <View style={[styles.platformIcon, { backgroundColor: p.bg }]}>
                  <Text style={styles.platformEmoji}>{p.emoji}</Text>
                </View>
                <Text style={styles.platformLabel}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Toast */}
          {toast && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          )}

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  previewCaption: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 20,
    lineHeight: 18,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
  },
  platformBtn: {
    width: "18%",
    alignItems: "center",
    gap: 6,
  },
  platformIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  platformEmoji: {
    fontSize: 24,
  },
  platformLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
  toast: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748b",
  },
});
