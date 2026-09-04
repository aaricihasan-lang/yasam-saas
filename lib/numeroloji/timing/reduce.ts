// FAZ 4 — method-specific reduction politikaları (AŞAMA 2 §2 LOCKED).
// Locked FAZ1/2 motorlarının reducer'ları DEĞİŞTİRİLMEZ; bunlar yeni motorlara özeldir.
import { reduce1To9, sumDigits, CHAKRA_LETTER_MAP, turkishUpper } from "../ortak";

export { reduce1To9 };

/**
 * Bu canonical eğitim standardında master yalnız 11 ve 22'dir (19 ve 33 KORUNMAZ).
 * Zincir 11 veya 22'ye ulaşırsa orada durur; aksi halde tek haneye iner.
 * Örn: 19→10→1, 38→11, 6+5=11, MİNA 19→1.
 */
export function reduceKeepMaster11or22(n: number): number {
  let current = Math.abs(n);
  while (current > 9) {
    if (current === 11 || current === 22) return current;
    current = sumDigits(current);
  }
  return current;
}

/** display: master (11/22) ise iki-haneli, değilse tek hane. */
export function masterDisplay(value: number): string {
  return String(value);
}

/**
 * Ad + soyad içindeki TÜM harflerin canonical harf değeri toplamı (ham total).
 * CHAKRA_LETTER_MAP canonical primitive'i reuse edilir — yeni alfabe kopyalanmaz.
 */
export function sumNameLetterValues(firstName: string, lastName: string): number {
  const full = `${firstName ?? ""} ${lastName ?? ""}`;
  let total = 0;
  for (const ch of Array.from(turkishUpper(full))) {
    const v = CHAKRA_LETTER_MAP[ch];
    if (v) total += v;
  }
  return total;
}
