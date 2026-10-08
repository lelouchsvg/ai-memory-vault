# Decisions

Format: ID · date · status (Accepted / Proposed / Superseded) · decision · reason · alternatives rejected.
"Proposed" means the owner hasn't confirmed yet.

---

### D-001 · 2026-10-08 · Accepted
**Square is the payment infrastructure, not the business system of record.**
Reason: reliable payments with no custom payment code. Our own DB holds customers, bookings and campaigns, so the data is ours and exportable.
Rejected: building payment processing ourselves; using Square dashboards as the only CRM.

### D-002 · 2026-10-08 · Accepted
**Phase 1 uses Square Checkout API Payment Links for deposits, not Square Appointments for scheduling.**
Reason: seller-level Bookings API writes need Appointments Plus or Premium (paid). Payment Links need no subscription, are Square-hosted (no card data touches us), and include Apple Pay, Google Pay and Cash App Pay.
Rejected:
- Sending QR traffic to the free Square booking site. Loses campaign attribution and our own booking record.
- Buyer-level Bookings API. Needs an OAuth plus token-refresh flow and Square service setup. Deferred to a Phase 2 evaluation.

### D-003 · 2026-10-08 · Proposed
**Cloudflare (Workers + static assets, D1, Cron, Access, DNS) as the single hosting vendor; retire Netlify once Phase 1 is live.**
Reason:
- $0, with one vendor for hosting, API, DB, cron and auth.
- Netlify's free plan is now credit-based: 300 credits/month, about 15 per production deploy, and the site **pauses** when credits run out.
- D1 doesn't pause on inactivity (Supabase free does).

Exit: Hono runs on Node and Bun, and D1 exports to SQL.
Rejected:
- Netlify Functions + Supabase. Two vendors, credit-pause risk, Supabase inactivity pause.
- Vercel + Neon. Two vendors; no free equivalent of Access.

Requires: domain nameservers moved to Cloudflare (free).

### D-004 · 2026-10-08 · Accepted
**One app, two surfaces: the public site and booking at `/`, the Command Center at `/admin`.**
Reason: a solo owner. One deploy, one DB, one Square integration, shared design tokens. A separate app doubles auth and ops for no gain.
Revisit if: staff accounts or a separate subdomain become necessary.

### D-005 · 2026-10-08 · Accepted
**Owner auth = Cloudflare Access (email one-time PIN) plus server-side JWT verification on every admin route.**
Reason: $0, no password storage, no hand-rolled login. A password hash on Workers free (10 ms CPU) is a poor fit for strong KDF settings.
Rejected: the live site's client-side password (it's in public JS and protects nothing).

### D-006 · 2026-10-08 · Accepted
**QR codes point at `/q/<campaign>` redirects that we control, never directly at `/book?...`.**
Reason: counts scans separately from bookings, and lets us retarget a printed flyer without reprinting.

### D-007 · 2026-10-08 · Accepted
**Store money as integer cents, appointment times as local America/New_York date and time plus UTC instants.**
Reason: no float rounding; DST-safe display and scheduling.

### D-008 · 2026-10-08 · Accepted
**Prevent double-booking with one atomic conditional INSERT (`WHERE NOT EXISTS overlapping active booking`) and short payment holds (30 min) expired by cron.**
Reason: D1 has no interactive transactions; a single statement is atomic.

### D-009 · 2026-10-08 · Accepted
**Webhook idempotency: `webhook_events.event_id` UNIQUE, `payments.square_payment_id` UNIQUE, `bookings.square_order_id` UNIQUE.** Reconcile from the status endpoint and cron in case a webhook is lost.
Reason: webhooks can arrive twice or not at all.

### D-010 · 2026-10-08 · Accepted
**No SMS in Phase 1.** Email (Resend free) for owner alerts and booking confirmations only. Square sends payment receipts.
Reason: US A2P 10DLC registration has fees and approval time, and TCPA consent rules apply. Revisit in Phase 2 with a real cost line.

### D-011 · 2026-10-08 · Proposed
**Deposit: $25 on Starter and Advanced, credited to the total. Premium is a quote request (lead), with no payment at request time.**
Reason: a deposit filters no-shows (mobile jobs cost drive time) without the friction of full prepayment for first-time flyer customers. The balance is collected in person at the cheaper rate.
Owner must confirm the amount and the refund window.

### D-012 · 2026-10-08 · Accepted
**Stopgap before Phase 1: repair the live site's form with Netlify Forms (no backend, $0).**
Reason: the live form shows "Request sent!" but transmits nothing, so every request since launch has been lost. Fixing that doesn't need to wait for the new stack.

### D-013 · 2026-10-08 · Accepted
**The Gear Shift project lives in its own folder (`gear-shift/`), which becomes its own repository.**
Reason: the session's repo (`ai-memory-vault`) is an unrelated, non-commercially licensed template. The session couldn't create a new repo (GitHub 403), so the folder is self-contained and ready to move.

### D-014 · 2026-10-08 · Accepted
**Not in scope:** MiroFish (installed in the session on owner request). It's AGPL-3.0 and burns LLM tokens; it's a simulation engine, not a booking or CRM tool. Never vendor it into this codebase. Phase 5 may revisit it as a separate tool.
