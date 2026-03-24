import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function PostTripRatingScreen() {
  const router = useRouter();
  const currentUserRole: "driver" | "passenger" = "driver";
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);

  const handleSubmit = () => {
    const basePoints = 10;
    const fiveStarBonus = rating === 5 ? 5 : 0;
    const totalEarned = basePoints + fiveStarBonus;
    setEarnedPoints(totalEarned);
    setSubmitted(true);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Rate Your Trip</Text>
      <Text style={styles.subtitle}>How was your ride with Aisha Bello?</Text>

      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setRating(star)}>
            <Text style={star <= rating ? styles.starActive : styles.starInactive}>★</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        placeholder="Optional review..."
        value={review}
        onChangeText={setReview}
        multiline
        style={styles.input}
      />

      <Pressable onPress={handleSubmit} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Submit Rating</Text>
      </Pressable>

      <Link href="/(tabs)" style={styles.skipLink}>
        Skip
      </Link>

      {submitted ? (
        <View style={styles.successBlock}>
          <Text style={styles.successText}>Thanks! Your rating has been recorded.</Text>
          {currentUserRole === "driver" ? (
            <>
              <Text style={styles.pointsText}>You earned +{earnedPoints} points</Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/points",
                    params: { earned: String(earnedPoints), role: currentUserRole },
                  })
                }
                style={styles.pointsButton}
              >
                <Text style={styles.pointsButtonText}>View Points</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.passengerNote}>Points are shown for driver accounts only.</Text>
          )}
          <Pressable onPress={() => router.replace("/(tabs)")} style={styles.homeButton}>
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8faff",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2a44",
  },
  subtitle: {
    marginTop: 8,
    color: "#4b587c",
    fontSize: 16,
  },
  starsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    marginBottom: 18,
  },
  starActive: {
    fontSize: 36,
    color: "#f59e0b",
  },
  starInactive: {
    fontSize: 36,
    color: "#cbd5e1",
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f5",
    borderRadius: 12,
    minHeight: 110,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 15,
    color: "#1f2a44",
  },
  submitButton: {
    marginTop: 14,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  skipLink: {
    marginTop: 14,
    textAlign: "center",
    color: "#4b587c",
    fontSize: 15,
    fontWeight: "600",
  },
  successText: {
    textAlign: "center",
    color: "#166534",
    fontWeight: "600",
    fontSize: 15,
  },
  successBlock: {
    marginTop: 16,
    alignItems: "center",
    gap: 10,
  },
  pointsText: {
    color: "#0f766e",
    fontWeight: "700",
    fontSize: 16,
  },
  pointsButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  pointsButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  passengerNote: {
    color: "#4b587c",
    fontSize: 14,
    textAlign: "center",
  },
  homeButton: {
    backgroundColor: "#0f766e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  homeButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
});
