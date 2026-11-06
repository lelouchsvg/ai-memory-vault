# Runbook

Work from `wholesale-os/` in the existing checkout. Cloud tasks are already isolated; do not create an additional Git worktree for ordinary startup.

## Start an existing development environment

The normal local entry point is `bash scripts/dev-up.sh`. It checks local database readiness, starts the database when needed, migrates/seeds, prepares the demo-only account, and starts the web process and worker. It keeps logs and process IDs under `.local/`. Review startup output and health response before using the application. For manual foreground control:

During onboarding, a graceful stop and restart of database, app and worker passed health and functional demo sign-in checks. Repeating the helper preserved existing application and worker process IDs.

1. Run `npm run db:start` in its own terminal to start the local development database, or use an existing dedicated PostgreSQL database configured in `.env.local`. The helper stays running; do not wait for it to exit before continuing in another terminal.
2. Run `npm run db:migrate` to apply only pending migrations.
3. For fictional demo records, run `npm run db:seed`, then `npm run owner:create -- --demo` to prepare the demo-only sign-in account from private local configuration.
4. Start `npm run dev` in one terminal and `npm run worker` in another.
5. Request `/api/health`; require an OK status and database connected response. Sign in and exercise a representative command. An open port alone is not readiness.

Do not assume processes survive a snapshot, publication or task restart. Installed files and database state can persist while the web and worker processes must be started again. Never overwrite an existing `.env.local` blindly.

The local helper manages only `127.0.0.1:54329`, binds to loopback and stores its data in the ignored `.local/postgres` directory. Stop it with Ctrl-C in its own terminal when finished. Do not start a second helper on the same port while one is already running. It preserves an existing `.env.local`; a custom managed-database URL intentionally causes `db:start` to refuse management.

## Failed operations

For a database connection error, inspect the configured variable's presence without printing its value, verify the intended server is running and check database authentication/TLS requirements. Do not disable certificate verification. For migration errors, inspect the failing migration and transaction outcome; add a corrective migration rather than editing checksum history.

For an unavailable provider, confirm the operation reports `NOT CONFIGURED`; do not substitute a fabricated LIVE result. For a blocked approval, inspect ownership, underwriting, Red Team, contact and compliance prerequisites. Approval of one action does not authorize a different message or economic change.

For failed jobs, inspect the persisted error, attempts and eligible retry time. Correct the underlying dependency before retrying. Preserve idempotency keys so restart/retry does not duplicate effects. Pause an affected agent or stop only the worker you control if the cause is unresolved.

Activity also exposes persisted structured operation errors. Use the action, actor, record reference, timestamp and error code to distinguish invalid inputs, blocked prerequisites and infrastructure failures. BLOCKED agent output is not a completed operation and should be resolved rather than hidden.

For a missed deadline or stale lead, inspect the deadline table, task state, worker health and notification output. Configure external notification providers before expecting delivery outside the app. In-app reminders require the scheduler/worker to run.

## Recovery drill

Restore an encrypted backup into a separate empty PostgreSQL database. Run the application against that database in an isolated environment and verify migration checksums, sign-in, representative property relationships, approvals, immutable audit history and ledger totals. Confirm worker jobs are either completed or safely retryable. Never run a restore rehearsal against production.

After recovery, verify the web process and worker separately. Snapshot existence, database connectivity and a successful build are different checks.
