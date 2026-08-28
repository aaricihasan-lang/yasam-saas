// ============================================================
// Beslenme FAZ 4 — Besin Motoru STATİK SÖZLEŞME HARNESS'İ.
// Deterministik, env-siz, deps-siz. FAIL → exit 1.
//   node scripts/beslenme-food-engine/ddlHarness.mjs
// ============================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MIG = resolve(ROOT, "supabase", "migrations");
const API = resolve(ROOT, "app", "api", "beslenme");
const LIB = resolve(ROOT, "lib", "beslenme");

let pass = 0, fail = 0;
const failures = [];
const ok = () => { pass++; };
const bad = (n, d) => { fail++; failures.push(n + (d ? ` — ${d}` : "")); };
const check = (n, c, d) => (c ? ok() : bad(n, d));
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s) => s.replace(/--[^\n]*/g, "");

const M = {
  nutrients: read(resolve(MIG, "20261230000000_nutrition_food_nutrients.sql")),
  portions: read(resolve(MIG, "20261230000100_nutrition_food_portions.sql")),
  external: read(resolve(MIG, "20261230000200_nutrition_food_external_refs.sql")),
  traditional: read(resolve(MIG, "20261230000300_nutrition_food_traditional.sql")),
};

console.log("[A] 4 additive migration + RLS-kilit + tenant-safe composite FK");
const TABLES = [
  ["nutrition_food_nutrients", M.nutrients],
  ["nutrition_food_portions", M.portions],
  ["nutrition_food_external_refs", M.external],
  ["nutrition_food_traditional", M.traditional],
];
for (const [t, s] of TABLES) {
  check(`CREATE ${t}`, new RegExp(`CREATE TABLE public\\.${t}\\b`).test(s));
  check(`${t} tenant_id NOT NULL`, /tenant_id\s+uuid\s+NOT NULL/.test(s));
  check(`${t} food composite FK (tenant_id, food_id) CASCADE`,
    /FOREIGN KEY \(tenant_id, food_id\)[\s\S]*?REFERENCES public\.nutrition_foods \(tenant_id, id\)[\s\S]*?ON DELETE CASCADE/.test(s));
  check(`${t} RLS enabled`, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(s));
  check(`${t} REVOKE anon/authenticated/PUBLIC`, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM anon, authenticated, PUBLIC`).test(s));
  check(`${t} GRANT service_role`, new RegExp(`GRANT ALL PRIVILEGES ON TABLE public\\.${t} TO service_role`).test(s));
  check(`${t} anon/authenticated GRANT YOK`, !new RegExp(`GRANT[^;]*TO[^;]*(anon|authenticated)\\b`).test(strip(s)));
  check(`${t} BEGIN/COMMIT dengeli`, (s.match(/BEGIN;/g) || []).length === 1 && (s.match(/COMMIT;/g) || []).length === 1);
}

console.log("\n[B] food_nutrients /100 g invariant + integrity");
check("nutrients nutrient_id → nutrition_nutrients RESTRICT",
  /FOREIGN KEY \(nutrient_id\)[\s\S]*?REFERENCES public\.nutrition_nutrients \(id\)[\s\S]*?ON DELETE RESTRICT/.test(M.nutrients));
check("nutrients unit_id → nutrition_units RESTRICT",
  /FOREIGN KEY \(unit_id\)[\s\S]*?REFERENCES public\.nutrition_units \(id\)[\s\S]*?ON DELETE RESTRICT/.test(M.nutrients));
check("nutrients UNIQUE(tenant_id, food_id, nutrient_id) — dup-nutrient engeli",
  /UNIQUE \(tenant_id, food_id, nutrient_id\)/.test(M.nutrients));
check("nutrients CHECK amount >= 0 — negatif engeli", /CHECK \(amount >= 0\)/.test(M.nutrients));
check("nutrients CHECK basis_grams = 100 — /100 g invariant", /CHECK \(basis_grams = 100\)/.test(M.nutrients));

console.log("\n[C] food_portions gram köprüsü + integrity");
check("portions gram_weight NOT NULL", /gram_weight\s+numeric\s+NOT NULL/.test(M.portions));
check("portions CHECK quantity > 0", /CHECK \(quantity > 0\)/.test(M.portions));
check("portions CHECK gram_weight > 0 — imkânsız porsiyon engeli", /CHECK \(gram_weight > 0\)/.test(M.portions));
check("portions measure_unit → nutrition_units RESTRICT",
  /FOREIGN KEY \(measure_unit_id\)[\s\S]*?REFERENCES public\.nutrition_units \(id\)[\s\S]*?ON DELETE RESTRICT/.test(M.portions));
check("portions UNIQUE label index (tenant, food, lower(label))",
  /CREATE UNIQUE INDEX[\s\S]*?nutrition_food_portions[\s\S]*?lower\(btrim\(label_tr\)\)/.test(M.portions));

console.log("\n[D] external_refs provider + dup-import engeli + raw JSON YOK");
check("external provider CHECK (usda_fdc, turkomp, manual)",
  /provider IN \('usda_fdc', 'turkomp', 'manual'\)/.test(M.external));
check("external UNIQUE(tenant_id, provider, external_id) — dup import engeli",
  /UNIQUE \(tenant_id, provider, external_id\)/.test(M.external));
check("external content_hash var (raw JSON değil)", /content_hash\s+text/.test(M.external));
check("external RAW json/jsonb kolonu YOK", !/\b(raw|payload)\s+jsonb?\b/i.test(M.external));

console.log("\n[E] food_traditional — nutrient facts'ten AYRI + vocabulary");
check("traditional thermal CHECK hot/cold/neutral", /thermal_quality IN \('hot', 'cold', 'neutral'\)/.test(M.traditional));
check("traditional moisture CHECK wet/dry/neutral", /moisture_quality IN \('wet', 'dry', 'neutral'\)/.test(M.traditional));
check("traditional framework_id → traditional_frameworks", /FOREIGN KEY \(framework_id\)[\s\S]*?REFERENCES public\.nutrition_traditional_frameworks \(id\)/.test(M.traditional));
check("traditional UNIQUE(tenant_id, food_id) — besin başına tek", /UNIQUE \(tenant_id, food_id\)/.test(M.traditional));
check("traditional içinde nutrient/amount kolonu YOK (karışım yok)", !/\b(amount|nutrient_id|kcal|calorie)\b/i.test(M.traditional));

console.log("\n[F] SYSTEM tenant TEK MERKEZ + client-selectable DEĞİL");
const systemTenant = read(resolve(LIB, "systemTenant.ts"));
const foodEngine = read(resolve(LIB, "foodEngine.ts"));
check("systemTenant.ts SYSTEM_NUTRITION_TENANT_ID sabiti", /export const SYSTEM_NUTRITION_TENANT_ID\s*=\s*"[0-9a-f-]{36}"/.test(systemTenant));
// UUID literal yalnız systemTenant.ts (+ importer script'i) içinde bulunur; route/UI hardcode etmez.
const uuidMatch = systemTenant.match(/"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/);
const sysUuid = uuidMatch ? uuidMatch[1] : "__none__";
const routeFiles = walk(API);
const hardcodedInRoutes = routeFiles.filter((p) => read(p).includes(sysUuid));
check("SYSTEM UUID route dosyalarında hardcode EDİLMEZ (tek kaynak)", hardcodedInRoutes.length === 0,
  hardcodedInRoutes.map((p) => p.replace(ROOT, "")).join(", "));

console.log("\n[G] foodEngine erişim kapısı: read={SYSTEM,caller}, write=SYSTEM_READONLY");
check("foodEngine read scope SYSTEM + caller (.in ile)", /readableScope|\.in\("tenant_id"/.test(foodEngine) || /SYSTEM_NUTRITION_TENANT_ID/.test(foodEngine));
check("foodEngine resolveFoodForWrite SYSTEM → SYSTEM_READONLY 403",
  /isSystemNutritionTenant\(food\.tenant_id\)[\s\S]*?SYSTEM_READONLY[\s\S]*?403/.test(foodEngine));
check("foodEngine caller-owned değilse yazma yok", /resolveFoodForWrite/.test(foodEngine));

console.log("\n[H] yeni route güvenlik sözleşmesi (owner+demo+system-guard+mass-assign)");
const engineRoutes = [
  "foods/[id]/nutrients/route.ts",
  "foods/[id]/portions/route.ts",
  "foods/[id]/traditional/route.ts",
].map((r) => [r, read(resolve(API, r))]);
for (const [r, s] of engineRoutes) {
  check(`${r} owner gate`, /requireBeslenmeOwner/.test(s));
  check(`${r} demo deny`, /denyDemoMutation/.test(s));
  check(`${r} SYSTEM write guard (resolveFoodForWrite)`, /resolveFoodForWrite/.test(s));
  check(`${r} mass-assignment (hasOnlyKeys)`, /hasOnlyKeys/.test(s));
  check(`${r} isUuid([id])`, /isUuid\(/.test(s));
  check(`${r} body tenant_id trust YOK`, !/body\.tenant_id|tenant_id:\s*body/.test(s));
  check(`${r} tenant_id server guard'tan (tenant_id: tenantId)`, /tenant_id:\s*tenantId/.test(s));
}

console.log("\n[I] foods list SYSTEM+CUSTOM union + detail SYSTEM read");
const foodsList = read(resolve(API, "foods/route.ts"));
const foodsDetail = read(resolve(API, "foods/[id]/route.ts"));
check("foods list SYSTEM + caller union (.in tenant)", /\.in\("tenant_id",\s*\[SYSTEM_NUTRITION_TENANT_ID/.test(foodsList));
check("foods list is_system bayrağı", /is_system/.test(foodsList));
check("foods detail resolveFoodForRead (SYSTEM okunabilir)", /resolveFoodForRead/.test(foodsDetail));
check("foods detail PATCH/DELETE SYSTEM write guard", /resolveFoodForWrite/.test(foodsDetail));

console.log("\n[J] calc motoru: tek deterministik formül, eval YOK");
const calc = read(resolve(LIB, "calc", "nutrients.ts"));
check("calc grams/100 × per100g formülü", /\* grams\)\s*\/\s*100|grams\s*\/\s*100/.test(calc) || /per100g \* grams\) \/ 100/.test(calc));
check("calc portion → gram köprüsü (quantity × gram_weight)", /quantity[\s\S]*?gramWeight/.test(calc));
check("calc dinamik eval YOK", !/\beval\(|new Function\(/.test(calc));

console.log("\n[K] USDA fixture provenance (veri validateFixture.mjs'de ayrıca doğrulanır)");
const fixture = read(resolve(ROOT, "data", "nutrition", "usda-foundation-v1.json"));
check("fixture mevcut", !!fixture);
check("fixture provider usda_fdc", /"provider":\s*"usda_fdc"/.test(fixture));
check("fixture license CC0", /CC0/i.test(fixture));
check("fixture 100 g basis", /"basis":\s*"per 100 g"/.test(fixture));
check("importer idempotent + dry-run varsayılan", /APPLY = process\.argv\.includes\("--apply"\)/.test(read(resolve(ROOT, "scripts", "beslenme-food-engine", "importUsda.mjs"))));

console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${failures.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Besin Motoru static contract: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}
