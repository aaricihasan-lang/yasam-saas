/** Çakra kütüphanesi liste kartı — pastel cyan / mor / pembe */
export type ChakraCardTheme = {
  card: string;
  badge: string;
  badgeMuted: string;
  hover: string;
};

export const CHAKRA_CARD_THEMES: ChakraCardTheme[] = [
  {
    card:
      "border-fuchsia-400/70 bg-gradient-to-br from-fuchsia-200/90 via-pink-100/85 to-violet-100/80",
    badge: "bg-fuchsia-600/15 text-fuchsia-950 ring-2 ring-fuchsia-400/50",
    badgeMuted: "bg-fuchsia-100/80 text-fuchsia-800 ring-1 ring-fuchsia-300/60",
    hover:
      "hover:scale-[1.02] hover:border-fuchsia-500 hover:shadow-[0_22px_48px_-10px_rgba(192,38,211,0.42)]",
  },
  {
    card:
      "border-violet-400/70 bg-gradient-to-br from-violet-200/90 via-violet-100/85 to-purple-100/75",
    badge: "bg-violet-600/15 text-violet-950 ring-2 ring-violet-400/50",
    badgeMuted: "bg-violet-100/80 text-violet-700 ring-1 ring-violet-300/60",
    hover:
      "hover:scale-[1.02] hover:border-violet-500 hover:shadow-[0_22px_48px_-10px_rgba(139,92,246,0.42)]",
  },
  {
    card:
      "border-cyan-400/70 bg-gradient-to-br from-cyan-200/90 via-sky-100/85 to-teal-100/75",
    badge: "bg-cyan-600/15 text-cyan-950 ring-2 ring-cyan-400/50",
    badgeMuted: "bg-cyan-100/80 text-cyan-900 ring-1 ring-cyan-300/60",
    hover:
      "hover:scale-[1.02] hover:border-cyan-500 hover:shadow-[0_22px_48px_-10px_rgba(6,182,212,0.42)]",
  },
  {
    card:
      "border-pink-400/70 bg-gradient-to-br from-pink-200/90 via-rose-100/85 to-fuchsia-100/75",
    badge: "bg-pink-600/15 text-pink-950 ring-2 ring-pink-400/50",
    badgeMuted: "bg-pink-100/80 text-pink-900 ring-1 ring-pink-300/60",
    hover:
      "hover:scale-[1.02] hover:border-pink-500 hover:shadow-[0_22px_48px_-10px_rgba(236,72,153,0.42)]",
  },
  {
    card:
      "border-orange-400/70 bg-gradient-to-br from-orange-200/90 via-amber-100/85 to-yellow-100/75",
    badge: "bg-orange-600/15 text-orange-950 ring-2 ring-orange-400/50",
    badgeMuted: "bg-orange-100/80 text-orange-900 ring-1 ring-orange-300/60",
    hover:
      "hover:scale-[1.02] hover:border-orange-500 hover:shadow-[0_22px_48px_-10px_rgba(249,115,22,0.4)]",
  },
  {
    card:
      "border-indigo-400/70 bg-gradient-to-br from-indigo-200/90 via-blue-100/85 to-violet-100/75",
    badge: "bg-indigo-600/15 text-indigo-950 ring-2 ring-indigo-400/50",
    badgeMuted: "bg-indigo-100/80 text-indigo-800 ring-1 ring-indigo-300/60",
    hover:
      "hover:scale-[1.02] hover:border-indigo-500 hover:shadow-[0_22px_48px_-10px_rgba(99,102,241,0.4)]",
  },
];

export function getChakraCardTheme(index: number): ChakraCardTheme {
  return CHAKRA_CARD_THEMES[index % CHAKRA_CARD_THEMES.length]!;
}
