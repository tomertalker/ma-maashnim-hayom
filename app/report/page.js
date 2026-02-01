"use client";

import { useEffect, useState } from "react";
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

function splitCsv(s) {
  return (s || "").split(",").map(x => x.trim()).filter(Boolean);
}

export default function Report() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [liked, setLiked] = useState(null); // true/false
  const [strainId, setStrainId] = useState("");
  const [msg, setMsg] = useState("");

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

  // load user profile for defaults
  useEffect(() => {
    async function loadProfile() {
      if (!session) return;
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (!error) setProfile(data);
    }
    loadProfile();
  }, [session]);

  function toggle(arr, setArr, v, max = 2) {
    const has = arr.includes(v);
    const next = has ? arr.filter(x => x !== v) : [...arr, v];
    setArr(next.slice(0, max));
  }

  async function submit() {
    setMsg("");
    if (!session) return setMsg("צריך להתחבר.");
    if (!profile) return setMsg("חסר פרופיל. מלא שאלון היכרות קודם.");
    if (!strainId.trim()) return setMsg("הכנס strain_id (למשל S0001).");

    if (liked === true && likeReasons.length === 0) return setMsg("בחר עד 2 סיבות למה אהבת.");
    if (liked === false && dislikeReasons.length === 0) return setMsg("בחר לפחות סיבה אחת למה לא אהבת.");
    if (liked === false && dislikeReasons.includes("bad_taste") && !tasteDetail) return setMsg("בחר מה הפריע בטעם.");

    const defaultGoal =
      profile.default_goal_tag ||
      splitCsv(profile.preferred_direction_tags)[0] ||
      "calm";

    const payload = {
      user_id: session.user.id,
      strain_id: strainId.trim(),

      // default session context from profile
      session_grams: profile.typical_session_grams ?? 0.3,
      is_pure_consumption: profile.mix_preference ?? "tobacco",
      session_goal_tag: defaultGoal,

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
    setLikeReasons([]);
    setDislikeReasons([]);
    setTasteDetail("");
  }

  return (
    <div className="card">
      <div className="h1">דיווח על זן</div>
      <div className="small">בחר “אהבתי” או “לא אהבתי”. פרטי הסשן נלקחים מהפרופיל האישי.</div>

      {!session && <div className="small" style={{ marginTop: 10 }}>צריך להתחבר קודם.</div>}

      {!profile && session && (
        <div className="small" style={{ marginTop: 10 }}>
          חסר פרופיל. קודם מלא <a href="/onboarding">שאלון היכרות</a>.
        </div>
      )}

      <div className="hr" />

      <div className="h2">1) בחר מצב</div>
      <div className="row">
        <button className={"btn " + (liked === true ? "btnPrimary" : "")} onClick={() => setLiked(true)}>✅ אהבתי</button>
        <button className={"btn " + (liked === false ? "btnDanger" : "")} onClick={() => setLiked(false)}>❌ לא אהבתי</button>
      </div>

      <div className="hr" />

      <div className="h2">2) זן</div>
      <input className="input" placeholder="strain_id (למשל S0001)" value={strainId} onChange={(e) => setStrainId(e.target.value)} />

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
                style={{ color: likeReasons.includes(r.k) ? undefined : "#111" }}
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
                style={{ color: dislikeReasons.includes(r.k) ? undefined : "#111" }}
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
                    style={{ color: tasteDetail === t.k ? undefined : "#111" }}
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
