// Astroloji — Lunar return için DÖNÜŞ SEÇİMİ yardımcısı (SAF; mevcut astronomy-engine).
//
// Roxy /astrology/lunar-return "istenen dönüşe birkaç gün yakın bir returnDate" ister ve o tarihe EN YAKIN
// dönüşü hesaplar (OpenAPI: returnDate = "Approximate date near the desired lunar return"; golden
// 2026-10-07: returnDate 2026-10-25 → lunarReturnDate 2026-10-25T14:43 (+3)). Dönüşler ~27.3 gün arayla
// olduğundan bir takvim ayında 1 veya 2 dönüş olabilir. Burada o aydaki TÜM dönüşler sıralanır
// (sequence 1, 2); uzman hangisini istediğini seçer → seçilen dönüşün UTC günü sağlayıcıya gider.
// Her seçilen dönüş = 1 istek; seçilmeyen dönüş için istek YAPILMAZ.
//
// Kesin dönüş anını ve haritayı SAĞLAYICI hesaplar (bu ikinci bir hesap motoru değildir; yalnız tarih
// seçimi + sağlayıcı yanıtının doğru dönüşe ait olduğunun denetimi). Deterministiktir.
// GERİYE UYUM: dönüş başına gönderilen gün, Aşama 3'teki algoritmayla AYNI kalır (2 saatlik taramada
// işaret değişiminden sonraki ilk adımın UTC günü) → mevcut önbellek anahtarları (sequence 1) değişmez.

import * as Astronomy from "astronomy-engine";

function moonLon(date: Date): number {
  return Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, Astronomy.MakeTime(date), true)).elon;
}

/** Doğum UTC anındaki natal Ay boylamı (yaklaşık; yalnız tarih seçimi için). */
export function natalMoonLongitude(birthUtcIso: string): number {
  return moonLon(new Date(birthUtcIso));
}

export type LunarReturnCandidate = {
  /** Ay içindeki sıra (1 = ilk dönüş, 2 = ikinci). */
  sequence: number;
  /** Sağlayıcıya gönderilen gün (YYYY-MM-DD, UTC) — önbellek anahtarına girer. */
  requestDate: string;
  /** Yaklaşık kesin dönüş anı (UTC, dakika) — yalnız gösterim ve sağlayıcı yanıtı denetimi için. */
  approxUtc: string;
};

const STEP = 2 * 3600_000;

/** month: "YYYY-MM" → o UTC ayı içindeki tüm lunar return'ler (zaman sırasıyla). */
export function lunarReturnsInMonth(natalMoonLon: number, month: string): LunarReturnCandidate[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const diff = (t: number) => ((moonLon(new Date(t)) - natalMoonLon + 540) % 360) - 180;
  const out: LunarReturnCandidate[] = [];
  let prevT = start.getTime();
  let prev = diff(prevT);
  for (let t = prevT + STEP; t <= end.getTime(); t += STEP) {
    const cur = diff(t);
    if (prev < 0 && cur >= 0 && cur - prev < 90) {
      // İkiye bölme: kesin geçiş anı (yalnız gösterim/denetim; istek günü değişmez).
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 30 && hi - lo > 30_000; i++) {
        const mid = (lo + hi) / 2;
        if (diff(mid) < 0) lo = mid;
        else hi = mid;
      }
      const exact = new Date(Math.round(hi / 60_000) * 60_000);
      // Ay sınırındaki geçişte ayın dışına taşan an sayılmaz.
      if (exact.getTime() >= start.getTime() && exact.getTime() < end.getTime()) {
        out.push({ sequence: out.length + 1, requestDate: new Date(t).toISOString().slice(0, 10), approxUtc: exact.toISOString().slice(0, 16) });
      }
    }
    prev = cur;
    prevT = t;
  }
  return out;
}

/** Geriye uyum: o aydaki İLK dönüşün istek günü (Aşama 3 golden script'i bunu kullanır). */
export function lunarReturnApproxDate(natalMoonLon: number, month: string): string | null {
  return lunarReturnsInMonth(natalMoonLon, month)[0]?.requestDate ?? null;
}
