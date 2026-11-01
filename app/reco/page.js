"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "../../components/AppContext";
import { useReco } from "../../components/useReco";
import { Why } from "../../components/Why";
import { Seg, Stamp } from "../../components/ui";
import { CLS, dateHe } from "../../lib/vocab";
import { PHARMACY } from "../../lib/config";

export default function Reco() {
  const { me, catalog, reviews } = useApp();
  const [tab, setTab] = useState("new");
  const [cls, setCls] = useState("all");
  const [allCats, setAllCats] = useState(false);
  const [inBudget, setInBudget] = useState(false);
  const [shown, setShown] = useState(12);
  const reco = useReco({ allCategories: allCats, budgetHard: inBudget || undefined });

  const rows = useMemo(() => {
    if (!reco) return [];
    return reco.rows.filter(r => (tab === "new" ? r.status === "new" || r.status === "pending" : r.status === "like"))
      .filter(r => cls === "all" || r.p.cls === cls);
  }, [reco, tab, cls]);
  const liked = reviews.filter(r => r.verdict === "like").length;
  const budget = me.card && me.card.budget;

  if (!catalog || !catalog.products.length) {
    return (<><div className="top"><h1>המלצות בשבילך</h1></div>
      <div className="empty"><b>הקטלוג עוד לא נטען</b>רשימת המוצרים של {PHARMACY} תופיע כאן אחרי שצוות הפיילוט יטען אותה.</div></>);
  }

  return (
    <>
      <div className="top"><h1>המלצות בשבילך</h1></div>
      <p className="sub">לפי הכרטיס שלך{liked ? ` ו־${liked} זנים שאהבת` : ""}. מלאי {PHARMACY}{catalog.fetchedAt ? `, נכון ל־${dateHe(catalog.fetchedAt)}` : ""}.</p>

      <Seg options={[["new", "חדש בשבילך"], ["like", "כבר אהבת"]]} value={tab} onChange={v => { setTab(v); setShown(12); }} />
      <div className="filters" style={{ marginTop: 10 }} role="group" aria-label="סינון">
        {[["all", "הכל"], ["indica", CLS.indica], ["hybrid", CLS.hybrid], ["sativa", CLS.sativa]].map(([v, l]) =>
          <button key={v} type="button" className="chip" aria-pressed={cls === v} onClick={() => { setCls(v); setShown(12); }}>{l}</button>)}
        {budget ? <button type="button" className="chip num" aria-pressed={inBudget} onClick={() => setInBudget(!inBudget)}>עד {budget} ₪</button> : null}
        <button type="button" className="chip" aria-pressed={allCats} onClick={() => setAllCats(!allCats)}>כל הקטגוריות</button>
      </div>

      {!liked && tab === "new" ? (
        <div className="note" style={{ marginBottom: 12 }}>
          עוד לא סימנת זנים שאהבת, אז הדירוג נשען על הכרטיס בלבד. כל דיווח משפר אותו. <Link href="/report/" style={{ fontWeight: 700, textDecoration: "underline" }}>לדווח על זן</Link>
        </div>
      ) : null}

      {tab === "new" && rows.length && rows[0].ex.G.length ? <div className="note" style={{ marginBottom: 12 }}>{rows[0].ex.G[0]}</div> : null}

      {!rows.length ? (
        <div className="empty"><b>{tab === "like" ? "עוד אין זנים שסימנת כמומלצים" : "אין זנים שמתאימים לסינון"}</b>
          {tab === "like" ? "זנים שתסמנו כמומלצים יופיעו כאן, מדורגים." : "אפשר להסיר סינון או לבחור \"כל הקטגוריות\"."}</div>
      ) : null}

      {rows.slice(0, shown).map((r, i) => (
        <Link key={r.p.id} href={`/strain/?id=${encodeURIComponent(r.p.id)}&from=reco`} className={"label cls-" + (r.p.cls || "")}>
          <div className="row top-al">
            <div className="grow">
              <div className="name">{r.p.he}{r.p.en ? <span className="en">{r.p.en}</span> : null}</div>
              <div className="tags" style={{ marginTop: 8 }}>
                {r.p.cls ? <span className={"tag cls-" + r.p.cls}>{CLS[r.p.cls]}</span> : null}
                <span className="tag en">{r.p.cat}</span>
                {r.p.price ? <span className={"tag num" + (r.overBudget ? " bad" : "")}>{r.p.price} ₪</span> : null}
                {r.stats && r.stats.like ? <span className="tag good">{r.stats.like} המליצו</span> : null}
              </div>
            </div>
            {r.status === "pending" ? <Stamp verdict={null} /> : <div className="match"><b className="num">{r.disp}%</b><small>התאמה</small></div>}
          </div>
          <Why ex={r.ex} max={i < 3 ? 3 : 2} />
        </Link>
      ))}
      {rows.length > shown ? <div className="center" style={{ marginTop: 14 }}><button className="btn" onClick={() => setShown(shown + 12)}>להציג עוד ({rows.length - shown})</button></div> : null}

      <p className="small muted" style={{ marginTop: 22 }}>
        איך זה מחושב: טרפנים מול מה שחשוב לך, קרבה גנטית לזנים שאהבת, אינדיקה או סאטיבה מול שעות השימוש, וטעם. הקשר בין טרפנים להשפעה נשען על מחקר ראשוני ועל דיווחים, ולכן ליד כל נימוק מופיעה רמת הביסוס שלו. זו לא המלצה רפואית.
      </p>
    </>
  );
}
