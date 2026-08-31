// FAZ 4 — Kader Sayısı (AŞAMA 2 §17). Kaynak: kitap 2. seviye.
// Ad + soyad tüm harflerin canonical değeri → 1–9 / 11 / 22. 19 YOK, 33 YOK.
// KÖR ALIAS DEĞİL: aynı harf primitive'i + aynı ham total reuse edilir, FAKAT Kader'e özel reducer.
// (Mevcut İfade motoru {11,19,22,33} davranışını KORUR; burada değiştirilmez.)
// Golden: MİNA raw 19 → 1 ; başka Kader'de 11 korunur.
import { reduceKeepMaster11or22, sumNameLetterValues } from "../timing/reduce";
import type { ReducedResult } from "../timing/types";

export function destinyNumber(firstName: string, lastName: string): ReducedResult {
  const total = sumNameLetterValues(firstName, lastName);
  if (total === 0) return { value: 0, display: "-", steps: ["Geçerli harf bulunamadı."] };
  const value = reduceKeepMaster11or22(total);
  return {
    value,
    display: String(value),
    steps: [`Kader Sayısı: isim harfleri toplamı ${total} → ${value}`],
  };
}
