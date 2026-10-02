import { NumerolojiResult, sumDigits } from "./ortak";

/**
 * Hayat Yolu / DM (Dan Millman) kodu.
 *
 * METODOLOJİ KAYNAĞI (kitap 1. seviye):
 *   - PDF s.58 (basılı s.57) "HAYAT YOLU / DM KODU": doğum tarihindeki tüm rakamlar ayrı ayrı
 *     toplanır, bulunan değer "bir kez sadeleştirilmek suretiyle" sonuca varılır.
 *     Örnek 18.02.1987 → 1+8+0+2+1+9+8+7 = 36 → 3+6 = 9 → "36/9".
 *   - PDF s.83–153 DM kod kataloğu: 19/10, 28/10, 37/10, 46/10, 29/11, 38/11, 47/11, 20/2,
 *     39/12, 48/12, 30/3, 40/4, 22/4, 33/6, … → tek indirgeme; 10/11/12 nihai değerdir,
 *     22 ve 33 DM'de korunmaz (22/4, 33/6).
 *   - PDF s.51 (basılı s.50) "KRİSTAL ÇOCUK": rakamlar toplamı 11 ve altındaysa DM tek
 *     değerdir (1…11). Örnek 02.03.2000 → 7 → "DM: 7".
 *
 * NOT (NUM-PDF-HY): 2026-07 tarihli "tam indirge + 11/22/33 koru" davranışı (37 → "37/1",
 * 22 → "22") kitaba aykırıydı; bu dosya kitabın tek-indirgeme kuralına döndürüldü.
 */
export const HAYAT_YOLU_METHOD_SOURCE = "kitap 1. seviye PDF s.51, s.58, s.83–153";

export function calcHayatYolu(birthDate: string): NumerolojiResult {
  const digitChars = Array.from(birthDate || "").filter((ch) => /\d/.test(ch));
  const steps: string[] = [];

  if (digitChars.length === 0) {
    return {
      display: "-",
      key: "",
      steps: ["Geçerli bir doğum tarihi girilmedi; Hayat Yolu hesaplanamadı."],
    };
  }

  const digits = digitChars.map(Number);
  const total = digits.reduce((a, b) => a + b, 0);
  steps.push(`Doğum tarihindeki rakamlar: ${digits.join(" + ")} = ${total}`);

  if (total <= 11) {
    // Kristal çocuk: tek dönemli DM (kitap 1, PDF s.51).
    steps.push(`Toplam 11 veya altında → DM tek değerdir (kristal çocuk): ${total}`);
    const display = String(total);
    steps.push(`Hayat Yolu / DM Kodu: ${display}`);
    return { display, key: display, steps };
  }

  // Bir kez sadeleştir (kitap 1, PDF s.58). 10/11/12 nihai değer olarak kalır.
  const once = sumDigits(total);
  steps.push(`Bir kez sadeleştirme: ${total} → ${String(total).split("").join(" + ")} = ${once}`);
  const display = `${total}/${once}`;
  steps.push(`Hayat Yolu / DM Kodu: ${display}`);
  return { display, key: display, steps };
}

/**
 * Hayat Yolu kodunun son sayısının (nihai hedef çakrası, kitap 1 PDF s.58) tek-hane kökü.
 * Bilgi bankası "genel not" geri düşüşü ve yaş/zirve gibi kök gerektiren yerler için.
 */
export function hayatYoluRootFromDisplay(display: string): number | null {
  const last = String(display ?? "").split("/").pop()?.trim() ?? "";
  const n = Number(last);
  if (!Number.isFinite(n) || n <= 0) return null;
  let cur = n;
  while (cur > 9) cur = sumDigits(cur);
  return cur;
}
