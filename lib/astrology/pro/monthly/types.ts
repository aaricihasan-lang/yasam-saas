// Gökyüzü Atlası — AYLIK EFEMERİS (Batı tropikal + Vedik sideral): ortak tipler (SAF; istemci de import edebilir).
//
// Kaynak: hesaplama altyapımızın iki aylık ucu (sunucu tarafı; ayın TÜMÜ tek istekte). Günlük satır anı 12:00 UTC'dir (sağlayıcı
// tanımı; 2026-10-31 ve 2026-11-24 ölçümleri). Satır yalnız sağlayıcının GERÇEKTEN verdiği alanları taşır: ekliptik boylam + retro
// bayrağı (burç ve burç içi derece boylamdan türetilir ve sağlayıcının kendi burç/derece alanıyla birebir denetlenir).
// Tropikal (Batı) ve sideral (Vedik) sonuçlar AYRI türlerdir; birbirine dönüştürülmez, aynı tabloda karıştırılmaz.

export type MonthlyKind = "western" | "vedic";

/** Batı aylık ucunun 14 cismi (sağlayıcı sırası korunur). */
export const WESTERN_MONTHLY_BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "north_node", "south_node", "chiron", "lilith"] as const;
/** Vedik aylık ucunun 9 grahası (Navagraha; sağlayıcı sırası korunur). */
export const VEDIC_MONTHLY_BODIES = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"] as const;

export type WesternMonthlyBody = (typeof WESTERN_MONTHLY_BODIES)[number];
export type VedicMonthlyBody = (typeof VEDIC_MONTHLY_BODIES)[number];
export type MonthlyBody = WesternMonthlyBody | VedicMonthlyBody;

export type MonthlyPosition = {
  body: MonthlyBody;
  /** Ekliptik boylam (derece, [0,360)); sağlayıcının verdiği değer DEĞİŞTİRİLMEDEN saklanır (4 ondalık = ≈0,36″ adım). */
  lon: number;
  /** Sağlayıcının retro bayrağı (iki günü karşılaştırarak türetilmez). */
  retro: boolean;
};

export type MonthlyDay = { date: string; positions: MonthlyPosition[] };

/** Bağımsız kontrol: aynı 12:00 UTC anında Yaşam Sistemi yerel JPL DE440 motoruyla karşılaştırma (yalnız sunucu üretir). */
export type MonthlyCrossCheck = {
  status: "pass" | "fail" | "unavailable";
  /** Karşılaştırılan değer sayısı (gün × cisim). */
  compared: number;
  /** En büyük mutlak boylam farkı (yay saniyesi) ve yeri. */
  maxAbsArcsec: number;
  maxAt: { date: string; body: MonthlyBody } | null;
  /** Retro bayrağı uyuşmazlığı (istasyon eşiği altındaki günler hariç) ve istasyon nedeniyle karşılaştırılmayan gün sayısı. */
  retroMismatches: number;
  retroStationSkipped: number;
  /** Karşılaştırılan ve karşılaştırılamayan (bağımsız yerel motoru olmayan) cisimler. */
  checkedBodies: MonthlyBody[];
  uncheckedBodies: MonthlyBody[];
  method: string;
  reason?: string;
};

export type MonthlyEphemeris = {
  kind: MonthlyKind;
  year: number;
  month: number;
  zodiac: "tropical" | "sidereal";
  /** Vedik: "lahiri" (sağlayıcı aylık ucunun TEK ve sabit ayanamsası). Batı: null. */
  ayanamsa: "lahiri" | null;
  /** Rahu/Ketu ya da Kuzey/Güney Ay Düğümü yöntemi (sağlayıcı yanıtıyla ölçülerek doğrulandı). */
  nodeMethod: "true" | "mean";
  /** Hesaplama anı ve zaman referansı. */
  timeOfDay: "12:00";
  timeReference: "UTC";
  bodies: MonthlyBody[];
  /** Bu ay için sağlayıcının hiç vermediği isteğe bağlı cisimler (ör. Kiron, 2600-12). Tablo bunları göstermez, açıklar. */
  missingBodies: MonthlyBody[];
  days: MonthlyDay[];
  source: { id: "provider"; endpoint: string; adapterVersion: string; providerApiVersion: string; fetchedAt: string };
  crossCheck: MonthlyCrossCheck;
};

export type MonthlyRequest = { kind: MonthlyKind; year: number; month: number };

export type MonthlyError = {
  code: "INVALID_INPUT" | "OUT_OF_RANGE" | "PROVIDER_DISABLED" | "PROVIDER_FAILED" | "PROVIDER_INCONSISTENT" | "CROSSCHECK_FAILED" | "CROSSCHECK_UNAVAILABLE" | "NOT_CACHED" | "RATE_LIMITED";
  field?: string;
  error: string;
};
