# Audit progress (read-only audit before the pilot)

Brief: `/sdcard/Download/mmh/AUDIT_BRIEF.md`. Outputs: `AUDIT.md`, `TEST_PLAN.md`, this file. Nothing else in this repo changes.
One line per finished step. On resume: read this, then `AUDIT.md`; do not redo research that is already written down.

Session facts (2026-09-25): Node v20.19.2, npm 9.2.0. `npm install --no-package-lock` in app/ added 30 packages (node_modules is git-ignored, no lockfile created). `npm run build` fails without the two `NEXT_PUBLIC_SUPABASE_*` vars (prerender error on all 4 routes) and passes with placeholder values. reco-engine tests were run in a scratch copy (`node test/run.js` 10/10, `node test/run_stage1.js` 13/13); the reco-engine folder itself was not touched.

- [x] 1. Inventory of every part (app, mockup, reco-engine, survey, scraper, Supabase projects, data files) → `AUDIT.md` §1.
- [x] 2. Patient-flow map F1–F17 with works / partial / missing and file:line evidence; mockup-vs-app feature lists; vocabulary mismatches → `AUDIT.md` §2.
- [x] 3. `TEST_PLAN.md`: Part A survey (א1–א20, runnable), Part B mockup (ב1–ב17, runnable; ב15 is the recommendation-quality check), Part C app (ג1–ג15, blocked by ח1–ח4). Hebrew for the testers.
- [x] 4. `AUDIT.md` §3 gaps G1–G16 ordered by what blocks the pilot, §4 build order B0–B8 (minimum to unblock the app: B0→B1→B2→B3), §5 verification record.
- [x] 5. Summary reported to Tomer (2026-09-26, in Hebrew). Waiting for B0 decisions; nothing built.

## Step 1 brief (2026-09-26, `/sdcard/Download/mmh/STEP1_BRIEF.md`)

- [x] 0. `/root/mmh/CLAUDE.md` created (outside any repo) with the project rules from the brief.
- [x] 1. Decisions recorded in `AUDIT.md` §6 "Decisions 2026-09-26": D1-D4e, the server check for GitHub Pages, the schema plan (not built), open questions, and a revised build order that replaces §4. The §1.1 deployment row is corrected by §6: the repo homepage field names a Vercel URL. Committed and pushed.
- [x] 2. Catalogue enrichment in reco-engine (commit d6bbf12, pushed). Flowers with parents 0 → 158 of 168, with terpenes 0 → 108. Full suite 36/36. Details in `reco-engine/REPORT_STAGE2.md`.
- [x] 3. Stopped and reported. Next step waits for Tomer.

## Pilot build (2026-10-11, branch `pilot-v1`)

Built in one session from Tomer's four answers: nickname + password sign-in, the survey's Supabase project for the pilot, recommendations included. Details in `AUDIT.md` §7.

- [x] Backend: `supabase/pilot_schema.sql` (tables + 19 callable functions, all prefixed `mmh_`). 155 checks in `test/db_test.mjs` against a real Postgres 16.
- [x] Engine: `lib/engine/engine.mjs`, ported from the mockup's engine and adapted to Jane-only fields. 39 checks on a made-up catalogue here; 20 more on the real catalogue in `reco-engine/test/run_app.js`.
- [x] App: sign-in, card wizard, feed, recommendations, strain page, purchase report with photos, journal with doctor report, profile. Static export.
- [x] End to end: `test/e2e.mjs`, two patients on a 412 px wide browser, 63 checks, including "a photo with GPS is stored without it" and "the app contacts nothing but its own server".
- [x] Independent review (a separate agent that had not seen the build, with the local database to try attacks on). No way found to read another patient's private data. Fixed from its findings: per-address limits on sign-ups and wrong passwords (a stranger can no longer lock the owner out), invite-code guessing cut off, common passwords and look-alike nicknames refused, three-flag hiding limited to established accounts and final once Tomer puts a review back, per-patient caps on reviews and photos, server refuses JPEGs that still carry EXIF or XMP, photos removed before a review is republished, licence no longer in the feed, feed context frozen at save time, a re-buy no longer moves a review up, delisted strains keep their name, odd input no longer raises, the font ships with the app.
- [ ] Not done here (needs Tomer): run the SQL in Supabase, set the admin key, load the catalogue, publish. Steps in `PILOT_SETUP.md`.
- [ ] Not verified: the functions on the real Supabase project (no network access to it from the build session). First thing to check after the SQL is run: sign up once from the phone.
