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
    if (!s) return products.slice(0, 80);
    return products
      .filter(p =>
        (p.name_he || "").toLowerCase().includes(s) ||
        (p.name_en || "").toLowerCase().includes(s) ||
        (p.strain_id || "").toLowerCase().includes(s)
      )
      .slice(0, 80);
  }, [q, products]);

  function toggleSelect(p) {
    setMsg("");
    const exists = selected.find(x => x.strain_id === p.strain_id);
    if (exists) {
      setSelected(selected.filter(x => x.strain_id !== p.strain_id));
      return;
    }
    // ✅ אין יותר מגבלת 5 — אפשר לבחור כמה שרוצים
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

    // ✅ מינימום 3, מקסימום חופשי
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
      <div className="small">
        שלב 1: פרטים כלליים · שלב 2: בחירת זנים (מינימום 3, בלי מקסימום) + סיבה (עד 2) לכל זן.
      </div>

      {!session && <div className="small" style={{ marginTop: 10 }}>צריך להתחבר קודם.</div>}

      <div className="hr" />

      {/* ✅ שלב 1: שאלון היכרות בסיסי */}
      <div className="h2">1) פרטים כלליים (ממלאים פעם אחת לכל מטופל)</div>

      <div className="small" style={{ marginBottom: 6 }}>מה המטרה העיקרית?</div>
      <select
        className="input"
        value={profile.condition_1}
        onChange={(e) => setProfile(p => ({ ...p, condition_1: e.target.value }))}
      >
        <option value="pain">כאב</option>
        <option value="sleep">שינה</option>
        <option value="anxiety">חרדה/לחץ</option>
        <option value="mood">מצב רוח</option>
        <option value="other">אחר</option>
      </select>

      <div className="small" style={{ marginTop: 10, marginBottom: 6 }}>בעיה/מטרה נוספת (אופציונלי)</div>
      <input
        className="input"
        placeholder="לדוגמה: כאבי ראש / PTSD / פוקוס..."
        value={profile.condition_2}
        onChange={(e) => setProfile(p => ({ ...p, condition_2: e.target.value }))}
      />

      <div className="row" style={{ marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>שיטת שימוש</div>
          <select
            className="input"
            value={profile.preferred_method}
            onChange={(e) => setProfile(p => ({ ...p, preferred_method: e.target.value }))}
          >
            <option value="smoke">עישון</option>
            <option value="vape">אידוי</option>
            <option value="oil">שמן/טיפות</option>
            <option value="other">אחר</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>ערבוב</div>
          <select
            className="input"
            value={profile.mix_preference}
            onChange={(e) => setProfile(p => ({ ...p, mix_preference: e.target.value }))}
          >
            <option value="pure">נקי</option>
            <option value="tobacco">עם טבק</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>מתי לרוב מתחילים ביום?</div>
          <select
            className="input"
            value={profile.daily_start_time}
            onChange={(e) => setProfile(p => ({ ...p, daily_start_time: e.target.value }))}
          >
            <option value="morning">בוקר</option>
            <option value="noon">צהריים</option>
            <option value="evening">ערב</option>
            <option value="night">לילה</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>גרמים לסשן טיפוסי</div>
          <input
            className="input"
            type="number"
            step="0.05"
            value={profile.typical_session_grams}
            onChange={(e) => setProfile(p => ({ ...p, typical_session_grams: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>כמה סשנים ביום?</div>
          <select
            className="input"
            value={profile.sessions_per_day_band}
            onChange={(e) => setProfile(p => ({ ...p, sessions_per_day_band: e.target.value }))}
          >
            <option value="0_1">0–1</option>
            <option value="1_2">1–2</option>
            <option value="3_4">3–4</option>
            <option value="5_plus">5+</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>רמת ניסיון</div>
          <select
            className="input"
            value={profile.experience_level}
            onChange={(e) => setProfile(p => ({ ...p, experience_level: e.target.value }))}
          >
            <option value="new">חדש/ה</option>
            <option value="intermediate">בינוני</option>
            <option value="experienced">מנוסה</option>
          </select>
        </div>
      </div>

      <div className="small" style={{ marginTop: 10, marginBottom: 6 }}>טעמים מועדפים (רשימה מופרדת בפסיקים)</div>
      <input
        className="input"
        placeholder="לדוגמה: citrus,pine,gassy"
        value={profile.preferred_flavor_tags}
        onChange={(e) => setProfile(p => ({ ...p, preferred_flavor_tags: e.target.value }))}
      />

      <div className="row" style={{ marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>סוג הדרים אהוב</div>
          <select
            className="input"
            value={profile.citrus_preference}
            onChange={(e) => setProfile(p => ({ ...p, citrus_preference: e.target.value }))}
          >
            <option value="bitter_grapefruit">אשכולית מרירה</option>
            <option value="orange">תפוזי</option>
            <option value="lemon">לימוני</option>
            <option value="any">לא משנה</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <div className="small" style={{ marginBottom: 6 }}>סבילות לאדמתי</div>
          <select
            className="input"
            value={profile.earthy_tolerance}
            onChange={(e) => setProfile(p => ({ ...p, earthy_tolerance: e.target.value }))}
          >
            <option value="avoid_strong">להימנע מחזק</option>
            <option value="ok">בסדר</option>
            <option value="love">אוהב/ת</option>
          </select>
        </div>
      </div>

      <div className="small" style={{ marginTop: 10, marginBottom: 6 }}>כיוון מועדף (רשימה מופרדת בפסיקים)</div>
      <input
        className="input"
        placeholder="לדוגמה: calm,focus,sleep"
        value={profile.preferred_direction_tags}
        onChange={(e) => setProfile(p => ({ ...p, preferred_direction_tags: e.target.value }))}
      />

      <div className="hr" />

      {/* ✅ שלב 2: Seeds */}
      <div className="h2">2) בחירת זנים (Seeds)</div>
      <div className="small" style={{ marginBottom: 8 }}>
        נבחרו כרגע: <b>{selected.length}</b> (מינימום 3)
      </div>

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
