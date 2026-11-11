// Plain-language notes for every terpene the engine knows (keys match TERP in
// lib/engine/engine.mjs). Smell and where else it is found are plain facts.
// What it has been studied for comes from TERP itself, with its evidence tier,
// so the guide and the engine never say different things.
import { TERP, EL, TIER, FLAV_HE } from "./engine/engine.mjs";

export const TERP_INFO = {
  myrcene:            { en: "Myrcene",         smell: "אדמתי ומוסקי, עם נגיעה של פרי בשל", found: "מנגו, כשות, למון גראס, טימין", fact: "הטרפן הנפוץ ביותר בזני קנאביס רבים." },
  limonene:           { en: "Limonene",        smell: "הדרי, כמו קליפת לימון או תפוז", found: "קליפות של לימון, תפוז ואשכולית", fact: "אחד הטרפנים הנפוצים בטבע. משמש גם בתעשיית המזון והבשמים." },
  beta_caryophyllene: { en: "β-Caryophyllene", smell: "חריף ופלפלי, עם נגיעה עצית", found: "פלפל שחור, ציפורן, קינמון, רוזמרין", fact: "ייחודי בין הטרפנים: נקשר ישירות לקולטן CB2, אחד הקולטנים של המערכת האנדוקנבינואידית בגוף." },
  pinene:             { en: "Pinene",          smell: "אורן ומחטים, רענן", found: "מחטי אורן, רוזמרין, בזיליקום, פטרוזיליה", fact: "מהטרפנים הנפוצים ביותר בעולם הצמחים." },
  linalool:           { en: "Linalool",        smell: "פרחוני, כמו לבנדר", found: "לבנדר, כוסברה, בזיליקום", fact: "נפוץ בבשמים ובמוצרי טיפוח." },
  humulene:           { en: "Humulene",        smell: "עצי, אדמתי ומעט מריר", found: "כשות (חלק מהארומה של בירה), מרווה, ג׳ינג׳ר", fact: "קרוב כימית לקריופילן, ולעתים קרובות מופיע לצדו." },
  terpinolene:        { en: "Terpinolene",     smell: "מורכב: פירותי ופרחוני, עם נגיעות של אורן והדרים", found: "עץ התה, הל, אגוז מוסקט, תפוחים", fact: "פחות נפוץ כטרפן מוביל, ומופיע בעיקר בזנים שנחשבים סאטיבה." },
  ocimene:            { en: "Ocimene",         smell: "מתקתק, עשבי ופרחוני", found: "בזיליקום, נענע, פטרוזיליה, מנגו", fact: "השם בא מ־Ocimum, השם המדעי של הבזיליקום." },
  bisabolol:          { en: "α-Bisabolol",     smell: "פרחוני, עדין ומתקתק", found: "קמומיל (בבונג)", fact: "נפוץ בקרמים ובמוצרי טיפוח לעור." },
  farnesene:          { en: "Farnesene",       smell: "ירוק, כמו קליפת תפוח", found: "קליפת תפוח ירוק, בבונג", fact: "חלק מהריח של תפוחים טריים." },
  terpineol:          { en: "Terpineol",       smell: "פרחוני, כמו לילך, עם נגיעת אורן", found: "פרחי לילך, עץ התה, אורן", fact: "משמש בבשמים ובסבונים." },
  nerolidol:          { en: "Nerolidol",       smell: "עצי ופרחוני, כמו קליפת עץ", found: "ג׳ינג׳ר, יסמין, עץ התה, למון גראס", fact: "מופיע בדרך כלל בכמויות קטנות." },
  fenchol:            { en: "Fenchol",         smell: "אורן וקמפור, עשבי", found: "בזיליקום", fact: "מופיע בדרך כלל בכמויות קטנות." },
  selinene:           { en: "Selinene",        smell: "עשבי ועצי", found: "זרעי סלרי", fact: "מופיע בדרך כלל בכמויות קטנות." },
  germacrene:         { en: "Germacrene",      smell: "עצי וחריף", found: "צמחי תבלין ועצים רבים", fact: "בצמחים הוא חלק ממנגנון ההגנה מפני חרקים." },
  guaiol:             { en: "Guaiol",          smell: "עצי ואורני, עם נגיעה של ורד", found: "עץ הגואיאק, ברוש", fact: "מופיע בדרך כלל בכמויות קטנות." },
  cymene:             { en: "p-Cymene",        smell: "הדרי ועצי", found: "כמון, טימין", fact: "מופיע בדרך כלל בכמויות קטנות." },
};

// [{t: "שינה", tier: "B", tierHe: "ראשוני"}] — what research has looked at, from the engine's table
export function studied(k) {
  const e = (TERP[k] && TERP[k].e) || {};
  return Object.entries(e).sort((a, b) => b[1][0] - a[1][0]).map(([eff, [, tier]]) => ({ t: EL[eff], tier, tierHe: TIER[tier] }));
}
export const flavorsOf = k => ((TERP[k] && TERP[k].fl) || []).map(f => FLAV_HE[f]);
export const terpName = k => (TERP[k] ? TERP[k].he : k);
// the guide lists the terpenes by how often they lead a cannabis profile, roughly
export const TERP_ORDER = ["myrcene", "beta_caryophyllene", "limonene", "pinene", "linalool", "humulene", "terpinolene", "ocimene",
  "bisabolol", "farnesene", "terpineol", "nerolidol", "fenchol", "guaiol", "germacrene", "selinene", "cymene"];
