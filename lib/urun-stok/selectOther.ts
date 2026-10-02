/**
 * Ürün & Stok — "Diğer" seçeneği için serbest metin yardımcıları (SAF; client + server + harness).
 *
 * Yalnız ürün türü / grup / ambalaj / malzeme gibi ETİKET alanlarında kullanılır.
 * Ölçü tipi / birim alanlarına (measureType, inputUnit, unit, sizeKind) UYGULANMAZ:
 * dönüşüm (toCanonical), kritik stok eşikleri ve satış RPC base_unit bu değerlere bağlıdır.
 *
 * Saklama modeli değişmez: kolon tek metin değeri tutar. "Diğer" seçilip metin yazılırsa o
 * metin saklanır; metin boşsa literal "Diğer" saklanır (eski kayıtlarla uyumlu).
 */

/** Serbest metin üst sınırı (istemci). */
export const OTHER_TEXT_MAX = 60;
/** Sunucu tarafı savunma sınırı (eski/harici istemciler için istemciden geniş). */
export const FREE_TEXT_SERVER_MAX = 80;

const lowerTr = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

/** Değer "Diğer" seçeneği mi? (tr-TR küçük harf: "Diğer" = "diğer" = "DİĞER") */
export function isOtherOption(value: string, otherLabel = "Diğer"): boolean {
  return lowerTr(value) === lowerTr(otherLabel);
}

/** Boşlukları sadeleştir + kırp + üst sınır. */
export function normalizeOtherText(custom: string, max = OTHER_TEXT_MAX): string {
  return String(custom ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/**
 * Kayıtlı değeri form durumuna böler.
 * - Listede (büyük/küçük harf duyarsız) varsa → o seçenek, custom "".
 * - Liste dışı değer → "Diğer" + o metin (düzenlemede değer kaybolmaz / yanlış görünmez).
 * - Boş değer → ilk seçenek.
 * - Listede "Diğer" yoksa liste dışı değer olduğu gibi döner (davranış değişmez).
 */
export function splitOtherValue(
  value: string | null | undefined,
  options: readonly string[],
  otherLabel = "Diğer",
): { select: string; custom: string } {
  const v = String(value ?? "").trim();
  if (!v) return { select: options[0] ?? "", custom: "" };
  const hit = options.find((o) => lowerTr(o) === lowerTr(v));
  if (hit !== undefined) return { select: hit, custom: "" };
  const other = options.find((o) => isOtherOption(o, otherLabel));
  if (other === undefined) return { select: v, custom: "" };
  return { select: other, custom: v };
}

/**
 * Form durumundan saklanacak değeri üretir.
 * - "Diğer" dışı seçim → seçim aynen.
 * - "Diğer" + metin → sadeleştirilmiş metin (≤ 60). Metin listedeki bir seçenekle aynıysa o seçenek.
 * - "Diğer" + boş metin → seçimin kendisi (literal "Diğer"; eski veri uyumlu).
 */
export function composeOtherValue(
  select: string,
  custom: string,
  options: readonly string[] = [],
  otherLabel = "Diğer",
): string {
  if (!isOtherOption(select, otherLabel)) return select;
  const text = normalizeOtherText(custom);
  if (!text) return select;
  const hit = options.find((o) => lowerTr(o) === lowerTr(text));
  return hit ?? text;
}

/**
 * Sunucu: verilen serbest metin alanlarını kırpar ve uzunluk sınırını uygular.
 * Yalnız string değerlere dokunur (diğer tipler / eksik alanlar olduğu gibi kalır).
 */
export function checkFreeTextFields(
  body: Record<string, unknown>,
  keys: readonly string[],
  max = FREE_TEXT_SERVER_MAX,
): { ok: true; body: Record<string, unknown> } | { ok: false; field: string } {
  const out: Record<string, unknown> = { ...body };
  for (const k of keys) {
    const v = out[k];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t.length > max) return { ok: false, field: k };
    out[k] = t;
  }
  return { ok: true, body: out };
}

export function freeTextTooLongMessage(max = FREE_TEXT_SERVER_MAX): string {
  return `Tür / grup / ambalaj / malzeme alanı en fazla ${max} karakter olabilir.`;
}
