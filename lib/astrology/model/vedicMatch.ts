// Atlas yeni teknikler (2026-10-22) — Vedik EŞLEŞTİRME (Ashtakoot Gun Milan + Manglik) ve SADE SATI kanonik modelleri (SAF;
// istemci de import edebilir).
//
// Hesap motoru sağlayıcıdır; burada yalnız Yaşam'ın sağlayıcı-bağımsız veri biçimi ve Türkçe etiketleri vardır.
// Teknik katmana HÜKÜM / ÖNERİ metni GİRMEZ: sağlayıcının "birleşim tavsiye edilir / edilmez" cümlesi, eşik bayrağı
// (isCompatible), Manglik ve Sade Sati etki/çare anlatıları ayrı yorum katmanındadır ve yalnız yorum yetkisiyle servis edilir.

import type { SignId } from "./western";
import type { NakshatraId, VedicAyanamsaId, VedicFrame, VedicGrahaId } from "./vedic";

// ─── Ashtakoot (Gun Milan) ───────────────────────────────────────────────────
export const KOOTA_IDS = ["varna", "vashya", "tara", "yoni", "graha_maitri", "gana", "bhakoot", "nadi"] as const;
export type KootaId = (typeof KOOTA_IDS)[number];
/** Klasik azami puanlar (1…8; toplam 36). Sağlayıcı maxScore'u bununla denetlenir. */
export const KOOTA_MAX: Readonly<Record<KootaId, number>> = { varna: 1, vashya: 2, tara: 3, yoni: 4, graha_maitri: 5, gana: 6, bhakoot: 7, nadi: 8 };
/** Sağlayıcı `category` adı → kimlik (sıra sabit). */
export const KOOTA_PROVIDER_NAMES: Readonly<Record<KootaId, string>> = {
  varna: "Varna",
  vashya: "Vashya",
  tara: "Tara",
  yoni: "Yoni",
  graha_maitri: "Graha Maitri",
  gana: "Gana",
  bhakoot: "Bhakoot",
  nadi: "Nadi",
};
export const KOOTA_LABELS: Readonly<Record<KootaId, string>> = {
  varna: "Varna",
  vashya: "Vashya",
  tara: "Tara (Dina)",
  yoni: "Yoni",
  graha_maitri: "Graha Maitri",
  gana: "Gana",
  bhakoot: "Bhakoot (Rashi)",
  nadi: "Nadi",
};
/** Her koota'nın klasik olarak neye bakıldığı (Yaşam'ın nötr Türkçe tanımı; sağlayıcı açıklaması yerine gösterilir). */
export const KOOTA_BASIS: Readonly<Record<KootaId, string>> = {
  varna: "Ay burcunun varna sınıfı",
  vashya: "Ay burcunun vashya grubu",
  tara: "Ay nakshatraları arası sayım (9'lu tara döngüsü)",
  yoni: "Ay nakshatrasının yoni hayvanı",
  graha_maitri: "Ay burcu yöneticileri arasındaki doğal dostluk",
  gana: "Ay nakshatrasının ganası",
  bhakoot: "Ay burçları arası uzaklık",
  nadi: "Ay nakshatrasının nadisi",
};
export const DOSHA_IDS = ["nadi", "bhakoot"] as const;
export type GunMilanDoshaId = (typeof DOSHA_IDS)[number];
export const DOSHA_LABELS: Readonly<Record<GunMilanDoshaId, string>> = { nadi: "Nadi Dosha", bhakoot: "Bhakoot Dosha" };

/** Sınıflama etiketi: sağlayıcı değeri (temizlenmiş) + bilinen Türkçe karşılık (yoksa ham değer gösterilir). */
export type KootaClass = { raw: string; label: string };

export type KootaRow = {
  id: KootaId;
  score: number;
  maxScore: number;
  /** person1 = analiz edilen kişi (A), person2 = karşı taraf (B). */
  person1: KootaClass;
  person2: KootaClass;
};

export const VEDIC_MANGLIK_PART_SCHEMA = "astro.vedic.manglik.v1" as const;
export const MANGLIK_SEVERITIES = ["mild", "moderate", "severe"] as const;
export type ManglikSeverity = (typeof MANGLIK_SEVERITIES)[number];
/** Sağlayıcı belgesi: Mild = 2./12. ev, Moderate = 4./7. ev, Severe = 1./8. ev (Lagna'dan Mars). Nötr ev grubu gösterimi. */
export const MANGLIK_HOUSE_GROUP: Readonly<Record<ManglikSeverity, string>> = { mild: "2. / 12. ev grubu", moderate: "4. / 7. ev grubu", severe: "1. / 8. ev grubu" };
export const MANGLIK_SEVERITY_LABELS: Readonly<Record<ManglikSeverity, string>> = { mild: "hafif", moderate: "orta", severe: "yüksek" };

export type VedicManglikPart = {
  schema: typeof VEDIC_MANGLIK_PART_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  present: boolean;
  severity: ManglikSeverity | null;
  /** Klasik azaltıcı / iptal etkenleri (sağlayıcı metni, olduğu gibi; hüküm değil, kural adı). */
  exceptions: string[];
};
export const VEDIC_MANGLIK_INTERP_SCHEMA = "astro.vedic.manglik.interp.v1" as const;
export type VedicManglikInterpretation = {
  schema: typeof VEDIC_MANGLIK_INTERP_SCHEMA;
  description: string | null;
  remedies: string[];
  effects: { marriage: string | null; personality: string | null; timing: string | null; relationships: string | null } | null;
};

/** Kişi başına natal Ay (yalnız önbellekteki Vedik D1 kaydından; yeni istek YOK). */
export type MatchMoon = { rashi: SignId; nakshatra: NakshatraId; pada: number };

export const VEDIC_GUN_MILAN_PART_SCHEMA = "astro.vedic.gun_milan.part.v1" as const;
export type VedicGunMilanPart = {
  schema: typeof VEDIC_GUN_MILAN_PART_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  total: number;
  maxScore: 36;
  percentage: number;
  kootas: KootaRow[];
  /** Etkin (iptal edilmemiş) doshalar. */
  doshas: GunMilanDoshaId[];
  /** Tespit edilip klasik kuralla iptal edilen doshalar (gerekçe sağlayıcı metni — kural adı). */
  cancellations: { dosha: GunMilanDoshaId; reason: string }[];
};

/**
 * 2026-10-22 (owner): hesaplama rolleri. Sağlayıcı person1'i geleneksel erkek / damat, person2'yi kadın / gelin rolüyle okur
 * (OpenAPI: "typically the boy/groom" / "the girl/bride"); Varna ve Vashya gibi kootalar sıraya duyarlıdır (gerçek yanıt:
 * aynı çift takasla 25,5 → 24,5). Rolü UZMAN seçer, sistem cinsiyet tahmin etmez. "client_first" (varsayılan) = analiz edilen
 * danışan 1. rol; "partner_first" = karşı taraf 1. rol. Varsayılanda seçenek / gövde / anahtar ESKİSİYLE BİREBİR (alan yazılmaz).
 * Teknik veride person1 / person2 HER ZAMAN sağlayıcı rolleridir; hangi kişinin hangi rolde olduğu `order` ile bilinir.
 */
export const GUN_MILAN_ORDERS = ["client_first", "partner_first"] as const;
export type GunMilanOrder = (typeof GUN_MILAN_ORDERS)[number];
export const GUN_MILAN_ROLE_LABELS: Readonly<Record<"person1" | "person2", string>> = {
  person1: "1. rol (geleneksel tabloda erkek / damat)",
  person2: "2. rol (geleneksel tabloda kadın / gelin)",
};
/** [1. rol, 2. rol] adları — names = [analiz edilen danışan, karşı taraf]. Eski kayıtta `order` yok = client_first. */
export function gunMilanRoleNames(t: { order?: unknown }, names: readonly [string, string]): [string, string] {
  return t.order === "partner_first" ? [names[1], names[0]] : [names[0], names[1]];
}

export const VEDIC_GUN_MILAN_TECHNICAL_SCHEMA = "astro.vedic.gun_milan.v1" as const;
export type VedicGunMilanTechnical = Omit<VedicGunMilanPart, "schema"> & {
  schema: typeof VEDIC_GUN_MILAN_TECHNICAL_SCHEMA;
  /** Yalnız karşı taraf 1. roldeyse yazılır (yoksa danışan 1. rol — eski kayıtlarla aynı). */
  order?: "partner_first";
  /** Kişi başına Manglik (iki parça da varsa; eksikse null). */
  manglik: { person1: Omit<VedicManglikPart, "schema" | "zodiac" | "frame">; person2: Omit<VedicManglikPart, "schema" | "zodiac" | "frame"> } | null;
  /** Önbellekteki Vedik D1 kayıtlarından natal Ay (yoksa null; yeni istek yapılmaz). */
  moons?: { person1: MatchMoon | null; person2: MatchMoon | null };
};

export const VEDIC_GUN_MILAN_INTERP_SCHEMA = "astro.vedic.gun_milan.interp.v1" as const;
/**
 * Sağlayıcının hüküm dili içeren katmanı: "recommendation" (ör. "Birleşim tavsiye edilir") ve 18/36 eşik bayrağı. YALNIZ yorum
 * yetkisiyle gösterilir; teknik ekranda / teknik rapor bölümünde YOKTUR.
 */
export type VedicGunMilanInterpretation = { schema: typeof VEDIC_GUN_MILAN_INTERP_SCHEMA; recommendation: string | null; thresholdMet: boolean | null };

// ─── Sade Sati ───────────────────────────────────────────────────────────────
export const SADE_SATI_PHASES = ["rising", "peak", "setting"] as const;
export type SadeSatiPhase = (typeof SADE_SATI_PHASES)[number];
/** Ay'dan sayılan ev (Janma Rashi'den): yükselen 12., doruk 1., batan 2. */
export const SADE_SATI_HOUSE_FROM_MOON: Readonly<Record<SadeSatiPhase, 12 | 1 | 2>> = { rising: 12, peak: 1, setting: 2 };
export const SADE_SATI_PHASE_LABELS: Readonly<Record<SadeSatiPhase, string>> = {
  rising: "Yükselen evre (Ay'dan 12. ev)",
  peak: "Doruk evresi (Ay'dan 1. ev)",
  setting: "Batan evre (Ay'dan 2. ev)",
};
/** Sağlayıcı belgesi: Rising/Setting = Moderate, Peak = Severe (geleneksel sınıflama; nötr "derece" olarak gösterilir). */
export const SADE_SATI_SEVERITY_OF: Readonly<Record<SadeSatiPhase, "moderate" | "severe">> = { rising: "moderate", peak: "severe", setting: "moderate" };

export const VEDIC_SADE_SATI_TECHNICAL_SCHEMA = "astro.vedic.sade_sati.v1" as const;
export type VedicSadeSatiTechnical = {
  schema: typeof VEDIC_SADE_SATI_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  /** Değerlendirme günü (UTC takvim günü; sağlayıcı durumu çağrı anına göre verir → anahtarın parçası). */
  asOf: string;
  present: boolean;
  phase: SadeSatiPhase | null;
  /** Geleneksel derece (sağlayıcı belgesindeki evre sınıflaması). */
  severity: ManglikSeverity | null;
  /** Önbellekteki Vedik D1 kaydından Janma Rashi (natal Ay) — yoksa null; yeni istek yapılmaz. */
  janma?: MatchMoon | null;
};
export const VEDIC_SADE_SATI_INTERP_SCHEMA = "astro.vedic.sade_sati.interp.v1" as const;
export type VedicSadeSatiInterpretation = {
  schema: typeof VEDIC_SADE_SATI_INTERP_SCHEMA;
  description: string | null;
  general: string | null;
  phaseEffect: string | null;
  remedies: string[];
};

/** Janma Rashi + evre → Satürn'ün transit burcu (türetilmiş gösterim: 12. / 1. / 2. burç). */
export function saturnSignOf(moonRashi: SignId, phase: SadeSatiPhase, signs: readonly SignId[]): SignId {
  const i = signs.indexOf(moonRashi);
  const off = phase === "rising" ? 11 : phase === "peak" ? 0 : 1;
  return signs[(i + off) % 12];
}

// ─── Türkçe sınıflama etiketleri (bilinmeyen değer ham gösterilir) ───────────
const L = (pairs: [string, string][]) => Object.fromEntries(pairs.map(([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ""), v])) as Record<string, string>;
export const KOOTA_CLASS_LABELS: Readonly<Record<string, string>> = L([
  ["Brahmin", "Brahmin"],
  ["Kshatriya", "Kshatriya"],
  ["Vaishya", "Vaishya"],
  ["Shudra", "Shudra"],
  ["Chatushpada", "Chatushpada (dört ayaklı)"],
  ["Manav", "Manava (insan)"],
  ["Manava", "Manava (insan)"],
  ["Jalchar", "Jalachara (suda yaşayan)"],
  ["Jalachara", "Jalachara (suda yaşayan)"],
  ["Vanchar", "Vanachara (yabanıl)"],
  ["Vanachara", "Vanachara (yabanıl)"],
  ["Keeta", "Keeta (böcek)"],
  ["Keet", "Keeta (böcek)"],
  ["Janma", "Janma"],
  ["Sampat", "Sampat"],
  ["Vipat", "Vipat"],
  ["Kshema", "Kshema"],
  ["Pratyari", "Pratyari"],
  ["Pratyak", "Pratyari"],
  ["Sadhaka", "Sadhaka"],
  ["Sadhana", "Sadhaka"],
  ["Vadha", "Vadha"],
  ["Naidhana", "Vadha"],
  ["Mitra", "Mitra"],
  ["Parama Mitra", "Parama Mitra"],
  ["Ati Mitra", "Parama Mitra"],
  ["Horse", "At"],
  ["Elephant", "Fil"],
  ["Sheep", "Koyun"],
  ["Goat", "Koyun"],
  ["Serpent", "Yılan"],
  ["Snake", "Yılan"],
  ["Dog", "Köpek"],
  ["Cat", "Kedi"],
  ["Rat", "Sıçan"],
  ["Cow", "İnek"],
  ["Buffalo", "Manda"],
  ["Tiger", "Kaplan"],
  ["Deer", "Geyik"],
  ["Hare", "Geyik"],
  ["Monkey", "Maymun"],
  ["Mongoose", "Firavunfaresi"],
  ["Lion", "Aslan"],
  ["Deva", "Deva"],
  ["Manushya", "Manushya"],
  ["Rakshasa", "Rakshasa"],
  ["Adi", "Adi (Vata)"],
  ["Aadi", "Adi (Vata)"],
  ["Madhya", "Madhya (Pitta)"],
  ["Antya", "Antya (Kapha)"],
]);

export const AYANAMSA_SHORT: Readonly<Record<VedicAyanamsaId, string>> = { lahiri: "Lahiri", raman: "B.V. Raman", "kp-newcomb": "KP Newcomb", "kp-old": "KP (eski)" };

// ─── Ekran + Word/PDF ortak yöntem / kapsam metinleri (tek kaynak) ───────────
export const GUN_MILAN_METHOD_TEXT =
  "Yöntem: Ashtakoot (sekiz koota) Gun Milan. Puanlar iki kişinin doğumdaki Ay nakshatrası ve Ay burcundan klasik tablolarla verilir; azami puanlar Varna 1, Vashya 2, Tara 3, Yoni 4, Graha Maitri 5, Gana 6, Bhakoot 7, Nadi 8 (toplam 36). Nadi ve Bhakoot doshası ile klasik iptal kuralları (Muhurta Martanda / BPHS) sağlayıcının bildirdiği biçimde gösterilir; iptal edilen doshada koota puanı 0 kalır. Ekoller arasında bazı tablolarda farklı puanlama bulunabilir: bu hesapta Gana'da Deva–Manushya eşleşmesi iki yönde de 5 puandır (bazı tablolar yöne göre 5 ya da 6 verir); iptal edilen Bhakoot doshasında koota puanı 0 kalır (bazı ekoller 7 verir). Bu bölüm teknik değerlendirmedir; ilişki ya da evlilik uygunluğu hükmü değildir.";
export const GUN_MILAN_DIRECTION_TEXT =
  "Hesaplama rolleri: geleneksel Ashtakoot tablolarında 1. rol erkek / damat, 2. rol kadın / gelin tarafı olarak okunur; Varna, Vashya ve bazı ekollerde Gana bu sıraya duyarlıdır. Rolleri uzman seçer; sistem cinsiyet tahmini yapmaz. Rol değişirse puanlar farklı olabilir.";
/** Tara satırında sınıf adı yerine (22.10 bağımsız denetim: sağlayıcının Tara adları klasik sayımla uyuşmuyor; puan uyuşuyor). */
export const TARA_CLASS_WITHHELD = "Sınıf adı doğrulanıyor";
export const TARA_WITHHELD_NOTE =
  "Tara (Dina): puan klasik nakshatra sayımıyla bağımsız olarak denetlendi; hesaplama servisinin bildirdiği Tara sınıf adları klasik sayımla uyuşmadığından, doğrulanana kadar gösterilmez.";
export const MANGLIK_METHOD_TEXT = "Manglik (Kuja dosha): Mars'ın Lagna'dan 1., 2., 4., 7., 8. ya da 12. evde bulunması; geleneksel derece ev grubuna göredir. Azaltıcı / iptal etkenleri sağlayıcının bildirdiği klasik kurallardır.";
export const SADE_SATI_METHOD_TEXT =
  "Yöntem: Sade Sati, Satürn'ün Janma Rashi'ye (doğumdaki Ay burcu) göre 12., 1. ve 2. burçlardan geçtiği yaklaşık yedi buçuk yıllık dönemdir (yükselen, doruk, batan evreler). Durum, hesaplamanın yapıldığı güne (değerlendirme günü) göre verilir.";
export const SADE_SATI_SCOPE_TEXT =
  "Kapsam: Hesaplama servisi yalnız değerlendirme günündeki durumu ve evreyi verir; Sade Sati'nin başlangıç / bitiş tarihleri ve geçmiş / gelecek dönemleri bu hesapta yer almaz (tahmini tarih üretilmez). Evre şeridindeki burçlar Janma Rashi'den sayılarak gösterilir.";

export type { VedicGrahaId };
