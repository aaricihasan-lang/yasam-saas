/** İmajinasyon kütüphanesi liste kartı pastel varyasyonları */
export type ImaginationCardTheme = {
  card: string;
  badge: string;
  badgeMuted: string;
  hover: string;
};

export const IMAGINATION_CARD_THEMES: ImaginationCardTheme[] = [
  {
    card:
      "border-violet-400/70 bg-gradient-to-br from-violet-200/90 via-violet-100/85 to-purple-100/80",
    badge:
      "bg-violet-600/15 text-violet-950 ring-2 ring-violet-400/50",
    badgeMuted: "bg-violet-100/80 text-violet-700 ring-1 ring-violet-300/60",
    hover:
      "hover:scale-[1.02] hover:border-violet-500 hover:shadow-[0_22px_48px_-10px_rgba(139,92,246,0.45)]",
  },
  {
    card:
      "border-blue-400/70 bg-gradient-to-br from-blue-200/90 via-sky-100/85 to-cyan-100/75",
    badge: "bg-blue-600/15 text-blue-950 ring-2 ring-blue-400/50",
    badgeMuted: "bg-blue-100/80 text-blue-800 ring-1 ring-blue-300/60",
    hover:
      "hover:scale-[1.02] hover:border-blue-500 hover:shadow-[0_22px_48px_-10px_rgba(59,130,246,0.42)]",
  },
  {
    card:
      "border-cyan-400/70 bg-gradient-to-br from-cyan-200/90 via-teal-100/85 to-sky-100/75",
    badge: "bg-cyan-600/15 text-cyan-950 ring-2 ring-cyan-400/50",
    badgeMuted: "bg-cyan-100/80 text-cyan-900 ring-1 ring-cyan-300/60",
    hover:
      "hover:scale-[1.02] hover:border-cyan-500 hover:shadow-[0_22px_48px_-10px_rgba(6,182,212,0.42)]",
  },
  {
    card:
      "border-emerald-400/70 bg-gradient-to-br from-emerald-200/90 via-green-100/85 to-teal-100/75",
    badge: "bg-emerald-600/15 text-emerald-950 ring-2 ring-emerald-400/50",
    badgeMuted: "bg-emerald-100/80 text-emerald-800 ring-1 ring-emerald-300/60",
    hover:
      "hover:scale-[1.02] hover:border-emerald-500 hover:shadow-[0_22px_48px_-10px_rgba(16,185,129,0.4)]",
  },
  {
    card:
      "border-amber-400/70 bg-gradient-to-br from-amber-200/90 via-yellow-100/85 to-orange-100/75",
    badge: "bg-amber-600/15 text-amber-950 ring-2 ring-amber-400/50",
    badgeMuted: "bg-amber-100/80 text-amber-900 ring-1 ring-amber-300/60",
    hover:
      "hover:scale-[1.02] hover:border-amber-500 hover:shadow-[0_22px_48px_-10px_rgba(245,158,11,0.42)]",
  },
  {
    card:
      "border-pink-400/70 bg-gradient-to-br from-pink-200/90 via-rose-100/85 to-fuchsia-100/75",
    badge: "bg-pink-600/15 text-pink-950 ring-2 ring-pink-400/50",
    badgeMuted: "bg-pink-100/80 text-pink-900 ring-1 ring-pink-300/60",
    hover:
      "hover:scale-[1.02] hover:border-pink-500 hover:shadow-[0_22px_48px_-10px_rgba(236,72,153,0.42)]",
  },
];

export function getImaginationCardTheme(index: number): ImaginationCardTheme {
  return IMAGINATION_CARD_THEMES[index % IMAGINATION_CARD_THEMES.length]!;
}
