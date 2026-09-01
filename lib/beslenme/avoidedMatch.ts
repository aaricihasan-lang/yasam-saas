/**
 * Beslenme FAZ 7 — Kaçınılan besin eşleşmesi (SAF; IO/DB YOK).
 *
 * §17: YALNIZ exact structured food_id eşleşmesi. Fuzzy food_label eşlemesi YOK.
 * food_id null/boş → asla eşleşmez (katalog-dışı item advisory üretmez). Non-blocking
 * advisory'dir; plan kaydını engellemez ve tıbbi/güvenlik iddiası DEĞİLDİR.
 */

/** Bir plan item'ının food_id'si danışanın kaçınılan besin id kümesinde mi? */
export function isAvoidedFood(
  foodId: string | null | undefined,
  avoidedFoodIds: ReadonlySet<string>,
): boolean {
  if (!foodId) return false;
  return avoidedFoodIds.has(foodId);
}

/** Tercih kayıtlarından kaçınılan (stance='avoided') + food_id dolu id kümesi. */
export function collectAvoidedFoodIds(
  prefs: ReadonlyArray<{ stance: string; food_id: string | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const p of prefs) {
    if (p.stance === "avoided" && p.food_id) ids.add(p.food_id);
  }
  return ids;
}
