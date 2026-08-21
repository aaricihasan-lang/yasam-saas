/**
 * Doğaltaş modülü — tek modül kayıt defteri (registry).
 *
 * Hub kartları, breadcrumb etiketleri ve gelecekteki paylaşılan başlık hep bu
 * tek kaynaktan beslenir; böylece liste ile dosya sistemi arasındaki sapma
 * (P1-N) önlenir. Yeni bir alt sayfa eklenince yalnızca burası güncellenir.
 */

export type DogaltasAccent = "emerald" | "amber" | "teal" | "lime" | "orange";

export type DogaltasModule = {
  /** /dogaltas/ sonrası yol parçası. */
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  href: string;
  /** Hub kartı / kabuk vurgusu — amber/emerald V3 kimliği içinde. */
  accent: DogaltasAccent;
};

export const DOGALTAS_HOME = {
  title: "Doğaltaş",
  href: "/dogaltas",
} as const;

export const DOGALTAS_MODULES: DogaltasModule[] = [
  {
    slug: "dogaltas-kayit",
    title: "Doğaltaş Kayıt",
    subtitle: "Yeni taş kaydı oluştur.",
    icon: "💎",
    href: "/dogaltas/dogaltas-kayit",
    accent: "emerald",
  },
  {
    slug: "mineral-bankasi",
    title: "Mineral Bankası",
    subtitle: "Yeni mineral kaydı ekle.",
    icon: "🧪",
    href: "/dogaltas/mineral-bankasi",
    accent: "amber",
  },
  {
    slug: "mineral-listesi",
    title: "Mineral Listesi",
    subtitle: "Mineralleri görüntüle ve yönet.",
    icon: "📋",
    href: "/dogaltas/mineral-listesi",
    accent: "teal",
  },
  {
    slug: "dogaltas-listesi",
    title: "Doğaltaş Listesi",
    subtitle: "Kayıtlı taşlar.",
    icon: "🗂️",
    href: "/dogaltas/dogaltas-listesi",
    accent: "emerald",
  },
  {
    slug: "kombinasyonlar",
    title: "Kombinasyonlar",
    subtitle: "Taş kombinasyonları.",
    icon: "🧩",
    href: "/dogaltas/kombinasyonlar",
    accent: "orange",
  },
  {
    slug: "kombinasyon-olustur",
    title: "Kombinasyon Oluştur",
    subtitle: "Minerale göre taş bul.",
    icon: "⚗️",
    href: "/dogaltas/kombinasyon-olustur",
    accent: "lime",
  },
  {
    slug: "tas-bilgi-kutuphanesi",
    title: "Taş Bilgi Kütüphanesi",
    subtitle: "Eğitim ve referans.",
    icon: "📚",
    href: "/dogaltas/tas-bilgi-kutuphanesi",
    accent: "amber",
  },
];

/** Verilen pathname'e en iyi eşleşen modülü döndürür (breadcrumb için). */
export function findDogaltasModuleByPath(
  pathname: string,
): DogaltasModule | undefined {
  const path = pathname.replace(/\/+$/, "");
  return [...DOGALTAS_MODULES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((m) => path === m.href || path.startsWith(`${m.href}/`));
}
