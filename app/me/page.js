"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "../../components/AppContext";
import { PasswordInput, Sheet, Switch } from "../../components/ui";
import { rpc, errText } from "../../lib/api";
import { AGE, YEARS, GRAMS, USES, TIMES, FLAVORS, AVOID, label, labels } from "../../lib/vocab";
import { APP_VERSION, PHARMACY } from "../../lib/config";

export default function Me() {
  const { me, setMe, session, signOut, signOutLocal, say } = useApp();
  const [sheet, setSheet] = useState(null);     // "pass" | "delete"
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const c = me.card || {};
  const rows = [
    ["גיל", label(AGE, c.age)], ["בטיפול", c.years ? label(YEARS, c.years) : null], ["רישיון", (c.license || []).join(", ")],
    ["גרם בחודש", c.grams ? label(GRAMS, c.grams) : null], ["סיבות שימוש", labels(USES, c.uses).join(", ")],
    ["שעות שימוש", labels(TIMES, c.times).join(", ")], ["טעמים", labels(FLAVORS, c.flavors).join(", ")],
    ["להימנע מ", labels(AVOID, c.avoid).join(", ")], ["תקציב ל־10 גרם", c.budget ? `עד ${c.budget} ₪${c.budget_hard ? " (מסתיר יקרים יותר)" : ""}` : null],
  ].filter(([, v]) => v);

  async function setShare(share, ctx) {
    const r = await rpc("mmh_save_card", { p_card: me.card, p_share: share, p_share_context: share && ctx });
    if (r.error) return say(errText(r.error));
    setMe(r); say("נשמר. חל על דיווחים חדשים");
  }
  const open = s => { setSheet(s); setA(""); setB(""); setErr(""); setShow(false); };

  async function changePass() {
    setErr(""); if (b.length < 6) return setErr(errText("pass_invalid"));
    setBusy(true); const r = await rpc("mmh_change_password", { p_old: a, p_new: b }); setBusy(false);
    if (r.error) return setErr(r.error === "bad_login" ? "הסיסמה הנוכחית לא נכונה." : errText(r.error));
    setSheet(null); say("הסיסמה הוחלפה");
  }
  async function deleteAccount() {
    setErr(""); setBusy(true); const r = await rpc("mmh_delete_account", { p_pass: a }); setBusy(false);
    if (r.error) return setErr(r.error === "bad_login" ? "הסיסמה לא נכונה." : errText(r.error));
    signOutLocal();
  }

  return (
    <>
      <div className="top"><h1>הכרטיס שלי</h1></div>
      <p className="sub">מחובר בכינוי <b>{session.nick}</b>. הכינוי לא מוצג בפיד.</p>

      <div className="card">
        <table className="report"><tbody>
          {rows.map(([k, v]) => <tr key={k}><th scope="row" style={{ width: "38%" }}>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
        <Link href="/card/" className="btn block" style={{ marginTop: 14 }}>עריכת הכרטיס</Link>
      </div>

      <h2 className="h2">שיתוף בפיד</h2>
      <div className="card">
        <Switch checked={!!me.share_default} onChange={v => setShare(v, me.share_context_default)} title="לשתף דיווחים חדשים בפיד, באופן אנונימי" hint="ברירת המחדל לדיווח חדש. אפשר לשנות בכל דיווח בנפרד." />
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
            <button className="btn primary block" disabled={busy} onClick={changePass}>להחליף סיסמה</button>
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
            <button className="btn block danger" disabled={busy || !a} onClick={deleteAccount}>למחוק הכל לצמיתות</button>
            <button className="btn block" onClick={() => setSheet(null)}>ביטול</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
