# Codex Prompt — KindRide Website Phase 2

## Context
KindRide is a community rideshare app (React Native / Expo). We are building a
marketing website in `website/` (Next.js 14, Tailwind CSS, Framer Motion).

Phase 1 (Hero + live counter + download links) will already be scaffolded by the
time you work on this. Your job is Phase 2.

The website shares the same Supabase project as the mobile app:
- `NEXT_PUBLIC_SUPABASE_URL` — already in `website/.env.local`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already in `website/.env.local`

Relevant Supabase tables:
- `hubs` — columns: id, name, type, slug, logo_url, verified, approved_by, subscription_tier
- `hub_members` — columns: hub_id, user_id, is_active
- `rides` — columns: id, status, created_at, driver_id, passenger_id

---

## Task 1 — Hub Showcase Section (`website/components/HubShowcase.tsx`)

Build a React component that:

1. Fetches all approved hubs from Supabase on mount:
   ```ts
   supabase.from("hubs")
     .select("id, name, type, slug, logo_url")
     .eq("verified", true)
     .not("approved_by", "is", null)
   ```

2. For each hub, fetches the member count:
   ```ts
   supabase.from("hub_members")
     .select("hub_id", { count: "exact" })
     .eq("hub_id", hub.id)
     .eq("is_active", true)
   ```

3. Renders animated cards in a responsive grid (3 columns desktop, 2 tablet, 1 mobile):
   - Hub logo (show a placeholder icon if `logo_url` is null)
   - Hub name (bold, large)
   - Hub type badge (university / church / nonprofit / corporate) — color coded
   - Member count: *"42 members"*
   - Subtle hover animation (scale up slightly, shadow deepens)

4. Uses Framer Motion `motion.div` with `whileHover` and `initial/animate` for entrance animation

5. Empty state: if no hubs yet, show *"Be the first hub in your community →"* with a link to the hub application form

Style guide:
- Background: `#f8fafc`
- Card background: `#ffffff`
- Border: `1px solid #e2e8f0`
- Border radius: `16px`
- University badge: `#0d9488` (teal)
- Church badge: `#7c3aed` (purple)
- Nonprofit badge: `#ea580c` (orange)
- Corporate badge: `#1d4ed8` (blue)

---

## Task 2 — The Difference Section (`website/components/DifferenceSection.tsx`)

Build a React component that renders a side-by-side comparison table:

| Uber / Lyft | KindRide |
|-------------|----------|
| Stranger drives you | Your neighbor drives you |
| Profit extracted from community | Points stay in your community |
| Algorithm decides who you trust | Community builds the trust |
| VC money leaves your city | Value circulates locally |
| You're a customer | You're a member |

Design requirements:
- Two columns, full width, dark background (`#0c1f3f`)
- Left column (Uber/Lyft): muted gray text, slightly faded
- Right column (KindRide): bright white text, teal accent (`#0d9488`) on key words
- Each row animates in on scroll using Framer Motion `whileInView`
- A vertical divider line with a `vs` label in the center
- Section title above: *"This is not a taxi app."* — large, white, bold

---

## Task 3 — Hub Application Form (`website/components/HubApplicationForm.tsx`)

Build a multi-step form (3 steps) that lets universities, churches, and nonprofits
apply to become a KindRide hub:

**Step 1 — Organization details**
- Hub name (text input, required)
- Hub type (select: university / church / nonprofit / corporate)
- City (text input, required)

**Step 2 — Contact details**
- Contact name (text input, required)
- Contact email (email input, required)
- Phone number (text input, optional)

**Step 3 — Review & Submit**
- Summary of entered details
- Submit button

On submit, insert into Supabase `hubs` table:
```ts
supabase.from("hubs").insert({
  name: formData.hubName,
  type: formData.hubType,
  slug: formData.hubName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
  verified: false,
  approved_by: null,
})
```

On success: show a confirmation message —
*"Application received. The KindRide team will review and reach out within 48 hours."*

On error: show a friendly error message.

Style: white card, centered, max-width 560px, step indicator at top (1 → 2 → 3),
teal progress bar, same border radius and color palette as the rest of the site.

---

## Quality bar
- TypeScript strict — no `any`
- All Supabase calls use `await` with error handling
- No hardcoded secrets — use `process.env.NEXT_PUBLIC_*`
- Tailwind only for styling — no inline styles except where Framer Motion requires it
- Components are self-contained — no changes needed outside the component files
- Export each component as a default export
- After building components, import and use them in `website/app/page.tsx`
  (the scaffold will have placeholder comments marking where each section goes)
