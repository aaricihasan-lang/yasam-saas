"use client";

/**
 * Doğaltaş premium görünüm bileşenleri — Doğaltaş Listesi, Mineral Listesi,
 * Taş Kombinasyonları ve Taş Bilgi Kütüphanesi ortak kabuğu.
 *
 * Yalnız sunum: veri, yönlendirme ve iş mantığı sayfalarda kalır. Stil tek
 * kaynaktan (`dogaltasPremium.module.css`) gelir. Dekor görselleri sayfa
 * seviyesinde sabittir; kayıt içeriğine göre görsel/emoji üretilmez.
 */

import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { Search } from "lucide-react";
import { DogaltasBreadcrumb } from "@/app/dogaltas/components/DogaltasBreadcrumb";
import s from "./dogaltasPremium.module.css";

export { s as dp };

const ART = "/premium/dogaltas";

type ShellProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Başlık sağ alanı: sayaçlar veya ana aksiyonlar. */
  aside?: ReactNode;
  /** Başlık kartının altında, kartın içinde (ör. yeni kayıt formu). */
  heroFooter?: ReactNode;
  /** Ekranı kaplayan iki panel düzeni (Taş Bilgi Kütüphanesi). */
  fullHeight?: boolean;
  children: ReactNode;
};

export function DogaltasPremiumShell({
  eyebrow,
  title,
  subtitle,
  aside,
  heroFooter,
  fullHeight = false,
  children,
}: ShellProps) {
  return (
    <main className={`${s.page} ${fullHeight ? s.pageFull : ""}`}>
      <div className={s.decor} aria-hidden>
        <span className={`${s.blob} ${s.blobA}`} />
        <span className={`${s.blob} ${s.blobB}`} />
        <span className={`${s.blob} ${s.blobC}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${s.sideArt} ${s.sideArtLeft}`} src={`${ART}/sayfa-yan-sol.webp`} width={132} height={861} alt="" decoding="async" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${s.sideArt} ${s.sideArtRight}`} src={`${ART}/sayfa-yan-sag.webp`} width={140} height={861} alt="" decoding="async" draggable={false} />
      </div>

      <div className={s.container}>
        <DogaltasBreadcrumb />

        <header className={s.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.heroArt} src={`${ART}/sayfa-hero-kristal.webp`} width={300} height={158} alt="" aria-hidden decoding="async" draggable={false} />
          <div className={s.heroGrid}>
            <div className="min-w-0">
              <span className={s.eyebrow}>
                <span className={s.eyebrowDot} aria-hidden />
                {eyebrow}
              </span>
              <h1 className={s.title}>{title}</h1>
              {subtitle ? <p className={s.subtitle}>{subtitle}</p> : null}
            </div>
            {aside ? <div className={s.heroAside}>{aside}</div> : null}
          </div>
          {heroFooter ? <div className={s.heroFooter}>{heroFooter}</div> : null}
        </header>

        <div className={fullHeight ? "mt-4 flex flex-1 flex-col" : `mt-4 ${s.stack}`}>{children}</div>
      </div>
    </main>
  );
}

export function DogaltasStats({ children, columns }: { children: ReactNode; columns: number }) {
  return (
    <div className={s.stats} style={{ "--dp-stat-cols": columns } as CSSProperties}>
      {children}
    </div>
  );
}

export function DogaltasStat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: ReactNode }) {
  return (
    <div className={s.stat}>
      <span className={s.statIcon} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className={s.statValue}>{value}</div>
        <div className={s.statLabel}>{label}</div>
      </div>
    </div>
  );
}

type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & { compact?: boolean };

export function DogaltasSearchField({ compact = false, className, ...input }: SearchFieldProps) {
  return (
    <div className={`${s.search} ${compact ? s.searchCompact : ""}`}>
      <Search className={s.searchIcon} aria-hidden />
      <input {...input} className={`${s.searchInput} ${className ?? ""}`} />
    </div>
  );
}

type EmptyProps = {
  /** Sayfa seviyesinde sabit çizim; verilmezse `icon` gösterilir. */
  art?: "mineral" | "kutuphane";
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  actions?: ReactNode;
  /** Kendi çerçevesi olmadan (başka bir panelin içinde) kullanım. */
  bare?: boolean;
  titleClassName?: string;
};

export function DogaltasEmptyState({ art, icon, title, text, actions, bare = false, titleClassName }: EmptyProps) {
  const content = (
    <>
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={`${s.emptyArt} ${art === "kutuphane" ? s.emptyArtSmall : ""}`}
          src={art === "mineral" ? `${ART}/sayfa-bos-mineral.webp` : `${ART}/sayfa-bos-kutuphane.webp`}
          width={art === "mineral" ? 350 : 270}
          height={art === "mineral" ? 235 : 100}
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
        />
      ) : icon ? (
        <span className={s.emptyIcon} aria-hidden>
          {icon}
        </span>
      ) : null}
      <h2 className={`${s.emptyTitle} ${titleClassName ?? ""}`}>{title}</h2>
      {text ? <p className={s.emptyText}>{text}</p> : null}
      {actions ? <div className={s.emptyActions}>{actions}</div> : null}
    </>
  );
  return (
    <div className={bare ? s.emptyInner : s.empty}>
      {content}
    </div>
  );
}
