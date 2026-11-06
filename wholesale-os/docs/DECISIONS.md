# Decisions

| Decision                                          | Reason and consequence                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build inside `wholesale-os/`                      | The selected repository contains an existing documentation project. Preserve its README, instructions, templates and license.                               |
| Next.js, React and strict TypeScript              | One application can serve the operator UI and authenticated server commands. Exact versions are locked in `package-lock.json`.                              |
| PostgreSQL in every mode                          | One canonical persistence model and relational constraints; the local helper is development-only real PostgreSQL.                                           |
| Relational identity/links plus JSONB payloads     | Enables rapid domain coverage without browser persistence. Payload shapes depend on service validation; generated ORM-level type safety is not claimed.     |
| Local scrypt authentication and database sessions | Avoids requiring a hosted auth account for local development. MFA, SSO and account lifecycle need future work.                                              |
| Durable PostgreSQL jobs                           | Reuses the canonical database and supports retries/idempotency without requiring a separate queue vendor. A separately supervised worker is still required. |
| Deterministic bounded agents                      | Gives reproducible calculations and clear blocked outcomes while providers are unconfigured. Agent names do not imply autonomous LLM capabilities.          |
| Explicit DEMO/LIVE scope                          | Fictional seed data can support real workflow testing without masquerading as live research. Mode is checked both in services and relational links.         |
| No live external provider enabled by default      | Missing credentials or legal approval must remain visible. No false delivery or fabricated records.                                                         |
| No executable sample legal contract               | Attorney-approved templates are a prerequisite; a metadata placeholder documents the integration boundary.                                                  |

The master specification authorizes implementation beyond environment onboarding. That authorizes new application files; it does not authorize publishing a deployment, sending live messages, signing agreements or moving funds.
