// Astroloji — Aşama 3 Roxy İSTEK GÖVDESİ üreticileri (SAF). Önbellek anahtarı bu gövdelerden türetilir;
// golden doğrulama script'i de AYNI fonksiyonları kullanır (gerçek çağrı = ürünün göndereceği gövde).
//
// Saat dilimi: IANA yerine ONDALIK SAAT gönderilir (DST belirsizliği Yaşam tarafında çözülür).
// Doğum saati bilinmiyorsa sağlayıcı sözleşmesi gereği 12:00:00 gider; saat-bağımlı alanlar görünümde
// maskelenir (bkz. view/techniqueView). Kişi adı/kimliği sağlayıcıya GÖNDERİLMEZ.

import type { HouseSystem, NodeType } from "../../model/western";

export type BirthPoint = {
  birthDate: string;
  birthTime: string | null;
  utcOffsetSeconds: number;
  latitude: number;
  longitude: number;
};

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const tzHours = (sec: number) => r6(sec / 3600);

export function birthBody(b: BirthPoint) {
  return { date: b.birthDate, time: b.birthTime ?? "12:00:00", latitude: r6(b.latitude), longitude: r6(b.longitude), timezone: tzHours(b.utcOffsetSeconds) };
}

/** /astrology/transits — transit anı UTC olarak (timezone 0). */
export function transitBody(b: BirthPoint, atUtc: { date: string; time: string }, nodeType: NodeType) {
  return { date: atUtc.date, time: atUtc.time, timezone: 0, nodeType, natalChart: birthBody(b) };
}

/** /forecast/transits — tek parça (en fazla 90 gün). */
export function forecastBody(b: BirthPoint, startDate: string, endDate: string) {
  const bb = birthBody(b);
  return { birthData: { date: bb.date, time: bb.time, timezone: bb.timezone, latitude: bb.latitude, longitude: bb.longitude }, startDate, endDate, minSignificance: 0 };
}

/** /astrology/progressions ve /astrology/solar-arc */
export function targetDateBody(b: BirthPoint, targetDate: string, nodeType: NodeType) {
  return { ...birthBody(b), nodeType, targetDate };
}

/** /astrology/solar-return — dönüş haritası DOĞUM YERİ için (relocation bu aşamada yok). */
/**
 * Aşama 4.1: isteğe bağlı DÖNÜŞ KONUMU (relocated return). Sağlayıcı sözleşmesi: latitude/longitude =
 * dönüş haritasının gözlem yeri (ASC/evler); timezone = doğum tarih/saatini ANA çeviren ofset (natal
 * Güneş/Ay) + çıktı biçimi → HER ZAMAN DOĞUM ofseti gönderilir (hedefin saat dilimi doğum anını kaydırırdı).
 * Konum verilmezse gövde Aşama 3 ile BİREBİR aynı (önbellek anahtarı korunur).
 */
export function solarReturnBody(b: BirthPoint, returnYear: number, houseSystem: HouseSystem, at?: GeoPoint | null) {
  const bb = birthBody(b);
  const lat = at ? r6(at.latitude) : bb.latitude;
  const lon = at ? r6(at.longitude) : bb.longitude;
  return { birthDate: bb.date, birthTime: bb.time, returnYear, latitude: lat, longitude: lon, timezone: bb.timezone, houseSystem };
}

/** /astrology/lunar-return — returnDate: istenen dönüşe yakın (birkaç gün) tarih. */
export function lunarReturnBody(b: BirthPoint, returnDate: string, houseSystem: HouseSystem, at?: GeoPoint | null) {
  const bb = birthBody(b);
  const lat = at ? r6(at.latitude) : bb.latitude;
  const lon = at ? r6(at.longitude) : bb.longitude;
  return { birthDate: bb.date, birthTime: bb.time, returnDate, latitude: lat, longitude: lon, timezone: bb.timezone, houseSystem };
}

/** /astrology/synastry ve /astrology/composite-chart — person1 = profil, person2 = karşı taraf. */
export function pairBody(a: BirthPoint, b: BirthPoint, nodeType: NodeType, houseSystem: HouseSystem) {
  return { person1: { ...birthBody(a), nodeType }, person2: { ...birthBody(b), nodeType }, houseSystem };
}

// ─── Tarih yardımcıları (UTC, saf) ───────────────────────────────────────────

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const FORECAST_CHUNK_DAYS = 90; // sağlayıcı sınırı: startDate + en fazla 90 gün
export const FORECAST_MAX_DAYS = 366;

/** [start, start+days-1] aralığını ≤90 günlük, sabit (deterministik) parçalara böler. */
export function forecastChunks(startDate: string, days: number): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (let off = 0; off < days; off += FORECAST_CHUNK_DAYS) {
    const len = Math.min(FORECAST_CHUNK_DAYS, days - off);
    out.push({ start: addDays(startDate, off), end: addDays(startDate, off + len - 1) });
  }
  return out;
}

// ─── Aşama 4: konum teknikleri ───────────────────────────────────────────────
// Doğum ANI her zaman profilin doğum anıdır (doğum tarihi + saati + DOĞUM YERİ ofseti, ondalık saat).
// Hedef/referans konumun saat dilimi hesaba GİRMEZ (yalnız gösterim) → yanlış tz ile sessiz hesap olmaz.

export type GeoPoint = { latitude: number; longitude: number };

/** Ek gövdeler (düğüm/Kiron/Lilith). Sabit → önbellek tek varyant. GOLDEN 2026-10-07: belge "north-node = ortalama" der,
 * gerçek yanıt GERÇEK (true) düğümü verir (yankı nodeType=true; RA farkı 0.000°, ortalamadan 0.76°). */
export const LOCATION_EXTRA_BODIES = "north-node,chiron,lilith";

/** /astrology/astrocartography — çizgiler yalnız doğum ANINA bağlıdır (konum yalnız yankı). */
export function astrocartographyBody(b: BirthPoint) {
  return birthBody(b);
}

/** /astrology/relocation-chart — doğum anı + doğum yeri SABİT, yalnız yeni konum değişir. */
export function relocationBody(b: BirthPoint, target: GeoPoint, houseSystem: HouseSystem) {
  const bb = birthBody(b);
  return {
    date: bb.date,
    time: bb.time,
    timezone: bb.timezone,
    birthLatitude: bb.latitude,
    birthLongitude: bb.longitude,
    relocationLatitude: r6(target.latitude),
    relocationLongitude: r6(target.longitude),
    houseSystem,
  };
}

/** /astrology/local-space — doğum ANI sabit; gözlem (referans) noktası = doğum yeri veya seçilen konum. */
export function localSpaceBody(b: BirthPoint, reference: GeoPoint) {
  const bb = birthBody(b);
  return { date: bb.date, time: bb.time, timezone: bb.timezone, latitude: r6(reference.latitude), longitude: r6(reference.longitude) };
}

// ─── Aşama 5: Vedik / Jyotish ────────────────────────────────────────────────
// Roxy Vedik uçlarında timezone verilmezse 5.5 (IST) VARSAYILIR → doğum ofseti HER ZAMAN açıkça gönderilir.
// Ayanamsa gövdenin parçasıdır (önbellek anahtarı ayanamsa ile ayrışır). custom ayanamsa bu sürümde kapalı.

export const VEDIC_AYANAMSAS = ["lahiri", "raman", "kp-newcomb", "kp-old"] as const;
export type VedicAyanamsa = (typeof VEDIC_AYANAMSAS)[number];

/** Doğum tabanlı Vedik gövde (birth-chart, divisional-chart, dasha, yoga, ashtakavarga, shadbala…). */
export function vedicBirthBody(b: BirthPoint, ayanamsa: VedicAyanamsa) {
  const bb = birthBody(b);
  return { date: bb.date, time: bb.time, latitude: bb.latitude, longitude: bb.longitude, timezone: bb.timezone, ayanamsa };
}

/**
 * Aşama 5.1A — /vedic-astrology/transit (Gochar). Uç TEK bir timezone alanı alır ve hem doğum hem transit
 * saatini o ofsetle yorumlar → transit ANI (UTC) doğum ofsetinde yerel saate çevrilerek gönderilir
 * (ör. 09:00 UTC, doğum +3 → 12:00:00). Ayanamsa alanı YOK (sidereal = Lahiri sabit); coordinateSystem
 * hep "sidereal" (tropikal sonucu Vedik diye etiketlememek için "tropical" ASLA gönderilmez).
 */
export function vedicTransitLocal(b: BirthPoint, atUtcMinute: string): { date: string; time: string } {
  const ms = Date.parse(`${atUtcMinute}:00Z`) + b.utcOffsetSeconds * 1000;
  const iso = new Date(ms).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}
export function vedicTransitBody(b: BirthPoint, atUtcMinute: string) {
  const bb = birthBody(b);
  const t = vedicTransitLocal(b, atUtcMinute);
  return { birthDate: bb.date, birthTime: bb.time, transitDate: t.date, transitTime: t.time, latitude: bb.latitude, longitude: bb.longitude, timezone: bb.timezone, coordinateSystem: "sidereal" };
}
