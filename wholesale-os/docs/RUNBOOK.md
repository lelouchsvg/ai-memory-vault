# Runbook

Work from `wholesale-os/` in the existing checkout. Cloud tasks are already isolated; do not create an additional Git worktree for ordinary startup.

## Start an existing development environment

The normal local entry point is `npm run os:start`. Keep it running in a long-lived terminal. It invokes `bash scripts/dev-up.sh --stay-alive`, checks local database readiness, starts the database when needed, migrates/seeds, prepares the demo-only account, and starts the web process and worker. It keeps logs and process IDs under `.local/` and monitors database/app/worker every five seconds. A stopped service causes a visible supervisor error rather than an automatic recovery loop. Review startup output and health response before using the application. For manual foreground control:

The foreground supervisor was verified reachable across separate tool calls. The cloud runner can terminate detached children when their parent exits, so invoking `bash scripts/dev-up.sh` without retaining the parent does not establish a persistent service. Use `npm run os:start` or the separate foreground terminals below.

For the optimized local build, run `npm run build` and then retain `npm run os:start:production` in a terminal. It uses the same foreground supervisor and local DEMO preparation but starts `npm start`. Stop an existing web process you started before changing modes; a healthy server is reused rather than silently replaced. This is a local production-build preview, not public production hosting.

1. Run `npm run db:start` in its own terminal to start the local development database, or use an existing dedicated PostgreSQL database configured in `.env.local`. The helper stays running; do not wait for it to exit before continuing in another terminal.
2. Run `npm run db:migrate` to apply only pending migrations.
3. For fictional demo records, run `npm run db:seed`, then `npm run owner:create -- --demo` to prepare the demo-only sign-in account from private local configuration.
4. Start `npm run dev` in one terminal and `npm run worker` in another.
5. Request `/api/health`; require an OK status and database connected response. Sign in and exercise a representative command. An open port alone is not readiness.

Do not assume processes survive a snapshot, publication or task restart. Installed files and database state can persist while the web and worker processes must be started again. Never overwrite an existing `.env.local` blindly.

The local helper manages only `127.0.0.1:54329`, binds to loopback and stores its data in the ignored `.local/postgres` directory. Stop it with Ctrl-C in its own terminal when finished. Do not start a second helper on the same port while one is already running. It preserves an existing `.env.local`; a custom managed-database URL intentionally causes `db:start` to refuse management.

After a terminated task, the database helper can recover a stale PID/socket lock only when its recorded data directory and port match the managed local instance and the prior process is demonstrably dead or a zombie. It preserves database files and archives the stale PID record. Never manually delete a live server's lock or remove the database directory to resolve startup errors.

## Failed operations

For a database connection error, inspect the configured variable's presence without printing its value, verify the intended server is running and check database authentication/TLS requirements. Do not disable certificate verification. For migration errors, inspect the failing migration and transaction outcome; add a corrective migration rather than editing checksum history.

For an unavailable provider, confirm the operation reports `NOT CONFIGURED`; do not substitute a fabricated LIVE result. For a blocked approval, inspect ownership, underwriting, Red Team, contact and compliance prerequisites. Approval of one action does not authorize a different message or economic change.

For failed jobs, inspect the persisted error, attempts and eligible retry time. Correct the underlying dependency before retrying. Preserve idempotency keys so restart/retry does not duplicate effects. Pause an affected agent or stop only the worker you control if the cause is unresolved.

Activity also exposes persisted structured operation errors. Use the action, actor, record reference, timestamp and error code to distinguish invalid inputs, blocked prerequisites and infrastructure failures. BLOCKED agent output is not a completed operation and should be resolved rather than hidden.

## Agentic OS workspace

Open the application path `/os` after signing in. Migration `005_agentic_os.sql` must be applied, and the background worker must be running to consume queued commands. When updating an existing checkout, rerun `npm run db:migrate` and restart the worker so it loads the new command runtime. A page that renders successfully does not establish that commands are being processed.

Start with `morning brief`, then select an existing property before a property-specific skill. Verify the persisted run status and execution events. A worker heartbeat older than 15 seconds reports OFFLINE; inspect `.local/worker.log` and restart only the worker you control. Commands poll every two seconds while ordinary business/deadline checks remain every 30 seconds. Research without a configured lawful provider remains blocked. Use the existing approval inbox for decisions; chat cannot approve an offer or sign a contract. Memory notes are user-scoped reference data and do not authorize tools.

Use Cancel to stop queued work or request cancellation of a running command. If a tool already committed, its result is retained with an explanatory event; cancellation is not a rollback. A full queue (20 outstanding runs per actor/mode) requires waiting or canceling queued work. Resolve an explicit BLOCKED/FAILED result before submitting another command rather than repeatedly issuing duplicates.

The local router needs no AI settings. If intentionally enabling the optional planner, supply `OS_AI_PROVIDER=openai`, an available structured-output model in `OS_AI_MODEL` and a securely stored `OS_AI_API_KEY`. Retain verified TLS and the configured proxy route to `api.openai.com`. Restart the relevant runtime after changing environment configuration. A configured indicator is not evidence of a successful model call; inspect the first actual result. See [Agentic OS](AGENTIC-OS.md) for context sent to the provider.

For a missed deadline or stale lead, inspect the deadline table, task state, worker health and notification output. Configure external notification providers before expecting delivery outside the app. In-app reminders require the scheduler/worker to run.

## Recovery drill

Restore an encrypted backup into a separate empty PostgreSQL database. Run the application against that database in an isolated environment and verify migration checksums, sign-in, representative property relationships, approvals, immutable audit history and ledger totals. Confirm worker jobs are either completed or safely retryable. Never run a restore rehearsal against production.

After recovery, verify the web process and worker separately. Snapshot existence, database connectivity and a successful build are different checks.
