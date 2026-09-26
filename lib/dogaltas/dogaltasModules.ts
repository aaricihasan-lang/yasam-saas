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
  /**
   * IA sadeleştirme (FAZ 2): true ise sol menü/hub'da ANA çalışma alanı olarak
   * görünür. false → route KORUNUR (breadcrumb/deep-link/back çalışır) ama menüde
   * tekrarlanmaz; ilgili liste ekranındaki "+ Yeni …" CTA'sından açılır.
   */
  primaryNav: boolean;
};

export const DOGALTAS_HOME = {
  title: "Doğaltaş",
  href: "/dogaltas",
} as const;

export const DOGALTAS_MODULES: DogaltasModule[] = [
  // ── ANA ÇALIŞMA ALANLARI (menüde görünür) ──────────────────────────────────
  {
    slug: "dogaltas-listesi",
    title: "Doğaltaşlar",
    subtitle: "Taşlarını görüntüle, ara ve yönet.",
    icon: "💎",
    href: "/dogaltas/dogaltas-listesi",
    accent: "emerald",
    primaryNav: true,
  },
  {
    slug: "mineral-listesi",
    title: "Mineraller",
    subtitle: "Minerallerini görüntüle ve yönet.",
    icon: "🧪",
    href: "/dogaltas/mineral-listesi",
    accent: "teal",
    primaryNav: true,
  },
  {
    slug: "kombinasyonlar",
    title: "Kombinasyonlar",
    subtitle: "Kombinasyonlarını görüntüle ve oluştur.",
    icon: "🧩",
    href: "/dogaltas/kombinasyonlar",
    accent: "orange",
    primaryNav: true,
  },
  {
    slug: "tas-bilgi-kutuphanesi",
    title: "Taş Bilgi Kütüphanesi",
    subtitle: "Eğitim ve referans.",
    icon: "📚",
    href: "/dogaltas/tas-bilgi-kutuphanesi",
    accent: "amber",
    primaryNav: true,
  },
  // ── OLUŞTURMA ROTALARI (menüde tekrarlanmaz; liste CTA'sından; route KORUNUR) ─
  {
    slug: "dogaltas-kayit",
    title: "Doğaltaş Kayıt",
    subtitle: "Yeni taş kaydı oluştur.",
    icon: "💎",
    href: "/dogaltas/dogaltas-kayit",
    accent: "emerald",
    primaryNav: false,
  },
  {
    slug: "mineral-bankasi",
    title: "Mineral Bankası",
    subtitle: "Yeni mineral kaydı ekle.",
    icon: "🧪",
    href: "/dogaltas/mineral-bankasi",
    accent: "amber",
    primaryNav: false,
  },
  {
    slug: "kombinasyon-olustur",
    title: "Kombinasyon Oluştur",
    subtitle: "Minerale göre taş bul.",
    icon: "⚗️",
    href: "/dogaltas/kombinasyon-olustur",
    accent: "lime",
    primaryNav: false,
  },
];

/** Sol menü/hub — yalnız ANA çalışma alanları (IA sadeleştirme). */
export const DOGALTAS_PRIMARY_MODULES: DogaltasModule[] =
  DOGALTAS_MODULES.filter((m) => m.primaryNav);

/** Verilen pathname'e en iyi eşleşen modülü döndürür (breadcrumb için). */
export function findDogaltasModuleByPath(
  pathname: string,
): DogaltasModule | undefined {
  const path = pathname.replace(/\/+$/, "");
  return [...DOGALTAS_MODULES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((m) => path === m.href || path.startsWith(`${m.href}/`));
}
