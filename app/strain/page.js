"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../components/AppContext";
import { useReco } from "../../components/useReco";
import { Why } from "../../components/Why";
import FeedCard from "../../components/FeedCard";
import { Stamp, Top, goBack } from "../../components/ui";
import { rpc } from "../../lib/api";
import { PARTS, TERP, normTerp } from "../../lib/engine/engine.mjs";
import { CLS, TYPE } from "../../lib/vocab";

const COUNTRY = { IL: "ישראל", CA: "קנדה", UG: "אוגנדה", PT: "פורטוגל", ZA: "דרום אפריקה", CO: "קולומביה", NL: "הולנד", DE: "גרמניה", US: "ארה״ב", AU: "אוסטרליה" };

export default function Strain() {
  const router = useRouter();
  const { catalog, reviews, stats } = useApp();
  const [id, setId] = useState(null);
  const [feed, setFeed] = useState(null);
  const reco = useReco({ allCategories: true, budgetHard: false });

  const [fromReco, setFromReco] = useState(false);
  useEffect(() => { const q = new URLSearchParams(window.location.search); setId(q.get("id") || ""); setFromReco(q.get("from") === "reco"); }, []);
  useEffect(() => {
    if (!id) return; let live = true;
    rpc("mmh_feed", { p_product_id: id, p_limit: 20 }).then(r => { if (live) setFeed(r.ok ? r.items : []); });
    return () => { live = false; };
  }, [id]);

  const p = id && catalog ? catalog.byId.get(id) : null;
  const row = useMemo(() => (reco && id ? reco.rows.find(r => r.p.id === id) : null), [reco, id]);
  const mine = reviews.find(r => r.product_id === id);
  const st = stats[id];

  if (id === null) return <div className="splash" aria-busy="true">טוען…</div>;
  if (!p) return (<><Top title="זן" onBack={() => goBack(router, "/reco/")} /><div className="empty"><b>הזן לא נמצא בקטלוג</b>ייתכן שהוא ירד מהמלאי.</div></>);

  const terps = (p.terps || []).map(t => ({ ...t, k: normTerp(t.i) }));
  const hasPct = terps.some(t => typeof t.p === "number" && t.p > 0);
  const parents = [...(p.p1 || []), ...(p.p2 || [])];
  const facts = [["מגדל", p.grower], ["מותג", p.brand], ["ארץ גידול", COUNTRY[p.country] || p.country]].filter(([, v]) => v);

  return (
    <>
      <Top title={p.he} onBack={() => goBack(router, "/reco/")} />
      <div className={"label cls-" + (p.cls || "")}>
        <div className="row top-al">
          <div className="grow">
            {p.en ? <div className="en muted" style={{ textAlign: "right" }}>{p.en}</div> : null}
            <div className="tags" style={{ marginTop: 8 }}>
              {p.cls ? <span className={"tag cls-" + p.cls}>{CLS[p.cls]}</span> : null}
              <span className="tag en">{p.cat}</span>
              {p.type !== "flower" ? <span className="tag">{TYPE[p.type]}</span> : null}
              {p.price ? <span className="tag num">{p.price} ₪</span> : null}
            </div>
          </div>
          {mine ? <Stamp verdict={mine.verdict} /> : row ? <div className="match"><b className="num">{row.disp}%</b><small>התאמה</small></div> : null}
        </div>
        {facts.length ? <div className="meta" style={{ marginTop: 10 }}>{facts.map(([k, v]) => `${k}: ${v}`).join(" | ")}</div> : null}
      </div>

      {row ? (
        <>
          <h2 className="h2">למה זה מתאים לך</h2>
          <div className="card">
            <div className="bars">
              {PARTS.map(([k, name]) => (
                <div className="bar" key={k}>
                  <span>{name}</span>
                  <span className="track"><i style={{ width: Math.round(row[k] * 100) + "%" }} /></span>
                  <span className="v num">{k === "eff" && row.noTerp ? "?" : Math.round(row[k] * 100)}</span>
                </div>
              ))}
            </div>
            <Why ex={row.ex} />
            {!row.ex.R.length && !row.ex.C.length && !row.ex.G.length ? <p className="small muted" style={{ margin: "10px 0 0" }}>אין נימוק בולט. ההתאמה כאן בינונית.</p> : null}
          </div>
        </>
      ) : p.type !== "flower" && p.type !== "preroll" ? (
        <div className="note plain" style={{ marginTop: 12 }}>ההמלצות מחושבות כרגע לתפרחות בלבד. אפשר לדווח גם על המוצר הזה.</div>
      ) : null}

      <h2 className="h2">טרפנים</h2>
      <div className="card">
        {terps.length ? (
          <>
            <div className="tags">
              {terps.map((t, i) => <span key={i} className="tag">{(t.k && TERP[t.k].he) || t.he || t.i}{typeof t.p === "number" && t.p > 0 ? <span className="num muted">&nbsp;{t.p}%</span> : null}</span>)}
            </div>
            <p className="small muted" style={{ margin: "10px 0 0" }}>{hasPct ? "האחוזים מוצגים כפי שהם מופיעים בנתוני המוצר." : "רשימת הטרפנים פורסמה בלי אחוזים."}</p>
          </>
        ) : <p className="muted" style={{ margin: 0 }}>לא פורסמו טרפנים למוצר הזה.</p>}
      </div>

      <h2 className="h2">גנטיקה</h2>
      <div className="card">
        {parents.length ? <div className="tags">{parents.map((s, i) => <span key={i} className="tag">{s.he || s.en}</span>)}</div> : <p className="muted" style={{ margin: 0 }}>ההורים של הזן לא פורסמו.</p>}
        {p.strain && p.strain.he ? <p className="small muted" style={{ margin: "10px 0 0" }}>שם הזן המקורי: {p.strain.he}</p> : null}
      </div>

      <h2 className="h2">מה מטופלים דיווחו{st ? ` (${(st.like || 0) + (st.unsure || 0) + (st.dislike || 0)})` : ""}</h2>
      {st ? (
        <div className="tags" style={{ marginBottom: 10 }}>
          {st.like ? <span className="tag good">{st.like} המליצו</span> : null}
          {st.unsure ? <span className="tag">{st.unsure} לא בטוחים</span> : null}
          {st.dislike ? <span className="tag bad">{st.dislike} לא התאים</span> : null}
        </div>
      ) : null}
      {feed === null ? <div className="muted small">טוען…</div> : null}
      {feed && !feed.length ? <div className="card muted">עוד אין דיווחים על הזן הזה בפיד.</div> : null}
      {feed ? feed.map(it => <FeedCard key={it.id} item={it} byId={catalog.byId} compact />) : null}

      <div className="foot">
        {mine ? (
          <>
            <Link href={`/report/?rid=${mine.id}`} className="btn">{mine.verdict ? "לעדכן את הדיווח שלי" : "לדרג את הקנייה"}</Link>
            <Link href={`/report/?rid=${mine.id}&again=1`} className="btn primary">קניתי שוב</Link>
          </>
        ) : (
          <Link href={`/report/?id=${encodeURIComponent(p.id)}${fromReco ? "&src=reco" : ""}`} className="btn primary">קניתי את זה</Link>
        )}
      </div>
    </>
  );
}
