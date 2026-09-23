/**
 * Beslenme — Manuel Besin KATKI yetki POLİTİKASI (SAF; server/DB'den bağımsız, test edilebilir).
 *
 * Bu modül YALNIZ karar mantığını içerir; kimlik/oturum doğrulaması ve tenant çözümü
 * server guard'ındadır (lib/beslenme/ownerGuard.requireBeslenmeFoodContributor).
 *
 * KURAL (Hasan Hoca kararı): Beslenme modülü (planlar/danışan/konu) OWNER-ONLY kalır.
 * Manuel besin katkısı, tüm modülü açmadan, DAR bir yetenek bayrağıyla verilir:
 *   - owner (super-admin küratör) → her zaman katkı yetkisi ('owner').
 *   - uzman → yalnız module_permissions.beslenme_manual_food === true ise ('expert').
 * Bu bir MODÜL KAPISI DEĞİLDİR (moduleAccess.beslenme=false değişmez). Yeni kayıt
 * DAİMA yazan kullanıcının server-side doğrulanmış tenant'ına CUSTOM olarak gider;
 * SYSTEM katalog herkes için salt okunurdur. tenant body/query'den ASLA seçilmez.
 */

/** DAR yetenek bayrağı (module_permissions JSONB içinde saklanır; yeni tablo/kolon YOK). */
export const BESLENME_MANUAL_FOOD_FLAG = "beslenme_manual_food";

export type BeslenmeContributorAuthority = "owner" | "expert";

/** module_permissions içinde dar besin-katkı bayrağı açık mı? Yalnız boolean true kabul edilir. */
export function hasManualFoodFlag(modulePermissions: unknown): boolean {
  if (!modulePermissions || typeof modulePermissions !== "object") return false;
  return (modulePermissions as Record<string, unknown>)[BESLENME_MANUAL_FOOD_FLAG] === true;
}

/**
 * SAF yetki kararı. isOwner (super-admin) çözümü + module_permissions verildiğinde
 * yetki sınıfını döner; yetki yoksa null (→ 403).
 *   owner  → 'owner'  (SYSTEM readonly yine korunur; owner kendi tenant'ına yazar)
 *   flag   → 'expert' (yalnız kendi tenant)
 *   else   → null
 */
export function decideFoodContributorAuthority(
  isOwner: boolean,
  modulePermissions: unknown,
): BeslenmeContributorAuthority | null {
  if (isOwner) return "owner";
  if (hasManualFoodFlag(modulePermissions)) return "expert";
  return null;
}
