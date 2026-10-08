# Current State — 2026-10-08

**Phase:** 0 complete. Phase 1 blocked on owner answers (spec §12, Q1–Q7).

## Built
- Docs: master spec, handoff, decisions, AI context files.
- `reference/live-site-2026-10-07.html`: snapshot of the live site (password redacted). Its source isn't in any reachable repo.
- `stopgap/index.html`: the live site with a **working** booking form (Netlify Forms), campaign capture, and the fake admin removed. **Not deployed.** The owner has to drag it into Netlify.

## Works
- The live marketing site renders (Netlify).

## Broken / missing
- The live booking form sends nothing (critical; the stopgap fixes it).
- No backend, DB, Square integration, campaign tracking or admin.
- Brand and price mismatch between the site and the business plan.

## Waiting on owner
- Q1 brand · Q2 prices · Q3 site source and domain registrar · Q4 deposit policy · Q5 durations, hours, radius, size surcharge · Q6 Square account · Q7 water and power.
- Create a private `gear-shift` GitHub repo and grant this Claude app access. The session couldn't create it (403).

## Environment notes
- Code currently lives in `gear-shift/` on branch `claude/gear-shift-phase0` of `lelouchsvg/ai-memory-vault` (unrelated repo).
