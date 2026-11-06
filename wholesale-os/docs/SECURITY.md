# Security

## Implemented boundaries

Passwords are salted and hashed with Node scrypt; plaintext passwords are not stored. Sessions use random opaque tokens whose hashes are stored in PostgreSQL, with expiration and HttpOnly, SameSite=Strict cookies. Set `COOKIE_SECURE=true` behind HTTPS. Login attempts are rate limited using database records. Authentication is local application authentication, not Supabase Auth or a claim of enterprise identity support.

Server endpoints require an authenticated actor. Roles are OWNER, OPERATOR and VIEWER. Viewers cannot mutate records. Owner decisions are checked on the server. Demo-only accounts cannot read or mutate LIVE data. Mutation endpoints require JSON, validate origins and limit request sizes. PostgreSQL parameters carry user values; supported table and command names must remain server-controlled.

Response headers are configured in `next.config.ts`. Secrets belong in runtime environment settings or a production secret manager. Keep `.env.local` and runtime files untracked. Database audit history rejects ordinary updates/deletes, and material mutations are recorded transactionally with business changes.

Agentic OS sessions, transcripts, saved notes, runs and events are additionally scoped to the authenticated actor and DEMO/LIVE mode. Its command endpoint requires the same origin, role and mode checks and reads a bounded request body. Model planning is restricted to one validated skill proposal; execution remains in permission-checked server services. The web console exposes run events, not a shell or PTY. Optional AI planning shares request/property-label context with the configured provider; review [Agentic OS](AGENTIC-OS.md) before enabling it with real data. Browser speech behavior depends on browser capabilities and is not local Whisper processing.

## Deployment requirements

- Use verified TLS for managed PostgreSQL and HTTPS for the application.
- Set the exact trusted `APP_ORIGIN`; verify reverse-proxy host handling before exposing the service.
- Disable demo sign-in for a private LIVE deployment unless intentionally providing a separate isolated demo environment.
- Create a strong owner account using the setup script. Do not reuse demo credentials.
- Use a dedicated application database login with only necessary privileges; use a separate migration role where practical.
- Restrict database network access and rotate credentials through the deployment secret store.
- Restrict access to logs, backups and uploaded/linked documents containing personal data.

## Limitations

This single-business application does not implement multi-tenant row-level security, SSO, MFA, password reset, email verification, an invitation lifecycle or fine-grained per-field authorization. PostgreSQL mode constraints isolate DEMO/LIVE data; they are not tenant isolation. Agent permission definitions are enforced by bounded application operations, not separate database credentials. Audit immutability is an application/database trigger guarantee, not protection from a privileged database administrator.

Owner-only document uploads accept PDF, JPEG, PNG and plain text up to 10 MB, check declared type and expected signatures, store a checksum and serve authenticated attachment downloads with restrictive headers. This is not malware scanning or content disarm/reconstruction; a valid file signature does not prove harmless content. Binary content is stored in PostgreSQL rather than a managed object store. Do not attach sensitive live documents through publicly accessible URLs. Further penetration testing, dependency review, authorization review and operational security work are required before a public production launch.

Report security findings privately through the repository owner's chosen channel. Never include real credentials or seller/buyer data in a public issue.
