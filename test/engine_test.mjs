// Engine tests on a small made-up catalogue (no real product data in this repo).
//   node test/engine_test.mjs
import { recommend, buildContext, predict, terpsOf, geneOf, normTerp, buildTarget } from "../lib/engine/engine.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("  ok  ", name); } else { fail++; console.log("  FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); } };
const S = (id, he) => [{ id, he, en: id }];
const T = (...a) => a.map(x => Array.isArray(x) ? { i: x[0], he: x[0], p: x[1] } : { i: x, he: x, p: null });
const P = (id, o) => ({ id, he: o.he || id, en: id, cat: o.cat || "T22/C4", type: o.type || "flower", cls: o.cls || "hybrid",
  thc: "22", cbd: "4", price: o.price ?? 250, stock: o.stock ?? true, p1: o.p1 || null, p2: o.p2 || null, strain: o.strain || null, terps: o.terps || null });

const CAT = [
  P("night-a", { cls: "indica", terps: T("myrcene", "linalool", "caryophyllene"), p1: S("kush", "קוש"), p2: S("purple", "פרפל") }),
  P("night-b", { cls: "indica", terps: T("myrcene", "linalool"), p1: S("kush", "קוש"), p2: S("rare-x", "נדיר") }),
  P("night-c", { cls: "indica", terps: T("myrcene", "caryophyllene"), p1: S("other", "אחר") }),
  P("day-a",   { cls: "sativa", terps: T("limonene", "pinene", "terpinolene"), p1: S("haze", "הייז"), p2: S("lemon", "למון") }),
  P("day-b",   { cls: "sativa", terps: T("limonene", "pinene"), p1: S("haze", "הייז") }),
  P("no-terp-kin", { cls: "indica", p1: S("rare-x", "נדיר"), p2: S("purple", "פרפל") }),
  P("no-terp-none", { cls: "hybrid" }),
  P("pricey",  { cls: "indica", terps: T("myrcene", "linalool", "caryophyllene"), price: 480, p1: S("solo", "סולו") }),
  P("other-cat", { cls: "indica", cat: "T10/C10", terps: T("myrcene", "linalool") }),
  P("oil", { type: "oil", cls: "indica", terps: T("myrcene") }),
  P("gone", { cls: "indica", terps: T("myrcene", "linalool"), stock: false }),
  P("grandchild", { cls: "hybrid", p1: S("mid", "אמצע") }),
  P("mid-carrier", { cls: "hybrid", strain: { id: "mid", he: "אמצע" }, p1: S("root", "שורש") }),
  P("root-kid", { cls: "hybrid", p1: S("root", "שורש"), terps: T("humulene") }),
  ...Array.from({ length: 12 }, (_, i) => P("common-" + i, { cls: "hybrid", terps: T("humulene"), p1: S("common", "נפוץ") })),
  P("pct", { cls: "hybrid", terps: T(["pinene", 5], ["myrcene", 40], ["limonene", 20]) }),
];
const ctx = buildContext(CAT);
const night = { age: "35-44", uses: ["sleep", "pain"], times: ["night"], flavors: ["earthy"], license: ["T22/C4"] };
const day = { age: "25-34", uses: ["focus", "mood"], times: ["morning"], flavors: ["citrus"], license: ["T22/C4"] };
const top = (card, reviews, opts) => recommend(card, reviews, CAT, { ctx, ...opts }).rows;
const pos = (rows, id) => rows.findIndex(r => r.p.id === id);

console.log("knowledge and terpenes");
ok("Jane's terpene ids are understood", normTerp("caryophyllene") === "beta_caryophyllene" && normTerp("penchol") === "fenchol" && normTerp("unknown-x") === null);
ok("without percentages every terpene counts the same", terpsOf(CAT[0]).every(t => t.w === .7));
ok("with percentages the dominant terpene leads", terpsOf(CAT.at(-1))[0].k === "myrcene" && terpsOf(CAT.at(-1)).at(-1).k === "pinene");
ok("no terpenes means no prediction, flagged", predict(CAT[6]).noTerp === true && Object.values(predict(CAT[6]).e).every(v => v === 0));
ok("effects stay within 0..1", CAT.every(p => Object.values(predict(p).e).every(v => v >= 0 && v <= 1)));

console.log("who gets what");
const n0 = top(night, []);
ok("night patient: a night strain first", ["night-a", "night-b", "night-c", "pricey"].includes(n0[0].p.id), n0[0].p.id);
ok("night patient: day strains below night strains", pos(n0, "day-a") > pos(n0, "night-a") && pos(n0, "day-b") > pos(n0, "night-b"));
const d0 = top(day, []);
ok("day patient: a day strain first", ["day-a", "day-b"].includes(d0[0].p.id), d0[0].p.id);
ok("the two patients get different lists", n0[0].p.id !== d0[0].p.id);
ok("scores are 0..100", [...n0, ...d0].every(r => r.disp >= 0 && r.disp <= 100));

console.log("filters");
ok("other licence category hidden", pos(n0, "other-cat") === -1);
ok("shown when all categories are asked for", pos(top(night, [], { allCategories: true }), "other-cat") >= 0);
ok("licence 'other' shows everything", pos(top({ ...night, license: ["other"] }, []), "other-cat") >= 0);
ok("oils are not recommended", pos(n0, "oil") === -1);
ok("out of stock hidden", pos(n0, "gone") === -1);
const soft = top({ ...night, budget: 300 }, []);
ok("budget (soft): over-budget stays, marked and lower", pos(soft, "pricey") > pos(soft, "night-a") && soft[pos(soft, "pricey")].overBudget && soft[pos(soft, "pricey")].ex.C.some(c => c.includes("תקציב")));
ok("budget (hard): over-budget removed", pos(top({ ...night, budget: 300, budget_hard: true }, []), "pricey") === -1);

console.log("genetics");
ok("second generation is derived inside the catalogue", geneOf(ctx, CAT.find(p => p.id === "grandchild")).far.has("root"));
const liked = [{ product_id: "night-b", verdict: "like", helped: ["sleep"], bothered: [], buys: 1 }];
const n1 = top(night, liked);
const kin = n1[pos(n1, "no-terp-kin")], none = n1[pos(n1, "no-terp-none")];
ok("a liked strain lifts its relatives", kin.gen > 0 && pos(n1, "no-terp-kin") < pos(n0, "no-terp-kin"), { gen: kin.gen });
ok("the reason names the shared parent and the liked strain", kin.ex.R.some(r => r.t.includes("נדיר") && r.t.includes("night-b")), kin.ex.R);
ok("no relation, no genetics score", none.gen === 0);
const lc = top(night, [{ product_id: "common-0", verdict: "like", helped: [], bothered: [], buys: 1 }]);
ok("a parent shared by many products counts less than a rare one", lc[pos(lc, "common-1")].gen < n1[pos(n1, "no-terp-kin")].gen, [lc[pos(lc, "common-1")].gen, kin.gen]);
const lg = top(night, [{ product_id: "grandchild", verdict: "like", helped: [], bothered: [], buys: 1 }]);
ok("far relatives count, less than close ones", lg[pos(lg, "root-kid")].gen > 0 && lg[pos(lg, "root-kid")].gen < lg[pos(lg, "mid-carrier")].gen);

console.log("missing data");
ok("no terpenes: said out loud", none.noTerp && none.ex.C.some(c => c.includes("לא פורסמו טרפנים")));
ok("no terpenes: not thrown to the bottom", pos(n1, "no-terp-kin") < pos(n1, "day-a"));

console.log("the patient's own reports");
const st = top(night, liked);
ok("liked strain is marked and kept", st[pos(st, "night-b")].status === "like" && st[pos(st, "night-b")].ex.R[0].tier === "U");
const dis = top(night, [{ product_id: "night-a", verdict: "dislike", helped: [], bothered: ["anxiety"], buys: 1 }]);
ok("disliked strain drops", pos(dis, "night-a") > pos(n0, "night-a") + 5 && dis[pos(dis, "night-a")].status === "dislike");
ok("its relatives drop a little too", dis[pos(dis, "night-b")].raw < n0[pos(n0, "night-b")].raw);
const rep = top(night, [{ ...liked[0], buys: 3 }]);
ok("buying again strengthens", rep[pos(rep, "night-b")].raw > st[pos(st, "night-b")].raw && rep[pos(rep, "night-b")].ex.R.some(r => r.t.includes("3")));
const sed = buildTarget({ ...night, avoid: ["daysleep"] }, [{ product_id: "night-a", verdict: "unsure", helped: [], bothered: ["sedation"], buys: 1 }], ctx);
ok("'too sleepy' is remembered", sed.av.sedation > 1);
ok("pending purchase has its own status", top(night, [{ product_id: "day-a", verdict: null, helped: [], bothered: [], buys: 1 }]).find(r => r.p.id === "day-a").status === "pending");

console.log("community");
const comm = top(night, [], { stats: { "night-c": { like: 3, dislike: 0, like_me: 2 }, "night-a": { like: 0, dislike: 4, like_me: 0 } } });
ok("community likes lift a little", comm[pos(comm, "night-c")].raw > n0[pos(n0, "night-c")].raw && comm[pos(comm, "night-c")].ex.R.some(r => r.tier === "K"));
ok("the lift is capped", comm[pos(comm, "night-c")].comm <= .08);
ok("community dislikes are shown as a caution", comm[pos(comm, "night-a")].ex.C.some(c => c.includes("4")));

console.log("spread and safety");
const fam = top({ ...night, uses: ["pain"] }, [{ product_id: "common-0", verdict: "like", helped: [], bothered: [], buys: 1 }]);
const firstTen = fam.filter(r => r.status === "new").slice(0, 10).filter(r => r.p.id.startsWith("common-")).length;
ok("one family does not fill the top ten", firstTen < 10, firstTen);
ok("beginner gets the start-low note", top({ ...night, years: "<1" }, [])[0].ex.G.some(c => c.includes("מינון נמוך")));
ok("anxiety-sensitive gets the caution", top({ ...day, avoid: ["anxiety"] }, [])[0].ex.G.some(c => c.includes("חרדה")));
ok("empty card does not crash", Array.isArray(top({}, []) ) && Array.isArray(top(null, null)));
ok("same input, same order", JSON.stringify(top(night, liked).map(r => r.p.id)) === JSON.stringify(top(night, liked).map(r => r.p.id)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
