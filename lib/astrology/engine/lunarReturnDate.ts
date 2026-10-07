// Astroloji — Lunar return için YAKLAŞIK TARİH yardımcısı (SAF; mevcut astronomy-engine).
//
// Roxy /astrology/lunar-return "istenen dönüşe birkaç gün yakın bir returnDate" ister. Uzman yalnız ay seçer;
// burada o aydaki İLK dönüşün UTC gününü bulup sağlayıcıya veririz. Kesin dönüş anını ve haritayı
// SAĞLAYICI hesaplar (bu bir ikinci hesap motoru değildir; yalnız tarih seçimi). Deterministiktir →
// önbellek anahtarına giren returnDate aynı ay için hep aynıdır.

import * as Astronomy from "astronomy-engine";

function moonLon(date: Date): number {
  return Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, Astronomy.MakeTime(date), true)).elon;
}

/** Doğum UTC anındaki natal Ay boylamı (yaklaşık; yalnız tarih seçimi için). */
export function natalMoonLongitude(birthUtcIso: string): number {
  return moonLon(new Date(birthUtcIso));
}

/** month: "YYYY-MM" → o ay içinde Ay'ın natal boylamına döndüğü ilk günün tarihi (YYYY-MM-DD, UTC). */
export function lunarReturnApproxDate(natalMoonLon: number, month: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  // Ay ~13°/gün; 2 saatlik adımlarla işaret değişimini ara (ayda 1–2 dönüş).
  const diff = (d: Date) => ((moonLon(d) - natalMoonLon + 540) % 360) - 180;
  let prevT = start.getTime();
  let prev = diff(start);
  for (let t = prevT + 2 * 3600_000; t <= end.getTime(); t += 2 * 3600_000) {
    const cur = diff(new Date(t));
    if (prev < 0 && cur >= 0 && cur - prev < 90) {
      return new Date(t).toISOString().slice(0, 10);
    }
    prev = cur;
    prevT = t;
  }
  return null;
}
