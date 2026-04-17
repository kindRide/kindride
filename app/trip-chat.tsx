import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useLocalSearchParams, useRouter } from "expo-router";

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
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<TripMessage> | null>(null);

  useEffect(() => {
    if (!supabase || !rideId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      setCurrentUserId(sessionData.session?.user?.id ?? null);

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

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!supabase || !rideId || !currentUserId || !body || sending) return;
    setSending(true);
    const { error } = await supabase.from("trip_messages").insert({
      ride_id: rideId,
      sender_id: currentUserId,
      body,
    });
    if (!error) {
      setDraft("");
    }
    setSending(false);
  };

  const emptyState = useMemo(() => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptyBody}>Send a quick update to your driver or passenger.</Text>
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
            <Text style={styles.backButtonText}>{"< Back"}</Text>
          </Pressable>
          <Text style={styles.title}>Trip Chat</Text>
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
            renderItem={({ item }) => {
              const isOwn = item.sender_id === currentUserId;
              return (
                <View style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther]}>
                  <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                    <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>{item.body}</Text>
                    <Text style={[styles.timestamp, isOwn && styles.timestampOwn]}>
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={emptyState}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
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
            <Text style={styles.sendButtonText}>{sending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
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
    minWidth: 72,
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerSpacer: {
    width: 72,
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
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
  messageRow: {
    marginBottom: 10,
    flexDirection: "row",
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: "#0d9488",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#e2e8f0",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: "#0f172a",
  },
  messageTextOwn: {
    color: "#ffffff",
  },
  timestamp: {
    marginTop: 6,
    fontSize: 11,
    color: "#475569",
  },
  timestampOwn: {
    color: "#ccfbf1",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
  },
  sendButton: {
    backgroundColor: "#0d9488",
    borderRadius: 14,
    minHeight: 46,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
