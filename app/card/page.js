"use client";
// The patient's card. First visit: a short wizard that ends with the first
// recommendations. Later visits: the same screens, pre-filled, for editing.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../components/AppContext";
import { Chips, Q, Switch, Top, VerdictPick, goBack } from "../../components/ui";
import StrainPicker from "../../components/StrainPicker";
import { rpc, errText } from "../../lib/api";
import { AGE, SEX, YEARS, GRAMS, LICENSE, USES, TIMES, FLAVORS, AVOID, BUDGETS } from "../../lib/vocab";

const EMPTY = { age: null, sex: null, years: null, grams: null, license: ["T22/C4"], uses: [], times: [], flavors: [], avoid: [], budget: null, budget_hard: false };

export default function CardPage() {
  const { me, setMe, catalog, reviews, refreshReviews, say } = useApp();
  const router = useRouter();
  const first = !me.card;
  const [step, setStep] = useState(0);
  const [card, setCard] = useState(() => ({ ...EMPTY, ...(me.card || {}) }));
  const [tried, setTried] = useState([]);                 // [{p, verdict}]
  const [share, setShare] = useState(me.share_default);   // null until chosen
  const [shareCtx, setShareCtx] = useState(!!me.share_context_default);
  const [customBudget, setCustomBudget] = useState(() => (me.card && me.card.budget && !BUDGETS.includes(me.card.budget) ? String(me.card.budget) : ""));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setCard(c => ({ ...c, [k]: v }));
  const steps = first ? ["עליך", "למה", "מה אוהבים", "זנים שניסית", "שיתוף"] : ["עליך", "למה", "מה אוהבים"];
  const last = step === steps.length - 1;
  const known = useMemo(() => new Set([...reviews.map(r => r.product_id).filter(Boolean), ...tried.map(t => t.p.id)]), [reviews, tried]);
  const flowers = useMemo(() => (catalog ? catalog.products : []), [catalog]);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  // a first card in progress survives a reload of the page (this phone only)
  const DRAFT = "mmh.cardDraft";
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!first) return;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
      if (d && d.nick === me.nick && catalog) {
        setCard(c => ({ ...c, ...d.card })); setStep(Math.min(d.step || 0, 4)); setShare(d.share ?? null); setShareCtx(!!d.shareCtx);
        setTried((d.tried || []).map(t => ({ p: catalog.byId.get(t.id), verdict: t.verdict })).filter(t => t.p));
      }
    } catch {}
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!first || !restored) return;
    try { localStorage.setItem(DRAFT, JSON.stringify({ nick: me.nick, step, card, share, shareCtx, tried: tried.map(t => ({ id: t.p.id, verdict: t.verdict })) })); } catch {}
  }, [first, restored, me.nick, step, card, share, shareCtx, tried]);

  function check() {
    if (step === 0 && !card.age) return "צריך לבחור קבוצת גיל.";
    if (step === 1 && !card.uses.length) return "צריך לבחור לפחות סיבת שימוש אחת.";
    if (first && step === 3 && tried.some(t => !t.verdict)) return "לכל זן שהוספת צריך לסמן אם התאים או לא (או להסיר אותו).";
    if (first && step === 4 && share === null) return "צריך לבחור אם לשתף דיווחים בפיד.";
    return "";
  }

  async function next() {
    const e = check(); setErr(e); if (e) return;
    if (!last) return setStep(step + 1);
    setBusy(true);
    const r = await rpc("mmh_save_card", { p_card: card, p_share: first ? share : null, p_share_context: first ? share && shareCtx : null });
    if (r.error) { setBusy(false); return setErr(errText(r.error)); }
    let failed = 0;
    for (const t of tried) {
      const s = await rpc("mmh_save_review", { p_review: { product_id: t.p.id, verdict: t.verdict, source: "history", publish: !!share, share_context: !!share && shareCtx } });
      if (s.error) failed++;
    }
    if (tried.length) await refreshReviews();
    try { localStorage.removeItem(DRAFT); } catch {}
    setMe(r); setBusy(false);
    say(failed ? `הכרטיס נשמר, אבל ${failed} מהזנים שסימנת לא נשמרו. אפשר להוסיף אותם ב״דיווח״.` : first ? "הכרטיס נשמר. אלה ההמלצות שלך" : "הכרטיס עודכן");
    router.replace(first ? "/reco/" : "/me/");
  }

  return (
    <>
      <Top title={first ? "הכרטיס שלך" : "עריכת הכרטיס"} onBack={step > 0 ? () => { setErr(""); setStep(step - 1); } : first ? null : () => goBack(router, "/me/")} />
      <div className="steps" aria-hidden="true">{steps.map((s, i) => <i key={s} className={i <= step ? "on" : ""} />)}</div>
      <p className="sub">שלב {step + 1} מתוך {steps.length}: {steps[step]}</p>

      {step === 0 ? (
        <>
          {first ? <div className="note plain">דקה וחצי, פעם אחת. הכרטיס נשאר פרטי, ולפיו מותאמות ההמלצות שלך.</div> : null}
          <Q title="גיל"><Chips options={AGE} value={card.age} onChange={v => set("age", v)} /></Q>
          <Q title="מין" hint="לא חובה"><Chips options={SEX} value={card.sex} onChange={v => set("sex", v)} /></Q>
          <Q title="כמה זמן בטיפול בקנאביס"><Chips options={YEARS} value={card.years} onChange={v => set("years", v)} /></Q>
          <Q title="מה רשום ברישיון" hint="אפשר לסמן כמה"><Chips options={LICENSE} value={card.license} onChange={v => set("license", v)} /></Q>
          <Q title="כמה גרם בחודש"><Chips options={GRAMS} value={card.grams} onChange={v => set("grams", v)} /></Q>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Q title="בשביל מה הקנאביס" hint="אפשר לסמן כמה"><Chips options={USES} value={card.uses} onChange={v => set("uses", v)} /></Q>
          <Q title="מתי במהלך היום" hint="אפשר לסמן כמה"><Chips options={TIMES} value={card.times} onChange={v => set("times", v)} /></Q>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Q title="טעמים אהובים" hint="לא חובה"><Chips options={FLAVORS} value={card.flavors} onChange={v => set("flavors", v)} /></Q>
          <Q title="ממה חשוב להימנע" hint="לא חובה"><Chips options={AVOID} value={card.avoid} onChange={v => set("avoid", v)} bad /></Q>
          <Q title="תקציב ל־10 גרם" hint="לא חובה">
            <div className="chips">
              {BUDGETS.map(b => <button key={b} type="button" className="chip num" aria-pressed={card.budget === b && !customBudget} onClick={() => { setCustomBudget(""); set("budget", card.budget === b ? null : b); }}>עד {b} ₪</button>)}
            </div>
            <input className="input num" style={{ marginTop: 8 }} inputMode="numeric" placeholder="או סכום אחר, בשקלים" value={customBudget}
              onChange={e => { const t = e.target.value.replace(/[^\d]/g, "").slice(0, 4); setCustomBudget(t); set("budget", t ? Number(t) : null); }} aria-label="תקציב אחר בשקלים" />
            {card.budget ? <Switch checked={card.budget_hard} onChange={v => set("budget_hard", v)} title="להסתיר זנים מעל התקציב" hint="כבוי: זנים יקרים יותר יופיעו נמוך יותר, עם סימון." /> : null}
          </Q>
        </>
      ) : null}

      {first && step === 3 ? (
        <>
          <div className="note plain">זנים שכבר ניסית הם הבסיס הכי טוב להמלצות. אפשר לדלג ולהוסיף אחר כך.</div>
          <Q title="להוסיף זן שניסית">
            {flowers.length ? <StrainPicker products={flowers} exclude={known} onPick={p => setTried(t => [...t, { p, verdict: null }])} />
              : <div className="muted small">הקטלוג עוד לא נטען, אז אי אפשר לבחור זנים כרגע. אפשר להמשיך.</div>}
          </Q>
          <div className="stack" style={{ marginTop: 14 }}>
            {tried.map((t, i) => (
              <div key={t.p.id} className={"label cls-" + (t.p.cls || "")}>
                <div className="row"><div className="grow name">{t.p.he}</div>
                  <button type="button" className="btn sm quiet" onClick={() => setTried(a => a.filter((_, j) => j !== i))}>הסרה</button></div>
                <div style={{ marginTop: 10 }}><VerdictPick mini value={t.verdict} onChange={v => setTried(a => a.map((x, j) => (j === i ? { ...x, verdict: v } : x)))} /></div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {first && step === 4 ? (
        <>
          <Q title="לשתף את הדיווחים שלך בפיד?">
            <p className="sub">הפיד אנונימי: בלי שם, בלי כינוי ובלי תאריך מדויק. אפשר לשנות את הבחירה בכל דיווח.</p>
            <div className="stack">
              <button type="button" className="btn block" aria-pressed={share === true} style={share === true ? { borderColor: "var(--pine)", background: "var(--pine-soft)" } : null} onClick={() => setShare(true)}>כן, לשתף באופן אנונימי</button>
              <button type="button" className="btn block" aria-pressed={share === false} style={share === false ? { borderColor: "var(--pine)", background: "var(--pine-soft)" } : null} onClick={() => setShare(false)}>לא, לשמור רק אצלי</button>
            </div>
          </Q>
          {share ? (
            <div className="card" style={{ marginTop: 14 }}>
              <Switch checked={shareCtx} onChange={setShareCtx} title="להציג ליד הדיווח גם את סיבת השימוש והמינון"
                hint="למשל: כאב, שינה | 30 גרם בחודש. זה עוזר למטופלים דומים. בקבוצה קטנה של מכרים זה עלול לרמוז מי כתב." />
            </div>
          ) : null}
          <p className="small muted" style={{ marginTop: 16 }}>
            ההמלצות מבוססות על נתוני המוצרים ועל דיווחי מטופלים, ואינן ייעוץ רפואי. אפשר למחוק את החשבון ואת כל הנתונים בכל רגע מ״הכרטיס שלי״.
          </p>
        </>
      ) : null}

      {err ? <div className="err-box" role="alert" style={{ marginTop: 16 }}>{err}</div> : null}
      <div className="foot">
        {first && step === 3 && !tried.length ? <button type="button" className="btn" onClick={() => { setErr(""); setStep(4); }}>לדלג</button> : null}
        <button type="button" className="btn primary" disabled={busy} onClick={next}>{busy ? "שומר…" : last ? (first ? "לשמור ולראות המלצות" : "לשמור") : "המשך"}</button>
      </div>
    </>
  );
}
