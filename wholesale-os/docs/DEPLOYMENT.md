# Deployment

The frontend/API uses Next.js and can be built for a supported Node.js host or Vercel. No deployment or publication is performed by these instructions.

## Required services

1. A dedicated supported PostgreSQL database with backups and verified TLS.
2. A Next.js runtime with the locked dependencies and Node.js 22 or later.
3. A persistent background worker or equivalent scheduled execution for durable jobs and reminders. A web request process alone does not guarantee background work.
4. Private runtime configuration, HTTPS and a correctly configured trusted application origin.

## Release procedure

Install with `npm ci`, then run type checks, tests, lint and `npm run build`. Test against a dedicated migrated database. Configure `DATABASE_URL`, `DATABASE_SSL=true` when required for verified managed-database TLS, `COOKIE_SECURE=true`, `APP_ORIGIN` and the intended demo-login policy. Do not use the local database helper for production.

Back up the database, run `npm run db:migrate` using a controlled migration role and create the initial owner with `npm run owner:create` using securely supplied account configuration. Start the web process with `npm start` and start `npm run worker` independently. On Vercel, host the worker on a separate service capable of persistent processes; do not assume it survives a serverless request.

Verify the health endpoint, sign-in, role restrictions, DEMO/LIVE isolation, property creation, underwriting, approval gates and a representative worker job. Check errors and audit records. Configure operational monitoring before accepting real data.

## Rollback

Keep the prior application release available. Prefer backward-compatible database migrations. If a release fails, stop affected workers and return the application to the previous compatible build. A code rollback does not reverse a schema migration. Restore database state only through a reviewed recovery procedure with a verified backup and explicit understanding of intervening data loss; never automatically drop live tables.

## Not supplied by this repository

Managed hosting credentials, a production database, public DNS, live provider credentials, attorney-approved templates, secure object storage and deployment authorization must come from the owner. No deployment configuration alone makes an external integration operational. See [integrations](INTEGRATIONS.md) and [status](STATUS.md).
