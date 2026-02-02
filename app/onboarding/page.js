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

const INDICATIONS = [
  "כאב כרוני",
  "חרדה/סטרס",
  "שינה",
  "PTSD",
  "דיכאון",
  "תיאבון",
  "כאבי ראש/מיגרנה",
  "ספסטיות/נוירולוגי",
  "אחר"
];

const GOALS = [
  "הפחתת כאב",
  "שיפור שינה",
  "הפחתת חרדה",
  "שיפור מצב רוח",
  "שיפור תפקוד/פוקוס",
  "שיפור תיאבון",
  "הפחתת מתח בגוף",
  "אחר"
];

function splitCsv(s) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toggleCsv(setter, currentCsv, key) {
  const cur = new Set(splitCsv(currentCsv));
  if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  setter([...cur].join(","));
}

export default function Onboarding() {
  const [session, setSession] = useState(null);

  // flow
  const [step, setStep] = useState("profile"); // "profile" | "seeds"
  const [locked, setLocked] = useState(false); // if already filled
  const [loading, setLoading] = useState(true);

  // products for seeds
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]); // [{strain_id, name_he, reasons:[]}]
  const [msg, setMsg] = useState("");

  // IMPORTANT: no nickname here (removed)
  const [profile, setProfile] = useState({
    age: 18,
    gender: "male", // optional
    condition_1: "pain",
    condition_2: "",
    therapeutic_indication: "כאב כרוני",
    therapeutic_indication_other: "",
    treatment_goals: "הפחתת כאב,שיפור שינה",
    patient_notes: "",

    preferred_method: "smoke",
    mix_preference: "tobacco",
    daily_start_time: "morning",
    typical_session_grams: 0.3,
    sessions_per_day_band: "1_2",
    experience_level: "intermediate",

    preferred_flavor_tags: "citrus,pine",
    earthy_tolerance: "avoid_strong",
    preferred_direction_tags: "calm,focus",

    consent_given: true,
    onboarding_done: false
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  // load products list once
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

  // check if profile already exists and is locked
  useEffect(() => {
    async function checkExisting() {
      if (!session) {
        setLoading(false);
        return;
      }

      // look for existing row
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id,onboarding_done")
        .eq("user_id", session.user.id)
        .limit(1);

      if (!error && data && data.length > 0) {
        const done = !!data[0].onboarding_done;
        // if row exists - treat as locked (no edits)
        setLocked(true);
        setStep("seeds"); // allow proceed to seeds if you want; or keep locked page
        if (done) setMsg("שאלון ההיכרות כבר מולא. אי אפשר לערוך אותו שוב.");
        else setMsg("נמצא פרופיל קיים. כרגע נעול לעריכה (לפי ההגדרה שלנו).");
      }

      setLoading(false);
    }
    checkExisting();
  }, [session]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 7);
    return products
      .filter(
        (p) =>
          (p.name_he || "").toLowerCase().includes(s) ||
          (p.name_en || "").toLowerCase().includes(s) ||
          (p.strain_id || "").toLowerCase().includes(s)
      )
      .slice(0, 7);
  }, [q, products]);

  function toggleSelect(p) {
    setMsg("");
    const exists = selected.find((x) => x.strain_id === p.strain_id);
    if (exists) {
      setSelected(selected.filter((x) => x.strain_id !== p.strain_id));
      return;
    }
    // ✅ no max limit
    setSelected([...selected, { strain_id: p.strain_id, name_he: p.name_he, reasons: [] }]);
  }

  function toggleReason(strainId, reasonKey) {
    setSelected((prev) =>
      prev.map((s) => {
        if (s.strain_id !== strainId) return s;
        const has = s.reasons.includes(reasonKey);
        let next = has ? s.reasons.filter((r) => r !== reasonKey) : [...s.reasons, reasonKey];
        // keep max 2 reasons per strain
        if (next.length > 2) next = next.slice(0, 2);
        return { ...s, reasons: next };
      })
    );
  }

  async function saveProfile() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר קודם.");

    // validation: age >= 18
    const ageNum = Number(profile.age);
    if (!Number.isFinite(ageNum) || ageNum < 18) return setMsg("גיל חייב להיות 18 ומעלה.");

    // validation: indication other
    if (profile.therapeutic_indication === "אחר" && !profile.therapeutic_indication_other.trim()) {
      return setMsg("בחרת 'אחר' בהתווייה טיפולית—כתוב במה מדובר.");
    }

    // if locked, prevent save
    if (locked) return setMsg("השאלון נעול לעריכה אחרי מילוי ראשון.");

    // Insert only (so it can't be edited later)
    const payload = {
      user_id: session.user.id,
      ...profile,
      age: ageNum,
      onboarding_done: true
    };

    const { error } = await supabase.from("users_profile").insert(payload);
    if (error) {
      // if already exists, lock it
      setLocked(true);
      return setMsg("נראה שהשאלון כבר מולא בעבר ולכן הוא נעול לעריכה.");
    }

    setMsg("נשמר ✅ עכשיו עוברים לבחירת זנים שעבדו לך.");
    setStep("seeds");
    setLocked(true); // lock immediately after first save
  }

  async function saveSeeds() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר קודם.");

    if (selected.length < 3) return setMsg("בחר לפחות 3 זנים שעבדו לך (אין מקסימום).");

    const missingReason = selected.find((s) => s.reasons.length === 0);
    if (missingReason) {
      return setMsg(`בחר לפחות סיבה אחת עבור: ${missingReason.name_he || missingReason.strain_id}`);
    }

    // update seeds (this can be editable later if you want; for now we allow it here)
    const payload = {
      user_id: session.user.id,
      liked_strains: selected.map((s) => ({ strain_id: s.strain_id, reasons: s.reasons }))
    };

    const { error } = await supabase.from("users_profile").update(payload).eq("user_id", session.user.id);
    if (error) return setMsg(error.message);

    setMsg("נשמר! אפשר לעבור להמלצות.");
  }

  if (loading) {
    return (
      <div className="card">
        <div className="h1">שאלון היכרות</div>
        <div className="small">טוען…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="h1">שאלון היכרות</div>
      <div className="small">שלב 1: פרופיל מטופל · שלב 2: זנים שעבדו לך</div>

      {!session && <div className="small" style={{ marginTop: 10 }}>צריך להתחבר קודם.</div>}

      <div className="hr" />

      {/* step switch */}
      <div className="tabs">
        <div
          className={"tab " + (step === "profile" ? "tabActive" : "")}
          onClick={() => setStep("profile")}
        >
          1) היכרות
        </div>
        <div
          className={"tab " + (step === "seeds" ? "tabActive" : "")}
          onClick={() => setStep("seeds")}
        >
          2) זנים שעבדו
        </div>
      </div>

      {msg && <div className="small" style={{ marginBottom: 10 }}>{msg}</div>}

      {/* STEP 1: PROFILE */}
      {step === "profile" && (
        <>
          {locked ? (
            <div className="small" style={{ marginTop: 10 }}>
              השאלון כבר מולא ולכן הוא נעול לעריכה. אפשר להמשיך לשלב הזנים או ללכת להמלצות.
              <div className="row" style={{ marginTop: 10 }}>
                <a className="btn" href="/recommendations">להמלצות</a>
                <button className="btn btnPrimary" onClick={() => setStep("seeds")}>המשך לזנים</button>
              </div>
            </div>
          ) : (
            <>
              <div className="h2">פרטים בסיסיים</div>
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min="18"
                  value={profile.age}
                  onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                  placeholder="גיל (18+)"
                />
                <select
                  className="input"
                  value={profile.gender}
                  onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                >
                  <option value="male">זכר</option>
                  <option value="female">נקבה</option>
                  <option value="other">אחר</option>
                  <option value="na">מעדיף לא לציין</option>
                </select>
              </div>

              <div className="hr" />
              <div className="h2">התווייה טיפולית</div>
              <select
                className="input"
                value={profile.therapeutic_indication}
                onChange={(e) => setProfile({ ...profile, therapeutic_indication: e.target.value })}
              >
                {INDICATIONS.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>

              {profile.therapeutic_indication === "אחר" && (
                <input
                  className="input"
                  style={{ marginTop: 10 }}
                  value={profile.therapeutic_indication_other}
                  onChange={(e) => setProfile({ ...profile, therapeutic_indication_other: e.target.value })}
                  placeholder="פרט את ההתווייה"
                />
              )}

              <div className="hr" />
              <div className="h2">מטרות טיפול (אפשר כמה)</div>
              <div className="row">
                {GOALS.map((g) => (
                  <button
                    key={g}
                    className={"btn " + (splitCsv(profile.treatment_goals).includes(g) ? "btnPrimary" : "")}
                    onClick={() => toggleCsv((v) => setProfile({ ...profile, treatment_goals: v }), profile.treatment_goals, g)}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="hr" />
              <div className="h2">הרגלי שימוש כלליים</div>
              <div className="row">
                <select
                  className="input"
                  value={profile.preferred_method}
                  onChange={(e) => setProfile({ ...profile, preferred_method: e.target.value })}
                >
                  <option value="smoke">עישון</option>
                  <option value="vape">וייפ</option>
                  <option value="oil">שמן</option>
                  <option value="edible">אכיל</option>
                </select>

                <select
                  className="input"
                  value={profile.mix_preference}
                  onChange={(e) => setProfile({ ...profile, mix_preference: e.target.value })}
                >
                  <option value="pure">נקי</option>
                  <option value="tobacco">עם טבק</option>
                </select>

                <select
                  className="input"
                  value={profile.daily_start_time}
                  onChange={(e) => setProfile({ ...profile, daily_start_time: e.target.value })}
                >
                  <option value="morning">בוקר</option>
                  <option value="noon">צהריים</option>
                  <option value="evening">ערב</option>
                  <option value="night">לילה</option>
                </select>
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <input
                  className="input"
                  type="number"
                  step="0.05"
                  value={profile.typical_session_grams}
                  onChange={(e) => setProfile({ ...profile, typical_session_grams: Number(e.target.value) })}
                  placeholder="כמות טיפוסית (גרם)"
                />

                <select
                  className="input"
                  value={profile.sessions_per_day_band}
                  onChange={(e) => setProfile({ ...profile, sessions_per_day_band: e.target.value })}
                >
                  <option value="1_2">1–2 ביום</option>
                  <option value="3_4">3–4 ביום</option>
                  <option value="5_plus">5+ ביום</option>
                </select>

                <select
                  className="input"
                  value={profile.experience_level}
                  onChange={(e) => setProfile({ ...profile, experience_level: e.target.value })}
                >
                  <option value="beginner">מתחיל</option>
                  <option value="intermediate">בינוני</option>
                  <option value="advanced">מתקדם</option>
                </select>
              </div>

              <div className="hr" />
              <div className="h2">הערות חופשיות (נשמר לניתוח)</div>
              <textarea
                className="input"
                style={{ minHeight: 110 }}
                value={profile.patient_notes}
                onChange={(e) => setProfile({ ...profile, patient_notes: e.target.value })}
                placeholder="כל דבר שחשוב לדעת על המטופל/ת, רגישויות, מה עובד ומה לא, וכו׳"
              />

              <div className="hr" />
              <div className="row">
                <button className="btn btnPrimary" onClick={saveProfile}>שמור והמשך</button>
                <a className="btn" href="/">בית</a>
              </div>
            </>
          )}
        </>
      )}

      {/* STEP 2: SEEDS */}
      {step === "seeds" && (
        <>
          <div className="h2">בחירת זנים שעבדו עד כה</div>
          <div className="small">בחר מינימום 3. אין מקסימום. לכל זן: בחר 1–2 סיבות.</div>

          <div className="hr" />
          <input
            className="input"
            placeholder="חיפוש לפי שם/ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div
            className="list"
            style={{
              marginTop: 10,
              maxHeight: 260,
              overflowY: "auto",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 8
            }}
          >
            {filtered.map((p) => {
              const isSel = !!selected.find((x) => x.strain_id === p.strain_id);
              return (
                <button
                  key={p.strain_id}
                  className="btn"
                  style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}
                  onClick={() => toggleSelect(p)}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.name_he || p.name_en || p.strain_id}</div>
                    <div className="small">
                      {p.strain_id} · {p.t_category || ""}{p.c_category ? `/${p.c_category}` : ""}
                    </div>
                  </div>
                  <span className="badge">{isSel ? "נבחר" : "בחר"}</span>
                </button>
              );
            })}
          </div>

          <div className="hr" />
          <div className="h2">סיבות לכל זן (עד 2)</div>

          <div className="list">
            {selected.map((s) => (
              <div className="card" key={s.strain_id}>
                <div style={{ fontWeight: 800 }}>{s.name_he || s.strain_id}</div>
                <div className="small">{s.strain_id}</div>

                <div className="row" style={{ marginTop: 10 }}>
                  {REASONS.map((r) => (
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
            <button className="btn btnPrimary" onClick={saveSeeds}>שמור זנים</button>
            <a className="btn" href="/recommendations">להמלצות</a>
            <a className="btn" href="/">בית</a>
          </div>
        </>
      )}
    </div>
  );
}
