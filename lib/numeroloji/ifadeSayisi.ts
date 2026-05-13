import { CHAKRA_LETTER_MAP, NumerolojiResult, SPECIAL_NUMBERS, sumDigits, turkishUpper } from "./ortak";

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
    if (SPECIAL_NUMBERS.has(current)) {
      steps.push(`Özel sayı oluştu (${current}) → tekrar sadeleştirilmedi.`);
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
