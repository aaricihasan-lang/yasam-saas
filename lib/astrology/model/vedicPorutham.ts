// Atlas Roxy kalan teknikler (2026-10-22 gece) — Güney Hint ON PORUTHAM (Dashakoot) ve PAPASAMYAM kanonik modelleri (SAF;
// istemci de import edebilir).
//
// Gun Milan (Ashtakoot, 36 puan — model/vedicMatch.ts) ile AYRI sistemlerdir: ayrı şema, ayrı hesap kimliği, ayrı rapor bölümü;
// puanlar asla birleştirilmez / karşılaştırılmaz. Hesap motoru sağlayıcıdır; burada yalnız Yaşam'ın sağlayıcı-bağımsız veri
// biçimi, Türkçe etiketleri ve tek kaynak yöntem metinleri vardır.
// Teknik katmana HÜKÜM / ÖNERİ metni GİRMEZ: sağlayıcının "recommended / marginal / rejected", "balanced / unbalanced" hükmü,
// öneri cümlesi ve satır açıklamaları (ör. "zihinler buluşur", "uzun ömür") ayrı yorum katmanındadır (yalnız yorum yetkisiyle).
// Teknik katmanda yalnız kriter sonucu (karşılandı / karşılanmadı), sınıflama, toplam, kısıtın etkin olup olmadığı ve
// karşılaştırma kuralının sonucu nötr dille bulunur.

import type { SignId } from "./western";
import type { NakshatraId, VedicFrame } from "./vedic";
import type { MatchMoon } from "./vedicMatch";

// ─── Ortak: hesaplama rolleri ────────────────────────────────────────────────
/**
 * Sağlayıcı sözleşmesi (OpenAPI 2.0.0): person1 = damat (GROOM), person2 = gelin (BRIDE). Dashakoot'ta Dina, Mahendra, Stree
 * Deergha, Rasi ve Vasya gelinden damada sayılır; Papasamyam karşılaştırması da yönlüdür. Rolü UZMAN seçer, sistem cinsiyet
 * tahmin etmez. "partner_first" = karşı taraf 1. rol; varsayılanda alan yazılmaz (danışan 1. rol). Teknik veride person1 /
 * person2 HER ZAMAN sağlayıcı rolleridir.
 */
export const PORUTHAM_ROLE_LABELS: Readonly<Record<"person1" | "person2", string>> = {
  person1: "1. rol (geleneksel: damat)",
  person2: "2. rol (geleneksel: gelin)",
};
export const PORUTHAM_ROLE_SHORT: Readonly<Record<"person1" | "person2", string>> = { person1: "1. rol", person2: "2. rol" };

// ─── Dashakoot (On Porutham) ─────────────────────────────────────────────────
export const PORUTHAM_IDS = ["dina", "gana", "mahendra", "stree_deergha", "yoni", "rasi", "rasyadhipati", "vasya", "rajju", "vedha"] as const;
export type PoruthamId = (typeof PORUTHAM_IDS)[number];
/** Sağlayıcı `name` (kanonik İngilizce, çevrilmez) → kimlik; sıra Tamil panchangam sırasıdır. */
export const PORUTHAM_PROVIDER_NAMES: Readonly<Record<PoruthamId, string>> = {
  dina: "Dina",
  gana: "Gana",
  mahendra: "Mahendra",
  stree_deergha: "Stree Deergha",
  yoni: "Yoni",
  rasi: "Rasi",
  rasyadhipati: "Rasyadhipati",
  vasya: "Vasya",
  rajju: "Rajju",
  vedha: "Vedha",
};
export const PORUTHAM_LABELS: Readonly<Record<PoruthamId, string>> = {
  dina: "Dina (Dinam)",
  gana: "Gana (Ganam)",
  mahendra: "Mahendra",
  stree_deergha: "Stree Deergha",
  yoni: "Yoni",
  rasi: "Rasi",
  rasyadhipati: "Rasyadhipati (Rasi Athipathi)",
  vasya: "Vasya (Vasiyam)",
  rajju: "Rajju",
  vedha: "Vedha (Vedhai)",
};
/** Her porutham'da klasik olarak neye bakıldığı (Yaşam'ın nötr Türkçe tanımı; sağlayıcı açıklaması yerine). */
export const PORUTHAM_BASIS: Readonly<Record<PoruthamId, string>> = {
  dina: "Gelinin Ay nakshatrasından damadınkine sayım",
  gana: "Ay nakshatrasının gana sınıfı",
  mahendra: "Gelinin Ay nakshatrasından damadınkine sayım (Mahendra konumları)",
  stree_deergha: "Gelinin Ay nakshatrasından damadınkine uzaklık",
  yoni: "Ay nakshatrasının yoni hayvanı (düşman çift)",
  rasi: "Gelinin Ay burcundan damadınkine sayım",
  rasyadhipati: "Ay burcu yöneticileri arasındaki doğal dostluk",
  vasya: "Ay burçları arasındaki vasya (çekim) ilişkisi",
  rajju: "Ay nakshatralarının Rajju uzvu (beden bölümü)",
  vedha: "Ay nakshatralarının karşılıklı engel (vedha) çifti",
};
/** Yönlü kriterler (sağlayıcı: gelinden damada sayılır) — rol takası bunları değiştirebilir. */
export const PORUTHAM_DIRECTIONAL: ReadonlySet<PoruthamId> = new Set<PoruthamId>(["dina", "mahendra", "stree_deergha", "rasi", "vasya"]);
/** Sınıflama türü (sağlayıcı person1/person2 alanının sözlüğü). */
export const PORUTHAM_CLASS_KIND: Readonly<Record<PoruthamId, "nakshatra" | "gana" | "yoni" | "rashi" | "graha" | "rajju">> = {
  dina: "nakshatra",
  gana: "gana",
  mahendra: "nakshatra",
  stree_deergha: "nakshatra",
  yoni: "yoni",
  rasi: "rashi",
  rasyadhipati: "graha",
  vasya: "rashi",
  rajju: "rajju",
  vedha: "nakshatra",
};

export const RAJJU_IDS = ["paada", "kati", "udara", "kantha", "siro"] as const;
export type RajjuId = (typeof RAJJU_IDS)[number];
export const RAJJU_LABELS: Readonly<Record<RajjuId, string>> = {
  paada: "Paada (ayak)",
  kati: "Kati (bel / kalça)",
  udara: "Udara (karın)",
  kantha: "Kantha (boyun)",
  siro: "Siro (baş)",
};

export type PoruthamClass = { raw: string; label: string };
export type PoruthamRow = {
  id: PoruthamId;
  /**
   * Kriter karşılandı mı (sağlayıcı: matched / unmatched; puan 1 / 0). Hüküm değil, kural sonucu. ATL-B02: yalnız Rasi satırı,
   * Kalaprakasika'nın hüküm vermediği aynı burçta (1. sayım) null'dır (belirsiz; 0 ya da 1 atanmaz).
   */
  matched: boolean | null;
  points: 0 | 1 | null;
  person1: PoruthamClass;
  person2: PoruthamClass;
  /**
   * Türetilmiş gösterim: gelinin (2. rol) yıldızından / burcundan damadınkine (1. rol) sayım (1…27 / 1…12). Yalnız sayım kuralı
   * olan kriterlerde ve iki sınıflama da tanınırsa; sağlayıcı sınıflamasından sayılır (yeni hesap değildir).
   */
  count?: number;
};

export const VEDIC_DASHAKOOT_TECHNICAL_SCHEMA = "astro.vedic.dashakoot.v1" as const;
export type VedicDashakootTechnical = {
  schema: typeof VEDIC_DASHAKOOT_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  /** Karşılanan porutham sayısı (0…10; ağırlıksız sayım — Ashtakoot puanı DEĞİLDİR). ATL-B02: Rasi belirsizse null (bkz. totalRange). */
  total: number | null;
  /** Yalnız Rasi belirsizken: [Rasi karşılanmasaydı, karşılansaydı] toplamı. */
  totalRange?: [number, number];
  maxTotal: 10;
  rows: PoruthamRow[];
  /** ATL-B02 (07.11.2026, adaptör -2): Rasi satırı Kalaprakasika kuralıyla yerel hesaplandı. Yoksa kayıt servisin Rasi kuralıyladır. */
  rasiClassic?: RasiClassic;
  /** Kesin kısıtlar (geleneğin "veto"su): etkin mi + kişi başına sınıflama. Gerekçe metni nötr şablondur (yorum değil). */
  rajju: { active: boolean; person1: RajjuId; person2: RajjuId };
  vedha: { active: boolean; person1: string; person2: string };
  /** Yalnız karşı taraf 1. roldeyse yazılır (yoksa danışan 1. rol). */
  order?: "partner_first";
  /** Önbellekteki Vedik D1 kayıtlarından natal Ay (yoksa null; yeni istek yapılmaz). */
  moons?: { person1: MatchMoon | null; person2: MatchMoon | null };
};

export const VEDIC_DASHAKOOT_INTERP_SCHEMA = "astro.vedic.dashakoot.interp.v1" as const;
export const DASHAKOOT_VERDICTS = ["recommended", "marginal", "rejected"] as const;
export type DashakootVerdict = (typeof DASHAKOOT_VERDICTS)[number];
/**
 * Sağlayıcının hüküm dili içeren katmanı: genel hüküm (eşik sağlayıcı geleneğidir), öneri cümlesi, Rajju / Vedha gerekçe
 * cümleleri ve satır açıklamaları. YALNIZ yorum yetkisiyle; teknik ekranda / teknik rapor bölümünde YOKTUR.
 */
export type VedicDashakootInterpretation = {
  schema: typeof VEDIC_DASHAKOOT_INTERP_SCHEMA;
  verdict: DashakootVerdict | null;
  recommendation: string | null;
  rajjuReason: string | null;
  vedhaReason: string | null;
  notes: { id: PoruthamId; note: string }[];
  /** ATL-B02: yerel Rasi servisinkinden farklı / belirsiz → servisin genel değerlendirmesi ve öneri cümlesi gösterilmez. */
  verdictWithheld?: "rasi_local";
};
export const DASHAKOOT_VERDICT_LABELS: Readonly<Record<DashakootVerdict, string>> = {
  recommended: "servisin eşiğine göre önerilir",
  marginal: "servisin eşiğine göre sınırda",
  rejected: "kesin kısıt (Rajju / Vedha) nedeniyle servis tarafından reddedilir",
};

// ─── ATL-B02 (07.11.2026): Rasi kriteri — Kalaprakasika (yerel hesap: engine/dashakootRasi.ts) ─────────────
export const RASI_METHOD = "kalaprakasika" as const;
export type RasiRule = "same_sign" | "second_even" | "second_odd" | "third" | "fourth" | "fifth" | "sixth_listed" | "sixth" | "seventh" | "converse";
/** Genel istisna (s. 76) durumu: puanı DEĞİŞTİRMEZ, yalnız yorum bilgisidir. */
export type RasiParihara = "not_needed" | "applies_same_lord" | "applies_friends" | "uncertain_friendship" | "none";
export type RasiClassic = {
  method: typeof RASI_METHOD;
  /** Gelinin (2. rol) Ay burcundan damadınkine (1. rol) dahil sayım. */
  count: number;
  rule: RasiRule;
  status: "matched" | "unmatched" | "uncertain";
  /** Hesap servisinin aynı satır için verdiği sonuç (yalnız şeffaflık; puanlamaya girmez). */
  provider: { matched: boolean };
  parihara: RasiParihara;
};
export const RASI_SOURCE = "Kalaprakasika (N. P. Subramania Iyer çevirisi), Bölüm XIII, s. 73–74";
export const RASI_RULE_TEXT: Readonly<Record<RasiRule, string>> = {
  same_sign: "Aynı Ay burcu (1. sayım): Kalaprakasika'nın Rasi kuralı bu konum için hüküm vermez; sonuç belirsiz bırakıldı (0 ya da 1 atanmadı).",
  second_even: "2. sayım: Kalaprakasika istisnasıyla, damadın (1. rol) Ay burcu çift burç olduğundan karşılandı.",
  second_odd: "2. sayım: damadın (1. rol) Ay burcu tek burç; Kalaprakasika istisnası uygulanmaz, karşılanmadı.",
  third: "3. sayım: Kalaprakasika'da olumsuz konum; karşılanmadı.",
  fourth: "4. sayım: Kalaprakasika'da olumsuz konum; karşılanmadı.",
  fifth: "5. sayım: Kalaprakasika'da olumsuz konum; karşılanmadı.",
  sixth_listed: "6. sayım: burç çifti Kalaprakasika'nın 6. konum istisna listesinde; karşılandı.",
  sixth: "6. sayım: burç çifti Kalaprakasika'nın 6. konum istisna listesinde değil; karşılanmadı.",
  seventh: "7. sayım (karşıt burçlar): Kalaprakasika'da olumlu konum; karşılandı.",
  converse: "8.–12. sayım: Kalaprakasika'da 2.–6. konumların tersi olumlu sayılır; karşılandı.",
};
export const RASI_STATUS_LABELS: Readonly<Record<RasiClassic["status"], string>> = { matched: "karşılandı · 1", unmatched: "karşılanmadı · 0", uncertain: "belirsiz · —" };
/** Satır sonucu etiketi: Rasi belirsizse (null) "belirsiz". */
export const poruthamResultLabel = (m: boolean | null | undefined) => (m === true ? RASI_STATUS_LABELS.matched : m === false ? RASI_STATUS_LABELS.unmatched : m === null ? RASI_STATUS_LABELS.uncertain : "—");
export function rasiProviderText(c: RasiClassic): string {
  const local = c.status === "uncertain" ? null : c.status === "matched";
  const p = c.provider.matched ? "karşılandı" : "karşılanmadı";
  return local === c.provider.matched ? `Hesap servisinin sonucu da ${p}.` : `Hesap servisinin sonucu: ${p} (servisin kendi Rasi kuralı; puanlamaya girmez).`;
}
export function rasiPariharaText(c: RasiClassic, lords: [string, string]): string | null {
  const l = lords[0] === lords[1] ? lords[0] : `${lords[0]} / ${lords[1]}`;
  const tail = " Rasi sonucu ve toplam DEĞİŞTİRİLMEDİ; istisna yalnız yorumda dikkate alınacak bir bilgidir.";
  switch (c.parihara) {
    case "not_needed":
      return null;
    case "applies_same_lord":
      return `Kalaprakasika genel istisnası (s. 76): iki Ay burcunun yöneticisi aynı (${l}); kaynak bu durumda Rasi'nin olumsuz etkisinin dikkate alınmayabileceğini söyler.${tail}`;
    case "applies_friends":
      return `Kalaprakasika genel istisnası (s. 76): Ay burcu yöneticileri (${l}) kaynağın dostluk listesinde (s. 74–75) karşılıklı dost; kaynak bu durumda Rasi'nin olumsuz etkisinin dikkate alınmayabileceğini söyler.${tail}`;
    case "uncertain_friendship":
      return `Kalaprakasika genel istisnası (s. 76): Ay burcu yöneticileri (${l}) arasındaki dostluk kaynağın listesinde (s. 74–75) iki yönde de belirtilmemiş; istisnanın uygulanıp uygulanmadığı belirsiz.${tail}`;
    case "none":
      return `Kalaprakasika genel istisnası (s. 76) uygulanmaz: Ay burcu yöneticileri (${l}) aynı değil ve kaynağın listesinde (s. 74–75) karşılıklı düşman.`;
  }
}
export const RASI_TOTAL_UNCERTAIN_NOTE = "Rasi belirsiz olduğundan toplam tek sayı olarak verilmez: Rasi karşılanmasaydı ve karşılansaydı oluşacak iki toplam gösterilir.";
export const DASHAKOOT_VERDICT_WITHHELD_TEXT =
  "Servisin genel değerlendirmesi ve öneri cümlesi bu sonuçta gösterilmiyor: Rasi kriteri Kalaprakasika kuralıyla yerel hesaplandı ve servisin Rasi sonucundan farklı (ya da belirsiz); servis değerlendirmesi kendi Rasi sonucuna dayandığı için bu sonuçla tutarlı değil. Yerine yeni bir genel karar üretilmez. Servisin Rasi açıklaması da çıkarıldı.";

// ─── Papasamyam ──────────────────────────────────────────────────────────────
export const PAPA_REFERENCES = ["lagna", "moon", "venus"] as const;
export type PapaReference = (typeof PAPA_REFERENCES)[number];
export const PAPA_REFERENCE_PROVIDER: Readonly<Record<PapaReference, string>> = { lagna: "Lagna", moon: "Moon", venus: "Venus" };
/** Sağlayıcı ağırlıkları (belgelenmiş): Lagna 1, Ay 0,5, Venüs 0,25. Başka ağırlık → fail-closed (ekol değişikliği). */
export const PAPA_WEIGHTS: Readonly<Record<PapaReference, number>> = { lagna: 1, moon: 0.5, venus: 0.25 };
export const PAPA_REFERENCE_LABELS: Readonly<Record<PapaReference, string>> = { lagna: "Lagna'dan", moon: "Ay'dan (Chandra Lagna)", venus: "Venüs'ten" };
export const PAPA_GRAHAS = ["mars", "saturn", "sun", "rahu"] as const;
export type PapaGraha = (typeof PAPA_GRAHAS)[number];
/** Malefik etki sayılan bhavalar (bütün-burç, referanstan): 1, 2, 4, 7, 8, 12. */
export const PAPA_HOUSES = [1, 2, 4, 7, 8, 12] as const;

export type PapaReferenceRow = { reference: PapaReference; weight: number; afflictions: { graha: PapaGraha; house: number }[]; points: number };
export type PapaPerson = { total: number; byReference: PapaReferenceRow[] };

export const VEDIC_PAPASAMYAM_TECHNICAL_SCHEMA = "astro.vedic.papasamyam.v1" as const;
export type VedicPapasamyamTechnical = {
  schema: typeof VEDIC_PAPASAMYAM_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  person1: PapaPerson;
  person2: PapaPerson;
  /**
   * Karşılaştırma kuralının sonucu (nötr): "within" = 2. rolün toplamı 1. rolünkinden büyük değil; "exceeds" = 2. rol daha
   * yüksek. Sağlayıcının "balanced / unbalanced" hükmüyle tutarlılığı adaptörde denetlenir; hüküm kelimesi yorum katmanındadır.
   */
  comparison: "within" | "exceeds";
  /** 1. rol toplamı − 2. rol toplamı (türetilmiş gösterim). */
  difference: number;
  order?: "partner_first";
};
export const VEDIC_PAPASAMYAM_INTERP_SCHEMA = "astro.vedic.papasamyam.interp.v1" as const;
export type VedicPapasamyamInterpretation = { schema: typeof VEDIC_PAPASAMYAM_INTERP_SCHEMA; verdict: "balanced" | "unbalanced" | null; recommendation: string | null };
export const PAPASAMYAM_VERDICT_LABELS: Readonly<Record<"balanced" | "unbalanced", string>> = {
  balanced: "servis değerlendirmesi: dengeli",
  unbalanced: "servis değerlendirmesi: dengesiz",
};

// ─── Ortak gösterim yardımcıları ─────────────────────────────────────────────
/** [1. rol, 2. rol] adları — names = [analiz edilen danışan, karşı taraf]. */
export function poruthamRoleNames(t: { order?: unknown }, names: readonly [string, string]): [string, string] {
  return t.order === "partner_first" ? [names[1], names[0]] : [names[0], names[1]];
}
/** Rajju / Vedha kısıtı için NÖTR teknik gerekçe (sağlayıcı cümlesi değil). */
export function rajjuReasonText(r: { active: boolean; person1: RajjuId; person2: RajjuId }): string {
  return r.active
    ? `İki Ay nakshatrası aynı Rajju uzvunda (${RAJJU_LABELS[r.person1]}); Rajju kısıtı etkin.`
    : `Ay nakshatraları farklı Rajju uzuvlarında (${RAJJU_LABELS[r.person1]} / ${RAJJU_LABELS[r.person2]}); Rajju kısıtı etkin değil.`;
}
export function vedhaReasonText(v: { active: boolean }): string {
  return v.active ? "İki Ay nakshatrası klasik vedha (karşılıklı engel) çiftini oluşturuyor; Vedha kısıtı etkin." : "İki Ay nakshatrası bir vedha çifti oluşturmuyor; Vedha kısıtı etkin değil.";
}
/** 24.10.2026 (ölçüldü: çerçevedeki tek ayanamsa derecesi 1. rolün doğum anına ait; her kişi KENDİ doğum anının değeriyle hesaplanır —
 *  Dashakoot ayırt edici 3/3, Papasamyam 4/4). Ekran + Word/PDF ortak metin; Gun Milan notuyla aynı kalıp. */
export function poruthamAyanamsaNote(kind: "dashakoot" | "papasamyam", firstRole: string): string {
  const what = kind === "dashakoot" ? "Ay konumu" : "Lagna, Ay, Venüs ve malefik gezegen konumları";
  return `Gösterilen ayanamsa derecesi 1. roldeki kişinin (${firstRole}) doğum anına aittir; her kişinin ${what} kendi doğum anının ayanamsa değeriyle hesaplanır.`;
}
export const PORUTHAM_COUNT_NOTE ="Sayım sütunu, gelinin (2. rol) Ay nakshatrasından / burcundan damadınkine (1. rol) dahil sayımdır; hesap servisinin bildirdiği sınıflamalardan türetilmiştir.";

export const DASHAKOOT_METHOD_TEXT =
  "Yöntem: Güney Hint On Porutham (Dashakoot / Dasa Porutham). On kriterin (Dina, Gana, Mahendra, Stree Deergha, Yoni, Rasi, Rasyadhipati, Vasya, Rajju, Vedha) her biri ağırlıksız olarak karşılandı / karşılanmadı biçiminde değerlendirilir; toplam 10 üzerinden karşılanan kriter sayısıdır. Rajju ve Vedha gelenekte toplamdan bağımsız kesin kısıt sayılır. Bu sistem Ashtakoot Gun Milan'dan (36 puan) ayrıdır; iki sistemin puanları birbirine çevrilmez ve toplanmaz. Ekoller arasında Rasi sayım kuralı, Gana eşleşmeleri ve Mahendra yönü farklılık gösterebilir. Bu hesaplamada Rasi kriterinde gelinden damada 6., 8. ve 12. sayımlar karşılanmamış kabul edilir; 2. ve 4. sayımı da karşılanmamış sayan ekoller vardır. Bu bölüm teknik değerlendirmedir; evlilik ya da ilişki kararı değildir.";
/** ATL-B02: Kalaprakasika Rasi'li (adaptör -2) kayıtların yöntem metni; eski kayıtlar DASHAKOOT_METHOD_TEXT ile kalır. */
export const DASHAKOOT_METHOD_TEXT_KP =
  "Yöntem: Güney Hint On Porutham (Dashakoot / Dasa Porutham). On kriterin (Dina, Gana, Mahendra, Stree Deergha, Yoni, Rasi, Rasyadhipati, Vasya, Rajju, Vedha) her biri ağırlıksız olarak karşılandı / karşılanmadı biçiminde değerlendirilir; toplam 10 üzerinden karşılanan kriter sayısıdır. Rajju ve Vedha gelenekte toplamdan bağımsız kesin kısıt sayılır. Bu sistem Ashtakoot Gun Milan'dan (36 puan) ayrıdır; iki sistemin puanları birbirine çevrilmez ve toplanmaz. Rasi kriteri Kalaprakasika'ya (N. P. Subramania Iyer çevirisi, Bölüm XIII, s. 73–74) göre yerel olarak hesaplanır: gelinin Ay burcundan damadınkine sayımda 2.–6. konumlar karşılanmaz; 7. ve 8.–12. konumlar karşılanır. 2. konum damadın burcu çift burçsa, 6. konum kaynağın listelediği altı burç çiftinden biriyse karşılanır. Aynı burç (1. sayım) için kaynak hüküm vermediğinden Rasi sonucu ve toplam belirsiz gösterilir. Kaynağın genel istisnası (s. 76) puana katılmaz, ayrıca belirtilir. Kaynak aynı istisnayı Rajju, Vedha ve Gana için de verir; bu kriterler hesap servisinin sonucuyla aynen gösterilir. Diğer dokuz kriter hesap servisinin sonucudur; ekoller arasında Gana eşleşmeleri ve Mahendra yönü farklılık gösterebilir. Bu bölüm teknik değerlendirmedir; evlilik ya da ilişki kararı değildir.";
export const dashakootMethodText = (t: { rasiClassic?: unknown }) => (t.rasiClassic ? DASHAKOOT_METHOD_TEXT_KP : DASHAKOOT_METHOD_TEXT);
export const DASHAKOOT_DIRECTION_TEXT =
  "Hesaplama rolleri: geleneksel porutham tablosunda 1. rol damat, 2. rol gelin olarak okunur; Dina, Mahendra, Stree Deergha, Rasi ve Vasya gelinden damada sayıldığından rol sırasına duyarlıdır. Rolleri uzman seçer; sistem cinsiyet tahmini yapmaz. Rol değişirse sonuç farklı olabilir.";
export const PAPASAMYAM_METHOD_TEXT =
  "Yöntem: Papasamyam, iki haritadaki malefik (papa) katkıların karşılaştırmasıdır. Mars, Satürn, Güneş ve Rahu'nun Lagna'dan, Ay'dan ve Venüs'ten sayılan 1., 2., 4., 7., 8. ve 12. bütün-burç evlerinde bulunması katkı sayılır; ağırlıklar Lagna 1, Ay 0,5, Venüs 0,25'tir (eşit ağırlık kullanan ekoller de vardır). Karşılaştırma kuralı: 2. rolün (geleneksel: gelin) toplamı 1. rolün (geleneksel: damat) toplamından büyük olmamalıdır. Toplamlar tek bir kişi hakkında değerlendirme değildir; yalnız karşılaştırma anlamlıdır. Bu bölüm teknik değerlendirmedir; evlilik ya da ilişki kararı değildir.";

/** Nakshatra yazım biçimleri (sağlayıcı / klasik) → kanonik kimlik. Tanınmayan → null (ham gösterilir, sayım yapılmaz). */
const NAK_ALIASES: Readonly<Record<string, NakshatraId>> = {
  aswini: "ashwini",
  ashvini: "ashwini",
  krttika: "krittika",
  kritika: "krittika",
  mrigashirsha: "mrigashira",
  mrigasira: "mrigashira",
  arudra: "ardra",
  aridra: "ardra",
  pushyami: "pushya",
  pooya: "pushya",
  aslesha: "ashlesha",
  ashlesa: "ashlesha",
  makha: "magha",
  purvaphalguni: "purva_phalguni",
  uttaraphalguni: "uttara_phalguni",
  chithra: "chitra",
  svati: "swati",
  visakha: "vishakha",
  vishaka: "vishakha",
  anuradha: "anuradha",
  jyeshta: "jyeshtha",
  jyestha: "jyeshtha",
  moola: "mula",
  purvashadha: "purva_ashadha",
  purvaashadha: "purva_ashadha",
  uttarashadha: "uttara_ashadha",
  uttaraashadha: "uttara_ashadha",
  sravana: "shravana",
  dhanishtha: "dhanishta",
  shatabhishak: "shatabhisha",
  satabhisha: "shatabhisha",
  purvabhadrapada: "purva_bhadrapada",
  purvabhadra: "purva_bhadrapada",
  uttarabhadrapada: "uttara_bhadrapada",
  uttarabhadra: "uttara_bhadrapada",
};
export function nakshatraIdOf(v: string, list: readonly string[]): NakshatraId | null {
  const flat = v.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z]/g, "");
  const hit = list.find((n) => n.replace(/_/g, "") === flat);
  return (hit as NakshatraId | undefined) ?? NAK_ALIASES[flat] ?? null;
}
/** Gelinin (2. rol) sırasından damadınkine (1. rol) dahil sayım. */
export const countFrom = (from: number, to: number, n: number) => ((to - from + n) % n) + 1;

export type { SignId };
