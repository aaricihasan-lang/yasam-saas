// ============================================================
// Beslenme FAZ 7 — Danışan Entegrasyonu STATİK DDL/güvenlik sözleşmesi harness'i.
// Deterministik, env-siz, deps-siz. RLS/GRANT/trigger/FK kilidini regex ile doğrular
// (PGlite grant/RLS'i zorlamaz → burada statik teyit). FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MIG = resolve(ROOT, "supabase", "migrations");
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s) => s.replace(/--[^\n]*/g, "");

let pass = 0, fail = 0; const failures = [];
const check = (n, c, d) => (c ? pass++ : (fail++, failures.push(n + (d ? ` — ${d}` : ""))));

const CLASS_C = [
  ["nutrition_client_profiles", "20270102000000_nutrition_client_profiles.sql"],
  ["nutrition_client_measurements", "20270102000100_nutrition_client_measurements.sql"],
  ["nutrition_client_allergens", "20270102000200_nutrition_client_allergens.sql"],
  ["nutrition_client_food_preferences", "20270102000300_nutrition_client_food_preferences.sql"],
  ["nutrition_plan_clients", "20270102000400_nutrition_plan_clients.sql"],
];
const RPC = read(resolve(MIG, "20270102000500_nutrition_client_rpcs.sql"));

console.log("[A] 5 Class-C tablo — RLS doğuştan-kilit + client CASCADE + tenant guard");
for (const [t, f] of CLASS_C) {
  const s = read(resolve(MIG, f));
  check(`${t}: dosya mevcut + CREATE TABLE`, new RegExp(`CREATE TABLE public\\.${t}\\b`).test(s), f);
  check(`${t}: tenant_id uuid NOT NULL`, /tenant_id\s+uuid\s+NOT NULL/.test(s));
  check(`${t}: client_id → clients(id) ON DELETE CASCADE`,
    /client_id\s+uuid\s+NOT NULL\s+REFERENCES public\.clients\(id\)\s+ON DELETE CASCADE/.test(s));
  check(`${t}: RLS ENABLE`, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(s));
  check(`${t}: REVOKE anon/authenticated/PUBLIC`, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM anon, authenticated, PUBLIC`).test(s));
  check(`${t}: GRANT service_role`, new RegExp(`GRANT ALL PRIVILEGES ON TABLE public\\.${t} TO service_role`).test(s));
  check(`${t}: anon/authenticated GRANT YOK`, !new RegExp(`GRANT[^;]*TO[^;]*(anon|authenticated)\\b`).test(strip(s)));
  check(`${t}: BEGIN/COMMIT dengeli`, (s.match(/BEGIN;/g) || []).length === 1 && (s.match(/COMMIT;/g) || []).length === 1);
  check(`${t}: cross-tenant guard trigger`, /nutrition_client_tenant_guard\(\)/.test(s));
}

console.log("[B] tenant guard fonksiyonu tek yerde (profiles migration'ında) tanımlı");
const prof = read(resolve(MIG, CLASS_C[0][1]));
check("tenant guard fonksiyonu CREATE (profiles)", /CREATE FUNCTION public\.nutrition_client_tenant_guard\(\)/.test(prof));
check("tenant guard clients tenant eşleşmesi kontrolü", /clients c[\s\S]*?c\.id = NEW\.client_id AND c\.tenant_id = NEW\.tenant_id/.test(prof));
check("tenant guard search_path sabit", /SET search_path = pg_catalog, public/.test(prof));

console.log("[C] profil kısıtları (klinik-olmayan + sınırlar)");
check("goal_type CHECK (6 kod)", /goal_type IN\s*\n?\s*\('weight_loss','weight_gain','maintenance','muscle_gain','healthy_lifestyle','other'\)/.test(prof));
check("activity_level CHECK (5 kod)", /activity_level IN\s*\n?\s*\('sedentary','light','moderate','active','very_active'\)/.test(prof));
check("daily_meal_count 1..12", /daily_meal_count >= 1 AND daily_meal_count <= 12/.test(prof));
check("target_weight_kg 20..500", /target_weight_kg >= 20 AND target_weight_kg <= 500/.test(prof));
check("profil UNIQUE(tenant, client) 1:1", /UNIQUE \(tenant_id, client_id\)/.test(prof));
check("profil klinik alan YOK (diagnosis/medication/disease)", !/\b(diagnosis|medication|disease|prescription|tani|ilac|recete)\b/i.test(strip(prof)));

console.log("[D] measurements — geçmiş (tarih-unique YOK) + sınırlar");
const meas = read(resolve(MIG, CLASS_C[1][1]));
check("weight_kg NOT NULL + CHECK", /weight_kg\s+numeric\s+NOT NULL/.test(meas) && /weight_kg > 0 AND weight_kg <= 500/.test(meas));
check("measured_at NOT NULL", /measured_at\s+timestamptz\s+NOT NULL/.test(meas));
check("client+date UNIQUE YOK (aynı gün çok ölçüm)", !/UNIQUE \([^)]*measured_at[^)]*\)/.test(meas));
check("BMI kolonu SAKLANMAZ", !/\bbmi\b/i.test(strip(meas)));

console.log("[E] allergens — Class A vocab reuse + OTOMATİK eşleme YOK");
const alg = read(resolve(MIG, CLASS_C[2][1]));
check("allergen_id → nutrition_allergens(id)", /allergen_id\s+uuid\s+NOT NULL\s+REFERENCES public\.nutrition_allergens\(id\)/.test(alg));
check("UNIQUE(tenant, client, allergen)", /UNIQUE \(tenant_id, client_id, allergen_id\)/.test(alg));
check("food↔allergen otomatik mapping kolonu YOK", !/food_id|food_allergen/i.test(strip(alg)));

console.log("[F] preferences — soft food_id + free-text label");
const pref = read(resolve(MIG, CLASS_C[3][1]));
check("stance CHECK preferred/avoided", /stance IN \('preferred','avoided'\)/.test(pref));
check("food_id SOFT (REFERENCES YOK)", /food_id\s+uuid,/.test(pref) && !/food_id\s+uuid[^\n]*REFERENCES/i.test(strip(pref)));
check("food_label NOT NULL + nonempty", /food_label\s+text\s+NOT NULL/.test(pref) && /btrim\(food_label\) <> ''/.test(pref));

console.log("[G] plan_clients — family binding + immutable + client-delete plan cascade");
const bind = read(resolve(MIG, CLASS_C[4][1]));
check("PK (tenant_id, plan_family_id) — family=tek danışan", /PRIMARY KEY \(tenant_id, plan_family_id\)/.test(bind));
check("client CASCADE FK", /client_id\s+uuid\s+NOT NULL\s+REFERENCES public\.clients\(id\)\s+ON DELETE CASCADE/.test(bind));
check("AFTER DELETE trigger → nutrition_plans cascade", /AFTER DELETE ON public\.nutrition_plan_clients[\s\S]*?nutrition_plan_clients_cascade_plans\(\)/.test(bind));
check("cascade fonksiyonu family plan DELETE", /DELETE FROM public\.nutrition_plans[\s\S]*?plan_family_id = OLD\.plan_family_id/.test(bind));

console.log("[H] assign RPC — server-authoritative + immutable + service_role-only");
check("RPC nutrition_plan_assign_client", /CREATE OR REPLACE FUNCTION public\.nutrition_plan_assign_client\(/.test(RPC));
check("SECURITY INVOKER + fixed search_path", /SECURITY INVOKER/.test(RPC) && /SET search_path = pg_catalog, public/.test(RPC));
check("immutable reassign → 45021", /45021/.test(RPC));
check("foreign client → 45020", /45020/.test(RPC));
check("plan not found → 45014", /45014/.test(RPC));
check("archived-family no-bind → 45022", /45022/.test(RPC));
check("REVOKE anon/authenticated/PUBLIC", /REVOKE ALL ON FUNCTION public\.nutrition_plan_assign_client[\s\S]*?FROM PUBLIC, anon, authenticated/.test(RPC));
check("GRANT service_role only", /GRANT EXECUTE ON FUNCTION public\.nutrition_plan_assign_client[\s\S]*?TO service_role/.test(RPC));
check("SECURITY DEFINER KULLANILMAZ", !/SECURITY DEFINER/.test(RPC));

console.log(`\n${"=".repeat(56)}`);
console.log(`  BESLENME CLIENT DDL: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${failures.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ FAZ 7 Class-C static DDL/güvenlik sözleşmesi: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));
