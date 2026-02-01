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
  { k: "gassy", t: "גזי/דיזל" },
  { k: "floral", t: "פרחוני" },
  { k: "spicy", t: "חריף/פלפלי" },
  { k: "sweet", t: "מתוק" }
];

const DIRECTIONS = [
  { k: "sleep", t: "שינה" },
  { k: "calm", t: "רוגע" },
  { k: "mood", t: "מצב רוח" },
  { k: "focus", t: "פוקוס" },
  { k: "pain_body", t: "כאב גוף" },
  { k: "social", t: "חברתי" },
  { k: "creativity", t: "יצירתיות" }
];

function splitCsv(s) {
  return (s || "").split(",").map(x => x.trim()).filter(Boolean);
}
function joinCsv(arr) {
  return (arr || []).join(",");
}

export default function Onboarding() {
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]); // [{strain_id, name_he, reasons:[]}]
  const [step, setStep] = useState(1); // 1=profile, 2=seeds
  const [msg, setMsg] = useState("");

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
    preferred_direction_tags: "calm,focus",

    // new fields
    default_goal_tag: "calm",
    onboarding_notes: "",
    onboarding_locked: false,
    onboarding_completed_at: null
  });

  // session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  // load products
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

  // load existing profile (and lock check)
  useEffect(() => {
    async function loadProfile() {
      if (!session) return;

      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (!error && data) {
        if (data.onboarding_locked) {
          window.location.href = "/recommendations";
          return;
        }
        // merge existing into state
        setProfile(prev => ({ ...prev, ...data }));
      }
    }
    loadProfile();
  }, [session]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 200);
    return products
      .filter(p =>
        (p.name_he || "").toLowerCase().includes(s) ||
        (p.name_en || "").toLowerCase().includes(s) ||
        (p.strain_id || "").toLowerCase().includes(s)
      )
      .slice(0, 200);
  }, [q, products]);

  function toggleSelect(p) {
    setMsg("");
    const exists = selected.find(x => x.strain_id === p.strain_id);
    if (exists) {
      setSelected(selected.filter(x => x.strain_id !== p.strain_id));
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

  function toggleCsvField(field, key, max = 5) {
    const cur = splitCsv(profile[field]);
    const has = cur.includes(key);
    let next = has ? cur.filter(x => x !== key) : [...cur, key];
    if (next.length > max) next = next.slice(0, max);
    setProfile(prev => ({ ...prev, [field]: joinCsv(next) }));
  }

  async function saveStep1() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר קודם.");

    // חובה לבחור לפחות כיוון אחד
    if (splitCsv(profile.preferred_direction_tags).length === 0) {
      return setMsg("בחר לפחות כיוון אחד (למשל רוגע/שינה/פוקוס).");
    }

    const payload = {
      user_id: session.user.id,
      ...profile,
      onboarding_locked: false,
      onboarding_completed_at: null
    };

    const { error } = await supabase.from("users_profile").upsert(payload);
    if (error) return setMsg(error.message);

    setMsg("נשמר שלב היכרות ✅ עכשיו בוחרים זנים שעבדו.");
    setStep(2);
  }

  async function finishOnboarding() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר קודם.");
    if (selected.length < 3) return setMsg("בחר לפחות 3 זנים שעבדו לך.");

    const missingReason = selected.find(s => s.reasons.length === 0);
    if (missingReason) return setMsg(`בחר סיבה אחת לפחות עבור: ${missingReason.name_he || missingReason.strain_id}`);

    const payload = {
      user_id: session.user.id,
      ...profile,
      liked_strains: selected.map(s => ({ strain_id: s.strain_id, reasons: s.reasons })),

      onboarding_locked: true,
      onboarding_completed_at: new Date().toISOString()
    };

    const { error } = await supabase.from("users_profile").upsert(payload);
    if (error) return setMsg(error.message);

    window.location.href = "/recommendations";
  }

  return (
    <div className="card">
      <div className="h1">שאלון היכרות</div>
      <div className="small">
        {step === 1
          ? "שלב 1: ממלאים פרופיל משתמש (פעם אחת בלבד)."
          : "שלב 2: בוחרים זנים שעבדו לך (מינימום 3, ללא הגבלה)."}
      </div>

      {msg && <div className="small" style={{ marginTop: 10 }}>{msg}</div>}

      <div className="hr" />

      {step === 1 && (
        <>
          <div className="h2">ברירות מחדל לסשן</div>
          <div className="row">
            <select
              className="input"
              value={profile.mix_preference}
              onChange={(e) => setProfile(prev => ({ ...prev, mix_preference: e.target.value }))}
            >
              <option value="pure">נקי</option>
              <option value="tobacco">עם טבק</option>
            </select>

            <input
              className="input"
              type="number"
              step="0.05"
              value={profile.typical_session_grams}
              onChange={(e) => setProfile(prev => ({ ...prev, typical_session_grams: Number(e.target.value) }))}
            />

            <select
              className="input"
              value={profile.default_goal_tag}
              onChange={(e) => setProfile(prev => ({ ...prev, default_goal_tag: e.target.value }))}
            >
              {DIRECTIONS.map(d => <option key={d.k} value={d.k}>{d.t}</option>)}
            </select>
          </div>
          <div className="small">הערה: הערכים האלה ישמשו כברירת מחדל בדיווח על זן.</div>

          <div className="hr" />
          <div className="h2">בחירת טעמים מועדפים (עד 5)</div>
          <div className="row">
            {FLAVORS.map(f => {
              const active = splitCsv(profile.preferred_flavor_tags).includes(f.k);
              return (
                <button
                  key={f.k}
                  className={"btn " + (active ? "btnPrimary" : "")}
                  onClick={() => toggleCsvField("preferred_flavor_tags", f.k, 5)}
                  style={{ color: active ? undefined : "#111" }}
                >
                  {f.t}
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="h2">כיוונים מועדפים (עד 3)</div>
          <div className="row">
            {DIRECTIONS.map(d => {
              const active = splitCsv(profile.preferred_direction_tags).includes(d.k);
              return (
                <button
                  key={d.k}
                  className={"btn " + (active ? "btnPrimary" : "")}
                  onClick={() => toggleCsvField("preferred_direction_tags", d.k, 3)}
                  style={{ color: active ? undefined : "#111" }}
                >
                  {d.t}
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="h2">הערות חופשי</div>
          <textarea
            className="input"
            rows={4}
            placeholder="כל דבר שחשוב שנדע…"
            value={profile.onboarding_notes || ""}
            onChange={(e) => setProfile(prev => ({ ...prev, onboarding_notes: e.target.value }))}
          />

          <div className="hr" />
          <div className="row">
            <button className="btn btnPrimary" onClick={saveStep1}>המשך לבחירת זנים</button>
            <a className="btn" href="/">בית</a>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="h2">בחירת זנים (Seeds)</div>
          <div className="small">בחר כמה שאתה רוצה. חובה לבחור לפחות 3. לכל זן בוחרים סיבה אחת לפחות.</div>

          <div className="hr" />
          <input className="input" placeholder="חיפוש לפי שם/ID…" value={q} onChange={(e) => setQ(e.target.value)} />

          {/* list box scroll */}
          <div
            className="list"
            style={{
              marginTop: 10,
              maxHeight: 320,
              overflowY: "auto",
              paddingRight: 6
            }}
          >
            {filtered.map(p => {
              const isSel = !!selected.find(x => x.strain_id === p.strain_id);
              return (
                <button
                  key={p.strain_id}
                  className="btn"
                  style={{
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12
                  }}
                  onClick={() => toggleSelect(p)}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#111" }}>
                      {p.name_he || p.name_en || p.strain_id}
                    </div>
                    <div className="small" style={{ color: "#333" }}>
                      {p.strain_id} · {p.t_category || ""}{p.c_category ? `/${p.c_category}` : ""}
                    </div>
                  </div>

                  {/* badge fix: black text */}
                  <span
                    className="badge"
                    style={{
                      background: isSel ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.04)",
                      color: "#111",
                      padding: "6px 10px",
                      borderRadius: 999
                    }}
                  >
                    {isSel ? "נבחר" : "בחר"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hr" />

          <div className="h2">סיבות (עד 2 לכל זן)</div>
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
                      style={{ color: s.reasons.includes(r.k) ? undefined : "#111" }}
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
            <button className="btn btnPrimary" onClick={finishOnboarding}>סיום ושמירה</button>
            <button className="btn" onClick={() => setStep(1)}>חזרה לשלב היכרות</button>
          </div>
        </>
      )}
    </div>
  );
}
