"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../components/AppContext";
import FeedCard from "../components/FeedCard";
import { Sheet } from "../components/ui";
import { rpc, errText } from "../lib/api";
import { recommend } from "../lib/engine/engine.mjs";

const PAGE = 15;
const FILTERS = [["all", "הכל"], ["like", "מומלצים"], ["dislike", "לא התאים"], ["me", "מטופלים כמוני"]];

export default function Feed() {
  const { me, catalog, reviews, stats, say, refreshStats } = useApp();
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [flag, setFlag] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async (f, offset) => {
    const my = ++seq.current;
    setBusy(true); setErr("");
    const r = await rpc("mmh_feed", { p_offset: offset, p_limit: PAGE, p_kind: f === "like" || f === "dislike" ? f : null, p_like_me: f === "me" });
    if (my !== seq.current) return;           // a newer request (another filter) took over
    setBusy(false);
    if (r.error) { if (r.error !== "auth") setErr(errText(r.error)); return; }
    setMore(r.items.length === PAGE);
    setItems(prev => {
      if (offset === 0) return r.items;
      const seen = new Set((prev || []).map(x => x.id));
      return [...(prev || []), ...r.items.filter(x => !seen.has(x.id))];
    });
  }, []);

  useEffect(() => { setItems(null); load(filter, 0); }, [filter, load]);
  useEffect(() => { refreshStats(); }, [refreshStats]);

  const pick = useMemo(() => {
    if (!me || !me.card || !catalog || !catalog.products.length) return null;
    const { rows } = recommend(me.card, reviews, catalog.products, { ctx: catalog.ctx, stats });
    return rows.find(r => r.status === "new") || null;
  }, [me, catalog, reviews, stats]);

  async function sendFlag(reason) {
    const it = flag; setFlag(null);
    const r = await rpc("mmh_flag", { p_review_id: it.id, p_reason: reason });
    say(r.ok ? "תודה, הדיווח התקבל" : errText(r.error));
  }

  return (
    <>
      <div className="top"><h1>מה מעשנים היום</h1></div>

      {pick ? (
        <Link href={`/strain/?id=${encodeURIComponent(pick.p.id)}&from=reco`} className={"label cls-" + (pick.p.cls || "")} style={{ marginBottom: 14 }}>
          <div className="row">
            <div className="grow">
              <div className="small muted">ההמלצה הבאה שלך</div>
              <div className="name">{pick.p.he}</div>
            </div>
            <div className="match"><b className="num">{pick.disp}%</b><small>התאמה</small></div>
          </div>
        </Link>
      ) : null}

      <div className="filters" role="group" aria-label="סינון הפיד">
        {FILTERS.map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>

      {err ? <div className="err-box" role="alert">{err} <button className="btn sm quiet" onClick={() => load(filter, 0)}>לנסות שוב</button></div> : null}
      {items === null && !err ? <div className="empty" aria-busy="true">טוען…</div> : null}
      {items && !items.length ? (
        <div className="empty">
          <b>{filter === "all" ? "עוד אין דיווחים בפיד" : "אין דיווחים שמתאימים לסינון"}</b>
          {filter === "me" ? "כאן יופיעו דיווחים של מטופלים שבחרו להציג התוויה, ויש להם סיבת שימוש משותפת איתך."
            : filter === "all" ? "הדיווח הראשון יכול להיות שלך." : "אפשר לחזור ל\"הכל\"."}
          {filter === "all" ? <div><Link href="/report/" className="btn primary">לדווח על קנייה</Link></div> : null}
        </div>
      ) : null}
      {items ? items.map(it => <FeedCard key={it.id} item={it} byId={catalog && catalog.byId} onFlag={setFlag} />) : null}
      {items && items.length && more ? (
        <div className="center" style={{ marginTop: 14 }}><button className="btn" disabled={busy} onClick={() => load(filter, items.length)}>{busy ? "טוען…" : "להציג עוד"}</button></div>
      ) : null}

      {flag ? (
        <Sheet title="מה לא מתאים בדיווח?" onClose={() => setFlag(null)}>
          <div className="list">
            {["פרטים מזהים (שם, טלפון, פנים בתמונה)", "תוכן פוגעני או לא קשור", "מכירה או פרסום", "משהו אחר"].map(t => (
              <button key={t} type="button" onClick={() => sendFlag(t)}>{t}</button>
            ))}
          </div>
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => setFlag(null)}>ביטול</button>
        </Sheet>
      ) : null}
    </>
  );
}
