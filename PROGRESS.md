# Audit progress (read-only audit before the pilot)

Brief: `/sdcard/Download/mmh/AUDIT_BRIEF.md`. Outputs: `AUDIT.md`, `TEST_PLAN.md`, this file. Nothing else in this repo changes.
One line per finished step. On resume: read this, then `AUDIT.md`; do not redo research that is already written down.

Session facts (2026-09-25): Node v20.19.2, npm 9.2.0. `npm install --no-package-lock` in app/ added 30 packages (node_modules is git-ignored, no lockfile created). `npm run build` fails without the two `NEXT_PUBLIC_SUPABASE_*` vars (prerender error on all 4 routes) and passes with placeholder values. reco-engine tests were run in a scratch copy (`node test/run.js` 10/10, `node test/run_stage1.js` 13/13); the reco-engine folder itself was not touched.

- [x] 1. Inventory of every part (app, mockup, reco-engine, survey, scraper, Supabase projects, data files) → `AUDIT.md` §1.
