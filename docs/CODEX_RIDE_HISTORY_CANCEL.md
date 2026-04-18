# Codex Task — Ride History (enhance) + Cancel Flow (new screen)

## Context
KindRide is a React Native / Expo Router app (TypeScript, strict).  
Supabase is the database. Backend runs on Render (FastAPI).  
Design language: white cards, teal (#0d9488) primary, slate text, rounded-2xl, StyleSheet (no NativeWind).  
All components must be `"use no memo"` free — do NOT add that pragma.  
No new packages. Use only what is already installed.

---

## Task 1 — Enhance `app/ride-history.tsx`

The file already exists with a basic passenger-only list. Replace its content entirely.

### What to build

**A. Tab toggle — "As Passenger" | "As Driver"**
- Two pill tabs at the top, teal underline on active
- Default: "As Passenger"

**B. Passenger tab query**
```ts
supabase
  .from("rides")
  .select("id, status, pickup_address, dropoff_address, created_at, kind_points, driver_id, distance_miles")
  .eq("passenger_id", uid)
  .order("created_at", { ascending: false })
  .limit(60)
```
Then batch-fetch driver names:
```ts
supabase
  .from("profiles")
  .select("id, display_name")
  .in("id", driverIds)   // driverIds = rides.map(r => r.driver_id).filter(Boolean)
```
Show `display_name` in the card footer (e.g. "Driver: Alex J."), not the raw UUID.

**C. Driver tab query**
```ts
supabase
  .from("rides")
  .select("id, status, pickup_address, dropoff_address, created_at, kind_points, passenger_id, distance_miles")
  .eq("driver_id", uid)
  .order("created_at", { ascending: false })
  .limit(60)
```
Then batch-fetch passenger names from `profiles` the same way.
Show `display_name` as "Passenger: Jordan M." in the card footer.

**D. Stats strip** — shown above the list, always visible
Three chips in a row:
- Total rides (count of all rides in current tab's data)
- Total Kind Points (sum of kind_points where status = "completed")
- Total miles (sum of distance_miles where status = "completed", rounded to 1 decimal, suffixed " mi")

**E. Card layout** — replace the existing card with:
```
[STATUS BADGE]                        [DATE]
Pickup: <pickup_address>
  →
Dropoff: <dropoff_address>
[distance_miles mi · Driver/Passenger name]      [+N pts]
                                        [Rebook →]  ← passenger completed only
```
- "Rebook →" is a small teal text button, only on completed passenger rides
- On press: `router.push({ pathname: "/(tabs)/ride-request" })` — just sends user to ride request (no pre-fill needed)

**F. Pull-to-refresh** — keep existing RefreshControl pattern, apply to both tabs

**G. Empty state per tab**
- Passenger: "No rides as a passenger yet." + "Find a Ride" button → `/(tabs)/ride-request`
- Driver: "No rides as a driver yet." + "Start Driving" button → `/(tabs)/driver`

---

## Task 2 — New screen `app/cancel-ride.tsx`

### Purpose
A dedicated confirmation screen shown when a user wants to cancel an active/pending ride. Currently cancellation is an inline Alert in `active-trip.tsx`. This moves it to a proper screen with a reason selector.

### Route params
```ts
useLocalSearchParams<{
  rideId: string;
  driverName?: string;   // shown in the header if provided
  context?: string;      // "searching" | "accepted" — affects copy
}>()
```

### UI layout
```
< Back          Cancel Ride

[Driver name if provided, else "Your ride"]
[Status context: "Still searching for a driver" or "Driver has been assigned"]

Why are you cancelling?

( ) Plans changed
( ) Emergency
( ) Driver is taking too long
( ) I selected the wrong destination
( ) Other

[Cancel this ride]  ← teal button, disabled until reason selected
```

- Single-select radio list (Pressable rows with a circle indicator, teal fill when selected)
- On submit: call `POST /rides/cancel-pending` via `getRidesCancelPendingUrlOrNull()` from `@/lib/backend-api-urls`
- Request body: `{ rideId, reason }` where reason is the selected label string
- Auth header: Bearer token from `supabase.auth.getSession()`
- On success: `router.replace("/(tabs)")` + `Alert.alert("Ride cancelled", "Your driver has been notified.")`
- On error: show inline error text below button, do not navigate away
- Loading state: ActivityIndicator inside button, button disabled

### Entry point — update `app/active-trip.tsx`
Find the existing "Cancel ride?" Alert.alert block (around line 619 — `const confirmCancelRide`).  
Replace it so that instead of doing the API call inline, it pushes to the new screen:
```ts
router.push({
  pathname: "/cancel-ride",
  params: {
    rideId,
    driverName,
    context: rideStatus === "accepted" ? "accepted" : "searching",
  },
});
```
Remove the inline fetch + Alert cancel logic from `confirmCancelRide` — the new screen owns that.  
Keep the `isCancellingRide` state and button but simplify: on press just push the route (no Alert needed).

---

## Style contract
- Root background: `#f8fafc`
- Cards: `backgroundColor: "#ffffff"`, `borderRadius: 14`, `borderWidth: 1`, `borderColor: "#e2e8f0"`
- Primary teal: `#0d9488`
- Teal hover/active: `#0f766e`
- Danger red: `#ef4444`
- Text primary: `#0f172a`
- Text muted: `#64748b`
- Section labels: `fontSize: 11`, `fontWeight: "700"`, `textTransform: "uppercase"`, `letterSpacing: 0.5`, `color: "#94a3b8"`
- Buttons: `borderRadius: 14`, `paddingVertical: 14`, `fontWeight: "700"`

## Files to create / modify
- **MODIFY** `app/ride-history.tsx` — full replacement
- **CREATE** `app/cancel-ride.tsx` — new screen
- **MODIFY** `app/active-trip.tsx` — replace `confirmCancelRide` to push `/cancel-ride`

## Do NOT
- Add new npm packages
- Change any other files
- Add comments to code you didn't write
- Use NativeWind / Tailwind classes
- Add `"use no memo"` pragma
