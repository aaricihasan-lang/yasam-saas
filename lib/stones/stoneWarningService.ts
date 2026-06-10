import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";
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
 * Kullanıcı tenant'ı ve Doğaltaş kütüphanesi (ADMIN_LIBRARY_TENANT_ID) birlikte taranır.
 * Türkçe normalize eşleşme kullanılır: gümüş / gumus / GÜMÜŞ aynı taşı bulur.
 * Eşleşen taşlardan yalnızca uyarısı olanları (warning_text veya warning_tags) döndürür.
 *
 * Eşleşmeyen taş adları sessizce atlanır; hata fırlatılmaz.
 */
export async function checkStoneWarnings(
  stoneNames: string[],
  tenantId: string
): Promise<StoneWarningResult[]> {
  if (stoneNames.length === 0 || !tenantId) return [];

  const tenantIds = tenantId === ADMIN_LIBRARY_TENANT_ID
    ? [tenantId]
    : [tenantId, ADMIN_LIBRARY_TENANT_ID];

  const { data, error } = await supabase
    .from("stones")
    .select("stone_name, warning_text, warning_tags")
    .in("tenant_id", tenantIds);

  if (error || !data || data.length === 0) return [];

  const results: StoneWarningResult[] = [];

  for (const inputName of stoneNames) {
    const normalizedInput = normalizeTr(inputName.trim());

    const match = data.find(
      (row) => normalizeTr((row.stone_name ?? "").trim()) === normalizedInput
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
