# KindRide Website — Vision & Build Plan

## The Core Idea
When someone lands on the site, they don't read about KindRide — they **feel** it.
The site is not a brochure. It's a living, breathing reflection of what's happening
in the community right now.

**Stack:** Next.js · Tailwind CSS · Supabase (shared DB) · Framer Motion · Cloudflare Pages

---

## Pages & Sections

### 1. Hero (above the fold)
- Full-screen dark background (`#0c1f3f` — matches the app)
- Large real-time counter: *"3,241 rides given by neighbors"* (live from Supabase)
- Subtitle: *"Not Uber. Not Lyft. Your community."*
- Two CTAs: **Download the App** · **Join as a Hub**
- Animated map background — anonymized ride routes lighting up like neurons

### 2. Live Impact Wall
- Real-time feed: *"A driver in College Park just gave a ride"* — fades in every few seconds
- CO₂ saved counter ticking up
- Kind Points awarded today — live

### 3. The Difference Section
Side-by-side comparison — never been done by a rideshare company:

| Uber / Lyft | KindRide |
|-------------|----------|
| Stranger drives you | Your neighbor drives you |
| Profit extracted | Points stay in community |
| Algorithm matches | Community trusts |
| VC money leaves | Value circulates locally |

### 4. Hub Showcase
- Animated cards for every active hub (university logos, church names, nonprofit badges)
- Each card shows member count + rides given
- Clicking opens a hub profile page

### 5. Driver Stories
- Full-screen scrolling portraits
- Real drivers, real quotes — cinematic, Apple-level direction

### 6. Hub Application Flow
- Universities and churches apply directly on the website (no app needed)
- Multi-step form → inserts into Supabase `hubs` table with `verified=false`
- This is the B2B acquisition engine

### 7. Footer
- App Store + Play Store download links
- `admin@kindride.app`
- One-sentence mission statement

---

## Why This Is World-First
No rideshare company shows community impact in real time on their homepage.
Uber is about convenience. Lyft is about rides. KindRide is about people.
When a university administrator sees *"47 rides given at UMD this week"* — they call.

---

## Build Phases

| Phase | Scope | Owner | Status |
|-------|-------|-------|--------|
| 1 | Next.js scaffold + Hero + live counter + download links | Founder + Claude | In progress |
| 2 | Hub showcase + Difference section | Codex | Pending |
| 3 | Driver stories + Hub application form | Codex | Pending |
| 4 | Animated map + live ride feed | Claude | Pending |

---

## Codex Tasks (Phase 2 — assign now)

See `WEBSITE_CODEX_PROMPT.md` for the full Codex prompt.

---

## Key Decisions
- Hosted on **Cloudflare Pages** at `kindride.app` — free, globally fast, same domain
- Next.js app lives in a new folder: `website/` inside the monorepo
- Supabase client is read-only on the website (public anon key, no writes except hub application)
- Hub application form writes to `hubs` table with `verified=false`, `approved_by=null`
  → founder approves from the admin panel in the mobile app
