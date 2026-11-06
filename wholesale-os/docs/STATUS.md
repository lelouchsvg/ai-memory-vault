# Implementation status

This is an initial functional implementation of the master specification. The internal operating workflow is implemented and tested; the full specification and production launch are not complete. Feature availability and verified outcomes are separate. See [testing](TESTING.md) for evidence and the matrix below for remaining scope.

| Phase                          | Initial implementation scope                                                                                                  | Remaining work / limitation                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Foundation and CRM         | PostgreSQL, local authentication, navigation and mode-scoped property/seller/buyer/task commands.                             | Full field-by-field CRM editing, enterprise account lifecycle and multi-tenant isolation require more work.                     |
| 2 — Economics                  | Deterministic comps/ARV, repair ranges, MAO/scenarios, pipeline gates and ledger P&L.                                         | Valuation is an estimate, not appraisal; no licensed live comp feed or calibrated predictive model.                             |
| 3 — Relationships and closing  | Deterministic buyer matching, follow-up work, human-recorded contract/closing evidence and finance reconciliation.            | External relationship outreach, e-signatures, funds movement and certified title verification are unavailable.                  |
| 4 — Operations                 | Durable job architecture, bounded agents, persisted runs/status, approval and audit records.                                  | Agent labels do not imply autonomous web research or live LLM processing; permissions are application-level.                    |
| 5 — Integrations and documents | Provider boundaries, explicit unavailable states, document metadata and authenticated database-backed file uploads/downloads. | Vendor adapters, managed object storage, malware scanning and external calendar/delivery are NOT IMPLEMENTED or NOT CONFIGURED. |
| 6 — Safety and QA              | Server-side authorization, contact suppression, legal gates, immutable ordinary audit operations and automated checks.        | No production security certification; MFA/SSO/RLS tenancy and jurisdiction-specific legal maintenance remain.                   |
| 7 — Improvement                | Deterministic reports, quality checks and terminal-outcome postmortems.                                                       | Advanced analytics, configurable all-agent subworkflows and automatic live research optimization remain.                        |

## Explicitly unavailable

- Live property/public-record/contact research without an implemented, configured authorized provider.
- Live email/SMS delivery, maps, calendar synchronization or AI-vendor execution without their adapters.
- Attorney-approved legal contract language or an executable signing workflow.
- Money movement, binding commitments, owner impersonation or automatic legal advice.
- Public production deployment, environment publication or fresh-task snapshot restoration validation unless separately reported.
- Full coverage of every field, visual treatment, analytics breakdown and automation example from the master specification.

## Agentic OS addition

The built-in `/os` command workspace adds the screenshot-inspired dark HUD, PostgreSQL-backed sessions/transcripts/reference memory, durable run records and execution events, a local deterministic skill router and an optional structured OpenAI planner. Nine bounded business skills use existing services; the approval inbox remains authoritative. The local router does not require a model key. Codex/Claude desktop bridges, arbitrary host-shell execution, a local Whisper engine and unrestricted autonomous research are NOT IMPLEMENTED.

The new layer passed 11 PostgreSQL acceptance tests, five mocked optional-AI planner tests and three browser tests alongside the existing CRM suites. No live model request was tested because a model credential was not configured. See [Agentic OS](AGENTIC-OS.md) for its configuration, data-sharing boundary and limits.

## Acceptance limits

The supported core flow was exercised with fictional demo records and isolated PostgreSQL fixtures from new lead through underwriting, approvals, contract evidence, buyer matching/selection, closing, revenue/expenses, P&L, postmortem and audit. The latest validation passed all 58 Vitest tests, all six Playwright browser/API tests against development (25 seconds) and production (18.9 seconds), strict type checks, lint, formatting and the Agentic OS production build. The final owner-time-zone formatting adjustment also passed a production rebuild. The tested 390-pixel mobile view had a 390-pixel document width, and a 1,440-pixel desktop view reported no browser errors.

Dependency installation was repeated successfully. Foreground supervised startup with `npm run os:start` was verified across separate tool calls; the optimized application was also tested under `npm run os:start:production`. The cloud runner terminates detached children after their parent exits, so the earlier one-shot helper must not be used as evidence of persistent availability. Keep the foreground supervisor or individual foreground services running.

The seed contains 46 properties, 18 sellers and 34 buyers; repeated seeding preserved existing records. Extra DEMO fixtures created by browser tests may increase current counts. LIVE business tables were empty in the prepared instance.

All 16 primary agents have bounded deterministic executors. Their named sub-agents remain descriptive groups rather than independent workers or controls. BLOCKED results remain visible and do not count as completed runs. Structured authenticated-operation errors persist and are visible in Activity. Upload bytes and metadata are saved atomically.

Reusable cloud `install_script` and `start_skill` instructions were saved to the environment configuration draft. Draft persistence does not apply or publish a new version. The owner must review and save the changes in environment settings, then publish the environment. Fresh-task snapshot restoration has not been independently validated.

Recording an external fact in the app tests persistence and gates; it does not verify that the external event happened. No static card, empty modal or unconfigured adapter is counted as completed live functionality. None of these results establishes live provider delivery, legally executed contracts, actual title clearance or movement of funds.
