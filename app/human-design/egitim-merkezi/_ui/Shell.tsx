"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { premiumFontVars } from "@/app/_premium/fonts";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";
import { privCall, type Side } from "./privApi";

/** Eğitim Merkezi ortak açık tema kabuğu (onaylı eğitim ekranlarıyla aynı premium kompozisyon). */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={`${base.page} ${premiumFontVars}`} data-edu-private>
      <div className={base.inner}>{children}</div>
    </div>
  );
}

/** Tek tip "bulunamadı": yetkisiz kullanıcı, silinmiş / izni geri çekilmiş kayıt ve hatalı kimlik AYNI görünür. */
export function NotFoundView({ home = "/human-design" }: { home?: string }) {
  return (
    <Shell>
      <section className={`${base.panel} ${css.nf}`} role="alert" data-edu-notfound>
        <div className={css.nfCode}>404</div>
        <p>Sayfa bulunamadı.</p>
        <p><Link className={base.ext} href={home}>Ana sayfaya dön</Link></p>
      </section>
    </Shell>
  );
}

export function LoadingView() {
  return (
    <Shell>
      <p className={base.empty} aria-live="polite" data-edu-loading>Yükleniyor…</p>
    </Shell>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Shell>
      <div className={base.err} role="alert" data-edu-error>
        {message}
        {onRetry ? <> <button type="button" className={base.linkBtn} onClick={onRetry}>Tekrar dene</button></> : null}
      </div>
    </Shell>
  );
}

/** Sunucu erişim yoklaması: 200 gelmeden HİÇBİR içerik çizilmez (kapı yerine geçmez; API'ler ayrıca doğrular). */
export function useAccess(side: Side, url: string): "loading" | "ok" | "denied" | "error" {
  const [s, setS] = useState<"loading" | "ok" | "denied" | "error">("loading");
  useEffect(() => {
    let live = true;
    void privCall(side, url).then((r) => { if (live) setS(r.ok ? "ok" : r.notFound || r.status === 401 || r.status === 403 ? "denied" : "error"); });
    return () => { live = false; };
  }, [side, url]);
  return s;
}
