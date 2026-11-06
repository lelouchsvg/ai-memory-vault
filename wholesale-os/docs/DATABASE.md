# Database

PostgreSQL is required in development and deployment. The local helper runs real PostgreSQL; there is no SQLite fallback.

## Schema

`migrations/001_core.sql` creates sellers, buyers, properties, comps, repairs, documents, closings, deadlines, matches, tasks, approvals, transactions, notifications, settings, agent status/runs, audit log, durable jobs and idempotency records. `002_auth.sql` creates application users, sessions and rate-limit attempts. `003_files.sql` adds mode-linked document binary storage. `004_operation_errors.sql` persists structured failed-operation evidence for Activity. The migration runner records filename, SHA-256 checksum and application time in `schema_migrations`.

Business tables carry `mode` with a `DEMO`/`LIVE` check. Composite foreign keys pair entity ID with mode to reject cross-mode relationships. Properties have unique permanent Deal IDs generated from a sequence. A normalized address index rejects exact duplicate property addresses within a mode. Buyer-match, task, notification and ledger-reference indexes provide additional uniqueness and idempotency controls. These do not replace fuzzy duplicate detection or resolve real-world ownership ambiguity.

Entity attributes are JSONB. Relationship columns remain relational. Keep validation in the server command layer; adding arbitrary JSON is not an approved write interface. JSONB is a pragmatic first-release choice and does not enforce every field shape at the database level.

`audit_log` stores actor, actor type, action, entity, old/new snapshots, reason, source and timestamp. A trigger rejects normal UPDATE and DELETE operations. Database administrators still control the underlying database and its backups; immutable application history is not external tamper-proof archival.

## Migration workflow

```sh
npm run db:migrate
```

Migrations execute in filename order, each in a transaction. A changed checksum for an applied migration is rejected. Add a new migration instead of editing an applied one. Back up production before migrations. Test the migration against a restored copy first. If a migration fails, inspect the error and confirm its transaction rolled back before retrying. Never clear `schema_migrations` merely to bypass a checksum error.

## Backup and restore

Use a dedicated database and least-privileged application login. For managed PostgreSQL, enable provider backups and point-in-time recovery. For a controlled manual backup:

```sh
pg_dump --format=custom --file=wholesale-backup.dump "$DATABASE_URL"
```

Store backups encrypted outside the checkout and test restores to a separate empty database. Use `pg_restore --dbname="$RESTORE_DATABASE_URL" wholesale-backup.dump` only after verifying the destination is isolated; the restore variable must point to the test target. Compare migration history and representative property, approval, audit and ledger records after restore. Restrict access because backups include seller/buyer personal data and authentication records.

Do not restore production data into a publicly reachable demo deployment. See [runbook](RUNBOOK.md) for recovery checks.
