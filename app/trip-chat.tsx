/*
  CREATE TABLE IF NOT EXISTS trip_chat_presence (
    ride_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    is_typing boolean DEFAULT false,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (ride_id, user_id)
  );
  ALTER PUBLICATION supabase_realtime ADD TABLE trip_chat_presence;
*/
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

type TripMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default function TripChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rideId?: string }>();
  const rideId = typeof params.rideId === "string" ? params.rideId : "";
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const listRef = useRef<FlatList<TripMessage> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const otherTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Animated dots for typing bubble
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isOtherUserTyping) return;
    const makePulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      );
    const anim = Animated.parallel([makePulse(dot1, 0), makePulse(dot2, 200), makePulse(dot3, 400)]);
    anim.start();
    return () => { anim.stop(); dot1.setValue(0); dot2.setValue(0); dot3.setValue(0); };
  }, [isOtherUserTyping, dot1, dot2, dot3]);

  useEffect(() => {
    if (!supabase || !rideId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = sessionData.session?.user?.id ?? null;
      setCurrentUserId(uid);
      currentUserIdRef.current = uid;

      const { data } = await supabase
        .from("trip_messages")
        .select("id, sender_id, body, created_at")
        .eq("ride_id", rideId)
        .order("created_at");

      if (!cancelled) {
        setMessages((data ?? []) as TripMessage[]);
        setLoading(false);
      }
    };

    void loadMessages();

    const channel = supabase
      .channel(`trip_chat:${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const nextMessage = payload.new as TripMessage;
          setMessages((prev) => (
            prev.some((message) => message.id === nextMessage.id)
              ? prev
              : [...prev, nextMessage]
          ));
        }
      )
      .subscribe();

    const presenceChannel = supabase
      .channel(`trip_presence:${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_chat_presence",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const presence = payload.new as { user_id: string; is_typing: boolean; updated_at: string };
          const uid = currentUserIdRef.current;
          if (presence && presence.user_id && uid && presence.user_id !== uid) {
            if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
            
            const updatedAt = new Date(presence.updated_at).getTime();
            const now = Date.now();
            if (presence.is_typing && now - updatedAt < 5000) {
              setIsOtherUserTyping(true);
              otherTypingTimeoutRef.current = setTimeout(() => {
                setIsOtherUserTyping(false);
              }, 5000);
            } else {
              setIsOtherUserTyping(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
    };
  }, [rideId]);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages]);

  const updateTypingPresence = async (typing: boolean) => {
    const uid = currentUserIdRef.current;
    if (!supabase || !rideId || !uid) return;
    if (isTypingRef.current === typing) return;
    isTypingRef.current = typing;
    await supabase.from("trip_chat_presence").upsert({
      ride_id: rideId,
      user_id: uid,
      is_typing: typing,
      updated_at: new Date().toISOString(),
    });
  };

  const handleTextChange = (text: string) => {
    setDraft(text);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (text.trim().length > 0) {
      updateTypingPresence(true);
      typingTimeoutRef.current = setTimeout(() => {
        updateTypingPresence(false);
      }, 2000);
    } else {
      updateTypingPresence(false);
    }
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!supabase || !rideId || !currentUserId || !body || sending) return;
    setSending(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    updateTypingPresence(false);

    const { error } = await supabase.from("trip_messages").insert({
      ride_id: rideId,
      sender_id: currentUserId,
      body,
    });
    if (!error) {
      setDraft("");
      // Fire-and-forget push notification to the other party
      supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        // Derive base URL from lib — same pattern used elsewhere in the app
        import("@/lib/backend-api-urls").then(({ getRideStatusUrlOrNull }) => {
          const baseUrl = getRideStatusUrlOrNull("dummy")?.split("/rides/")[0];
          if (!baseUrl) return;
          fetch(`${baseUrl}/chat/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ rideId, body }),
          }).catch(() => {}); // non-critical — message was already sent
        });
      });
    }
    setSending(false);
  };

  const emptyState = useMemo(() => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptyBody}>Send a quick note to your driver or passenger. They'll see it instantly.</Text>
    </View>
  ), []);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Trip Chat</Text>
            <Text style={styles.headerSub}>Live · end-to-end secured</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#0d9488" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={messages.length === 0 ? styles.emptyContent : styles.listContent}
            renderItem={({ item, index }) => {
              const isOwn = item.sender_id === currentUserId;
              const isLastInList = index === messages.length - 1;
              return (
                <View style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther]}>
                  <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                    <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>{item.body}</Text>
                    <View style={styles.timeRow}>
                      <Text style={[styles.timestamp, isOwn && styles.timestampOwn]}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Text>
                      {isOwn && isLastInList && (
                        <Text style={styles.sentStatus}>✓ Sent</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={emptyState}
          />
        )}

        {isOtherUserTyping && (
          <View style={styles.typingIndicatorContainer}>
            <View style={styles.typingBubble}>
              {[dot1, dot2, dot3].map((dot, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.typingDot,
                    { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
                  ]}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={handleTextChange}
            placeholder="Type a message"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            maxLength={500}
            multiline
          />
          <Pressable
            onPress={() => void sendMessage()}
            disabled={sending || draft.trim().length === 0}
            style={[styles.sendButton, (sending || draft.trim().length === 0) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>{sending ? "·" : "↑"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#0f172a",
    lineHeight: 22,
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerSub: {
    fontSize: 11,
    color: "#0d9488",
    fontWeight: "600",
    marginTop: 1,
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 40,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },
  emptyBody: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 240,
  },
  messageRow: {
    marginBottom: 4,
    flexDirection: "row",
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: "#0d9488",
    borderBottomRightRadius: 4,
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleOther: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: "#0f172a",
  },
  messageTextOwn: {
    color: "#ffffff",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  timestamp: {
    fontSize: 11,
    color: "#94a3b8",
  },
  timestampOwn: {
    color: "rgba(255,255,255,0.65)",
  },
  sentStatus: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
  },
  typingIndicatorContainer: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "transparent",
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "#e2e8f0",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: 4,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#64748b",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    backgroundColor: "#ffffff",
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
  },
  sendButton: {
    backgroundColor: "#0d9488",
    borderRadius: 22,
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#cbd5e1",
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
});
