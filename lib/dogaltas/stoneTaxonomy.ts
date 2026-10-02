/**
 * lib/dogaltas/stoneTaxonomy.ts — Doğaltaş çakra / uyarı etiketi TEK KAYNAK (P1-01).
 *
 * Sorun: oluşturma (dogaltas-kayit) ve düzenleme (dogaltas-listesi/[id]) ekranları farklı
 * seçenek listeleri kullanıyordu ("Kalp Çakra" ↔ "Kalp Çakrası", "Hamilelik" ↔ "Hamileler").
 * Prod verisinde iki yazım karışık; editör oluşturmada seçilen değeri göstermiyor ve
 * kaldırılamıyordu.
 *
 * Kurallar:
 *   - Seçenek listeleri YALNIZ buradan gelir (create + edit + sunucu aynı liste).
 *   - Kanonik yazım = düzenleme ekranının (ve Biyoenerji/rapor modüllerinin) kullandığı yazım:
 *     "Kalp Çakrası", "Boğaz Çakrası"; uyarıda "Hamilelik".
 *   - Eşdeğerlik "anahtar" üzerinden: TR-küçük harf + boşluk sadeleştirme; çakrada sondaki
 *     " çakra" / " çakrası" eki atılır ("Kalp Çakra" ≡ "Kalp Çakrası" ≡ "kalp"); uyarıda
 *     küçük ve açık bir eşanlam tablosu ("Hamileler" ≡ "Hamilelik", "Uyku" ≡ "Uyku / Huzursuzluk").
 *   - MEVCUT VERİ YENİDEN YAZILMAZ: kayıtlı eski yazım, kullanıcı o seçeneğe dokunmadıkça
 *     aynen korunur (migration yok, sessiz dönüşüm yok). Listede karşılığı olmayan eski
 *     değerler editörde "kayıtlı eski değer" olarak gösterilir ve kaldırılabilir.
 *   - Aynı kavram iki farklı string ile KAYDEDİLEMEZ: seçim anahtar bazında tekilleşir.
 *
 * Çakra arama/filtre (stoneConditionSearch, liste çipleri "Kalp") alt-dize eşleştirmesi
 * yaptığı için her iki yazımla da çalışmaya devam eder; güvenlik uyarıları (stone-warnings,
 * stoneHasWarning) etiketin DEĞERİNE değil dolu olup olmamasına bakar → eski kayıtlar etkilenmez.
 */

export type StoneTaxonomyKind = "chakra" | "warning";

export const STONE_CHAKRA_OPTIONS = [
  "Kök Çakra",
  "Sakral Çakra",
  "Solar Pleksus",
  "Kalp Çakrası",
  "Boğaz Çakrası",
  "Üçüncü Göz",
  "Taç Çakra",
] as const;

export const STONE_WARNING_OPTIONS = [
  "Genel Uyarı",
  "Hamilelik",
  "Çocuklar",
  "Tansiyon",
  "Kalp Rahatsızlığı",
  "Epilepsi",
  "Alerji",
  "Böbrek",
  "Uyku / Huzursuzluk",
  "Psikolojik Hassasiyet",
  "Enerji Hassasiyeti",
  "Uzman Kontrolü",
] as const;

/** Uyarı eşanlamları: anahtar → kanonik değer (yalnız açık, birebir eşdeğerler). */
const WARNING_ALIASES: Record<string, string> = {
  hamileler: "Hamilelik",
  uyku: "Uyku / Huzursuzluk",
};

function baseKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

/** İki değerin aynı kavram olup olmadığını belirleyen anahtar. */
export function taxonomyKey(kind: StoneTaxonomyKind, value: unknown): string {
  const k = baseKey(value);
  if (!k) return "";
  if (kind === "chakra") {
    return k.replace(/\s+çakra(sı)?$/u, "").trim() || k;
  }
  const alias = WARNING_ALIASES[k];
  return alias ? baseKey(alias) : k;
}

export function taxonomyOptions(kind: StoneTaxonomyKind): readonly string[] {
  return kind === "chakra" ? STONE_CHAKRA_OPTIONS : STONE_WARNING_OPTIONS;
}

/** Bir değerin kanonik seçenek karşılığı (yoksa null → listede olmayan eski/serbest değer). */
export function canonicalTaxonomyValue(kind: StoneTaxonomyKind, value: unknown): string | null {
  const key = taxonomyKey(kind, value);
  if (!key) return null;
  return taxonomyOptions(kind).find((opt) => taxonomyKey(kind, opt) === key) ?? null;
}

/** Kayıtlı değerler bu seçeneği (herhangi bir yazımla) içeriyor mu? */
export function isTaxonomyOptionSelected(
  kind: StoneTaxonomyKind,
  stored: readonly string[],
  option: string,
): boolean {
  const key = taxonomyKey(kind, option);
  return stored.some((v) => taxonomyKey(kind, v) === key);
}

/** Kanonik listede karşılığı OLMAYAN kayıtlı değerler (editörde "eski değer" olarak gösterilir). */
export function legacyTaxonomyValues(kind: StoneTaxonomyKind, stored: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of stored) {
    const s = String(v ?? "").trim();
    if (!s || canonicalTaxonomyValue(kind, s) !== null) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Kanonik bir seçeneği aç/kapa:
 *   - Seçiliyse (herhangi bir yazımla) → o kavramın TÜM yazımları kaldırılır.
 *   - Seçili değilse → kanonik yazım eklenir.
 * Diğer değerler (başka kavramlar, eski değerler) sırası ve yazımıyla korunur.
 */
export function toggleTaxonomyOption(
  kind: StoneTaxonomyKind,
  stored: readonly string[],
  option: string,
): string[] {
  const key = taxonomyKey(kind, option);
  if (isTaxonomyOptionSelected(kind, stored, option)) {
    return stored.filter((v) => taxonomyKey(kind, v) !== key);
  }
  const canonical = canonicalTaxonomyValue(kind, option) ?? option;
  return [...stored, canonical];
}

/** Listede olmayan eski değeri birebir (yazım korunarak) aç/kapa. */
export function toggleLegacyTaxonomyValue(stored: readonly string[], value: string): string[] {
  return stored.includes(value) ? stored.filter((v) => v !== value) : [...stored, value];
}

/**
 * Sunucu yazma kapısı: aynı kavramın birden fazla yazımını TEK değere indirger (ilk görülen
 * yazım korunur → mevcut eski değer yeniden yazılmaz). `canonicalize` true ise (yeni kayıt)
 * bilinen eşdeğerler kanonik yazıma çevrilir. Listede olmayan serbest değerler korunur.
 */
export function normalizeTaxonomyValues(
  kind: StoneTaxonomyKind,
  values: readonly string[],
  opts: { canonicalize?: boolean } = {},
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    const key = taxonomyKey(kind, v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(opts.canonicalize ? canonicalTaxonomyValue(kind, v) ?? v : v);
  }
  return out;
}
