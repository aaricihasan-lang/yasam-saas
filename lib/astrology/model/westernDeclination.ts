// Astroloji — DEKLİNASYON PARALELLERİ (aylık) kanonik teknik modeli (SAF, istemci güvenli; 2026-10-22).
//
// Paralel: iki gök cismi gök ekvatorundan AYNI deklinasyonda (aynı yarımküre). Kontraparalel: eşit ve ZIT deklinasyon.
// Ekliptik boylam açılarından (kavuşum, kare …) AYRI bir matematiksel alandır: ekvator koordinatı (deklinasyon) ile ölçülür ve
// burç mesafesine bağlı değildir. Bu teknik GÖKYÜZÜ (mundane) takvimidir: iki transit gök cismi arasındaki temaslar; doğum verisi
// kullanılmaz, natal ↔ transit paraleller bu sürümün kapsamında DEĞİLDİR.
//
// Teknik katman yalnız kanonik kimlik + sayı taşır. Sağlayıcı bu uçta yorum metni VERMEZ (yorum katmanı yoktur).

import { BODY_IDS, type BodyId, type NodeType } from "./western";

export const DECLINATION_PARALLELS_TECHNICAL_SCHEMA = "astro.western.declination_parallels.v1" as const;

/** 13 gök cismi: Güneş, Merkür … Plüton, iki Ay düğümü, Kiron, Kara Ay Lilith. Ay KAPSAM DIŞI (aylık tam salınım). */
export const DECLINATION_BODIES = BODY_IDS.filter((b) => b !== "moon") as Exclude<BodyId, "moon">[];
export type DeclinationBody = (typeof DECLINATION_BODIES)[number];
export const isDeclinationBody = (v: unknown): v is DeclinationBody => typeof v === "string" && (DECLINATION_BODIES as readonly string[]).includes(v);

export const DECLINATION_CONTACT_TYPES = ["parallel", "contraparallel"] as const;
export type DeclinationContactType = (typeof DECLINATION_CONTACT_TYPES)[number];
export const DECLINATION_TYPE_LABELS: Record<DeclinationContactType, string> = { parallel: "Paralel", contraparallel: "Kontraparalel" };
export const DECLINATION_TYPE_GLYPHS: Record<DeclinationContactType, string> = { parallel: "∥", contraparallel: "⋕" };

/** Orb seçenekleri (derece). Orb yalnız kesinleşmeden önce dönen (tam olmayan) temasların dahil edilme sınırıdır. */
export const DECLINATION_ORB_OPTIONS = [1, 1.5, 2] as const;
export const DECLINATION_ORB_DEFAULT = 1.5;
export const isDeclinationOrb = (v: unknown): v is (typeof DECLINATION_ORB_OPTIONS)[number] => typeof v === "number" && (DECLINATION_ORB_OPTIONS as readonly number[]).includes(v);

/** Ay seçimi "YYYY-MM", yıl 1600–2600 (Atlas tarih sınırı; sağlayıcı sınırı 1551–2649). */
export function declinationMonthOk(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}$/.test(v)) return false;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  return y >= 1600 && y <= 2600 && m >= 1 && m <= 12;
}
/** Ayın UTC penceresi [başlangıç, bitiş) — "YYYY-MM-DDTHH:MMZ". */
export function monthWindowUtc(month: string): { startUtc: string; endUtc: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const end = m === 12 ? `${String(y + 1).padStart(4, "0")}-01` : `${month.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`;
  return { startUtc: `${month}-01T00:00Z`, endUtc: `${end}-01T00:00Z` };
}

export type DeclinationContact = {
  /** Kanonik sırada (BODY_IDS) birinci / ikinci gök cismi; deklinasyonlar onlarla birlikte. */
  a: DeclinationBody;
  b: DeclinationBody;
  type: DeclinationContactType;
  /** En yakın / kesinleşme anı (UTC, dakika) — "YYYY-MM-DDTHH:MMZ". */
  exactUtc: string;
  /** O andaki tam temastan uzaklık (derece). Ay içinde kesinleşen temasta ~0; kesinleşmeden dönen çiftte büyür. */
  orb: number;
  declinationA: number;
  declinationB: number;
};
export type DeclinationParallelsTechnical = {
  schema: typeof DECLINATION_PARALLELS_TECHNICAL_SCHEMA;
  /** Yer merkezli, görünür, tarihin ekvatoru (efemeris deklinasyonu). */
  frame: "geocentric_apparent_equator_of_date";
  nodeType: NodeType;
  month: string;
  orbLimit: number;
  window: { startUtc: string; endUtc: string };
  contacts: DeclinationContact[];
  summary: { total: number; parallel: number; contraparallel: number };
};

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const declinationMonthLabel = (month: string) => (declinationMonthOk(month) ? `${TR_MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : month);

/** Deklinasyon gösterimi: "+2,9375°" / "−12,4183°" (Türkçe ondalık, gerçek eksi işareti). */
export const fmtDeclination = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(4).replace(".", ",")}°`;
export const fmtOrb = (v: number) => `${String(Math.round(v * 100) / 100).replace(".", ",")}°`;

/**
 * Ortalama ekliptik eğikliği ε (derece; IAU 2006, yüzyıl terimleri). YALNIZ türetilmiş gösterim: "sınır dışı" (out of bounds,
 * |δ| > ε) işareti. Sağlayıcı bu alanı vermez; Yaşam Sistemi sağlayıcının deklinasyon değerinden türetir (yeni hesap motoru değildir).
 */
export function meanObliquityDeg(utcIso: string): number {
  const ms = Date.parse(/Z$/.test(utcIso) ? utcIso : `${utcIso}Z`);
  const T = (ms / 86_400_000 + 2440587.5 - 2451545.0) / 36525;
  const arcsec = 84381.406 - 46.836769 * T - 0.0001831 * T * T + 0.0020034 * T * T * T;
  return arcsec / 3600;
}
export const isOutOfBounds = (dec: number, utcIso: string) => Math.abs(dec) > meanObliquityDeg(utcIso);

/**
 * Tam kesinleşme sınırı (derece). Orb bu değerden büyükse olay "en yakın yaklaşım"dır: çift seçilen ayda tam paralel /
 * kontraparalel olmaz, liste yalnız farkın en küçük olduğu anı verir (ör. orb 1,42°). YALNIZ gösterim ayrımıdır; veri değişmez.
 */
export const DECLINATION_EXACT_ORB_MAX = 0.01;
export const isExactContact = (orb: number) => orb <= DECLINATION_EXACT_ORB_MAX;
/** Durum etiketi (ekran + rapor): "Tam kesinleşme" veya "En yakın yaklaşım (tam kesinleşme yok) — orb X°". */
export const declinationStatusLabel = (orb: number) => (isExactContact(orb) ? "Tam kesinleşme" : `En yakın yaklaşım (tam kesinleşme yok) — orb ${fmtOrb(orb)}`);
/** Sütun başlığı: an hem kesinleşme hem en yakın yaklaşım anı olabilir. */
export const DECLINATION_TIME_HEADER = "Kesinleşme / en yakın an (UTC)";
/** Ayrım açıklaması (ekran + rapor). */
export const DECLINATION_EXACT_NOTE =
  "Tam kesinleşme: orb ≤ 0,01°, iki gök cismi o anda tam paralel / kontraparaleldir. En yakın yaklaşım: çift seçilen ayda tam temasa ulaşmaz; satırdaki an, deklinasyon farkının orb içinde en küçük olduğu andır ve orb o andaki kalan farktır.";
export const declinationExactCounts = (contacts: readonly { orb: number }[]) => {
  const exact = contacts.filter((c) => isExactContact(c.orb)).length;
  return { exact, nearest: contacts.length - exact };
};

/** Ekran + rapor ortak yöntem metni (sağlayıcı adı yok). */
export const DECLINATION_METHOD_TEXT =
  "Yöntem: deklinasyon paralelleri. Deklinasyon, gök cisminin gök ekvatorunun kuzeyinde (+) veya güneyinde (−) kalan açısal uzaklığıdır (yer merkezli, görünür konum, tarihin ekvatoru). Paralel: iki gök cismi aynı deklinasyonda; kontraparalel: eşit büyüklükte, zıt yönde deklinasyon. Bu temaslar ekliptik boylam açılarından (kavuşum, kare, karşıt …) ayrı bir ölçüdür ve burç mesafesine bağlı değildir. Liste, seçilen ayda (UTC) kesinleşen veya orb içinde en yakın noktaya ulaşan temasları kronolojik sırayla verir; orb, o andaki tam temastan uzaklıktır.";
/** Kapsam / sınırlar (ekran + rapor). */
export const DECLINATION_SCOPE_TEXT =
  "Kapsam: Güneş, Merkür–Plüton, Kuzey ve Güney Ay Düğümü, Kiron ve Kara Ay Lilith (13 gök cismi). Ay dahil değildir (deklinasyonu her ay tüm aralığı dolaşır). Bu çizelge gökyüzü takvimidir: iki transit gök cismi arasındaki temasları gösterir; doğum verisi kullanılmaz, natal noktalarla paraleller bu sürümde yoktur. Ay sınırı UTC'dir; yerel saat yalnız gösterimdir. Sonuçlar teknik hesaplamadır; yorum ve hüküm içermez.";
/** Sınır dışı (OOB) açıklaması (türetilmiş gösterim). */
export const DECLINATION_OOB_NOTE =
  "OOB (sınır dışı): |deklinasyon| ortalama ekliptik eğikliğinden (yaklaşık 23,44°) büyük. Bu işaret sağlayıcı verisinden Yaşam Sistemi tarafından türetilir.";
