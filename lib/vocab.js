// The words the app uses. Keys match supabase/pilot_schema.sql and the survey.
// a number range must read left to right inside Hebrew text
const rng = (a, b) => `\u2066${a}–${b}\u2069`;
export const AGE = [["18-24", rng(18, 24)], ["25-34", rng(25, 34)], ["35-44", rng(35, 44)], ["45-54", rng(45, 54)], ["55-64", rng(55, 64)], ["65+", "\u206665+\u2069"]];
export const SEX = [["m", "גבר"], ["f", "אישה"]];
export const YEARS = [["<1", "פחות משנה"], ["1-3", rng(1, 3) + " שנים"], ["3-5", rng(3, 5) + " שנים"], ["5+", "יותר מ־5 שנים"]];
export const GRAMS = [["10-20", rng(10, 20)], ["30", "30"], ["40", "40"], ["50-60", rng(50, 60)], ["70+", "70 ומעלה"]];
export const LICENSE = [["T22/C4", "T22/C4"], ["T18/C3", "T18/C3"], ["T15/C3", "T15/C3"], ["T10/C2", "T10/C2"], ["T10/C10", "T10/C10"],
  ["T5/C10", "T5/C10"], ["T3/C15", "T3/C15"], ["T1/C20", "T1/C20"], ["other", "אחר"]];
export const USES = [["pain", "כאב"], ["sleep", "שינה"], ["anxiety", "לחץ וחרדה"], ["ptsd", "פוסט טראומה"], ["mood", "מצב רוח"],
  ["calm", "הרפיית הגוף"], ["appetite", "תיאבון"], ["nausea", "בחילה"], ["focus", "ריכוז וקשב"]];
export const TIMES = [["morning", "בוקר"], ["noon", "צהריים"], ["evening", "ערב"], ["night", "לפני השינה"]];
export const FLAVORS = [["citrus", "הדרי"], ["sweet", "מתוק"], ["earthy", "אדמתי"], ["pine", "אורן"], ["floral", "פרחוני"], ["spicy", "חריף"]];
export const AVOID = [["daysleep", "נמנום ביום"], ["anxiety", "לחץ או חרדה"], ["racing", "דופק מהיר"], ["fog", "ראש כבד"],
  ["munchies", "רעב חזק"], ["dry", "יובש בפה"]];
export const BUDGETS = [200, 250, 300, 350, 400];

export const VERDICT = { like: "מומלץ", unsure: "לא בטוח", dislike: "לא התאים" };
export const HELPED = [["pain", "כאב"], ["sleep", "שינה"], ["anxiety", "חרדה"], ["relaxation", "רגיעה"], ["mood", "מצב רוח"],
  ["focus", "פוקוס"], ["appetite", "תיאבון"]];
export const BOTHERED = [["dry_mouth", "יובש בפה"], ["anxiety", "חרדה"], ["dizziness", "סחרחורת"], ["sedation", "מרדים מדי"],
  ["racing_heart", "דופק מהיר"], ["fog", "ערפול"], ["bad_taste", "טעם לא טוב"]];
export const CLS = { indica: "אינדיקה", sativa: "סאטיבה", hybrid: "היבריד" };
export const TYPE = { flower: "תפרחת", oil: "שמן", preroll: "גלילות" };

export const label = (list, k) => (list.find(([v]) => v === k) || [k, k])[1];
export const labels = (list, ks) => (ks || []).map(k => label(list, k));

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
export const monthHe = ym => { const m = /^(\d{4})-(\d{2})$/.exec(ym || ""); return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : ""; };
export const dateHe = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
export const productName = (r, byId) => (r.product_id && byId && byId.get(r.product_id) ? byId.get(r.product_id).he : r.product_name) || "זן לא ידוע";
