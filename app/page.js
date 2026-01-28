"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signUp() {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password: pw });
    if (error) return setMsg(error.message);
    setMsg("נרשמת! אם נדרש אימות במייל—בדוק את תיבת הדואר.");
  }

  async function signIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) return setMsg(error.message);
    setMsg("התחברת בהצלחה");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="card">
      <div className="h1">Pilot – מנוע המלצות</div>
      <div className="small">גרסת MVP: התחברות → היכרות → המלצות → דיווח</div>

      <div className="hr" />

      {!session ? (
        <>
          <div className="h2">התחברות / הרשמה</div>
          <div className="row">
            <div style={{ flex: 2, minWidth: 240 }}>
              <input className="input" placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={{ flex: 2, minWidth: 240 }}>
              <input className="input" placeholder="סיסמה" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btnPrimary" onClick={signIn}>התחבר</button>
            <button className="btn" onClick={signUp}>הירשם</button>
          </div>

          {msg && <div className="small" style={{ marginTop: 10 }}>{msg}</div>}
          <div className="small" style={{ marginTop: 10 }}>
            דיסקליימר: ההמלצות מבוססות נתונים ודמיון, לא ייעוץ רפואי.
          </div>
        </>
      ) : (
        <>
          <div className="h2">מחובר ✅</div>
          <div className="row">
            <a className="btn btnPrimary" href="/onboarding">שאלון היכרות</a>
            <a className="btn" href="/recommendations">המלצות</a>
            <a className="btn" href="/report">דיווח</a>
            <button className="btn" onClick={signOut}>התנתק</button>
          </div>
          <div className="small" style={{ marginTop: 10 }}>User: {session.user.email}</div>
        </>
      )}
    </div>
  );
}
