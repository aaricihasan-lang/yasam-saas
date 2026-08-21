/**
 * lib/dogaltas/validation.ts — Doğaltaş yazma-tarafı tip doğrulaması (F-004) +
 * UUID format guard (F-019). dogaltas-scoped; global auth/refactor DEĞİL.
 *
 * Amaç: API'nin structured alanları YANLIŞ tiple kabul etmesini engellemek
 * (chakras/warning_tags string ya da object olarak yazılırsa rapor builder'ı
 * tenant-genelinde 500 verebiliyor — bkz. reportSafe.ts / F-011). Frontend'in bugün
 * ürettiği geçerli payload'lar (string[] veya boş) KIRILMAZ; yalnız malformed yeni
 * veri 400 ile reddedilir. Sessiz coercion YOK.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC-4122 biçimli UUID mı? DB'ye gitmeden route [id] guard'ı için. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

export type FieldValidation = { ok: true } | { ok: false; error: string };

/**
 * string[] beklenen alan (chakras, warning_tags). Kabul: yok / null / string[].
 * Red: string, number, object, ya da array-içi non-string eleman.
 */
export function validateStringArrayField(
  label: string,
  value: unknown,
): FieldValidation {
  if (value === undefined || value === null) return { ok: true };
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} alanı liste (dizi) olmalıdır.` };
  }
  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false, error: `${label} alanındaki her öğe metin olmalıdır.` };
    }
  }
  return { ok: true };
}

/**
 * assignments: düz nesne beklenir (ör. { Mineraller: string[][], Burçlar: [...] }).
 * Kabul: yok / null / plain object. Red: string, number, boolean, array.
 * NOT: nesne İÇİNDEKİ oran/yapı doğrulaması validateMineralAssignments'a aittir;
 * burada yalnız üst-seviye tip zorlanır.
 */
export function validateAssignmentsField(value: unknown): FieldValidation {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Atamalar (assignments) alanı bir nesne olmalıdır." };
  }
  return { ok: true };
}

/**
 * Stone POST/PATCH structured alan doğrulaması. Yalnız body'de MEVCUT alanları
 * kontrol eder (PATCH kısmi güncellemeyi bozmaz). İlk hata döner.
 */
export function validateStoneStructuredFields(
  body: Record<string, unknown>,
): FieldValidation {
  if ("chakras" in body) {
    const r = validateStringArrayField("Çakralar", body.chakras);
    if (!r.ok) return r;
  }
  if ("warning_tags" in body) {
    const r = validateStringArrayField("Uyarı etiketleri", body.warning_tags);
    if (!r.ok) return r;
  }
  if ("assignments" in body) {
    const r = validateAssignmentsField(body.assignments);
    if (!r.ok) return r;
  }
  return { ok: true };
}
