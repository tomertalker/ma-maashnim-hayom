"use client";
import Link from "next/link";
import { Stamp, Stars } from "./ui";
import { Photos } from "./Photo";
import { CLS, HELPED, BOTHERED, USES, GRAMS, label, labels, monthHe } from "../lib/vocab";

// One published review, drawn as a bag label. It shows only what the feed
// function returns: no name, no nickname, a month instead of a date.
export default function FeedCard({ item, byId, onFlag, compact }) {
  const p = item.product_id && byId ? byId.get(item.product_id) : null;
  const name = p ? p.he : item.product_name || "זן לא ידוע";
  const cls = p && p.cls ? " cls-" + p.cls : "";
  const ctx = item.ctx;
  const who = ctx ? [labels(USES, ctx.uses).join(", "), ctx.grams ? label(GRAMS, ctx.grams) + " גרם בחודש" : null].filter(Boolean) : [];

  return (
    <article className={"label" + cls}>
      <div className="row top-al">
        <div className="grow">
          {compact ? null : p ? <Link href={`/strain/?id=${encodeURIComponent(p.id)}`} className="name">{name}{p.en ? <span className="en">{p.en}</span> : null}</Link>
            : <div className="name">{name}</div>}
          <div className="tags" style={{ marginTop: compact ? 0 : 8 }}>
            {p && p.cls ? <span className={"tag cls-" + p.cls}>{CLS[p.cls]}</span> : null}
            {p && p.cat && !compact ? <span className="tag en">{p.cat}</span> : null}
            {item.buys > 1 ? <span className="tag">נקנה {item.buys} פעמים</span> : null}
            {item.source === "reco" ? <span className="tag">נקנה לפי המלצה</span> : null}
            {item.source === "history" ? <span className="tag">ניסיון קודם</span> : null}
          </div>
        </div>
        <Stamp verdict={item.verdict} />
      </div>

      {item.stars ? <div style={{ marginTop: 10 }}><Stars value={item.stars} /></div> : null}
      {item.helped && item.helped.length ? (
        <div className="tags" style={{ marginTop: 10 }}><span className="small muted">עזר ל:</span>{item.helped.map(k => <span key={k} className="tag good">{label(HELPED, k)}</span>)}</div>
      ) : null}
      {item.bothered && item.bothered.length ? (
        <div className="tags" style={{ marginTop: 8 }}><span className="small muted">הפריע:</span>{item.bothered.map(k => <span key={k} className="tag bad">{label(BOTHERED, k)}</span>)}</div>
      ) : null}
      {item.note ? <p className="text">{item.note}</p> : null}
      {!item.verdict && !item.note ? <p className="text muted small">נקנה, עוד בלי חוות דעת.</p> : null}
      <Photos ids={item.photos} />

      <div className="who">
        <span className="ctx">
          {item.mine ? "הדיווח שלך" : who.length ? who.join(" | ") : "מטופל אנונימי"}
          {item.month ? <span> | {monthHe(item.month)}</span> : null}
        </span>
        {item.mine
          ? <Link href={`/report/?rid=${item.id}`} className="btn sm quiet">עריכה</Link>
          : onFlag ? <button type="button" className="btn sm quiet" style={{ color: "var(--muted)" }} onClick={() => onFlag(item)}>לא מתאים?</button> : null}
      </div>
    </article>
  );
}
