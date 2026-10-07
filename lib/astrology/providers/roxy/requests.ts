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
export function solarReturnBody(b: BirthPoint, returnYear: number, houseSystem: HouseSystem) {
  const bb = birthBody(b);
  return { birthDate: bb.date, birthTime: bb.time, returnYear, latitude: bb.latitude, longitude: bb.longitude, timezone: bb.timezone, houseSystem };
}

/** /astrology/lunar-return — returnDate: istenen dönüşe yakın (birkaç gün) tarih. */
export function lunarReturnBody(b: BirthPoint, returnDate: string, houseSystem: HouseSystem) {
  const bb = birthBody(b);
  return { birthDate: bb.date, birthTime: bb.time, returnDate, latitude: bb.latitude, longitude: bb.longitude, timezone: bb.timezone, houseSystem };
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
