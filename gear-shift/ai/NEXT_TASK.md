# Next Task

## A. Owner (today, about 15 min): stop losing booking requests
Deploy `stopgap/index.html` to Netlify. Steps are in `stopgap/README.md`. Then turn on email notifications for the `booking` form in Netlify.

## B. Owner: answer Q1–Q7 (spec §12) and create the `gear-shift` repo

## C. Engineering: Phase 1 vertical slice (after B)
Smallest build that passes the Phase 1 gate. In order, each step tested before the next:

1. **Scaffold:** Hono + TypeScript + Wrangler, Vitest, ESLint/Prettier, `.env.example`, `.gitignore`, CI (lint, typecheck, test).
2. **Schema:** D1 migration `0001_init.sql` (spec §5, Phase 1 tables) plus seed (packages, campaigns, availability). Tests for the overlap INSERT.
3. **Public:** `/q/:code` (scan log + redirect) · `/book` (mobile 4-step flow) · `GET /api/packages` · `GET /api/availability` · `POST /api/bookings` (zod, customer upsert, atomic hold).
4. **Square (sandbox):** `src/payments/square.ts` (CreatePaymentLink, RetrieveOrder) · `POST /api/webhooks/square` (HMAC, dedupe, confirm) · `/book/confirmed` with status poll and reconcile · cron expiring holds. No-Square fallback → `requested`.
5. **Email:** owner alert and customer confirmation via Resend. Skipped cleanly if the key is unset.
6. **Admin (minimal):** Access JWT middleware · `/admin` upcoming bookings (status, campaign, deposit paid) · booking detail with confirm/complete/cancel/no-show · customers list · availability and blocked dates · campaign table (scans → bookings → deposits).
7. **Verify:**
   - Sandbox end to end on a phone-sized viewport (Playwright).
   - Duplicate webhook replay test.
   - Abandoned checkout releases the slot.
   - Then production keys, a real $1 test, and a refund made by hand in the Square dashboard.

**Out of scope for Phase 1:** reminders/SMS, reviews, referrals, analytics charts, AI, outbound, partner program.
