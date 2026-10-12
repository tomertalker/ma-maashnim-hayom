"use client";
import { useEffect, useRef, useState } from "react";
import { rpc, errText } from "../lib/api";
import { useApp } from "./AppContext";
import { Seg, PasswordInput } from "./ui";
import { PHARMACY } from "../lib/config";

export default function Auth() {
  const { signIn } = useApp();
  const [mode, setMode] = useState("signup");
  const [nick, setNick] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [invite, setInvite] = useState("");
  const [needInvite, setNeedInvite] = useState(false);
  const [adult, setAdult] = useState(false);
  const [avail, setAvail] = useState(null);     // null | "checking" | "free" | "taken" | "invalid"
  const [suggest, setSuggest] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    try { const c = new URLSearchParams(window.location.search).get("c"); if (c) { setInvite(c); setNeedInvite(true); } } catch {}
  }, []);

  // check the nickname while typing
  useEffect(() => {
    if (mode !== "signup") return;
    const n = nick.trim();
    setSuggest([]);
    if (n.length < 2) { setAvail(null); return; }
    setAvail("checking");
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const r = await rpc("mmh_nick_available", { p_nick: n }, { auth: false });
      if (my !== seq.current) return;
      if (r.error === "nick_invalid") return setAvail("invalid");
      if (r.error) return setAvail(null);
      if (r.available) return setAvail("free");
      setAvail("taken");
      const base = n.slice(0, 17), out = [];
      for (const s of [String(Math.floor(10 + Math.random() * 89)), String(Math.floor(100 + Math.random() * 899)), "_" + Math.floor(1 + Math.random() * 9)]) {
        const c = await rpc("mmh_nick_available", { p_nick: base + s }, { auth: false });
        if (my !== seq.current) return;
        if (c.available) out.push(base + s);
        if (out.length >= 2) break;
      }
      setSuggest(out);
    }, 350);
    return () => clearTimeout(t);
  }, [nick, mode]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const n = nick.trim();
    if (n.length < 2) return setErr(errText("nick_invalid"));
    if (pass.length < 6) return setErr(errText("pass_invalid"));
    if (mode === "signup" && !adult) return setErr("כדי להירשם צריך לאשר גיל 18 ומעלה ורישיון בתוקף.");
    setBusy(true);
    const r = mode === "signup"
      ? await rpc("mmh_signup", { p_nick: n, p_pass: pass, p_invite: invite || null }, { auth: false })
      : await rpc("mmh_login", { p_nick: n, p_pass: pass }, { auth: false });
    setBusy(false);
    if (r.error) {
      if (r.error === "invite_required") setNeedInvite(true);
      if (r.error === "nick_taken") setAvail("taken");
      return setErr(errText(r.error));
    }
    await signIn({ token: r.token, nick: r.nick });
  }

  const signup = mode === "signup";
  return (
    <main className="app bare">
      <div className="hero">
        <h1>מה מעשנים היום</h1>
        <p>מטופלים משתפים מה עבד להם ומה לא, וההמלצות מותאמות לכרטיס שלך.</p>
        <div className="band" aria-hidden="true"><i /><i /><i /></div>
      </div>

      <form className="stack" onSubmit={submit} style={{ marginTop: 26 }} noValidate>
        <Seg options={[["signup", "הרשמה"], ["login", "יש לי כינוי"]]} value={mode} onChange={m => { setMode(m); setErr(""); }} />

        <label className="field">
          <span>כינוי</span>
          <input className="input" value={nick} onChange={e => setNick(e.target.value)} maxLength={20} autoComplete="username"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={signup ? "למשל: ירוק_בבוקר" : "הכינוי שנרשמת איתו"} />
          {signup && avail === "free" ? <small className="fine">הכינוי פנוי</small> : null}
          {signup && avail === "taken" ? <small className="err">הכינוי תפוס.{suggest.length ? " פנויים: " : " נסו כינוי אחר."}
            {suggest.map(s => <button key={s} type="button" className="btn sm quiet" onClick={() => setNick(s)}>{s}</button>)}</small> : null}
          {signup && avail === "invalid" ? <small className="err">{errText("nick_invalid")}</small> : null}
          {signup && (avail === null || avail === "checking") ? <small>לא השם האמיתי. הכינוי משמש רק לכניסה ולא מוצג בפיד.</small> : null}
        </label>

        <label className="field">
          <span>סיסמה</span>
          <PasswordInput value={pass} onChange={setPass} show={show} setShow={setShow} autoComplete={signup ? "new-password" : "current-password"} placeholder="6 תווים לפחות" />
          {signup ? <small>עם הכינוי והסיסמה אפשר להמשיך גם מטלפון אחר. אין שחזור אוטומטי, אז כדאי לשמור אותה.</small> : null}
        </label>

        {signup && needInvite ? (
          <label className="field">
            <span>קוד הפיילוט</span>
            <input className="input" value={invite} onChange={e => setInvite(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="הקוד שקיבלת בבית המרקחת" />
          </label>
        ) : null}

        {signup ? (
          <label className="row top-al" style={{ gap: 12 }}>
            <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2, flex: "none" }} />
            <span className="small">אני בן או בת 18 ומעלה, מטופל או מטופלת ברישיון בתוקף, ומבין או מבינה שהאפליקציה אינה ייעוץ רפואי.</span>
          </label>
        ) : null}

        {err ? <div className="err-box" role="alert">{err}</div> : null}
        <button className="btn primary block" disabled={busy}>{busy ? "רגע…" : signup ? "להירשם ולמלא כרטיס" : "להיכנס"}</button>
        {!signup ? <p className="small muted center">שכחת את הסיסמה? צוות הפיילוט ב{PHARMACY} יכול לאפס אותה.</p> : null}
      </form>

      <p className="small muted" style={{ marginTop: 28 }}>
        פיילוט ב{PHARMACY}. ההמלצות מבוססות על נתוני המוצרים ועל דיווחי מטופלים. הן לא מחליפות רופא או רוקח.
      </p>
    </main>
  );
}
