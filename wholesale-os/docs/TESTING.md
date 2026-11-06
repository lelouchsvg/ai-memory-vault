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

The implementation was validated with 42 passing Vitest tests: 31 domain tests, two bounded-request tests and nine PostgreSQL acceptance tests. Type checking, ESLint, formatting and the production build passed. All three Playwright browser/API tests passed against both the development server and the optimized production server started with `npm start`. The production browser run completed in 7.9 seconds, including the full UI lifecycle in 6.5 seconds.

The PostgreSQL suite creates a unique temporary schema, applies migrations, exercises its fixtures and drops that schema afterward. It covers the full internal lifecycle from property/seller creation through sourced ownership, three comps, repair assumptions, ARV/MAO/Red Team, offer approval, signed evidence/contract, matching/buyer selection, title/closing, ledger revenue/expenses, P&L, FORGE and audit history. Negative checks cover stale evidence, protected fields, title and offer gates, roles, duplicates, idempotency, cross-mode links, paused agents, reminder deduplication and unavailable LIVE delivery.

The three browser tests cover unauthenticated access protections; an actual UI lead-to-close/P&L lifecycle; and document byte round trips, spoofed MIME rejection and mode boundaries. Browser tests intentionally persist fictional DEMO fixtures in the selected development database. They do not contact external sellers or buyers. Integration fixtures are temporary; browser fixtures are not automatically removed.

The repeatable seed was checked with 46 properties, 18 sellers and 34 buyers. Running the seed again preserved existing data. Additional DEMO browser-test records may increase these counts; LIVE business tables remained empty in the prepared instance.

`npm ci` was repeated successfully. The app, database and worker were stopped gracefully, then `bash scripts/dev-up.sh` restarted all three; health returned HTTP 200 and demo sign-in worked. Repeating the startup helper preserved the existing app and worker process IDs. At a 390-pixel mobile viewport, the document width remained 390 pixels with no horizontal overflow observed.

## Repeating database and browser checks

Run `bash scripts/dev-up.sh` first, then the validation commands above. `npm test` loads `.env.local` when present and requires a database account able to create/drop its temporary schema and apply the test migrations. Use a dedicated development database, never a production URL. The browser configuration expects a running app at `http://localhost:3000`, uses one worker and defaults to `/usr/bin/chromium`. Set `CHROMIUM_PATH` for another installed Chromium executable, and `E2E_BASE_URL` for another local application port.

These checks validate the supported internal workflow and safeguards. They do not verify live provider delivery, actual signed agreements, legal sufficiency, independent title clearance, funding movement or all advanced features in the master specification. See [status](STATUS.md) for remaining scope.
