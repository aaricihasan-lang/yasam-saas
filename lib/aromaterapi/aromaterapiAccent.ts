/**
 * Aromaterapi V2 vurgu (accent) token'ları.
 *
 * Yaşam Sistemi'nin mevcut görsel dilinden kopmadan Aromaterapi kimliği:
 * açık krem/off-white taban, kontrollü amber/bal + adaçayı yeşili, hafif
 * rose/violet destek. Yoğun gradient/neon YOK, yüksek okunabilirlik, koyu metin.
 *
 * Hub kartları, SectionShell eyebrow'u ve birincil navigasyon hep buradan
 * beslenir (tek kaynak). Kaydet butonları global `.btn-primary` yeşilini korur;
 * bu token'lar buton sistemini DEĞİŞTİRMEZ.
 */

import type { AromaterapiAccent } from "@/lib/aromaterapi/aromaterapiModules";

export type AromaterapiAccentTokens = {
  /** Eyebrow / küçük rozet. */
  eyebrow: string;
  /** Küçük durum noktası. */
  dot: string;
  /** İkon kutusu (yumuşak zemin + ince ring). */
  iconBox: string;
  /** Hub kartı kenarlığı. */
  cardBorder: string;
  /** Hub kartı yumuşak gradient zemini. */
  cardGradient: string;
  /** Hub kartı hover kenarlığı. */
  cardHoverBorder: string;
  /** Kart CTA / vurgulu şerit gradienti. */
  cta: string;
  /** Aktif navigasyon pill'i. */
  navActive: string;
  /** Küçük bilgi çipi. */
  chip: string;
};

export const AROMATERAPI_ACCENT: Record<
  AromaterapiAccent,
  AromaterapiAccentTokens
> = {
  amber: {
    eyebrow: "border-amber-200/80 bg-amber-50/90 text-amber-800",
    dot: "bg-amber-500",
    iconBox: "border-amber-200/80 bg-amber-50/70 ring-amber-100",
    cardBorder: "border-amber-300/55",
    cardGradient: "bg-gradient-to-br from-amber-50 via-rose-50/70 to-orange-50/60",
    cardHoverBorder: "hover:border-amber-400/65",
    cta: "from-amber-500 to-rose-500",
    navActive: "bg-amber-500 text-white shadow-[0_4px_14px_rgba(245,158,11,0.28)]",
    chip: "border-amber-200 text-amber-800",
  },
  emerald: {
    eyebrow: "border-emerald-200/80 bg-emerald-50/90 text-emerald-800",
    dot: "bg-emerald-500",
    iconBox: "border-emerald-200/80 bg-emerald-50/70 ring-emerald-100",
    cardBorder: "border-emerald-300/55",
    cardGradient: "bg-gradient-to-br from-emerald-50 via-teal-50/70 to-cyan-50/60",
    cardHoverBorder: "hover:border-emerald-400/65",
    cta: "from-emerald-500 to-teal-500",
    navActive: "bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.28)]",
    chip: "border-emerald-200 text-emerald-800",
  },
  rose: {
    eyebrow: "border-rose-200/80 bg-rose-50/90 text-rose-800",
    dot: "bg-rose-500",
    iconBox: "border-rose-200/80 bg-rose-50/70 ring-rose-100",
    cardBorder: "border-rose-300/55",
    cardGradient: "bg-gradient-to-br from-rose-50 via-pink-50/70 to-fuchsia-50/60",
    cardHoverBorder: "hover:border-rose-400/65",
    cta: "from-rose-500 to-pink-500",
    navActive: "bg-rose-500 text-white shadow-[0_4px_14px_rgba(244,63,94,0.26)]",
    chip: "border-rose-200 text-rose-800",
  },
  violet: {
    eyebrow: "border-violet-200/80 bg-violet-50/90 text-violet-800",
    dot: "bg-violet-500",
    iconBox: "border-violet-200/80 bg-violet-50/70 ring-violet-100",
    cardBorder: "border-violet-300/55",
    cardGradient: "bg-gradient-to-br from-violet-50 via-purple-50/70 to-fuchsia-50/60",
    cardHoverBorder: "hover:border-violet-400/65",
    cta: "from-violet-500 to-purple-600",
    navActive: "bg-violet-500 text-white shadow-[0_4px_14px_rgba(139,92,246,0.26)]",
    chip: "border-violet-200 text-violet-800",
  },
  sky: {
    eyebrow: "border-sky-200/80 bg-sky-50/90 text-sky-800",
    dot: "bg-sky-500",
    iconBox: "border-sky-200/80 bg-sky-50/70 ring-sky-100",
    cardBorder: "border-sky-300/55",
    cardGradient: "bg-gradient-to-br from-sky-50 via-cyan-50/70 to-blue-50/60",
    cardHoverBorder: "hover:border-sky-400/65",
    cta: "from-sky-500 to-cyan-500",
    navActive: "bg-sky-500 text-white shadow-[0_4px_14px_rgba(14,165,233,0.26)]",
    chip: "border-sky-200 text-sky-800",
  },
  teal: {
    eyebrow: "border-teal-200/80 bg-teal-50/90 text-teal-800",
    dot: "bg-teal-500",
    iconBox: "border-teal-200/80 bg-teal-50/70 ring-teal-100",
    cardBorder: "border-teal-300/55",
    cardGradient: "bg-gradient-to-br from-teal-50 via-emerald-50/70 to-cyan-50/60",
    cardHoverBorder: "hover:border-teal-400/65",
    cta: "from-teal-500 to-emerald-500",
    navActive: "bg-teal-500 text-white shadow-[0_4px_14px_rgba(20,184,166,0.26)]",
    chip: "border-teal-200 text-teal-800",
  },
};
