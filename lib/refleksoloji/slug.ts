/**
 * Türkçe-güvenli ASCII slug (dosya adı / okunur kimlik). Tek kaynak: eskiden
 * protokol kayıt slug'ı `toLocaleLowerCase("tr")` + NFD ile "ı" harfini DÜŞÜRÜYORDU
 * ("Işık" → "sk"); protokol raporu rotası ise doğru eşlemeyi kullanıyordu.
 */
const TR_MAP: Record<string, string> = {
  ı: "i",
  İ: "i",
  I: "i",
  ğ: "g",
  Ğ: "g",
  ü: "u",
  Ü: "u",
  ş: "s",
  Ş: "s",
  ö: "o",
  Ö: "o",
  ç: "c",
  Ç: "c",
};

export function slugifyTr(text: string, fallback = ""): string {
  const s = String(text ?? "")
    .trim()
    .replace(/[ıİIğĞüÜşŞöÖçÇ]/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || fallback;
}
