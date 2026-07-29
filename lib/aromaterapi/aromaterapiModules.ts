/**
 * Aromaterapi V2 — tek modül kayıt defteri (registry).
 *
 * Yedi birincil bölüm, hub kartları, birincil navigasyon ve breadcrumb
 * etiketleri hep bu tek kaynaktan beslenir; böylece navigasyon ile dosya
 * sistemi arasındaki sapma önlenir. Yeni bir bölüm eklenince yalnızca burası
 * güncellenir (C3A'da kilitlenen 7-bölüm mimarisi).
 *
 * Not (C3A-REV): admin ve uzman hesapları AYNI bölümleri, sekmeleri ve
 * özellikleri kullanır; fark yalnız tenant bazlı veri sahipliğindedir. Bu
 * registry'de rol/hesap ayrımı YOKTUR ve olmamalıdır.
 */

export type AromaterapiAccent =
  | "amber"
  | "emerald"
  | "rose"
  | "violet"
  | "sky"
  | "teal";

/** Bölümün ürünleştirme durumu — "active" canlı, "preparing" iskele (C3B). */
export type AromaterapiModuleStatus = "active" | "preparing";

export type AromaterapiFacet = {
  label: string;
  href: string;
};

export type AromaterapiModule = {
  /** Kararlı benzersiz kimlik (harness + key). */
  id: string;
  /** Kullanıcıya gösterilen Türkçe ad. Menüde "claim" gibi teknik dil YOK. */
  label: string;
  href: string;
  description: string;
  /** Emoji ikon anahtarı (dekoratif). */
  icon: string;
  accent: AromaterapiAccent;
  status: AromaterapiModuleStatus;
  /** Ana Ekran kartı olarak gösterilsin mi? (Ana Ekran'ın kendisi hariç.) */
  showOnHub: boolean;
  /** Birincil navigasyonda görünsün mü? */
  showInNav: boolean;
  /**
   * Bu bölüme ait olarak sayılacak yol önekleri (breadcrumb/nav aktif eşleşmesi
   * için). Verilmezse yalnız `href` kullanılır. Yağlar bölümü, facet ve dinamik
   * detay route'larını da kapsar.
   */
  matchPrefixes?: string[];
  /** Hub kartında gösterilecek hızlı alt-girişler (ör. yağ tipleri). */
  facets?: AromaterapiFacet[];
};

export const AROMATERAPI_HOME = {
  id: "ana-ekran",
  title: "Aromaterapi",
  href: "/aromaterapi",
} as const;

/**
 * Yedi birincil bölüm (C3A kilidi). Sıra hem navigasyon hem hub kartı sırasıdır.
 */
export const AROMATERAPI_MODULES: AromaterapiModule[] = [
  {
    id: "ana-ekran",
    label: "Ana Ekran",
    href: "/aromaterapi",
    description: "Aromaterapi çalışma merkezi ve bölümlere hızlı erişim.",
    icon: "🏠",
    accent: "amber",
    status: "active",
    showOnHub: false,
    showInNav: true,
  },
  {
    id: "yaglar",
    label: "Yağlar",
    href: "/aromaterapi/yaglar",
    description:
      "Uçucu, sabit ve maserasyon yağı kütüphanesi — arama, kayıt ve detay.",
    icon: "🌿",
    accent: "amber",
    status: "active",
    showOnHub: true,
    showInNav: true,
    matchPrefixes: [
      "/aromaterapi/yaglar",
      "/aromaterapi/ucucu-yaglar",
      "/aromaterapi/sabit-yaglar",
      "/aromaterapi/maserasyon-yaglari",
    ],
    facets: [
      { label: "Uçucu", href: "/aromaterapi/ucucu-yaglar?view=list" },
      { label: "Sabit", href: "/aromaterapi/sabit-yaglar?view=list" },
      { label: "Maserasyon", href: "/aromaterapi/maserasyon-yaglari?view=list" },
    ],
  },
  {
    id: "karisimlar",
    label: "Karışımlar",
    href: "/aromaterapi/karisim-olusturucu",
    description:
      "Damla hesaplayıcı, güvenlik uyarıları ve reçete — karışım oluşturucu.",
    icon: "⚗️",
    accent: "sky",
    status: "active",
    showOnHub: true,
    showInNav: true,
  },
  {
    id: "bilgi-kayitlari",
    label: "Bilgi Kayıtları",
    href: "/aromaterapi/bilgi-kayitlari",
    description:
      "Kaynağa dayalı, kanıt ve provenans taşıyan bilgi kayıtları; güvenlik filtresi.",
    icon: "📑",
    accent: "emerald",
    status: "active",
    showOnHub: true,
    showInNav: true,
  },
  {
    id: "kaynaklar",
    label: "Kaynaklar",
    href: "/aromaterapi/kaynaklar",
    description:
      "Kaynak → pasaj → sadık çeviri → editoryal açıklama/yorum provenans zinciri.",
    icon: "📜",
    accent: "violet",
    status: "active",
    showOnHub: true,
    showInNav: true,
  },
  {
    id: "katalog",
    label: "Bitki & Preparat Kataloğu",
    href: "/aromaterapi/katalog",
    description:
      "Bitki (takson) ve preparat kanonik omurgası — bilgi kaydının dayanağı.",
    icon: "🌱",
    accent: "teal",
    status: "active",
    showOnHub: true,
    showInNav: true,
  },
  {
    id: "bilgi-bankasi",
    label: "Bilgi Bankası & Sözlük",
    href: "/aromaterapi/bilgi-bankasi",
    description: "Uzman referans içerikleri ve terim sözlüğü.",
    icon: "📚",
    accent: "rose",
    status: "active",
    showOnHub: true,
    showInNav: true,
  },
];

/** Ana Ekran kartlarında gösterilecek bölümler (Ana Ekran'ın kendisi hariç). */
export const AROMATERAPI_HUB_MODULES: AromaterapiModule[] =
  AROMATERAPI_MODULES.filter((m) => m.showOnHub);

/** Birincil navigasyonda gösterilecek bölümler. */
export const AROMATERAPI_NAV_MODULES: AromaterapiModule[] =
  AROMATERAPI_MODULES.filter((m) => m.showInNav);

function prefixesFor(mod: AromaterapiModule): string[] {
  return mod.matchPrefixes ?? [mod.href];
}

/**
 * Verilen pathname'e en iyi eşleşen bölümü döndürür (breadcrumb + nav aktif
 * durumu için). En uzun eşleşen önek kazanır; böylece Ana Ekran (`/aromaterapi`)
 * alt sayfaları yutmaz.
 */
export function findAromaterapiModuleByPath(
  pathname: string,
): AromaterapiModule | undefined {
  const path = (pathname || "").replace(/\/+$/, "") || "/aromaterapi";
  let best: AromaterapiModule | undefined;
  let bestLen = -1;
  for (const mod of AROMATERAPI_MODULES) {
    for (const prefix of prefixesFor(mod)) {
      const clean = prefix.replace(/\/+$/, "");
      const matches = path === clean || path.startsWith(`${clean}/`);
      if (matches && clean.length > bestLen) {
        best = mod;
        bestLen = clean.length;
      }
    }
  }
  return best;
}

/** Aktif bölümün Ana Ekran olup olmadığını söyler. */
export function isAromaterapiHome(pathname: string): boolean {
  return findAromaterapiModuleByPath(pathname)?.id === AROMATERAPI_HOME.id;
}
