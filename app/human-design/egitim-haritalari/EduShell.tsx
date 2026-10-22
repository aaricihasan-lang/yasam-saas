"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { premiumFontVars } from "@/app/_premium/fonts";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";

/** Eğitmen ekranlarının ortak açık tema kabuğu (owner ekranıyla aynı premium kompozisyon). */
export function EduShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${base.page} ${premiumFontVars}`}>
      <div className={base.inner}>{children}</div>
    </div>
  );
}

/**
 * Tek tip "bulunamadı" — yetkisiz kullanıcı, yayımlanmamış / kaldırılmış kayıt ve hatalı kimlik AYNI görünür.
 * Özelliğin adı / varlığı burada yazılmaz.
 */
export function EduNotFound() {
  return (
    <EduShell>
      <section className={`${base.panel} ${css.nf}`} role="alert">
        <div className={css.nfCode}>404</div>
        <p>Sayfa bulunamadı.</p>
        <p><Link className={base.ext} href="/human-design">Human Design ana sayfası</Link></p>
      </section>
    </EduShell>
  );
}

export function EduLoading() {
  return (
    <EduShell>
      <p className={base.empty} aria-live="polite">Yükleniyor…</p>
    </EduShell>
  );
}
