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

const FLAVORS = [
  { k: "citrus", t: "הדרי" },
  { k: "pine", t: "אורן" },
  { k: "earthy", t: "אדמתי" },
  { k: "gassy", t: "דיזל/גזי" },
  { k: "floral", t: "פרחוני" },
  { k: "spicy", t: "חריף/פלפלי" },
  { k: "sweet", t: "מתוק" }
];

const DIRECTIONS = [
  { k: "calm", t: "רוגע" },
  { k: "focus", t: "פוקוס" },
  { k: "sleep", t: "שינה" },
  { k: "mood", t: "מצב רוח" },
  { k: "pain_body", t: "כאב/גוף" },
  { k: "social", t: "חברתי" },
  { k: "creativity", t: "יצירתיות" }
];

function splitCsv(s) {
  return (s || "").split(",").map(x => x.trim()).filter(Boolean);
}

function toCsv(arr) {
  return (arr || []).join(",");
}

export default function Onboarding() {
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState([]); // [{strain_id, name_he, reasons:[]}]
  const [flavors, setFlavors] = useState(["citrus", "pine"]); // multi
  const [directions, setDirections] = useState(["calm", "focus"]); // multi
  const [notes, setNotes] = useState(""); // free text

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
    citrus_preference: "bitter_grapefruit",
    earthy_tolerance: "avoid_strong"
  });

  const [msg, setMsg] = useState("");

  // Simple “pill button” styles that are readable on mobile
  const pillBase = {
    background: "#fff",
    color: "#111",
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 700
  };

  const pillSelected = {
    background: "#111",
    color: "#fff",
    border: "1px solid #111"
  };

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
    if (!s) return products;
    return products.filter(p =>
      (p.name_he || "").toLowerCase().includes(s) ||
      (p.name_en || "").toLowerCase().includes(s) ||
      (p.strain_id || "").toLowerCase().includes(s)
    );
  }, [q, products]);

  function toggleSelect(p) {
    setMsg("");
    const exists = selected.find(x => x.strain_id === p.strain_id);
    if (exists) {
      setSelected(selected.filter(x => x.strain_id !== p.strain_id));
      return;
    }
    // אין מקסימום — אפשר לבחור כמה שרוצים
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

  function toggleMulti(v, arr, setArr) {
    const has = arr.includes(v);
    const next = has ? arr.filter(x => x !== v) : [...arr, v];
    setArr(next);
  }

  async function saveProfile() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר קודם.");
    if (selected.length < 3) return setMsg("בחר לפחות 3 זנים שעבדו לך.");

    const missingReason = selected.find(s => s.reasons.length === 0);
    if (missingReason) return setMsg(`בחר סיבה אחת לפחות עבור: ${missingReason.name_he || missingReason.strain_id}`);

    const payload = {
      user_id: session.user.id,
      ...profile,

      // בסיס הפרופיל להמלצות
      preferred_flavor_tags: toCsv(flavors),
      preferred_direction_tags: toCsv(directions),

      // הערות חופשי (דורש עמודה בטבלה — הסבר למטה)
      onboarding_notes: notes,

      liked_strains: selected.map(s => ({ strain_id: s.strain_id, reasons: s.reasons }))
    };

    const { error } = await supabase.from("users_profile").upsert(payload);
    if (error) return setMsg(error.message);

    setMsg("נשמר! אפשר לעבור להמלצות.");
  }

  return (
    <div className="card">
      <div className="h1">שאלון היכרות</div>
      <div className="small">1) בוחרים זנים שעבדו · 2) טעמים/כיוונים · 3) הערות · ואז שומרים</div>

      {!session && <div className="small" style={{ marginTop: 10 }}>צריך להתחבר קודם.</div>}

      <div className="hr" />

      <div className="h2">1) בחירת זנים שעבדו לך (מינימום 3, בלי מקסימום)</div>
      <input
        className="input"
        placeholder="חיפוש לפי שם/ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Scrollable box */}
      <div
        className="list"
        style={{
          marginTop: 10,
          maxHeight: 360,
          overflowY: "auto",
          border: "1px solid #e6e6e6",
          borderRadius: 12,
          padding: 8
        }}
      >
        {filtered.map(p => {
          const isSel = !!selected.find(x => x.strain_id === p.strain_id);
          return (
            <button
              key={p.strain_id}
              className="btn"
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                ...pillBase,
                ...(isSel ? pillSelected : {})
              }}
              onClick={() => toggleSelect(p)}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{p.name_he || p.name_en || p.strain_id}</div>
                <div style={{ opacity: 0.85, fontSize: 13 }}>
                  {p.strain_id} · {p.t_category || ""}{p.c_category ? `/${p.c_category}` : ""}
                </div>
              </div>
              <span style={{
                fontWeight: 900,
                padding: "6px 10px",
                borderRadius: 999,
                background: isSel ? "#fff" : "transparent",
                color: isSel ? "#111" : "#111",
                border: isSel ? "1px solid #fff" : "1px solid rgba(255,255,255,0.4)"
              }}>
                {isSel ? "נבחר" : "בחר"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="hr" />

      <div className="h2">2) למה הזנים האלו עבדו לך? (עד 2 סיבות לכל זן)</div>
      <div className="list">
        {selected.map(s => (
          <div className="card" key={s.strain_id}>
            <div style={{ fontWeight: 900 }}>{s.name_he || s.strain_id}</div>
            <div className="small">{s.strain_id}</div>

            <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              {REASONS.map(r => {
                const on = s.reasons.includes(r.k);
                return (
                  <button
                    key={r.k}
                    className="btn"
                    style={{ ...pillBase, ...(on ? pillSelected : {}) }}
                    onClick={() => toggleReason(s.strain_id, r.k)}
                  >
                    {r.t}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {selected.length === 0 && <div className="small">בחר זנים מהרשימה למעלה ואז יופיע כאן חלק הסיבות.</div>}
      </div>

      <div className="hr" />

      <div className="h2">3) העדפות טעם (לבחירה מרובה)</div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {FLAVORS.map(f => {
          const on = flavors.includes(f.k);
          return (
            <button
              key={f.k}
              className="btn"
              style={{ ...pillBase, ...(on ? pillSelected : {}) }}
              onClick={() => toggleMulti(f.k, flavors, setFlavors)}
            >
              {f.t}
            </button>
          );
        })}
      </div>

      <div className="hr" />

      <div className="h2">4) כיוון השפעה רצוי (לבחירה מרובה)</div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {DIRECTIONS.map(d => {
          const on = directions.includes(d.k);
          return (
            <button
              key={d.k}
              className="btn"
              style={{ ...pillBase, ...(on ? pillSelected : {}) }}
              onClick={() => toggleMulti(d.k, directions, setDirections)}
            >
              {d.t}
            </button>
          );
        })}
      </div>

      <div className="hr" />

      <div className="h2">5) הערות/תוספות (מלל חופשי)</div>
      <textarea
        className="input"
        style={{ minHeight: 100, paddingTop: 10 }}
        placeholder="כל דבר שחשוב לך שנדע: מינונים, מה עוזר, מה לא, תופעות לוואי מיוחדות וכו׳…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

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
