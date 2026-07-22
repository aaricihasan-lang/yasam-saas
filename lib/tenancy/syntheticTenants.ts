/**
 * Yaşam SaaS — Sentetik Tenant Ownership Policy (S2.19-BF / BF-1B-FIX).
 *
 * TEK KAYNAK: Sentetik (gerçek kullanıcıya ait OLMAYAN) tenant kimlikleri yalnız
 * burada tanımlanır. Auth katmanı (`lib/auth/sessionTenant.ts`) ve Yaşam Hafızası™
 * indexer'ı bu modülü kullanır; UUID başka dosyada YENİDEN TANIMLANMAZ.
 *
 * BAĞLAYICI ÜRÜN KURALI (BF-1B):
 *   - `ADMIN_LIBRARY_TENANT_ID` gerçek kullanıcı veya gerçek tenant DEĞİLDİR;
 *     yalnız seed/import/template namespace'idir.
 *   - Bu kimliğe bağlı kayıtlar Yaşam Hafızası indexine ALINAMAZ, shared/null'a
 *     ÇEVRİLEMEZ, hiçbir kullanıcı retrieval'ında GÖRÜNEMEZ.
 *   - Global/shared admin kütüphanesi ürün modeli YOKTUR.
 *
 * SAFLIK SINIRI:
 *   - Bu modülün HİÇBİR import'u yoktur; client ve server tarafında güvenle
 *     import edilebilir. Secret / runtime env / IO içermez.
 *   - Karşılaştırma AÇIK ve deterministik exact-match'tir; trim/lowercase gibi
 *     gizli normalizasyon YAPILMAZ (belirsiz kimlik sentetik SAYILMAZ; onun
 *     fail-closed değerlendirmesi çağıran katmanların sözleşmesine aittir).
 */

/** Admin kütüphane / toplu import varsayılan tenant (yalnızca seed/import kaynağı). */
export const ADMIN_LIBRARY_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

/**
 * Bilinen tüm sentetik tenant kimlikleri (readonly). Yeni bir sentetik namespace
 * eklenirse YALNIZ bu listeye eklenir; tüketen katmanlar otomatik kapsar.
 */
export const SYNTHETIC_TENANT_IDS: readonly string[] = [ADMIN_LIBRARY_TENANT_ID];

/**
 * Verilen tenant kimliği sentetik mi?
 *   - `null` (shared referans) → false (shared sentetik DEĞİLDİR; NULL/shared
 *     anlamı bu modülce DEĞİŞTİRİLMEZ).
 *   - Gerçek kullanıcı tenant UUID'si → false.
 *   - `ADMIN_LIBRARY_TENANT_ID` (birebir eşitlik) → true.
 */
export function isSyntheticTenantId(tenantId: string | null): boolean {
  if (tenantId === null) return false;
  return SYNTHETIC_TENANT_IDS.includes(tenantId);
}
