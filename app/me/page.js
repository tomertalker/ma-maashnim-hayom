"use client";
// The card and the settings moved into "שלי" (/journal/) in v3. This address
// stays so old links and home-screen shortcuts still land somewhere.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MeMoved() {
  const router = useRouter();
  useEffect(() => { router.replace("/journal/"); }, [router]);
  return <div className="splash" aria-busy="true">טוען…</div>;
}
