// Atlas yeni teknikler (2026-10-22) — Vedik eşleştirme (Ashtakoot Gun Milan), Manglik ve Sade Sati İSTEK GÖVDELERİ (SAF).
//
// Mevcut Vedik gövde üreticisi (vedicBirthBody) AYNEN kullanılır: doğum ofseti her zaman açıkça gönderilir (sağlayıcı
// varsayılanı 5.5 IST), ayanamsa gövdenin (önbellek anahtarının) parçasıdır. Mevcut tekniklerin gövdeleri DEĞİŞMEZ.

import { vedicBirthBody, type BirthPoint, type VedicAyanamsa } from "./requests";

/** /vedic-astrology/compatibility — person1 = analiz edilen kişi (A), person2 = karşı taraf (B); ayanamsa üst düzeyde. */
export function vedicCompatibilityBody(a: BirthPoint, b: BirthPoint, ayanamsa: VedicAyanamsa) {
  const strip = (x: ReturnType<typeof vedicBirthBody>) => ({ date: x.date, time: x.time, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone });
  return { person1: strip(vedicBirthBody(a, ayanamsa)), person2: strip(vedicBirthBody(b, ayanamsa)), ayanamsa };
}

/** /vedic-astrology/dosha/manglik ve /vedic-astrology/dosha/sadhesati — tek kişilik Vedik doğum gövdesi (aynen). */
export function vedicDoshaBody(b: BirthPoint, ayanamsa: VedicAyanamsa) {
  return vedicBirthBody(b, ayanamsa);
}
