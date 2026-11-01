"use client";
import { useEffect, useRef, useState } from "react";
import { rpc } from "../lib/api";

const cache = new Map();   // "id:size" -> data URL

async function fetchPhoto(id, size) {
  const k = id + ":" + size;
  if (cache.has(k)) return cache.get(k);
  const r = await rpc("mmh_photo", { p_id: id, p_size: size });
  if (!r.ok) return null;
  const url = "data:image/jpeg;base64," + r.jpeg;
  cache.set(k, url);
  return url;
}

// A thumbnail that loads only when it scrolls into view; tap opens the full photo.
export function Thumb({ id, onRemove }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(cache.get(id + ":thumb") || null);
  const [full, setFull] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (src) return;
    const el = ref.current; if (!el) return;
    let live = true;
    const load = () => fetchPhoto(id, "thumb").then(u => { if (live && u) setSrc(u); });
    if (typeof IntersectionObserver === "undefined") { load(); return () => { live = false; }; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [id, src]);

  async function show() { setOpen(true); const u = await fetchPhoto(id, "full"); if (u) setFull(u); }

  return (
    <>
      <div className="ph" ref={ref}>
        <button type="button" onClick={show} aria-label="להגדיל את התמונה" style={{ all: "unset", display: "block", width: "100%", height: "100%", cursor: "zoom-in" }}>
          {src ? <img src={src} alt="תמונה שצירף המטופל" loading="lazy" /> : null}
        </button>
        {onRemove ? <button type="button" className="x" aria-label="להסיר את התמונה" onClick={onRemove}>×</button> : null}
      </div>
      {open ? (
        <div className="viewer" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="תמונה">
          <img src={full || src || ""} alt="תמונה שצירף המטופל" />
          <button type="button" aria-label="סגירה" onClick={() => setOpen(false)}>×</button>
        </div>
      ) : null}
    </>
  );
}

export function Photos({ ids }) {
  if (!ids || !ids.length) return null;
  return <div className={"photos" + (ids.length === 1 ? " one" : "")}>{ids.map(id => <Thumb key={id} id={id} />)}</div>;
}
