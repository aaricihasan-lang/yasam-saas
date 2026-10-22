// Astroloji — KP Ruling Planets ZAMAN ARALIĞI TARAMASI istek gövdesi (SAF; 2026-10-22).
//
// /vedic-astrology/kp/ruling-planets-interval: başlangıç + bitiş (YEREL saat, tek ofset), adım (dk), gözlem yeri, KP ayanamsa, düğüm.
// Sağlayıcı aralık için TEK ofset kullanır → ofset gözlem yerinin pencere başlangıcındaki ofsetidir; pencere içinde ofset değişirse
// motor isteği hiç göndermez (service.ts). Doğum verisi GÖNDERİLMEZ (significator'lar her anın gökyüzü haritasından üretilir).

import type { KpAyanamsa, KpNodeType } from "./requests";

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** UTC dakika ("YYYY-MM-DDTHH:MM") + ofset (saat) → yerel "YYYY-MM-DDTHH:MM:SS". */
export function kpIntervalLocal(atUtcMinute: string, offsetHours: number, plusMinutes = 0): string {
  const ms = Date.parse(`${atUtcMinute}:00Z`) + Math.round(offsetHours * 60) * 60_000 + plusMinutes * 60_000;
  return new Date(ms).toISOString().slice(0, 19);
}

export function kpRulingIntervalBody(
  startUtcMinute: string,
  durationMinutes: number,
  intervalMinutes: number,
  place: { latitude: number; longitude: number },
  offsetHours: number,
  ayanamsa: KpAyanamsa,
  nodeType: KpNodeType,
) {
  return {
    startDatetime: kpIntervalLocal(startUtcMinute, offsetHours),
    endDatetime: kpIntervalLocal(startUtcMinute, offsetHours, durationMinutes),
    intervalMinutes,
    latitude: r6(place.latitude),
    longitude: r6(place.longitude),
    timezone: r6(offsetHours),
    ayanamsa,
    nodeType,
  };
}
