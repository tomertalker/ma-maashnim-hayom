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

export default function Report() {
  const searchParams = useSearchParams();

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [liked, setLiked] = useState(null); // true/false
  const [msg, setMsg] = useState("");

  // ✅ בחירת זן (ללא ID ידני)
  const [products, setProducts] = useState([]);
  const [strainId, setStrainId] = useState("");
  const [strainQuery, setStrainQuery] = useState("");
  const [strainNameFree, setStrainNameFree] = useState("");
  const [isCustomStrain, setIsCustomStrain] = useState(false);

  // defaults from profile (לא חייבים להראות למשתמש)
  const [grams, setGrams] = useState(0.3);
  const [mix, setMix] = useState("tobacco");
  const [goal, setGoal] = useState("calm");

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

  const [duration, setDuration] = useState(2);
  const [review, setReview] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  // load profile defaults
  useEffect(() => {
    async function loadProfileAndDefaults() {
      if (!session) return;

      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (!error && data) {
        setProfile(data);

        // ברירות מחדל (אם קיימות אצלך בפרופיל)
        if (typeof data.typical_session_grams === "number") setGrams(data.typical_session_grams);

        // mix_preference: "tobacco" / "pure"
        if (data.mix_preference) setMix(data.mix_preference);

        // preferred_direction_tags לדוגמה: "calm,focus"
        const firstGoal = (data.preferred_direction_tags || "").split(",")[0]?.trim();
        if (firstGoal) setGoal(firstGoal);
      }
    }
    loadProfileAndDefaults();
  }, [session]);

  // load products list (for searching by name)
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

  // if arriving from /recommendations "קניתי"
  useEffect(() => {
    const sid = searchParams.get("strain_id");
    if (sid) {
      setStrainId(sid);
      setIsCustomStrain(false);
      setStrainNameFree("");
    }
  }, [searchParams]);

  function toggle(arr, setArr, v, max = 2) {
    const has = arr.includes(v);
    const next = has ? arr.filter(x => x !== v) : [...arr, v];
    setArr(next.slice(0, max));
  }

  const filteredProducts = useMemo(() => {
    const q = strainQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p =>
        (p.name_he || "").toLowerCase().includes(q) ||
        (p.name_en || "").toLowerCase().includes(q) ||
        (p.strain_id || "").toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [strainQuery, products]);

  async function submit() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר.");

    if (!strainId.trim() && !strainNameFree.trim()) {
      return setMsg("בחר זן מהרשימה או כתוב שם חופשי.");
    }

    if (liked === true && likeReasons.length === 0) return setMsg("בחר עד 2 סיבות למה אהבת.");
    if (liked === false && dislikeReasons.length === 0) return setMsg("בחר לפחות סיבה אחת למה לא אהבת.");
    if (liked === false && dislikeReasons.includes("bad_taste") && !tasteDetail) return setMsg("בחר מה הפריע בטעם.");

    // ✅ אם זה זן מותאם אישית – נייצר ID פנימי כדי לא ליפול על NOT NULL
    const customId =
      "CUSTOM_" + session.user.id.slice(0, 6) + "_" + String(Date.now()).slice(-6);

    const finalStrainId = isCustomStrain ? customId : strainId.trim();

    const payload = {
      user_id: session.user.id,

      strain_id: finalStrainId,
      strain_name_free_text: isCustomStrain ? strainNameFree.trim().slice(0, 80) : null,
      strain_is_custom: isCustomStrain,

      // defaults (מהפרופיל, בלי לשאול כל פעם)
      session_grams: grams,
      is_pure_consumption: mix,
      session_goal_tag: goal,

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
    setLiked(null);

    setStrainId("");
    setStrainQuery("");
    setStrainNameFree("");
    setIsCustomStrain(false);
  }

  return (
    <div className="card">
      <div className="h1">דיווח על זן</div>
      <div className="small">בחר “אהבתי” או “לא אהבתי”. אין צורך להקליד ID – אפשר לבחור לפי שם.</div>

      {!session && <div className="small" style={{ marginTop: 10 }}>צריך להתחבר קודם.</div>}

      <div className="hr" />

      <div className="h2">1) בחר מצב</div>
      <div className="row">
        <button className={"btn " + (liked === true ? "btnPrimary" : "")} onClick={() => setLiked(true)}>✅ אהבתי</button>
        <button className={"btn " + (liked === false ? "btnDanger" : "")} onClick={() => setLiked(false)}>❌ לא אהבתי</button>
      </div>

      <div className="hr" />

      <div className="h2">2) בחירת זן</div>

      {strainId && !isCustomStrain && (
        <div className="small" style={{ marginBottom: 8 }}>
          נבחר אוטומטית/נבחר מהרשימה: <b>{strainId}</b>
        </div>
      )}

      <input
        className="input"
        placeholder="חפש לפי שם (עברית/אנגלית) או ID…"
        value={strainQuery}
        onChange={(e) => setStrainQuery(e.target.value)}
      />

      <div className="list" style={{ marginTop: 10, maxHeight: 220, overflowY: "auto" }}>
        {filteredProducts.map(p => (
          <button
            key={p.strain_id}
            className="btn"
            style={{ textAlign: "left", display: "flex", justifyContent: "space-between", gap: 12 }}
            onClick={() => {
              setStrainId(p.strain_id);
              setIsCustomStrain(false);
              setStrainNameFree("");
            }}
          >
            <div>
              <div style={{ fontWeight: 800 }}>{p.name_he || p.name_en || p.strain_id}</div>
              <div className="small">{p.strain_id}</div>
            </div>
            <span className="badge">בחר</span>
          </button>
        ))}

        {strainQuery.trim() && filteredProducts.length === 0 && (
          <div className="small" style={{ padding: 10 }}>
            לא נמצאו תוצאות לחיפוש הזה.
          </div>
        )}
      </div>

      <div className="hr" />

      <div className="h2">לא מצאת? דווח לפי שם (מותאם אישית)</div>
      <input
        className="input"
        placeholder="כתוב שם זן חופשי…"
        value={strainNameFree}
        onChange={(e) => {
          setStrainNameFree(e.target.value);
          setIsCustomStrain(true);
          setStrainId("");
        }}
      />
      <div className="small" style={{ marginTop: 6 }}>
        נשמור את זה כזן “מותאם אישית” כדי שתוכל להוסיף אותו ל־inventory מאוחר יותר.
      </div>

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
            <label className="small">
              <input type="checkbox" checked={sideParanoia} onChange={(e) => setSideParanoia(e.target.checked)} /> פרנויה
            </label>
            <label className="small">
              <input type="checkbox" checked={sideDry} onChange={(e) => setSideDry(e.target.checked)} /> יובש
            </label>
            <label className="small">
              <input type="checkbox" checked={sideDizzy} onChange={(e) => setSideDizzy(e.target.checked)} /> סחרחורת
            </label>
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
