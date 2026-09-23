/**
 * Beslenme — Manuel "Hızlı Besin Ekle" SAF builder harness. DB'ye BAĞLANMAZ.
 *   Doğrular: ad zorunlu, BOŞ≠0, TR ondalık, negatif/geçersiz reddi, birim uyumu, dedup,
 *   porsiyon gram-zorunlu (tahmin yok), tenant güvenliği (tenant_id daima ctx'ten),
 *   kalori↔makro tutarlılık uyarısı.
 */
import { buildQuickAddFood, kcalMacroConsistency, type NutrientRefLite, type UnitRefLite } from "@/lib/beslenme/quickAddFood";
import { isUnitAllowedForCategory } from "@/lib/beslenme/contracts";

let pass = 0, fail = 0; const fails: string[] = [];
const chk = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; fails.push(name); console.log(`  FAIL  ${name}`); } };

const T = "11111111-1111-4111-8111-111111111111";
const nutrientDict = new Map<string, NutrientRefLite>([
  ["energy", { id: "n-en", code: "energy", category: "energy" }],
  ["protein", { id: "n-pr", code: "protein", category: "macronutrient" }],
  ["carbohydrate", { id: "n-cb", code: "carbohydrate", category: "macronutrient" }],
  ["total_fat", { id: "n-ft", code: "total_fat", category: "macronutrient" }],
  ["sodium", { id: "n-na", code: "sodium", category: "mineral" }],
]);
const unitDict = new Map<string, UnitRefLite>([
  ["kcal", { id: "u-kcal", code: "kcal", unit_type: "energy" }],
  ["g", { id: "u-g", code: "g", unit_type: "mass" }],
  ["mg", { id: "u-mg", code: "mg", unit_type: "mass" }],
  ["serving", { id: "u-srv", code: "serving", unit_type: "household" }],
]);
const ctx = { tenantId: T, nutrientDict, unitDict, isUnitAllowedForCategory };
const build = (input: Record<string, unknown>) => buildQuickAddFood(input, ctx);

// T1 ad zorunlu
chk("T1 ad yok → NAME_REQUIRED", (() => { const r = build({}); return !r.ok && r.code === "NAME_REQUIRED"; })());

// T2 yalnız ad → ok, tenant ctx'ten, nutrient/portion yok
{
  const r = build({ name_tr: "Ev Tarhanası" });
  chk("T2 yalnız ad → ok", r.ok === true);
  if (r.ok) { chk("T2 tenant ctx'ten", r.foodInsert.tenant_id === T); chk("T2 nutrient 0", r.nutrientRows.length === 0); chk("T2 portion yok", r.portionRow === null); }
}

// T3 BOŞ≠0: verilen amount 0 → satır oluşur (ölçülen sıfır); verilmeyen → satır yok
{
  const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "sodium", amount: 0, unit_code: "mg" }] });
  chk("T3 amount 0 → satır KORUNUR (0 yazılır)", r.ok === true && r.ok && r.nutrientRows.length === 1 && r.nutrientRows[0].amount === 0);
  const r2 = build({ name_tr: "X" });
  chk("T3 alan verilmedi → satır YOK (bilinmiyor)", r2.ok === true && r2.ok && r2.nutrientRows.length === 0);
}

// T4 TR ondalık "12,5" → 12.5
{
  const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "protein", amount: "12,5", unit_code: "g" }] });
  chk("T4 TR ondalık '12,5' → 12.5", r.ok === true && r.ok && r.nutrientRows[0].amount === 12.5);
}

// T5 negatif/geçersiz reddi
chk("T5 negatif → BAD_AMOUNT", (() => { const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "protein", amount: -1, unit_code: "g" }] }); return !r.ok && r.code === "BAD_AMOUNT"; })());
chk("T5 geçersiz metin → BAD_AMOUNT", (() => { const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "protein", amount: "abc", unit_code: "g" }] }); return !r.ok && r.code === "BAD_AMOUNT"; })());

// T6 birim uyumu: protein + kcal → UNIT_INCOMPATIBLE
chk("T6 protein+kcal → UNIT_INCOMPATIBLE", (() => { const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "protein", amount: 5, unit_code: "kcal" }] }); return !r.ok && r.code === "UNIT_INCOMPATIBLE"; })());
// energy + kcal → ok
chk("T6 energy+kcal → ok", (() => { const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "energy", amount: 250, unit_code: "kcal" }] }); return r.ok === true; })());

// T7 bilinmeyen nutrient/unit
chk("T7 bilinmeyen nutrient → BAD_NUTRIENT", (() => { const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "zzz", amount: 1, unit_code: "g" }] }); return !r.ok && r.code === "BAD_NUTRIENT"; })());
chk("T7 bilinmeyen unit → BAD_UNIT", (() => { const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "protein", amount: 1, unit_code: "zzz" }] }); return !r.ok && r.code === "BAD_UNIT"; })());

// T8 dedup
chk("T8 aynı nutrient 2x → DUPLICATE_NUTRIENT", (() => { const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "protein", amount: 1, unit_code: "g" }, { nutrient_code: "protein", amount: 2, unit_code: "g" }] }); return !r.ok && r.code === "DUPLICATE_NUTRIENT"; })());

// T9 porsiyon: gram yoksa TAHMİN YOK
chk("T9 porsiyon gram yok → PORTION_GRAM_REQUIRED", (() => { const r = build({ name_tr: "X", portion: { label_tr: "1 kase" } }); return !r.ok && r.code === "PORTION_GRAM_REQUIRED"; })());
chk("T9 porsiyon ad yok → PORTION_LABEL_REQUIRED", (() => { const r = build({ name_tr: "X", portion: { gram_weight: 200 } }); return !r.ok && r.code === "PORTION_LABEL_REQUIRED"; })());
{
  const r = build({ name_tr: "X", portion: { label_tr: "1 kase", gram_weight: "200" } });
  chk("T9 porsiyon ad+gram → portionRow", r.ok === true && r.ok && r.portionRow != null && r.portionRow.gram_weight === 200 && r.portionRow.tenant_id === T && r.portionRow.is_default === true);
}

// T10 porsiyon birim tipi (kütle reddi)
chk("T10 porsiyon unit=g (kütle) → BAD_PORTION_UNIT_TYPE", (() => { const r = build({ name_tr: "X", portion: { label_tr: "1 g", gram_weight: 1, measure_unit_code: "g" } }); return !r.ok && r.code === "BAD_PORTION_UNIT_TYPE"; })());

// T11 tenant güvenliği: input'taki tenant_id yok sayılır (builder daima ctx)
{
  const r = build({ name_tr: "X", tenant_id: "99999999-9999-4999-8999-999999999999" } as Record<string, unknown>);
  chk("T11 foodInsert.tenant_id daima ctx'ten", r.ok === true && r.ok && r.foodInsert.tenant_id === T);
}

// T12 nutrient satırı: basis=100, food_id YOK (route ekler), source leakage yok
{
  const r = build({ name_tr: "X", nutrients: [{ nutrient_code: "protein", amount: 10, unit_code: "g" }] });
  chk("T12 basis_grams=100", r.ok === true && r.ok && r.nutrientRows[0].basis_grams === 100);
  chk("T12 food_id builder'da YOK", r.ok === true && r.ok && !("food_id" in r.nutrientRows[0]));
}

// T13 prep_state / food_group doğrulama
chk("T13 geçersiz prep → BAD_PREP_STATE", (() => { const r = build({ name_tr: "X", prep_state: "zzz" }); return !r.ok && r.code === "BAD_PREP_STATE"; })());
chk("T13 geçersiz group → BAD_FOOD_GROUP", (() => { const r = build({ name_tr: "X", food_group_id: "not-uuid" }); return !r.ok && r.code === "BAD_FOOD_GROUP"; })());
chk("T13 prep=raw → set", (() => { const r = build({ name_tr: "X", prep_state: "raw" }); return r.ok === true && r.ok && r.foodInsert.prep_state === "raw"; })());

// T14 kalori↔makro tutarlılık uyarısı
chk("T14 tutarlı → uyarı yok", kcalMacroConsistency({ energy: 100, protein: 25, carbohydrate: 0, total_fat: 0 }).hasWarning === false);
chk("T14 tutarsız → uyarı", kcalMacroConsistency({ energy: 500, protein: 1, carbohydrate: 1, total_fat: 1 }).hasWarning === true);
chk("T14 makro eksik → uyarı yok", kcalMacroConsistency({ energy: 500, protein: 1 }).hasWarning === false);
chk("T14 kalori eksik → uyarı yok", kcalMacroConsistency({ protein: 1, carbohydrate: 1, total_fat: 1 }).hasWarning === false);

console.log(`\n${"=".repeat(52)}\n  QUICK-ADD HARNESS: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("  FAILURES:\n   - " + fails.join("\n   - ")); process.exit(1); }
console.log("  ✅ Manuel besin ekleme sözleşmeleri GEÇTİ"); process.exit(0);
