// ============================================================
// Beslenme FAZ 5 — Plan Motoru: CALC + totals + target + tarih harness (deterministik, DB-siz)
//
// Snapshot-tabanlı plan hesabını + günlük/öğün toplamlarını + hedef önceliğini + tarih
// güvenliğini test eder. DB/network YOK.
// Çalıştır:  npx tsx scripts/beslenme-plan-engine/calcHarness.ts
//        or  npm run beslenme:plan-engine:calc
// ============================================================
import { formatAmount } from "@/lib/beslenme/calc/nutrients";
import {
  itemNutrientContribution,
  sumNutrients,
  energyOf,
  effectiveDailyTarget,
  daysBetween,
  cleanDate,
  PRIMARY_NUTRIENT_CODES,
  SECONDARY_NUTRIENT_CODES,
} from "@/lib/beslenme/planContracts";

let pass = 0, fail = 0;
const fails: string[] = [];
const eq = (n: string, got: unknown, want: unknown) => {
  const okv = JSON.stringify(got) === JSON.stringify(want);
  if (okv) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; fails.push(n); console.log(`  FAIL  ${n} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const truthy = (n: string, c: boolean) => eq(n, !!c, true);

console.log("\n[A] itemNutrientContribution — snapshot grams/100 × amount");
eq("Elma 182g × 52/100g = 94.64 (HAM)", Number(itemNutrientContribution(182, 52).toFixed(2)), 94.64);
eq("100 g = per100g", itemNutrientContribution(100, 52), 52);
eq("150 g grams-edit = 78 (frozen per100g korunur)", itemNutrientContribution(150, 52), 78);
eq("0 g = 0", itemNutrientContribution(0, 52), 0);
eq("negatif gram → 0", itemNutrientContribution(-5, 52), 0);
eq("NaN amount → 0", itemNutrientContribution(100, Number.NaN), 0);

console.log("\n[B] display rounding — ham 94.64 → UI 95 kcal");
eq("formatAmount(94.64, kcal) = 95", formatAmount(94.64, "kcal"), "95");
eq("ham değer değişmez (94.64 saklanır)", Number(itemNutrientContribution(182, 52).toFixed(2)), 94.64);

console.log("\n[C] sumNutrients — öğün/gün toplamı (HAM accumulator)");
// Kahvaltı: Elma 182g (E52,P0.3,C13.8) + Yumurta 50g (E143,P13)
const elma = [
  { nutrient_code: "energy", amount: 52, unit_code: "kcal" },
  { nutrient_code: "protein", amount: 0.3, unit_code: "g" },
  { nutrient_code: "carbohydrate", amount: 13.8, unit_code: "g" },
];
const yumurta = [
  { nutrient_code: "energy", amount: 143, unit_code: "kcal" },
  { nutrient_code: "protein", amount: 13, unit_code: "g" },
];
const meal1 = sumNutrients([
  { grams: 182, nutrients: elma },     // E 94.64, P 0.546, C 25.116
  { grams: 50, nutrients: yumurta },   // E 71.5,  P 6.5
]);
eq("öğün energy = 166.14", Number(energyOf(meal1).toFixed(2)), 166.14);
eq("öğün protein = 7.046", Number((meal1.find((t) => t.nutrient_code === "protein")?.amount ?? 0).toFixed(3)), 7.046);
eq("öğün carbohydrate = 25.116", Number((meal1.find((t) => t.nutrient_code === "carbohydrate")?.amount ?? 0).toFixed(3)), 25.116);

// Gün = 2 öğün topla (meal1 tekrar + boş öğün)
const daySum = sumNutrients([
  { grams: 182, nutrients: elma }, { grams: 50, nutrients: yumurta },
  { grams: 100, nutrients: elma },  // Ara öğün: 1 elma daha 100g → E52
]);
eq("gün energy = 218.14", Number(energyOf(daySum).toFixed(2)), 218.14);
eq("boş item listesi = 0 enerji", energyOf(sumNutrients([])), 0);

console.log("\n[D] sumNutrients sıralaması — primary önce, secondary sonra, diğer en son");
const mixed = sumNutrients([{ grams: 100, nutrients: [
  { nutrient_code: "calcium", amount: 10, unit_code: "mg" },   // diğer
  { nutrient_code: "sodium", amount: 5, unit_code: "mg" },     // secondary
  { nutrient_code: "protein", amount: 3, unit_code: "g" },     // primary
  { nutrient_code: "energy", amount: 50, unit_code: "kcal" },  // primary (ilk)
] }]);
eq("ilk = energy (primary)", mixed[0].nutrient_code, "energy");
eq("energy primary listede", (PRIMARY_NUTRIENT_CODES as readonly string[]).includes("energy"), true);
eq("sodium secondary listede", (SECONDARY_NUTRIENT_CODES as readonly string[]).includes("sodium"), true);
eq("son = calcium (diğer)", mixed[mixed.length - 1].nutrient_code, "calcium");

console.log("\n[E] effectiveDailyTarget — gün override ?? plan default (§16)");
eq("gün override 2300 kazanır", effectiveDailyTarget(2300, 2000), 2300);
eq("override yok → plan default 2000", effectiveDailyTarget(null, 2000), 2000);
eq("ikisi de yok → null", effectiveDailyTarget(null, null), null);
eq("override 0/negatif yok sayılır → plan", effectiveDailyTarget(0, 2000), 2000);

console.log("\n[F] tarih güvenliği — daysBetween + cleanDate");
eq("02–31 Ağustos = 29 (inclusive 30 gün)", daysBetween("2026-08-02", "2026-08-31"), 29);
eq("aynı gün = 0", daysBetween("2026-08-02", "2026-08-02"), 0);
eq("ters aralık negatif (reddedilir)", daysBetween("2026-08-31", "2026-08-02"), -29);
eq("cleanDate geçerli", cleanDate("2026-08-02"), "2026-08-02");
eq("cleanDate geçersiz gün (02-31) → null", cleanDate("2026-02-31"), null);
eq("cleanDate malformed → null", cleanDate("2026/08/02"), null);
truthy("cleanDate boşluk trim", cleanDate("  2026-08-02  ") === "2026-08-02");

console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${fails.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Plan Motoru calc/totals/target/tarih: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));
