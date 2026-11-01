// Every call to the backend goes through here. The backend is a set of
// Postgres functions; each returns {ok:true,...} or {error:"code"}.
import { API_URL, API_KEY } from "./config";

const KEY = "mmh.session";
let session = null;          // {token, nick}
let onAuthLost = null;

export function loadSession() {
  if (session) return session;
  try { session = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { session = null; }
  return session;
}
export function setSession(s) {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch {}
}
export function setAuthLostHandler(fn) { onAuthLost = fn; }

export const ERR = {
  network: "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.",
  auth: "צריך להתחבר מחדש.",
  nick_invalid: "כינוי של 2 עד 20 תווים: אותיות בעברית או באנגלית, ספרות, רווח, נקודה, מקף או קו תחתון.",
  nick_taken: "הכינוי הזה תפוס. נסו כינוי אחר.",
  pass_invalid: "סיסמה של 6 תווים לפחות, לא סיסמה נפוצה כמו 123456 ולא זהה לכינוי.",
  invite_required: "קוד הפיילוט חסר או שגוי. הקוד מופיע אצל הרוקח.",
  busy: "יש עומס הרשמות כרגע. נסו שוב בעוד כמה דקות.",
  bad_login: "הכינוי או הסיסמה לא נכונים.",
  locked: "יותר מדי ניסיונות עם סיסמה שגויה. נסו שוב בעוד רבע שעה, או פנו לצוות הפיילוט.",
  too_many: "הגעתם למגבלת הדיווחים או התמונות לחשבון. אם זו טעות, פנו לצוות הפיילוט.",
  card_incomplete: "חסרים פרטים בכרטיס: גיל ולפחות סיבת שימוש אחת.",
  card_invalid: "הכרטיס לא נשמר. נסו שוב.",
  product_unknown: "הזן הזה כבר לא בקטלוג.",
  product_missing: "צריך לבחור זן או לכתוב את שמו.",
  review_invalid: "הדיווח לא נשמר. נסו שוב.",
  not_found: "הפריט לא נמצא.",
  photo_limit: "אפשר לצרף עד 3 תמונות לדיווח.",
  photo_invalid: "התמונה לא נקלטה. נסו תמונה אחרת.",
  photo_too_big: "התמונה גדולה מדי.",
  server: "משהו השתבש בשרת. נסו שוב.",
};
export const errText = code => ERR[code] || ERR.server;

// returns the function's JSON; never throws
export async function rpc(fn, args = {}, { auth = true } = {}) {
  const body = { ...args };
  if (auth) {
    const s = loadSession();
    if (!s) return { error: "auth" };
    body.p_token = s.token;
  }
  let res;
  try {
    res = await fetch(`${API_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { return { error: "network" }; }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || data == null || typeof data !== "object") return { error: "server", status: res.status, detail: data };
  if (data.error === "auth" && auth) { setSession(null); if (onAuthLost) onAuthLost(); }
  return data;
}
