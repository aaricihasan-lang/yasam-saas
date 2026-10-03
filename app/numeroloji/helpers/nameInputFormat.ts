// FAZ 6 / FINAL UAT ISSUE #3+#4 — Ad/Soyad giriş normalizasyonu (presentation-only).
//
// KURAL (kanıtlanmış davranış):
//   • Boşluk numerolojik bir HARF DEĞİLDİR ama isim/soyisim PARÇA SINIRIDIR.
//   • Baştaki boşluk trimlenir; iç boşluk dizileri tek boşluğa indirgenir.
//   • Kelimeler ASLA birleştirilmez ("Hasan Ali" → "HasanAli" YASAK).
//   • Yazım sırasında SONDAKİ TEK BOŞLUK KORUNUR ki kullanıcı bir sonraki
//     isim/soyisim parçasına geçebilsin (aksi halde boşluk anında silinip
//     "ARICI YILMAZ" → "ARICIYILMAZ" olarak birleşiyordu — ISSUE #4).
//
// Motor tokenizasyonu (splitNameParts) zaten /\s+/ ile parçalıyor; bu helper
// yalnız giriş katmanının boşlukları KORUMASINI garanti eder.

/** İç whitespace dizilerini (space/tab/newline) tek boşluğa indirger. */
export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ");
}

/**
 * Tek kelimeyi "Baş harf büyük, kalanı küçük" (tr-TR) yapar.
 *
 * AŞAMA 1 P3 (ISMAIL → "Ismaıl"): TAMAMI BÜYÜK yazılmış ve Türkçe'ye özgü harf (Ç Ğ İ Ö Ş Ü)
 * içermeyen bir kelimede "I" harfinin noktalı mı noktasız mı kastedildiği BİLİNEMEZ
 * (ISMAIL → İsmail/Ismail? ILGIN → Ilgın?). Bu durumda kelime TAHMİN EDİLMEDEN olduğu gibi
 * bırakılır. Numerolojik değer etkilenmez (kitap 1: I ve İ ikisi de 9).
 */
export function titleCaseTurkishWord(word: string): string {
  const hasLower = word !== word.toLocaleUpperCase("tr-TR");
  const hasTurkishSpecific = /[ÇĞİÖŞÜ]/.test(word);
  if (!hasLower && word.includes("I") && !hasTurkishSpecific) return word;
  const lower = word.toLocaleLowerCase("tr-TR");
  return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
}

/** Ad: her kelime "Baş harf büyük, kalanı küçük" (tr-TR); sondaki tek boşluk korunur. */
export function formatFirstNameTurkish(value: string): string {
  const s = collapseSpaces(value.trimStart());
  if (!s) return "";
  const trailingSpace = s.endsWith(" ") ? " " : "";
  return (
    s
      .split(" ")
      .filter(Boolean)
      // Tireli parçaların her biri ayrıca baş harf büyük yazılır (Ayşe-Nur); hesap etkilenmez.
      .map((word) => word.split("-").map((part) => (part ? titleCaseTurkishWord(part) : part)).join("-"))
      .join(" ") + trailingSpace
  );
}

/** Soyad: her kelime tümü büyük (tr-TR); sondaki tek boşluk korunur (çoklu soyad). */
export function formatLastNameTurkish(value: string): string {
  const s = collapseSpaces(value.trimStart());
  if (!s) return "";
  const trailingSpace = s.endsWith(" ") ? " " : "";
  return (
    s
      .split(" ")
      .filter(Boolean)
      .map((word) => word.toLocaleUpperCase("tr-TR"))
      .join(" ") + trailingSpace
  );
}
