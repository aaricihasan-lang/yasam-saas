export type BiyoenerjiFolderCard = {
  href: string;
  title: string;
  desc: string;
  icon: string;
  badge: string;
  gradient: string;
  border: string;
  accent: string;
  glow: string;
};

export const BIOENERJI_FOLDER_BASE = "/dashboard/biyoenerji";

export const BIOENERJI_FOLDER_CARDS: BiyoenerjiFolderCard[] = [
  {
    href: `${BIOENERJI_FOLDER_BASE}/seanslar`,
    title: "Biyoenerji Seansları",
    desc: "Enerji analizleri, seans kayıtları ve çalışma notları",
    icon: "🟣",
    badge: "Seans",
    gradient: "from-violet-200/95 via-fuchsia-100 to-purple-50",
    border: "border-violet-300/50",
    accent: "text-violet-950",
    glow: "shadow-[0_0_40px_rgba(139,92,246,0.22)]",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/enerji-bedenleri`,
    title: "Enerji Bedenleri",
    desc: "Aura, eterik, astral ve enerji katman bilgileri",
    icon: "🔵",
    badge: "Katman",
    gradient: "from-cyan-200/95 via-sky-100 to-blue-50",
    border: "border-cyan-300/50",
    accent: "text-cyan-950",
    glow: "shadow-[0_0_40px_rgba(34,211,238,0.2)]",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/bilincalti-sebepleri`,
    title: "Bilinçaltı Sebepleri",
    desc: "Kök nedenler, içsel bloklar ve dönüşüm notları",
    icon: "🟠",
    badge: "Bilinçaltı",
    gradient: "from-amber-200/95 via-orange-100 to-rose-50",
    border: "border-amber-300/50",
    accent: "text-amber-950",
    glow: "shadow-[0_0_40px_rgba(245,158,11,0.18)]",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/imajinasyonlar`,
    title: "İmajinasyonlar",
    desc: "Görselleştirme, rehberli çalışmalar ve seans imgeleri",
    icon: "💜",
    badge: "İmge",
    gradient: "from-fuchsia-200/95 via-pink-100 to-violet-50",
    border: "border-fuchsia-300/50",
    accent: "text-fuchsia-950",
    glow: "shadow-[0_0_40px_rgba(217,70,239,0.2)]",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/sembol-dili`,
    title: "Sembol Dili",
    desc: "Semboller, anlamlar ve enerji dili sözlüğü",
    icon: "✨",
    badge: "Sembol",
    gradient: "from-indigo-200/95 via-violet-100 to-cyan-50",
    border: "border-indigo-300/50",
    accent: "text-indigo-950",
    glow: "shadow-[0_0_40px_rgba(99,102,241,0.2)]",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/cakralar`,
    title: "Çakralar",
    desc: "Enerji merkezleri, denge alanları ve çakra notları",
    icon: "🟢",
    badge: "Çakra",
    gradient: "from-emerald-200/95 via-teal-100 to-cyan-50",
    border: "border-emerald-300/50",
    accent: "text-emerald-950",
    glow: "shadow-[0_0_40px_rgba(16,185,129,0.2)]",
  },
];
