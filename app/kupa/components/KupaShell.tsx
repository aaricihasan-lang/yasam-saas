"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * KUPA & HACAMAT — ortak premium sayfa kabuğu (tüm /kupa/** sayfalarının görsel
 * source-of-truth'u). Yaşam Sistemi'nin açık/premium ürün diliyle uyumlu: sıcak
 * kırık-beyaz taban + kontrollü amber/bordo aksan (Kupa kimliği), full-width geniş
 * çalışma alanı. Yeni bir design system üretilmez; global buton sistemi korunur.
 *
 * NOT: Bu tur yalnız sunum/layout. İşlev, CRUD sözleşmeleri, BodyMap koordinat
 * matematiği ve API DEĞİŞMEZ.
 */
export function KupaShell({
  title,
  subtitle,
  badge,
  breadcrumb,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#faf6f0] text-slate-800">
      {/* Yumuşak sıcak dekor blob'ları (sadece atmosfer). */}
      <div
        className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-amber-200/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-120px] top-24 h-72 w-72 rounded-full bg-rose-200/25 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Breadcrumb */}
        <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
          <Link href="/" className="no-underline transition hover:text-amber-700">
            Ana Sayfa
          </Link>
          <span aria-hidden className="text-slate-300">
            /
          </span>
          <Link href="/enerji-beden" className="no-underline transition hover:text-amber-700">
            Enerji &amp; Beden
          </Link>
          <span aria-hidden className="text-slate-300">
            /
          </span>
          {breadcrumb?.length ? (
            <>
              <Link href="/kupa" className="no-underline transition hover:text-amber-700">
                Kupa &amp; Hacamat
              </Link>
              {breadcrumb.map((b) => (
                <span key={b.label} className="flex items-center gap-1.5">
                  <span aria-hidden className="text-slate-300">
                    /
                  </span>
                  {b.href ? (
                    <Link href={b.href} className="no-underline transition hover:text-amber-700">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="text-slate-700">{b.label}</span>
                  )}
                </span>
              ))}
            </>
          ) : (
            <span className="text-slate-700">Kupa &amp; Hacamat</span>
          )}
        </nav>

        {/* Header */}
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {badge ? (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                {badge}
              </span>
            ) : null}
            <h1 className="bg-gradient-to-r from-amber-700 via-orange-600 to-rose-700 bg-clip-text text-2xl font-black tracking-tight text-transparent md:text-3xl lg:text-[2.5rem] lg:leading-[1.1]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-[15px]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>

        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Premium bileşen token'ları ─────────────────────────
 * Tüm /kupa/** sayfaları ve CrudManager bunları paylaşır (tek tasarım dili). Açık
 * zemin, okunabilir koyu metin, amber/bordo aksan. Kaydet=yeşil (kupaBtnSuccess).
 */

/** Premium kart: beyaz zemin, yumuşak amber kenarlık + ince gölge. */
export const kupaCard =
  "rounded-2xl border border-amber-100/90 bg-white/95 p-4 shadow-[0_1px_3px_rgba(120,80,40,0.06),0_8px_24px_-16px_rgba(120,80,40,0.12)] backdrop-blur-sm";

/** Amber birincil aksiyon (modül CTA: ekle/bağla/işaretle). */
export const kupaBtnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2 text-sm font-bold text-white shadow-sm shadow-amber-500/20 transition hover:from-amber-600 hover:to-orange-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:cursor-not-allowed disabled:opacity-50";

/** Yeşil kaydet/onay aksiyonu (global btn-primary yeşiliyle uyumlu). */
export const kupaBtnSuccess =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-sm font-bold text-white shadow-sm shadow-emerald-500/20 transition hover:from-emerald-600 hover:to-teal-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-50";

/** İkincil/ghost aksiyon (açık zemin, ince kenarlık). */
export const kupaBtnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50";

/** Yıkıcı aksiyon (kontrollü kırmızı). */
export const kupaBtnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-50";

/** Form girişi (açık zemin, amber focus). */
export const kupaInput =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/70";

/** Segmented control pill — pasif durum (harita/araç seçicileri için). */
export const kupaPill =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

/** Segmented control pill — seçili durum. */
export const kupaPillActive =
  "rounded-lg border border-amber-400 bg-gradient-to-b from-amber-100 to-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 shadow-sm";
