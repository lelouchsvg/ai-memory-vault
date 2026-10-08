# Gear Shift Detailing — Master Spec

> Source of truth for requirements, architecture and roadmap. Update this file whenever a phase, decision, schema or integration changes.
> Last updated: 2026-10-08 · Current phase: **Phase 0 complete → Phase 1 pending owner answers** (see §12).

---

## 1. Business

| | |
|---|---|
| Business | Gear Shift Detailing (live site is still branded **ZC Detailing**; see open question Q1) |
| Model | Mobile auto detailing; we go to the customer |
| Area | Egg Harbor City / Atlantic County, NJ |
| Owner | Solo operator, college student at ACCC |
| Phone | (609) 573-1032 |
| Live site | https://zcdetailing.store (single static HTML page on Netlify) |

### Packages (from the brief; **the live site shows different prices**, see Q2)

| Code | Name | Price | Includes | Booking mode |
|---|---|---|---|---|
| `starter` | Starter | $100 | Interior + exterior clean, free wax protection | Instant book + deposit |
| `advanced` | Advanced | $200 | Int + ext, carpet shampoo, steam cleaning, headlight restoration | Instant book + deposit |
| `premium` | Premium | $350+ | Premium detail, full inspection, extras as needed | Quote request (lead), then confirmed booking |

### Targets → campaign codes

| Priority | Audience | Campaign code |
|---|---|---|
| 1 | Warehouse, logistics, manufacturing, industrial, working adults | `worker` |
| 2 | ACCC students | `accc_student` |
| 2 | ACCC staff | `accc_staff` |
| 3 | Auto repair shops (referral partners) | `auto_shop` |
| — | Organic website traffic | `website` (default) |
| — | Phone, text or word of mouth, entered by the owner | `direct` |

Goal: profitable local detailing with repeat customers and recurring revenue. Revenue first; automation later.

---

## 2. Phases and gates

| Phase | Scope | Status |
|---|---|---|
| 0 | Discovery, architecture, docs | ✅ Done 2026-10-08 |
| 0.5 | **Stopgap:** make the live form actually deliver requests (Netlify Forms) | 🟡 File prepared (`stopgap/index.html`), not deployed |
| 1 | Flyer → QR → book → deposit (Square) → confirmation → stored → visible in admin | ⏳ Next |
| 2 | Retention: confirmations, reminders, thank-you, review request, rebooking, opt-outs | Later |
| 3 | Command Center dashboard (full) | Later |
| 4 | Controlled outbound sales and auto-shop partner program | Later |
| 5 | AI business intelligence | Later |
| 6 | Deeper autonomy (GREEN/YELLOW/RED permissions) | Later |

**Phase 1 pass conditions:** a customer can (1) scan the QR code, (2) open the booking page, (3) see packages, (4) select a package, (5) pick an available time, (6) enter their info, (7) pay a deposit through Square when Square is configured, and (8) receive a confirmation. Then (9) the booking appears in the Command Center, (10) the customer is in the DB, and (11) the campaign is stored.

**Phase 2 pass conditions:** reminders, post-service flow, review flow, rebooking flow, opt-outs and customer history all work.

Do not start a phase until the previous phase's gate passes.

---

## 3. Architecture (Phase 1 target)

```
 Flyer QR ──► https://<domain>/q/<campaign>   (logs scan, 302 → /book?campaign=<code>)
                         │
                ┌────────▼──────────────────────────────────────────┐
                │ Cloudflare Worker (Hono, TypeScript) + static assets │
                │                                                      │
                │  Public:  /  /book  /book/confirmed  /q/:code        │
                │  API:     GET  /api/packages                         │
                │           GET  /api/availability?package&date        │
                │           POST /api/bookings      (validate, hold slot, │
                │                                    create Square link) │
                │           GET  /api/bookings/status?t=<public token>  │
                │           POST /api/webhooks/square (HMAC-verified)  │
                │  Admin:   /admin/*  /api/admin/*  (Cloudflare Access + │
                │                                    server-side JWT check)│
                │  Cron:    expire unpaid holds; reconcile pending payments │
                └───────┬───────────────────────┬───────────────────────┘
                        │                       │
                 ┌──────▼──────┐        ┌───────▼────────┐      ┌──────────┐
                 │ Cloudflare  │        │ Square         │      │ Resend   │
                 │ D1 (SQLite) │        │ Checkout API   │      │ (email,  │
                 │ our data    │        │ Payment Links  │      │ free)    │
                 └─────────────┘        │ + webhooks     │      └──────────┘
                                        └────────────────┘
```

### Stack

| Concern | Choice | Why | Lock-in exit |
|---|---|---|---|
| Hosting, API, cron | Cloudflare Workers + static assets (free) | One vendor covers hosting, functions, cron, DB and auth. Free tier doesn't pause the site the way Netlify's credit plan can. | Hono runs on Node, Bun and Deno unchanged |
| Web framework | Hono + server-rendered HTML (hono/jsx); small vanilla-TS booking script | Tiny, no client framework, fast on phones | Standard Web APIs |
| Database | Cloudflare D1 (SQLite) | Free, no inactivity pausing, SQL | `wrangler d1 export` → SQL, loads into SQLite, libSQL or Postgres |
| Validation | zod | Validates every input at the API boundary | — |
| Payments | Square Checkout API (Payment Links), plain `fetch`, no SDK | Square-hosted page, so no card data touches us. Apple Pay, Google Pay and Cash App Pay included. | Payment provider sits behind one module |
| Owner auth | Cloudflare Access (email one-time PIN) **plus** server-side verification of the `Cf-Access-Jwt-Assertion` JWT on every admin route | $0, no password storage, no login code to get wrong | Swap for app auth later; the check is one middleware |
| Email | Resend free (3,000/mo, 100/day), Phase 1 owner alerts and booking confirmation only | Transactional only; no marketing | SMTP-compatible alternatives |
| SMS | **Not in Phase 1** | US A2P 10DLC registration costs money and paperwork; TCPA consent rules | Phase 2 decision |
| Tests | Vitest (+ Workers pool / local D1) | Fast, runs in CI | — |

### Why not use Square's calendar as the system of record (Phase 1)
- Writing seller-level bookings through the Bookings API needs **Appointments Plus or Premium** (paid). On the free plan these calls return 403.
- Buyer-level bookings are allowed on free, but they need an OAuth flow with token refresh plus Square-side service and staff setup. It's a real option for Phase 2 (Square's free reminders, and the booking shows in the Square app), not a Phase 1 dependency.
- So D1 holds bookings and availability. `bookings.square_booking_id` is reserved for later sync.

### Why a dedicated repo/app, and not extending the existing site
The existing site is one hand-written HTML file with no backend, no build step and no repo in reach. We keep its look (tokens in §9) and rebuild it as the public half of one app. The **Command Center is part of the same app** under `/admin`, behind Access. That gives one deploy, one DB and one Square integration. A separate app would double auth, hosting and deploy work for a solo owner, with no benefit at this size.

---

## 4. Booking flow (Phase 1)

1. **Scan.** `/q/worker` inserts a `campaign_events` row (`type=scan`) and returns a 302 to `/book?campaign=worker`. The QR codes point at `/q/<code>`, so the target can change later **without reprinting flyers**.
2. **Book page** (mobile first, one column, about 4 short steps, no account):
   - Package cards (price and what's included).
   - Vehicle type and size (sedan, SUV, truck, van). Size surcharge only if the owner turns it on (Q5).
   - Date, then available start times. These come from `availability_rules` minus `blocked_dates`, minus existing active bookings plus travel buffer, minus a minimum lead time.
   - Name, mobile, email (optional but encouraged), service address, notes. One optional checkbox, unchecked by default: "Text/email me occasional offers". This is marketing consent, kept separate from transactional messages.
3. **POST /api/bookings.** Validate (zod), normalize the phone (E.164), and upsert the customer by phone. Insert a vehicle. Insert the booking with status `pending_payment` and `hold_expires_at = now + 30 min`, using an **atomic `INSERT … SELECT … WHERE NOT EXISTS (overlapping active booking)`**, so two people can't take the same slot.
4. **Deposit.** If Square is configured, call `CreatePaymentLink` with:
   - an order whose `reference_id` is the booking id
   - one line item: "Deposit — Advanced Detail, Sat Oct 10 9:00 AM"
   - `idempotency_key` = booking id + attempt number
   - `redirect_url` = `/book/confirmed?t=<public token>`
   - the buyer's email and phone pre-filled

   Store `square_payment_link_id` and `square_order_id`, then redirect the customer to Square.
   If Square is **not** configured, the booking becomes `requested`. The owner confirms manually; this is the fallback path.
   **Premium:** this creates a `lead` (quote request), not a paid booking.
5. **Webhook** `payment.updated` with status `COMPLETED`:
   - Verify the HMAC.
   - Dedupe on `webhook_events.event_id` (UNIQUE).
   - Find the booking by `square_order_id`.
   - Insert a `payments` row (`square_payment_id` UNIQUE).
   - Set the booking to `confirmed`, then email the owner and the customer.

   Running the webhook twice changes nothing.
6. **Confirmation page.** It polls `/api/bookings/status` for a few seconds. If the webhook hasn't arrived yet, the status endpoint asks Square (RetrieveOrder) to reconcile. It shows the confirmed details and an "add to calendar" (.ics) link.
7. **Cron** (every 15 min): expire unpaid holds (`pending_payment` → `abandoned`, which frees the slot and keeps the record as a warm lead), and reconcile any `pending_payment` booking that has an order id.
8. **On site:** the owner collects the balance in person with Square POS (cheaper in-person rate) and marks the job `completed` in admin.

### Booking statuses
`requested` (no-payment mode) · `pending_payment` · `confirmed` · `completed` · `cancelled` · `no_show` · `abandoned`.
Active (blocks the slot) = `requested`, `pending_payment` (until the hold expires), `confirmed`.

---

## 5. Data model (Cloudflare D1 / SQLite)

Conventions:
- Money is integer **cents**.
- IDs are text ULIDs.
- Timestamps are ISO-8601 UTC.
- Appointment date and time are stored as **America/New_York local** (`appointment_date` `YYYY-MM-DD`, `start_time` `HH:MM`) plus `starts_at_utc`.
- Soft delete only where needed.

### Phase 1 tables (build now)

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL, last_name TEXT,
  phone TEXT NOT NULL UNIQUE,               -- E.164
  email TEXT,
  address_line TEXT, city TEXT, zip TEXT,   -- default service address
  preferred_contact TEXT CHECK (preferred_contact IN ('sms','call','email')) DEFAULT 'sms',
  marketing_consent INTEGER NOT NULL DEFAULT 0,  -- explicit opt-in only
  marketing_consent_at TEXT, marketing_consent_source TEXT,
  first_campaign TEXT,                      -- attribution: first touch
  lifecycle_stage TEXT NOT NULL DEFAULT 'lead',  -- see §7
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  year INTEGER, make TEXT, model TEXT, color TEXT,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('sedan','coupe','suv','truck','van','other')),
  notes TEXT, created_at TEXT NOT NULL
);

CREATE TABLE packages (
  id TEXT PRIMARY KEY,                      -- 'starter' | 'advanced' | 'premium'
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  deposit_cents INTEGER NOT NULL DEFAULT 0, -- 0 = no deposit
  duration_min INTEGER NOT NULL,            -- on-site time
  booking_mode TEXT NOT NULL CHECK (booking_mode IN ('instant','quote')),
  description TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE package_services (             -- "SERVICES" in the brief
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES packages(id),
  name TEXT NOT NULL, description TEXT, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE campaigns (
  code TEXT PRIMARY KEY,                    -- 'worker', 'accc_student', ...
  name TEXT NOT NULL,
  source TEXT,                              -- 'flyer','partner','web','direct'
  start_date TEXT, end_date TEXT,
  spend_cents INTEGER NOT NULL DEFAULT 0,   -- printing etc.
  discount_cents INTEGER NOT NULL DEFAULT 0,-- optional campaign offer
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE campaign_events (              -- scans/visits; no IPs stored
  id TEXT PRIMARY KEY,
  campaign_code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('scan','book_view','book_start')),
  visitor_id TEXT,                          -- random first-party cookie id
  created_at TEXT NOT NULL
);
CREATE INDEX idx_campaign_events ON campaign_events(campaign_code, type, created_at);

CREATE TABLE leads (                        -- Premium quotes, fleet inquiries, abandoned checkouts
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  name TEXT, phone TEXT, email TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('quote','fleet','abandoned','manual')),
  campaign TEXT, status TEXT NOT NULL DEFAULT 'new',  -- new|contacted|quoted|won|lost
  created_at TEXT NOT NULL, last_contacted_at TEXT, next_follow_up_at TEXT,
  notes TEXT
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,        -- unguessable; used on the confirmation page
  customer_id TEXT NOT NULL REFERENCES customers(id),
  vehicle_id TEXT REFERENCES vehicles(id),
  package_id TEXT NOT NULL REFERENCES packages(id),
  campaign TEXT NOT NULL DEFAULT 'website',
  appointment_date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  starts_at_utc TEXT NOT NULL, ends_at_utc TEXT NOT NULL,  -- end includes travel buffer
  service_address TEXT NOT NULL,
  status TEXT NOT NULL,
  hold_expires_at TEXT,
  total_cents INTEGER NOT NULL, deposit_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  square_payment_link_id TEXT, square_order_id TEXT UNIQUE,
  square_booking_id TEXT,                   -- reserved for Phase 2 Square calendar sync
  notes TEXT, internal_notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  completed_at TEXT, cancelled_at TEXT
);
CREATE INDEX idx_bookings_time ON bookings(starts_at_utc, status);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  booking_id TEXT REFERENCES bookings(id),
  square_payment_id TEXT UNIQUE,            -- NULL for cash
  kind TEXT NOT NULL CHECK (kind IN ('deposit','balance','tip','refund')),
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER,                        -- Square processing fee when known
  status TEXT NOT NULL,                     -- Square status: COMPLETED, FAILED, ...
  method TEXT,                              -- card, cash_app, apple_pay, cash
  created_at TEXT NOT NULL
);

CREATE TABLE availability_rules (           -- weekly working hours
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time TEXT NOT NULL, end_time TEXT NOT NULL            -- local HH:MM
);
CREATE TABLE blocked_dates (date TEXT PRIMARY KEY, reason TEXT);  -- exams, other jobs, weather

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- slot_interval_min, travel_buffer_min, min_lead_hours, max_days_ahead,
-- hold_minutes, timezone, business_name, deposit_policy_text

CREATE TABLE webhook_events (               -- idempotency for Square webhooks
  event_id TEXT PRIMARY KEY, type TEXT NOT NULL,
  received_at TEXT NOT NULL, processed_at TEXT, error TEXT
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL,  -- 'customer','owner:<email>','system','square'
  action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT,
  created_at TEXT NOT NULL
);
```

### Later tables (designed, **not** created in Phase 1)
- `follow_ups` (customer_id, booking_id, type, channel, scheduled_at, status, message, sent_at). Phase 2.
- `message_log` and `communication_prefs` (per-channel opt-out, frequency caps). Phase 2.
- `reviews` (customer_id, booking_id, requested_at, completed_at, rating, source). Phase 2.
- `referrals` (referrer_customer_id, referred_customer_id, partner_id, campaign, status, reward_cents). Phase 2 or 4.
- `partners` (business_name, contact_name, email, phone, address, status, referral_terms JSON, notes). Phase 4. **Commission is never hard-coded.**
- `prospects` and `outreach_messages` (status: DRAFT → READY_FOR_APPROVAL → APPROVED → SENT → REPLIED/INTERESTED/NOT_INTERESTED/FOLLOW_UP/CLOSED). Phase 4.
- `expenses` (category, amount_cents, date, description). Small; can come early in Phase 3 for profit estimates.

---

## 6. Square integration

Verified 2026-10-07 against Square docs and pricing pages:

| Fact | Detail |
|---|---|
| Free Appointments plan | Online booking site and appointment reminders. **No-show and cancellation fees are on Plus.** |
| Bookings API writes | Seller-level create, update and cancel need **Appointments Plus or Premium**; on free they return 403 "Merchant subscription does not support write operations". Buyer-level writes (app-created bookings only, no double-booking, within business hours) are available to all sellers. Reads work. |
| US processing, Free plan | In person 2.6% + 15¢ · online and invoices 3.3% + 30¢ · "Online API" 2.9% + 30¢ · keyed-in or card on file 3.5% + 15¢ |
| Checkout API | `POST /v2/online-checkout/payment-links`: a Square-hosted page that creates an Order. No subscription needed. Which online rate (3.3% vs 2.9%) applies to payment links is **unverified**; assume 3.3% + 30¢. |

Implementation rules:
- Use the Square **sandbox** until the gate tests pass. Switch with `SQUARE_ENVIRONMENT`.
- Pin the `Square-Version` header and call Square with plain `fetch`, all inside one module (`src/payments/square.ts`). Nothing else imports Square.
- Webhook signature: `base64(HMAC-SHA256(SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_WEBHOOK_URL + rawBody))`, compared in constant time against `x-square-hmacsha256-signature`. Reject on mismatch.
- Every Square write sends an `idempotency_key` derived from our booking id.
- Store the Square ids in our DB. **Our DB is the record**; Square is the payment rail.
- Fees: record `processing_fee` from the Payment object when it's available, so profit math uses real fees.
- Upgrade path: if the owner later pays for Appointments Plus, add a `SquareCalendarSync` module and fill `square_booking_id`. Nothing else changes.

### Deposit and fee math (assumptions, owner to confirm, Q4)
- $25 deposit (Starter, Advanced). Online fee ≈ 3.3% × $25 + $0.30 = **$1.13**.
- Balance collected in person: $75 on Starter → 2.6% + 15¢ = **$2.10**.
- Total processing on a $100 job ≈ **$3.23 (3.2%)**. This is an estimate, not accounting.

---

## 7. Customer lifecycle

`lead` → `booked` → `confirmed` → `completed` → `paid` → `review_requested` → `reviewed` → `rebook_due` → `rebooked` → `repeat` → `referrer` → `vip`

- Phase 1 sets `lead`, `booked`, `confirmed`, `completed` and `paid` automatically from booking and payment events.
- The later stages are computed in Phase 2. Rebook due = 45–90 days after the last completed job (configurable). VIP = configurable rule (e.g. 3+ jobs or $500+ lifetime).

---

## 8. Security rules

1. No secrets in code. All config comes from Wrangler secrets / env (`.dev.vars` locally, gitignored). `.env.example` documents the names.
2. `/admin/*` and `/api/admin/*`: Cloudflare Access policy (owner email only) **and** middleware that verifies the Access JWT (signature against the team JWKS, `aud`, expiry). Admin routes are never trusted on Access alone.
3. Public API returns **no** customer data except to the holder of a booking's `public_token`, and then only that booking's own non-sensitive fields.
4. Validate every input with zod: lengths, enums, phone, email, and date/time inside the bookable window.
5. Rate limiting: Cloudflare rate limiting rule on `POST /api/bookings` (free plan allows one rule), plus a honeypot field.
6. Square webhooks: HMAC verified, deduped, and processed idempotently.
7. Audit log for status changes, settings edits and any money-related action.
8. **The current live site has its admin password in public JavaScript.** It protects nothing; the snapshot in `reference/` has it redacted. If that password is used anywhere else, change it there.
9. No refunds, payment-setting changes or deletes from automation. Those stay owner-only (RED).

---

## 9. Design system (taken from the live site and kept)

```
--bg:#09090b  --surface:#111113  --surface2:#18181b  --line:#27272a
--blue:#3b82f6 (accent; hover #2563eb)  --white:#f4f4f5  --muted:#71717a
--red:#ef4444  (status: danger)   add: --green:#22c55e (paid/confirmed), --amber:#f59e0b (pending)
Display: Bebas Neue · Body: Inter · radius 3–6px · 1px borders · no gradients beyond the hero glow
```
- The `--gold #c8a96e` accent on the logo dot reads "luxury". The brief says avoid fake luxury, so Phase 1 drops it for electric blue.
- Mobile first: single column under 720px, tap targets ≥ 44px, sticky bottom "Continue" bar in the booking flow.
- Admin uses the same tokens with denser tables on desktop and a card list on phones. Status pills: confirmed = green, pending = amber, cancelled/no-show = red, completed = blue.

---

## 10. Environment variables

| Name | Purpose | Phase |
|---|---|---|
| `PUBLIC_BASE_URL` | e.g. `https://zcdetailing.store` | 1 |
| `ENVIRONMENT` | `development` / `production` | 1 |
| `SQUARE_ENVIRONMENT` | `sandbox` / `production` | 1 |
| `SQUARE_ACCESS_TOKEN` | secret | 1 |
| `SQUARE_LOCATION_ID` | Square location | 1 |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | secret | 1 |
| `SQUARE_WEBHOOK_URL` | exact URL registered in Square (used in HMAC) | 1 |
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` | 1 |
| `CF_ACCESS_AUD` | Access application AUD tag | 1 |
| `RESEND_API_KEY` | secret | 1 |
| `EMAIL_FROM` | e.g. `bookings@<domain>` (domain verified in Resend) | 1 |
| `OWNER_NOTIFY_EMAIL` | where new-booking alerts go | 1 |
| D1 binding `DB` | database | 1 |

---

## 11. Cost

| Item | Monthly |
|---|---|
| Cloudflare Workers, D1, Cron, Access, DNS, Email Routing (free tiers) | $0 |
| Resend free | $0 |
| Square account, Checkout API, POS app | $0 + per-transaction fees (§6) |
| **Software total** | **$0** (target was ≤ $35) |
| Domain | Annual. `.store` domains often renew at a much higher price than year one. **Check the renewal price before it hits.** |
| Optional later | Workers Paid $5/mo (only if free limits are hit) · Square Appointments Plus (only if no-show fees or Square calendar writes become worth it) · SMS (Phase 2, needs 10DLC registration) |

Free-tier limits to watch: Workers 100k requests/day, 10 ms CPU per request (keep handlers light, no heavy crypto), 5 cron triggers per account. D1 limits per Cloudflare's pricing page (about 5M row reads and 100k row writes per day; enforced since 2026-09-01). Resend allows 100 emails/day.

---

## 12. Open questions for the owner (block Phase 1 build or launch)

| # | Question | Why it matters |
|---|---|---|
| Q1 | Public brand: **Gear Shift Detailing** or **ZC Detailing**? Keep `zcdetailing.store`? | Flyers, site, emails and the Square business name must match or customers lose trust |
| Q2 | Prices: the site says Basic $90 / Silver $200 / Premium quote; the brief says $100 / $200 / $350. Which is real? | Can't take deposits on wrong prices |
| Q3 | Where does the site source live (Netlify drag-and-drop?), and who is the domain registrar? | Needed to deploy and to move DNS to Cloudflare |
| Q4 | Deposit amount and policy: $25, credited to the total, refundable with 24 h notice? | Shown at checkout; prevents disputes |
| Q5 | On-site duration per package, weekly working hours (around classes), service radius, vehicle-size surcharge (SUV/truck +$20–40?) | Drives availability and margin |
| Q6 | Do you have a Square account and a location set up? | Needed for sandbox, then live, credentials |
| Q7 | Water and power: do you bring your own (tank, generator, rinseless), or need the customer's? | Must be stated at booking, especially for workplace jobs |

---

## 13. Business risks flagged (not code)

- **Workplace detailing** (warehouse lots) is the strongest angle for the `worker` campaign ("we detail it while you work"), but you need the **property owner's or employer's permission**. Wash water must not go into storm drains (NJ stormwater rules); use rinseless methods or contain the water.
- **Insurance:** get general liability plus garagekeepers coverage before working on customers' cars at volume.
- **NJ trade name:** if the business operates as "Gear Shift Detailing" and that isn't the legal name, register the alternate name.
- **SMS and marketing:** text marketing needs prior express written consent (TCPA). Phase 1 only records consent; it sends no marketing.
- The free headlight restoration in Advanced and the free wax in Starter cost product and time on every job. Track whether they convert customers before keeping them as permanent inclusions.

---

## 14. Roadmap after Phase 1 (unchanged from the brief, summarized)
- **Phase 2:** follow-ups engine (cron + `follow_ups`): confirmation, 24 h reminder, thank-you, review request, rebook reminder, reactivation, referral ask. Frequency caps, opt-out links/STOP, consent checks. Evaluate Square buyer-level booking sync for free Square reminders.
- **Phase 3:** dashboard (today, customers, sales, campaigns, follow-ups, reviews), expenses, profit estimates (always labeled *estimated*).
- **Phase 4:** prospects plus owner-approved outreach (draft → approve → send), partner program with configurable terms, unsubscribe, low volume.
- **Phase 5:** AI assistant over our own DB (read-only SQL views), daily brief. Revenue ≠ profit everywhere.
- **Phase 6:** GREEN/YELLOW/RED action permissions. No financial authority for AI.
