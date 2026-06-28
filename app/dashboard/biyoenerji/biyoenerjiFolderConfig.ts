import { Activity, Brain, Eye, Flower2, Layers, Sparkles, type LucideIcon } from "lucide-react";

export type BiyoenerjiFolderCard = {
  href: string;
  title: string;
  desc: string;
  Icon: LucideIcon;
  badge: string;
  gradient: string;
  border: string;
  accent: string;
  iconBox: string;
};

export const BIOENERJI_FOLDER_BASE = "/dashboard/biyoenerji";

export const BIOENERJI_FOLDER_CARDS: BiyoenerjiFolderCard[] = [
  {
    href: `${BIOENERJI_FOLDER_BASE}/seanslar`,
    title: "Biyoenerji Seansları",
    desc: "Enerji analizleri, seans kayıtları ve çalışma notları",
    Icon: Activity,
    badge: "Seans",
    gradient: "from-violet-100 via-white to-purple-50",
    border: "border-violet-300/60",
    accent: "text-violet-900",
    iconBox: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/enerji-bedenleri`,
    title: "Enerji Bedenleri",
    desc: "Aura, eterik, astral ve enerji katman bilgileri",
    Icon: Layers,
    badge: "Katman",
    gradient: "from-cyan-100 via-white to-sky-50",
    border: "border-cyan-300/60",
    accent: "text-cyan-900",
    iconBox: "bg-gradient-to-br from-cyan-500 to-sky-500 text-white",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/bilincalti-sebepleri`,
    title: "Bilinçaltı Sebepleri",
    desc: "Kök nedenler, içsel bloklar ve dönüşüm notları",
    Icon: Brain,
    badge: "Bilinçaltı",
    gradient: "from-amber-100 via-white to-orange-50",
    border: "border-amber-300/60",
    accent: "text-amber-900",
    iconBox: "bg-gradient-to-br from-amber-500 to-orange-500 text-white",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/imajinasyonlar`,
    title: "İmajinasyonlar",
    desc: "Görselleştirme, rehberli çalışmalar ve seans imgeleri",
    Icon: Eye,
    badge: "İmge",
    gradient: "from-fuchsia-100 via-white to-pink-50",
    border: "border-fuchsia-300/60",
    accent: "text-fuchsia-900",
    iconBox: "bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/sembol-dili`,
    title: "Sembol Dili",
    desc: "Semboller, anlamlar ve enerji dili sözlüğü",
    Icon: Sparkles,
    badge: "Sembol",
    gradient: "from-indigo-100 via-white to-violet-50",
    border: "border-indigo-300/60",
    accent: "text-indigo-900",
    iconBox: "bg-gradient-to-br from-indigo-500 to-violet-500 text-white",
  },
  {
    href: `${BIOENERJI_FOLDER_BASE}/cakralar`,
    title: "Çakralar",
    desc: "Enerji merkezleri, denge alanları ve çakra notları",
    Icon: Flower2,
    badge: "Çakra",
    gradient: "from-emerald-100 via-white to-teal-50",
    border: "border-emerald-300/60",
    accent: "text-emerald-900",
    iconBox: "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
  },
];
