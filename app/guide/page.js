"use client";
// The guide: what terpenes are, every terpene the app shows, and the few words
// the strain page uses. The short answer sits on the strain page (tap a
// terpene); this is the place to read more.
import { useEffect, useMemo } from "react";
import { useApp } from "../../components/AppContext";
import { TerpBody } from "../../components/Terp";
import { TERP_INFO, TERP_ORDER, terpName } from "../../lib/terpenes";
import { normTerp } from "../../lib/engine/engine.mjs";
import { PHARMACY } from "../../lib/config";

export default function Guide() {
  const { catalog } = useApp();

  // how many products in stock list each terpene
  const count = useMemo(() => {
    const m = {};
    for (const p of (catalog && catalog.products) || []) {
      for (const k of new Set((p.terps || []).map(t => normTerp(t.i)).filter(Boolean))) m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [catalog]);

  // opened from a strain page at #limonene: scroll to that card once it is drawn
  useEffect(() => {
    const id = decodeURIComponent((window.location.hash || "").slice(1));
    if (!id) return;
    const t = setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ block: "start" }); }, 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="guide">
      <div className="top"><h1>מדריך</h1></div>

      <div className="card">
        <h3>מה זה טרפנים?</h3>
        <p style={{ margin: "8px 0 0" }}>
          טרפנים הם החומרים שנותנים לצמח את הריח והטעם שלו. הם לא רק בקנאביס: לימונן נמצא בקליפת הלימון, לינאלול בלבנדר, פינן במחטי אורן.
          בכל זן קנאביס יש הרכב אחר של טרפנים, ולכן לזנים יש ריח וטעם שונים.
        </p>
        <p style={{ margin: "8px 0 0" }}>
          יש מחקר שבודק אם טרפנים משפיעים גם על החוויה, למשל על שינה או על מצב הרוח. רובו עדיין ראשוני, במעבדה או בבעלי חיים.
          לכן ליד כל קשר כזה באפליקציה כתוב כמה הוא מבוסס, ואף אחד מהם לא מסומן ״מבוסס״.
        </p>
      </div>

      <div className="card">
        <h3>איך לקרוא את דף הזן</h3>
        <dl>
          <dt>אחוז ליד טרפן</dt><dd>כמה ממנו נמדד בתפרחת, לפי נתוני המוצר. בדרך כלל פחות מ־2%. כשאין אחוזים, הסדר ברשימה לא אומר מה דומיננטי.</dd>
          <dt>ראשוני</dt><dd>יש מחקרים ראשונים, בעיקר במעבדה או בבעלי חיים.</dd>
          <dt>אנקדוטלי</dt><dd>נשען בעיקר על דיווחים של משתמשים, בלי מחקר מסודר.</dd>
          <dt>קהילה</dt><dd>מה שמטופלים אחרים באפליקציה דיווחו (רק דיווחים שנבדקו).</dd>
          <dt>גנטיקה</dt><dd>הזנים שהוכלאו כדי ליצור את הזן. זן שחולק הורה עם זן שאהבת מקבל ניקוד גבוה יותר.</dd>
          <dt>אינדיקה, סאטיבה, היבריד</dt><dd>סיווג מסורתי לפי מבנה הצמח. הוא מנבא את ההשפעה רק באופן חלקי, ולכן הוא רק חלק קטן מהחישוב.</dd>
        </dl>
      </div>

      <h2 className="h2">הטרפנים באפליקציה</h2>
      {TERP_ORDER.filter(k => TERP_INFO[k]).map(k => (
        <div className="card" id={k} key={k}>
          <div className="row">
            <h3 className="grow">{terpName(k)} <span className="en muted small" style={{ fontWeight: 400 }}>{TERP_INFO[k].en}</span></h3>
            {count[k] ? <span className="tag">ב־{count[k]} מוצרים</span> : null}
          </div>
          <TerpBody k={k} />
        </div>
      ))}

      <p className="small muted" style={{ marginTop: 22 }}>
        ״ב־X מוצרים״: כמה מוצרים במלאי של {PHARMACY} מפרסמים את הטרפן ברשימה שלהם. המדריך הוא מידע כללי ואינו ייעוץ רפואי.
      </p>
    </div>
  );
}
