"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const DISLIKE_REASONS = [
  { k: "too_sedating", t: "מרדים מדי" },
  { k: "too_stimulating", t: "מעורר מדי" },
  { k: "anxiety", t: "חרדה/לחץ" },
  { k: "heart_racing", t: "דפיקות לב" },
  { k: "confusing_head", t: "בלבול / יותר מדי בראש" },
  { k: "heavy_body", t: "כבד בגוף / נתקע" },
  { k: "hurts_focus", t: "פגע בפוקוס" },
  { k: "too_munchies", t: "מאנצ׳יז חזק מדי" },
  { k: "bad_taste", t: "טעם/ריח לא טוב" },
  { k: "no_relief", t: "לא עזר למטרה" }
];

const DISLIKE_TASTE = [
  { k: "bitter_grapefruit", t: "הדרי מריר (אשכולית כזה)" },
  { k: "strong_earthy", t: "אדמתי חזק" },
  { k: "gassy", t: "גזי/דיזל" },
  { k: "spicy", t: "חריף/פלפלי" },
  { k: "too_sweet", t: "מתוק מדי" }
];

const LIKE_REASONS = [
  { k: "sleep_shutdown", t: "שינה/כיבוי" },
  { k: "calm", t: "שקט נפשי" },
  { k: "positive_mood", t: "מצב רוח חיובי" },
  { k: "focus", t: "פוקוס/תפקוד" },
  { k: "pain_body", t: "כאב/גוף" },
  { k: "taste_aroma", t: "טעם/ארומה" },
  { k: "balanced", t: "מאוזן ולא כבד" }
];

// helper
function splitCsv(s) {
  return (s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

export default function Report() {
  const params = useSearchParams();

  const [session, setSession] = useState(null);

  // selected strain
  const [strainId, setStrainId] = useState("");
  const [strainNameFree, setStrainNameFree] = useState(""); // for unknown strains
  const [products, setProducts] = useState([]); // for optional autocomplete list
  const [q, setQ] = useState(""); // search inside products list
  const [msg, setMsg] = useState("");

  const [liked, setLiked] = useState(null); // true/false

  // effects (liked)
  const [energy, setEnergy] = useState(5);
  const [focus, setFocus] = useState(5);
  const [mood, setMood] = useState(5);
  const [appetite, setAppetite] = useState(5);
  const [libido, setLibido] = useState(5);
  const [sensory, setSensory] = useState(5);
  const [relief, setRelief] = useState(5);
  const [likeReasons, setLikeReasons] = useState([]);

  // disliked
  const [dislikeReasons, setDislikeReasons] = useState([]);
  const [severity, setSeverity] = useState(3);
  const [tasteDetail, setTasteDetail] = useState("");
  const [sideParanoia, setSideParanoia] = useState(false);
  const [sideDry, setSideDry] = useState(false);
  const [sideDizzy, setSideDizzy] = useState(false);

  // common summary
  const [duration, setDuration] = useState(2);
  const [review, setReview] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  // If arrived from "קניתי" -> /report?strain_id=S0001
  useEffect(() => {
    const sid = (params?.get("strain_id") || "").trim();
    if (sid) setStrainId(sid);
  }, [params]);

  // Load products list (optional: for picking strain by name instead of ID)
  useEffect(() => {
    async function loadProducts() {
      const { data, error } = await supabase
        .from("products_master")
        .select("strain_id,name_he,name_en")
        .order("internal_product_id", { ascending: true });

      if (!error) setProducts(data || []);
    }
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 7);
    return products
      .filter(p =>
        (p.name_he || "").toLowerCase().includes(s) ||
        (p.name_en || "").toLowerCase().includes(s) ||
        (p.strain_id || "").toLowerCase().includes(s)
      )
      .slice(0, 7);
  }, [q, products]);

  function toggle(arr, setArr, v, max = 2) {
    const has = arr.includes(v);
    const next = has ? arr.filter(x => x !== v) : [...arr, v];
    setArr(next.slice(0, max));
  }

  function pickProduct(p) {
    setMsg("");
    setStrainId(p.strain_id);
    setStrainNameFree("");
    setQ(p.name_he || p.name_en || p.strain_id);
  }

  async function submit() {
    setMsg("");

    if (!session) return setMsg("צריך להתחבר.");

    // must have either known strain_id OR a free-text name
    if (!strainId.trim() && !strainNameFree.trim()) {
      return setMsg("בחר זן מהרשימה או כתוב שם זן חדש.");
    }

    if (liked === null) return setMsg("בחר “אהבתי” או “לא אהבתי”.");
    if (liked === true && likeReasons.length === 0) return setMsg("בחר עד 2 סיבות למה אהבת.");
    if (liked === false && dislikeReasons.length === 0) return setMsg("בחר לפחות סיבה אחת למה לא אהבת.");
    if (liked === false && dislikeReasons.includes("bad_taste") && !tasteDetail) return setMsg("בחר מה הפריע בטעם.");

    const payload = {
      user_id: session.user.id,

      // if exists use strain_id, else null
      strain_id: strainId.trim() ? strainId.trim() : null,

      // free text strain name if not in master
      strain_name_free: strainId.trim() ? null : strainNameFree.trim().slice(0, 80),

      duration_hours: duration,
      user_short_review: review.slice(0, 150),
      liked_flag: liked === true,

      // liked branch
      effect_energy: liked ? energy : null,
      effect_focus: liked ? focus : null,
      effect_mood: liked ? mood : null,
      effect_appetite: liked ? appetite : null,
      effect_libido: liked ? libido : null,
      effect_sensory: liked ? sensory : null,
      relief_score: liked ? relief : null,
      like_reasons: liked ? likeReasons.join(",") : null,

      // disliked branch
      dislike_reasons: liked === false ? dislikeReasons.join(",") : null,
      dislike_severity_1_5: liked === false ? severity : null,
      dislike_taste_detail: liked === false ? tasteDetail : null,
      sideeffect_paranoia: liked === false ? sideParanoia : null,
      sideeffect_dryness: liked === false ? sideDry : null,
      sideeffect_dizziness: liked === false ? sideDizzy : null
    };

    const { error } = await supabase.from("reports").insert(payload);
    if (error) return setMsg(error.message);

    setMsg("נשמר דיווח ✅");

    // reset form (keep q optional)
    setLiked(null);
    setStrainId("");
    setStrainNameFree("");
    setQ("");
    setLikeReasons([]);
    setDislikeReasons([]);
    setTasteDetail("");
    setSeverity(3);
    setSideParanoia(false);
    setSideDry(false);
    setSideDizzy(false);
    setEnergy(5);
    setFocus(5);
    setMood(5);
    setAppetite(5);
    setLibido(5);
    setSensory(5);
    setRelief(5);
    setDuration(2);
    setReview("");
  }

  return (
    <div className="card">
      <div className="h1">דיווח על זן</div>
      <div className="small">אפשר לבחור זן מהרשימה או לכתוב שם זן חדש.</div>

      {!session && <div className="small" style={{ marginTop: 10 }}>צריך להתחבר קודם.</div>}

      <div className="hr" />

      <div className="h2">1) בחר מצב</div>
      <div className="row">
        <button className={"btn " + (liked === true ? "btnPrimary" : "")} onClick={() => setLiked(true)}>✅ אהבתי</button>
        <button className={"btn " + (liked === false ? "btnDanger" : "")} onClick={() => setLiked(false)}>❌ לא אהבתי</button>
      </div>

      <div className="hr" />

      <div className="h2">2) איזה זן זה היה?</div>

      {/* If arrived via /report?strain_id=... show it */}
      {strainId.trim() && (
        <div className="small" style={{ marginBottom: 8 }}>
          נבחר אוטומטית: <b>{strainId}</b> (הגעת מהמסך “קניתי”)
        </div>
      )}

      {/* Search & pick from master */}
      <div className="small" style={{ marginBottom: 6 }}>חיפוש מהרשימה (מומלץ)</div>
      <input
        className="input"
        placeholder="חפש לפי שם/ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div
        className="list"
        style={{
          marginTop: 8,
          maxHeight: 260,
          overflowY: "auto",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 8
        }}
      >
        {filtered.map(p => (
          <button
            key={p.strain_id}
            className="btn"
            style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}
            onClick={() => pickProduct(p)}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{p.name_he || p.name_en || p.strain_id}</div>
              <div className="small">{p.strain_id}</div>
            </div>
            <span className="badge">{strainId === p.strain_id ? "נבחר" : "בחר"}</span>
          </button>
        ))}
        {filtered.length === 0 && <div className="small">לא נמצאו תוצאות.</div>}
      </div>

      <div className="hr" />

      {/* Free text if not in system */}
      <div className="h2">או: זן חדש שלא מופיע במערכת</div>
      <div className="small">אם לא מצאת ברשימה, כתוב שם חופשי (ואתה תעדכן את המערכת אחר כך ידנית).</div>
      <input
        className="input"
        placeholder="שם הזן (למשל: Blue Dream)"
        value={strainNameFree}
        onChange={(e) => {
          setStrainNameFree(e.target.value);
          if (e.target.value.trim()) setStrainId(""); // if free name chosen, clear id
        }}
      />

      {liked === true && (
        <>
          <div className="hr" />
          <div className="h2">השפעות (1–10, 5 נייטרלי)</div>
          {[
            ["אנרגיה", energy, setEnergy],
            ["פוקוס", focus, setFocus],
            ["מצב רוח", mood, setMood],
            ["תיאבון", appetite, setAppetite],
            ["ליבידו", libido, setLibido],
            ["חושים", sensory, setSensory]
          ].map(([label, v, setV]) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div className="small">{label}: {v}</div>
              <input className="input" type="range" min="1" max="10" value={v} onChange={(e) => setV(Number(e.target.value))} />
            </div>
          ))}

          <div style={{ marginBottom: 10 }}>
            <div className="small">כמה זה עזר? (0–10): {relief}</div>
            <input className="input" type="range" min="0" max="10" value={relief} onChange={(e) => setRelief(Number(e.target.value))} />
          </div>

          <div className="hr" />
          <div className="h2">למה אהבת? (עד 2)</div>
          <div className="row">
            {LIKE_REASONS.map(r => (
              <button
                key={r.k}
                className={"btn " + (likeReasons.includes(r.k) ? "btnPrimary" : "")}
                onClick={() => toggle(likeReasons, setLikeReasons, r.k, 2)}
              >
                {r.t}
              </button>
            ))}
          </div>
        </>
      )}

      {liked === false && (
        <>
          <div className="hr" />
          <div className="h2">למה לא אהבת? (עד 2)</div>
          <div className="row">
            {DISLIKE_REASONS.map(r => (
              <button
                key={r.k}
                className={"btn " + (dislikeReasons.includes(r.k) ? "btnDanger" : "")}
                onClick={() => toggle(dislikeReasons, setDislikeReasons, r.k, 2)}
              >
                {r.t}
              </button>
            ))}
          </div>

          <div className="hr" />
          <div className="h2">עד כמה זה לא התאים? (1–5)</div>
          <input className="input" type="range" min="1" max="5" value={severity} onChange={(e) => setSeverity(Number(e.target.value))} />
          <div className="small">חומרה: {severity}</div>

          {dislikeReasons.includes("bad_taste") && (
            <>
              <div className="hr" />
              <div className="h2">מה הפריע בטעם?</div>
              <div className="row">
                {DISLIKE_TASTE.map(t => (
                  <button
                    key={t.k}
                    className={"btn " + (tasteDetail === t.k ? "btnDanger" : "")}
                    onClick={() => setTasteDetail(t.k)}
                  >
                    {t.t}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="hr" />
          <div className="h2">תופעות לוואי (אופציונלי)</div>
          <div className="row">
            <label className="small"><input type="checkbox" checked={sideParanoia} onChange={(e) => setSideParanoia(e.target.checked)} /> פרנויה</label>
            <label className="small"><input type="checkbox" checked={sideDry} onChange={(e) => setSideDry(e.target.checked)} /> יובש</label>
            <label className="small"><input type="checkbox" checked={sideDizzy} onChange={(e) => setSideDizzy(e.target.checked)} /> סחרחורת</label>
          </div>
        </>
      )}

      {liked !== null && (
        <>
          <div className="hr" />
          <div className="h2">סיכום</div>
          <div className="row">
            <input className="input" type="number" step="0.5" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            <input className="input" placeholder="משפט קצר (עד 150 תווים)" value={review} onChange={(e) => setReview(e.target.value)} />
          </div>

          <div style={{ marginTop: 10 }}>
            <button className="btn btnPrimary" onClick={submit}>שמור דיווח</button>
          </div>
        </>
      )}

      {msg && <div className="small" style={{ marginTop: 10 }}>{msg}</div>}

      <div className="hr" />
      <div className="row">
        <a className="btn" href="/recommendations">המלצות</a>
        <a className="btn" href="/onboarding">היכרות</a>
        <a className="btn" href="/">בית</a>
      </div>
    </div>
  );
}
