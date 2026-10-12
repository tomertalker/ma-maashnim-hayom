// Recommendation engine for "מה מעשנים היום". Plain JavaScript, no dependencies,
// runs in the browser and in Node. Ported from the engine inside
// app-mockup-full.html (same knowledge table, same weights:
// .42 effect + .33 genetics + .15 direction + .10 taste, plus small boosts).
//
// What changed against the mockup, and why:
//   * Genetics come from Jane's fields only: both parent slots and the named
//     strain. A second generation is derived inside the catalogue itself (the
//     parents of a parent strain, when another product carries that strain).
//   * A shared ancestor counts less the more products have it, so a parent that
//     appears in dozens of products no longer dominates the ranking.
//   * A disliked strain lowers its relatives a little, not only itself.
//   * A product with no published terpenes gets a slightly-below-average effect
//     score instead of zero, and says so. Missing data is not treated as bad.
//   * Terpene order is used only when percentages are published.
//   * The top of the list is spread across genetic families.
//   * Purity filters are gone: Jane's data has no irradiation / pesticide flags.
//
// Product shape (built by the loader in reco-engine):
//   { id, he, en, cat, type, cls, price, p1:[{id,he,en}], p2:[...],
//     strain:{id,he}|null, terps:[{i,he,p}]|null, ... }

export const EFFS = ["pain_relief", "sleep", "relaxation", "anti_anxiety", "mood_uplift",
  "energy_focus", "appetite", "anti_inflammatory", "appetite_suppress"];

export const EL = { pain_relief: "הקלה בכאב", sleep: "שינה", relaxation: "רגיעה",
  anti_anxiety: "הפחתת חרדה", mood_uplift: "מצב רוח", energy_focus: "אנרגיה ופוקוס",
  appetite: "תיאבון", anti_inflammatory: "אנטי-דלקתי", appetite_suppress: "דיכוי תיאבון" };

// Evidence tiers. No terpene effect here is "A": the link between a terpene
// profile and a clinical effect is weak, and the app says so next to each reason.
export const TIER = { A: "מבוסס", B: "ראשוני", C: "אנקדוטלי", U: "הדיווח שלך", K: "קהילה" };

export const TERP = {
  myrcene:            { he: "מירצן",     fl: ["earthy"],           e: { sleep: [.5, "B"], relaxation: [.5, "B"], pain_relief: [.3, "C"] } },
  limonene:           { he: "לימונן",    fl: ["citrus"],           e: { mood_uplift: [.6, "B"], anti_anxiety: [.4, "C"], energy_focus: [.2, "C"] } },
  beta_caryophyllene: { he: "קריופילן",  fl: ["spicy"],            e: { pain_relief: [.5, "B"], anti_inflammatory: [.5, "B"], relaxation: [.3, "C"] } },
  pinene:             { he: "פינן",      fl: ["pine"],             e: { energy_focus: [.5, "C"], anti_inflammatory: [.2, "C"] } },
  linalool:           { he: "לינאלול",   fl: ["floral"],           e: { sleep: [.5, "C"], anti_anxiety: [.5, "C"], relaxation: [.5, "C"] } },
  humulene:           { he: "הומולן",    fl: ["earthy"],           e: { anti_inflammatory: [.3, "C"], appetite_suppress: [.3, "C"] } },
  terpinolene:        { he: "טרפינולן",  fl: ["citrus", "floral"], e: { mood_uplift: [.4, "C"], energy_focus: [.4, "C"] } },
  ocimene:            { he: "אוסימן",    fl: ["citrus", "sweet"],  e: { energy_focus: [.3, "C"], mood_uplift: [.2, "C"] } },
  bisabolol:          { he: "ביסבולול",  fl: ["floral"],           e: { anti_inflammatory: [.3, "C"], anti_anxiety: [.2, "C"] } },
  farnesene:          { he: "פרנסן",     fl: ["sweet"],            e: { relaxation: [.2, "C"] } },
  terpineol:          { he: "טרפינאול",  fl: ["floral"],           e: { relaxation: [.3, "C"] } },
  nerolidol:          { he: "נרולידול",  fl: ["floral"],           e: { sleep: [.3, "C"], relaxation: [.2, "C"] } },
  fenchol:            { he: "פנצ'ול",    fl: ["earthy"],           e: {} },
  selinene:           { he: "סלינן",     fl: [],                   e: {} },
  germacrene:         { he: "גרמקרן",    fl: ["spicy"],            e: {} },
  guaiol:             { he: "גוואיול",   fl: ["pine"],             e: {} },
  cymene:             { he: "צימן",      fl: [],                   e: {} },
};
const TALIAS = { caryophyllene: "beta_caryophyllene", penchol: "fenchol", selina: "selinene" };

export const FLAV_HE = { citrus: "הדרי", pine: "אורן", earthy: "אדמתי", floral: "פרחוני", spicy: "חריף", sweet: "מתוק" };

// what the patient uses cannabis for (card) -> wanted effects
const USE_EFF = {
  pain:     { pain_relief: 1, anti_inflammatory: .4 },
  sleep:    { sleep: 1 },
  anxiety:  { anti_anxiety: 1, relaxation: .3 },
  ptsd:     { anti_anxiety: .8, sleep: .5, relaxation: .4 },
  mood:     { mood_uplift: 1 },
  calm:     { relaxation: 1 },
  appetite: { appetite: 1 },
  nausea:   {},
  focus:    { energy_focus: 1 },
};
// "what helped" in a review -> effect
const HELP_EFF = { pain: "pain_relief", sleep: "sleep", anxiety: "anti_anxiety", relaxation: "relaxation",
  mood: "mood_uplift", focus: "energy_focus", appetite: "appetite" };

const NIGHT = new Set(["sleep", "relaxation", "pain_relief"]);
const DAY = new Set(["energy_focus", "mood_uplift"]);

const c01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

export function normTerp(id) {
  if (!id) return null;
  let t = String(id).toLowerCase();
  if (TALIAS[t]) t = TALIAS[t];
  return TERP[t] ? t : null;
}

// [{k, w}] ordered by weight. With published percentages the dominant terpene
// counts most; without them the listed order means nothing, so all count the same.
export function terpsOf(p) {
  const list = (p.terps || []).map(t => ({ k: normTerp(t.i), p: typeof t.p === "number" && t.p > 0 ? t.p : null }))
    .filter(t => t.k);
  if (!list.length) return [];
  const withPct = list.filter(t => t.p != null);
  if (withPct.length >= 2) {
    const max = Math.max(...withPct.map(t => t.p));
    return list.map(t => ({ k: t.k, w: t.p != null ? .45 + .55 * (t.p / max) : .45 })).sort((a, b) => b.w - a.w);
  }
  return list.map(t => ({ k: t.k, w: .7 }));
}
export const hasTerps = p => terpsOf(p).length > 0;

export function predict(p) {
  const e = Object.fromEntries(EFFS.map(d => [d, 0])), con = {}, bt = {}, rk = { A: 3, B: 2, C: 1 };
  for (const { k, w: tw } of terpsOf(p)) {
    const d = TERP[k];
    for (const [eff, [w, tier]] of Object.entries(d.e)) {
      const x = w * tw;
      e[eff] += x;
      if (!con[eff] || x > con[eff].w) con[eff] = { src: d.he, w: x };
      if (!bt[eff] || rk[tier] > rk[bt[eff]]) bt[eff] = tier;
    }
  }
  for (const d of EFFS) e[d] = c01(e[d]);
  return { e, con, bt, noTerp: !hasTerps(p) };
}

// ---------------------------------------------------------------- genetics --

const ids = arr => (arr || []).map(x => x && x.id).filter(Boolean);

// One pass over the catalogue: strain -> its parents (when a product carries
// that strain), token -> how many products have it, token -> Hebrew name.
export function buildContext(products) {
  const strainParents = new Map(), names = new Map(), byId = new Map();
  for (const p of products) {
    byId.set(p.id, p);
    for (const s of [...(p.p1 || []), ...(p.p2 || [])]) if (s && s.id && !names.has(s.id)) names.set(s.id, s.he || s.en || s.id);
    if (p.strain && p.strain.id) {
      if (!names.has(p.strain.id)) names.set(p.strain.id, p.strain.he || p.strain.id);
      const par = [...ids(p.p1), ...ids(p.p2)];
      if (par.length) {
        const set = strainParents.get(p.strain.id) || new Set();
        par.forEach(x => set.add(x));
        strainParents.set(p.strain.id, set);
      }
    }
  }
  const genes = new Map(), df = new Map();
  for (const p of products) {
    const close = new Set([...ids(p.p1), ...ids(p.p2)]);
    if (p.strain && p.strain.id) close.add(p.strain.id);
    const far = new Set();
    for (const par of [...ids(p.p1), ...ids(p.p2)]) {
      for (const g of strainParents.get(par) || []) if (!close.has(g)) far.add(g);
    }
    genes.set(p.id, { close, far });
    for (const t of new Set([...close, ...far])) df.set(t, (df.get(t) || 0) + 1);
  }
  // average effect score across products that publish terpenes: the stand-in
  // for products that do not
  let n = 0; const avg = Object.fromEntries(EFFS.map(d => [d, 0]));
  for (const p of products) if (hasTerps(p)) { const pr = predict(p); for (const d of EFFS) avg[d] += pr.e[d]; n++; }
  if (n) for (const d of EFFS) avg[d] /= n;
  return { byId, genes, df, names, avgEff: avg, nTerp: n };
}

// a token shared by 2 products is worth 1; by 8, .5; by 27, about .27
const rarity = (ctx, t) => Math.min(1, Math.sqrt(2 / Math.max(2, ctx.df.get(t) || 2)));
export const geneOf = (ctx, p) => ctx.genes.get(p.id) || { close: new Set(), far: new Set() };
export const geneName = (ctx, t) => ctx.names.get(t) || t;

// ------------------------------------------------------------------ target --

export function dayNight(wants, times) {
  let n = 0, d = 0;
  for (const g of wants) { if (NIGHT.has(g)) n++; if (DAY.has(g)) d++; }
  for (const t of times || []) { if (t === "evening" || t === "night") n++; if (t === "morning" || t === "noon") d++; }
  return (n + d) === 0 ? 0 : (d - n) / (d + n);
}

// card: {uses, times, flavors, avoid, budget, budget_hard, years, license}
// reviews: [{product_id, verdict, helped, bothered, buys}]
export function buildTarget(card, reviews, ctx) {
  card = card || {}; reviews = reviews || [];
  const des = Object.fromEntries(EFFS.map(d => [d, 0]));
  const wants = new Set();
  for (const u of card.uses || []) for (const [eff, w] of Object.entries(USE_EFF[u] || {})) { des[eff] += w; if (w >= .8) wants.add(eff); }

  const verdicts = {}, repeats = {};
  const liked = [], disliked = [];
  for (const r of reviews) {
    if (!r.product_id) continue;
    if (r.verdict) verdicts[r.product_id] = r.verdict;
    repeats[r.product_id] = r.buys || 1;
    const p = ctx.byId.get(r.product_id);
    if (!p) continue;
    if (r.verdict === "like") liked.push(p);
    if (r.verdict === "dislike") disliked.push(p);
  }

  // what the liked strains have in common, by their terpenes
  const avg = Object.fromEntries(EFFS.map(d => [d, 0])); let n = 0;
  for (const sp of liked) { if (!hasTerps(sp)) continue; const pr = predict(sp); for (const d of EFFS) avg[d] += pr.e[d]; n++; }
  if (n) for (const d of EFFS) des[d] += .5 * (avg[d] / n);

  const av = { sedation: 0, anxiety: 0 };
  for (const r of reviews) {
    const w = r.verdict === "like" ? 1 : r.verdict === "dislike" ? .4 : .7;
    for (const k of r.helped || []) if (HELP_EFF[k]) des[HELP_EFF[k]] += .7 * w;
    for (const k of r.bothered || []) {
      if (k === "sedation" || k === "fog") av.sedation += k === "sedation" ? 1 : .5;
      if (k === "anxiety" || k === "racing_heart") { av.anxiety += 1; des.anti_anxiety += .6; }
    }
  }
  for (const k of card.avoid || []) {
    if (k === "daysleep") av.sedation += (card.uses || []).includes("sleep") ? .5 : 1;
    if (k === "fog") av.sedation += .5;
    if (k === "anxiety" || k === "racing") { av.anxiety += 1; des.anti_anxiety += .6; }
  }
  const mx = Math.max(0, ...Object.values(des));
  if (mx > 0) for (const d in des) des[d] /= mx;

  // ancestors of liked strains (close / far), and of disliked ones
  const likeClose = new Map(), likeFar = new Map(), badTokens = new Set();
  for (const sp of liked) {
    const g = geneOf(ctx, sp);
    for (const t of g.close) if (!likeClose.has(t)) likeClose.set(t, sp);
    for (const t of g.far) if (!likeFar.has(t)) likeFar.set(t, sp);
  }
  for (const sp of disliked) for (const t of geneOf(ctx, sp).close) if (!likeClose.has(t)) badTokens.add(t);

  return { des, wants: [...wants], likeClose, likeFar, badTokens, lean: dayNight([...wants], card.times),
    flavors: card.flavors || [], budget: card.budget || null, verdicts, repeats, av,
    beginner: card.years === "<1", nLiked: liked.length };
}

// ------------------------------------------------------------------- score --

export function geneScore(ctx, p, t) {
  const g = geneOf(ctx, p); let sc = 0, best = null;
  const hit = (tok, w, gen, via) => { const x = w * rarity(ctx, tok); sc += x; if (!best || x > best.x) best = { tok, x, gen, via }; };
  for (const tok of g.close) {
    if (t.likeClose.has(tok)) hit(tok, 1, "close", t.likeClose.get(tok));
    else if (t.likeFar.has(tok)) hit(tok, .5, "far", t.likeFar.get(tok));
  }
  for (const tok of g.far) {
    if (t.likeClose.has(tok)) hit(tok, .5, "far", t.likeClose.get(tok));
    else if (t.likeFar.has(tok)) hit(tok, .25, "far", t.likeFar.get(tok));
  }
  let bad = 0; for (const tok of g.close) if (t.badTokens.has(tok)) bad += rarity(ctx, tok);
  return { score: c01(sc / 1.5), shared: best && best.tok, sharedGen: best && best.gen, via: best && best.via, bad };
}

export function dirScore(p, lean) {
  const c = p.cls === "indica" ? -1 : p.cls === "sativa" ? 1 : 0;
  return lean === 0 ? .5 : c01(1 - Math.abs(lean - c) / 2);
}

export function tasteOf(p, flavors) {
  if (!flavors || !flavors.length) return 0;
  const s = new Set(); for (const { k } of terpsOf(p)) for (const f of TERP[k].fl) s.add(f);
  let h = 0; for (const f of flavors) if (s.has(f)) h++;
  return c01(h / flavors.length);
}

// stats: {like, dislike, like_me} from other patients' published reviews
export function score(ctx, p, t, stats) {
  const pr = predict(p);
  let eff;
  if (pr.noTerp) {
    // unknown, not bad: a little under the catalogue average for what this patient wants
    let nu = 0, de = 0; for (const d of EFFS) { nu += t.des[d] * ctx.avgEff[d]; de += t.des[d]; }
    eff = de > 0 ? c01(nu / de) * .8 : 0;
  } else {
    let nu = 0, de = 0; for (const d of EFFS) { nu += t.des[d] * pr.e[d]; de += t.des[d]; }
    eff = de > 0 ? c01(nu / de) : 0;
  }
  const gen = geneScore(ctx, p, t);
  const dir = dirScore(p, t.lean);
  const taste = tasteOf(p, t.flavors);

  let budgetB = 0; if (t.budget && p.price) budgetB = p.price <= t.budget ? .03 : -.06;
  const v = t.verdicts[p.id]; let vB = 0; if (v === "like") vB = .12; else if (v === "dislike") vB = -.5;
  const rep = t.repeats[p.id] || 0; const repB = rep > 1 ? Math.min(.12, (rep - 1) * .04) : 0;
  const sedPen = t.av.sedation > 0 ? Math.min(.12, t.av.sedation * .05) * (pr.noTerp ? ctx.avgEff.sleep : pr.e.sleep) : 0;
  const anxPen = t.av.anxiety > 0 && p.cls === "sativa" ? Math.min(.06, t.av.anxiety * .03) : 0;
  const badPen = Math.min(.15, gen.bad * .08);
  let comm = 0;
  if (stats) comm = Math.max(-.05, Math.min(.08, ((stats.like || 0) - (stats.dislike || 0)) * .015 + (stats.like_me || 0) * .02));

  const raw = .42 * eff + .33 * gen.score + .15 * dir + .10 * taste + budgetB + vB + repB + comm - sedPen - anxPen - badPen;
  // without liked strains the genetics part cannot score, so the scale is shorter
  const top = t.nLiked ? .90 : .67;
  return { disp: Math.round(c01(raw / top) * 100), raw, eff, gen: gen.score, shared: gen.shared, sharedGen: gen.sharedGen,
    via: gen.via, bad: gen.bad, dir, taste, noTerp: pr.noTerp, verdict: v || null, repeat: rep, comm, pr,
    overBudget: !!(t.budget && p.price && p.price > t.budget) };
}

export function explain(ctx, p, sc, t, stats) {
  const R = [], pr = sc.pr;
  if (sc.verdict === "like") R.push({ tier: "U", t: "סימנת שאהבת" });
  if (sc.repeat > 1) R.push({ tier: "U", t: `קנית ${sc.repeat} פעמים` });
  const want = EFFS.filter(d => t.des[d] > .25).sort((a, b) => t.des[b] - t.des[a]);
  let n = 0;
  for (const d of want) {
    if (pr.e[d] > .25 && pr.con[d]) { R.push({ tier: pr.bt[d], t: `יש בו ${pr.con[d].src}, שמקושר ל${EL[d]}` }); if (++n >= 2) break; }
  }
  if (sc.shared && sc.via && sc.via.id !== p.id) {
    const nm = geneName(ctx, sc.shared);
    const own = p.strain && p.strain.id === sc.shared, theirs = sc.via.strain && sc.via.strain.id === sc.shared;
    R.push({ tier: "B", t: own && !theirs ? `זן האב (${nm}) של ${sc.via.he}, שאהבת`
      : theirs && !own ? `צאצא של ${nm}, כמו ${sc.via.he} שאהבת`
      : sc.sharedGen === "close" ? `הורה משותף (${nm}) עם ${sc.via.he}, שאהבת`
      : `קרבה גנטית רחוקה (${nm}) ל${sc.via.he}, שאהבת` });
  }
  if (stats && (stats.like || 0) > 0) {
    R.push({ tier: "K", t: stats.like_me ? `${stats.like_me} מטופלים עם התוויה דומה המליצו` : `${stats.like} מטופלים המליצו` });
  }
  if (p.cls !== "hybrid" && Math.abs(t.lean) > .2) {
    const fit = (t.lean < 0 && p.cls === "indica") || (t.lean > 0 && p.cls === "sativa");
    if (fit) R.push({ tier: "C", t: p.cls === "indica" ? "אינדיקה, מתאים לכיוון של ערב ורגיעה" : "סאטיבה, מתאים לכיוון של יום ואנרגיה" });
  }
  if (sc.taste > .5 && t.flavors.length) {
    const s = new Set(); for (const { k } of terpsOf(p)) for (const f of TERP[k].fl) s.add(f);
    R.push({ tier: "C", t: `טעם שביקשת (${t.flavors.filter(f => s.has(f)).map(f => FLAV_HE[f]).join(", ")})` });
  }
  const C = [];
  if (sc.noTerp) C.push("לא פורסמו טרפנים למוצר הזה. הדירוג נשען על גנטיקה וכיוון בלבד.");
  if (sc.bad >= .7) C.push("קרוב גנטית לזן שסימנת שלא התאים לך.");
  if (sc.overBudget) C.push(`מעל התקציב שהגדרת (${p.price} ₪).`);
  if (stats && (stats.dislike || 0) > (stats.like || 0)) C.push(`${stats.dislike} מטופלים דיווחו שלא התאים להם.`);
  // G: cautions that hold for every high-THC product; the list shows them once
  const G = [], thc = Number(p.thc);
  if (t.beginner && thc >= 18) G.push("עתיר THC. בתחילת הדרך מתחילים במינון נמוך, בתיאום עם הרופא המטפל.");
  else if (t.av.anxiety > 0 && thc >= 18) G.push("עתיר THC. אם יש לך רגישות לחרדה, כדאי להתחיל בזהירות.");
  return { R: R.slice(0, 4), C, G };
}

// ------------------------------------------------------------ recommend -----

const familyOf = (ctx, p) => {
  let best = null, bestDf = Infinity;
  for (const tok of geneOf(ctx, p).close) { const d = ctx.df.get(tok) || 1; if (d > 1 && d < bestDf) { best = tok; bestDf = d; } }
  return best;
};

// opts: { stats: {id:{like,dislike,like_me}}, allCategories, budgetHard, types }
// Returns every eligible product, scored, best first:
//   { p, disp, eff, gen, dir, taste, ex:{R,C}, status }   status: new|like|unsure|dislike|pending
export function recommend(card, reviews, products, opts = {}) {
  const ctx = opts.ctx || buildContext(products);
  const t = buildTarget(card, reviews, ctx);
  const types = opts.types || ["flower", "preroll"];
  const lic = (card && card.license) || [];
  const catOk = p => opts.allCategories || !lic.length || lic.includes("other") || lic.includes(p.cat);
  const hard = opts.budgetHard ?? !!(card && card.budget_hard);
  const reviewed = new Map((reviews || []).filter(r => r.product_id).map(r => [r.product_id, r]));

  const rows = products
    .filter(p => types.includes(p.type) && p.stock !== false && catOk(p))
    .filter(p => !(hard && t.budget && p.price && p.price > t.budget))
    .map(p => {
      const st = opts.stats && opts.stats[p.id];
      const sc = score(ctx, p, t, st);
      const r = reviewed.get(p.id);
      const status = !r ? "new" : r.verdict || "pending";
      return { p, ...sc, ex: explain(ctx, p, sc, t, st), status, stats: st || null };
    })
    .sort((a, b) => b.raw - a.raw || a.p.he.localeCompare(b.p.he, "he"));

  // spread genetic families near the top: the third and later members of one
  // family step down a little each
  const seen = new Map();
  for (const r of rows) {
    const f = familyOf(ctx, r.p);
    const k = f ? (seen.get(f) || 0) : 0;
    if (f) seen.set(f, k + 1);
    r.rank = r.raw - (k >= 2 ? Math.min(.09, (k - 1) * .03) : 0);
  }
  rows.sort((a, b) => b.rank - a.rank || a.p.he.localeCompare(b.p.he, "he"));
  return { rows, target: t, ctx };
}

// "why not higher": the four parts, for the bars on the strain page
export const PARTS = [["eff", "השפעה (טרפנים)", .42], ["gen", "גנטיקה", .33], ["dir", "כיוון", .15], ["taste", "טעם", .10]];
