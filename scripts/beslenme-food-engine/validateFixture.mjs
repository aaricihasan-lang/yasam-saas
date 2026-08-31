// ============================================================
// Beslenme FAZ 4 — USDA fixture doğrulayıcı (STATİK, env-siz, deps-siz).
// Fixture'ı Class A vocabulary'siyle (nutrient/unit/food_group) çapraz doğrular.
// FAIL → exit 1.  node scripts/beslenme-food-engine/validateFixture.mjs
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const FIXTURE = resolve(ROOT, "data", "nutrition", "usda-foundation-v1.json");

let pass = 0, fail = 0;
const fails = [];
const ok = () => { pass++; };
const bad = (n) => { fail++; fails.push(n); };
const check = (n, c) => (c ? ok(n) : bad(n));

// ── Class A canonical vocab (seed 20261228000600 ile birebir) ──
const NUTRIENTS = {
  energy: "energy",
  protein: "macronutrient", carbohydrate: "macronutrient", total_fat: "macronutrient",
  saturated_fat: "macronutrient", fiber: "macronutrient", sugar: "macronutrient",
  sodium: "mineral", potassium: "mineral", calcium: "mineral", iron: "mineral",
  magnesium: "mineral", zinc: "mineral",
  vitamin_a: "vitamin", vitamin_c: "vitamin", vitamin_d: "vitamin", vitamin_b12: "vitamin", folate: "vitamin",
  epa: "fatty_acid", dha: "fatty_acid",
};
const UNIT_TYPE = {
  g: "mass", kg: "mass", mg: "mass", mcg: "mass",
  ml: "volume", l: "volume", kcal: "energy", kj: "energy",
  piece: "count", serving: "household", cup: "household", tbsp: "household", tsp: "household",
};
const NUTRIENT_UNIT_ALLOW = {
  energy: ["kcal", "kj"],
  macronutrient: ["g", "mg"],
  mineral: ["mg", "mcg", "g"],
  vitamin: ["mg", "mcg"],
  fatty_acid: ["mg", "g"],
  other: ["g", "mg", "mcg", "kcal", "kj", "ml", "l"],
};
const FOOD_GROUPS = new Set([
  "beverages", "citrus", "cruciferous", "dairy", "eggs", "fats_oils", "fish_seafood", "fruits",
  "grains_cereals", "leafy_greens", "legumes", "meat_poultry", "nuts_seeds", "sweets", "vegetables",
]);
const PORTION_UNIT_TYPES = new Set(["count", "household", "volume"]);
const PREP = new Set([null, "raw", "cooked", "processed"]);

console.log("[fixture] USDA foundation v1 doğrulama\n");
check("fixture dosyası mevcut", existsSize(FIXTURE));

let doc;
try { doc = JSON.parse(readFileSync(FIXTURE, "utf8")); }
catch (e) { bad(`fixture JSON parse: ${e.message}`); report(); }

check("provider = usda_fdc", doc.provider === "usda_fdc");
check("license CC0", /CC0/i.test(doc.license || ""));
check("attribution mevcut (USDA/FoodData Central)", /FoodData Central/i.test(doc.attribution || ""));
check("basis 'per 100 g'", /100\s*g/i.test(doc.basis || ""));
check("foods dizisi", Array.isArray(doc.foods) && doc.foods.length >= 20);

const seenFdc = new Set();
const seenName = new Set();
for (const f of doc.foods ?? []) {
  const tag = f.name_tr || f.fdc_id || "?";
  check(`${tag}: name_tr dolu`, typeof f.name_tr === "string" && f.name_tr.trim() !== "");
  check(`${tag}: fdc_id dolu`, typeof f.fdc_id === "string" && f.fdc_id.trim() !== "");
  check(`${tag}: fdc_id tekil`, f.fdc_id && !seenFdc.has(f.fdc_id));
  if (f.fdc_id) seenFdc.add(f.fdc_id);
  check(`${tag}: name tekil`, f.name_tr && !seenName.has(f.name_tr.toLowerCase()));
  if (f.name_tr) seenName.add(f.name_tr.toLowerCase());
  check(`${tag}: food_group geçerli`, FOOD_GROUPS.has(f.food_group));
  check(`${tag}: prep_state geçerli`, PREP.has(f.prep_state ?? null));

  const codes = Object.keys(f.nutrients ?? {});
  check(`${tag}: en az energy nutrient'i var`, codes.includes("energy"));
  for (const [code, val] of Object.entries(f.nutrients ?? {})) {
    const cat = NUTRIENTS[code];
    check(`${tag}/${code}: bilinen nutrient`, !!cat);
    check(`${tag}/${code}: unit tanımlı`, val && typeof val.unit === "string" && UNIT_TYPE[val.unit]);
    check(`${tag}/${code}: unit kategori-uyumlu`, cat && (NUTRIENT_UNIT_ALLOW[cat] || []).includes(val?.unit));
    check(`${tag}/${code}: amount sonlu sayı ≥ 0`, typeof val?.amount === "number" && Number.isFinite(val.amount) && val.amount >= 0);
  }
  for (const p of f.portions ?? []) {
    check(`${tag}/portion: label_tr dolu`, typeof p.label_tr === "string" && p.label_tr.trim() !== "");
    check(`${tag}/portion: measure_unit count/household/volume`, PORTION_UNIT_TYPES.has(UNIT_TYPE[p.measure_unit]));
    check(`${tag}/portion: gram_weight > 0`, typeof p.gram_weight === "number" && p.gram_weight > 0);
    if (p.quantity != null) check(`${tag}/portion: quantity > 0`, typeof p.quantity === "number" && p.quantity > 0);
  }
}
check("20+ tekil fdc_id", seenFdc.size >= 20);

report();

function existsSize(p) { return existsSync(p); }
function report() {
  console.log(`\n${"=".repeat(52)}`);
  console.log(`  FIXTURE: ${pass} PASS · ${fail} FAIL`);
  if (fail) { console.log(`  FAILURES:\n   - ${fails.join("\n   - ")}`); console.log("=".repeat(52)); process.exit(1); }
  console.log("  ✅ USDA fixture doğrulaması: TÜM KONTROLLER GEÇTİ");
  console.log("=".repeat(52));
  process.exit(0);
}
