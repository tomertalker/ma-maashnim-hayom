"use client";
import { useMemo, useState } from "react";
import { CLS, TYPE } from "../lib/vocab";

const norm = s => String(s || "").toLowerCase().replace(/[\s.'"׳״`\-_&]/g, "");

// Search box over the catalogue. Calls onPick(product), or onFree(text) for a
// strain that is not listed.
export default function StrainPicker({ products, onPick, onFree, exclude, placeholder, autoFocus, limit = 8 }) {
  const [q, setQ] = useState("");
  const index = useMemo(() => (products || []).map(p => ({ p, k: norm(p.he) + "|" + norm(p.en) })), [products]);
  const hits = useMemo(() => {
    const n = norm(q); if (!n) return [];
    const a = [], b = [];
    for (const { p, k } of index) {
      if (exclude && exclude.has(p.id)) continue;
      const i = k.indexOf(n); if (i < 0) continue;
      (i === 0 || k[i - 1] === "|" ? a : b).push(p);
    }
    return [...a, ...b].slice(0, limit);
  }, [q, index, exclude, limit]);
  const pick = p => { setQ(""); onPick(p); };

  return (
    <div>
      <input className="input" type="search" inputMode="search" value={q} onChange={e => setQ(e.target.value)} autoFocus={autoFocus}
        placeholder={placeholder || "חיפוש זן, בעברית או באנגלית"} aria-label="חיפוש זן" autoComplete="off" autoCorrect="off" spellCheck={false} />
      {q.trim() ? (
        <div className="list" style={{ marginTop: 8 }}>
          {hits.map(p => (
            <button key={p.id} type="button" onClick={() => pick(p)}>
              <span className={"dot cls-" + (p.cls || "")} />
              <span className="t"><b>{p.he}</b><small><span className="en">{p.en}</span> | {p.type !== "flower" ? TYPE[p.type] + " | " : ""}{p.cat}{p.cls ? " | " + CLS[p.cls] : ""}</small></span>
            </button>
          ))}
          {!hits.length && !onFree ? <div className="muted small">לא נמצא זן בשם הזה.</div> : null}
          {onFree && q.trim().length >= 2 ? (
            <button type="button" onClick={() => { const t = q.trim(); setQ(""); onFree(t); }}>
              <span className="t"><b>״{q.trim()}״ לא ברשימה</b><small>להוסיף כזן בכתיבה חופשית</small></span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
