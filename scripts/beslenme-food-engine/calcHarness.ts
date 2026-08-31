// ============================================================
// Beslenme FAZ 4 — Besin Motoru: CALC + VALIDATION harness (deterministik, DB-siz)
//
// Saf hesap motoru + app-layer doğrulayıcıları test eder. DB/network YOK.
// Çalıştır:  npx tsx scripts/beslenme-food-engine/calcHarness.ts
//        or  npm run beslenme:food-engine:calc
// ============================================================
import {
  scaleFor,
  calculateFoodForGrams,
  calculateFoodForPortion,
  formatAmount,
} from "@/lib/beslenme/calc/nutrients";
import {
  isUnitAllowedForCategory,
  isValidPortionMeasureUnitType,
  cleanNumber,
  isNonNegative,
  isPositive,
  NUTRIENT_BASIS_GRAMS,
  IMPORT_PROVIDERS,
} from "@/lib/beslenme/contracts";

let pass = 0, fail = 0;
const fails: string[] = [];
const eq = (n: string, got: unknown, want: unknown) => {
  const okv = JSON.stringify(got) === JSON.stringify(want);
  if (okv) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; fails.push(n); console.log(`  FAIL  ${n} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const truthy = (n: string, c: boolean) => eq(n, !!c, true);
const falsy = (n: string, c: boolean) => eq(n, !!c, false);

console.log("\n[A] scaleFor — deterministik per-100g ölçekleme");
eq("100 g × base100 = değer", scaleFor(52, 100), 52);
eq("50 g = yarısı", scaleFor(52, 50), 26);
eq("182 g = 1.82× (94.64)", Number(scaleFor(52, 182).toFixed(2)), 94.64);
eq("0 g = 0", scaleFor(52, 100 * 0), 0);
eq("negatif gram → 0 (reddedilir)", scaleFor(52, -10), 0);
eq("NaN per100g → 0", scaleFor(Number.NaN, 100), 0);
eq("Infinity gram → 0", scaleFor(52, Number.POSITIVE_INFINITY), 0);
eq("basis invariant = 100", NUTRIENT_BASIS_GRAMS, 100);

console.log("\n[B] calculateFoodForGrams — set ölçekleme (birim karışmaz)");
const per100 = [
  { nutrient_code: "energy", amount: 52, unit_code: "kcal" },
  { nutrient_code: "protein", amount: 0.3, unit_code: "g" },
  { nutrient_code: "sodium", amount: 1, unit_code: "mg" },
];
const g182 = calculateFoodForGrams(per100, 182);
eq("energy 182g", Number(g182[0].amount.toFixed(2)), 94.64);
eq("protein 182g", Number(g182[1].amount.toFixed(3)), 0.546);
eq("sodium 182g", Number(g182[2].amount.toFixed(2)), 1.82);
eq("energy birim korunur (kcal)", g182[0].unit_code, "kcal");
eq("sodium birim korunur (mg)", g182[2].unit_code, "mg");

console.log("\n[C] calculateFoodForPortion — quantity × gram_weight köprüsü");
const p = calculateFoodForPortion(per100, 1, 182);
eq("1 orta elma = 182 g köprü", p.grams, 182);
eq("porsiyon energy = 94.64", Number(p.values[0].amount.toFixed(2)), 94.64);
const p2 = calculateFoodForPortion(per100, 2, 15); // 2 yemek kaşığı × 15 g
eq("2×15g = 30 g", p2.grams, 30);

console.log("\n[D] formatAmount — display rounding (ham değer korunur)");
eq("kcal tam sayı", formatAmount(94.64, "kcal"), "95");
eq("g 1 ondalık", formatAmount(0.546, "g"), "0,5");
eq("mg <1 → 2 ondalık", formatAmount(0.82, "mg"), "0,82");
eq("mcg ≥10 → tam", formatAmount(12.6, "mcg"), "13");
eq("Infinity → —", formatAmount(Number.POSITIVE_INFINITY, "kcal"), "—");

console.log("\n[E] isUnitAllowedForCategory — boyut uyumu fail-closed");
truthy("energy→kcal ✓", isUnitAllowedForCategory("energy", "kcal"));
truthy("energy→kj ✓", isUnitAllowedForCategory("energy", "kj"));
falsy("energy→g ✗", isUnitAllowedForCategory("energy", "g"));
truthy("macronutrient→g ✓", isUnitAllowedForCategory("macronutrient", "g"));
falsy("macronutrient→kcal ✗", isUnitAllowedForCategory("macronutrient", "kcal"));
truthy("mineral→mcg ✓", isUnitAllowedForCategory("mineral", "mcg"));
truthy("vitamin→mcg ✓", isUnitAllowedForCategory("vitamin", "mcg"));
falsy("vitamin→ml ✗", isUnitAllowedForCategory("vitamin", "ml"));
falsy("bilinmeyen kategori ✗", isUnitAllowedForCategory("nonsense", "g"));

console.log("\n[F] isValidPortionMeasureUnitType — ölçü birimi");
truthy("count ✓", isValidPortionMeasureUnitType("count"));
truthy("household ✓", isValidPortionMeasureUnitType("household"));
truthy("volume ✓", isValidPortionMeasureUnitType("volume"));
falsy("mass ✗ (kütle gram_weight'te)", isValidPortionMeasureUnitType("mass"));
falsy("energy ✗", isValidPortionMeasureUnitType("energy"));

console.log("\n[G] cleanNumber — TR virgül + sınır + red");
eq("'12,5' → 12.5 (TR virgül)", cleanNumber("12,5"), 12.5);
eq("negatif min:0 → null", cleanNumber(-3, { min: 0 }), null);
eq("NaN → null", cleanNumber("abc"), null);
eq("boş → null", cleanNumber("  "), null);
eq("max aşımı → null", cleanNumber(999999, { max: 1000 }), null);
truthy("isNonNegative(0)", isNonNegative(0));
falsy("isNonNegative(-1)", isNonNegative(-1));
truthy("isPositive(0.1)", isPositive(0.1));
falsy("isPositive(0)", isPositive(0));

console.log("\n[H] import provider allowlist");
eq("IMPORT_PROVIDERS = [usda_fdc] (TürKomp import YOK)", [...IMPORT_PROVIDERS], ["usda_fdc"]);

console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${fails.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Besin Motoru calc/validation: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));
