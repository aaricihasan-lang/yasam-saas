/**
 * Doğaltaş V3 vurgu (accent) token'ları — amber/emerald kimliği.
 * Hem hub kartları hem SectionShell eyebrow'u buradan beslenir (tek kaynak).
 */

import type { DogaltasAccent } from "@/lib/dogaltas/dogaltasModules";

export type DogaltasAccentTokens = {
  /** Eyebrow / küçük rozet sınıfı. */
  eyebrow: string;
  /** İkon kutusu (gradient + ring). */
  iconBox: string;
  /** Küçük durum noktası. */
  dot: string;
  /** Kart hover halka rengi. */
  cardHover: string;
};

export const DOGALTAS_ACCENT: Record<DogaltasAccent, DogaltasAccentTokens> = {
  emerald: {
    eyebrow: "border-emerald-200 bg-emerald-50 text-emerald-700",
    iconBox: "bg-gradient-to-br from-emerald-100 to-teal-100 ring-emerald-200/70",
    dot: "bg-emerald-500",
    cardHover: "hover:border-emerald-300 hover:shadow-emerald-200/40",
  },
  amber: {
    eyebrow: "border-amber-200 bg-amber-50 text-amber-700",
    iconBox: "bg-gradient-to-br from-amber-100 to-orange-100 ring-amber-200/70",
    dot: "bg-amber-500",
    cardHover: "hover:border-amber-300 hover:shadow-amber-200/40",
  },
  teal: {
    eyebrow: "border-teal-200 bg-teal-50 text-teal-700",
    iconBox: "bg-gradient-to-br from-teal-100 to-emerald-100 ring-teal-200/70",
    dot: "bg-teal-500",
    cardHover: "hover:border-teal-300 hover:shadow-teal-200/40",
  },
  lime: {
    eyebrow: "border-lime-200 bg-lime-50 text-lime-700",
    iconBox: "bg-gradient-to-br from-lime-100 to-emerald-100 ring-lime-200/70",
    dot: "bg-lime-500",
    cardHover: "hover:border-lime-300 hover:shadow-lime-200/40",
  },
  orange: {
    eyebrow: "border-orange-200 bg-orange-50 text-orange-700",
    iconBox: "bg-gradient-to-br from-orange-100 to-amber-100 ring-orange-200/70",
    dot: "bg-orange-500",
    cardHover: "hover:border-orange-300 hover:shadow-orange-200/40",
  },
};
