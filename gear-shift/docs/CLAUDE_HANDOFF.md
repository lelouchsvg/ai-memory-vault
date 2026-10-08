# Claude / AI Handoff — Gear Shift Detailing

Read this first. It's written so another AI or technical advisor can pick up without the chat history.
Deeper detail: `docs/GEAR_SHIFT_MASTER_SPEC.md` (requirements, schema, architecture) and `docs/DECISIONS.md` (why).

## 1. What this project is
A revenue-first operating system for a one-person mobile detailing business in Atlantic County, NJ. It has two parts:
- the public **website and booking funnel** (flyer → QR → book → Square deposit)
- the private **Command Center** (`/admin`)

It's built in gated phases. **Don't build a later phase before the current one passes its gate.**

## 2. Current state (2026-10-08)
- **Phase 0 (discovery and architecture): done.**
- **Phase 1: not started.** Waiting on owner answers Q1–Q7 (spec §12).
- No application code exists yet. This folder holds docs, a redacted snapshot of the live site, and a stopgap form fix.

## 3. What exists in the world
| Thing | State |
|---|---|
| https://zcdetailing.store | Live. One static HTML file (≈36 KB, inline CSS and JS) on **Netlify**. Branded "ZC Detailing". Sections: hero, services, fleet, about, booking form, footer. Fonts: Bebas Neue and Inter. |
| Site source | **Not in any GitHub repo this session can reach.** Snapshot: `reference/live-site-2026-10-07.html` (admin password redacted). |
| Database | None |
| Backend / APIs | None |
| Auth | Fake. A client-side password check in public JS. |
| Payments | None. No Square integration yet. |
| Hosting | Netlify (free plan, presumably). `www` redirects to the apex. No robots.txt, sitemap or manifest. |

## 4. Known bugs on the live site (severity order)
1. **CRITICAL: the booking form sends nothing.** `submitForm()` validates, shows "✓ Request sent! We'll confirm within 24 hours.", then does nothing (`// TODO: Hook up to email/Setmore`). Every customer request since launch has been lost, and those customers think they're booked. Fix ready: `stopgap/index.html` (Netlify Forms), see `stopgap/README.md`.
2. **HIGH: fake availability calendar.** The "admin" marks dates booked in `localStorage`, so the change only shows on the device that made it. Customers never see it.
3. **MEDIUM: admin password hard-coded in public JS.** It protects nothing (see 2), but if it's reused elsewhere, change it there.
4. **MEDIUM: brand and price mismatch.** Site: ZC Detailing, Basic $90 / Silver $200 / Premium quote. Brief: Gear Shift, $100 / $200 / $350.
5. LOW: footer says © 2025; no campaign tracking; no meta description or OG tags; no robots or sitemap.

## 5. Architecture decided (Phase 1)
- Cloudflare Workers + static assets, **Hono** (TypeScript), server-rendered HTML, small vanilla-TS booking script.
- **D1** (SQLite) is our system of record. Schema in spec §5.
- **Square Checkout API Payment Links** for deposits, plus `payment.updated` webhooks (HMAC-verified, idempotent).
- **Cloudflare Access** (owner email OTP) plus a server-side JWT check guards `/admin`.
- **Resend** (free) for owner alert and confirmation emails. No SMS in Phase 1.
- QR → `/q/<campaign>` redirect logs scans → `/book?campaign=<code>`.
- Software cost: **$0/month**. Square charges per transaction (in person 2.6% + 15¢, online 3.3% + 30¢).

## 6. Important decisions (summary; details in DECISIONS.md)
- Our DB is the record and Square is the payment rail (D-001, D-002).
- Not Square Appointments for scheduling in Phase 1: API writes need a paid plan (D-002).
- One app with `/admin`, not two apps (D-004).
- Double-booking prevented by an atomic conditional INSERT plus 30-min holds (D-008).
- Webhook dedupe via UNIQUE event, payment and order ids (D-009).
- Money in cents; local NY date and time plus UTC (D-007).

## 7. Constraints you must respect
- Software budget $0–35/mo. Justify every new dependency (why, free alternative, lock-in, value).
- Never commit secrets. `.dev.vars` and `.env` are gitignored; names are in `.env.example`.
- Never call revenue "profit". Label estimates.
- No marketing messages without recorded consent. Respect opt-outs.
- AI never gets refund, payment-setting or delete authority.
- Mobile first for customers; responsive admin.
- Run tests, lint, typecheck and build before claiming anything works.

## 8. Repo note
The files live in `gear-shift/` inside `lelouchsvg/ai-memory-vault` on branch `claude/gear-shift-phase0`. That repo is unrelated (a note-taking template); the session couldn't create a new repo. **Recommended:** the owner creates a private `gear-shift` repo and the folder contents move to its root.

## 9. Next recommended task
See `ai/NEXT_TASK.md`. In short:
1. The owner deploys the stopgap form fix today.
2. The owner answers Q1–Q7.
3. Build the Phase 1 vertical slice (scaffold, schema, `/q` and `/book`, Square sandbox deposit, webhook, minimal `/admin` bookings list), with tests.
