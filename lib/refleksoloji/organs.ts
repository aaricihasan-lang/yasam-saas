/**
 * Refleksoloji protokol "organs" alanı için TEK ortak ayrıştırıcı.
 *
 * Editör organ listesini `" | "` (pipe) ile birleştirerek DB'ye yazar
 * (bkz. useProtocolRegistry.protocolFields). Eski/import kayıtlar `,` (virgül)
 * ile de gelebilir. Word raporu zaten `[|,]` ile bölerdi; UI (liste/detay/harita)
 * ise yalnız virgülle bölüyordu → çoklu-organ tek organ sanılıyordu (SEV-1).
 *
 * Bu yardımcı tüm yüzeylerde (liste kartı, detay, ayak haritası eşleşmesi ve Word
 * raporu) kullanılır; böylece parser sapması (drift) bir daha oluşmaz.
 *
 * Davranış:
 *   - `|` VEYA `,` ile ayrılmış değerleri böler (ardışık ayraçlar tek kabul edilir).
 *   - Baş/son boşlukları temizler, boşları atar.
 *   - Türkçe-duyarsız tekilleştirme yapar (aynı organ iki kez sayılmaz),
 *     ilk görülen orijinal yazım korunur.
 */
export function parseOrganList(organs: string | null | undefined): string[] {
  if (!organs || !organs.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of organs.split(/[|,]+/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
