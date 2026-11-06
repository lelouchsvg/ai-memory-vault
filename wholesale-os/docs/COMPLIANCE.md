# Compliance and human control

This software organizes evidence and approvals; it does not provide legal advice or determine whether a transaction is lawful. Rules differ by jurisdiction and change over time.

## Required control points

Ownership verification must be backed by source, retrieval date and confidence. An inferred name is not verified ownership. Seller/buyer do-not-contact and opt-out flags suppress contact workflows. Public-record and commercial data access must use authorized providers under their terms; no bypassing authentication, CAPTCHAs or access restrictions is supported.

External offers, counteroffers, material economic changes, marketing, transactional documents and underwriting policy changes require owner review. Offers above MAO require an explicit override. A live external execution also requires reviewed jurisdiction requirements, verified disclosures, a versioned attorney-approved template, cleared assignment restrictions and contact permission. Missing evidence blocks execution and requires legal review.

Recording signed-document status, title clearance or funded closing is evidence entry by an authorized human. The app does not sign documents, certify title, move deposits, move closing funds or make binding commitments. A fictional DEMO transition does not establish any of these live facts.

## Legal templates

The sample template in `docs/legal/` is deliberately not approved for use. It contains no legal clauses and must not be sent for signature. Supply attorney-reviewed jurisdiction-specific language, document type, version, approval date and effective date through a separately reviewed integration or future template-management workflow. AI may populate explicitly approved fields; it must not invent or rewrite legal language.

## Operating review

Before adopting a jurisdiction, obtain qualified legal review of licensing, required disclosures, assignment restrictions, advertising and communication rules. Record the applicable policy version and review date. Refresh expired or uncertain review rather than treating a historical approval as permanent. Maintain consent and suppression records independently of convenience workflow settings.

The initial application includes compliance checks and evidence fields; it is not a maintained legal-rules database or legal compliance certification. Full legal-template management and jurisdiction-specific automated rule updates are not implemented.
