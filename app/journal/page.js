"use client";
// "שלי": what works for me, my card, my reports and my settings, on one screen.
// (Until v3 the card and the settings were a separate tab that repeated the
// card wizard as a table.)
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "../../components/AppContext";
import { PasswordInput, Sheet, Stamp, Stars, Switch } from "../../components/ui";
import { Photos } from "../../components/Photo";
import { rpc, errText } from "../../lib/api";
import { CLS, HELPED, BOTHERED, USES, GRAMS, TIMES, FLAVORS, AVOID, VERDICT, label, labels, dateHe } from "../../lib/vocab";
import { APP_VERSION, PHARMACY } from "../../lib/config";

function status(r) {
  if (r.rejected) return <span className="tag bad">לא אושר לפיד</span>;
  if (r.hidden) return <span className="tag bad">הוסר מהפיד לבדיקה</span>;
  if (r.publish && !r.approved) return <span className="tag warn">ממתין לאישור לפיד</span>;
  return <span className="tag">{r.publish ? "מופיע בפיד" : "פרטי"}</span>;
}

export default function Mine() {
  const { me, setMe, session, catalog, reviews, refreshReviews, refreshStats, signOut, signOutLocal, say } = useApp();
  const [doctor, setDoctor] = useState(false);
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState(null);     // "pass" | "delete"
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const byId = catalog ? catalog.byId : new Map();
  const nameOf = r => (r.product_id && byId.get(r.product_id) ? byId.get(r.product_id).he : r.product_name) || "זן לא ידוע";
  const c = me.card || {};

  const sum = useMemo(() => {
    const n = { like: 0, unsure: 0, dislike: 0, pending: 0 }, helped = {}, bothered = {};
    for (const r of reviews) {
      n[r.verdict || "pending"]++;
      if (r.verdict === "like") for (const k of r.helped || []) helped[k] = (helped[k] || 0) + 1;
      for (const k of r.bothered || []) bothered[k] = (bothered[k] || 0) + 1;
    }
    const top = o => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k);
    return { n, helped: top(helped), bothered: top(bothered) };
  }, [reviews]);

  // the card in one short block; the full form is one tap away
  const cardLine = [
    labels(USES, c.uses).join(", "),
    c.times && c.times.length ? labels(TIMES, c.times).join(", ") : null,
    c.flavors && c.flavors.length ? "טעמים: " + labels(FLAVORS, c.flavors).join(", ") : null,
    c.avoid && c.avoid.length ? "להימנע מ" + labels(AVOID, c.avoid).join(", ") : null,
    c.budget ? `עד ${c.budget} ₪` : null,
  ].filter(Boolean);

  async function again(r) {
    setBusy(r.id);
    const out = await rpc("mmh_save_review", { p_review: { id: r.id, bought: true } });
    await Promise.all([refreshReviews(), refreshStats()]);
    setBusy("");
    say(out.ok ? `נרשם: נקנה ${out.review.buys} פעמים` : errText(out.error));
  }
  async function setShare(share, ctx) {
    const r = await rpc("mmh_save_card", { p_card: me.card, p_share: share, p_share_context: share && ctx });
    if (r.error) return say(errText(r.error));
    setMe(r); say("נשמר. חל על דיווחים חדשים");
  }
  const open = s => { setSheet(s); setA(""); setB(""); setErr(""); setShow(false); };
  async function changePass() {
    setErr(""); if (b.length < 6) return setErr(errText("pass_invalid"));
    setBusy("pass"); const r = await rpc("mmh_change_password", { p_old: a, p_new: b }); setBusy("");
    if (r.error) return setErr(r.error === "bad_login" ? "הסיסמה הנוכחית לא נכונה." : errText(r.error));
    setSheet(null); say("הסיסמה הוחלפה");
  }
  async function deleteAccount() {
    setErr(""); setBusy("del"); const r = await rpc("mmh_delete_account", { p_pass: a }); setBusy("");
    if (r.error) return setErr(r.error === "bad_login" ? "הסיסמה לא נכונה." : errText(r.error));
    signOutLocal();
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
      <div className="top"><h1>שלי</h1>{reviews.some(r => r.verdict) ? <button className="btn sm" onClick={() => setDoctor(true)}>דוח לרופא</button> : null}</div>
      <p className="sub">מחובר בכינוי <b>{session.nick}</b>. הכינוי לא מוצג בפיד.</p>

      {reviews.length ? (
        <div className="card">
          <div className="tags">
            <span className="tag good">{sum.n.like} מומלצים</span>
            {sum.n.unsure ? <span className="tag">{sum.n.unsure} לא בטוח</span> : null}
            {sum.n.dislike ? <span className="tag bad">{sum.n.dislike} לא התאימו</span> : null}
            {sum.n.pending ? <span className="tag">{sum.n.pending} מחכים לדירוג</span> : null}
          </div>
          {sum.helped.length ? <p className="small" style={{ margin: "10px 0 0" }}>מה שעובד לך הכי טוב: <b>{labels(HELPED, sum.helped).join(", ")}</b></p> : null}
          {sum.bothered.length ? <p className="small muted" style={{ margin: "4px 0 0" }}>מה שמפריע לך בדרך כלל: {labels(BOTHERED, sum.bothered).join(", ")}</p> : null}
        </div>
      ) : null}

      <div className="card">
        <div className="row top-al">
          <div className="grow">
            <b>הכרטיס שלך</b>
            <div className="small muted" style={{ marginTop: 2 }}>{cardLine.join(" | ") || "עוד לא מולא"}</div>
          </div>
          <Link href="/card/" className="btn sm">עריכה</Link>
        </div>
      </div>

      <h2 className="h2">הדיווחים שלך{reviews.length ? ` (${reviews.length})` : ""}</h2>
      {!reviews.length ? (
        <div className="empty"><b>עוד אין דיווחים</b>כל קנייה שמדווחים עליה נשמרת כאן ומשפרת את ההמלצות.
          <div><Link href="/report/" className="btn primary">לדווח על קנייה</Link></div></div>
      ) : null}
      {reviews.map(r => {
        const p = r.product_id && byId.get(r.product_id);
        return (
          <article key={r.id} className={"label" + (p && p.cls ? " cls-" + p.cls : "")}>
            <div className="row top-al">
              <div className="grow">
                {p ? <Link href={`/strain/?id=${encodeURIComponent(p.id)}`} className="name">{p.he}</Link> : <div className="name">{nameOf(r)}</div>}
                <div className="tags" style={{ marginTop: 8 }}>
                  <span className="tag">{r.buys === 1 ? "נקנה פעם אחת" : `נקנה ${r.buys} פעמים`}</span>
                  {status(r)}
                  {r.verified && r.publish && !r.hidden ? <span className="tag ok">✓ רכישה מאומתת</span> : null}
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

      <h2 className="h2">שיתוף בפיד</h2>
      <div className="card">
        <Switch checked={!!me.share_default} onChange={v => setShare(v, me.share_context_default)} title="לשתף דיווחים חדשים בפיד, באופן אנונימי" hint="ברירת המחדל לדיווח חדש. אפשר לשנות בכל דיווח בנפרד. כל דיווח נבדק לפני שהוא מופיע לאחרים." />
        {me.share_default ? <Switch checked={!!me.share_context_default} onChange={v => setShare(true, v)} title="להציג גם סיבת שימוש ומינון" hint="בקבוצה קטנה של מכרים זה עלול לרמוז מי כתב." /> : null}
      </div>

      <h2 className="h2">החשבון</h2>
      <div className="list">
        <button type="button" onClick={() => open("pass")}><span className="t"><b>החלפת סיסמה</b></span></button>
        <button type="button" onClick={() => signOut()}><span className="t"><b>יציאה מהחשבון</b><small>הכרטיס והדיווחים נשמרים. נכנסים שוב עם הכינוי והסיסמה.</small></span></button>
        <button type="button" onClick={() => open("delete")}><span className="t"><b style={{ color: "var(--bad)" }}>מחיקת החשבון וכל הנתונים</b></span></button>
      </div>

      <p className="small muted" style={{ marginTop: 22 }}>
        פיילוט ב{PHARMACY}. האפליקציה אינה ייעוץ רפואי ואינה מחליפה רופא או רוקח. ההמלצות מבוססות על נתוני המוצרים ועל דיווחי מטופלים. גרסה {APP_VERSION}.
      </p>

      {sheet === "pass" ? (
        <Sheet title="החלפת סיסמה" onClose={() => setSheet(null)}>
          <div className="stack">
            <label className="field"><span>הסיסמה הנוכחית</span><PasswordInput value={a} onChange={setA} show={show} setShow={setShow} autoComplete="current-password" /></label>
            <label className="field"><span>סיסמה חדשה</span><PasswordInput value={b} onChange={setB} show={show} setShow={setShow} autoComplete="new-password" placeholder="6 תווים לפחות" />
              <small>מכשירים אחרים שמחוברים לחשבון ינותקו.</small></label>
            {err ? <div className="err-box" role="alert">{err}</div> : null}
            <button className="btn primary block" disabled={busy === "pass"} onClick={changePass}>להחליף סיסמה</button>
            <button className="btn block" onClick={() => setSheet(null)}>ביטול</button>
          </div>
        </Sheet>
      ) : null}
      {sheet === "delete" ? (
        <Sheet title="מחיקת החשבון" onClose={() => setSheet(null)}>
          <div className="stack">
            <div className="note">הכרטיס, כל הדיווחים וכל התמונות יימחקו לצמיתות, כולל מה שמופיע בפיד. אי אפשר לשחזר.</div>
            <label className="field"><span>לאישור, הסיסמה שלך</span><PasswordInput value={a} onChange={setA} show={show} setShow={setShow} autoComplete="current-password" /></label>
            {err ? <div className="err-box" role="alert">{err}</div> : null}
            <button className="btn block danger" disabled={busy === "del" || !a} onClick={deleteAccount}>למחוק הכל לצמיתות</button>
            <button className="btn block" onClick={() => setSheet(null)}>ביטול</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
