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
 *   - PROFESSIONAL / MAIN / SHARED Yaşam Hafızası: bu kimliğe bağlı kayıtlar mesleki/paylaşımlı
 *     indexe ALINAMAZ, shared/null'a ÇEVRİLEMEZ, hiçbir kullanıcı retrieval'ında GÖRÜNEMEZ.
 *     Bu yasak `isSyntheticTenantId` ile korunur (professional writer fail-fast reddeder).
 *   - Global/shared admin kütüphanesi ürün modeli YOKTUR.
 *   - TEK DAR İSTİSNA (professional yasağını GEVŞETMEZ): PRIVATE CLIENT MEMORY. Admin kendi
 *     danışan-scoped (tenant+client ownership) gerçek kayıtlarını Danışan Hafızası'nda arayabilir.
 *     Bu istisna BURADA DEĞİL, client processor katmanında explicit ve dar uygulanır
 *     (`lib/yasam-hafizasi/client/clientEventProcessor.ts` → isPrivateClientMemoryAllowedTenant);
 *     `isSyntheticTenantId` semantiği ve `SYNTHETIC_TENANT_IDS` listesi DEĞİŞMEZ.
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
