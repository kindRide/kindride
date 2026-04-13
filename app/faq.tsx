import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, { FadeIn, FadeInDown, Layout } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const FAQ_ITEMS = [
  { q: "faqQ1", a: "faqA1" },
  { q: "faqQ2", a: "faqA2" },
  { q: "faqQ3", a: "faqA3" },
  { q: "faqQ4", a: "faqA4" },
  { q: "faqQ5", a: "faqA5" },
  { q: "faqQ6", a: "faqA6" },
  { q: "faqQ7", a: "faqA7" },
];

function FAQItem({ qKey, aKey, index }: { qKey: string; aKey: string; index: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <Reanimated.View 
      entering={FadeInDown.delay(index * 50).springify()} 
      layout={Layout.springify()}
    >
      <Pressable style={styles.card} onPress={() => setExpanded(!expanded)}>
        <View style={styles.questionRow}>
          <Text style={styles.question}>{t(qKey)}</Text>
          <Text style={styles.chevron}>{expanded ? "−" : "+"}</Text>
        </View>
        {expanded && (
          <Reanimated.Text entering={FadeIn.duration(200)} style={styles.answer}>
            {t(aKey)}
          </Reanimated.Text>
        )}
      </Pressable>
    </Reanimated.View>
  );
}

export default function FAQScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e", "#0a5c54"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← {t("back", "Back")}</Text>
        </Pressable>
        <Reanimated.View entering={FadeInDown.delay(0).springify()}>
          <Text style={styles.heroEyebrow}>{t("about", "About")}</Text>
          <Text style={styles.heroTitle}>{t("faqTitle", "Frequently Asked Questions")}</Text>
        </Reanimated.View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {FAQ_ITEMS.map((item, i) => (
          <FAQItem key={item.q} qKey={item.q} aKey={item.a} index={i} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  hero: { paddingTop: 16, paddingBottom: 32, paddingHorizontal: 20 },
  backBtn: { marginBottom: 16, alignSelf: "flex-start", paddingVertical: 8, paddingRight: 16 },
  backBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "600" },
  heroEyebrow: { color: "#5eead4", fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 },
  heroTitle: { color: "#ffffff", fontSize: 28, fontWeight: "800" },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  questionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  question: { flex: 1, fontSize: 15, fontWeight: "700", color: "#1e293b", lineHeight: 22 },
  chevron: { fontSize: 24, fontWeight: "300", color: "#94a3b8" },
  answer: { marginTop: 12, fontSize: 14, color: "#475569", lineHeight: 22 },
});