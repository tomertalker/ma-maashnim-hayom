"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

function splitCsv(s) {
  return (s || "").split(",").map(x => x.trim()).filter(Boolean);
}

function scoreTaste(productTerpenes, preferredFlavors) {
  // mapping flavor->terpenes proxies (MVP)
  const map = {
    citrus: ["limonene", "terpinolene", "ocimene"],
    pine: ["alpha_pinene", "beta_pinene", "pinene_unspecified", "eucalyptol"],
    earthy: ["myrcene", "humulene"],
    gassy: ["beta_caryophyllene", "caryophyllene_unspecified"],
    floral: ["linalool", "geraniol", "bisabolol"],
    spicy: ["beta_caryophyllene", "caryophyllene_unspecified", "humulene"]
  };

  const ters = new Set(splitCsv(productTerpenes));
  let score = 0;
  for (const f of preferredFlavors) {
    const targets = map[f] || [];
    if (targets.some(t => ters.has(t))) score += 1;
  }
  return score;
}

function scoreGenetic(product, seedParentsSet) {
  const p = new Set([product.parent1_canon, product.parent2_canon].filter(Boolean));
  let overlap = 0;
  for (const x of p) if (seedParentsSet.has(x)) overlap += 1;
  return overlap;
}

export default function Recommendations() {
  const router = useRouter();

  const [tab, setTab] = useState("personal");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [reportsBySimilar, setReportsBySimilar] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  useEffect(() => {
    async function load() {
      if (!session) return;

      const p1 = await supabase
        .from("users_profile")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (p1.error) {
        setMsg("לא נמצא פרופיל. מלא שאלון היכרות קודם.");
        return;
      }
      setProfile(p1.data);

      const p2 = await supabase
        .from("products_master")
        .select("strain_id,name_he,name_en,t_category,c_category,parent1_canon,parent2_canon,terpenes")
        .order("internal_product_id", { ascending: true });

      if (!p2.error) setProducts(p2.data || []);
    }
    load();
  }, [session]);

  const personalRecs = useMemo(() => {
    if (!profile || products.length === 0) return [];

    const liked = profile.liked_strains || [];
    const flavorTags = splitCsv(profile.preferred_flavor_tags);
    const earthyTol = profile.earthy_tolerance || "";

    // build seed parents set
    const seedIds = new Set(liked.map(x => x.strain_id));
    const seedParentsSet = new Set();
    const seedRows = products.filter(p => seedIds.has(p.strain_id));
    for (const s of seedRows) {
      if (s.parent1_canon) seedParentsSet.add(s.parent1_canon);
      if (s.parent2_canon) seedParentsSet.add(s.parent2_canon);
    }

    const scored = products
      .filter(p => !seedIds.has(p.strain_id))
      .map(p => {
        const g = scoreGenetic(p, seedParentsSet);
        const t = scoreTaste(p.terpenes, flavorTags);

        const earthyPenalty =
          earthyTol === "avoid_strong" && splitCsv(p.terpenes).some(x => ["myrcene", "humulene"].includes(x))
            ? 0.6
            : 0;

        const score = (0.55 * g) + (0.35 * t) - earthyPenalty;
        return { ...p, _score: score, _g: g, _t: t };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 12);

    return scored;
  }, [profile, products]);

  // Similar users recommend (simple MVP aggregation)
  useEffect(() => {
    async function loadSimilar() {
      if (!session || !profile) return;

      const { data: similars } = await supabase
        .from("users_profile")
        .select("user_id,mix_preference,daily_start_time")
        .neq("user_id", session.user.id)
        .eq("mix_preference", profile.mix_preference)
        .eq("daily_start_time", profile.daily_start_time)
        .limit(30);

      const ids = (similars || []).map(s => s.user_id);
      if (ids.length === 0) {
        setReportsBySimilar([]);
        return;
      }

      const { data: reps } = await supabase
        .from("reports")
        .select("user_id,strain_id,relief_score")
        .in("user_id", ids)
        .eq("liked_flag", true);

      const map = new Map();
      for (const r of (reps || [])) {
        const cur = map.get(r.strain_id) || { count: 0, sum: 0 };
        cur.count += 1;
        cur.sum += (r.relief_score ?? 0);
        map.set(r.strain_id, cur);
      }

      const items = [...map.entries()]
        .map(([strain_id, v]) => ({ strain_id, count: v.count, avg_relief: v.count ? v.sum / v.count : 0 }))
        .sort((a, b) => (b.count - a.count) || (b.avg_relief - a.avg_relief))
        .slice(0, 12);

      setReportsBySimilar(items);
    }

    loadSimilar();
  }, [session, profile]);

  async function markPurchase(p) {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר.");

    const { error } = await supabase.from("purchases").insert({
      user_id: session.user.id,
      strain_id: p.strain_id
    });

    if (error) return setMsg(error.message);

    // ✅ אחרי "קניתי" עוברים ישר לדיווח על אותו זן
    router.push(`/report?strain_id=${encodeURIComponent(p.strain_id)}`);
  }

  return (
    <div className="card">
      <div className="h1">המלצות לקנייה הבאה</div>
      <div className="small">2 טאבים: המלצות אישיות · מטופלים דומים ממליצים</div>

      <div className="tabs">
        <div className={"tab " + (tab === "personal" ? "tabActive" : "")} onClick={() => setTab("personal")}>🧠 המלצות אישיות</div>
        <div className={"tab " + (tab === "similar" ? "tabActive" : "")} onClick={() => setTab("similar")}>👥 מטופלים דומים</div>
      </div>

      {msg && <div className="small" style={{ marginBottom: 10 }}>{msg}</div>}

      {tab === "personal" && (
        <div className="list">
          {personalRecs.map(p => (
            <div className="card" key={p.strain_id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{p.name_he || p.name_en || p.strain_id}</div>
                  <div className="small">{p.strain_id} · {p.t_category || ""}{p.c_category ? `/${p.c_category}` : ""}</div>
                  <div className="small">למה: גנטיקה={p._g} · טעם={p._t}</div>
                </div>
                <button className="btn btnPrimary" onClick={() => markPurchase(p)}>קניתי</button>
              </div>
            </div>
          ))}
          {personalRecs.length === 0 && <div className="small">אין המלצות עדיין. מלא שאלון היכרות.</div>}
        </div>
      )}

      {tab === "similar" && (
        <div className="list">
          {reportsBySimilar.map(x => {
            const p = products.find(pp => pp.strain_id === x.strain_id);
            return (
              <div className="card" key={x.strain_id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{p?.name_he || p?.name_en || x.strain_id}</div>
                    <div className="small">{x.strain_id} · ⭐ {x.count} מטופלים דומים אהבו · Relief ממוצע {x.avg_relief.toFixed(1)}</div>
                  </div>
                  <button className="btn btnPrimary" onClick={() => markPurchase({ strain_id: x.strain_id })}>קניתי</button>
                </div>
              </div>
            );
          })}
          {reportsBySimilar.length === 0 && (
            <div className="small">
              עדיין אין מספיק דיווחים של “דומים”. זה יתחיל לעבוד אחרי כמה דיווחים מהפיילוט.
            </div>
          )}
        </div>
      )}

      <div className="hr" />
      <div className="row">
        <a className="btn" href="/onboarding">שאלון היכרות</a>
        <a className="btn" href="/report">דיווח</a>
        <a className="btn" href="/">בית</a>
      </div>
    </div>
  );
}
