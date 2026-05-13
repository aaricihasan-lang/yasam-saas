import { NumerolojiResult, sumDigits } from "./ortak";

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

  const simplified = sumDigits(total);
  steps.push(`Sadeleştirme: ${total} → ${simplified}`);

  const display = total >= 10 ? `${total}/${simplified}` : String(total);
  steps.push(`Hayat Yolu / DM Kodu: ${display}`);
  return { display, key: display, steps };
}
