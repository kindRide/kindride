# KindRide — Founder Todo List

Non-code tasks that only the founder can action.
Check off items as you complete them.

---

## Domain & Infrastructure

- [ ] **Buy `kindride.app`** — primary domain for web presence, deep links, and email
- [ ] **Set up Cloudflare** (free tier) — DNS, SSL, DDoS protection, email routing
- [ ] **Create founder email** `femi@kindride.app` via Cloudflare Email Routing (forwards to Gmail) — professional sender for users + App Store

## Backend / Hosting

- [ ] **Upgrade Render to Starter ($7/mo)** — eliminates cold-start spin-up; always-on API before first real users

## Legal & Business

- [ ] **Register KindRide LLC** (Delaware or your home state) — required to open Stripe account, sign contracts, and protect you personally
- [ ] **TNC licensing research** — check your state's Transportation Network Company rules; peer rideshare may have exemptions but confirm before launch
- [ ] **Insurance broker conversation** — look into non-commercial rideshare or contingent liability policy; some hub partners (universities) will require proof before signing

## Payments

- [ ] **Open Stripe account** under the LLC — needed for in-app payments and hub subscriptions
- [ ] **Wire Stripe webhook** → Supabase `hub_subscriptions` table — auto-activates/deactivates hub plans on payment events (dev task, but you need Stripe account first)

## App Stores

- [ ] **Apple Developer account** ($99/yr) — required to ship iOS on the App Store
- [ ] **Google Play Developer account** ($25 one-time) — required to ship Android

## Growth

- [ ] **Pilot hub outreach** — email 2–3 churches or university student orgs you know personally; real users surface real bugs and hubs give social proof for fundraising

---

## Suggested order

1. Buy `kindride.app` → Cloudflare → founder email
2. Render upgrade
3. LLC registration → Stripe account
4. Apple + Google developer accounts
5. TNC + insurance research (run in parallel with dev work)
6. Hub outreach (start now — doesn't need anything else to be done first)
