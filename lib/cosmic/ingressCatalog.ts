/**
 * lib/cosmic/ingressCatalog.ts — G5: gece yarısı sınırındaki burç giriş anları için DOĞRULANMIŞ
 * düzeltme kataloğu (lib/cosmic/eclipses.ts ECLIPSE_CATALOG ile aynı desen).
 *
 * Neden: astronomy-engine yavaş gezegenlerde (Satürn…Plüton) ~5–30″ boylam hatasına sahiptir;
 * bu, yavaş hareket (özellikle istasyon yakını) nedeniyle giriş ANINI 20 dk – birkaç saat kaydırabilir.
 * Motor ikili arama ile sınırı zaten dakika altında çözer; kalan fark efemeris modelinden gelir ve
 * kök bulma ile düzeltilemez. Giriş Türkiye gece yarısına yakınsa gösterilen GÜN 1 gün kayar.
 *
 * Katalog YALNIZ motorun TR gününü yanlış verdiği olayları içerir; her girdi NASA/JPL Horizons DE441
 * (görünür, yer merkezli, tarihin ekliptiği) ile çözülmüş ve Swiss Ephemeris ile çapraz doğrulanmıştır
 * (scripts/cosmic-2100/generate_ingress_catalog.py). Diğer tüm girişler motorun kendi hesabıdır.
 * Katalog bir doğruluk tablosu DEĞİL, motorun kanıtlanmış sınır hatalarının düzeltmesidir; tutarlılık
 * scripts/cosmic-longrange karşılaştırmasıyla korunur.
 */

export type IngressCatalogEntry = {
  planet: string;      // Türkçe gezegen adı (planets.ts / events.ts anahtarları)
  toSign: number;      // 0=Koç … 11=Balık (girilen burç)
  exactUtc: string;    // JPL DE441 sınır geçiş anı (ISO UTC; Swiss Ephemeris ile aynı TR günü doğrulanmış)
  source: string;
};

export const INGRESS_CATALOG: ReadonlyArray<IngressCatalogEntry> = [
  { planet: "Plüton", toSign: 10, exactUtc: "2024-11-19T20:38:36Z", source: "JPL Horizons DE441 (SWE 2024-11-19T20:38:57Z, Δ -0.4 dk) — Kova" },
  { planet: "Satürn", toSign: 4, exactUtc: "2035-05-11T20:44:45Z", source: "JPL Horizons DE441 (SWE 2035-05-11T20:44:42Z, Δ 0.1 dk) — Aslan" },
  { planet: "Uranüs", toSign: 8, exactUtc: "2065-10-28T21:02:25Z", source: "JPL Horizons DE441 (SWE 2065-10-28T21:05:04Z, Δ -2.7 dk) — Yay" },
  { planet: "Plüton", toSign: 0, exactUtc: "2066-06-17T15:21:02Z", source: "JPL Horizons DE441 (SWE 2066-06-17T15:24:10Z, Δ -3.1 dk) — Koç" },
  { planet: "Plüton", toSign: 11, exactUtc: "2066-07-11T22:06:54Z", source: "JPL Horizons DE441 (SWE 2066-07-11T21:57:37Z, Δ 9.3 dk) — Balık" },
  { planet: "Güneş", toSign: 2, exactUtc: "2075-05-20T21:00:30Z", source: "JPL Horizons DE441 (SWE 2075-05-20T21:00:19Z, Δ 0.2 dk) — İkizler" },
  { planet: "Güneş", toSign: 5, exactUtc: "2083-08-22T21:00:29Z", source: "JPL Horizons DE441 (SWE 2083-08-22T21:00:15Z, Δ 0.2 dk) — Başak" },
  { planet: "Satürn", toSign: 0, exactUtc: "2086-08-25T21:40:41Z", source: "JPL Horizons DE441 (SWE 2086-08-25T21:38:28Z, Δ 2.2 dk) — Koç" },
  { planet: "Plüton", toSign: 0, exactUtc: "2095-09-20T22:15:51Z", source: "JPL Horizons DE441 (SWE 2095-09-20T22:11:37Z, Δ 4.2 dk) — Koç" },
  { planet: "Satürn", toSign: 4, exactUtc: "2096-03-14T20:21:46Z", source: "JPL Horizons DE441 (SWE 2096-03-14T20:20:18Z, Δ 1.5 dk) — Aslan" },
];

// Motor hatası yavaş gezegende en fazla birkaç saat (ölçülen ≤ ~6 sa) → ±1 gün eşleştirme güvenli;
// aynı sınırın retro kaynaklı bir sonraki geçişi aylar sonradır (karışmaz).
const MATCH_WINDOW_MS = 86_400_000;

/**
 * Motorun bulduğu giriş anını (aeMs) katalogda eşleşen (aynı gezegen + girilen burç, ±1 gün)
 * doğrulanmış anla değiştirir; eşleşme yoksa aeMs'i aynen döner.
 */
export function refineIngressMs(planet: string, toSign: number, aeMs: number): number {
  for (const e of INGRESS_CATALOG) {
    if (e.planet !== planet || e.toSign !== toSign) continue;
    const t = Date.parse(e.exactUtc);
    if (Math.abs(t - aeMs) <= MATCH_WINDOW_MS) return t;
  }
  return aeMs;
}
