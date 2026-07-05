import { NumerolojiResult, reduceKeepMaster } from "./ortak";

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

  // Tam indirge; 11/22/33 master sayıları korunur (19 hariç — klasik Hayat Yolu kuralı).
  const simplified = reduceKeepMaster(total);
  const isMaster = simplified === 11 || simplified === 22 || simplified === 33;
  steps.push(
    simplified === total
      ? `Sadeleştirme: ${total} (tek hane / master)`
      : `Sadeleştirme: ${total} → ${simplified}${isMaster ? " (master sayı korundu)" : ""}`,
  );

  const display = simplified === total ? String(total) : `${total}/${simplified}`;
  steps.push(`Hayat Yolu / DM Kodu: ${display}`);
  return { display, key: display, steps };
}
