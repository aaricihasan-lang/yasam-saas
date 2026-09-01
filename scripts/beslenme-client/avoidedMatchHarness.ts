// ============================================================
// Beslenme FAZ 7 — Kaçınılan besin eşleşmesi SAF-logic harness'i.
// §17: exact structured food_id; fuzzy food_label YOK; null → asla eşleşmez.
// FAIL → exit 1.
// ============================================================
import { isAvoidedFood, collectAvoidedFoodIds } from "../../lib/beslenme/avoidedMatch";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); } };

const AVOID = "11111111-1111-4111-8111-111111111111";
const PREF = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const prefs = [
  { stance: "avoided", food_id: AVOID },
  { stance: "avoided", food_id: null },        // label-only → id kümesine girmez
  { stance: "preferred", food_id: PREF },       // preferred → avoided değil
];
const avoidedIds = collectAvoidedFoodIds(prefs);

ok("collectAvoidedFoodIds YALNIZ structured avoided'ı toplar (size=1)", avoidedIds.size === 1);
ok("structured avoided id kümede", avoidedIds.has(AVOID));
ok("preferred id kümede DEĞİL", !avoidedIds.has(PREF));
ok("label-only (null) id kümede DEĞİL", !avoidedIds.has(null as unknown as string));

ok("exact avoided food_id → advisory", isAvoidedFood(AVOID, avoidedIds) === true);
ok("preferred food_id → uyarı YOK", isAvoidedFood(PREF, avoidedIds) === false);
ok("ilgisiz food_id → uyarı YOK", isAvoidedFood(OTHER, avoidedIds) === false);
ok("null food_id (katalog-dışı item) → uyarı YOK", isAvoidedFood(null, avoidedIds) === false);
ok("undefined food_id → uyarı YOK", isAvoidedFood(undefined, avoidedIds) === false);
ok("boş küme → asla eşleşmez", isAvoidedFood(AVOID, new Set<string>()) === false);

console.log(`\n=== AVOIDED-MATCH HARNESS: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
