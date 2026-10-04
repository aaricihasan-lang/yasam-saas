/**
 * Yaşam SaaS — Sentetik Tenant Ownership Policy (S2.19-BF / BF-1B-FIX → YH satış öncesi revizyonu).
 *
 * TEK KAYNAK: Sentetik (gerçek kullanıcıya ait OLMAYAN) tenant kimlikleri yalnız
 * burada tanımlanır. Auth katmanı (`lib/auth/sessionTenant.ts`) ve Yaşam Hafızası™
 * indexer'ı bu modülü kullanır; UUID başka dosyada YENİDEN TANIMLANMAZ.
 *
 * BAĞLAYICI ÜRÜN KURALI (2026-10-03 revizyonu):
 *   - `OWNER_TENANT_ID` platform sahibinin (owner admin + uzman) GERÇEK uzman tenant'ıdır.
 *     Production doğrulaması: bu tenant'a bağlı tek kullanıcı role=admin, admin_level=owner,
 *     aktif, demo değil. Owner'ın mesleki kayıtları diğer uzmanlarınki gibi YALNIZ kendi
 *     Mesleki Hafızasında aranır. Eski "seed/import namespace — kullanıcısı yok" varsayımı
 *     (BF-1B, 2026-07-22) production'da YANLIŞ çıktı ve kaldırıldı.
 *   - Admin rolü bir veri sahipliği türü DEĞİLDİR; ortak/merkezî mesleki kütüphane ürün
 *     modeli YOKTUR. Sahiplik = tenant_id.
 *   - `SYNTHETIC_TENANT_IDS` bugün BOŞTUR. Mekanizma (isSyntheticTenantId + indexer/writer
 *     dışlama kapıları) gelecekte GERÇEK bir sentetik namespace (kullanıcısız seed/template
 *     tenant'ı) eklenirse diye korunur; o kimlikler yalnız bu listeye eklenir.
 *
 * SAFLIK SINIRI:
 *   - Bu modülün HİÇBİR import'u yoktur; client ve server tarafında güvenle
 *     import edilebilir. Secret / runtime env / IO içermez.
 *   - Karşılaştırma AÇIK ve deterministik exact-match'tir; trim/lowercase gibi
 *     gizli normalizasyon YAPILMAZ.
 */

/** Platform sahibinin (owner admin + uzman) gerçek uzman tenant'ı. Sentetik DEĞİLDİR. */
export const OWNER_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

/**
 * @deprecated Eski ad ("admin kütüphanesi"). Aynı UUID = `OWNER_TENANT_ID`; sentetik/ortak
 * kütüphane anlamı TAŞIMAZ. Mevcut import'lar kırılmasın diye geçici takma ad olarak durur.
 */
export const ADMIN_LIBRARY_TENANT_ID = OWNER_TENANT_ID;

/**
 * Bilinen tüm sentetik tenant kimlikleri (readonly). Bugün BOŞ. Yeni bir gerçek sentetik
 * namespace (kullanıcısız seed/template tenant'ı) eklenirse YALNIZ bu listeye eklenir;
 * tüketen katmanlar (YH indexer/writer/reconcile/backfill kapıları) otomatik kapsar.
 */
export const SYNTHETIC_TENANT_IDS: readonly string[] = [];

/**
 * Verilen tenant kimliği sentetik mi?
 *   - `null` (shared referans) → false (NULL/shared anlamı bu modülce DEĞİŞTİRİLMEZ).
 *   - Gerçek kullanıcı tenant UUID'si (owner dahil) → false.
 *   - `SYNTHETIC_TENANT_IDS` üyesi (birebir eşitlik) → true.
 */
export function isSyntheticTenantId(tenantId: string | null): boolean {
  if (tenantId === null) return false;
  return SYNTHETIC_TENANT_IDS.includes(tenantId);
}
