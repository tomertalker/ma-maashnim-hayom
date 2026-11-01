"use client";
// Report a purchase: which strain, how it was, what helped, what bothered,
// a note, photos, and whether it goes to the anonymous feed.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../components/AppContext";
import { Chips, Q, Stars, Switch, Top, VerdictPick, goBack } from "../../components/ui";
import StrainPicker from "../../components/StrainPicker";
import { Thumb } from "../../components/Photo";
import { IconCamera } from "../../components/icons";
import { rpc, errText } from "../../lib/api";
import { preparePhoto } from "../../lib/photo";
import { HELPED, BOTHERED, CLS } from "../../lib/vocab";

export default function Report() {
  const router = useRouter();
  const { me, catalog, reviews, refreshReviews, refreshStats, say } = useApp();
  const [boot, setBoot] = useState(false);
  const [existing, setExisting] = useState(null);     // the review being edited
  const [product, setProduct] = useState(null);
  const [freeName, setFreeName] = useState("");
  const [source, setSource] = useState("own");
  const [again, setAgain] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [pending, setPending] = useState(false);      // bought, not tried yet
  const [stars, setStars] = useState(null);
  const [helped, setHelped] = useState([]);
  const [bothered, setBothered] = useState([]);
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState([]);               // photo ids already saved
  const [drop, setDrop] = useState([]);               // saved photo ids to delete
  const [fresh, setFresh] = useState([]);             // prepared, not uploaded yet
  const [publish, setPublish] = useState(!!me.share_default);
  const [shareCtx, setShareCtx] = useState(!!me.share_default && !!me.share_context_default);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  function fill(r) {
    setExisting(r);
    // a strain that has left the catalogue still has its review: keep a stand-in
    setProduct(r.product_id ? (catalog && catalog.byId.get(r.product_id)) || { id: r.product_id, he: r.product_name || "זן שירד מהמלאי", en: null, cat: null, cls: null } : null);
    setFreeName(r.product_id ? "" : r.product_name || "");
    setVerdict(r.verdict); setPending(false); setStars(r.stars); setHelped(r.helped || []); setBothered(r.bothered || []);
    setNote(r.note || ""); setKeep(r.photos || []); setDrop([]); setPublish(!!r.publish); setShareCtx(!!r.share_context);
    setSource(r.source === "history" ? "own" : r.source);
  }

  useEffect(() => {
    if (boot) return;
    const q = new URLSearchParams(window.location.search);
    const rid = q.get("rid"), id = q.get("id");
    if (rid) { const r = reviews.find(x => x.id === rid); if (r) { fill(r); setAgain(q.get("again") === "1"); } }
    else if (id && catalog) {
      const mine = reviews.find(x => x.product_id === id);
      if (mine) fill(mine); else { setProduct(catalog.byId.get(id) || null); if (q.get("src") === "reco") setSource("reco"); }
    }
    setBoot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot, reviews, catalog]);

  const products = useMemo(() => (catalog ? catalog.products : []), [catalog]);
  const chosen = product || freeName;
  const photoCount = keep.length + fresh.length;

  // everything typed about one strain, back to empty
  function blank() {
    setExisting(null); setAgain(false); setVerdict(null); setPending(false); setStars(null); setHelped([]); setBothered([]);
    setNote(""); setKeep([]); setDrop([]); setPublish(!!me.share_default); setShareCtx(!!me.share_default && !!me.share_context_default);
  }
  function pick(p) {
    setErr("");
    const mine = reviews.find(x => x.product_id === p.id);
    if (mine) { fill(mine); setAgain(true); } else { if (existing) blank(); setProduct(p); setFreeName(""); }
  }
  function pickFree(t) {
    setErr("");
    const name = t.slice(0, 60), mine = reviews.find(x => !x.product_id && (x.product_name || "").trim().toLowerCase() === name.trim().toLowerCase());
    if (mine) { fill(mine); setAgain(true); } else { if (existing) blank(); setProduct(null); setFreeName(name); }
  }
  function clearStrain() { blank(); setProduct(null); setFreeName(""); }

  async function addPhotos(e) {
    const files = [...(e.target.files || [])].slice(0, 3 - photoCount);
    e.target.value = "";
    if (!files.length) return;
    setBusy("מכין תמונה…"); setErr("");
    for (const f of files) {
      try { const ph = await preparePhoto(f); setFresh(a => [...a, ph]); }
      catch { setErr(errText("photo_invalid")); }
    }
    setBusy("");
  }

  async function save() {
    setErr("");
    if (!chosen) return setErr(errText("product_missing"));
    if (!verdict && !pending && !(existing && !existing.verdict && again)) return setErr("צריך לסמן איך היה, או לבחור ״עוד לא ניסיתי״.");
    setBusy("שומר…");
    // When photos change, the review is saved private first and published only
    // after removed photos are gone and new ones are in, so nothing the patient
    // took out is ever visible in the feed.
    const photosChanged = fresh.length > 0 || drop.length > 0;
    const review = {
      verdict: pending ? null : verdict, stars: pending ? null : stars, helped: pending ? [] : helped, bothered: pending ? [] : bothered,
      note: note.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""),
      publish: photosChanged ? false : publish, share_context: !photosChanged && publish && shareCtx,
    };
    if (existing) { review.id = existing.id; if (again) { review.bought = true; review.source = source; } }
    else { review.source = source; if (product) review.product_id = product.id; else review.product_name = freeName; }
    const r = await rpc("mmh_save_review", { p_review: review });
    if (r.error) { setBusy(""); return setErr(errText(r.error)); }
    const rid = r.review.id;
    setExisting(r.review);
    for (const id of drop) {
      const d = await rpc("mmh_delete_photo", { p_id: id });
      if (d.error && d.error !== "not_found") {
        await refreshReviews(); setBusy("");
        return setErr("תמונה שהסרת לא נמחקה, ולכן הדיווח נשמר כפרטי. נסו לשמור שוב.");
      }
    }
    setDrop([]);
    let photoErr = "";
    for (let i = 0; i < fresh.length; i++) {
      setBusy(`מעלה תמונה ${i + 1} מתוך ${fresh.length}…`);
      const u = await rpc("mmh_add_photo", { p_review_id: rid, p_full: fresh[i].full, p_thumb: fresh[i].thumb, p_w: fresh[i].w, p_h: fresh[i].h });
      if (u.error) photoErr = errText(u.error);
    }
    setFresh([]);
    if (photosChanged && publish) {
      const p2 = await rpc("mmh_save_review", { p_review: { id: rid, publish: true, share_context: shareCtx } });
      if (p2.error) { await refreshReviews(); setBusy(""); return setErr(errText(p2.error)); }
    }
    await Promise.all([refreshReviews(), refreshStats()]);
    setBusy("");
    say(photoErr ? "הדיווח נשמר, אבל תמונה לא עלתה: " + photoErr : publish ? "הדיווח נשמר ומופיע בפיד" : "הדיווח נשמר אצלך ביומן");
    router.replace(publish ? "/" : "/journal/");
  }

  async function remove() {
    if (!existing || !window.confirm("למחוק את הדיווח הזה? אי אפשר לשחזר.")) return;
    setBusy("מוחק…");
    const r = await rpc("mmh_delete_review", { p_id: existing.id });
    await Promise.all([refreshReviews(), refreshStats()]);
    setBusy("");
    if (r.error) return setErr(errText(r.error));
    say("הדיווח נמחק"); router.replace("/journal/");
  }

  if (!boot) return <div className="splash" aria-busy="true">טוען…</div>;
  const showDetails = chosen && !pending;

  return (
    <>
      <Top title={existing ? "עדכון דיווח" : "דיווח על קנייה"} onBack={() => goBack(router)} />

      {!chosen ? (
        <Q title="איזה זן קנית?">
          {products.length ? <StrainPicker products={products} onPick={pick} onFree={pickFree} autoFocus />
            : <input className="input" placeholder="שם הזן" maxLength={60} onBlur={e => setFreeName(e.target.value.trim())} />}
          <p className="small muted" style={{ marginTop: 8 }}>מתחילים להקליד ובוחרים מהרשימה. זן שלא מופיע אפשר להוסיף בכתיבה חופשית.</p>
        </Q>
      ) : (
        <div className={"label cls-" + ((product && product.cls) || "")}>
          <div className="row">
            <div className="grow">
              <div className="name">{product ? product.he : freeName}{product && product.en ? <span className="en">{product.en}</span> : null}</div>
              <div className="meta">{product ? [product.cat, CLS[product.cls]].filter(Boolean).join(" | ") : "זן שלא ברשימה"}</div>
            </div>
            {!existing ? <button type="button" className="btn sm quiet" onClick={clearStrain}>החלפה</button> : null}
          </div>
        </div>
      )}

      {chosen && existing ? (
        <div className="card" style={{ marginTop: 12 }}>
          <Switch checked={again} onChange={setAgain} title="זו קנייה נוספת של הזן הזה"
            hint={`עד עכשיו נרשם: נקנה ${existing.buys === 1 ? "פעם אחת" : existing.buys + " פעמים"}. קנייה חוזרת מחזקת את ההמלצה.`} />
        </div>
      ) : null}

      {chosen ? (
        <Q title="איך היה?">
          <VerdictPick value={pending ? null : verdict} onChange={v => { setPending(false); setVerdict(v); }} />
          {!existing || !existing.verdict ? (
            <button type="button" className="chip" style={{ marginTop: 8 }} aria-pressed={pending} onClick={() => { setPending(!pending); if (!pending) setVerdict(null); }}>עוד לא ניסיתי, רק קניתי</button>
          ) : null}
        </Q>
      ) : null}

      {showDetails && verdict ? (
        <>
          <Q title="כמה כוכבים?" hint="לא חובה"><Stars value={stars} onChange={setStars} /></Q>
          <Q title="במה זה עזר?" hint="אפשר לסמן כמה"><Chips options={HELPED} value={helped} onChange={setHelped} /></Q>
          <Q title="מה הפריע?" hint="אפשר לסמן כמה"><Chips options={BOTHERED} value={bothered} onChange={setBothered} bad /></Q>
        </>
      ) : null}

      {chosen ? (
        <>
          <Q title="כמה מילים" hint="לא חובה">
            <textarea className="textarea" maxLength={400} value={note} onChange={e => setNote(e.target.value)} placeholder="מה הרגשת, מתי זה מתאים, למי היית ממליץ" />
            <p className="small muted" style={{ margin: "6px 0 0" }}>בלי שמות, מספרי טלפון או עיר. <span className="num">{note.length}/400</span></p>
          </Q>

          <Q title="תמונות" hint="עד 3, לא חובה">
            <div className="photos" style={{ marginTop: 0 }}>
              {keep.map(id => <Thumb key={id} id={id} onRemove={() => { setKeep(k => k.filter(x => x !== id)); setDrop(d => [...d, id]); }} />)}
              {fresh.map((ph, i) => (
                <div className="ph" key={ph.preview}><img src={ph.preview} alt="תמונה חדשה" />
                  <button type="button" className="x" aria-label="להסיר את התמונה" onClick={() => setFresh(a => a.filter((_, j) => j !== i))}>×</button></div>
              ))}
              {photoCount < 3 ? (
                <button type="button" className="add" onClick={() => fileRef.current && fileRef.current.click()}><span><IconCamera /><br />להוסיף תמונה</span></button>
              ) : null}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={addPhotos} />
            <p className="small muted" style={{ margin: "8px 0 0" }}>מצלמים את השקית או את התפרחת. בלי מרשם, קבלה, פנים או מדבקה עם שם. נתוני המיקום נמחקים מהתמונה לפני ההעלאה.</p>
          </Q>

          <div className="card" style={{ marginTop: 20 }}>
            <Switch checked={publish} onChange={v => { setPublish(v); if (!v) setShareCtx(false); }} title="להציג בפיד, באופן אנונימי" hint="בלי שם, בלי כינוי ובלי תאריך מדויק. כבוי: הדיווח נשאר רק ביומן שלך." />
            {publish ? <Switch checked={shareCtx} onChange={setShareCtx} title="להציג גם סיבת שימוש ומינון" hint="עוזר למטופלים דומים למצוא דיווחים רלוונטיים." /> : null}
          </div>
        </>
      ) : null}

      {err ? <div className="err-box" role="alert" style={{ marginTop: 16 }}>{err}</div> : null}
      {chosen ? (
        <div className="foot">
          {existing ? <button type="button" className="btn danger" disabled={!!busy} onClick={remove}>מחיקה</button> : null}
          <button type="button" className="btn primary" disabled={!!busy} onClick={save}>{busy || "לשמור את הדיווח"}</button>
        </div>
      ) : null}
    </>
  );
}
