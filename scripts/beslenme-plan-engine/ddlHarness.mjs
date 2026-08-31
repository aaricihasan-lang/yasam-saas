// ============================================================
// Beslenme FAZ 5 — Plan Motoru STATİK SÖZLEŞME HARNESS'İ.
// Deterministik, env-siz, deps-siz. FAIL → exit 1.
//   node scripts/beslenme-plan-engine/ddlHarness.mjs
// ============================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MIG = resolve(ROOT, "supabase", "migrations");
const API = resolve(ROOT, "app", "api", "beslenme", "plans");
const LIB = resolve(ROOT, "lib", "beslenme");

let pass = 0, fail = 0;
const failures = [];
const ok = () => { pass++; };
const bad = (n, d) => { fail++; failures.push(n + (d ? ` — ${d}` : "")); };
const check = (n, c, d) => (c ? ok() : bad(n, d));
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s) => s.replace(/--[^\n]*/g, "");

const M = {
  plans: read(resolve(MIG, "20261231000000_nutrition_plans.sql")),
  days: read(resolve(MIG, "20261231000100_nutrition_plan_days.sql")),
  meals: read(resolve(MIG, "20261231000200_nutrition_plan_meals.sql")),
  items: read(resolve(MIG, "20261231000300_nutrition_plan_items.sql")),
  nutrients: read(resolve(MIG, "20261231000400_nutrition_plan_item_nutrients.sql")),
  rpc: read(resolve(MIG, "20261231000500_nutrition_plan_rpcs.sql")),
};

console.log("[A] 5 additive migration + RLS-kilit + tenant-safe composite parent FK");
const TABLES = [
  ["nutrition_plans", M.plans],
  ["nutrition_plan_days", M.days],
  ["nutrition_plan_meals", M.meals],
  ["nutrition_plan_items", M.items],
  ["nutrition_plan_item_nutrients", M.nutrients],
];
for (const [t, s] of TABLES) {
  check(`CREATE ${t}`, new RegExp(`CREATE TABLE public\\.${t}\\b`).test(s));
  check(`${t} tenant_id NOT NULL`, /tenant_id\s+uuid\s+NOT NULL/.test(s));
  check(`${t} RLS enabled`, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(s));
  check(`${t} REVOKE anon/authenticated/PUBLIC`, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM anon, authenticated, PUBLIC`).test(s));
  check(`${t} GRANT service_role`, new RegExp(`GRANT ALL PRIVILEGES ON TABLE public\\.${t} TO service_role`).test(s));
  check(`${t} anon/authenticated GRANT YOK`, !new RegExp(`GRANT[^;]*TO[^;]*(anon|authenticated)\\b`).test(strip(s)));
  check(`${t} BEGIN/COMMIT dengeli`, (s.match(/BEGIN;/g) || []).length === 1 && (s.match(/COMMIT;/g) || []).length === 1);
}

console.log("\n[B] plans — kimlik + revizyon + lifecycle + composite hedef");
check("plans UNIQUE(tenant_id, id) — child FK hedefi", /UNIQUE \(tenant_id, id\)/.test(M.plans));
check("plans UNIQUE(tenant_id, plan_family_id, revision_number)", /UNIQUE \(tenant_id, plan_family_id, revision_number\)/.test(M.plans));
check("plans status CHECK draft/active/archived", /status IN \('draft', 'active', 'archived'\)/.test(M.plans));
check("plans title non-empty CHECK", /CHECK \(btrim\(title\) <> ''\)/.test(M.plans));
check("plans end_date >= start_date CHECK", /CHECK \(end_date >= start_date\)/.test(M.plans));
check("plans energy target NULL veya >0", /daily_energy_target IS NULL OR daily_energy_target > 0/.test(M.plans));
check("plans revision > 0 CHECK", /CHECK \(revision_number > 0\)/.test(M.plans));
check("plans client_id KOLONU YOK (danışan bu fazda bağlanmaz)", !/client_id\s+uuid/.test(M.plans));

console.log("\n[C] days — dense + composite plan FK CASCADE + child hedefi");
check("days composite FK (tenant_id, plan_id) → plans(tenant_id, id) CASCADE",
  /FOREIGN KEY \(tenant_id, plan_id\)[\s\S]*?REFERENCES public\.nutrition_plans \(tenant_id, id\)[\s\S]*?ON DELETE CASCADE/.test(M.days));
check("days UNIQUE(tenant_id, plan_id, plan_date) — dense gün tekil", /UNIQUE \(tenant_id, plan_id, plan_date\)/.test(M.days));
check("days UNIQUE(tenant_id, plan_id, id) — meal FK hedefi", /UNIQUE \(tenant_id, plan_id, id\)/.test(M.days));
check("days target NULL veya >0", /energy_target_override IS NULL OR energy_target_override > 0/.test(M.days));

console.log("\n[D] meals — composite day FK (plan_id dahil) CASCADE + child hedefi");
check("meals composite FK (tenant_id, plan_id, plan_day_id) → days(tenant_id, plan_id, id) CASCADE",
  /FOREIGN KEY \(tenant_id, plan_id, plan_day_id\)[\s\S]*?REFERENCES public\.nutrition_plan_days \(tenant_id, plan_id, id\)[\s\S]*?ON DELETE CASCADE/.test(M.meals));
check("meals UNIQUE(tenant_id, plan_id, id) — item FK hedefi", /UNIQUE \(tenant_id, plan_id, id\)/.test(M.meals));
check("meals label non-empty CHECK", /CHECK \(btrim\(label\) <> ''\)/.test(M.meals));
check("meals meal_type NULL veya canonical enum", /meal_type IS NULL OR meal_type IN \('breakfast', 'snack', 'lunch', 'dinner', 'late_snack'\)/.test(M.meals));

console.log("\n[E] items — composite meal FK + SNAPSHOT + food PHYSICAL FK YOK");
check("items composite FK (tenant_id, plan_id, meal_id) → meals(tenant_id, plan_id, id) CASCADE",
  /FOREIGN KEY \(tenant_id, plan_id, meal_id\)[\s\S]*?REFERENCES public\.nutrition_plan_meals \(tenant_id, plan_id, id\)[\s\S]*?ON DELETE CASCADE/.test(M.items));
check("items UNIQUE(tenant_id, id) — nutrient FK hedefi", /UNIQUE \(tenant_id, id\)/.test(M.items));
check("items grams > 0 CHECK", /CHECK \(grams > 0\)/.test(M.items));
check("items quantity NULL veya >0", /quantity IS NULL OR quantity > 0/.test(M.items));
check("items ownership CHECK system/custom", /food_ownership_snapshot IN \('system', 'custom'\)/.test(M.items));
check("items food_name_snapshot NOT NULL + non-empty", /food_name_snapshot\s+text\s+NOT NULL/.test(M.items) && /CHECK \(btrim\(food_name_snapshot\) <> ''\)/.test(M.items));
check("items portion_gram NULL veya >0", /portion_gram_snapshot IS NULL OR portion_gram_snapshot > 0/.test(M.items));
check("items TÜM snapshot kolonları var",
  /portion_label_snapshot/.test(M.items) && /external_provider_snapshot/.test(M.items) && /external_version_snapshot/.test(M.items));
check("items food_id fiziksel FK YOK (soft pointer) — nutrition_foods REFERENCES yok", !/REFERENCES public\.nutrition_foods/.test(M.items));

console.log("\n[F] item_nutrients — frozen snapshot, global vocab FK YOK");
check("nutrients composite FK (tenant_id, item_id) → items(tenant_id, id) CASCADE",
  /FOREIGN KEY \(tenant_id, item_id\)[\s\S]*?REFERENCES public\.nutrition_plan_items \(tenant_id, id\)[\s\S]*?ON DELETE CASCADE/.test(M.nutrients));
check("nutrients UNIQUE(tenant_id, item_id, nutrient_code)", /UNIQUE \(tenant_id, item_id, nutrient_code\)/.test(M.nutrients));
check("nutrients amount >= 0 CHECK", /CHECK \(amount >= 0\)/.test(M.nutrients));
check("nutrients nutrient_code/unit_code TEXT (kod, FK değil)", /nutrient_code\s+text\s+NOT NULL/.test(M.nutrients) && /unit_code\s+text\s+NOT NULL/.test(M.nutrients));
check("nutrients global nutrition_nutrients FK YOK", !/REFERENCES public\.nutrition_nutrients/.test(M.nutrients));
check("nutrients global nutrition_units FK YOK", !/REFERENCES public\.nutrition_units/.test(M.nutrients));

console.log("\n[G] RPC privilege lock + SECURITY INVOKER + archived guard + deep-copy remap");
const FUNCS = [
  "nutrition_plan_create_with_days",
  "nutrition_plan_sync_range",
  "nutrition_plan_item_create_or_replace",
  "nutrition_plan_item_copy",
  "nutrition_plan_day_copy",
  "nutrition_plan_copy_meals_into_day",
  "nutrition_plan_meal_copy",
  "nutrition_plan_week_copy",
  "nutrition_plan_copy_tree",
  "nutrition_plan_copy",
  "nutrition_plan_revise",
];
for (const f of FUNCS) {
  check(`RPC ${f} tanımlı`, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${f}\\b`).test(M.rpc));
  check(`RPC ${f} REVOKE FROM PUBLIC, anon, authenticated`,
    new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\S]{0,80}?FROM PUBLIC, anon, authenticated`).test(M.rpc));
  check(`RPC ${f} GRANT EXECUTE service_role`,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\S]{0,60}?TO service_role`).test(M.rpc));
}
check("RPC hepsi SECURITY INVOKER (DEFINER YOK)", /SECURITY INVOKER/.test(M.rpc) && !/SECURITY DEFINER/.test(M.rpc));
check("RPC sabit search_path", /SET search_path = pg_catalog, public/.test(M.rpc));
check("RPC archived guard 45010", /ERRCODE = '45010'/.test(M.rpc));
check("RPC range-has-content 45011 (ZERO deletion)", /ERRCODE = '45011'/.test(M.rpc));
check("RPC target-not-empty 45012", /ERRCODE = '45012'/.test(M.rpc));
check("RPC range-out-of-bounds 45013", /ERRCODE = '45013'/.test(M.rpc));
check("RPC deep-copy MATERIALIZED CTE remap", /AS MATERIALIZED/.test(M.rpc));
check("RPC create_with_days family = plan.id (deterministik)", /plan_family_id[\s\S]*?v_plan_id/.test(M.rpc));
check("RPC revise race-safe FOR UPDATE + max+1", /coalesce\(max\(revision_number\), 0\) \+ 1/.test(M.rpc) && /FOR UPDATE/.test(M.rpc));

console.log("\n[H] API route güvenlik sözleşmesi (owner + demo + mass-assign + tenant-server)");
const routeFiles = walk(API);
check("plans route ağacı mevcut (>=12 route.ts)", routeFiles.length >= 12, `bulundu: ${routeFiles.length}`);
for (const p of routeFiles) {
  const s = read(p);
  const rel = p.replace(ROOT, "");
  check(`${rel} owner gate`, /requireBeslenmeOwner/.test(s));
  check(`${rel} body tenant_id trust YOK`, !/body\.tenant_id|tenant_id:\s*body/.test(s));
  // JSON gövde parse eden route'lar mass-assignment koruması taşımalı (hasOnlyKeys).
  //   (clear/revise gibi gövdesiz action route'ları req.json() çağırmaz → muaf.)
  if (/req\.json\(\)/.test(s)) check(`${rel} mass-assignment (hasOnlyKeys)`, /hasOnlyKeys/.test(s));
  // mutation route'ları demo-deny içermeli (yalnız-GET route hariç).
  const hasMutation = /export async function (POST|PATCH|PUT|DELETE)/.test(s);
  if (hasMutation) check(`${rel} demo deny (mutation)`, /denyDemoMutation/.test(s));
  // tenant server-side: guard'tan gelen tenantId ile filtre/yazım/RPC (ASLA body'den).
  // tenant server-side: guard'tan gelen tenantId ile filtre/yazım/RPC (ASLA body'den).
  //   Doğrudan (.eq/p_tenant_id/tenant_id:) VEYA server-only builder'a delege: fn(db, tenantId, …)
  //   (ör. buildPlanDocxBuffer(db, tenantId, id) — tenant-scoped okuma builder içinde).
  if (hasMutation) check(`${rel} tenant server guard'tan (tenantId)`,
    /\.eq\("tenant_id",\s*tenantId\)|tenant_id:\s*tenantId|p_tenant_id:\s*tenantId|\(db,\s*tenantId[,)]/.test(s));
}

console.log("\n[I] SNAPSHOT client'tan gelmez — item POST/PUT server-authoritative");
const itemsPost = read(resolve(API, "[id]", "meals", "[mealId]", "items", "route.ts"));
const itemDetail = read(resolve(API, "[id]", "items", "[itemId]", "route.ts"));
check("item POST buildItemSnapshot (server üretir)", /buildItemSnapshot/.test(itemsPost));
check("item POST allowlist food_name/kcal İÇERMEZ (spoof engeli)",
  !/food_name|food_ownership|nutrient|kcal/i.test(read(resolve(LIB, "planContracts.ts")).match(/ITEM_INPUT_KEYS =[^;]*/)?.[0] ?? ""));
check("item PUT (replace) buildItemSnapshot + RPC replace", /buildItemSnapshot/.test(itemDetail) && /nutrition_plan_item_create_or_replace/.test(itemDetail));
check("item PATCH (amount) frozen nutrient — nutrient tablosuna yazmaz",
  !/nutrition_plan_item_nutrients[\s\S]*?\.insert|\.upsert\([\s\S]*?nutrition_plan_item_nutrients/.test(itemDetail));

console.log("\n[J] archived enforcement API + lib editable kapısı");
const planEngine = read(resolve(LIB, "planEngine.ts"));
check("planEngine isPlanEditable draft|active", /status === "draft" \|\| status === "active"/.test(planEngine));
check("planEngine mapRpcError 45010→403 PLAN_ARCHIVED", /case "45010":\s*return \{ code: "PLAN_ARCHIVED", status: 403 \}/.test(planEngine));
check("API PLAN_ARCHIVED reddi (routes)", routeFiles.some((p) => /PLAN_ARCHIVED/.test(read(p))));

console.log("\n[K] parent consistency — plan_id zinciri (day→meal→item)");
check("days plan_id kolonu", /plan_id\s+uuid\s+NOT NULL/.test(M.days));
check("meals plan_id kolonu", /plan_id\s+uuid\s+NOT NULL/.test(M.meals));
check("items plan_id kolonu", /plan_id\s+uuid\s+NOT NULL/.test(M.items));

console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${failures.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Plan Motoru static contract: TÜM KONTROLLER GEÇTİ");
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
