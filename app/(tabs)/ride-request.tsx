import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function RideRequestScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ride Request</Text>
      <Text style={styles.subtitle}>This is your second screen.</Text>

      <Link href="/(tabs)" style={styles.link}>
        Back to Home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#4b587c",
    marginBottom: 20,
    textAlign: "center",
  },
  link: {
    fontSize: 16,
    color: "#2563eb",
    fontWeight: "600",
  },
});