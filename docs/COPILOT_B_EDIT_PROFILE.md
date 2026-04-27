# Copilot Task B — Mobile: Edit Profile Screen

## Context
KindRide is a React Native / Expo Router app (TypeScript, strict).
Design: white cards, teal (#0d9488) primary, slate text, rounded-2xl, StyleSheet (no NativeWind).
Supabase is the database. No new packages. No `"use no memo"` pragma.

The app currently shows the user's email in settings but there is no way to edit the `display_name`
field on the `profiles` table. Passengers and drivers see each other by display name — this is
important for trust. Fix this gap.

---

## Task

### 1. Create `app/edit-profile.tsx`

A simple focused screen. No tabs. No scroll needed.

**Route params:** none — reads the current session user's own profile.

**Data:**
- On mount: fetch from `supabase.from("profiles").select("display_name, bio").eq("id", session.user.id).single()`
- `display_name`: string | null
- `bio`: string | null (optional one-liner about themselves)

**UI layout:**
```
< Back            Edit Profile

[Avatar circle — teal gradient, initial letter of display_name or email]

DISPLAY NAME
[TextInput — pre-filled with current display_name]
"This is what drivers and passengers see when you share a ride."

BIO (optional)
[TextInput multiline — pre-filled with bio, maxLength=120]
"A short line about yourself. Optional."

[Save Changes]  ← teal button, disabled if unchanged or empty display_name
```

**Validation:**
- `display_name` required, 2–40 chars, strip leading/trailing whitespace
- `bio` optional, max 120 chars
- Show char count hint under bio: "72 / 120"

**Save logic:**
```ts
await supabase
  .from("profiles")
  .update({ display_name: name.trim(), bio: bio.trim() || null })
  .eq("id", session.user.id);
```
- On success: `Alert.alert("Saved", "Your profile has been updated.")` then `router.back()`
- On error: inline error text below the button

**Loading states:**
- Initial load: `ActivityIndicator` centered
- Saving: `ActivityIndicator` inside button, button disabled

**Style contract:**
- Root background: `#f8fafc`
- Input container: `backgroundColor: "#ffffff"`, `borderRadius: 12`, `borderWidth: 1`, `borderColor: "#e2e8f0"`
- Section labels: `fontSize: 11`, `fontWeight: "700"`, `textTransform: "uppercase"`, `letterSpacing: 0.5`, `color: "#94a3b8"`
- Save button: `backgroundColor: "#0d9488"`, `borderRadius: 14`, `paddingVertical: 14`, `fontWeight: "700"`
- Avatar: 72×72 teal gradient circle with 28px white initial letter

Use `useAuth` from `@/lib/auth` for session. Use `supabase` from `@/lib/supabase`.
Use `SafeAreaView` with `edges={["top", "bottom"]}`.

---

### 2. Add entry point in `app/(tabs)/settings.tsx`

Find the Account section (around line 356 — after the profile row, before "My Ride History").
Add a new `SettingRow` for Edit Profile:

```tsx
<SettingRow
  icon="✏️"
  iconBg="#f0fdf4"
  label="Edit Profile"
  sub="Display name & bio"
  onPress={() => router.push("/edit-profile")}
  simplified={S}
/>
<View style={styles.rowDivider} />
```

Insert it **before** the existing "My Ride History" row. No other changes to settings.tsx.

---

## Files to create / modify
- **CREATE** `app/edit-profile.tsx`
- **MODIFY** `app/(tabs)/settings.tsx` — add one SettingRow

## Do NOT
- Add new packages
- Modify any other file
- Add `"use no memo"` pragma
- Add comments to existing code
