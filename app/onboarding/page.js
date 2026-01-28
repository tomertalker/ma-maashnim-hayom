"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const REASONS = [
  { k: "sleep_shutdown", t: "שינה/כיבוי" },
  { k: "calm", t: "שקט נפשי" },
  { k: "positive_mood", t: "מצב רוח חיובי" },
  { k: "focus", t: "פוקוס/תפקוד" },
  { k: "pain_body", t: "כאב/גוף" },
  { k: "taste_aroma", t: "טעם/ארומה" }
];

export default function Onboarding() {
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]); // [{strain_id, name_he, reasons:[]}]
  const [profile, setProfile] = useState({
    consent_given: true,
    condition_1: "pain",
    condition_2: "",
    preferred_method: "smoke",
    mix_preference: "tobacco",
    daily_start_time: "morning",
    typical_session_grams: 0.3,
    sessions_per_day_band: "1_2",
    experience_level: "intermediate",
    preferred_flavor_tags: "citrus,pine",
    citrus_preference: "bitter_grapefruit",
    earthy_tolerance: "avoid_strong",
    preferred_direction_tags: "calm,focus"
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  useEffect(() => {
    async function loadProducts() {
      const { data, error } = await supabase
        .from("products_master")
        .select("strain_id,name_he,name_en,t_category,c_category")
        .order("internal_product_id", { ascending: true });

      if (!error) setProducts(data || []);
    }
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 50);
    return products
      .filter(p =>
        (p.name_he || "").toLowerCase().includes(s) ||
        (p.name_en || "").toLowerCase().includes(s) ||
        (p.strain_id || "").toLowerCase().includes(s)
      )
      .slice(0, 50);
  }, [q, products]);

  function toggleSelect(p) {
    setMsg("");
    const exists = selected.find(x => x.strain_id === p.strain_id);
    if (exists) {
      setSelected(selected.filter(x => x.strain_id !== p.strain_id));
      return;
    }
    if (selected.length >= 5) {
      setMsg("אפשר לבחור עד 5 זנים.");
      return;
    }
    setSelected([...selected, { strain_id: p.strain_id, name_he: p.name_he, reasons: [] }]);
  }

  function toggleReason(strainId, reasonKey) {
    setSelected(prev => prev.map(s => {
      if (s.strain_id !== strainId) return s;
      const has = s.reasons.includes(reasonKey);
      let next = has ? s.reasons.filter(r => r !== reasonKey) : [...s.reasons, reasonKey];
      if (next.length > 2) next = next.slice(0, 2);
      return { ...s, reasons: next };
    }));
  }

  async function saveProfile() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר קודם.");
    if (selected.length < 3) return setMsg("בחר לפחות 3 זנים שעבדו לך.");

    // enforce each selected has at least 1 reason (soft)
    const missingReason = selected.find(s => s.reasons.length === 0);
    if (missingReason) return setMsg(`בחר סיבה אחת לפחות עבור: ${missingReason.name_he || missingReason.strain_id}`);

    const payload = {
      user_id: session.user.id,
      ...profile,
      liked_strains: selected.map(s => ({ strain_id: s.strain_id, reasons: s.reasons }))
    };

    const { error } = await supabase.from("users_profile").upsert(payload);
    if (error) return setMsg(error.message);

    setMsg("נשמר! אפשר לעבור להמלצות.");
  }

  return (
    <div className="card">
      <div className="h1">שאלון היכרות</div>
      <div className="small">בחר 3–5 זנים שעבדו לך + סיבה (עד 2) לכל זן.</div>

      <div className="hr" />

      <div className="h2">בחירת זנים (Seeds)</div>
      <input className="input" placeholder="חיפוש לפי שם/ID…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="list" style={{ marginTop: 10 }}>
        {filtered.map(p => {
          const isSel = !!selected.find(x => x.strain_id === p.strain_id);
          return (
            <button
              key={p.strain_id}
              className="btn"
              style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}
              onClick={() => toggleSelect(p)}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{p.name_he || p.name_en || p.strain_id}</div>
                <div className="small">{p.strain_id} · {p.t_category || ""}{p.c_category ? `/${p.c_category}` : ""}</div>
              </div>
              <span className="badge">{isSel ? "נבחר" : "בחר"}</span>
            </button>
          );
        })}
      </div>

      <div className="hr" />

      <div className="h2">למה הזנים האלו עבדו לך? (עד 2 לכל זן)</div>
      <div className="list">
        {selected.map(s => (
          <div className="card" key={s.strain_id}>
            <div style={{ fontWeight: 800 }}>{s.name_he || s.strain_id}</div>
            <div className="small">{s.strain_id}</div>

            <div className="row" style={{ marginTop: 10 }}>
              {REASONS.map(r => (
                <button
                  key={r.k}
                  className={"btn " + (s.reasons.includes(r.k) ? "btnPrimary" : "")}
                  onClick={() => toggleReason(s.strain_id, r.k)}
                >
                  {r.t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hr" />

      <div className="row">
        <button className="btn btnPrimary" onClick={saveProfile}>שמור היכרות</button>
        <a className="btn" href="/recommendations">להמלצות</a>
        <a className="btn" href="/">בית</a>
      </div>

      {msg && <div className="small" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}
