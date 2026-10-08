# Project Context (for any AI advisor)

**Gear Shift Detailing** is a one-person mobile auto-detailing business in Egg Harbor City / Atlantic County, NJ. The owner is an ACCC college student. Phone: (609) 573-1032. The live site is https://zcdetailing.store, still branded "ZC Detailing".

**Goal:** profitable local detailing with repeat customers. Build a business OS in gated phases, revenue first:
1. Flyer/QR → booking → Square deposit → stored → visible to owner
2. Retention automation
3. Command Center dashboard
4. Controlled outbound sales and partner program
5. AI business intelligence
6. Bounded autonomy

**Packages (brief):** Starter $100 · Advanced $200 · Premium $350+ (quote). The live site shows $90 / $200 / quote; unresolved.

**Audiences → campaign codes:** `worker` (warehouse, logistics, industrial; primary) · `accc_student` · `accc_staff` · `auto_shop` (referral partners) · `website` · `direct`.

**Stack (decided):** Cloudflare Workers + Hono + D1 + Cron + Access · Square Checkout API (Payment Links) + webhooks · Resend email. Software cost: $0/mo.

**Rules:**
- Owner decides. AI recommends and challenges weak ideas.
- No paid service without a clear reason.
- No secrets in code.
- Revenue is not profit.
- No marketing without consent.
- AI never gets financial authority.

**Read next:** `docs/CLAUDE_HANDOFF.md` → `ai/CURRENT_STATE.md` → `ai/NEXT_TASK.md`.
Full spec: `docs/GEAR_SHIFT_MASTER_SPEC.md`. Decisions: `docs/DECISIONS.md`.

**Folders:**
- `ai/context/` holds reference notes (pricing research, competitor notes).
- `ai/tasks/` holds task briefs.
- `ai/decisions/` holds long-form decision write-ups when DECISIONS.md is too short.
- `ai/reports/` holds phase reports and daily briefs later.
- `ai/prompts/` holds reusable prompts.
