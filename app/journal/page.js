"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "../../components/AppContext";
import { Stamp, Stars } from "../../components/ui";
import { Photos } from "../../components/Photo";
import { rpc, errText } from "../../lib/api";
import { CLS, HELPED, BOTHERED, USES, GRAMS, VERDICT, label, labels, dateHe } from "../../lib/vocab";

export default function Journal() {
  const { me, catalog, reviews, refreshReviews, refreshStats, say } = useApp();
  const [doctor, setDoctor] = useState(false);
  const [busy, setBusy] = useState("");
  const byId = catalog ? catalog.byId : new Map();
  const nameOf = r => (r.product_id && byId.get(r.product_id) ? byId.get(r.product_id).he : r.product_name) || "זן לא ידוע";

  const sum = useMemo(() => {
    const c = { like: 0, unsure: 0, dislike: 0, pending: 0 }, helped = {}, bothered = {};
    for (const r of reviews) {
      c[r.verdict || "pending"]++;
      if (r.verdict === "like") for (const k of r.helped || []) helped[k] = (helped[k] || 0) + 1;
      for (const k of r.bothered || []) bothered[k] = (bothered[k] || 0) + 1;
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    return { c, helped: top(helped), bothered: top(bothered) };
  }, [reviews]);

  async function again(r) {
    setBusy(r.id);
    const out = await rpc("mmh_save_review", { p_review: { id: r.id, bought: true } });
    await Promise.all([refreshReviews(), refreshStats()]);
    setBusy("");
    say(out.ok ? `נרשם: נקנה ${out.review.buys} פעמים` : errText(out.error));
  }

  if (doctor) {
    const done = reviews.filter(r => r.verdict);
    return (
      <>
        <div className="top no-print">
          <h1>דוח לרופא</h1>
          <button className="btn sm" onClick={() => setDoctor(false)}>חזרה</button>
          <button className="btn sm primary" onClick={() => window.print()}>הדפסה או PDF</button>
        </div>
        <div className="card">
          <b>סיכום שימוש בקנאביס רפואי</b>
          <div className="small muted">הופק ב־{dateHe(new Date().toISOString())}, מדיווח עצמי של המטופל באפליקציית ״מה מעשנים היום״.</div>
          {me.card ? <div className="small" style={{ marginTop: 8 }}>
            סיבות שימוש: {labels(USES, me.card.uses).join(", ") || "לא צוין"}{me.card.grams ? ` | מינון: ${label(GRAMS, me.card.grams)} גרם בחודש` : ""}{me.card.license && me.card.license.length ? ` | רישיון: ${me.card.license.join(", ")}` : ""}
          </div> : null}
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="report">
              <thead><tr><th>זן</th><th>חוות דעת</th><th>כוכבים</th><th>עזר</th><th>הפריע</th><th>קניות</th></tr></thead>
              <tbody>
                {done.map(r => { const p = r.product_id && byId.get(r.product_id); return (
                  <tr key={r.id}>
                    <td><b>{nameOf(r)}</b>{p ? <div className="small muted"><span className="en">{p.cat}</span> {CLS[p.cls] || ""}</div> : null}</td>
                    <td>{VERDICT[r.verdict]}</td><td className="num">{r.stars || ""}</td>
                    <td>{labels(HELPED, r.helped).join(", ")}</td><td>{labels(BOTHERED, r.bothered).join(", ")}</td><td className="num">{r.buys}</td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
          {!done.length ? <p className="muted">אין עדיין זנים מדורגים.</p> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="top"><h1>היומן שלי</h1>{reviews.some(r => r.verdict) ? <button className="btn sm" onClick={() => setDoctor(true)}>דוח לרופא</button> : null}</div>

      {!reviews.length ? (
        <div className="empty"><b>היומן ריק</b>כל קנייה שמדווחים עליה נשמרת כאן ומשפרת את ההמלצות.
          <div><Link href="/report/" className="btn primary">לדווח על קנייה</Link></div></div>
      ) : (
        <div className="card">
          <div className="tags">
            <span className="tag good">{sum.c.like} מומלצים</span>
            {sum.c.unsure ? <span className="tag">{sum.c.unsure} לא בטוח</span> : null}
            {sum.c.dislike ? <span className="tag bad">{sum.c.dislike} לא התאימו</span> : null}
            {sum.c.pending ? <span className="tag">{sum.c.pending} מחכים לדירוג</span> : null}
          </div>
          {sum.helped.length ? <p className="small" style={{ margin: "10px 0 0" }}>מה שעובד לך הכי טוב: <b>{labels(HELPED, sum.helped).join(", ")}</b></p> : null}
          {sum.bothered.length ? <p className="small muted" style={{ margin: "4px 0 0" }}>מה שמפריע לך בדרך כלל: {labels(BOTHERED, sum.bothered).join(", ")}</p> : null}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {reviews.map(r => {
          const p = r.product_id && byId.get(r.product_id);
          return (
            <article key={r.id} className={"label" + (p && p.cls ? " cls-" + p.cls : "")}>
              <div className="row top-al">
                <div className="grow">
                  {p ? <Link href={`/strain/?id=${encodeURIComponent(p.id)}`} className="name">{p.he}</Link> : <div className="name">{nameOf(r)}</div>}
                  <div className="tags" style={{ marginTop: 8 }}>
                    <span className="tag">{r.buys === 1 ? "נקנה פעם אחת" : `נקנה ${r.buys} פעמים`}</span>
                    {r.hidden ? <span className="tag bad">הוסר מהפיד לבדיקה</span> : <span className="tag">{r.publish ? "מופיע בפיד" : "פרטי"}</span>}
                  </div>
                </div>
                <Stamp verdict={r.verdict} />
              </div>
              {r.stars ? <div style={{ marginTop: 10 }}><Stars value={r.stars} /></div> : null}
              {r.helped.length ? <div className="tags" style={{ marginTop: 10 }}><span className="small muted">עזר ל:</span>{r.helped.map(k => <span key={k} className="tag good">{label(HELPED, k)}</span>)}</div> : null}
              {r.bothered.length ? <div className="tags" style={{ marginTop: 8 }}><span className="small muted">הפריע:</span>{r.bothered.map(k => <span key={k} className="tag bad">{label(BOTHERED, k)}</span>)}</div> : null}
              {r.note ? <p className="text">{r.note}</p> : null}
              <Photos ids={r.photos} />
              <div className="who">
                <span className="ctx">עודכן ב־{dateHe(r.updated_at)}</span>
                <button type="button" className="btn sm" disabled={busy === r.id} onClick={() => again(r)}>קניתי שוב</button>
                <Link href={`/report/?rid=${r.id}`} className="btn sm primary">{r.verdict ? "עריכה" : "לדרג"}</Link>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
