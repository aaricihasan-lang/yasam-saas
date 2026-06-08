import { supabase } from "@/lib/supabase";

export type StoneWarningResult = {
  /** Veritabanındaki stone_name değeri */
  stoneName: string;
  /** Doğaltaş modülündeki uyarı metni */
  warningText: string | null;
  /** Doğaltaş modülündeki uyarı etiketleri */
  warningTags: string[] | null;
};

/**
 * Virgülle veya satır sonu ile ayrılmış taş adı girişini diziye çevirir.
 * Boşlukları temizler, boş değerleri atar.
 *
 * Örnekler:
 *   "Ametist, Labradorit, Sitrin"  → ["Ametist", "Labradorit", "Sitrin"]
 *   "Ametist\nLabradorit\nSitrin" → ["Ametist", "Labradorit", "Sitrin"]
 */
export function parseStoneNames(input: string): string[] {
  if (!input || !input.trim()) return [];
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Verilen taş adlarını `stones` tablosunda arar.
 * Büyük/küçük harf farkını gözetmez.
 * Eşleşen taşlardan yalnızca uyarısı olanları (warning_text veya warning_tags) döndürür.
 *
 * Uyarı kriteri:
 * - warning_text: trim sonrası boş değilse uyarı var.
 * - warning_tags: boş dizi değilse uyarı var.
 *
 * Eşleşmeyen taş adları sessizce atlanır; hata fırlatılmaz.
 */
export async function checkStoneWarnings(
  stoneNames: string[],
  tenantId: string
): Promise<StoneWarningResult[]> {
  if (stoneNames.length === 0 || !tenantId) return [];

  const { data, error } = await supabase
    .from("stones")
    .select("stone_name, warning_text, warning_tags")
    .eq("tenant_id", tenantId);

  if (error || !data || data.length === 0) return [];

  const results: StoneWarningResult[] = [];

  for (const inputName of stoneNames) {
    const normalized = inputName.toLowerCase().trim();

    const match = data.find(
      (row) => (row.stone_name ?? "").toLowerCase().trim() === normalized
    );

    if (!match) continue;

    const hasText = (match.warning_text ?? "").trim().length > 0;
    const hasTags =
      Array.isArray(match.warning_tags) && match.warning_tags.length > 0;

    if (!hasText && !hasTags) continue;

    results.push({
      stoneName: match.stone_name as string,
      warningText: hasText ? (match.warning_text as string) : null,
      warningTags: hasTags ? (match.warning_tags as string[]) : null,
    });
  }

  return results;
}
