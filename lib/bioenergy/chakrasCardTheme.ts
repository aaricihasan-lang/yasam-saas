/** Çakra kütüphanesi liste kartı — yumuşak pastel (referans tasarım diliyle hizalı) */
export type ChakraCardTheme = {
  card: string;
  badge: string;
  badgeMuted: string;
  hover: string;
};

export const CHAKRA_CARD_THEMES: ChakraCardTheme[] = [
  {
    card: "border-fuchsia-300/70 bg-gradient-to-br from-fuchsia-100 via-white to-pink-50",
    badge: "bg-fuchsia-100/80 text-fuchsia-800 ring-1 ring-fuchsia-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-fuchsia-300 hover:shadow-lg",
  },
  {
    card: "border-violet-300/70 bg-gradient-to-br from-violet-100 via-white to-purple-50",
    badge: "bg-violet-100/80 text-violet-800 ring-1 ring-violet-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-violet-300 hover:shadow-lg",
  },
  {
    card: "border-cyan-300/70 bg-gradient-to-br from-cyan-100 via-white to-sky-50",
    badge: "bg-cyan-100/80 text-cyan-900 ring-1 ring-cyan-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg",
  },
  {
    card: "border-pink-300/70 bg-gradient-to-br from-pink-100 via-white to-rose-50",
    badge: "bg-pink-100/80 text-pink-900 ring-1 ring-pink-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-pink-300 hover:shadow-lg",
  },
  {
    card: "border-amber-300/70 bg-gradient-to-br from-amber-100 via-white to-orange-50",
    badge: "bg-amber-100/80 text-amber-900 ring-1 ring-amber-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-amber-300 hover:shadow-lg",
  },
  {
    card: "border-indigo-300/70 bg-gradient-to-br from-indigo-100 via-white to-blue-50",
    badge: "bg-indigo-100/80 text-indigo-800 ring-1 ring-indigo-300/50",
    badgeMuted: "bg-white/70 text-slate-500 ring-1 ring-slate-200/70",
    hover: "hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg",
  },
];

export function getChakraCardTheme(index: number): ChakraCardTheme {
  return CHAKRA_CARD_THEMES[index % CHAKRA_CARD_THEMES.length]!;
}
