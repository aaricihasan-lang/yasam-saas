/**
 * Satış ana sayfası — modül kartı, özellik kartı ve cihaz ekranı görsel teması (yalnız sunum).
 * Modül listesi, sırası, adları ve bağlantı hedefleri app/page.tsx `landingModules` + i18n'den gelir;
 * burada yalnız vurgu rengi, dekoratif görsel ve mevcut kart davranış türü eşlenir (href'ler önceki landing ile birebir).
 */

/**
 * sampleAnalysis → "Örnek Analiz Var" rozeti + örnek analiz önizlemesi + Modüle Git bağlantısı
 * sampleScreens  → "Örnek Ekranlar Var" rozeti + örnek ekran galerisi + Modüle Git bağlantısı
 * active         → "Aktif Modül" rozeti + Modüle Git
 * plain          → rozetsiz + Modüle Git (Human Design kartı önceki landing'de rozetsizdi)
 */
export type LandingCardKind = "sampleAnalysis" | "sampleScreens" | "active" | "plain";

export type LandingModuleTheme = {
  acc: string;
  /** Dekoratif modül illüstrasyonu (owner onaylı referanstan kesilmiş, aria-hidden). */
  art: string;
  href: string;
  kind: LandingCardKind;
  /** i18n `feats.<slug>` listesi önceki kartta gösteriliyorsa true. */
  feats: boolean;
  /** Öne çıkan geniş vitrin kartı: 4 sütunda 2, 3 sütunda tam satır kaplar (12 + 2×2 = 16 → boşluksuz ızgara). */
  wide?: { scene: string };
};

const art = (slug: string) => `/premium/landing/mod-${slug}.webp`;

export const LANDING_MODULE_THEME: Record<string, LandingModuleTheme> = {
  danisanYonetimi: { acc: "#5b54c4", art: art("danisanYonetimi"), href: "/danisan-yolculugu", kind: "sampleScreens", feats: true },
  dogaltas: { acc: "#1f9a7a", art: art("dogaltas"), href: "/dogaltas", kind: "sampleScreens", feats: false },
  urunStok: { acc: "#c9811a", art: art("urunStok"), href: "/urun-stok", kind: "active", feats: true },
  biyoenerji: { acc: "#1d8fc4", art: art("biyoenerji"), href: "/enerji-beden", kind: "sampleScreens", feats: true, wide: { scene: "/premium/biyoenerji/enerji-bedenleri-hero.webp" } },
  refleksoloji: { acc: "#c8507f", art: art("refleksoloji"), href: "/refleksoloji", kind: "sampleScreens", feats: true },
  kupaHacamat: { acc: "#c94a57", art: art("kupaHacamat"), href: "/kupa", kind: "active", feats: true },
  aromaterapi: { acc: "#a552b8", art: art("aromaterapi"), href: "/aromaterapi", kind: "active", feats: false },
  sifaRehberi: { acc: "#3d9447", art: art("sifaRehberi"), href: "/sifa-rehberi", kind: "sampleScreens", feats: true },
  beslenme: { acc: "#6f9a22", art: art("beslenme"), href: "/beslenme", kind: "active", feats: true },
  numeroloji: { acc: "#7a5bd0", art: art("numeroloji"), href: "/numeroloji", kind: "sampleAnalysis", feats: false },
  kisiselArsiv: { acc: "#b8862b", art: art("kisiselArsiv"), href: "/dashboard/kisisel-arsiv", kind: "sampleScreens", feats: true },
  humanDesign: { acc: "#7e4fc8", art: art("humanDesign"), href: "/human-design", kind: "plain", feats: true },
  kozmikAjanda: { acc: "#1f6f86", art: art("kozmikAjanda"), href: "/cosmic-calendar", kind: "active", feats: true },
  // Astroloji (Gökyüzü Atlası): açık premium giriş sahnesi; erişim /astroloji rota korumasıyla (astrology izni).
  gokyuzuAtlasi: {
    acc: "#7a5bd0",
    art: "/premium/gokyuzu-atlasi/giris-ikon-yeni.webp",
    href: "/astroloji",
    kind: "active",
    feats: true,
    wide: { scene: "/premium/gokyuzu-atlasi/giris-zemin.webp" },
  },
};

/** 07 · beş özellik kartı (featureItems slug → dekoratif obje). */
export const LANDING_FEATURE_ART: Record<string, string> = {
  guvenli: "/premium/landing/ozellik-guvenli.webp",
  analiz: "/premium/landing/ozellik-analiz.webp",
  webMobil: "/premium/landing/ozellik-webMobil.webp",
  yedekleme: "/premium/landing/ozellik-yedekleme.webp",
  moduler: "/premium/landing/ozellik-moduler.webp",
};

/** Laptop/telefon ekranı: giriş sonrası ana paneldeki gerçek merkezler ve gerçek ikonları (home.modules.<key>). */
export const LANDING_HOME_CENTERS: { key: string; acc: string; icon: string }[] = [
  { key: "clients", acc: "#6d5bd0", icon: "/premium/ana-sayfa/ic-danisan.webp" },
  { key: "yasam_hafizasi", acc: "#d0507e", icon: "/premium/ana-sayfa/ic-hafiza.webp" },
  { key: "energy_body", acc: "#d0507e", icon: "/premium/ana-sayfa/ic-beden.webp" },
  { key: "sifa_rehberi", acc: "#3d9447", icon: "/premium/ana-sayfa/ic-dogal.webp" },
  { key: "digital_content", acc: "#3b82d6", icon: "/premium/ana-sayfa/ic-dijital.webp" },
  { key: "numerology", acc: "#7a5bd0", icon: "/premium/ana-sayfa/ic-analiz.webp" },
];

/** Telefon ekranı: Yaşam Analiz Merkezi'ndeki gerçek kartlar (home.premium.nav.<navKey>). */
export const LANDING_ANALYSIS_CARDS: { navKey: string; img: string }[] = [
  { navKey: "numeroloji", img: "/premium/analiz-merkezi/kart-numeroloji.webp" },
  { navKey: "humanDesign", img: "/premium/analiz-merkezi/kart-human-design.webp" },
  { navKey: "cosmic", img: "/premium/analiz-merkezi/kart-kozmik-ajanda.webp" },
];
