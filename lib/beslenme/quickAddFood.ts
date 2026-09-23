/**
 * Beslenme — Manuel "Hızlı Besin Ekle" SAF derleyici (framework/DB'den bağımsız, test edilebilir).
 *
 * İLKELER:
 *  - Ad dışında hiçbir nutrient zorunlu DEĞİL. Kalori bile opsiyonel; ama en az ad gerekir.
 *  - BOŞ ≠ 0: form boş bırakılan alanı GÖNDERMEZ (satır oluşmaz = "bilinmiyor"); açıkça 0 girilirse
 *    satır oluşur (amount=0 = "ölçülen sıfır"). Bu derleyici yalnız GELEN item'ları satıra çevirir.
 *  - Değerler 100 g esaslıdır (basis_grams=100). Porsiyon ancak gram karşılığı biliniyorsa yazılır.
 *  - Kaynak: manuel kayıt → external_ref ÜRETİLMEZ (sahte FDC/USDA yok). is_system=false doğal olarak.
 *  - tenant_id ASLA payload'dan; çağıran (server) verir.
 */
import { cleanNumber, isUuid, inEnum, cleanStr, cleanStringArray, PREP_STATES, NUTRIENT_BASIS_GRAMS } from "@/lib/beslenme/contracts";

export type QuickAddInput = {
  name_tr?: unknown;
  name_en?: unknown;
  aliases?: unknown;
  food_group_id?: unknown;
  prep_state?: unknown;
  description?: unknown;
  nutrients?: unknown; // Array<{ nutrient_code, amount, unit_code }>
  portion?: unknown; // { label_tr, gram_weight, measure_unit_code?, quantity? } | null
};

export type NutrientRefLite = { id: string; code: string; category: string };
export type UnitRefLite = { id: string; code: string; unit_type: string };

export type QuickAddBuildResult =
  | {
      ok: true;
      foodInsert: Record<string, unknown>;
      nutrientRows: Record<string, unknown>[];
      portionRow: Record<string, unknown> | null;
    }
  | { ok: false; code: string; status: number };

export const QUICK_ADD_KEYS = ["name_tr", "name_en", "aliases", "food_group_id", "prep_state", "description", "nutrients", "portion"] as const;

// Porsiyon ölçü birimi tipi: ev-ölçüsü/sayı/hacim (kütle DEĞİL — gram_weight zaten gramı verir).
const PORTION_UNIT_TYPES = new Set(["count", "household", "volume"]);

/**
 * Payload'ı DB insert satırlarına çevirir. Hiçbir şey INSERT etmez; yalnız doğrular + hazırlar.
 * @param hasOnlyKeys mass-assignment guard'ı (contracts.hasOnlyKeys) — dışarıdan enjekte (import döngüsü yok).
 */
export function buildQuickAddFood(
  input: QuickAddInput,
  ctx: {
    tenantId: string;
    nutrientDict: Map<string, NutrientRefLite>;
    unitDict: Map<string, UnitRefLite>;
    isUnitAllowedForCategory: (category: string, unitCode: string) => boolean;
  },
): QuickAddBuildResult {
  const name_tr = cleanStr(input.name_tr, 200);
  if (!name_tr) return { ok: false, code: "NAME_REQUIRED", status: 400 };
  if (input.food_group_id != null && !isUuid(input.food_group_id)) return { ok: false, code: "BAD_FOOD_GROUP", status: 400 };
  if (input.prep_state != null && input.prep_state !== "" && !inEnum(input.prep_state, PREP_STATES)) return { ok: false, code: "BAD_PREP_STATE", status: 400 };

  const foodInsert: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    name_tr,
    name_en: cleanStr(input.name_en, 200),
    aliases: cleanStringArray(input.aliases),
    food_group_id: isUuid(input.food_group_id) ? input.food_group_id : null,
    prep_state: inEnum(input.prep_state, PREP_STATES) ? input.prep_state : null,
    description: cleanStr(input.description, 8000),
    is_active: true,
  };

  // ── nutrients (opsiyonel) ──
  const nutrientRows: Record<string, unknown>[] = [];
  const rawNutrients = input.nutrients;
  if (rawNutrients != null) {
    if (!Array.isArray(rawNutrients)) return { ok: false, code: "BAD_NUTRIENTS", status: 400 };
    if (rawNutrients.length > 60) return { ok: false, code: "TOO_MANY", status: 400 };
    const seen = new Set<string>();
    for (const raw of rawNutrients) {
      if (!raw || typeof raw !== "object") return { ok: false, code: "BAD_ITEM", status: 400 };
      const it = raw as Record<string, unknown>;
      const nutrient = typeof it.nutrient_code === "string" ? ctx.nutrientDict.get(it.nutrient_code) : undefined;
      if (!nutrient) return { ok: false, code: "BAD_NUTRIENT", status: 400 };
      if (seen.has(nutrient.code)) return { ok: false, code: "DUPLICATE_NUTRIENT", status: 409 };
      seen.add(nutrient.code);
      const unit = typeof it.unit_code === "string" ? ctx.unitDict.get(it.unit_code) : undefined;
      if (!unit) return { ok: false, code: "BAD_UNIT", status: 400 };
      if (!ctx.isUnitAllowedForCategory(nutrient.category, unit.code)) return { ok: false, code: "UNIT_INCOMPATIBLE", status: 400 };
      // BOŞ ≠ 0: boş amount buraya GELMEMELİ (client boşu göndermez). Gelen değer 0 olabilir (geçerli).
      const amount = cleanNumber(it.amount, { min: 0, max: 1_000_000 });
      if (amount == null) return { ok: false, code: "BAD_AMOUNT", status: 400 };
      nutrientRows.push({ tenant_id: ctx.tenantId, nutrient_id: nutrient.id, amount, unit_id: unit.id, basis_grams: NUTRIENT_BASIS_GRAMS });
    }
  }

  // ── portion (opsiyonel) — yalnız gram karşılığı biliniyorsa ──
  let portionRow: Record<string, unknown> | null = null;
  const rawPortion = input.portion;
  if (rawPortion != null && rawPortion !== "") {
    if (typeof rawPortion !== "object") return { ok: false, code: "BAD_PORTION", status: 400 };
    const p = rawPortion as Record<string, unknown>;
    const label_tr = cleanStr(p.label_tr, 120);
    if (!label_tr) return { ok: false, code: "PORTION_LABEL_REQUIRED", status: 400 };
    const gram_weight = cleanNumber(p.gram_weight, { min: 0.0001, max: 100000 });
    if (gram_weight == null) return { ok: false, code: "PORTION_GRAM_REQUIRED", status: 400 }; // gram bilinmiyorsa TAHMİN YOK → porsiyon yazılmaz
    const measureCode = typeof p.measure_unit_code === "string" && p.measure_unit_code ? p.measure_unit_code : "serving";
    const unit = ctx.unitDict.get(measureCode);
    if (!unit) return { ok: false, code: "BAD_PORTION_UNIT", status: 400 };
    if (!PORTION_UNIT_TYPES.has(unit.unit_type)) return { ok: false, code: "BAD_PORTION_UNIT_TYPE", status: 400 };
    const quantity = cleanNumber(p.quantity, { min: 0.0001, max: 100000 }) ?? 1;
    portionRow = { tenant_id: ctx.tenantId, label_tr, measure_unit_id: unit.id, gram_weight, quantity, is_default: true, sort_order: 0 };
  }

  return { ok: true, foodInsert, nutrientRows, portionRow };
}

/**
 * Kalori ↔ makro tutarlılık kontrolü (UYARI amaçlı; otomatik düzeltme YOK).
 *   Atwater: 4·protein + 4·karb + 9·yağ. Hem kalori hem makrolar verildiyse belirgin sapmayı bildirir.
 *   Boş/eksik alanlar hesaba katılmaz → eksik veriyle yanlış uyarı üretmez.
 */
export function kcalMacroConsistency(n: { energy?: number | null; protein?: number | null; carbohydrate?: number | null; total_fat?: number | null }): {
  hasWarning: boolean;
  computedKcal: number | null;
  givenKcal: number | null;
  diffPct: number | null;
} {
  const given = n.energy ?? null;
  const hasAllMacros = n.protein != null && n.carbohydrate != null && n.total_fat != null;
  if (given == null || !hasAllMacros) return { hasWarning: false, computedKcal: hasAllMacros ? 4 * n.protein! + 4 * n.carbohydrate! + 9 * n.total_fat! : null, givenKcal: given, diffPct: null };
  const computed = 4 * n.protein! + 4 * n.carbohydrate! + 9 * n.total_fat!;
  const diff = Math.abs(computed - given);
  const diffPct = given > 0 ? (diff / given) * 100 : (computed > 0 ? 100 : 0);
  // eşik: hem mutlak (>30 kcal) hem oransal (>%20) aşılırsa uyar
  const hasWarning = diff > 30 && diffPct > 20;
  return { hasWarning, computedKcal: Math.round(computed), givenKcal: given, diffPct: Math.round(diffPct) };
}
