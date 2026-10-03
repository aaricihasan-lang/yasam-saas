import { CHAKRA_LETTER_MAP, NumerolojiResult, sumDigits, turkishUpper } from "./ortak";

/**
 * İfade Sayısı = Kader (İfade) sayısı.
 *
 * METODOLOJİ KAYNAĞI:
 *   - kitap 2. seviye PDF s.171 "Kader (İfade) sayısı": tüm harfler tek tek yazılır, değerler
 *     tek haneye ulaşana kadar toplanır; "Sadece üstat sayılar olan 11 ve 22 tek haneye
 *     indirilmez". Örnek MİNA = 19 → 10 → 1 (19 KORUNMAZ, s.170).
 *   - kitap 1. seviye PDF s.34 "İFADE SAYISI HESAPLAMA": NURAN IŞIK → 23=5, 21=3 → 8
 *     (master hakkında bir şey söylemez; kitap 1 PDF s.7: değişmez sayılar 11 ve 22'dir).
 *   - 11/19/22/33'ün sadeleştirilmemesi kuralı kitap 1 PDF s.16'da yalnız ANA KULVAR
 *     başlığı altındadır; İfade'ye uygulanmaz.
 * NOT (NUM-PDF-IFADE): önceki davranış 19 ve 33'ü de koruyordu (ör. MUSTAFA KEMAL → 33)
 * ve aynı raporda Kader Sayısı (6) ile çelişiyordu; artık İfade = Kader.
 */
const IFADE_MASTERS = new Set([11, 22]);

export function calcIfadeSayisi(firstName: string, lastName: string): NumerolojiResult {
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const digits: number[] = [];

  for (const ch of Array.from(turkishUpper(fullName))) {
    if (!/[A-ZÇĞİÖŞÜ]/.test(ch)) continue;
    const val = CHAKRA_LETTER_MAP[ch];
    if (val) digits.push(val);
  }

  const steps: string[] = [];
  if (digits.length === 0) {
    return { display: "-", key: "", steps: ["İfade Sayısı için isim/soyisimde geçerli harf bulunamadı."] };
  }

  const total = digits.reduce((a, b) => a + b, 0);
  steps.push(`Tüm harflerin sayısal karşılığı: ${digits.join(" + ")} = ${total}`);

  let current = total;
  while (true) {
    if (IFADE_MASTERS.has(current)) {
      steps.push(`Üstat sayı (${current}) → tek haneye indirilmedi (kitap 2, s.171).`);
      return { display: String(current), key: String(current), steps };
    }

    if (current < 10) {
      steps.push(`Tek haneye düşüldü: ${current}`);
      return { display: String(current), key: String(current), steps };
    }

    const next = sumDigits(current);
    steps.push(`Sadeleştirme: ${current} → ${next}`);
    current = next;
  }
}
