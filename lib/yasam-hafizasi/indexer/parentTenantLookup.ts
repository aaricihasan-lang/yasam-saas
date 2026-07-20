/**
 * Yaşam Hafızası™ — Parent Tenant Lookup Map-Adapter (Sprint 2 / S2.08).
 *
 * SAF (pure) ADAPTER. Join-mode tenant çözümünde `resolveTenant`'ın enjekte
 * beklediği `ParentTenantLookup`'ı, önceden getirilmiş bir okunur MAP üzerinden
 * IO'suz sağlar:
 *   makeParentTenantLookup(map) → ParentTenantLookup
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / DB sorgusu / fetch / process.env / IO / API / UI / network.
 *   Map'i DOLDURAN toplu SELECT (parent → tenant) S2.09 runner IO katmanına aittir;
 *   bu adapter yalnız hazır map'ten O(1) okur.
 *
 * KANONİK KURALLAR (S2.08):
 *   - `ParentTenantLookup` / `ParentTenantLookupInput` / `ParentTenantLookupResult`
 *     sözleşmeleri YENİDEN TANIMLANMAZ; `tenantResolve.ts`'ten type import edilir
 *     (tek doğru kaynak; paralel tip üretme YOK). AD-004 korunur.
 *   - Map cache'in kendisidir: parent başına tek giriş → tekrar sorgu yok.
 *   - Anahtar, tablo + id'yi bir NUL ayıracıyla ayırır; ayıraç kaynağa literal NUL
 *     bayt gömmeden `String.fromCharCode(0)` ile üretilir. Tablo adı ve UUID NUL
 *     içermediğinden birleştirme çakışması injektif değildir.
 *   - Key map'te yoksa `{ found: false }` (fail-closed); adapter EXCEPTION FIRLATMAZ.
 *   - `parentTenantColumn` sahiplik kolonunun map'i S2.09'da doldururken kullanılır;
 *     hazır map (tablo,id)→tenant ile anahtarlandığından bu adapter onu tüketmez.
 */

import type {
  ParentTenantLookup,
  ParentTenantLookupInput,
  ParentTenantLookupResult,
} from "./tenantResolve";

/** Tablo + id anahtar ayıracı: NUL (kaynağa literal bayt gömülmez). */
const KEY_SEP = String.fromCharCode(0);

/**
 * Önceden getirilmiş parent → tenant eşlemesi.
 * Anahtar: `parentTenantMapKey(parentTable, parentId)`.
 * Değer: tenant_id (UUID) veya `null` (shared; parent sahipsiz).
 */
export type ParentTenantMap = ReadonlyMap<string, string | null>;

/**
 * Map anahtarı: parent tablo + parent id (NUL ayıraçlı, çakışmasız).
 * Değerler ham taşınır; normalize/coercion yapılmaz.
 */
export function parentTenantMapKey(parentTable: string, parentId: string): string {
  return `${parentTable}${KEY_SEP}${parentId}`;
}

/**
 * Hazır map'ten okuyan saf `ParentTenantLookup` üretir.
 *
 * @param map Önceden (S2.09 IO'da) doldurulmuş parent → tenant eşlemesi.
 * @returns Enjekte edilebilir saf lookup; map'te giriş yoksa `{ found: false }`.
 */
export function makeParentTenantLookup(map: ParentTenantMap): ParentTenantLookup {
  return (input: ParentTenantLookupInput): ParentTenantLookupResult => {
    const key = parentTenantMapKey(input.parentTable, input.parentId);
    const value = map.get(key);
    // ParentTenantMap değer tipi string | null'dır; undefined YALNIZ "giriş yok"
    // demektir (fail-closed → not-found). null ise geçerli shared sahiplik.
    if (value === undefined) {
      return { found: false };
    }
    return { found: true, tenantId: value };
  };
}
