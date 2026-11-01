import { TIER } from "../lib/engine/engine.mjs";

// max: short form for lists (fewer reasons, no general cautions)
export function Why({ ex, max }) {
  const R = max ? ex.R.slice(0, max) : ex.R;
  const C = max ? ex.C.slice(0, 1) : [...ex.C, ...(ex.G || [])];
  return (
    <>
      {R.length ? (
        <ul className="why">
          {R.map((r, i) => <li key={i}><span className={"tier " + r.tier}>{TIER[r.tier]}</span><span>{r.t}</span></li>)}
        </ul>
      ) : null}
      {C.map((c, i) => <div key={i} className="caution">{c}</div>)}
    </>
  );
}
