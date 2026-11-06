# Testing

Use the repository scripts from `wholesale-os/` with dependencies installed through `npm ci`.

| Command                | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`    | Strict TypeScript compilation checks.                                         |
| `npm test`             | Existing Vitest domain/service tests.                                         |
| `npm run lint`         | ESLint static checks.                                                         |
| `npm run format:check` | Prettier checks for application source, scripts, tests and docs.              |
| `npm run build`        | Production Next.js compilation.                                               |
| `npm run test:e2e`     | Existing Playwright browser tests against the configured running application. |

Unit tests should exercise independently meaningful expected values for ARV/repairs/MAO/P&L, probability weighting, matching, lead scoring and transition gates. Integration tests require an isolated migrated PostgreSQL database and should prove entity creation, transactional approvals, contract prerequisites, matching, closing, reconciliation and audit behavior. Browser tests should exercise user-visible actions and verify persisted results.

Never point destructive fixtures at a live business database. Keep fictional DEMO fixtures isolated from LIVE records. Prefer stable test-created identifiers and query only their own results. Distinguish passed, failed, skipped and unrun outcomes; a zero-test result is not validation.

The required full-spec acceptance sequence is: create property and seller → source ownership → add comps and repairs → calculate ARV/MAO → Red Team → offer approval → recorded contract → buyer match/selection → assignment and closing → revenue/expenses → P&L → postmortem → audit. A passing subset does not establish that every requirement in the master specification is complete.

## Verified in the onboarding environment

The latest implementation passed all 58 Vitest tests: the original 42 tests (31 domain, two bounded-request and nine PostgreSQL acceptance), five optional-AI planner tests and 11 Agentic OS PostgreSQL tests. Type checking, ESLint and formatting passed. All six Playwright browser/API tests passed against both the supervised development application (25 seconds) and the optimized production server (18.9 seconds): the original three CRM tests plus three Agentic OS tests. The Agentic OS production build passed, including a final successful rebuild after owner-time-zone display formatting was corrected.

The PostgreSQL suite creates a unique temporary schema, applies migrations, exercises its fixtures and drops that schema afterward. It covers the full internal lifecycle from property/seller creation through sourced ownership, three comps, repair assumptions, ARV/MAO/Red Team, offer approval, signed evidence/contract, matching/buyer selection, title/closing, ledger revenue/expenses, P&L, FORGE and audit history. Negative checks cover stale evidence, protected fields, title and offer gates, roles, duplicates, idempotency, cross-mode links, paused agents, reminder deduplication and unavailable LIVE delivery.

The original three browser tests cover unauthenticated access protections; an actual UI lead-to-close/P&L lifecycle; and document byte round trips, spoofed MIME rejection and mode boundaries. Three additional Agentic OS browser tests cover authentication/mode isolation, a persisted brief with actual execution events, and memory creation/recall/edit/deletion across reloads. Browser tests intentionally persist fictional DEMO fixtures in the selected development database. They do not contact external sellers or buyers. Integration fixtures are temporary; browser fixtures are not automatically removed.

The 11 Agentic OS database tests cover idempotent persisted commands/transcripts/events, canonical underwriting and matching, offer preparation without conversational approval, unavailable research/ambiguous commands, queued cancellation, private memory ownership and mode isolation, expired-lease recovery without duplicate committed offers, private prompt/memory exclusion from shared Activity, current-account permission rechecks, demo/viewer restrictions and the concurrent per-account queue bound. The five AI-planner tests use mocked transport to verify local behavior, settings secrecy, bounded output schemas, proxy routing and context minimization, and rejection of invalid output. No live paid-model call was made because no model credential was configured.

The repeatable seed was checked with 46 properties, 18 sellers and 34 buyers. Running the seed again preserved existing data. Additional DEMO browser-test records may increase these counts; LIVE business tables remained empty in the prepared instance.

`npm ci` was repeated successfully. Foreground supervised startup using `npm run os:start` was verified reachable across separate tool calls; `npm run os:start:production` supervised the optimized server for the six production browser tests. The one-shot detached startup was diagnosed as insufficient on this cloud runner, which terminates child processes after the parent exits. At a 390-pixel mobile viewport, the document width remained 390 pixels with no horizontal overflow; a 1,440-pixel desktop view also reported no browser errors. The galaxy canvas renders a static frame under reduced-motion preferences.

## Repeating database and browser checks

Keep `npm run os:start` running in one terminal, then run the validation commands in another. `npm test` loads `.env.local` when present and requires a database account able to create/drop its temporary schema and apply the test migrations. Use a dedicated development database, never a production URL. The browser configuration expects a running app at `http://localhost:3000`, uses one worker and defaults to `/usr/bin/chromium`. Set `CHROMIUM_PATH` for another installed Chromium executable, and `E2E_BASE_URL` for another local application port.

These checks validate the supported internal workflow and safeguards. They do not verify live provider delivery, actual signed agreements, legal sufficiency, independent title clearance, funding movement or all advanced features in the master specification. See [status](STATUS.md) for remaining scope.
