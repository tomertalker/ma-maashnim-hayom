"use client";
// One place that holds what every screen needs: who is signed in, their card,
// the catalogue, their own reviews and the community counts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { rpc, loadSession, setSession, setAuthLostHandler } from "../lib/api";
import { buildContext } from "../lib/engine/engine.mjs";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
const CAT_KEY = "mmh.catalog";

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSess] = useState(null);
  const [me, setMe] = useState(null);
  const [catalog, setCatalog] = useState(null);     // {products, fetchedAt, byId, ctx}
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({});
  const [toast, setToast] = useState("");
  const [bootError, setBootError] = useState("");
  const booted = useRef(false);

  const putCatalog = useCallback(c => {
    const products = c.products || [];
    setCatalog({ products, fetchedAt: c.fetched_at || null, byId: new Map(products.map(p => [p.id, p])), ctx: buildContext(products) });
  }, []);

  const loadAll = useCallback(async () => {
    setBootError("");
    try { const cached = JSON.parse(localStorage.getItem(CAT_KEY) || "null"); if (cached && cached.products) putCatalog(cached); } catch {}
    const [m, c, r, s] = await Promise.all([rpc("mmh_me"), rpc("mmh_catalog"), rpc("mmh_my_reviews"), rpc("mmh_stats")]);
    if (m.error === "auth") return false;
    if (m.error) { setBootError(m.error); return false; }
    setMe(m);
    if (c.ok) { putCatalog(c); try { localStorage.setItem(CAT_KEY, JSON.stringify({ products: c.products, fetched_at: c.fetched_at })); } catch {} }
    if (r.ok) setReviews(r.reviews);
    if (s.ok) setStats(s.stats);
    return true;
  }, [putCatalog]);

  const signOutLocal = useCallback(() => {
    setSession(null); setSess(null); setMe(null); setReviews([]); setStats({}); setCatalog(null);
    try { localStorage.removeItem(CAT_KEY); localStorage.removeItem("mmh.cardDraft"); } catch {}
  }, []);

  useEffect(() => {
    if (booted.current) return; booted.current = true;
    setAuthLostHandler(signOutLocal);
    const s = loadSession();
    if (!s) { setReady(true); return; }
    setSess(s);
    loadAll().finally(() => setReady(true));
  }, [loadAll, signOutLocal]);

  const signIn = useCallback(async s => {
    setSession(s); setSess(s); setReady(false);
    await loadAll(); setReady(true);
  }, [loadAll]);

  const signOut = useCallback(async () => { await rpc("mmh_logout"); signOutLocal(); }, [signOutLocal]);
  const refreshReviews = useCallback(async () => { const r = await rpc("mmh_my_reviews"); if (r.ok) setReviews(r.reviews); return r; }, []);
  const refreshStats = useCallback(async () => { const s = await rpc("mmh_stats"); if (s.ok) setStats(s.stats); }, []);

  const value = useMemo(() => ({
    ready, session, me, setMe, catalog, reviews, stats, bootError,
    signIn, signOut, signOutLocal, refreshReviews, refreshStats, reload: loadAll,
    say: setToast, toast, clearToast: () => setToast(""),
  }), [ready, session, me, catalog, reviews, stats, bootError, signIn, signOut, signOutLocal, refreshReviews, refreshStats, loadAll, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
