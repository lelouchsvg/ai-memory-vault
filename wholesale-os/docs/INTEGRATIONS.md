# Integrations

The application separates domain rules from external providers. Provider absence is a structured blocked result, shown as `NOT CONFIGURED`. DEMO operations use explicitly fictional data; no demo output may be interpreted as a live API response or delivery receipt.

| Capability                            | Default state  | Requirements for live use                                                                                                                   |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Property/listing data                 | NOT CONFIGURED | Licensed or authorized provider, scoped credentials, provenance, permitted use and rate limits.                                             |
| Public records / ownership            | NOT CONFIGURED | Authorized source, source date, confidence and evidence review.                                                                             |
| Contact-data / skip trace             | NOT CONFIGURED | Approved commercial provider, lawful use and consent/suppression policy.                                                                    |
| Email                                 | NOT CONFIGURED | Provider integration, sender identity, owner approval and verified delivery/error handling.                                                 |
| SMS                                   | NOT CONFIGURED | Provider integration, approved sender, consent, opt-out and jurisdiction rules.                                                             |
| Maps / geocoding                      | NOT CONFIGURED | Provider implementation and permitted credentials.                                                                                          |
| Calendar                              | NOT CONFIGURED | Scoped account connection and synchronization conflict policy.                                                                              |
| AI                                    | NOT CONFIGURED | Approved provider implementation and securely supplied key; structured validated outputs only.                                              |
| External object storage / e-signature | NOT CONFIGURED | Provider adapters, scoped credentials and reviewed signing integration. Authenticated database-backed file storage is available separately. |

Manual evidence entry and fictional demo data remain usable without paid providers. Provider interfaces are extension points, not a claim that every vendor adapter is implemented. Browser-side keys, fake success responses and silent fallback from LIVE to DEMO are prohibited.

Agentic OS has a separate optional OpenAI structured-planning adapter, configured with `OS_AI_PROVIDER`, `OS_AI_MODEL` and `OS_AI_API_KEY`. It proposes one of the existing bounded skills and does not enable general AI execution by business agents or configure any research/delivery integration above. With no key/model, the local skill router makes no AI-provider call. See [Agentic OS](AGENTIC-OS.md) for the data-sharing boundary and fixed provider destination.

Before enabling an external action, verify permissions, owner approval, record mode, current economics, communication suppression and legal-template requirements. Use idempotency keys around delivery. Save provider response IDs and structured errors; never mark a message delivered solely because it was queued or approved.

For cloud environments, inspect configured binding names and readiness before requesting credentials. Store secret values securely in environment settings, not in chat, source or sample files. Add only required destinations to the network policy and retain TLS/signature verification. Configuring credentials does not itself implement an adapter.
