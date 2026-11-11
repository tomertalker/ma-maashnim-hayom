# Tests

Three layers. The first runs anywhere; the other two need a local Postgres.

| What | Command | Needs |
|---|---|---|
| Recommendation engine, on a made-up catalogue | `node test/engine_test.mjs` | Node only |
| Backend functions, access rules, abuse limits and review approval (202 checks) | `node test/db_test.mjs` | local Postgres + `local_api.mjs` |
| The whole app on a phone-sized browser, two patients and the admin page (76 checks) | `node test/e2e.mjs` | the above + built app + Playwright |

## Local stack

```sh
# 1. a Postgres 16 database called mmh on port 54329, then:
psql -p 54329 -U postgres -d mmh -f test/db_bootstrap.sql      # the roles Supabase already has
psql -p 54329 -U postgres -d mmh -f supabase/pilot_schema.sql

# 2. stand-in for the Supabase REST gateway (runs every call as the anon role)
npm i --no-save pg && node test/local_api.mjs &                 # http://127.0.0.1:54330

# 3. backend tests
node test/db_test.mjs

# 4. end to end: build against the local API, serve, load a catalogue, run
NEXT_PUBLIC_MMH_API_URL=http://127.0.0.1:54330 npm run build
(cd out && python3 -m http.server 54340 --bind 127.0.0.1 &)
#    catalogue: in reco-engine, with the key set by  select mmh_admin_set_key('...');
#    MMH_API_URL=http://127.0.0.1:54330 MMH_ADMIN_KEY=... node app/load_catalog.js
PHOTO=/path/to/a-photo-with-gps.jpg node test/e2e.mjs           # screenshots land in /tmp/mmh-shots
```

Without the private catalogue, `MMH_ADMIN_KEY=<key> node test/fake_catalog.mjs` loads 120 made-up products shaped like the real ones
(Lakota, RS11 and Tamskal keep their names because `e2e.mjs` looks for them). To use an installed Chrome instead of a Playwright
download: `CHROME=/usr/bin/google-chrome PLAYWRIGHT_DIR=<dir with playwright in node_modules>/ node test/e2e.mjs`.

`db_test.mjs` runs everything with review approval off and then tests approval on its own. `e2e.mjs` runs with approval on and
approves the reports on `/admin/` the way Tomer would.

`e2e.mjs` checks, among other things, that a photo carrying EXIF and GPS is stored without them,
that the feed never shows a nickname or an exact date, and that a private report stays private.

The real product catalogue is not in this repository (it lives in the private `reco-engine`
repo and in the database), so `engine_test.mjs` uses invented products.
