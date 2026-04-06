# KindRide: Comprehensive Application Overview

This document serves as a master reference for the KindRide platform, detailing how the app is hosted, how the authentication flow operates, the complete user workflows, and explanations for every core feature built into the platform.

---

## 1. Hosting & Infrastructure Architecture

Because KindRide is a full-stack mobile application, its deployment relies on a few interconnected platforms:

*   **Database & Authentication (Supabase):** 
    *   Hosts the PostgreSQL database (`public.rides`, `public.points`, `public.driver_presence`, etc.).
    *   Manages user authentication via OTP (One-Time Password).
    *   Handles Row Level Security (RLS) and storage for the in-app trip recordings.
*   **Backend Matching & Points Server (FastAPI / Python):**
    *   Must be hosted on a cloud provider like **Render, Railway, Heroku, or AWS**.
    *   Responsible for securely calculating the Match Score, verifying route integrity, and interacting with the `SUPABASE_SERVICE_ROLE_KEY` to mint Humanitarian Points.
*   **Mobile App Build (Expo EAS):**
    *   Built into binaries (`.apk`/`.aab` for Android, `.ipa` for iOS) using Expo Application Services (EAS) and distributed via the App Store and Google Play.

---

## 2. Authentication & OTP Setup

The app uses a 6-digit OTP (One-Time Password) for login instead of passwords. 
**Crucial Setup Step:** By default, Supabase sends "Magic Links." To make the 6-digit code work in the app, you must update the Supabase Email Templates:
1. Go to Supabase Dashboard > Authentication > Email Templates.
2. Under **Magic Link** and **Confirm Signup**, change the template to include the code variable: `{{ .Token }}` instead of `{{ .ConfirmationURL }}`.

---

## 3. End-to-End Workflows

### 🚗 The Driver Workflow
1.  **Preparation:** Driver signs in, verifies their Identity (via Stripe), and toggles Availability to "ON" in the Driver Dashboard. They set their intent (e.g., "Already going this way").
2.  **Heartbeat:** The app silently pings their GPS location and heading to the backend every 30 seconds.
3.  **Request:** They receive a targeted push notification with a destination hint. They have ~60 seconds to tap **Accept**.
4.  **Active Trip:** The passenger boards. The front camera begins recording (for safety). Live GPS feeds the passenger's map. 
5.  **Completion:** The trip ends. The driver instantly receives base points + distance points. If they had a "zero detour" intent, a 1.5x multiplier is applied.
6.  **Rating:** The driver rates the passenger (Smile/Neutral/Sad) to build the passenger's community reputation.

### 🧍 The Passenger Workflow
1.  **Search:** Passenger sets a destination pin. The backend calculates the route heading and finds nearby drivers heading that exact way.
2.  **Request:** Passenger selects a matched driver. If the driver declines, the app prompts the passenger to select the next driver.
3.  **Active Trip:** Passenger tracks the driver's live location. They can trigger an SOS or share a live tracking link with family.
4.  **Completion:** Passenger confirms drop-off. The backend runs a GPS Integrity check to ensure the ride actually happened along the route.
5.  **Rating:** Passenger rates the driver (1-5 stars). A 5-star rating awards the driver an extra +5 Humanitarian Points.

---

## 4. Feature Explanations

### The Match Score & Intent Model
When a passenger requests a ride, they don't just see a random list of cars. The server ranks drivers using a **Match Score (0% to 100%)**. This algorithm weights three things:
1.  **Alignment (α):** Is the driver already heading in the exact direction of the passenger's destination? (Highest priority).
2.  **Proximity (β):** How close is the driver to the passenger's pickup spot?
3.  **Urgency (γ):** Is the passenger in a rush?

### Multi-Leg Handoffs
If a passenger wants to go 30 miles, but no single driver is going that far, the app will break the trip into "legs". 
*   **Driver A** takes the passenger the first 10 miles.
*   While riding with Driver A, the app searches for **Driver B** to take them the rest of the way from a safe transfer point.

### Humanitarian Points Economy
KindRide is free. Drivers earn non-transferable social capital called Humanitarian Points.
*   **Base & Distance:** 10 points + 1 point per mile.
*   **Zero-Detour Multiplier:** If the driver didn't have to go out of their way, they get a 1.5x multiplier (encouraging pure carpooling).
*   **Bonuses:** +5 points for 5-star ratings, +3 for the first ride of the day, +25 for a 7-day streak.
*   **Tiers:** Drivers level up from "Helper" to "Elite" based on their total points.

### Community Hubs
A system designed to build localized trust. Organizations (Campuses, Hospitals, Corporate offices, Churches) are given a secret "Hub Code". 
*   Drivers enter this code in their dashboard.
*   The system grants them an official "Affiliated Badge". 
*   This allows the platform to create "walled gardens" of trust, making passengers feel safer knowing their driver is affiliated with a trusted local institution.

### Progressive Trust
A safety mechanic to protect the network from bad actors. Brand new drivers (in the "Helper" tier) are algorithmically capped. For example, their car will only be visible to passengers within a strict 2km radius. As they complete rides and earn higher trust tiers, their visibility radius expands to the full 5km.

### Stripe Identity Verification
Drivers can optionally (or mandatorily, depending on region) verify their physical ID (Driver's License) using Stripe Identity. Drivers who pass this receive an "ID Verified" badge and a 10% boost to their Match Score, pushing them to the top of passenger request lists.

### In-App Trip Recording
A mandatory safety feature. When the passenger boards and the trip begins, the app automatically activates the driver's front-facing camera and microphone. 
*   It records the trip and securely uploads it to the Supabase cloud. 
*   It is auto-deleted after 72 hours to protect privacy.
*   If an incident occurs, either user can "Flag" the trip, preserving the video for 30 days for admin review.

### SOS Emergency System
Available on the Active Trip screen. Tapping it triggers a 5-second countdown. If not cancelled, it does two things:
1.  Pings the backend to permanently log an emergency at those exact GPS coordinates.
2.  Opens the phone's native dialer/SMS to alert local emergency services (e.g., 911) or designated emergency contacts.

### Live Trip Share
Passengers can generate a secure, obfuscated link (`/rides/share/TOKEN`) to send to friends or family. This link allows loved ones to monitor the vehicle's progress on a map in real-time without needing to download the app or create an account.

### Ride Integrity & Anomaly Detection
To prevent users from "faking" trips just to earn points, the backend runs a background check when a ride completes:
1.  **GPS Corridor Check:** Did the car actually travel from the pickup to the destination? If the final drop-off GPS is more than 500 meters away from the expected route, the trip is flagged.
2.  **Duration Check:** Did the trip happen too fast? (e.g., completing a 10-mile trip in 2 minutes).
3.  **Replay Guard:** The server hashes the trip coordinates and device data to ensure the same ride cannot be submitted twice to farm points.

### Zero-Knowledge Route Commitment (Patent Architecture)
*(Currently documented in schema, pending final rollout)*. A cryptographic system where the driver's phone mathematically proves they stayed on their route without ever sending their exact, private, turn-by-turn GPS coordinates to the central server.