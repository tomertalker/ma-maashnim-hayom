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

const GOALS = [
  { k: "sleep", t: "שינה" },
  { k: "calm", t: "רוגע/חרדה" },
  { k: "pain_body", t: "כאב" },
  { k: "focus", t: "פוקוס/תפקוד" },
  { k: "mood", t: "מצב רוח" },
  { k: "appetite", t: "תיאבון" },
  { k: "social", t: "חברתי" },
  { k: "creativity", t: "יצירתיות" }
];

const INDICATIONS = [
  { k: "chronic_pain", t: "כאב כרוני" },
  { k: "sleep_issues", t: "בעיות שינה" },
  { k: "anxiety", t: "חרדה/סטרס" },
  { k: "ptsd", t: "PTSD" },
  { k: "adhd_focus", t: "קשב/פוקוס" },
  { k: "appetite", t: "תיאבון" },
  { k: "muscle_spasm", t: "ספאזם/שרירים" },
  { k: "other", t: "אחר" }
];

const AVOID = [
  { k: "avoid_anxiety", t: "להימנע מחרדה/לחץ" },
  { k: "avoid_sedation", t: "להימנע מהרדמה חזקה" },
  { k: "avoid_stimulation", t: "להימנע מהתעוררות/דופק" },
  { k: "avoid_munchies", t: "להימנע ממאנצ'יז חזק" },
  { k: "avoid_confusing_head", t: "להימנע מבלבול/כבד בראש" }
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
  const [selected, setSelected] = useState([]);
  const [step, setStep] = useState(1);
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState({
    consent_given: true,

    // בסיסי (18+ בלבד)
    patient_display_name: "",
    patient_age_band: "18_24",
    patient_sex: "",

    // התווייה טיפולית (חדש)
    therapeutic_indication_tags: "sleep_issues,anxiety",
    therapeutic_indication_free_text: "",

    // מטרות + סימפטומים
    treatment_goals: "calm,sleep",
    symptom_pain_0_10: 5,
    symptom_anxiety_0_10: 5,
    symptom_sleep_0_10: 5,
    symptom_focus_0_10: 5,

    avoid_effects: "avoid_anxiety",

    // הרגלי שימוש (כבר היה)
    preferred_method: "smoke",
    mix_preference: "tobacco",
    daily_start_time: "morning",
    typical_session_grams: 0.3,
    sessions_per_day_band: "1_2",
    experience_level: "intermediate",

    // טעם/כיוון
    preferred_flavor_tags: "citrus,pine",
    earthy_tolerance: "avoid_strong",
    preferred_direction_tags: "calm,focus",

    // נעילה
    onboarding_locked: false,
    onboarding_completed_at: null,
    default_goal_tag: "calm",
    onboarding_notes: ""
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

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
        setProfile(prev => ({ ...prev, ...data }));
      }
    }
    loadProfile();
  }, [session]);

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
    if (!s) return products.slice(0, 200);
    return products
      .filter(p =>
        (p.name_he || "").toLowerCase().includes(s) ||
        (p.name_en || "").toLowerCase().includes(s) ||
        (p.strain_id || "").toLowerCase().includes(s)
      )
      .slice(0, 200);
  }, [q, products]);

  function toggleCsvField(field, key, max = 6) {
    const cur = splitCsv(profile[field]);
    const has = cur.includes(key);
    let next = has ? cur.filter(x => x !== key) : [...cur, key];
    if (next.length > max) next = next.slice(0, max);
    setProfile(prev => ({ ...prev, [field]: joinCsv(next) }));
  }

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

  async function saveStep1() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר קודם.");
    if (!profile.patient_display_name.trim()) return setMsg("מלא שם תצוגה/כינוי.");
    if (splitCsv(profile.therapeutic_indication_tags).length === 0) return setMsg("בחר לפחות התוויה טיפולית אחת.");
    if (splitCsv(profile.treatment_goals).length === 0) return setMsg("בחר לפחות מטרה אחת.");

    const payload = {
      user_id: session.user.id,
      ...profile,
      onboarding_locked: false,
      onboarding_completed_at: null
    };

    const { error } = await supabase.from("users_profile").upsert(payload);
    if (error) return setMsg(error.message);

    setMsg("נשמר ✅ עוברים לבחירת זנים שעבדו.");
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
          ? "שלב 1: פרטי משתמש + התוויה טיפולית + מטרות והעדפות (ממלאים פעם אחת בלבד)."
          : "שלב 2: זנים שעבדו (מינימום 3, ללא מקסימום)."}
      </div>

      {msg && <div className="small" style={{ marginTop: 10 }}>{msg}</div>}
      <div className="hr" />

      {step === 1 && (
        <>
          <div className="h2">פרטי משתמש (18+ בלבד)</div>
          <div className="row">
            <input
              className="input"
              placeholder="שם תצוגה / כינוי"
              value={profile.patient_display_name}
              onChange={(e) => setProfile(prev => ({ ...prev, patient_display_name: e.target.value }))}
            />
            <select
              className="input"
              value={profile.patient_age_band}
              onChange={(e) => setProfile(prev => ({ ...prev, patient_age_band: e.target.value }))}
            >
              <option value="18_24">18–24</option>
              <option value="25_34">25–34</option>
              <option value="35_44">35–44</option>
              <option value="45_plus">45+</option>
            </select>
            <select
              className="input"
              value={profile.patient_sex || ""}
              onChange={(e) => setProfile(prev => ({ ...prev, patient_sex: e.target.value }))}
            >
              <option value="">מין (אופציונלי)</option>
              <option value="female">נקבה</option>
              <option value="male">זכר</option>
              <option value="other">אחר</option>
              <option value="prefer_not">מעדיף לא לציין</option>
            </select>
          </div>

          <div className="hr" />
          <div className="h2">התווייה טיפולית (לאיזה צרכים משתמש)</div>
          <div className="row">
            {INDICATIONS.map(x => {
              const active = splitCsv(profile.therapeutic_indication_tags).includes(x.k);
              return (
                <button
                  key={x.k}
                  className={"btn " + (active ? "btnPrimary" : "")}
                  onClick={() => toggleCsvField("therapeutic_indication_tags", x.k, 6)}
                >
                  {x.t}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 10 }}>
            <textarea
              className="input"
              rows={3}
              placeholder="אם 'אחר' – כתוב כאן בקצרה (אופציונלי)"
              value={profile.therapeutic_indication_free_text || ""}
              onChange={(e) => setProfile(prev => ({ ...prev, therapeutic_indication_free_text: e.target.value }))}
            />
          </div>

          <div className="hr" />
          <div className="h2">מטרות טיפול (בחר כמה)</div>
          <div className="row">
            {GOALS.map(g => {
              const active = splitCsv(profile.treatment_goals).includes(g.k);
              return (
                <button
                  key={g.k}
                  className={"btn " + (active ? "btnPrimary" : "")}
                  onClick={() => toggleCsvField("treatment_goals", g.k, 6)}
                >
                  {g.t}
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="h2">חומרת סימפטומים (0–10)</div>
          {[
            ["כאב", "symptom_pain_0_10"],
            ["חרדה/לחץ", "symptom_anxiety_0_10"],
            ["בעיות שינה", "symptom_sleep_0_10"],
            ["קושי בפוקוס", "symptom_focus_0_10"]
          ].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div className="small">{label}: {profile[key]}</div>
              <input
                className="input"
                type="range"
                min="0"
                max="10"
                value={profile[key]}
                onChange={(e) => setProfile(prev => ({ ...prev, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}

          <div className="hr" />
          <div className="h2">מה חשוב להימנע (אופציונלי)</div>
          <div className="row">
            {AVOID.map(a => {
              const active = splitCsv(profile.avoid_effects).includes(a.k);
              return (
                <button
                  key={a.k}
                  className={"btn " + (active ? "btnPrimary" : "")}
                  onClick={() => toggleCsvField("avoid_effects", a.k, 6)}
                >
                  {a.t}
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="h2">טעמים מועדפים (עד 6)</div>
          <div className="row">
            {FLAVORS.map(f => {
              const active = splitCsv(profile.preferred_flavor_tags).includes(f.k);
              return (
                <button
                  key={f.k}
                  className={"btn " + (active ? "btnPrimary" : "")}
                  onClick={() => toggleCsvField("preferred_flavor_tags", f.k, 6)}
                >
                  {f.t}
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="h2">כיוונים מועדפים (עד 3)</div>
          <div className="row">
            {GOALS.map(d => {
              const active = splitCsv(profile.preferred_direction_tags).includes(d.k);
              return (
                <button
                  key={d.k}
                  className={"btn " + (active ? "btnPrimary" : "")}
                  onClick={() => toggleCsvField("preferred_direction_tags", d.k, 3)}
                >
                  {d.t}
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="row">
            <button className="btn btnPrimary" onClick={saveStep1}>המשך לבחירת זנים</button>
            <a className="btn" href="/">בית</a>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="h2">בחירת זנים שעבדו (Seeds)</div>
          <div className="small">מינימום 3. ללא הגבלה. לכל זן בוחרים סיבה אחת לפחות.</div>

          <div className="hr" />
          <input className="input" placeholder="חיפוש לפי שם/ID…" value={q} onChange={(e) => setQ(e.target.value)} />

          <div className="list" style={{ marginTop: 10, maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
            {filtered.map(p => {
              const isSel = !!selected.find(x => x.strain_id === p.strain_id);
              return (
                <button
                  key={p.strain_id}
                  className="btn"
                  style={{ textAlign: "left", display: "flex", justifyContent: "space-between", gap: 12 }}
                  onClick={() => toggleSelect(p)}
                >
                  <div>
                    <div style={{ fontWeight: 800, color: "#111" }}>{p.name_he || p.name_en || p.strain_id}</div>
                    <div className="small" style={{ color: "#333" }}>
                      {p.strain_id} · {p.t_category || ""}{p.c_category ? `/${p.c_category}` : ""}
                    </div>
                  </div>
                  <span className="badge">{isSel ? "נבחר" : "בחר"}</span>
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="h2">סיבות (עד 2 לכל זן)</div>
          <div className="list">
            {selected.map(s => (
              <div className="card" key={s.strain_id}>
                <div style={{ fontWeight: 900, color: "#111" }}>{s.name_he || s.strain_id}</div>
                <div className="small" style={{ color: "#333" }}>{s.strain_id}</div>

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
            <button className="btn btnPrimary" onClick={finishOnboarding}>סיום ושמירה</button>
            <button className="btn" onClick={() => setStep(1)}>חזרה</button>
          </div>
        </>
      )}
    </div>
  );
}
