import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert(t("error"), t("pleaseEnterEmailAddress"));
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);

    if (error) {
      Alert.alert(t("resetFailed"), error);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t("checkYourEmail")}</Text>
        <Text style={styles.subtitle}>{t("passwordResetSentTo", { email })}</Text>

        <Pressable style={styles.button} onPress={() => router.replace("/sign-in")}>
          <Text style={styles.buttonText}>{t("backToSignIn")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("resetPasswordTitle")}</Text>
      <Text style={styles.subtitle}>{t("enterEmailResetLink")}</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t("email")}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleResetPassword}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>{t("sendResetLink")}</Text>
          )}
        </Pressable>

        <Link href="/sign-in" style={styles.link}>
          <Text style={styles.linkText}>{t("backToSignIn")}</Text>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7ff",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1f2a44",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#4b587c",
    textAlign: "center",
    marginBottom: 32,
  },
  form: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: "#f8f9fa",
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#9ca3af",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    marginTop: 16,
    alignItems: "center",
  },
  linkText: {
    color: "#2563eb",
    fontSize: 14,
  },
});
