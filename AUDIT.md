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

---

## 2. Patient-flow map

Legend: **WORKS** = code complete and exercisable today · **PARTIAL** = code exists but depends on something missing or behaves differently from the intent · **MISSING** = no code. "Today" means: with a Supabase project that has the four tables (which does not exist yet, §1.1). Where the mockup defines the intent, the mockup line is cited too.

| # | Link | App status | Evidence (app) | Mockup intent |
|---|---|---|---|---|
| F1 | Open the app → consent / disclaimer / age gate | PARTIAL | One-line disclaimer under the login form (`app/page.js:61-63`); age ≥ 18 checked only when saving the profile (`app/onboarding/page.js:180-181`); `consent_given: true` saved silently (`:88`). No consent text, no "what is collected". | Splash with disclaimer and CTA (`:121-128`). Survey has a proper consent block (`ma-oved-lecha/index.html:262-265`). |
| F2 | Sign up / sign in (email + password) | PARTIAL | `supabase.auth.signUp` / `signInWithPassword` / `signOut` (`app/page.js:18-34`); session listener (`:12-16`); menu after login (`:67-75`). Code is complete; **untested against any project** (none documented). Email confirmation may be required depending on Auth settings (message at `:22` anticipates it). | No login in the mockup (local state only). |
| F3 | Onboarding step 1 → `users_profile` row | PARTIAL | Form (`app/onboarding/page.js:283-421`) → validation (`:179-186`) → `insert` (`:199`). Works if the table exists. Locked forever after the first save (`:187-189, :208`, message `:275`). Flavors / earthy tolerance / direction are **not asked**, but saved as defaults (`:84-86`). | 3 chip segments incl. flavors, purity, budget, dose band (`:133-155`); profile editable from the profile screen (`:468`). |
| F4 | Onboarding step 2 → seed strains with reasons → `liked_strains` | PARTIAL | Search over `products_master`, top 7 (`:138-149`), ≥ 3 strains with 1-2 reasons each (`:215-220`), `update liked_strains` (`:223-228`). Depends on `products_master` having rows — **no loader or data exists** (§1.3). The seeds step is reachable even when the profile step is locked (`:128`), so seeds can be re-saved. | Seeds optional ("אפשר גם לדלג", `:149`), chip list of all in-stock strains (`:309`). |
| F5 | Profile + seeds → personal recommendations | PARTIAL | Load profile (`app/recommendations/page.js:56-66`, `.single()` → "לא נמצא פרופיל" if none) + products (`:68-73`) → score (`:78-112`) → 12 cards with "למה: גנטיקה=N · טעם=M" (`:187-199`). Blockers: `products_master` empty; `parent1_canon/parent2_canon/terpenes` columns must be filled with canonical values for the genetic and taste terms to be non-zero; terpene id vocabulary mismatch (§1.1.2). No price, stock, image, category filter or explanation text. | Ranked list with match %, 4 sub-score bars, tiered reasons, cautions, terpene badges, price + "במלאי", filters (`:333-342`). |
| F6 | "Similar patients recommend" tab | PARTIAL (will be empty in the pilot) | Same `mix_preference` + `daily_start_time`, ≤ 30 users, their liked reports aggregated (`:115-156`). Needs ≥ 2 users matching on both fields with liked reports. Requires cross-user RLS reads (§1.1.1). | Not in the mockup ("פרופיל דומה יתמלא מדיווחי מטופלים", `:346`). |
| F7 | Recommendation → strain page | **MISSING** | No route for a product; cards are not tappable. `products_master` has no image/price/description columns in any query. | Full product page: 3-generation genetics, terpenes → effect bars, purity pills, brand/grower/country/price, Cannabiz rating, "קניתי" (`:345-353`). Raw Jane data has parents, terpene lists, image for most flowers (§1.3), so this is buildable from Jane-only fields except the rating. |
| F8 | "קניתי" → purchase record → report pre-filled | PARTIAL | Insert `purchases` (`:162-165`) then `router.push('/report?strain_id=…')` (`:170`); report reads the param (`app/report/page.js:76-85`) and shows "נבחר אוטומטית" (`:217-221`). Works if tables exist. Purchases are never read back anywhere. | Log screen with source "מהמלצה / קנייה עיוורת" and repeat counter (`:378-399, :414-428`). |
| F9 | Review (structured report) → `reports` | PARTIAL | Liked: 6 effect sliders 1-10, relief 0-10, ≤ 2 reasons (`:273-310`); disliked: ≤ 2 reasons, severity 1-5, taste detail if "טעם", 3 side-effect boxes (`:312-359`); both: duration + ≤ 150 chars (`:361-374`); validation (`:128-136`); insert (`:170`). Free-text strain needs `reports.strain_name_free` (`:144-145`). Works if the table exists. No "לא בטוח" verdict. | Verdict like/unsure/dislike, 1-5 stars, helped/bothered chips (`:389-395`). |
| F10 | Photos with a review | **MISSING** | No storage bucket, no upload UI, no image column anywhere. Handoff decision: yes, with disclaimers. | Not in the mockup either. |
| F11 | Reviews visible to others (per strain, aggregated) | **MISSING** | Only the similar-tab aggregate (F6). No per-strain review list, no counts, no own-review history. | Product page shows the Cannabiz aggregate rating only (`:346`). |
| F12 | Ongoing use: journal / history of my reports | **MISSING** | After saving, the form resets (`app/report/page.js:173-195`); nothing lists past reports or purchases. | Journal list (`:407-412`), bag detail with "קניתי שוב" (`:414-428`), home dashboard stats (`:314-330`). |
| F13 | Reports feed back into my recommendations | PARTIAL / effectively MISSING | Personal score uses only onboarding seeds (`app/recommendations/page.js:81, :86-92`); own reports affect nothing for me. Reports only feed **other** users' similar tab. | Verdicts (+0.12 / −0.5), repeat purchases, helped/bothered all enter the score (`:229-238, :249-251`). |
| F14 | Doctor report / export | **MISSING** | — | Table + keep/avoid + medical-attention flags; PDF is a placeholder `alert` (`:436-454`). |
| F15 | Stock / price alerts, live inventory | **MISSING** | No refresh job, no stock field used. | Placeholder text on home (`:318`); recs badge "במלאי · מחיר חי" (`:342`). |
| F16 | Survey → engine (first-party ratings) | WORKS as a collector; downstream MISSING | Survey posts `responses` rows (`ma-oved-lecha/index.html:426-431`). No export, analysis or join to `products_master`/`strain_id` exists; keys are SKU (`s`). | — |
| F17 | Catalogue refresh (Jane → catalogue → app) | PARTIAL | `reco-engine/inventory/fetch_ultra.js` + `build_catalog.js` produce `data/catalog_<date>.json` (Jane-only, no genetics/terpenes). Nothing loads any catalogue into `products_master`. | Recs header says "מלאי T22/C4 חי" (`:337`). |

### 2.1 Features the mockup has and the app lacks

Screens: splash with disclaimer and demo profile · home dashboard (stats, "מה שעובד לך", next recommendation, doctor-report CTA) · strain/product page · purchase log with source (recommendation vs blind) · journal · bag detail with repeat-purchase counter · doctor report · profile view / edit / reset · bottom tab navigation.

Onboarding: chip UI in 3 segments; flavors; purity preferences (indoor, pesticide-free, non-irradiated); budget (presets or free amount); dose band; T22/C4 "start low" note for beginners; seeds optional.

Recommendations: match percentage; four sub-score bars (effect, genetics 3 generations, direction, taste); reasons with evidence tiers מבוסס/ראשוני/אנקדוטלי; cautions (beginner, anxiety-sensitive); terpene badges or "טרפנים לא פורסמו"; price and budget badge; stock badge; filters (non-irradiated, pesticide-free, indoor, budget); "unsure" verdict; verdict/repeat feedback into the score; filtering out strains marked "לא התאים".

Engine: terpene → effect knowledge table with tiers; 3-generation genetics with he↔en alias canonicalisation; direction (indica/sativa vs day/night goals); sedation penalty from side effects; Hebrew `explain()`.

Layout: RTL (`dir="rtl"`), phone-first CSS.

### 2.2 Features the app has and the mockup lacks

Real authentication and per-user persistence · "similar patients" tab · free-text strain name in a report · 1-10 effect sliders and 0-10 relief · dislike severity and taste detail · side-effect booleans in the schema · profile lock (arguably a bug, not a feature) · seeds with 1-2 reasons each.

### 2.3 Data-vocabulary mismatches across parts

| Concept | App | Mockup | Survey | Catalogue / raw Jane |
|---|---|---|---|---|
| Product key | `strain_id` (text) | `id` = Jane slug, e.g. `lakota-2360` | `s` = SKU | `jane_product_id` slug (e.g. `pdd-mini`) + `sku` |
| Category | `t_category`, `c_category` (separate) | literal "T22/C4" | `cat` "T22/C4" | `category` "T22/C4" |
| Genetics | `parent1_canon`, `parent2_canon` | `p1/p1e`, `p2/p2e`, `o/oe`, `g1/g2` | none | raw `parents[0]`, `parents_second[0]` (he + en); not in the catalogue |
| Terpenes | csv of ids, expects `alpha_pinene`, `beta_caryophyllene`… | `terps[{i,p}]` with alias map `caryophyllene→beta_caryophyllene`, `penchol→fenchol` | none | raw `terpenes[{id,heb_name,percentage}]` with ids `pinene`, `caryophyllene`…; not in the catalogue |
| Indication | Hebrew strings (`INDICATIONS`, 9) | Hebrew strings (`INDIC`, 7, different set) | `profile.uses` keys | — |
| Reasons / effects | `like_reasons` keys (7), `dislike_reasons` (10) | `HELPED` (7), `BOTHERED` (7), different keys | per-use 0-3 effect + `sidefx` keys | — |

No two parts share a vocabulary end to end. The catalogue's `jane_product_id` + `sku` pair is the natural bridge.

---

## 3. Gaps, ordered by what blocks the pilot

"Blocks" = without it, the 2-3 testers cannot produce the screenshots the pilot is for (do the recommendations match what knowledgeable patients already know?). What can run **today** without any build: the survey (TEST_PLAN part א) and the mockup, including its recommendation-quality check (part ב, step ב15). Everything about the Next.js app is blocked.

| # | Gap | Blocks | Evidence | Smallest fix |
|---|---|---|---|---|
| G1 | **The app has no backend.** No Supabase project, schema or URL is documented; the four tables do not exist in any SQL. | All of TEST_PLAN part ג. | §1.1, §1.1.1; `grep` found no SQL; `.env.example` only. | Decide project (new, or new tables in `yernxedmokifcmpakzgd` for the pilot — Sydney is accepted per handoff), write `schema.sql` from §1.1.1 with per-user RLS, run it, enable email auth. |
| G2 | **`products_master` has no data and no loader.** The Stage 1 catalogue lacks the columns the engine scores on (parents, terpenes); the raw Jane pages have them. | Part ג (search lists empty, recommendations empty even with a profile). | §1.3 raw-page counts; `app/recommendations/page.js:68-73, 94-109`. | Loader script (raw Jane pages → rows): `strain_id ← jane product_id slug`, `sku`, names, `t_category/c_category ← split "T22/C4"`, `parent1_canon/parent2_canon ← parents[0].eng_name` lower-cased, `terpenes ← csv of ids`, `internal_product_id ← store_product_id`, plus `price`, `in_stock`, `image_url`, `characterization`. Jane-only fields; refresh the snapshot first (15 requests, inside the reported approval). |
| G3 | **Not deployed; build needs env vars.** | Part ג (testers need a URL). | §1.1 build result; `lib/supabaseClient.js:6`. | Host on Vercel with the two `NEXT_PUBLIC_*` vars, or `output: 'export'` + GitHub Pages like the survey (all pages are client-side, so static export works). Optionally create the client lazily so `next build` no longer needs the vars. |
| G4 | **Taste preferences are hidden defaults.** Every user is saved with `citrus,pine` / `avoid_strong` / `calm,focus`. | Validity of part ג step ג10 (the recommendations would not reflect the tester). | `app/onboarding/page.js:84-86`; used at `app/recommendations/page.js:82-83, 98-105`. | Add flavor + earthy-tolerance chips to onboarding step 1 (the mockup already has the UI, `:144`), or drop those terms until asked. |
| G5 | **Terpene vocabulary mismatch** between the taste map and Jane ids. | Quality of ג10 (pine/gassy never score). | `app/recommendations/page.js:14-19` vs raw ids in §1.3. | Map `pinene→pine`, `caryophyllene→gassy/spicy` in the loader or in `scoreTaste`. |
| G6 | **No strain page** (F7). Testers cannot see why a strain was recommended or check its genetics. | Depth of the ✓/✗ judgement in ג10; the mockup covers this for ב16. | §2 F7; mockup `:345-353`. | Route `/strain/[strain_id]` reading `products_master` (genetics, terpenes, price, stock, image). Skip the Cannabiz rating until the formal approval names public display. |
| G7 | **Explanations are raw numbers**; no price, stock, filters; no "unsure" verdict. | Pilot feedback quality. | `app/recommendations/page.js:193`; mockup `:244-264`. | Port the mockup engine (`predict/geneOf/score/explain`) into `lib/engine.js`; it is plain JS and already produces Hebrew reasons. |
| G8 | **Reports do not change my recommendations; no journal** (F12, F13). | "Ongoing use" cannot be tested at all. | `app/recommendations/page.js:81-92`; `app/report/page.js:173-195`. | Read own `reports`/`purchases` into the score (verdict ±, repeat +) and add a `/journal` list. |
| G9 | **Reviews visible to others, photos** (F10, F11). Decision taken: yes, with disclaimers. | Not needed for the first pilot. | §2. | Supabase Storage bucket + upload on the report form + aggregated per-strain review block on the strain page, with the disclaimers used in the survey. |
| G10 | **Doctor report, alerts, live inventory refresh** (F14, F15, F17). | Not needed for the first pilot. | §2. | After the pilot. |
| G11 | **Privacy model for "similar patients"** requires cross-user reads. | Schema design (G1). | §1.1.1. | Server-side view/RPC returning aggregates only, or accept in the pilot and document it. |
| G12 | **Profile is locked after first save**; no way to fix a typo. | Tester frustration; bad data. | `app/onboarding/page.js:187-208`. | Allow update of own row (RLS `update using user_id = auth.uid()`), keep an `updated_at`. |
| G13 | **No RTL**, triple-defined CSS, Node-20 deprecation warning from supabase-js. | Readability on phones. | `app/layout.js:10`; `styles/globals.css`. | `dir="rtl"` on `<html>`; collapse CSS to the last block. |
| G14 | **Legal:** formal Cannabiz approval not filed; the mockup and the old snapshot carry Cannabiz-derived fields (ratings, origin, grandparents, 112 cannabiz.co.il links). | Publishing anything with those fields. | §1.3, `inventory/terms/approval/` has only a README; mockup line 206. | File the email in `reco-engine/inventory/terms/approval/`; build `products_master` from Jane raw only; do not publish the mockup file on a public URL. |
| G15 | **Survey data has no downstream.** Responses are keyed by SKU and never analysed or joined to the app. | Evaluation of the engine later, not the pilot. | §2 F16. | Export script: `responses.data.ratings` → per-SKU aggregates; `products_master.sku` makes the join. |
| G16 | **Mockup bug** `dPickClear` recursion; dead code. | Only step ב7. | mockup `:367`. | One-line fix when the mockup is next edited; testers are warned. |

## 4. Proposed build order

Each step is small, testable, and ends with a commit. Nothing here is started until Tomer approves.

**B0 — Decisions needed from Tomer (no code)**
1. Supabase project for the app: new project, or new tables in the survey's project for the pilot. (Handoff: Sydney OK for the pilot, Europe for launch.)
2. Hosting: Vercel (needs an account and the two env vars) or static export to GitHub Pages (same pattern as the survey).
3. Privacy of the "similar patients" tab (G11): aggregate server-side, or accept cross-user reads for 3-4 testers.
4. Whether to run the recommendation-quality check on the **mockup now** (TEST_PLAN ב14–ב16, possible today) while the app catches up. Recommended: yes, it answers the pilot's question this week.

**B1 — Schema** (`app/supabase/schema.sql`, new file): the four tables from §1.1.1 including `reports.strain_name_free`, `products_master` with `sku`, `price`, `in_stock`, `image_url`, `characterization`; RLS: own-row read/insert/update on `users_profile`, `reports`, `purchases`; `products_master` readable by authenticated; similar-tab per B0.3. Test: Tomer runs it; a curl with the anon key gets 401 on select, and a signed-in user can insert into `users_profile`. Unblocks ח2.

**B2 — Catalogue loader** (`reco-engine` stays read-only; put it in `app/scripts/load_products.js`, Node built-ins): refresh the Jane snapshot with `reco-engine/inventory/fetch_ultra.js` (Tomer runs it), then map raw pages → `products_master` rows as in G2, with the terpene alias map (G5). Output a JSON/CSV that Tomer uploads via the dashboard or a service-key upsert run from his machine (key never in the repo). Test: row count = number of flowers (168 today); spot-check Lakota's parents and terpenes against the raw page. Unblocks ח3.

**B3 — Minimum app fixes and deploy:** `dir="rtl"`; lazy Supabase client (build without env); flavor + earthy chips in onboarding (G4); show category, price, stock in recommendation cards; allow profile update (G12). Deploy per B0.2 with env vars. Test: TEST_PLAN part ג runs end to end on one phone. Unblocks ח1, ח4 → **the pilot can run on the real app.**

**B4 — Strain page** `/strain/[strain_id]` from `products_master` (genetics, terpenes, price, stock, image), linked from recommendation cards and the report form. Test: ב16-style screenshots from the app.

**B5 — Engine port:** move the mockup's `predict/geneOf/score/explain` into `lib/engine.js`, drive it from `users_profile` + `liked_strains` + own `reports`/`purchases` (G7, G8). Test: with seeds RS11 / Lakota / Triple C and no reports, the top 10 equals the mockup's demo ranking on the same 112 products (fixture test in `app/scripts/`).

**B6 — Journal + feedback:** `/journal` listing own reports and purchases, "bought again" counter, verdicts feeding the score. Test: a liked report moves the strain up with the "סימנת שאהבת" reason.

**B7 — Reviews and photos** (after pilot feedback): Storage bucket, upload on the report form, aggregated anonymous review block on the strain page, disclaimers.

**B8 — Doctor report, stock/price alerts, scheduled catalogue refresh.**

In parallel, no code: file the Cannabiz approval document (G14); write the survey export script (G15); fix the mockup's `dPickClear` if the mockup is edited again (G16).

Minimum to unblock TEST_PLAN part ג: B0 → B1 → B2 → B3.

## 5. What was checked and how

- Read every file of `app/` (all 8 source files, fully), the whole survey `index.html`, the survey `schema.sql` and `DEPLOY.md`, the mockup's HTML skeleton and all of its JavaScript, `handoff.md`, both reco-engine reports and briefs, the reco-engine test runners, the scraper README and `scrape.mjs` header.
- Measured: raw Jane page coverage (parents, terpenes, images, reviews) with a Node one-liner over `data/raw/jane_2026-09-24/`; terpene id sets in raw pages and in `products.json`; mockup product count and demo names; survey product list categories.
- Ran: `npm install --no-package-lock` and `npm run build` twice in `app/` (without and with placeholder env values); `node test/run.js` and `node test/run_stage1.js` in a scratch **copy** of reco-engine (10/10 and 13/13 pass). `git status` in all four repos: clean and in sync with origin; no unpushed commits.
- Did **not**: fetch any URL (no requests to GitHub Pages, Supabase, Jane or Cannabiz); run a browser; run the scraper; modify anything outside `app/AUDIT.md`, `app/TEST_PLAN.md`, `app/PROGRESS.md`; push.
- Unverifiable from here, needs Tomer: whether an app Supabase project already exists and what it contains; whether the app is deployed anywhere; whether the survey page is still reachable (last confirmed 2026-09-25 in the survey's `PROGRESS.md`); whether the Cannabiz approval covers public display of ratings.

---

## 6. Decisions 2026-09-26

Source: `/sdcard/Download/mmh/STEP1_BRIEF.md` §1. This section **supersedes §4** (build order) and the schema notes in §1.1.1 and B1. It also corrects §1.1: the "Deployed" row said "Unknown". The GitHub repo's homepage field is `https://ma-maashnim-hayom.vercel.app` (read with `gh repo view` on 2026-09-26; the URL itself was not opened). So a Vercel deployment probably existed, and its environment variables would name the app's original Supabase project. GitHub Pages is not enabled on the repo. The repo is public.

### 6.1 Decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | **Supabase:** a new project for the app, region EU (Frankfurt). Tomer creates it and will send the URL and the publishable key later. The survey project (`yernxedmokifcmpakzgd`, Sydney) stays separate. | Resolves G1. The schema (§6.3) is written only after the project exists. The key goes into build-time env vars only (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), never into the repo. |
| D2 | **Pilot hosting:** static export to GitHub Pages if nothing in the app needs a server. Paid hosting is decided before the wide launch. | Resolves G3. The check is in §6.2: nothing in the pilot scope needs a server. |
| D3 | **One recommendation engine:** the mockup's engine becomes a shared module in reco-engine, used by both the mockup and the app. Recommendation quality is tested on the mockup this week. | Replaces the old B5 plan ("port into `app/lib/engine.js`"). The mockup must behave the same until the test week ends, so results stay comparable. |
| D4 | **Community feed (required):** patients scroll other patients' reviews: bag photos, ratings and text, plus the reviewer's indication category and dosage. No identifying details. | G9 becomes required. The rules are D4a–D4e. |
| D4a | The browser never reads other users' raw rows. It reads only a public view or database function that returns published reviews with whitelisted fields. | Base tables get own-row RLS only. The two cross-user queries in `app/recommendations/page.js:119-137` must go: under own-row RLS they would silently return only the caller's rows. |
| D4b | Publishing a review to the feed is opt-in. Showing indication and dosage with it is a separate opt-in. | Two booleans per review, both default false (§6.3). |
| D4c | Broad categories only: indication category, dosage band, licence category. No names, phone numbers, exact age, city or exact dates. | Onboarding stores categories. The feed shows a month, not a date. |
| D4d | Photos: strip EXIF/GPS on the device before upload (re-encode). Tell the user not to include prescriptions, receipts, faces or name labels. | Re-encode through a canvas on the device (§6.3). The warning is shown next to the photo picker. |
| D4e | "Similar patients" shows aggregates only for groups at or above a configurable minimum (default 5). Below it, show nothing. | A settings row read by a database function. With 3-4 pilot testers this tab will always be empty; that is expected. |

### 6.2 Does anything need a server? (D2 check)

**Today's app: no.**
- All four pages are client components (`"use client"` at line 1 of `app/page.js` and the three page files).
- There is no `app/api/`, no `middleware.js`, no server action, no `next/image`, and no use of cookies or headers.
- Data flows from the browser through supabase-js (`lib/supabaseClient.js`).
- `next build` already marks every route static (○) (§1.1).

**What static export on GitHub Pages needs (part of B4):**
- `output: 'export'`, `basePath: '/ma-maashnim-hayom'` (or a custom domain), `trailingSlash: true`.
- The 13 raw `<a href="/…">` links must become `next/link`, because raw anchors ignore `basePath`. They are in `app/page.js:69-71`, `app/onboarding/page.js:277, 420, 500, 501`, `app/recommendations/page.js:229-231` and `app/report/page.js:380-382`. The single `router.push` (`app/recommendations/page.js:170`) already respects `basePath`.
- A strain page as one static page with a query parameter (`/strain/?id=…`), not a pre-rendered page per product (see the legal note below).
- A GitHub Actions workflow that builds with the two `NEXT_PUBLIC_*` values stored as Actions variables.
- Supabase Auth "Site URL" and redirect URLs set to the Pages URL, so email-confirmation links land on the app.

**Planned features that need server-side code.** None of them needs a Next.js server. Each can be a Supabase Edge Function or a scheduled GitHub Action:
1. Account and data deletion: deleting an Auth user needs the service-role key.
2. Stock and price alerts: a scheduled job plus a sender (web push or email).
3. Scheduled catalogue refresh from Jane, within the approval's limits (`reco-engine/inventory/LEAD_DECISION.json` owner limits).
4. Optional: tell Tomer when a review is flagged.

**Not server-side:** the feed and the aggregates (Postgres functions), photo EXIF stripping (on the device), and the doctor report (browser print to PDF).

**Legal note:** pre-rendering strain pages would publish Jane catalogue data as public HTML on github.io. The formal Cannabiz approval is still pending (G14). Until it confirms public display, catalogue rows are fetched at runtime and are readable by signed-in users only.

### 6.3 Schema plan (not built)

Written as SQL only after D1's project exists (B1). All tables are in `public` with RLS on. `anon` gets no table access.

| Table | Purpose | Columns (changes from the de-facto schema in §1.1.1) | Access |
|---|---|---|---|
| `users_profile` | private profile | today's columns, except: exact `age` → `age_band` (18+ checked at entry); add `indication_category`, `dosage_band`, `license_category` (fixed lists, §6.4); add `consent_aggregates` boolean and `consent_at`; drop the hidden defaults (G4) | select / insert / update own row (`user_id = auth.uid()`); no delete through the API (B8) |
| `products_master` | catalogue | loaded from `reco-engine/data/catalog_<date>.enriched.json`: `jane_product_id` (primary key, replaces `strain_id`), `jane_store_product_id`, `sku`, names, `category` plus the T and C split, `product_type`, `characterization`, `price`, `in_stock`, `grower`, `brand`, `country`, `parent1_strains`, `parent2_strains`, `strain`, `terpenes` (jsonb), `missing` (jsonb reasons), `fetched_at` | select for `authenticated` only; no writes through the API (Tomer loads it from the dashboard) |
| `reports` | a review; the row itself stays private | today's columns, plus `verdict` (like / unsure / dislike), `stars` 1-5, `publish_to_feed` boolean default false, `share_context` boolean default false (check: requires `publish_to_feed`), `published_at`, `hidden` boolean default false (moderation) | select / insert / update / delete own rows |
| `review_photos` | photo metadata | `id`, `report_id`, `object_path`, `width`, `height`, `created_at`; at most 3 per review (proposal) | own rows, through ownership of the report |
| `purchases` | as today | unchanged | own rows |
| `app_settings` | configuration | key and value; `similar_min_group = 5` | no API access; read inside functions; Tomer edits it in the dashboard |
| `feed_flags` | abuse reports | `report_id`, `reason`, `created_at` | insert for `authenticated`; no select |

**Database functions.** All are `security definer` with a fixed `search_path`. Execute is granted to `authenticated` only.
- `feed_page(p_offset, p_limit ≤ 50)`: one row per review where `publish_to_feed` is true and `hidden` is false.
  - Returns: review id (a random UUID), product (`jane_product_id` and names), verdict, stars, relief and effect fields, like and dislike reasons, side-effect flags, text, photo object paths, and `published_month`.
  - `indication_category`, `dosage_band` and `license_category` come back only when `share_context` is true; otherwise they are null.
  - Never returns: user id, email, age, gender, notes, purchases, or exact timestamps. Offset paging means no timestamp is ever used as a cursor.
- `similar_aggregates()`: finds the caller's group, which is other users who gave `consent_aggregates` and share the caller's `indication_category` and `dosage_band` (definition open, §6.4).
  - If the group has fewer members with reports than `similar_min_group`, it returns zero rows.
  - Otherwise it returns one row per product: `n_users`, share liked, average relief.
  - Proposal beyond the brief: a product row with `n_users` below the minimum is also dropped, because an average of 1-2 people exposes their individual ratings.
- `is_feed_photo(path)`: a helper for the storage policy.

**Storage.**
- Bucket `review-photos`, private. Object path is `<report_id>/<random>.jpg`, with no user id in the path.
- Insert: allowed when the report belongs to `auth.uid()`, the type is `image/jpeg`, and the size is ≤ 1.5 MB (proposal).
- Select: allowed to the owner, or when `is_feed_photo(name)` is true. The app shows photos through signed URLs.

**On the device (D4d).**
- `createImageBitmap(file, {imageOrientation: 'from-image'})`, then a canvas of at most 1600 px, then `toBlob('image/jpeg', 0.85)`. Re-encoding drops every EXIF field, including GPS.
- Hebrew warning next to the picker: no prescriptions, receipts, faces or name labels. Next to the review text: no names, phone numbers or city.

**Pilot caveat.** In a group of 3-4 testers who know each other, opting in to show indication and dosage can identify the writer. The opt-in text should say so.

### 6.4 Open questions for Tomer

1. The exact lists for indication category, dosage band (for example the monthly grams on the licence) and licence category. For the licence, the survey's list (`ma-oved-lecha/index.html`, T22/C4 … T1/C22, other) is a candidate.
2. The definition of "similar": proposed as same indication category and same dosage band.
3. Should aggregates use all reports (with consent at sign-up) or only reviews published to the feed?
4. How the app imports the shared engine. Proposal: a sync script copies `reco-engine/engine/*.js` into `app/lib/engine/`, and a test fails if the copies differ. A `package.json` at the reco-engine root would break Stage 1 test S11, which forbids npm dependencies.
5. Moderation: who sets `hidden`, and how fast.
6. Photo limits: proposed 3 per review, 1600 px, ≤ 1.5 MB.

### 6.5 Build order (revised; replaces §4)

Nothing is started without Tomer's OK. Each step ends with a commit.

- **B0: decisions.** Done (§6.1). Open items are in §6.4.
- **S2: catalogue enrichment in reco-engine** (Step 1 brief §2, next).
  - Parents (both slots, as lists), Jane's named strain, and terpenes are carried from the raw Jane pages into the 215-product catalogue, with provenance and missing-value reasons.
  - This feeds B2.
- **B1: schema SQL per §6.3**, run by Tomer in the new EU project.
  - Tests: anon cannot select any table; user A cannot read user B's rows; `feed_page` returns only published, whitelisted fields; `similar_aggregates` returns nothing below the minimum; the storage policies hold.
- **B2: load `products_master`** from the enriched catalogue. The script outputs a file that Tomer uploads; no service key ever goes into a repo. Jane fields only.
- **B3: shared engine in reco-engine.**
  - Extract the mockup's knowledge tables and `predict`, `geneOf`, `score`, `explain` and `recommend` into a dependency-free module in `reco-engine/engine/`.
  - Rebuild the mockup from a template, the module and the product data.
  - Fixture test: the demo profile gets the same ranking as today, so this week's test results stay valid.
  - Then adapt the engine to the enriched fields: both parent slots as lists, Jane parent ids as canonical keys, Jane's strain in place of the Cannabiz origin, null terpene percentages.
  - A mockup built on the fresh catalogue is a new version with its own test round.
- **B4: app static export, minimum fixes, and deploy to Pages** (§6.2 list).
  - Also: `dir="rtl"`; a lazy Supabase client; onboarding asks flavours (G4) and the D4c categories; the profile becomes editable (G12); the similar tab calls `similar_aggregates()`.
  - Test: TEST_PLAN part ג.
- **B5: the app uses the shared engine; strain page** `/strain/?id=` with data fetched after login.
- **B6: community feed** (D4).
  - The report form gets two opt-in toggles, a photo picker with on-device re-encoding, and warnings. Add a feed page that reads only `feed_page()`, and a report-abuse button.
  - Tests: an image with GPS in its EXIF uploads with no EXIF segment; reviews that did not opt in are absent from the feed; context is absent without its opt-in; below the minimum, similar returns nothing.
- **B7: journal, and own reports feeding back into the score** (G8).
- **B8: doctor report, alerts, scheduled refresh, account deletion.** These use the server-side pieces from §6.2.

Minimum to unblock TEST_PLAN part ג: S2 → B1 → B2 → B4. Step numbers B1 and B2 keep the meaning TEST_PLAN ח2 and ח3 refer to.

---

## 7. Pilot build 2026-10-11 (branch `pilot-v1`)

This section records what was built and where it departs from §6. Where the two disagree, §7 is what the code does.

### 7.1 Tomer's decisions on 2026-10-11

| Question | Answer | Effect |
|---|---|---|
| Supabase project | The survey's project (`yernxedmokifcmpakzgd`, Sydney) for the pilot. | Replaces D1 (new EU project) for the pilot only. Every object is prefixed `mmh_`, so the survey's `responses` and `contacts` are untouched. Moving to an EU project later = run the same SQL there and change `lib/config.js`. |
| Sign-in | A nickname and a password, unique per patient, so a patient can continue on another phone. "Nickname taken" must be handled. | Replaces e-mail sign-in. See 7.2. |
| Scope | Card, purchase reports, feed, and the recommendation engine. | B4–B7 of §6.5 collapse into this one build. |
| Newer local version on the phone? | "Maybe, needs checking." | Everything here is on a branch; `main` is untouched. |

### 7.2 Departures from §6, and why

| §6 plan | What was built | Why |
|---|---|---|
| Supabase Auth (e-mail + password), own-row RLS | Own accounts table: nickname + bcrypt hash, random session token stored as a SHA-256 hash, 180-day sessions, lockout after 8 wrong passwords in 15 minutes. All access through `security definer` functions that take the token; tables have RLS on and no policies. | Supabase Auth needs an e-mail address, and hosted projects reject made-up addresses. Function-only access is also what D4a asked for, applied to everything. Cost: no self-service password reset (Tomer resets with `mmh_admin_reset_password`). |
| Photos in a private Storage bucket with signed URLs | Photos as JPEG bytes in the table `mmh_photos`, served by `mmh_photo()` to the writer, or to any signed-in patient once the review is published and not hidden. The server refuses anything that is not a whole JPEG, and any JPEG that still carries EXIF or XMP. Caps: 3 per review, 60 per patient. | Storage policies rely on Supabase Auth identities, which this build does not use. Also one SQL file is the whole setup. Fine at pilot scale (≤ 600 KB per photo, 3 per review); move to Storage with real Auth before a wide launch. |
| `similar_aggregates()` over all consenting users, minimum group 5 (D4e) | No aggregate over private data at all. The feed has a "patients like me" filter and `mmh_stats` has a `like_me` count, both built only from reviews whose writers chose to show their indication. | With a handful of pilot users the min-5 aggregate would always be empty. Using only what a writer already chose to show needs no minimum and leaks nothing new. |
| `products_master` columns | `mmh_products(id, data jsonb)`, loaded by `reco-engine/app/load_catalog.js` through `mmh_admin_load_catalog` with a key. | The loader runs from the phone with no dashboard upload; refreshing stock is one command. Catalogue stays out of this public repo and is readable by signed-in patients only (the §6.2 legal note). |
| Supabase Auth rate limits | Own limits, all in `mmh_settings`: 40 sign-ups an hour per network address and 300 in all; 8 wrong passwords in 15 minutes per nickname and address, 30 an hour per nickname; 20 wrong invite codes an hour per address; 30 new reviews a day per patient. Three flags hide a review only when they come from patients with a card and an account older than 12 hours; `mmh_admin_unhide` makes the decision final. | Found by the independent review on 2026-10-12 (one caller could block all sign-ups in 10 seconds; three throwaway accounts could hide any review). |
| Exact review vocabulary of the old app | The finalized review model: verdict like / unsure / dislike, 1–5 stars, "helped" and "bothered" lists, repeat-purchase counter. | It is the model decided after the mockup. |
| Purity filters (irradiation, pesticide, indoor) | Not built. | Jane's data has no such fields; the old flags came from Cannabiz. |
| Three-generation genetics | Parents from both Jane slots plus the named strain; a second generation is derived inside the catalogue where a parent strain is itself carried by another product (47 products today). | Grandparents were Cannabiz-derived. |

### 7.3 What the engine changed against the mockup

Same structure and weights (`.42 effect + .33 genetics + .15 direction + .10 taste`, verdict / repeat / budget boosts, sedation penalty). Changes, each answering a weakness Tomer listed on 2026-09-23: shared ancestors are weighted by rarity; a disliked strain lowers its relatives a little; the top of the list is spread across families; a product with no published terpenes gets a slightly-below-average effect score and says so, instead of zero; terpene order counts only when percentages are published; other patients' published verdicts add a small capped boost. Not done: any measurement of whether the ranking is right. That still needs the survey data and the pilot.

### 7.4 Status of the §2 flow map after this build

F1 consent and age gate: works. F2 sign up / sign in: works (nickname). F3 card: works, editable. F4 seed strains: works, optional. F5 recommendations: works. F6 similar patients: replaced by the "like me" filter (7.2). F7 strain page: works. F8 purchase → report: works. F9 review: works. F10 photos: works. F11 reviews visible to others: works (feed and strain page). F12 journal: works. F13 reports feed the ranking: works. F14 doctor report: works (print / save as PDF). F15 stock and price alerts: not built. F16 survey → engine: not built. F17 catalogue refresh: one command, manual.

### 7.5 Open before a wide launch

1. The written Cannabiz approval (G14). Until then the catalogue is shown to signed-in patients only.
2. A privacy notice a lawyer has read: the app stores health-related answers, in Sydney for now.
3. Real authentication with password recovery, photos in Storage, an EU project.
4. Moderation is manual: three flags from established accounts hide a review; Tomer puts it back with `mmh_admin_unhide` or leaves it hidden.
6. The network-address limits read the address the API gateway passes on (`cf-connecting-ip`, then `x-real-ip`, then `x-forwarded-for`). Which of these the hosted project forwards was not verified; if none, all callers share one bucket and the per-address limits act as global ones. A random invite code is the stronger gate.
5. The stock date is whatever the last load was; nothing refreshes it automatically.
