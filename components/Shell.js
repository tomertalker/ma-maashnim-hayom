"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./AppContext";
import Auth from "./Auth";
import { Toast } from "./ui";
import { IconFeed, IconSpark, IconPlus, IconBook, IconUser } from "./icons";
import { errText } from "../lib/api";

const clean = p => (p || "/").replace(/\/+$/, "") || "/";

export default function Shell({ children }) {
  const { ready, session, me, bootError, reload, toast, clearToast } = useApp();
  const path = clean(usePathname());
  const router = useRouter();
  const needsCard = ready && session && me && !me.card;

  useEffect(() => { if (needsCard && path !== "/card") router.replace("/card/"); }, [needsCard, path, router]);

  if (!ready) return <div className="splash" aria-busy="true">טוען…</div>;
  if (!session) return <Auth />;
  if (!me) {
    return (
      <main className="app bare"><div className="empty">
        <b>לא הצלחנו לטעון את הנתונים</b>{errText(bootError || "network")}
        <div><button className="btn primary" onClick={() => reload()}>לנסות שוב</button></div>
      </div></main>
    );
  }
  if (needsCard && path !== "/card") return <div className="splash" aria-busy="true">טוען…</div>;

  const bare = path === "/card" || path === "/report";
  const tab = (href, label, icon, match) => (
    <Link href={href} aria-current={(match || [clean(href)]).includes(path) ? "page" : undefined}>{icon}<span>{label}</span></Link>
  );
  return (
    <>
      <main className={"app" + (bare ? " bare" : "")}>{children}</main>
      {!bare ? (
        <nav className="nav no-print" aria-label="ניווט ראשי"><div className="nav-in">
          {tab("/", "פיד", <IconFeed />)}
          {tab("/reco/", "המלצות", <IconSpark />, ["/reco", "/strain"])}
          <Link href="/report/" className="add"><span className="plus"><IconPlus /></span><span>דיווח</span></Link>
          {tab("/journal/", "היומן שלי", <IconBook />)}
          {tab("/me/", "הכרטיס שלי", <IconUser />)}
        </div></nav>
      ) : null}
      <Toast text={toast} onDone={clearToast} />
    </>
  );
}
