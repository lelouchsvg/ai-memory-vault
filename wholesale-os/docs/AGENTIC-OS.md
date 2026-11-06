# Agentic OS

Agentic OS is the built-in command workspace at `/os`, alongside the existing wholesaling application. Its dark HUD layout is inspired by the supplied visual reference. It is an application interface backed by PostgreSQL and the existing business services, not a replacement operating system, desktop-control bridge or embedded external agent platform.

The existing deal workspace and approval inbox remain authoritative. Chat does not approve actions, sign agreements, move funds or bypass underwriting and compliance gates.

## Workspace controls

The ASTRA interface combines an animated galaxy canvas, financial vitals from the canonical business API, a mission property selector and the nine runnable skills below. Choose an existing session or create a new one; transcripts and run events persist in PostgreSQL. The console shows structured outputs and actual execution events, including blocked and failed outcomes. Run controls expose cancellation rather than pretending to terminate a host process.

Memory supports note creation, editing, deletion and a full note grid. Note-file import/export, download and vault search are not implemented. Links open the existing approval inbox and business workspace, including selected records, rather than duplicating their authority in chat. DEMO/LIVE state remains visible and demo-only accounts cannot switch into LIVE data.

Use Cmd/Ctrl+K to focus the command input, Enter to submit and Shift+Enter for a new line. Dialogs trap focus and Escape dismisses them. The canvas respects reduced-motion preferences. Optional browser speech synthesis can read responses aloud; it is off unless enabled by the user. These controls do not establish a full accessibility certification.

## Planning and execution

The default **Local skill router** recognizes explicit commands and selects a bounded deterministic skill. It needs no model key and makes no AI-provider request. The optional OpenAI planner can translate a request into the same restricted skill schema; it cannot create new tools or authorize an action. Server-side services perform the selected operation and enforce the signed-in user's permissions.

| Skill             | Behavior                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| Morning brief     | Summarizes the canonical pipeline, finances, pending approvals and deadlines.     |
| Plan today        | Checks data quality/deadlines and prepares internal reminders and priorities.     |
| Red Team review   | Runs deterministic risk checks for a selected property.                           |
| Underwrite deal   | Calculates sourced ARV, repairs, MAO and scenarios from current business policy.  |
| Match buyers      | Ranks eligible buyers with deterministic matching.                                |
| Prepare offer     | Creates a proposal for the owner's approval inbox; sends nothing externally.      |
| Pipeline report   | Reports deal stages and estimated probability-weighted assignment revenue.        |
| Recall memory     | Retrieves the user's saved reference notes.                                       |
| Research property | Reports lawful property-provider readiness; unavailable research remains blocked. |

Examples for the local router include `morning brief`, `plan today`, `pipeline report`, `underwrite NJ-ATL-000100`, `match buyers for NJ-ATL-000100`, and `prepare an offer for NJ-ATL-000100`. Replace the example Deal ID with an existing property or select a property in the interface. Commands outside supported skills return an explicit unavailable/blocked result rather than pretending to act.

## Persistence and scope

`migrations/005_agentic_os.sql` adds sessions, messages, runs, memory notes, execution events and worker heartbeat records. Sessions/messages/memory/runs/events are scoped to authenticated actor and DEMO/LIVE mode. Database relationships bind sessions and runs to the same actor/mode and properties to the same mode. They do not create a separate source of truth for property economics or ledger records.

Run states distinguish `QUEUED`, `RUNNING`, `COMPLETED`, `BLOCKED`, `FAILED` and `CANCELLED`. Queued work is persisted rather than relying on a browser tab to stay open. Run records carry attempt, lease, cancellation and idempotency fields. The event console shows application execution records; it is not a host terminal. Saved memory is reference data, never permission to execute or a substitute for approved business policy.

The worker polls commands every two seconds and checks the existing business queue/deadlines every 30 seconds. A recent worker heartbeat (within 15 seconds) reports `CONNECTED`; a stale or missing heartbeat reports `OFFLINE`. Timing is a polling target, not a completion guarantee. Leases older than five minutes can be recovered, with at most three attempts. Transient database/connection failures retry after ten seconds using the same run/tool idempotency key.

Canceling a queued run prevents its tool from starting. Canceling a running run requests cancellation; checks happen before tool execution. If a tool has already committed, its result remains recorded and the log explicitly explains the late cancellation. Cancellation does not roll back committed business changes.

There can be at most 20 outstanding runs per actor/mode. Commands are limited to 8,000 characters. A memory note has a title up to 160 characters, content up to 20,000 characters and up to 20 tags of 40 characters each. The current state view returns bounded recent history: 100 sessions, 100 runs, 1,000 messages, 200 notes and 300 events. This interface is not an unlimited-history export tool.

The original AI Memory Vault Markdown notes are unchanged. The command workspace's PostgreSQL memory does not silently import or synchronize the Obsidian vault.

## Optional AI planner

The planner is disabled unless all three variables are configured securely:

```text
OS_AI_PROVIDER=openai
OS_AI_MODEL=<a model available to the account with structured output support>
OS_AI_API_KEY=<set securely, never commit>
```

The implemented adapter uses the fixed HTTPS destination `api.openai.com` and the Responses API. In a cloud environment, retain the supported proxy and TLS trust configuration and allow this specific destination if required. Store credentials in secure environment settings; do not put the value in this document, chat or tracked files.

When enabled, the request text, workspace mode, selected property identifier and at most five relevant property identifiers/addresses may be sent to that provider as planning context. Property context is limited to the selected property or Deal IDs explicitly present in the user's message; unrelated addresses are excluded. Review this data-sharing boundary before using real personal or business data. Requests use `store: false`; that flag is not a guarantee about every provider retention or account policy.

Planner output is strictly validated against one allowed skill identifier, optional property query, optional positive amount and optional reason. Invalid output, network failure or an unavailable model produces an explicit warning event and falls back to the same deterministic local command rules. Only a locally recognized skill can then execute; an unsupported command remains blocked. Provider failure never authorizes unrestricted execution or fabricates a model result. A configuration indicator establishes presence of settings, not proof that a live model request succeeded. No paid-model connectivity claim is made without an actual successful request.

## Voice and platform limits

Voice interaction depends on browser capabilities and permissions. Feature detection must report unsupported speech APIs honestly. This application does not ship a local Whisper engine, microphone daemon or operating-system voice assistant. Browser speech services may have their own network and privacy behavior.

Microphone permission is allowed only for the `/os` page's own origin; the other application pages retain a disabled microphone policy. Browser support and user consent are still required. Dictation fills the command field for review before submission rather than automatically executing a spoken command.

There is no real Codex or Claude desktop bridge. The web API does not expose a shell, PTY, arbitrary script execution, unrestricted filesystem tools or general desktop automation. Model instructions and saved notes cannot grant those capabilities. Use the existing approval inbox for owner decisions and the deal workspace for evidence entry.

## Setup and readiness

Run `npm run os:start` in a long-lived terminal in the existing checkout. The foreground supervisor starts/prepares the local database, web application and background worker and keeps its parent process alive. This cloud runner can terminate detached child processes after a one-shot parent exits. Restoring files or opening `/os` does not restore a live worker process. Check worker heartbeat and execution events before expecting queued commands to advance. See [runbook](RUNBOOK.md) and [testing](TESTING.md) for verified startup and validation evidence.

For the optimized local preview, build with `npm run build` and retain `npm run os:start:production`. Stop an existing development web process you started before changing modes, because the helper reuses a healthy server. Both startup commands retain the same local DEMO data and owner-approval boundaries.

Screenshots are local preview artifacts captured from the running application, not proof of public deployment. No hosted preview or externally reachable application is implied by a screenshot.

Prepared preview files are [desktop viewport](/workspace/previews/control-tower-agentic-os.png), [full desktop page](/workspace/previews/control-tower-agentic-os-full.png) and [mobile](/workspace/previews/control-tower-agentic-os-mobile.png). They show the rendered luminous galaxy interface and a persisted morning brief, rather than an image-only mockup. These paths are local to the prepared workspace and are not deployed URLs.
