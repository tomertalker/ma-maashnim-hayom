"use client";
// Tomer's moderation page. Not linked from the app; opened by address.
// Every call carries the admin key (set with mmh_admin_set_key in Supabase).
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../components/AppContext";
import { PasswordInput, Seg, Stamp, Stars, Switch } from "../../components/ui";
import { Photos } from "../../components/Photo";
import { adminKey, adminRpc, errText, setAdminKey } from "../../lib/api";
import { HELPED, BOTHERED, USES, GRAMS, label, labels, dateHe } from "../../lib/vocab";

const days = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const ageText = iso => { const d = days(iso); return d === 0 ? "נפתח היום" : d === 1 ? "בן יום" : `בן ${d} ימים`; };
const adminErr = code => (code === "locked" ? "יותר מדי ניסיונות עם מפתח שגוי מהרשת הזו. נסו שוב בעוד רבע שעה." : errText(code));

export default function Admin() {
  const { say } = useApp();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("pending");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await adminRpc("mmh_admin_queue");
    if (r.error) { if (r.error === "admin_key") setAdminKey(null); setData(null); setErr(adminErr(r.error)); return false; }
    setErr(""); setData(r); return true;
  }, []);

  useEffect(() => { if (adminKey()) load(); }, [load]);

  async function signIn(e) {
    e.preventDefault();
    if (key.trim().length < 16) return setErr("המפתח ארוך יותר: 16 תווים לפחות.");
    setAdminKey(key.trim()); setBusy("in");
    const okIn = await load(); setBusy("");
    if (okIn) setKey("");
  }
  function signOut() { setAdminKey(null); setData(null); setErr(""); }

  async function act(item, action) {
    setBusy(item.id);
    const r = await adminRpc("mmh_admin_moderate", { p_review_id: item.id, p_action: action });
    setBusy("");
    if (r.error) return say(adminErr(r.error));
    say(action === "reject" ? "הדיווח לא יופיע בפיד" : action === "verify" ? "אושר וסומן כרכישה מאומתת" : "אושר ומופיע בפיד");
    load();
  }
  async function trust(item) {
    const w = item.writer;
    if (!window.confirm(`לסמן את ${w.nick} ככותב מהימן? הדיווחים שלו יעלו מיד בלי אישור, כולל ${w.waiting} שממתינים עכשיו.`)) return;
    setBusy(item.id);
    const r = await adminRpc("mmh_admin_trust", { p_patient_id: w.id, p_trusted: true });
    setBusy("");
    if (r.error) return say(adminErr(r.error));
    say(`${w.nick} מסומן כמהימן. ${r.approved} דיווחים אושרו`);
    load();
  }
  async function untrust(item) {
    const r = await adminRpc("mmh_admin_trust", { p_patient_id: item.writer.id, p_trusted: false });
    if (r.error) return say(adminErr(r.error));
    say("הסימון הוסר. דיווחים חדשים שלו ימתינו לאישור"); load();
  }
  async function setApproval(on) {
    if (!on && !window.confirm("לכבות אישור ידני? כל דיווח יעלה לפיד מיד, וכל מה שממתין עכשיו יאושר.")) return;
    const r = await adminRpc("mmh_admin_set_approval", { p_on: on });
    if (r.error) return say(adminErr(r.error));
    say(on ? "אישור ידני פעיל" : `אישור ידני כבוי. ${r.approved} דיווחים אושרו`); load();
  }

  if (!data) {
    return (
      <>
        <div className="top"><h1>ניהול הפיילוט</h1></div>
        <form className="card stack" onSubmit={signIn}>
          <label className="field"><span>מפתח הניהול</span>
            <PasswordInput value={key} onChange={setKey} show={show} setShow={setShow} autoComplete="current-password" />
            <small>אותו מפתח שהוגדר ב־Supabase עם mmh_admin_set_key. נשמר רק בלשונית הזו, עד שסוגרים אותה.</small></label>
          {err ? <div className="err-box" role="alert">{err}</div> : null}
          <button className="btn primary block" disabled={busy === "in"}>{busy === "in" ? "בודק…" : "כניסה"}</button>
        </form>
      </>
    );
  }

  const c = data.counts || {};
  const list = tab === "pending" ? data.pending : data.hidden;
  return (
    <>
      <div className="top"><h1>ניהול הפיילוט</h1><button className="btn sm" onClick={signOut}>יציאה</button></div>
      <p className="sub">{c.patients} מטופלים ({c.with_card} עם כרטיס) | {c.in_feed} דיווחים בפיד | {c.pending} ממתינים{c.catalogue_from ? ` | מלאי מ־${dateHe(c.catalogue_from)}` : ""}</p>

      <div className="card">
        <Switch checked={!!data.need_approval} onChange={setApproval} title="אישור ידני לפני פרסום"
          hint={data.need_approval ? "דיווח חדש או ערוך מופיע לאחרים, ונספר בהמלצות, רק אחרי אישור כאן." : "כבוי: כל דיווח עולה לפיד מיד."} />
      </div>

      <div style={{ marginTop: 14 }}>
        <Seg options={[["pending", `ממתינים (${data.pending.length})`], ["hidden", `הוסתרו (${data.hidden.length})`]]} value={tab} onChange={setTab} />
      </div>

      {!list.length ? (
        <div className="empty"><b>{tab === "pending" ? "אין דיווחים שממתינים" : "אין דיווחים מוסתרים"}</b>
          {tab === "pending" ? "דיווח חדש שמטופל בוחר להציג בפיד יופיע כאן." : "דיווח ששלושה מטופלים ותיקים סימנו כלא מתאים יופיע כאן."}</div>
      ) : null}

      {list.map(it => <Item key={it.id} it={it} hiddenTab={tab === "hidden"} busy={busy === it.id} act={act} trust={trust} untrust={untrust} />)}
      <p className="small muted" style={{ marginTop: 22 }}>200 הדיווחים הוותיקים ביותר מוצגים. אחרי כל פעולה הרשימה מתעדכנת.</p>
    </>
  );
}

function Item({ it, hiddenTab, busy, act, trust, untrust }) {
  const w = it.writer || {};
  const ctx = it.ctx ? [labels(USES, it.ctx.uses).join(", "), it.ctx.grams ? label(GRAMS, it.ctx.grams) + " גרם בחודש" : null].filter(Boolean).join(" | ") : "";
  const hasPhoto = it.photos && it.photos.length > 0;
  return (
    <article className="label" style={{ marginTop: 12 }}>
      <div className="row top-al">
        <div className="grow">
          <div className="name">{it.product_name || "זן לא ידוע"}</div>
          <div className="meta">{it.updated_at !== it.created_at ? "נערך" : "נשלח"} ב־{dateHe(it.updated_at)}{it.buys > 1 ? ` | נקנה ${it.buys} פעמים` : ""}{it.source === "history" ? " | מהכרטיס (ניסיון קודם)" : ""}</div>
        </div>
        <Stamp verdict={it.verdict} />
      </div>
      {it.stars ? <div style={{ marginTop: 10 }}><Stars value={it.stars} /></div> : null}
      {it.helped && it.helped.length ? <div className="tags" style={{ marginTop: 10 }}><span className="small muted">עזר ל:</span>{it.helped.map(k => <span key={k} className="tag good">{label(HELPED, k)}</span>)}</div> : null}
      {it.bothered && it.bothered.length ? <div className="tags" style={{ marginTop: 8 }}><span className="small muted">הפריע:</span>{it.bothered.map(k => <span key={k} className="tag bad">{label(BOTHERED, k)}</span>)}</div> : null}
      {it.note ? <p className="text">{it.note}</p> : null}
      <Photos ids={it.photos} admin />
      {ctx ? <p className="small muted" style={{ margin: "8px 0 0" }}>מוצג בפיד עם: {ctx}</p> : null}
      {it.flags ? <div className="caution">{it.flags} סימנו &quot;לא מתאים&quot;{it.flag_reasons.length ? `: ${it.flag_reasons.join(" / ")}` : ""}</div> : null}

      <div className="who" style={{ flexWrap: "wrap" }}>
        <span className="ctx">
          <b style={{ color: "var(--ink)" }}>{w.nick}</b> | חשבון {ageText(w.since)}{w.card ? "" : " | בלי כרטיס"} | {w.reviews} דיווחים: {w.approved} אושרו{w.rejected ? `, ${w.rejected} נדחו` : ""}{w.waiting ? `, ${w.waiting} ממתינים` : ""}
          {w.trusted ? <span className="tag good" style={{ marginInlineStart: 6 }}>מהימן</span> : null}
        </span>
      </div>

      <div className="admin-actions">
        {hiddenTab ? (
          <>
            <button className="btn sm primary" disabled={busy} onClick={() => act(it, "approve")}>להחזיר לפיד</button>
            <button className="btn sm danger" disabled={busy} onClick={() => act(it, "reject")}>להשאיר מוסתר</button>
          </>
        ) : (
          <>
            <button className="btn sm primary" disabled={busy} onClick={() => act(it, "approve")}>לאשר</button>
            {hasPhoto ? <button className="btn sm" disabled={busy} onClick={() => act(it, "verify")}>לאשר + רכישה מאומתת</button> : null}
            <button className="btn sm danger" disabled={busy} onClick={() => act(it, "reject")}>לדחות</button>
          </>
        )}
      </div>
      {hasPhoto && !hiddenTab ? <p className="small muted" style={{ margin: "8px 0 0" }}>&quot;רכישה מאומתת&quot;: רק כשהתמונה מראה שקית או אריזה של המוצר.</p> : null}
      {!hiddenTab ? (
        w.trusted
          ? <button type="button" className="btn sm quiet" style={{ marginTop: 6 }} onClick={() => untrust(it)}>להסיר סימון מהימן</button>
          : <button type="button" className="btn sm quiet" style={{ marginTop: 6 }} disabled={busy} onClick={() => trust(it)}>לסמן את {w.nick} כמהימן (בלי אישור מעכשיו)</button>
      ) : null}
    </article>
  );
}
