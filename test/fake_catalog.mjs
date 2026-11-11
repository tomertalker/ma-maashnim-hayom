// A made-up catalogue for the local stack, shaped like the real one, so the
// end-to-end run works without the private reco-engine repo. Real strain names
// used by e2e.mjs (Lakota, RS11, Tamskal) are kept; everything else is invented.
//   MMH_ADMIN_KEY=... node test/fake_catalog.mjs      (API_URL defaults to the local stand-in)
const API = process.env.API_URL || "http://127.0.0.1:54330";
const KEY = process.env.MMH_ADMIN_KEY;
if (!KEY) { console.log("set MMH_ADMIN_KEY (the key given to mmh_admin_set_key)"); process.exit(2); }

const TERPS = [["myrcene", "מירצן"], ["limonene", "לימונן"], ["beta_caryophyllene", "קריופילן"], ["pinene", "פינן"], ["linalool", "לינאלול"],
  ["humulene", "הומולן"], ["terpinolene", "טרפינולן"], ["ocimene", "אוסימן"], ["bisabolol", "ביסבולול"], ["farnesene", "פרנסן"]];
const PARENTS = Array.from({ length: 24 }, (_, i) => ({ id: "par" + i, he: "הורה " + (i + 1), en: "Parent " + (i + 1) }));
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const CLS = ["indica", "sativa", "hybrid"];

function product(id, he, en, extra = {}) {
  const n = 2 + Math.floor(rnd() * 3), used = new Set(), terps = [];
  while (terps.length < n) { const t = pick(TERPS); if (used.has(t[0])) continue; used.add(t[0]); terps.push({ i: t[0], he: t[1], p: Math.round((0.2 + rnd() * 1.4) * 100) / 100 }); }
  return { id, he, en, cat: rnd() < 0.85 ? "T22/C4" : "T18/C3", type: "flower", cls: pick(CLS), price: 200 + 10 * Math.floor(rnd() * 20),
    thc: 20, grower: "מגדל " + (1 + Math.floor(rnd() * 6)), country: pick(["IL", "CA", "PT"]),
    p1: [pick(PARENTS)], p2: [pick(PARENTS)], strain: null, terps: rnd() < 0.1 ? null : terps, stock: true, ...extra };
}
const products = [
  product("lakota", "לקוטה", "Lakota", { cat: "T22/C4", p1: [PARENTS[0]], p2: [PARENTS[1]] }),
  product("rs11", "אר אס 11", "RS11", { cat: "T22/C4", p1: [PARENTS[1]], p2: [PARENTS[2]] }),
  product("tamskal", "טמסקל", "Tamskal", { cat: "T22/C4" }),
];
for (let i = 1; products.length < 120; i++) products.push(product("fake" + i, "זן בדיקה " + i, "Test Strain " + i));

const r = await fetch(`${API}/rest/v1/rpc/mmh_admin_load_catalog`, { method: "POST", headers: { apikey: "test", "Content-Type": "application/json" },
  body: JSON.stringify({ p_key: KEY, p_products: products, p_fetched_at: "2026-09-24T09:00:00Z" }) });
console.log("loaded:", JSON.stringify(await r.json()));
