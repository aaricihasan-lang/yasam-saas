/**
 * Danışan Word raporları için SAF metin yardımcıları (FA-41).
 *
 * İlke: kullanıcının/uzmanın yazdığı ad, başlık ve içerik OTOMATİK olarak yeniden
 * biçimlendirilmez (title-case YOK — "McDonald", "BEYİN KANAMASI", "de Souza" aynen kalır).
 * Yalnız görünmez temizlik yapılır: baş/son boşluk kırpma + çoklu boşluğu teke indirme.
 * Sabit sistem kodları (ör. mizaç "sovdavi") ise etiket haritasıyla okunur hale getirilir.
 */

/** Trim + ardışık boşlukları teke indir. Harf/büyük-küçük harf DEĞİŞMEZ. */
export function tidyUserText(text: string | null | undefined): string {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

/** DY kayıt formundaki mizaç seçenekleri (messages/tr/clients.json → mizacOptions ile aynı). */
export const MIZAC_LABELS: Record<string, string> = {
  safra: "Safra",
  sovdavi: "Sovdavi",
  dem: "Dem",
  balgam: "Balgam",
};

/** Mizaç kodu → etiket. Bilinmeyen/serbest metin aynen (tidy) döner; boşsa fallback. */
export function mizacLabel(value: string | null | undefined, fallback = "Bilgi girilmemiş"): string {
  const t = tidyUserText(value);
  if (!t) return fallback;
  return MIZAC_LABELS[t.toLocaleLowerCase("tr-TR")] ?? t;
}
