# Agent operations

Agent definitions are in `src/lib/domain.ts`. They declare mission, input/output descriptions, read/write scope, allowed tools, prohibited actions, approval requirements, retry policy, failure policy and escalation rules. These are bounded application workers, not independent unsupervised AI identities.

| Agent           | Responsibility                                                             |
| --------------- | -------------------------------------------------------------------------- |
| SCOUT           | Validate imported/manual leads and score them.                             |
| NINJA           | Organize sourced ownership evidence; block unsupported verification.       |
| ATLAS / COMPS   | Review market signals and calculate ARV from sourced eligible sales.       |
| REHAB / NUMBERS | Compute repair ranges and underwriting scenarios.                          |
| RED TEAM        | Flag deterministic risk and mitigations.                                   |
| CLOSER          | Prepare approval requests and follow-up tasks.                             |
| BRIDGE          | Compute buyer matches and prepare dispositions information.                |
| GUARD           | Check compliance/template evidence; escalate legal uncertainty.            |
| ESCROW          | Monitor closing evidence and deadlines.                                    |
| LEDGER          | Calculate recorded realized and projected finances.                        |
| OPS / INSPECTOR | Find stale, incomplete or inconsistent records and create correction work. |
| FORGE           | Create terminal-outcome postmortems and policy recommendations.            |
| CONTROL TOWER   | Route durable work and monitor failures.                                   |

All 16 primary agents have bounded deterministic executors and persisted runs. Listed sub-agents are descriptive delegation groups; they are not independently schedulable agents and have no separate pause/resume/run controls. Agent Center controls act on primary-agent persisted status and runs. A paused agent is not proof that already completed external work can be reversed. Missing inputs/provider access yield a BLOCKED result with evidence, not fabricated success; BLOCKED does not count as completed work. Failure and retry output remain visible.

The worker uses durable jobs and bounded service dispatch. Application operations limit what an agent can change; separate PostgreSQL credentials per agent are not provisioned. Never give an LLM direct unrestricted database access. New tools require explicit scoped inputs, validated outputs and server-side authorization.

All agents are prohibited from signing contracts, moving money, impersonating the owner, changing attorney-approved language, bypassing approval gates or changing underwriting policy autonomously. General-purpose autonomous research, vendor-specific LLM adapters and dynamic multi-agent planning are not implemented.
