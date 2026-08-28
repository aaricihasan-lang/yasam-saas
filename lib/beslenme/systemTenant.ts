/**
 * Beslenme — SYSTEM (platform) besin tenant kimliği.
 *
 * MİMARİ KİLİT (FAZ 4/Aşama 1): nutrition_foods.tenant_id public.tenants'a FK DEĞİLDİR
 * (app-layer izolasyon + composite FK). Bu yüzden merkezi SYSTEM katalog, ayrılmış sabit
 * bir tenant UUID'si altında tutulur — SAHTE tenant row'u GEREKMEZ (bu turda oluşturulmaz).
 *
 * SYSTEM foods: merkezi, kaynaklı katalog; yalnız platform sahibi (main-admin) mutasyonu.
 * CUSTOM foods: uzmanın kendi tenant'ına ait besinler.
 *
 * Sabit + belgelenmiş + tek yerde. Runtime'da ÜRETİLMEZ. Saf sabit (client+server import edebilir).
 */
export const SYSTEM_NUTRITION_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export function isSystemNutritionTenant(tenantId: string | null | undefined): boolean {
  return tenantId === SYSTEM_NUTRITION_TENANT_ID;
}

export type FoodOwnershipClass = "system" | "custom";

export function foodOwnershipClass(tenantId: string | null | undefined): FoodOwnershipClass {
  return isSystemNutritionTenant(tenantId) ? "system" : "custom";
}
