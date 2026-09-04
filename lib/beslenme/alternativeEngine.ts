import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_NUTRITION_TENANT_ID, foodOwnershipClass } from "./systemTenant";

/**
 * Beslenme FAZ 6 / Yaklaşık Besin Alternatifleri — DETERMİNİSTİK, SERVER-SIDE, AI YOK.
 *
 * Amaç (UI metni): "Yaklaşık Besin Alternatifleri" — "Benzer enerji ve makro besin
 *   profiline göre hesaplanır." KLİNİK/tıbbi iddia YOK; yalnız sayısal benzerlik.
 *
 * İki katman:
 *   PURE  `scoreAlternatives(...)` — IO/DB YOK; birim-test edilebilir; sabitler aşağıda.
 *   DB    `resolveAlternativesForItem(...)` — plan item SNAPSHOT'ını (§12 frozen /100 g)
 *         hedef alır, aday havuzunu { SYSTEM, caller } kapsamında okur, PURE'e verir.
 *
 * SNAPSHOT KONTRATI: hedef enerji/makro DAİMA DB'deki donmuş item snapshot'ından gelir;
 *   client hedef/snapshot değeri GÖNDEREMEZ (route yalnız sameGroupOnly/all okur).
 */

// ── Sabitler (algoritma; hepsi burada, tek yerde) ─────────────────────────────
/** LEVEL 2 distance için makro eksenleri (frozen 4 makro). */
export const ALT_MACRO_KEYS = ["protein", "carbohydrate", "total_fat", "fiber"] as const;
/** Referans normalizasyon ölçekleri (g / 100 g) — makrolar aynı büyüklük düzeyine getirilir. */
export const ALT_MACRO_SCALES: Record<(typeof ALT_MACRO_KEYS)[number], number> = {
  protein: 50,
  carbohydrate: 100,
  total_fat: 50,
  fiber: 30,
};
/** Makro eksen ağırlıkları eşit = 1.0. */
export const ALT_MACRO_WEIGHT = 1.0;
/** Küçük enerji terimi: ağırlık 0.5, ölçek 400 kcal / 100 g. */
export const ALT_ENERGY_WEIGHT = 0.5;
export const ALT_ENERGY_SCALE = 400;
/** LEVEL 1 enerji bandı: ±10% dar; <5 aday kalırsa ±20%'e genişle. */
export const ALT_BAND_NARROW = 0.1;
export const ALT_BAND_WIDE = 0.2;
export const ALT_MIN_FOR_NARROW = 5;
/** Deterministik üst sınır: en yakın 20 aday. */
export const ALT_TOP_N = 20;

export type AltBand = "±10%" | "±20%";

export type Cand = {
  food_id: string;
  name_tr: string;
  food_group_id: string | null;
  ownership: "system" | "custom";
  energyPer100: number;
  macrosPer100: Record<string, number>;
};

export type Ranked = {
  food_id: string;
  name_tr: string;
  ownership: "system" | "custom";
  distance: number;
  energyPer100: number;
  band: AltBand;
};

export type ScoreTarget = {
  energyPer100: number;
  macrosPer100: Record<string, number>;
};

export type ScoreOpts = {
  sameGroupOnly: boolean;
  targetGroupId: string | null;
  /** Hedef besinin kendi food_id'si (havuzdan dışlanır; DB resolver zaten dışlar, PURE güvence). */
  targetFoodId?: string | null;
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Amount match (SAF): adayı hedefin TOPLAM enerjisine eşitleyen gram.
 *   grams = round(energyTotal / candEnergyPer100 × 100). HAM böl; yalnız display yuvarla.
 *   candEnergyPer100 ≤ 0 → 0 (divide-by-zero güvenliği).
 */
export function altGramsForEnergyMatch(energyTotal: number, candEnergyPer100: number): number {
  if (!(candEnergyPer100 > 0) || !Number.isFinite(energyTotal)) return 0;
  return Math.round((energyTotal / candEnergyPer100) * 100);
}

/**
 * SAF skorlama: enerji bandı (L1) + ağırlıklı normalize Öklid makro mesafesi (L2).
 *
 * Sıra (task sözleşmesi):
 *   1) DIŞLA: energyPer100 eksik/≤0 olan adaylar + hedef besinin kendisi (divide-by-zero güvenliği).
 *   2) L1 enerji bandı: ±10% içinde tut; <5 kalırsa ±20%'e genişle. Kullanılan band kaydedilir.
 *   3) Opsiyonel aynı-grup filtresi (sameGroupOnly && targetGroupId).
 *   4) L2 mesafe: sqrt(Σ w*((cand-target)/scale)^2) — 4 makro (w=1, scale 50/100/50/30)
 *      + enerji terimi (w=0.5, scale 400). Eksik makro (iki taraf) → 0.
 *   5) SIRALA: distance ASC, sonra name_tr (localeCompare 'tr'), sonra food_id ASC. Top 20.
 */
export function scoreAlternatives(target: ScoreTarget, candidates: Cand[], opts: ScoreOpts): Ranked[] {
  const targetEnergy = num(target.energyPer100);
  const targetFoodId = opts.targetFoodId ?? null;

  // (1) energyPer100 geçerli (>0) + kendisi değil.
  const valid = candidates.filter(
    (c) => Number.isFinite(c.energyPer100) && c.energyPer100 > 0 && c.food_id !== targetFoodId,
  );

  // (2) enerji bandı: önce ±10%, <5 ise ±20%. (Hedef enerji ≤0 ise bant dejenere → boş.)
  const inBand = (c: Cand, tol: number) =>
    targetEnergy > 0 && Math.abs(c.energyPer100 - targetEnergy) <= targetEnergy * tol;
  let band: AltBand = "±10%";
  let banded = valid.filter((c) => inBand(c, ALT_BAND_NARROW));
  if (banded.length < ALT_MIN_FOR_NARROW) {
    band = "±20%";
    banded = valid.filter((c) => inBand(c, ALT_BAND_WIDE));
  }

  // (3) opsiyonel aynı-grup filtresi.
  let pool = banded;
  if (opts.sameGroupOnly && opts.targetGroupId) {
    pool = pool.filter((c) => c.food_group_id === opts.targetGroupId);
  }

  // (4) L2 ağırlıklı normalize Öklid mesafesi.
  const scored = pool.map((c) => {
    let acc = 0;
    for (const k of ALT_MACRO_KEYS) {
      const scale = ALT_MACRO_SCALES[k];
      const diff = (num(c.macrosPer100[k]) - num(target.macrosPer100[k])) / scale;
      acc += ALT_MACRO_WEIGHT * diff * diff;
    }
    const eDiff = (c.energyPer100 - targetEnergy) / ALT_ENERGY_SCALE;
    acc += ALT_ENERGY_WEIGHT * eDiff * eDiff;
    const distance = Math.sqrt(acc);
    return {
      food_id: c.food_id,
      name_tr: c.name_tr,
      ownership: c.ownership,
      distance,
      energyPer100: c.energyPer100,
      band,
    } satisfies Ranked;
  });

  // (5) deterministik sıralama + top N.
  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    const n = a.name_tr.localeCompare(b.name_tr, "tr");
    if (n !== 0) return n;
    return a.food_id.localeCompare(b.food_id);
  });
  return scored.slice(0, ALT_TOP_N);
}

// ── DB resolver ───────────────────────────────────────────────────────────────

export type AltResolveOpts = { sameGroupOnly: boolean };

export type AltTarget = {
  name: string;
  grams: number;
  energyPer100: number;
  energyTotal: number;
  macrosPer100: Record<string, number>;
};

export type AltAlternative = {
  food_id: string;
  name_tr: string;
  ownership: "system" | "custom";
  energyPer100: number;
  distance: number;
  grams: number;
};

export type AltResolveResult =
  | { ok: true; target: AltTarget; alternatives: AltAlternative[]; band: AltBand | null }
  | { ok: false; error: { code: string; status: number } };

type NutrientCodeJoin = { code: string } | { code: string }[] | null;
function pickJoin(v: NutrientCodeJoin): { code: string } | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const readableScope = (tenantId: string): string[] =>
  tenantId === SYSTEM_NUTRITION_TENANT_ID
    ? [SYSTEM_NUTRITION_TENANT_ID]
    : [SYSTEM_NUTRITION_TENANT_ID, tenantId];

/**
 * Plan item için alternatifleri çözer (tenant-scoped; hedef DB SNAPSHOT'ından).
 *   - Item yoksa → NOT_FOUND/404.
 *   - Hedef enerji/makro item snapshot rows'undan (frozen /100 g). targetTotalEnergy = e/100 × grams.
 *   - targetGroupId: item.food_id varsa nutrition_foods.food_group_id (silinmiş/null olabilir).
 *   - Aday havuzu: nutrition_foods (SYSTEM ∪ caller, is_active) − item'ın kendi food_id'si.
 *   - amount match: grams = round(targetTotalEnergy / cand.energyPer100 × 100) (yalnız display).
 */
export async function resolveAlternativesForItem(
  db: SupabaseClient,
  tenantId: string,
  itemId: string,
  opts: AltResolveOpts,
): Promise<AltResolveResult> {
  // Item (tenant-scoped) + frozen snapshot alanları.
  const { data: itemRow } = await db
    .from("nutrition_plan_items")
    .select("food_id, grams, food_name_snapshot, food_ownership_snapshot")
    .eq("tenant_id", tenantId)
    .eq("id", itemId)
    .maybeSingle();
  const item = itemRow as
    | { food_id: string | null; grams: number; food_name_snapshot: string; food_ownership_snapshot: string }
    | null;
  if (!item) return { ok: false, error: { code: "NOT_FOUND", status: 404 } };

  const grams = Number(item.grams);

  // Item frozen nutrient snapshot → hedef enerji/makro (/100 g).
  const { data: snapRows } = await db
    .from("nutrition_plan_item_nutrients")
    .select("nutrient_code, amount")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId);
  const macrosPer100: Record<string, number> = {};
  let energyPer100 = 0;
  for (const r of (snapRows as Array<{ nutrient_code: string; amount: number }> | null) ?? []) {
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    if (r.nutrient_code === "energy") energyPer100 = amount;
    else if ((ALT_MACRO_KEYS as readonly string[]).includes(r.nutrient_code)) macrosPer100[r.nutrient_code] = amount;
  }
  const energyTotal = (energyPer100 * grams) / 100;

  // targetGroupId — item food'u hâlâ erişilebilirse.
  let targetGroupId: string | null = null;
  if (item.food_id) {
    const { data: gf } = await db
      .from("nutrition_foods")
      .select("food_group_id")
      .in("tenant_id", readableScope(tenantId))
      .eq("id", item.food_id)
      .maybeSingle();
    targetGroupId = (gf as { food_group_id: string | null } | null)?.food_group_id ?? null;
  }

  // Aday havuzu: aktif foods { SYSTEM, caller } − kendi food_id.
  let foodQuery = db
    .from("nutrition_foods")
    .select("id, tenant_id, name_tr, food_group_id")
    .in("tenant_id", readableScope(tenantId))
    .eq("is_active", true);
  if (item.food_id) foodQuery = foodQuery.neq("id", item.food_id);
  const { data: foodRows } = await foodQuery;
  const foods = (foodRows as Array<{ id: string; tenant_id: string; name_tr: string; food_group_id: string | null }> | null) ?? [];
  if (foods.length === 0) {
    return {
      ok: true,
      target: { name: item.food_name_snapshot, grams, energyPer100, energyTotal, macrosPer100 },
      alternatives: [],
      band: null,
    };
  }

  // Aday /100 g nutrient değerleri (energy + 4 makro) — tek sorgu, JS'te map.
  const foodIds = foods.map((f) => f.id);
  const { data: nutrRows } = await db
    .from("nutrition_food_nutrients")
    .select("food_id, amount, nutrient:nutrition_nutrients(code)")
    .in("tenant_id", readableScope(tenantId))
    .in("food_id", foodIds);
  const wanted = new Set<string>(["energy", ...ALT_MACRO_KEYS]);
  const byFood = new Map<string, { energyPer100: number; macrosPer100: Record<string, number> }>();
  for (const r of (nutrRows as Array<{ food_id: string; amount: number; nutrient: NutrientCodeJoin }> | null) ?? []) {
    const code = pickJoin(r.nutrient)?.code;
    if (!code || !wanted.has(code)) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    const cur = byFood.get(r.food_id) ?? { energyPer100: 0, macrosPer100: {} };
    if (code === "energy") cur.energyPer100 = amount;
    else cur.macrosPer100[code] = amount;
    byFood.set(r.food_id, cur);
  }

  const candidates: Cand[] = foods.map((f) => {
    const n = byFood.get(f.id) ?? { energyPer100: 0, macrosPer100: {} };
    return {
      food_id: f.id,
      name_tr: f.name_tr,
      food_group_id: f.food_group_id,
      ownership: foodOwnershipClass(f.tenant_id),
      energyPer100: n.energyPer100,
      macrosPer100: n.macrosPer100,
    };
  });

  const ranked = scoreAlternatives(
    { energyPer100, macrosPer100 },
    candidates,
    { sameGroupOnly: opts.sameGroupOnly, targetGroupId, targetFoodId: item.food_id },
  );

  const alternatives: AltAlternative[] = ranked.map((r) => ({
    food_id: r.food_id,
    name_tr: r.name_tr,
    ownership: r.ownership,
    energyPer100: r.energyPer100,
    distance: r.distance,
    // amount match: hedef toplam enerjiyi eşitleyen gram (HAM böl, yalnız display yuvarla).
    grams: altGramsForEnergyMatch(energyTotal, r.energyPer100),
  }));

  return {
    ok: true,
    target: { name: item.food_name_snapshot, grams, energyPer100, energyTotal, macrosPer100 },
    alternatives,
    band: ranked[0]?.band ?? null,
  };
}
