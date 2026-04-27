# Copilot Task C — Website: Hub Admin Portal

## Context
KindRide website is Next.js with `output: "export"` (Cloudflare Pages static hosting).
Tailwind CSS + Framer Motion. Supabase for data (same project as mobile app).
`website/lib/supabase.ts` exports a configured `supabase` client using `NEXT_PUBLIC_*` env vars.
No new packages. TypeScript strict. Dark design: `#0c1f3f` background, `#0d9488` teal.

Hub admins are people with `hub_members.role = 'hub_admin'` for their hub.
Their Supabase auth credentials are the same as their mobile app account (same Supabase project).

---

## Task

### 1. Create `website/app/hub-admin/page.tsx`

A client-side protected portal. No server components. Use `"use client"`.

**Auth flow (client-side only, compatible with `output: "export"`):**
```ts
const { data: { session } } = await supabase.auth.getSession();
// If no session → show login form
// If session exists → check hub_members for hub_admin role → show dashboard
```

---

### Login view (shown when not authenticated)

```
[Dark full-screen: bg-[#0c1f3f]]

Kind[Ride] wordmark centered

"Hub Admin Portal" title
"Sign in with your KindRide account to access your hub dashboard."

[Email input]
[Password input]
[Sign In button — teal]
[Error text if login fails]
```

Sign in logic:
```ts
await supabase.auth.signInWithPassword({ email, password });
```
On success: `setSession` and proceed to dashboard check.

---

### Hub resolution (after login)

After sign-in, fetch:
```ts
const { data: membership } = await supabase
  .from("hub_members")
  .select("hub_id, role, hubs(id, name, type, slug, verified)")
  .eq("user_id", session.user.id)
  .eq("role", "hub_admin")
  .eq("is_active", true)
  .limit(1)
  .maybeSingle();
```

- If no result → show "You don't have hub admin access." + sign out link
- If result → show the dashboard with `membership.hubs` data

---

### Dashboard view

**Header:**
```
Kind[Ride]  [Hub name chip] [Sign Out]
```

**Hub identity card (top of page):**
- Hub name (large, white, font-black)
- Type badge (University / Church / Nonprofit / Corporate — color-coded)
- Verified status: green "✓ Verified" or yellow "⏳ Pending Approval"
- Slug: `kindride.app/join/{slug}`

**Three stat cards (grid, same style as LiveImpactWall stat cards):**
1. **Total Rides** — count of `rides` where `hub_id = membership.hub_id` AND `status = 'completed'`
   ```ts
   supabase.from("rides").select("*", { count: "exact", head: true })
     .eq("hub_id", membership.hub_id).eq("status", "completed")
   ```
2. **Active Members** — count of `hub_members` where `hub_id = membership.hub_id` AND `is_active = true`
3. **Kind Points Earned** — sum of `kind_points` from completed rides for this hub

**Members table (last 20, most recent first):**
```ts
supabase.from("hub_members")
  .select("user_id, role, joined_at, profiles(display_name)")
  .eq("hub_id", membership.hub_id)
  .eq("is_active", true)
  .order("joined_at", { ascending: false })
  .limit(20)
```
Table columns: Name | Role | Joined Date

**Recent rides list (last 10):**
```ts
supabase.from("rides")
  .select("id, status, pickup_address, dropoff_address, created_at, kind_points, distance_miles")
  .eq("hub_id", membership.hub_id)
  .order("created_at", { ascending: false })
  .limit(10)
```
Show as cards: status badge, pickup → dropoff (truncated), date, points.
Do NOT show driver_id or passenger_id — anonymized.

---

### Style contract

Matches the existing website dark theme:
- Page background: `#0c1f3f`
- Cards: `bg-[#060f1e]` + `border border-white/10` + `rounded-3xl` + `p-8`
- Text primary: `text-white`
- Text muted: `text-white/50`
- Section labels: `text-xs font-bold uppercase tracking-[0.22em] text-white/40`
- Teal: `#0d9488` (`text-teal-400`, `bg-teal-500`)
- Stat card numbers: `text-5xl font-black text-white`
- Button: `bg-teal-500 rounded-2xl px-8 py-4 font-bold text-white hover:bg-teal-400`
- Input: `bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30`

Use Tailwind classes only (no StyleSheet). Use standard `<input>` elements.

---

### Sign-out
```ts
await supabase.auth.signOut();
setSession(null);
```

---

## Files to create
- **CREATE** `website/app/hub-admin/page.tsx` — the entire portal as one client component

## Do NOT
- Create any other files
- Add new npm packages
- Use server components or middleware (incompatible with `output: "export"`)
- Show any platform-wide data (other hubs, all users, SOS alerts)
- Add comments to existing code
- Hard-code any hub IDs or user IDs

## Important Supabase type notes
- `hubs(...)` in the `.select()` returns an object (single row join via FK), not an array
- Cast it with `as unknown as { id: string; name: string; type: string; slug: string; verified: boolean }`
- `profiles(display_name)` in the members join similarly returns a single object per row
