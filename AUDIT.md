# AUDIT — end-to-end map of "מה מעשנים היום" before the pilot

Date: 2026-09-25. Read-only audit per `/sdcard/Download/mmh/AUDIT_BRIEF.md`. Every claim below points at a file and line; numbers come from commands run in this session (see `PROGRESS.md`). Nothing outside `app/AUDIT.md`, `app/TEST_PLAN.md`, `app/PROGRESS.md` was written. No secret values appear here; env vars are named only.

Contents: §1 Inventory · §2 Patient-flow map · §3 Gaps, ordered by what blocks the pilot · §4 Proposed build order · §5 What was checked and how.

---

## 1. Inventory

### 1.1 The app — `/root/mmh/app` (Next.js 14, package name `cannabis-pilot`)

| Item | Finding |
|---|---|
| Repo | github `tomertalker/ma-maashnim-hayom`, branch `main`, in sync with `origin/main`, working tree clean. 26 commits, all 2026-01-28 → 2026-02-02. Untouched for ~8 months. |
| Purpose | Patient MVP: login → onboarding questionnaire → recommendations → report (the home page says exactly this, `app/page.js:39`). |
| Files | `app/layout.js` (16 lines), `app/page.js` (79, auth + menu), `app/onboarding/page.js` (507), `app/recommendations/page.js` (235), `app/report/page.js` (386), `lib/supabaseClient.js` (6), `styles/globals.css` (209), `package.json`, `next.config.js`, `.env.example`, `README.md`, `cannabis-pilot` (a plain-text file listing the tree, not a folder). |
| Dependencies | `next ^14.2` (installed 14.2.35), `react 18.3`, `@supabase/supabase-js ^2.45` (`package.json:10-14`). No test runner, no lint config, no TypeScript. |
| Real vs mocked | Everything is real code against Supabase; there is no mock data and no hard-coded product list. The recommendation logic is real but minimal and lives inside the page component (`app/recommendations/page.js:11-36, 78-112`). |
| Data it expects | Supabase Auth (email + password, `app/page.js:20, 27`) and four tables, see 1.1.1. |
| Env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.example:1-2`, read at `lib/supabaseClient.js:3-4`). No `.env*` file exists locally; nothing is set. |
| Supabase project | **Unknown.** No file in any of the four folders or in `/sdcard/Download/mmh` names the app's project. The survey brief calls the survey project "separate from the app's project" (`/sdcard/Download/mmh/survey/DEPLOY.md` §1), so an app project may exist, but its ref, region, tables and auth settings are not recorded anywhere I can read. It is **not** `yernxedmokifcmpakzgd` (that project has only `responses` and `contacts`, insert-only for anon; `/sdcard/Download/mmh/survey/schema.sql:5-32`). |
| Schema | **No SQL for the app's tables exists anywhere** (`grep` for `users_profile`, `products_master` across `/root/mmh` and `/sdcard/Download/mmh` hits only the three app pages; the only `.sql` file is the survey's). |
| Deployed | **Unknown.** No `vercel.json`, `.github/`, `netlify.toml`, or URL in the repo. |
| Build | `npm install --no-package-lock` OK (30 packages). `npm run build` **without** env vars: compiles, then `Error: supabaseUrl is required.` while prerendering, "Export encountered errors" on `/`, `/onboarding`, `/recommendations`, `/report`. Cause: `createClient()` runs at module load (`lib/supabaseClient.js:6`) and Next prerenders these `"use client"` pages at build time. **With** placeholder env vars: clean build, 4 static routes (○), ~153-156 kB first load each. supabase-js prints a "Node 20 deprecated" warning. |

#### 1.1.1 Tables and columns the app reads/writes (derived from the code; this is the de-facto schema)

- `users_profile` — insert (`app/onboarding/page.js:192-199`): `user_id`, `age`, `gender`, `condition_1`, `condition_2`, `therapeutic_indication`, `therapeutic_indication_other`, `treatment_goals` (csv text), `patient_notes`, `preferred_method`, `mix_preference`, `daily_start_time`, `typical_session_grams`, `sessions_per_day_band`, `experience_level`, `preferred_flavor_tags` (csv), `earthy_tolerance`, `preferred_direction_tags` (csv), `consent_given`, `onboarding_done`. Update: `liked_strains` jsonb `[{strain_id, reasons[]}]` (`:223-228`). Read: `select *` for own row (`app/recommendations/page.js:56-60`) **and** `user_id, mix_preference, daily_start_time` of **other** users (`:119-125`).
- `products_master` — read only: `strain_id`, `name_he`, `name_en`, `t_category`, `c_category`, `parent1_canon`, `parent2_canon`, `terpenes` (csv of terpene ids, `splitCsv` at `app/recommendations/page.js:22, 101`), ordered by `internal_product_id` (`app/onboarding/page.js:99-102`, `app/recommendations/page.js:68-71`, `app/report/page.js:90-93`).
- `reports` — insert (`app/report/page.js:138-170`): `user_id`, `strain_id` (nullable), `strain_name_free` ("requires column in DB", `:144`), `duration_hours`, `user_short_review`, `liked_flag`, `effect_energy/focus/mood/appetite/libido/sensory`, `relief_score`, `like_reasons`, `dislike_reasons`, `dislike_severity_1_5`, `dislike_taste_detail`, `sideeffect_paranoia/dryness/dizziness`. Read: `user_id, strain_id, relief_score` where `liked_flag` for other users (`app/recommendations/page.js:133-137`).
- `purchases` — insert `user_id`, `strain_id` (`app/recommendations/page.js:162-165`).
- Privacy implication: the "similar patients" tab needs cross-user reads on `users_profile` and `reports`. Row-level security must either allow that (pilot-acceptable, but it exposes other patients' rows to any logged-in user) or the aggregation must move server-side (view / RPC). Decision needed before the schema is written.

#### 1.1.2 Behaviour worth knowing before testing

- Profile is **insert-only and locked** after the first save (`app/onboarding/page.js:126-131, 187-208`); the UI then shows "השאלון כבר מולא ולכן הוא נעול לעריכה" (`:275`). Mistakes cannot be corrected by the user.
- Five profile fields are saved with **hidden defaults and no UI**: `condition_1: "pain"`, `preferred_flavor_tags: "citrus,pine"`, `earthy_tolerance: "avoid_strong"`, `preferred_direction_tags: "calm,focus"`, `consent_given: true` (`app/onboarding/page.js:67-90`). Flavor and earthy tolerance drive 35% of the personal score plus a penalty (`app/recommendations/page.js:82-83, 98-105`), so every pilot user gets the same taste profile.
- Personal score = `0.55·genetic + 0.35·taste − 0.6·earthyPenalty`, top 12, seeds excluded (`app/recommendations/page.js:94-109`). Genetic = count of the product's `parent1_canon/parent2_canon` that appear among the seeds' parents (`:31-36`). Taste = flavors whose mapped terpene ids appear in the product's `terpenes` csv (`:11-29`).
- The taste map uses ids `alpha_pinene`, `beta_pinene`, `pinene_unspecified`, `eucalyptol`, `beta_caryophyllene`, `caryophyllene_unspecified`, `geraniol` (`:14-19`). Jane's data uses `pinene`, `caryophyllene` (see 1.3). Unless `products_master` is loaded with a translated vocabulary, the flavors **pine** and **gassy** can never score and **spicy** scores only via `humulene`.
- "קניתי" inserts a purchase and routes to `/report?strain_id=…` (`app/recommendations/page.js:158-171`); the report page reads the param in the browser (`app/report/page.js:76-85`) and pre-selects the strain. After a report is saved the form resets and the user stays on the page (`:173-195`).
- "Similar patients" = other users with the **same** `mix_preference` and `daily_start_time`, their liked reports aggregated (`app/recommendations/page.js:115-156`). With 3-4 pilot users this tab will almost certainly show its own empty-state text (`:219-223`).
- Layout sets `lang="he"` but **no `dir="rtl"`** (`app/layout.js:10`); Hebrew renders in a left-to-right layout. The mockup and the survey both set RTL.
- `styles/globals.css` defines the same classes three times (dark theme `:1-70`, light `!important` overrides `:71-130`, tokens with `prefers-color-scheme` `:131-209`). Cosmetic, but expect odd contrast on some phones.
- Onboarding "reasons" per seed strain (`:6-13`) and the report's like-reasons (`app/report/page.js:27-35`) use the same keys, so they could later be joined.

### 1.2 The mockup — `/sdcard/Download/mmh/app-mockup-full.html`

| Item | Finding |
|---|---|
| What it is | Single static HTML (145 KB, 484 lines, dated 2026-09-23), RTL, phone frame. It is the **specification** of the intended app. Title: "מה מעשנים היום — מוקאפ מלא". |
| Screens (10) | `s-splash` (:121), `s-onboard` with 3 segments רקע/שימוש/זנים (:131-155), `s-home` dashboard (:159), `s-recs` with filters (:161), `s-log` purchase report (:163), `s-journal` (:165), `s-bag` report detail (:167), `s-report` doctor report (:169), `s-product` strain page (:171), `s-profile` (:173). Bottom nav: בית · המלצות · יומן · דוח · פרופיל (:175-181). |
| Data | `window.PRODUCTS` on line 206 = **the old 112-product T22/C4 snapshot** (same products as `ultra-scraper/out/products.json`), including Cannabiz-derived fields: `rating`, `nrev`, origin strain `o/oe`, grandparents `g1/g2`, and `url` → cannabiz.co.il (112 links). 73 products have terpene lists, 24 with real percentages, 107 rated, 69 with an origin strain. 39 of these products are no longer sold (reco-engine Stage 1 diff). |
| Engine | In-page JS: terpene→effect knowledge table with evidence tiers A/B/C (:190-192), `predict()` (:219), 3-generation genetics `geneOf()` (:220), `score()` = `.42·effect + .33·genetics + .15·direction + .10·taste + purity/budget/verdict/repeat boosts − sedation penalty` (:244-253), `explain()` producing Hebrew reasons with tiers and cautions (:254-264), `recommend()` (:265). Filters: irradiation-free, pesticide-free, indoor, budget (:333, :243). |
| Real vs mocked | Entirely client-side state (`state`, :277). **No persistence** (no `localStorage`, reload loses everything) and **no network**. `loadDemo()` runs on load (:481) so the file opens on the **home** screen with demo patient "א. כהן", 3 seeds (RS11, Lakota, Triple C) and 3 seeded reports (:472-479). PDF export and stock/price alerts are `alert()`/text placeholders (:452, :318). |
| Bugs in the mockup | `function dPickClear(){dPickClear();}` (:367) is infinite recursion: on the log screen, after picking a strain, tapping "שנה" throws a stack overflow (button does nothing or the page hangs). `slog`, `addLog`, `finishBag`, `togSlog` (:390, :431-433) reference state that no longer exists — dead code, not reachable from the UI. |
| Deployed | No. A file on the phone. |

### 1.3 reco-engine — `/root/mmh/reco-engine`

| Item | Finding |
|---|---|
| Repo | github `tomertalker/reco-engine`, 5 commits, in sync, clean. Node built-ins only, **no `package.json`**. |
| Purpose (brief) | "recommendation engine + product catalog". |
| Purpose (reality) | **There is no recommendation or scoring code in this folder.** `grep -li "score|recommend|similar"` hits only audit/report/probe scripts. It holds Stage 0 (data audit of the 112 snapshot + Cannabiz terms probe; `REPORT.md`) and Stage 1 (fresh Jane inventory, field provenance, diff, survey product list; `REPORT_STAGE1.md`). The only engines that exist are the app's inline score (1.1) and the mockup's JS (1.2). |
| Data files | `data/products.json` — old 112 T22/C4 snapshot (copied from ultra-scraper, sha256 `059ab46f…`, 40 fields, 8 of them Cannabiz-derived per `out/provenance.json`). `data/products.clean.json` — same, 166 terpene `0 → null`. `data/catalog_2026-09-24.json` — **215 products** (168 flower, 45 oil, 2 preroll; T22/C4 flower = 149), Jane fields only, 20 keys: `sku, name_he, name_en, category, product_type, characterization, thc, cbd, price, price_catalog, in_stock, grower, marketer, brand, country, jane_product_id, jane_store_product_id, jane_product_url (all null), _src, _fetched_at`. **No genetics, no terpenes, no image in the catalogue.** `data/raw/jane_2026-09-24/page-01..09.json` — the raw widget-API pages. `out/survey_products.json` — 207 = 168 catalogue flowers + 39 old products no longer listed, keys `s,h,e,g,c,cat`. `out/inventory_diff.json`, `out/provenance.json`. |
| What the raw pages contain (measured this session, 168 flowers) | `parents` on 158, `parents_second` on 153 (both on 153); `terpenes` list on 108, with a positive percentage on 33; `main_img_url` on 167; `reviews` aggregate on 168 (`biz_reviews_count/avg` = Cannabiz review counts passed through Jane's API; `jane_reviews_count` 0); `description` on 40; `strain_id` on 115. Terpene ids: `caryophyllene 97, limonene 88, myrcene 74, linalool 54, humulene 48, pinene 38, farnesene 9, ocimene 7, terpinolene 7, bisabolol 6, terpineol 5, nerolidol 2, penchol 2, guaiol 2, cymene/selinene/germacrene/selina 1`. So the data the app's engine needs **exists in the raw pages but was not carried into the catalogue** (Stage 1 brief Part C listed only commercial fields). |
| Tests | `node test/run.js` → 10/10 pass; `node test/run_stage1.js` → 13/13 pass (run 2026-09-25 in a scratch copy; both write `out/test_results*.json`, so they were not run in place). |
| Legal state | Jane and Cannabiz are both operated by Cannabiz Ltd.; their terms forbid reuse of product content without written approval (`REPORT_STAGE1.md` §2). Tomer reports an **email approval for the Ultra Pharm pilot; the formal document is pending** and `inventory/terms/approval/` holds only a README. Fields to drop if refused: `origin_strain(_en)`, `rating`, `review_count`, `*_parents(_en)`, 3 Cannabiz terpene lists (`REPORT_STAGE1.md` §1). The mockup's data includes all of these. |
| Env vars / deploy | None / none. Network only in `inventory/fetch_ultra.js` (15 polite requests, no browser, no cookies). |

### 1.4 The survey — `/root/mmh/ma-oved-lecha` ("מה עובד לך")

| Item | Finding |
|---|---|
| Repo | github `tomertalker/ma-oved-lecha`, 13 commits, **in sync with origin** (so the disclaimers/personal-code change from handoff open item 1, commit `ec47e8a`, is pushed). Files: `index.html` (568 lines), `PROGRESS.md`. |
| Live | `https://tomertalker.github.io/ma-oved-lecha/` (GitHub Pages, per `PROGRESS.md`; not re-fetched here — no third-party requests). `<meta name="robots" content="noindex">`. |
| Purpose | Anonymous research survey: which strains work for which patients. This is the project's only **first-party rating source** today. |
| Real vs mocked | Fully live (`LIVE = true` when both constants are set, `index.html:160`). Preview-mode dev panel hidden when live (`:448`). |
| Flow (9 steps, `STEPS` at `:206`) | 0 פתיחה (age 18+ consent, "not medical advice", what is collected; `:252-266`) → 1 עליך: sex, age, years treated, licence category (T22/C4 preselected; `:268-278`) → 2 למה אתה משתמש: uses (≥1 required, `:455`), times, frequency, methods (`:280-290`) → 3 מה אתה אוהב: flavors, body/head, energy, strength, avoid, budget per 10 g, priorities (max 3), trusted growers (`:292-307`) → 4 הזנים שלך: pick ≥2 of 207 products or add a free-text strain (`:309-329`) → 5 דירוג הזנים, one card per strain: verdict (required), stars, per-use effect rows, side effects, times bought, last used, note, optional "deep" block (`:331-368`) → 6 השוואה: best / worst (`:370-383`) → 7 איך אתה בוחר (`:385-391`) → "סיום" posts → 8 סיכום + optional phone (`:441-451`). |
| Data | `PRODUCTS` (207, from `reco-engine/out/survey_products.json`, `:164`), `GROWERS` (30, `:165`). Payload = `{profile, picks, ratings, best, worst, choose, meta}` (`:415-419`). Writes via REST `POST /rest/v1/responses` `{code, version: "survey-v1", data}` and `POST /rest/v1/contacts` `{phone}` (`:420-439`). Header `apikey` only. Personal 6-char code is generated but **not shown** (`:428`, decision in handoff). `localStorage` save/restore under `ma-oved-lecha-v1`, 14-day expiry for unfinished runs (`:503-512`). |
| Supabase | Project `yernxedmokifcmpakzgd` (Sydney). Tables `responses`, `contacts`; RLS on; anon **insert only**, no select/update/delete (`/sdcard/Download/mmh/survey/schema.sql:22-32`). Constants `SUPABASE_URL`, `SUPABASE_ANON_KEY` are literals in the HTML (`:158-159`; publishable key, public by design). Tables were empty after the test rows were deleted (`PROGRESS.md` last line). |
| Link to the app | None, by design: no user identity, a different Supabase project. Products are keyed by **SKU** (`s`), while the app keys by `strain_id`. The catalogue carries both (`sku`, `jane_product_id`), so a join is possible later. |

### 1.5 ultra-scraper — `/root/mmh/ultra-scraper`

| Item | Finding |
|---|---|
| Repo | Local git, 1 commit ("Import ultra-scraper (Jane scraper, July 2026)"), in sync. `node_modules/` present (playwright). |
| Purpose | Original July-2026 scraper: Playwright + stealth Chromium through Jane's widget page, replays the widget API (`scrape.mjs`), then `enrich.mjs` fetches each product's **Cannabiz** page for rating, origin strain, grandparents, terpene names. Output `out/products.json` = the 112 snapshot (2026-07-03). |
| Status | **Archive.** Superseded by `reco-engine/inventory/fetch_ultra.js` (no browser, no cookies). Should not be run: it violates the owner limits recorded in `reco-engine/inventory/LEAD_DECISION.json` (no headless browser, no Turnstile workaround) and Cannabiz enrichment lacks a formal approval. Chromium path is hard-coded (`scrape.mjs:33`). |
| Env vars | None; no secrets in code (`REPORT_STAGE1.md` §8). |

### 1.6 Supabase projects (summary)

| Project | Region | Used by | Tables | Access model | Evidence |
|---|---|---|---|---|---|
| `yernxedmokifcmpakzgd` | Sydney | survey | `responses`, `contacts` | anon insert-only | `schema.sql`, `index.html:158` |
| app project | ? | app (intended) | `users_profile`, `products_master`, `reports`, `purchases` + Auth | per-user RLS needed; cross-user reads for "similar" tab | **not documented anywhere**; tables and loader do not exist in any repo |

Handoff decision (2026-09-25): Sydney is fine for the pilot; the app's production DB should be in Europe.

### 1.7 Other inputs

- `/sdcard/Download/mmh/handoff.md` — Hebrew session handoff: open items (verify survey push — **done, see 1.4**; file the Cannabiz email — **still pending**; this audit; first pilot with 2-3 people), decisions (no personal code shown; Sydney OK for pilot; user reviews **and photos: yes, with disclaimers**; bump to `survey-v2` if questions change).
- `/sdcard/Download/mmh/survey/{DEPLOY.md, survey.html, schema.sql}` — survey deploy brief, original page (differs from the live `index.html` only in the 18 edited line ranges recorded in the survey's `PROGRESS.md`), schema.
- `/sdcard/Download/mmh/reco-engine/{stage0,stage1}/`, `/sdcard/Download/mmh/ultra-scraper/` — copies of deliverables.
- `/root/projects/` still exists with old `CLAUDE.md` backups from earlier projects; nothing there is referenced by the four folders (paths were updated in reco-engine commit `712a19f`).
