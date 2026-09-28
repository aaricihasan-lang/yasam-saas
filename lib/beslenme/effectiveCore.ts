/**
 * Beslenme — EFFECTIVE besin eşlemesi (SAF; IO yok). SQL `nutrition_food_resolve_effective`
 * ile AYNI kural (harness iki uygulamayı aynı veride karşılaştırır):
 *   • istenen id caller tenant'a aitse                  → kendisi
 *   • SYSTEM satırı + tenant gizlemişse                  → YOK (null)
 *   • SYSTEM satırı + tenant'ın kişisel kopyası varsa    → KOPYA
 *   • SYSTEM satırı (kopya/gizleme yok)                  → SYSTEM satırı
 *   • başka tenant / bulunamadı                          → YOK (null)
 */
export type FoodLite = { id: string; tenant_id: string; name_tr: string; origin_food_id: string | null };

export function computeEffectiveMap(args: {
  tenantId: string;
  systemTenantId: string;
  requestedIds: readonly string[];
  /** requestedIds satırları (tenant ∪ SYSTEM kapsamında okunmuş) */
  rows: readonly FoodLite[];
  /** caller tenant'ın origin_food_id ∈ requestedIds kopyaları */
  forks: readonly FoodLite[];
  /** caller tenant'ın gizlediği SYSTEM food id'leri */
  hiddenIds: readonly string[];
}): Map<string, FoodLite | null> {
  const byId = new Map(args.rows.map((r) => [r.id, r]));
  const forkByOrigin = new Map(
    args.forks.filter((f) => f.tenant_id === args.tenantId && f.origin_food_id).map((f) => [f.origin_food_id as string, f]),
  );
  const hidden = new Set(args.hiddenIds);
  const out = new Map<string, FoodLite | null>();
  for (const id of args.requestedIds) {
    const row = byId.get(id);
    if (!row) { out.set(id, null); continue; }
    if (row.tenant_id === args.tenantId) { out.set(id, row); continue; }
    if (row.tenant_id !== args.systemTenantId) { out.set(id, null); continue; }
    if (hidden.has(id)) { out.set(id, null); continue; }
    out.set(id, forkByOrigin.get(id) ?? row);
  }
  return out;
}

export type SnapNutrient = { nutrient_code: string; amount: number; unit_code: string };

/** İki /100 g nutrient seti aynı mı (kod + birim + miktar; sıra bağımsız, 1e-9 tolerans). */
export function sameNutrientSet(a: readonly SnapNutrient[], b: readonly SnapNutrient[]): boolean {
  if (a.length !== b.length) return false;
  const m = new Map(a.map((n) => [n.nutrient_code, n]));
  for (const n of b) {
    const x = m.get(n.nutrient_code);
    if (!x || x.unit_code !== n.unit_code || Math.abs(Number(x.amount) - Number(n.amount)) > 1e-9) return false;
  }
  return true;
}

export function energyOf(set: readonly SnapNutrient[]): number | null {
  const e = set.find((n) => n.nutrient_code === "energy");
  return e ? Number(e.amount) : null;
}
