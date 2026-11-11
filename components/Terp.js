"use client";
import Link from "next/link";
import { Sheet } from "./ui";
import { TERP_INFO, studied, flavorsOf, terpName } from "../lib/terpenes";

// What one terpene is, in a few lines. Used in the bottom sheet on a strain
// page and as a card in the guide.
export function TerpBody({ k, pct }) {
  const info = TERP_INFO[k];
  if (!info) return <p className="muted" style={{ margin: 0 }}>אין עדיין הסבר על הטרפן הזה.</p>;
  const st = studied(k);
  const fl = flavorsOf(k);
  return (
    <>
      <dl>
        <dt>ריח וטעם</dt><dd>{info.smell}{fl.length ? <span className="muted"> ({fl.join(", ")})</span> : null}</dd>
        <dt>נמצא גם ב</dt><dd>{info.found}</dd>
        {typeof pct === "number" && pct > 0 ? <><dt>בזן הזה</dt><dd className="num">{pct}%</dd></> : null}
        <dt>נחקר בהקשר</dt>
        <dd>{st.length ? st.map((s, i) => <span key={i}>{i ? ", " : ""}{s.t} <span className={"small tier-txt " + s.tier}>({s.tierHe})</span></span>) : "כמעט לא נחקר"}</dd>
      </dl>
      <p className="small" style={{ margin: "10px 0 0" }}>{info.fact}</p>
    </>
  );
}

export function TerpSheet({ k, pct, onClose }) {
  const info = TERP_INFO[k];
  return (
    <Sheet title={`${terpName(k)}${info ? " · " + info.en : ""}`} onClose={onClose}>
      <div className="guide"><TerpBody k={k} pct={pct} /></div>
      <p className="small muted" style={{ margin: "12px 0 0" }}>רוב המחקר על טרפנים נעשה במעבדה או בבעלי חיים. אין הוכחה שהכמות שבזן משפיעה לבדה, ולכן ליד כל קשר כתוב כמה הוא מבוסס.</p>
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <Link href={`/guide/#${k}`} className="btn grow">לכל הטרפנים</Link>
        <button type="button" className="btn primary grow" onClick={onClose}>סגירה</button>
      </div>
    </Sheet>
  );
}
