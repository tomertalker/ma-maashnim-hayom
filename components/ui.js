"use client";
import { useEffect } from "react";
import { IconStar, IconUp, IconDown, IconMeh, IconBack } from "./icons";
import { VERDICT } from "../lib/vocab";

// "back" that still works when the page was opened directly
export function goBack(router, fallback = "/") {
  if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.replace(fallback);
}

export function Chips({ options, value, onChange, max, bad }) {
  const multi = Array.isArray(value);
  const toggle = v => {
    if (!multi) return onChange(value === v ? null : v);
    if (value.includes(v)) return onChange(value.filter(x => x !== v));
    if (max && value.length >= max) return;
    onChange([...value, v]);
  };
  return (
    <div className="chips">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={"chip" + (bad ? " bad" : "")} aria-pressed={multi ? value.includes(v) : value === v} onClick={() => toggle(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Q({ title, hint, children }) {
  return <div className="q"><div className="qt">{title}{hint ? <small>{hint}</small> : null}</div>{children}</div>;
}

export function Switch({ checked, onChange, title, hint, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="knob" />
      <span><b>{title}</b>{hint ? <small>{hint}</small> : null}</span>
    </button>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Stars({ value, onChange }) {
  if (!onChange) {
    if (!value) return null;
    return <span className="stars ro" aria-label={`${value} מתוך 5 כוכבים`}>{[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= value ? "on" : ""}><IconStar /></span>)}</span>;
  }
  return (
    <div className="stars" role="group" aria-label="דירוג בכוכבים">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={n <= (value || 0) ? "on" : ""} aria-label={`${n} כוכבים`} aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)}><IconStar /></button>
      ))}
    </div>
  );
}

export function VerdictPick({ value, onChange, mini }) {
  const opts = [["like", <IconUp key="i" />], ["unsure", <IconMeh key="i" />], ["dislike", <IconDown key="i" />]];
  return (
    <div className={"verdicts" + (mini ? " mini" : "")}>
      {opts.map(([v, icon]) => (
        <button key={v} type="button" className={v} aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)}>{icon}{VERDICT[v]}</button>
      ))}
    </div>
  );
}

export function Stamp({ verdict }) {
  if (!verdict) return <span className="stamp pending">עוד לא דורג</span>;
  return <span className={"stamp " + verdict}>{VERDICT[verdict]}</span>;
}

export function Top({ title, onBack, children }) {
  return (
    <div className="top">
      {onBack ? <button type="button" className="back" aria-label="חזרה" onClick={onBack}><IconBack /></button> : null}
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function Toast({ text, onDone }) {
  useEffect(() => { if (!text) return; const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [text, onDone]);
  return text ? <div className="toast" role="status">{text}</div> : null;
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        {title ? <h2>{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, show, setShow, autoComplete, placeholder, id }) {
  return (
    <div className="pw">
      <input id={id} className="input" type={show ? "text" : "password"} dir="ltr" autoComplete={autoComplete} placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" onClick={() => setShow(!show)}>{show ? "הסתר" : "הצג"}</button>
    </div>
  );
}
