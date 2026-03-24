import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>KindRide is running</Text>
      <Text style={styles.subtitle}>Expo Go is connected successfully.</Text>

      <Link href="/(tabs)/ride-request" style={styles.link}>
        Go to Ride Request
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7ff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#4b587c",
    textAlign: "center",
    marginBottom: 20,
  },
  link: {
    fontSize: 16,
    color: "#2563eb",
    fontWeight: "600",
  },
});