/**
 * Kupa protokol etiketleri (WT6) — kullanıcıya görünen ad + açıklama + virgüllü giriş ayrıştırma.
 * "Etiketler (virgülle)" başlığı ne işe yaradığını anlatmıyordu.
 */
export const TAGS_LABEL = "Arama ve Sınıflandırma Etiketleri";
export const TAGS_HELP =
  "Bu protokolü daha sonra ararken veya gruplarken kullanılacak kelimeleri virgülle ayırarak yazın.";
export const TAGS_PLACEHOLDER = "baş ağrısı, migren, kupa, ense";

/** "baş ağrısı, migren,, ense " → ["baş ağrısı","migren","ense"] (boşluk kırpılır, boşlar ve tekrarlar atılır). */
export function parseTagsInput(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const key = t.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
