# Copilot Task A — Website: Download Section

## Context
KindRide website is Next.js with `output: "export"` (static), Tailwind CSS, Framer Motion.
Dark background: `#0c1f3f`. Primary teal: `#0d9488`. File lives in `website/components/`.
No new packages. No NativeWind. TypeScript strict. Must be `"use client"` (uses framer-motion).

---

## Task

### 1. Create `website/components/DownloadSection.tsx`

This is the `#download` anchor section — what "Download the App" buttons throughout the site link to.

**Layout (desktop: two columns, mobile: single column stacked)**

Left column:
- Eyebrow: "Available Now" (teal, uppercase, tracked)
- H2: "Move together.\nDownload KindRide." (white, font-black)
- Body: "Free for passengers. Free for drivers. A community that moves." (white/60)
- Two download badge buttons side by side:
  - Apple App Store badge
  - Google Play badge
- Under badges: small text "Available on iOS and Android · Free" (white/30)

Right column (md+):
- A phone mockup card — a dark rounded rectangle (`#060f1e`, rounded-[2.5rem], border border-white/10)
- Inside: KindRide app UI sketch using just CSS/Tailwind — three rows of content:
  1. Row: "Kind**Ride**" wordmark (teal accent) + "LIVE" pill
  2. Row: a placeholder map-style gradient div (teal → blue, rounded-2xl, h-40)
  3. Row: "Marcus T. is on his way" white text + teal dot indicator
- This is all decorative CSS — no real screenshot needed

**Download badge buttons:**
Use inline SVG paths for App Store and Google Play logos (both white icon on dark pill background).
Since actual Store links aren't live yet, use `href="#"`.

App Store button:
```
Dark pill (bg-white/10 border border-white/20, rounded-2xl, px-6 py-3)
  Left: Apple logo SVG (white, 20px)
  Right: two lines — "Download on the" (xs, white/60) + "App Store" (sm font-bold white)
```

Google Play button: same pill style
```
  Left: Play triangle SVG (white, 20px)
  Right: "Get it on" (xs, white/60) + "Google Play" (sm font-bold white)
```

Wrap both buttons in `<div className="flex flex-wrap gap-4">`.

**Animations:** Framer Motion `whileInView`, `initial={{ opacity: 0, y: 24 }}`, stagger left col then right col.

---

### 2. Wire into `website/app/page.tsx`

Add `id="download"` section just before the `<footer>`:

```tsx
import DownloadSection from "@/components/DownloadSection";
// ...
<section id="download" className="bg-[#0c1f3f] px-8 py-24">
  <DownloadSection />
</section>
```

The footer `<a href="mailto:admin@kindride.app">` line stays — don't modify the footer.

---

## Do NOT
- Add new npm packages
- Change any file other than `website/components/DownloadSection.tsx` and `website/app/page.tsx`
- Use real store URLs (placeholder `href="#"` is fine)
- Add comments to existing code
