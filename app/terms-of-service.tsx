"use no memo";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const TOS_VERSION = "1.0";
const EFFECTIVE_DATE = "April 20, 2026";

// A section header inside the ToS document
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={styles.para}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

export default function TermsOfServiceScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [agreeing, setAgreeing] = useState(false);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 60;
    if (isAtBottom && !hasScrolledToBottom) setHasScrolledToBottom(true);
  };

  const handleAgree = async () => {
    if (!session || !supabase) return;
    setAgreeing(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ tos_accepted_at: new Date().toISOString(), tos_version: TOS_VERSION })
        .eq("id", session.user.id);

      if (error) {
        Alert.alert("Error", "Could not save your agreement. Please try again.");
        return;
      }
      router.replace("/(tabs)");
    } catch {
      Alert.alert("Error", "Network error. Please check your connection and try again.");
    } finally {
      setAgreeing(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* Header */}
      <LinearGradient
        colors={["#0c1f3f", "#0e4a6e"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.logoKind}>Kind<Text style={styles.logoRide}>Ride</Text></Text>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <Text style={styles.headerSub}>Version {TOS_VERSION} · Effective {EFFECTIVE_DATE}</Text>
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>
            Please read carefully. You must agree to use the KindRide platform.
          </Text>
        </View>
      </LinearGradient>

      {/* Scroll hint */}
      {!hasScrolledToBottom && (
        <View style={styles.scrollHint}>
          <Text style={styles.scrollHintText}>↓ Scroll to the bottom to enable the agree button</Text>
        </View>
      )}

      {/* ToS content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={true}
      >

        <Section title="1. What KindRide Is — and Is Not">
          <Para>
            KindRide is a community coordination platform that connects individuals who are willing
            to share their existing vehicle trips with neighbors who need a ride. KindRide is
            NOT a transportation company, a taxi service, a rideshare-for-hire service, or a
            transportation network company (TNC) under any applicable law.
          </Para>
          <Para>
            Drivers on KindRide are private community volunteers. They are not employees,
            agents, contractors, or representatives of KindRide Inc. KindRide does not hire,
            direct, control, or compensate drivers. KindRide does not dispatch vehicles or
            guarantee the availability of rides at any time.
          </Para>
          <Para>
            By using this platform, you acknowledge and agree that any ride you receive or
            give is a voluntary, community-organized exchange between two private individuals,
            not a commercial transaction with KindRide.
          </Para>
        </Section>

        <Section title="2. Eligibility">
          <Para>To create an account and use KindRide, you must:</Para>
          <Bullet>Be at least 18 years of age, OR be a minor with documented parent or legal guardian consent who has also agreed to these Terms on your behalf.</Bullet>
          <Bullet>Have a valid, active email address or phone number.</Bullet>
          <Bullet>Provide truthful and accurate information during registration and at all times thereafter.</Bullet>
          <Bullet>Not be barred from using the platform under any applicable law or a prior KindRide suspension.</Bullet>
          <Para>
            Drivers must additionally hold a valid, unexpired driver's license issued in the
            jurisdiction where they operate, and must maintain at minimum the minimum auto
            insurance coverage required by their state or territory.
          </Para>
        </Section>

        <Section title="3. Insurance — Critical Notice to All Users">
          <Para>
            KindRide does NOT provide any form of auto insurance, liability insurance, or
            supplemental coverage for any ride arranged through the platform. This includes
            but is not limited to: bodily injury liability, property damage liability,
            collision, comprehensive, uninsured/underinsured motorist, medical payments,
            or personal injury protection.
          </Para>
          <Para>
            IMPORTANT FOR DRIVERS: Standard personal auto insurance policies in the United
            States often contain exclusions for vehicles used for transportation network
            company (TNC) or rideshare activities. Providing rides through KindRide —
            even without charge — may constitute a rideshare activity under your insurer's
            definitions and could void coverage during an incident.
          </Para>
          <Para>
            Before using KindRide as a driver, you MUST:
          </Para>
          <Bullet>Review your current auto insurance policy for rideshare or TNC exclusions.</Bullet>
          <Bullet>Contact your insurance provider to confirm whether your policy covers community rideshare activities.</Bullet>
          <Bullet>Consider purchasing a rideshare endorsement or a separate rideshare policy if your standard policy excludes this use.</Bullet>
          <Para>
            By checking the insurance confirmation box and using the driver mode on KindRide,
            you represent and warrant that you have verified your insurance coverage and that
            you are lawfully permitted to transport passengers in your vehicle.
          </Para>
          <Para>
            IMPORTANT FOR PASSENGERS: You are riding with a private individual in a personal
            vehicle. You may not be covered by the driver's personal auto insurance in the
            event of an accident. You assume all risk associated with accepting a ride from
            a community volunteer driver.
          </Para>
        </Section>

        <Section title="4. Limitation of Liability">
          <Para>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, KINDRIDE, ITS OFFICERS,
            DIRECTORS, EMPLOYEES, SHAREHOLDERS, AFFILIATES, AGENTS, LICENSORS, AND SERVICE
            PROVIDERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO:
          </Para>
          <Bullet>Personal injury or death arising from or related to a ride arranged through the platform.</Bullet>
          <Bullet>Property damage to any vehicle, belonging, or third party arising from a ride.</Bullet>
          <Bullet>The conduct, actions, or omissions of any driver or passenger using the platform.</Bullet>
          <Bullet>Loss of income, data, business, reputation, or goodwill.</Bullet>
          <Bullet>Failure of the platform to connect users with drivers, or failure of drivers to appear.</Bullet>
          <Para>
            IN JURISDICTIONS THAT DO NOT ALLOW THE EXCLUSION OR LIMITATION OF INCIDENTAL OR
            CONSEQUENTIAL DAMAGES, KINDRIDE'S LIABILITY IS LIMITED TO THE FULLEST EXTENT
            PERMITTED BY LAW.
          </Para>
          <Para>
            IN NO EVENT SHALL KINDRIDE'S TOTAL AGGREGATE LIABILITY TO YOU EXCEED ONE HUNDRED
            DOLLARS (USD $100.00), REGARDLESS OF THE CAUSE OF ACTION OR THE THEORY OF
            LIABILITY.
          </Para>
        </Section>

        <Section title="5. Indemnification">
          <Para>
            You agree to defend, indemnify, and hold harmless KindRide and its officers,
            directors, employees, agents, licensors, and service providers from and against
            any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or
            fees (including reasonable attorneys' fees) arising out of or relating to:
          </Para>
          <Bullet>Your use of the KindRide platform.</Bullet>
          <Bullet>Any ride you provide or receive through the platform.</Bullet>
          <Bullet>Your violation of these Terms of Service.</Bullet>
          <Bullet>Your violation of any rights of a third party, including other users.</Bullet>
          <Bullet>Any accident, injury, or property damage occurring during or arising from a ride you participated in.</Bullet>
          <Bullet>Your misrepresentation regarding your insurance coverage, driver's license, or vehicle condition.</Bullet>
        </Section>

        <Section title="6. User Conduct and Community Standards">
          <Para>All users agree not to:</Para>
          <Bullet>Use the platform for any illegal purpose or in violation of any federal, state, or local law.</Bullet>
          <Bullet>Harass, threaten, intimidate, or harm other users in any way.</Bullet>
          <Bullet>Drive under the influence of alcohol, drugs, or any substance that impairs driving ability.</Bullet>
          <Bullet>Transport controlled substances, illegal weapons, or prohibited items.</Bullet>
          <Bullet>Misrepresent your identity, vehicle, insurance status, or driver's license status.</Bullet>
          <Bullet>Collect any payment, fee, or exchange of value beyond the voluntary Kind Points system.</Bullet>
          <Bullet>Solicit, coerce, or pressure other users in any manner.</Bullet>
          <Bullet>Use data obtained from the platform to contact, track, or locate other users outside the platform.</Bullet>
          <Para>
            KindRide reserves the right, in its sole discretion, to suspend or permanently
            remove any user from the platform at any time, for any reason, including but not
            limited to violations of these standards.
          </Para>
        </Section>

        <Section title="7. Safety Features and Consent">
          <Para>
            KindRide includes optional safety features including audio recording during trips
            (requiring explicit opt-in consent), SOS emergency alerts, and trip sharing links.
            By enabling audio recording, you consent to the recording of audio within your
            vehicle or during your ride and acknowledge that such recordings may be retained
            for up to 72 hours and may be accessed in the event of a safety incident or
            complaint.
          </Para>
          <Para>
            All users consent to the collection and secure storage of trip data, including
            pickup and drop-off locations, trip timestamps, and in-app communications,
            for the purpose of safety, dispute resolution, and platform improvement.
          </Para>
        </Section>

        <Section title="8. Driver Passenger Preferences">
          <Para>
            KindRide allows drivers to specify passenger preferences (e.g., women only, elderly
            passengers, children accompanied by guardians). These preferences are provided as
            a community accommodation feature and reflect the driver's personal or religious
            values. KindRide does not endorse or require any particular preference setting and
            does not discriminate against any protected class. Passengers who do not match a
            driver's stated preference will not be matched to that driver.
          </Para>
        </Section>

        <Section title="9. Kind Points">
          <Para>
            Kind Points are a non-monetary community recognition currency awarded within the
            KindRide platform. Kind Points have no cash value, cannot be redeemed for money,
            are not transferable, and confer no legal rights or entitlements. KindRide reserves
            the right to modify, revoke, or discontinue the Kind Points system at any time
            without compensation or notice.
          </Para>
        </Section>

        <Section title="10. Privacy">
          <Para>
            Your use of KindRide is also governed by our Privacy Policy, which is incorporated
            into these Terms by reference. KindRide does not sell your personal data to third
            parties. Trip data is used solely for matching, safety, and community integrity
            purposes.
          </Para>
        </Section>

        <Section title="11. Dispute Resolution and Arbitration">
          <Para>
            Any dispute arising from or relating to these Terms or your use of the platform
            shall be resolved first by contacting KindRide at admin@kindride.app. If the dispute
            cannot be resolved informally within 30 days, it shall be submitted to binding
            arbitration under the rules of the American Arbitration Association (AAA), except
            as provided below.
          </Para>
          <Para>
            CLASS ACTION WAIVER: You agree that any arbitration or legal proceeding shall be
            conducted on an individual basis only. You waive any right to bring or participate
            in a class action, collective action, or representative proceeding against KindRide.
          </Para>
          <Para>
            EXCEPTION: Either party may seek emergency injunctive or other equitable relief
            in a court of competent jurisdiction where necessary to prevent irreparable harm.
          </Para>
        </Section>

        <Section title="12. Governing Law">
          <Para>
            These Terms shall be governed by and construed in accordance with the laws of the
            State of Maryland, United States, without regard to its conflict of law provisions.
            Any disputes not subject to arbitration shall be brought exclusively in the state
            or federal courts located in Maryland.
          </Para>
        </Section>

        <Section title="13. Changes to These Terms">
          <Para>
            KindRide may modify these Terms at any time. Users will be notified of material
            changes and will be required to re-accept the updated Terms before continuing to
            use the platform. Continued use after acceptance constitutes your agreement to the
            revised Terms.
          </Para>
        </Section>

        <Section title="14. Contact">
          <Para>
            Questions about these Terms may be directed to: admin@kindride.app
          </Para>
          <Para>
            BY TAPPING "I AGREE" BELOW, YOU CONFIRM THAT YOU HAVE READ, UNDERSTOOD, AND
            AGREE TO BE BOUND BY THESE TERMS OF SERVICE IN THEIR ENTIRETY. IF YOU DO NOT
            AGREE, YOU MAY NOT USE THE KINDRIDE PLATFORM.
          </Para>
        </Section>

        {/* Spacer before button */}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Agreement footer */}
      <View style={styles.footer}>
        {!hasScrolledToBottom && (
          <Text style={styles.footerHint}>Scroll to the bottom to continue</Text>
        )}
        <Pressable
          style={[styles.agreeBtn, !hasScrolledToBottom && styles.agreeBtnDisabled]}
          onPress={handleAgree}
          disabled={!hasScrolledToBottom || agreeing}
        >
          {agreeing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.agreeBtnText}>I have read and agree to the Terms of Service</Text>
          )}
        </Pressable>
        <Text style={styles.footerNote}>
          You must agree to use KindRide. By agreeing you also confirm you have read the insurance notice in Section 3.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  // Header
  header: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 },
  logoKind: { fontSize: 18, fontWeight: "800", color: "#fff", marginBottom: 10 },
  logoRide: { color: "#5eead4", fontWeight: "300" },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#fff", marginBottom: 4 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14 },
  noticeBanner: {
    backgroundColor: "rgba(239,68,68,0.18)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)",
    paddingHorizontal: 14, paddingVertical: 10,
  },
  noticeText: { color: "#fca5a5", fontSize: 13, fontWeight: "600", lineHeight: 18 },

  // Scroll hint
  scrollHint: {
    backgroundColor: "#fefce8", paddingVertical: 8, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: "#fde68a",
  },
  scrollHintText: { color: "#92400e", fontSize: 12, fontWeight: "600", textAlign: "center" },

  // Content
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 24 },

  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 15, fontWeight: "800", color: "#0f172a",
    marginBottom: 10, letterSpacing: -0.2,
  },
  para: {
    fontSize: 13.5, color: "#334155", lineHeight: 22,
    marginBottom: 10,
  },
  bulletRow: { flexDirection: "row", gap: 8, marginBottom: 8, paddingLeft: 4 },
  bulletDot: { fontSize: 14, color: "#0d9488", marginTop: 3, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 13.5, color: "#334155", lineHeight: 22 },

  // Footer
  footer: {
    backgroundColor: "#fff",
    borderTopWidth: 1, borderTopColor: "#e2e8f0",
    paddingHorizontal: 20, paddingVertical: 16,
    gap: 10,
  },
  footerHint: {
    textAlign: "center", fontSize: 12, color: "#94a3b8", fontWeight: "600",
  },
  agreeBtn: {
    backgroundColor: "#0d9488",
    borderRadius: 16, paddingVertical: 16,
    alignItems: "center", justifyContent: "center",
  },
  agreeBtnDisabled: { backgroundColor: "#cbd5e1" },
  agreeBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center" },
  footerNote: {
    fontSize: 11, color: "#94a3b8", textAlign: "center", lineHeight: 16,
  },
});
