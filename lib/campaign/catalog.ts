/**
 * KAMPANYA MERKEZİ — sürümlü teknik kataloğu (SAF; istemci ve sunucu güvenli, sır/DB yok).
 *
 * Kimlik biçimi: "<modül>:<teknik>" (DB: ^[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$). Teknik kısmı GERÇEK kayıtlarla birebirdir:
 *   - Gökyüzü Atlası: lib/astrology/engine/techniques.ts TECHNIQUE_IDS (42) + yerel Lilly horary ("horary.lilly").
 *   - Klasik Numeroloji: lib/numeroloji-klasik/input.ts CLASSIC_TECHNIQUES.
 *   - Kozmik Takvim: app/cosmic-calendar alt sayfaları (6 özellik) TEK PAKET.
 * Eşlik testi (scripts/campaign/catalog-parity.test.ts) gerçek kayıtlarda olup burada olmayan veya burada olup kayıtlarda
 * olmayan her kimlikte KIRILIR → yeni teknik eklendiğinde katalog güncellenmeden CI geçmez. Yeni kayıt varsayılan olarak
 * "dogrulama" uygunluğuyla eklenmelidir.
 *
 * Kaynak: KM-P0 v2 görsel PASS (01.11.2026) + main salt okunur teknik denetimi. CAMPAIGN_CATALOG_VERSION her anlamlı
 * değişiklikte (kimlik ekleme/çıkarma, kredi, uygunluk) artırılır; kampanyalar oluşturuldukları sürümü saklar.
 */

export const CAMPAIGN_CATALOG_VERSION = 1;

export type CampaignModule = "hd" | "numk" | "numb" | "atlas" | "kozmik";
export type CampaignReadiness = "hazir" | "dogrulama" | "uygun_degil";
export type CommentSource =
  | "hd.system"
  | "hd.relation"
  | "numk.meaning"
  | "numb.book"
  | "atlas.auto"
  | "atlas.events"
  | "atlas.system"
  | "atlas.tech"
  | "atlas.en"
  | "kozmik.static";

export type PackageFeature = { id: string; name: string; route: string; neutralOnly?: boolean };

export type CatalogEntry = {
  key: string;
  module: CampaignModule;
  technique: string;
  title: string;
  group: string;
  readiness: CampaignReadiness;
  /** Analiz başına sağlayıcı kredisi [en az, en çok]. Kota rezervasyonu EN ÇOK değerle yapılır. */
  credit: readonly [number, number];
  /** Kodda gerçekten var olan, Owner kararıyla açılabilir yorum kaynakları. Boş = yorum yok. */
  comments: readonly CommentSource[];
  people: 0 | 1 | 2 | "grup";
  needsTime: boolean;
  /** true: açmak için ayrı Owner "tam analiz" onayı gerekir (Dört Ok / PHS). */
  requiresOwnerConfirmation?: boolean;
  /** Paket (Kozmik Takvim): tek anahtar, ortak IP/gün ve kontenjan. */
  package?: { features: readonly PackageFeature[] };
};

/** Hiçbir koşulda ücretsiz ziyaretçiye açılmayacak kaynaklar (bilgi amaçlı; sunucu katmanı bunları zaten okumaz). */
export const NEVER_PUBLIC: Readonly<Record<CampaignModule, readonly string[]>> = Object.freeze({
  hd: ["human_design_knowledge_records (uzman Bilgi Bankası ve expert_notes)", "human_design_knowledge_sources", "hd_consultation_expert_notes", "hd_canonical_* tam kaynak metinleri"],
  numk: ["numerology_comparative_notes", "uzman taş stoğu"],
  numb: ["numerology_knowledge_records", "numerology_knowledge_source_entries", "numerology_sources.internal_note", "numerology_stone_assignments"],
  atlas: ["astro_expert_notes", "astro_analysis_notes", "astro_kb_entries", "astro_horary_questions"],
  kozmik: ["uzmanın Hacamat kural kayıtları", "Hacamat PDF/Word raporları", "Hacamat varsayılan kural metinleri (sağlık iddiası — inceleme öncesi kapalı)"],
});

type Opt = Partial<Pick<CatalogEntry, "readiness" | "comments" | "people" | "needsTime" | "requiresOwnerConfirmation" | "package">>;
const e = (module: CampaignModule, technique: string, title: string, group: string, credit: readonly [number, number], o: Opt = {}): CatalogEntry =>
  Object.freeze({
    key: `${module}:${technique}`,
    module,
    technique,
    title,
    group,
    readiness: o.readiness ?? "hazir",
    credit,
    comments: o.comments ?? [],
    people: o.people ?? 1,
    needsTime: o.needsTime ?? false,
    ...(o.requiresOwnerConfirmation ? { requiresOwnerConfirmation: true } : {}),
    ...(o.package ? { package: o.package } : {}),
  });

const A_AUTO: readonly CommentSource[] = ["atlas.auto"];
const A_TECH: readonly CommentSource[] = ["atlas.tech"];
const NK: readonly CommentSource[] = ["numk.meaning"];

export const CAMPAIGN_CATALOG: readonly CatalogEntry[] = Object.freeze([
  // ── Human Design (Sistem Yorumu ayrı analiz değil; bodygraph'ın yorum katmanı) ──
  e("hd", "bodygraph", "BodyGraph (standart harita)", "Harita", [1, 1], { needsTime: true, comments: ["hd.system"] }),
  e("hd", "variables", "Dört Ok / PHS (değişkenler)", "Harita", [2, 2], { readiness: "dogrulama", needsTime: true, requiresOwnerConfirmation: true }),
  e("hd", "transit", "Günün Transiti (genel)", "Transit", [0, 1], { people: 0 }),
  e("hd", "personal_transit", "Kişisel Transit", "Transit", [2, 3], { readiness: "dogrulama", needsTime: true }),
  e("hd", "connection", "İlişki Analizi (Connection, 2 kişi)", "İlişki", [3, 3], { readiness: "dogrulama", people: 2, needsTime: true, comments: ["hd.relation"] }),
  e("hd", "penta", "Penta (3–5 kişi)", "İlişki", [4, 6], { readiness: "dogrulama", people: "grup", needsTime: true, comments: ["hd.relation"] }),
  e("hd", "local_engine", "Yerel HD motoru", "Harita", [0, 0], { readiness: "uygun_degil" }),

  // ── Klasik Numeroloji (CLASSIC_TECHNIQUES) ──
  e("numk", "core", "Tam Numeroloji Haritası (Çekirdek Sayılar)", "Kişi", [1, 1], { comments: NK }),
  e("numk", "bridge", "Köprü Sayıları", "Kişi", [1, 1], { comments: NK }),
  e("numk", "personal_day", "Kişisel Gün", "Zaman", [1, 1], { comments: NK }),
  e("numk", "daily", "Günün Sayısı (sembolik)", "Zaman", [1, 1], { people: 0, comments: NK }),
  e("numk", "chaldean", "Kalde İsim Analizi", "Kişi", [1, 1], { comments: NK }),
  e("numk", "dual", "İki Sistem Karşılaştırması", "Kişi", [2, 2], { comments: NK }),
  e("numk", "person_all", "Tümü (6 kişi tekniği paketi)", "Paket", [5, 5], { comments: NK }),
  e("numk", "compatibility", "Numerolojik Uyum (2 kişi)", "İlişki", [1, 1], { people: 2, comments: NK }),
  e("numk", "business_name", "İşletme Adı Analizi", "İsim", [1, 1], { people: 0, comments: NK }),
  e("numk", "names", "İsim Adayları (iki sistem, aday başına)", "İsim", [1, 6], { readiness: "dogrulama", people: 0, comments: NK }),

  // ── Bütüncül Numeroloji (yerel motor, 0 kredi) ──
  e("numb", "analysis", "Bütüncül Numeroloji Analizi", "Kişi", [0, 0]),
  e("numb", "timing", "Zamanlama ve Gelişim", "Zaman", [0, 0], { comments: ["numb.book"] }),
  e("numb", "relation", "İlişki Analizi (2 kişi)", "İlişki", [0, 0], { readiness: "dogrulama", people: 2, comments: ["numb.book"] }),
  e("numb", "place", "Ev / İşyeri Sayısı", "Mekân", [0, 0], { readiness: "dogrulama", people: 0, comments: ["numb.book"] }),

  // ── Gökyüzü Atlası: Batı (17) ──
  e("atlas", "western.natal", "Natal", "Batı", [1, 1], { comments: A_AUTO }),
  e("atlas", "western.transit", "Transit (tek an)", "Batı", [1, 1], { comments: A_AUTO }),
  e("atlas", "western.forecast", "Transit takvimi", "Batı", [1, 5], { readiness: "dogrulama", comments: ["atlas.events"] }),
  e("atlas", "western.progression", "Secondary progression", "Batı", [1, 1], { comments: A_AUTO }),
  e("atlas", "western.solar_arc", "Solar arc", "Batı", [1, 1], { comments: A_AUTO }),
  e("atlas", "western.solar_return", "Solar return", "Batı", [1, 1], { needsTime: true, comments: A_AUTO }),
  e("atlas", "western.lunar_return", "Lunar return", "Batı", [0, 1], { readiness: "dogrulama", needsTime: true, comments: A_AUTO }),
  e("atlas", "western.planetary_return", "Gezegen dönüşleri", "Batı", [0, 1], { readiness: "dogrulama", needsTime: true, comments: A_AUTO }),
  e("atlas", "western.synastry", "Sinastri", "Batı", [1, 1], { readiness: "uygun_degil", people: 2, comments: A_AUTO }),
  e("atlas", "western.composite", "Composite", "Batı", [1, 1], { readiness: "uygun_degil", people: 2, comments: A_AUTO }),
  e("atlas", "western.astrocartography", "Astrocartography", "Batı", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_AUTO }),
  e("atlas", "western.relocation", "Relocation", "Batı", [1, 2], { readiness: "dogrulama", needsTime: true, comments: A_AUTO }),
  e("atlas", "western.local_space", "Local Space", "Batı", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_AUTO }),
  e("atlas", "western.fixed_stars", "Sabit yıldızlar", "Batı", [1, 1], { readiness: "dogrulama", comments: A_AUTO }),
  e("atlas", "western.profections", "Yıllık Profeksiyonlar", "Batı", [0, 1], { needsTime: true, comments: ["atlas.system"] }),
  e("atlas", "western.extra_points", "Ek noktalar", "Batı", [0, 3], { readiness: "dogrulama", comments: ["atlas.system"] }),
  e("atlas", "western.declination_parallels", "Deklinasyon paralelleri", "Batı", [1, 1], { readiness: "dogrulama", people: 0 }),
  // ── Horary ──
  e("atlas", "horary.lilly", "Batı Horary (William Lilly)", "Horary", [0, 0], { people: 0 }),
  e("atlas", "kp.horary", "KP horary (1–249)", "Horary", [1, 1], { readiness: "dogrulama", people: 0, comments: A_TECH }),
  // ── Vedik (19) ──
  e("atlas", "vedic.d1", "Vedik D1 (Rashi)", "Vedik", [1, 1], { needsTime: true, comments: A_AUTO }),
  e("atlas", "vedic.varga", "Vedik Varga (D9 / Dn)", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "vedic.dasha", "Vimshottari Dasha", "Vedik", [1, 2], { readiness: "dogrulama", needsTime: true, comments: A_AUTO }),
  e("atlas", "vedic.drishti", "Graha Drishti", "Vedik", [0, 1], { readiness: "dogrulama", needsTime: true }),
  e("atlas", "vedic.ashtakavarga", "Ashtakavarga", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true }),
  e("atlas", "vedic.shadbala", "Shadbala", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "vedic.panchanga", "Janma Panchanga", "Vedik", [0, 4], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "vedic.transit", "Gochara (Vedik transit)", "Vedik", [0, 1], { readiness: "dogrulama", needsTime: true, comments: ["atlas.en"] }),
  e("atlas", "vedic.bhav_chalit", "Bhav Chalit", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "vedic.chara_karaka", "Chara Karakalar", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "vedic.arudha", "Arudha Padalar", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "vedic.bhava_bala", "Bhava Bala", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "vedic.gun_milan", "Gun Milan (Ashtakoot)", "Vedik", [3, 3], { readiness: "uygun_degil", people: 2, needsTime: true, comments: A_AUTO }),
  e("atlas", "vedic.sade_sati", "Sade Sati", "Vedik", [1, 1], { needsTime: true, comments: A_AUTO }),
  e("atlas", "vedic.dashakoot", "On Porutham (Dashakoot)", "Vedik", [1, 1], { readiness: "uygun_degil", people: 2, needsTime: true, comments: A_AUTO }),
  e("atlas", "vedic.papasamyam", "Papasamyam", "Vedik", [1, 1], { readiness: "uygun_degil", people: 2, needsTime: true, comments: A_AUTO }),
  e("atlas", "vedic.upagraha", "Upagrahalar", "Vedik", [1, 1], { readiness: "dogrulama", needsTime: true }),
  e("atlas", "vedic.heliacal", "Graha Asta / Udaya", "Vedik", [0, 1], { readiness: "dogrulama", people: 0 }),
  e("atlas", "vedic.monthly", "Vedik aylık zamanlama", "Vedik", [1, 5], { readiness: "dogrulama", people: 0 }),
  // ── KP (6; KP horary yukarıda Horary grubunda) ──
  e("atlas", "kp.chart", "KP doğum haritası", "KP", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "kp.dasha", "KP dasha", "KP", [1, 2], { readiness: "dogrulama", needsTime: true, comments: A_AUTO }),
  e("atlas", "kp.ruling", "KP ruling planets", "KP", [1, 1], { readiness: "dogrulama", needsTime: true, comments: A_TECH }),
  e("atlas", "kp.transit", "KP transit (tek an)", "KP", [1, 15], { readiness: "dogrulama", people: 0 }),
  e("atlas", "kp.ruling_interval", "KP ruling planets zaman taraması", "KP", [0, 1], { readiness: "dogrulama", people: 0, comments: A_TECH }),

  // ── Kozmik Takvim: 6 özellik TEK PAKET (Owner kararı 01.11.2026; sağlayıcı kredisi 0) ──
  e("kozmik", "paket", "Kozmik Takvim — tam paket (6 özellik)", "Paket", [0, 0], {
    readiness: "dogrulama",
    people: 0,
    comments: ["kozmik.static"],
    package: {
      features: [
        { id: "moon", name: "Ay Fazları", route: "moon-phases" },
        { id: "retro", name: "Retro Takvimi", route: "retro-calendar" },
        { id: "hours", name: "Gezegen Saatleri", route: "planetary-hours" },
        { id: "power", name: "Güçlü Günler", route: "power-days" },
        { id: "transits", name: "Transitler", route: "transits" },
        { id: "hacamat", name: "Hacamat Takvimi", route: "hacamat", neutralOnly: true },
      ],
    },
  }),
]);

const BY_KEY: ReadonlyMap<string, CatalogEntry> = new Map(CAMPAIGN_CATALOG.map((x) => [x.key, x]));

export const TECHNIQUE_KEY_RE = /^[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$/;

export function getCatalogEntry(key: string): CatalogEntry | null {
  return BY_KEY.get(key) ?? null;
}

/** Kota rezervasyonunda kullanılan analiz başına azami kredi (katalogdan; istemci değeri ASLA kullanılmaz). */
export function maxCreditOf(entry: CatalogEntry): number {
  return entry.credit[1];
}

export function isSelectable(entry: CatalogEntry): boolean {
  return entry.readiness !== "uygun_degil";
}
