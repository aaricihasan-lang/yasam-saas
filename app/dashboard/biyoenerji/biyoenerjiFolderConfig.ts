import { Activity, Brain, Eye, Flower2, Layers, Sparkles, type LucideIcon } from "lucide-react";

/**
 * Kararlı bölüm anahtarı — route slug ile birebir. Marka/etiket değişse de
 * bu anahtar DONUK kalır (breadcrumb + section nav + landing tek kaynak).
 */
export type BiyoenerjiSectionKey =
  | "cakralar"
  | "enerji-bedenleri"
  | "bilincalti-sebepleri"
  | "seanslar"
  | "imajinasyonlar"
  | "sembol-dili";

/** FAZ 2 profesyonel bilgi mimarisi grup kimlikleri (yalnız navigation/IA katmanı). */
export type BiyoenerjiGroupId =
  | "anatomi"
  | "nedenler"
  | "teknikler"
  | "zihinsel-sembolik";

export type BiyoenerjiFolderCard = {
  /** kararlı bölüm anahtarı (route slug) */
  key: BiyoenerjiSectionKey;
  /** ait olduğu IA grubu */
  group: BiyoenerjiGroupId;
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
    key: "seanslar",
    group: "teknikler",
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
    key: "enerji-bedenleri",
    group: "anatomi",
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
    key: "bilincalti-sebepleri",
    group: "nedenler",
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
    key: "imajinasyonlar",
    group: "zihinsel-sembolik",
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
    key: "sembol-dili",
    group: "zihinsel-sembolik",
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
    key: "cakralar",
    group: "anatomi",
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

// ──────────────────────────────────────────────────────────────────────────
// FAZ 2 — Profesyonel Bilgi Mimarisi (yalnız navigation/IA katmanı)
//
// Kart adları (route/resource/table) DEĞİŞMEZ. Burada yalnız görünür IA
// gruplaması tanımlanır. Grup başlıkları profesyonel dili taşır:
//   Teknikler & Uygulamalar → "Biyoenerji Seansları"
//   Nedenler & Blokajlar    → "Bilinçaltı Sebepleri"
// ──────────────────────────────────────────────────────────────────────────

export type BiyoenerjiGroupMeta = {
  id: BiyoenerjiGroupId;
  /** görünür grup başlığı (profesyonel IA dili) */
  title: string;
  /** grup için kısa açıklama (landing alt metni) */
  desc: string;
  /** gruba ait bölümler — görünür sıra */
  memberKeys: BiyoenerjiSectionKey[];
};

/** Görünür grup sırası + üyeleri (tek canonical IA kaynağı). */
export const BIOENERJI_GROUP_ORDER: BiyoenerjiGroupMeta[] = [
  {
    id: "anatomi",
    title: "Enerji Anatomisi",
    desc: "Enerji merkezleri ve katmanların yapısı",
    memberKeys: ["cakralar", "enerji-bedenleri"],
  },
  {
    id: "nedenler",
    title: "Nedenler & Blokajlar",
    desc: "Kök nedenler, içsel bloklar ve dönüşüm",
    memberKeys: ["bilincalti-sebepleri"],
  },
  {
    id: "teknikler",
    title: "Teknikler & Uygulamalar",
    desc: "Çalışma örnekleri, protokoller ve teknikler",
    memberKeys: ["seanslar"],
  },
  {
    id: "zihinsel-sembolik",
    title: "Zihinsel & Sembolik Çalışmalar",
    desc: "Görselleştirme, imgeler ve sembol dili",
    memberKeys: ["imajinasyonlar", "sembol-dili"],
  },
];

/** key → kart hızlı erişim. */
const BIOENERJI_CARD_BY_KEY: Record<BiyoenerjiSectionKey, BiyoenerjiFolderCard> =
  BIOENERJI_FOLDER_CARDS.reduce(
    (acc, card) => {
      acc[card.key] = card;
      return acc;
    },
    {} as Record<BiyoenerjiSectionKey, BiyoenerjiFolderCard>,
  );

export type BiyoenerjiGroupWithCards = BiyoenerjiGroupMeta & {
  cards: BiyoenerjiFolderCard[];
};

/** Landing + section nav için: gruplar, görünür sırayla, kartlarıyla birlikte. */
export function getBiyoenerjiGroups(): BiyoenerjiGroupWithCards[] {
  return BIOENERJI_GROUP_ORDER.map((g) => ({
    ...g,
    cards: g.memberKeys.map((k) => BIOENERJI_CARD_BY_KEY[k]).filter(Boolean),
  }));
}

/** Section nav için düz, IA sıralı bölüm listesi. */
export const BIOENERJI_SECTIONS_IN_ORDER: BiyoenerjiFolderCard[] =
  BIOENERJI_GROUP_ORDER.flatMap((g) =>
    g.memberKeys.map((k) => BIOENERJI_CARD_BY_KEY[k]).filter(Boolean),
  );

/** Bir bölümün kartı + ait olduğu grubu döndürür (breadcrumb/nav). */
export function findBiyoenerjiSection(
  key: BiyoenerjiSectionKey,
): { card: BiyoenerjiFolderCard; group: BiyoenerjiGroupMeta } | null {
  const card = BIOENERJI_CARD_BY_KEY[key];
  if (!card) return null;
  const group = BIOENERJI_GROUP_ORDER.find((g) => g.id === card.group);
  if (!group) return null;
  return { card, group };
}
