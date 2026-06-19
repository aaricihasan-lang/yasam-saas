/**
 * lib/cosmic/planet-meta.ts
 * Gezegen meta verisi: slug, sembol, renk aksanı, kısa anlamı.
 * Route: /cosmic-calendar/transits/[slug]
 */

export type PlanetMeta = {
  key:      string;   // lib fonksiyonlarında kullanılan Türkçe ad
  slug:     string;   // URL segmenti (İngilizce, küçük harf)
  symbol:   string;   // Unicode sembol
  meaning:  string;   // "Bu gezegen neyi temsil eder?" — 1 cümle
  detail:   string;   // Daha açıklayıcı ikinci cümle
  keywords: string[]; // Hızlı referans etiketleri
  order:    number;   // Ana sayfadaki sıralama
  // Tailwind renk aksanı — kart arka planı ve başlık rengi
  cardBg:   string;
  titleClr: string;
  badgeBg:  string;
  badgeClr: string;
  iconBg:   string;
};

export const PLANET_META: ReadonlyArray<PlanetMeta> = [
  {
    key: "Güneş", slug: "sun", symbol: "☉", order: 1,
    meaning: "Kimlik, yaşam enerjisi ve bilinçli benliği temsil eder.",
    detail:  "Güneş, kişinin özünü, yaratıcı gücünü ve dünyaya nasıl ışık saçtığını gösterir.",
    keywords: ["Kimlik", "Enerji", "Öz", "Bilinç"],
    cardBg:  "from-amber-50/90 via-yellow-50/70 to-amber-50/60",
    titleClr:"text-amber-800", badgeBg: "bg-amber-100", badgeClr: "text-amber-800",
    iconBg:  "from-amber-400 to-yellow-500",
  },
  {
    key: "Ay", slug: "moon", symbol: "☽", order: 2,
    meaning: "Duygular, sezgi ve iç dünyayı temsil eder.",
    detail:  "Ay, günlük ruh halini, içgüdüsel tepkileri ve beslenme ihtiyaçlarını yönetir.",
    keywords: ["Duygu", "Sezgi", "İç Dünya", "Ruh Hali"],
    cardBg:  "from-violet-50/90 via-indigo-50/70 to-violet-50/60",
    titleClr:"text-violet-800", badgeBg: "bg-violet-100", badgeClr: "text-violet-800",
    iconBg:  "from-violet-500 to-indigo-600",
  },
  {
    key: "Merkür", slug: "mercury", symbol: "☿", order: 3,
    meaning: "Zihin, iletişim ve öğrenmeyi temsil eder.",
    detail:  "Merkür, düşünme biçimini, konuşmayı, yazıyı ve bilgi işlemeyi yönetir.",
    keywords: ["Zihin", "İletişim", "Öğrenme", "Düşünce"],
    cardBg:  "from-sky-50/90 via-cyan-50/70 to-sky-50/60",
    titleClr:"text-sky-800", badgeBg: "bg-sky-100", badgeClr: "text-sky-800",
    iconBg:  "from-sky-400 to-cyan-500",
  },
  {
    key: "Venüs", slug: "venus", symbol: "♀", order: 4,
    meaning: "Aşk, estetik ve değerleri temsil eder.",
    detail:  "Venüs, ilişki anlayışını, güzellik algısını ve neye değer verdiğimizi yönetir.",
    keywords: ["Aşk", "Estetik", "Değerler", "İlişki"],
    cardBg:  "from-rose-50/90 via-pink-50/70 to-rose-50/60",
    titleClr:"text-rose-800", badgeBg: "bg-rose-100", badgeClr: "text-rose-800",
    iconBg:  "from-rose-400 to-pink-500",
  },
  {
    key: "Mars", slug: "mars", symbol: "♂", order: 5,
    meaning: "Eylem, enerji ve arzuyu temsil eder.",
    detail:  "Mars, inisiyatif gücünü, fiziksel enerjiyi ve mücadele kapasitesini yönetir.",
    keywords: ["Eylem", "Enerji", "Arzu", "Güç"],
    cardBg:  "from-red-50/90 via-orange-50/70 to-red-50/60",
    titleClr:"text-red-800", badgeBg: "bg-red-100", badgeClr: "text-red-800",
    iconBg:  "from-red-500 to-orange-600",
  },
  {
    key: "Jüpiter", slug: "jupiter", symbol: "♃", order: 6,
    meaning: "Büyüme, bilgelik ve genişlemeyi temsil eder.",
    detail:  "Jüpiter, fırsatları, inançları ve hayatta anlam arayışını yönetir.",
    keywords: ["Büyüme", "Bilgelik", "Fırsat", "Bereket"],
    cardBg:  "from-orange-50/90 via-amber-50/70 to-orange-50/60",
    titleClr:"text-orange-800", badgeBg: "bg-orange-100", badgeClr: "text-orange-800",
    iconBg:  "from-orange-400 to-amber-500",
  },
  {
    key: "Satürn", slug: "saturn", symbol: "♄", order: 7,
    meaning: "Sınırlar, sorumluluk ve disiplini temsil eder.",
    detail:  "Satürn, uzun vadeli yapıları, kısıtlamaları ve olgunlaşma sürecini yönetir.",
    keywords: ["Disiplin", "Sorumluluk", "Yapı", "Sınır"],
    cardBg:  "from-slate-50/90 via-gray-50/70 to-slate-50/60",
    titleClr:"text-slate-800", badgeBg: "bg-slate-200", badgeClr: "text-slate-700",
    iconBg:  "from-slate-500 to-gray-600",
  },
  {
    key: "Uranüs", slug: "uranus", symbol: "♅", order: 8,
    meaning: "Yenilik, özgürlük ve ani değişimi temsil eder.",
    detail:  "Uranüs, gelenekleri kıran devrimleri ve kolektif uyanışı yönetir.",
    keywords: ["Yenilik", "Özgürlük", "Değişim", "Devrim"],
    cardBg:  "from-teal-50/90 via-cyan-50/70 to-teal-50/60",
    titleClr:"text-teal-800", badgeBg: "bg-teal-100", badgeClr: "text-teal-800",
    iconBg:  "from-teal-400 to-cyan-500",
  },
  {
    key: "Neptün", slug: "neptune", symbol: "♆", order: 9,
    meaning: "Sezgi, hayal gücü ve maneviyatı temsil eder.",
    detail:  "Neptün, idealizmi, spiritüel bağı ve sınırların erimesini yönetir.",
    keywords: ["Sezgi", "Hayal", "Spiritüel", "Empati"],
    cardBg:  "from-indigo-50/90 via-blue-50/70 to-indigo-50/60",
    titleClr:"text-indigo-800", badgeBg: "bg-indigo-100", badgeClr: "text-indigo-800",
    iconBg:  "from-indigo-500 to-blue-600",
  },
  {
    key: "Plüton", slug: "pluto", symbol: "♇", order: 10,
    meaning: "Dönüşüm, güç ve yeniden doğuşu temsil eder.",
    detail:  "Plüton, derin değişimleri, gölgenin yüzleşilmesini ve kolektif dönüşümü yönetir.",
    keywords: ["Dönüşüm", "Güç", "Gölge", "Yeniden Doğuş"],
    cardBg:  "from-purple-50/90 via-violet-50/70 to-purple-50/60",
    titleClr:"text-purple-800", badgeBg: "bg-purple-100", badgeClr: "text-purple-800",
    iconBg:  "from-purple-600 to-violet-700",
  },
];

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

const BY_SLUG = new Map(PLANET_META.map(p => [p.slug, p]));
const BY_KEY  = new Map(PLANET_META.map(p => [p.key,  p]));

/** URL slug'dan PlanetMeta döner; bilinmiyorsa null. */
export function getPlanetBySlug(slug: string): PlanetMeta | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Türkçe gezegen adından slug döner; bilinmiyorsa boş string. */
export function getPlanetSlug(key: string): string {
  return BY_KEY.get(key)?.slug ?? "";
}
