# Wholesale OS

An owner-controlled real estate wholesaling workspace built alongside the original AI Memory Vault repository. The original vault instructions and templates are unchanged. This application uses Next.js, React, TypeScript and a real PostgreSQL database; it does not store its canonical business records in browser storage.

This is an initial operational implementation, not a claim that the entire master specification or production readiness has been completed. See [implementation status](docs/STATUS.md) for the delivered scope and limits.

## Development

Use Node.js 22 or later. Run these commands from `wholesale-os/` in the existing checkout; each cloud task is already isolated and does not need another Git worktree.

```sh
npm ci
bash scripts/dev-up.sh
```

The startup helper prepares local configuration, starts/reuses PostgreSQL, migrates, seeds fictional DEMO records, creates the demo-only account, and starts the application and worker. Logs and process IDs are in the ignored `.local/` directory. It does not configure a production deployment.

For separate foreground terminals instead:

```sh
npm run db:start
```

Keep the database terminal running. In a second terminal, from the same directory:

```sh
npm run db:migrate
npm run db:seed
npm run owner:create -- --demo
npm run dev
```

The database helper is for isolated development only. It starts a local PostgreSQL instance and prepares local environment configuration. Keep generated local configuration private. For an existing PostgreSQL installation, create a dedicated database and set `DATABASE_URL` in an untracked `.env.local` instead. See [.env.example](.env.example) and the [runbook](docs/RUNBOOK.md).

Keep the application and database running. In a third terminal, start the worker:

```sh
npm run worker
```

Use **Explore the demo** on the sign-in page of an isolated development instance when enabled. The local helper generates a random demo password; no password needs to be copied into chat. For LIVE access, configure `OWNER_EMAIL` and a strong `OWNER_PASSWORD` securely in the runtime environment and run `npm run owner:create`. Never put credentials in Git, documentation, chat or shell history. LIVE access does not configure external providers or grant permission to send communications.

## Validation

```sh
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
npm run test:e2e
```

Database integration and browser tests require the migrated local database; browser tests also need the application running. Consult [testing](docs/TESTING.md) for exact current coverage and how to interpret results. A command listed here is not evidence that it passed in a particular environment.

## Operating boundaries

- DEMO records are fictional and isolated from LIVE records through mode-scoped queries and foreign keys.
- Calculations are deterministic server code. ARV, repairs, probability and risk outputs remain estimates and expose their assumptions.
- Offers, contract milestones, buyer commitments and closings have server-side prerequisites and owner approval gates.
- Recording a signed agreement or a funded closing records evidence supplied by a human; the application neither signs agreements nor moves money.
- Missing external services are shown as `NOT CONFIGURED`. A demo simulation is never evidence of an actual message, public-record search or executed contract.
- Legal templates require jurisdiction-specific attorney approval before external use.

See [architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), [security](docs/SECURITY.md), [compliance](docs/COMPLIANCE.md), [agents](docs/AGENTS.md), [integrations](docs/INTEGRATIONS.md) and [deployment](docs/DEPLOYMENT.md).
