/** İmajinasyon kütüphanesi liste kartı — yumuşak pastel (referans tasarım diliyle hizalı) */
export type ImaginationCardTheme = {
  card: string;
  badge: string;
  badgeMuted: string;
  hover: string;
};

export const IMAGINATION_CARD_THEMES: ImaginationCardTheme[] = [
  {
    card: "border-violet-300/70 bg-gradient-to-br from-violet-100 via-white to-purple-50",
    badge: "bg-violet-100/80 text-violet-800 ring-1 ring-violet-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-violet-300 hover:shadow-lg",
  },
  {
    card: "border-sky-300/70 bg-gradient-to-br from-blue-100 via-white to-cyan-50",
    badge: "bg-blue-100/80 text-blue-800 ring-1 ring-blue-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-sky-300 hover:shadow-lg",
  },
  {
    card: "border-cyan-300/70 bg-gradient-to-br from-cyan-100 via-white to-sky-50",
    badge: "bg-cyan-100/80 text-cyan-900 ring-1 ring-cyan-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg",
  },
  {
    card: "border-emerald-300/70 bg-gradient-to-br from-emerald-100 via-white to-teal-50",
    badge: "bg-emerald-100/80 text-emerald-800 ring-1 ring-emerald-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg",
  },
  {
    card: "border-amber-300/70 bg-gradient-to-br from-amber-100 via-white to-orange-50",
    badge: "bg-amber-100/80 text-amber-900 ring-1 ring-amber-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-amber-300 hover:shadow-lg",
  },
  {
    card: "border-pink-300/70 bg-gradient-to-br from-pink-100 via-white to-rose-50",
    badge: "bg-pink-100/80 text-pink-900 ring-1 ring-pink-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-pink-300 hover:shadow-lg",
  },
];

export function getImaginationCardTheme(index: number): ImaginationCardTheme {
  return IMAGINATION_CARD_THEMES[index % IMAGINATION_CARD_THEMES.length]!;
}
