// ============================================================
// Beslenme FAZ 6 — Küratörlü katalog manifest doğrulayıcı (STATİK, env-siz, deps-siz).
// validateFixture.mjs genelleştirmesi: v2 manifestini Class A vocabulary'siyle
// (nutrient/unit/food_group) çapraz doğrular. Boş foods'u zarifçe geçer.
//
// KULLANIM:
//   node scripts/beslenme-food-engine/validateCatalog.mjs                                   # default: usda-curated-v2.json
//   node scripts/beslenme-food-engine/validateCatalog.mjs --manifest data/nutrition/x.json  # farklı manifest
//   node scripts/beslenme-food-engine/validateCatalog.mjs --min 20                           # en az N tekil food (default 0)
//
// FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DEFAULT_MANIFEST = resolve(ROOT, "data", "nutrition", "usda-curated-v2.json");

// arg parse.
const argv = process.argv;
let MANIFEST = DEFAULT_MANIFEST;
const mi = argv.indexOf("--manifest");
if (mi !== -1 && argv[mi + 1]) MANIFEST = resolve(process.cwd(), argv[mi + 1]);
let MIN = 0; // AŞAMA 2 varsayılanı: sayı kapısı 0 (boş foods geçerli)
const ci = argv.indexOf("--min");
if (ci !== -1 && argv[ci + 1] != null) {
  const parsed = Number(argv[ci + 1]);
  if (Number.isFinite(parsed) && parsed >= 0) MIN = Math.floor(parsed);
}

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
// 13 kanonik unit kodu.
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
// 15 seed food_group kodu.
const FOOD_GROUPS = new Set([
  "beverages", "citrus", "cruciferous", "dairy", "eggs", "fats_oils", "fish_seafood", "fruits",
  "grains_cereals", "leafy_greens", "legumes", "meat_poultry", "nuts_seeds", "sweets", "vegetables",
]);
const PORTION_UNIT_TYPES = new Set(["count", "household", "volume"]);
const PREP = new Set([null, "raw", "cooked", "processed"]);

// name_tr normalizasyonu (tekillik için): tr-locale lowercase + trim.
const normName = (s) => (typeof s === "string" ? s.trim().toLocaleLowerCase("tr") : "");

console.log(`[catalog] USDA küratörlü v2 doğrulama (min=${MIN})\n`);
check("manifest dosyası mevcut", existsSync(MANIFEST));

let doc;
try { doc = JSON.parse(readFileSync(MANIFEST, "utf8")); }
catch (e) { bad(`manifest JSON parse: ${e.message}`); report(); }

check("provider = usda_fdc", doc.provider === "usda_fdc");
check("provider turkomp DEĞİL", doc.provider !== "turkomp");
check("dataset mevcut", typeof doc.dataset === "string" && doc.dataset.trim() !== "");
check("branded-bulk artefaktı YOK (dataset)", !/branded/i.test(doc.dataset || ""));
check("license CC0", /CC0/i.test(doc.license || ""));
check("attribution mevcut (USDA/FoodData Central)", /FoodData Central/i.test(doc.attribution || ""));
check("basis 'per 100 g'", /100\s*g/i.test(doc.basis || ""));
check("foods dizisi (boş olabilir)", Array.isArray(doc.foods));

const seenFdc = new Set();
const seenName = new Set();
for (const f of doc.foods ?? []) {
  const tag = f.name_tr || f.fdc_id || "?";
  check(`${tag}: name_tr dolu`, typeof f.name_tr === "string" && f.name_tr.trim() !== "");
  check(`${tag}: name_en dolu`, typeof f.name_en === "string" && f.name_en.trim() !== "");
  check(`${tag}: fdc_id dolu`, typeof f.fdc_id === "string" && f.fdc_id.trim() !== "");
  check(`${tag}: fdc_id tekil`, f.fdc_id && !seenFdc.has(f.fdc_id));
  if (f.fdc_id) seenFdc.add(f.fdc_id);
  const nn = normName(f.name_tr);
  check(`${tag}: name_tr tekil (normalize)`, nn && !seenName.has(nn));
  if (nn) seenName.add(nn);
  check(`${tag}: food_group geçerli (15 kod)`, FOOD_GROUPS.has(f.food_group));
  check(`${tag}: prep_state geçerli`, PREP.has(f.prep_state ?? null));

  // aliases normalize: dizi, her biri nonempty + trimmed + tr-lowercase.
  const aliases = f.aliases ?? [];
  check(`${tag}: aliases dizi`, Array.isArray(aliases));
  for (const a of Array.isArray(aliases) ? aliases : []) {
    check(`${tag}/alias "${a}": normalize (trim+tr-lower)`,
      typeof a === "string" && a.trim() !== "" && a === a.trim() && a === a.toLocaleLowerCase("tr"));
  }

  const codes = Object.keys(f.nutrients ?? {});
  check(`${tag}: en az energy nutrient'i var`, codes.includes("energy"));
  for (const [code, val] of Object.entries(f.nutrients ?? {})) {
    const cat = NUTRIENTS[code];
    check(`${tag}/${code}: bilinen nutrient`, !!cat);
    check(`${tag}/${code}: unit 13 kanonik koddan biri`, val && typeof val.unit === "string" && !!UNIT_TYPE[val.unit]);
    check(`${tag}/${code}: unit kategori-uyumlu`, cat && (NUTRIENT_UNIT_ALLOW[cat] || []).includes(val?.unit));
    check(`${tag}/${code}: amount sonlu sayı ≥ 0`, typeof val?.amount === "number" && Number.isFinite(val.amount) && val.amount >= 0);
  }
  // missing ≠ fake-zero: gerçek besinin enerjisi > 0 (eksik nutrient atlanır, 0 uydurulmaz).
  const energy = (f.nutrients ?? {}).energy;
  check(`${tag}: energy > 0 (fake-zero değil)`, typeof energy?.amount === "number" && energy.amount > 0);

  for (const p of f.portions ?? []) {
    check(`${tag}/portion: label_tr dolu`, typeof p.label_tr === "string" && p.label_tr.trim() !== "");
    check(`${tag}/portion: measure_unit count/household/volume`, PORTION_UNIT_TYPES.has(UNIT_TYPE[p.measure_unit]));
    check(`${tag}/portion: gram_weight > 0`, typeof p.gram_weight === "number" && p.gram_weight > 0);
    if (p.quantity != null) check(`${tag}/portion: quantity > 0`, typeof p.quantity === "number" && p.quantity > 0);
  }
}
check(`en az ${MIN} tekil fdc_id (min kapısı)`, seenFdc.size >= MIN);

console.log(`[catalog] doğrulanan tekil food sayısı: ${seenFdc.size}`);
report();

function report() {
  console.log(`\n${"=".repeat(52)}`);
  console.log(`  CATALOG: ${pass} PASS · ${fail} FAIL`);
  if (fail) { console.log(`  FAILURES:\n   - ${fails.join("\n   - ")}`); console.log("=".repeat(52)); process.exit(1); }
  console.log("  ✅ USDA küratörlü v2 doğrulaması: TÜM KONTROLLER GEÇTİ");
  console.log("=".repeat(52));
  process.exit(0);
}
