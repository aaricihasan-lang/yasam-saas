/**
 * Beslenme — porsiyon GÖSTERİM normalizasyonu (SAF; web + Word ORTAK contract).
 *
 * AMAÇ: Türkçe profesyonel beslenme planında porsiyon metnini sadeleştirmek.
 *   - USDA kaynaklı "su bardağı" gibi ithal/mekanik ölçüler kullanıcıya GÖSTERİLMEZ;
 *     bunun yerine snapshot'taki authoritative GRAM değeri esas alınır (gram fallback = null).
 *   - Doğal kullanıcı porsiyonları ("1 dilim", "1 orta muz", "1 porsiyon (28 g)") korunur ve
 *     "quantity × 1 <birim>" mekanik gösterimi doğal biçime indirgenir (ör. 2 × 1 dilim → "2 dilim").
 *
 * KRİTİK: Bu YALNIZ sunum katmanıdır. RAW snapshot (portion_label_snapshot / quantity / grams),
 *   canonical nutrition_food_portions, USDA kaynak değerleri ve enerji/makro hesabı DEĞİŞMEZ.
 *   Web (MealCard) ve Word (planDocxBuilder) aynı fonksiyonu kullanır → semantic drift YOK.
 *
 * SAF: IO/DOM/React yok; hem client hem server (server-only DEĞİL) import edebilir.
 */

export type PortionDisplayInput = {
  quantity: number | null | undefined;
  portionLabel: string | null | undefined;
};

/** "su bardağı" (ve olası ascii/case varyantları) — ithal/mekanik ölçü işareti. */
const CUP_MEASURE_RE = /su\s*barda[ğg][ıi]/i;

/** Doğal porsiyon miktarı (tam sayı → ondalıksız; ondalık → tr-TR, en çok 2 basamak). */
function formatQuantity(q: number): string {
  if (!Number.isFinite(q)) return "1";
  if (Number.isInteger(q)) return String(q);
  return q.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

/**
 * Doğal porsiyon metni döndürür (ör. "2 dilim", "1 orta muz", "1 porsiyon (28 g)")
 * ya da null. null → çağıran GRAM fallback kullanmalı.
 *
 * null dönen durumlar:
 *   - portion label yok/boş,
 *   - "su bardağı" gibi ithal/mekanik ölçü,
 *   - güvenle normalize edilemeyen hâl (qty≠1 ama etiket "1 <birim>" biçiminde değil).
 */
export function formatPortionLabel(input: PortionDisplayInput): string | null {
  const raw = (input.portionLabel ?? "").trim();
  if (!raw) return null;
  if (CUP_MEASURE_RE.test(raw)) return null; // ithal ölçü → gram fallback

  const q =
    input.quantity == null || !Number.isFinite(input.quantity) ? 1 : (input.quantity as number);

  // Etiket "1 <birim>" biçimindeyse: quantity ile doğal biçimde birleştir.
  //   qty=1, "1 dilim"          → "1 dilim"
  //   qty=2, "1 dilim"          → "2 dilim"
  //   qty=1, "1 porsiyon (28 g)"→ "1 porsiyon (28 g)"  (duplicate yok)
  const unitMatch = /^1\s+(.+)$/.exec(raw);
  if (unitMatch) return `${formatQuantity(q)} ${unitMatch[1].trim()}`;

  // "1 <birim>" değil: yalnız tek adet ise etiketi olduğu gibi göster (RAW anlam korunur).
  if (q === 1) return raw;

  // qty≠1 + güvenle normalize edilemiyor → RAW anlamı bozma, gram fallback.
  return null;
}
