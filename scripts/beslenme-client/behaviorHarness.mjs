// ============================================================
// Beslenme FAZ 7 — Danışan Entegrasyonu DAVRANIŞ harness'i (PGlite, DB-real).
// Class C tabloları + assign RPC + client-delete cascade davranışını doğrular.
// Prereq (baseline dışı) tabloları minimal kurar, sonra 6 FAZ7 migration'ını uygular.
// FAIL → exit 1.
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mig = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };

const db = new PGlite();
for (const r of ["anon", "authenticated", "service_role"]) { try { await db.exec(`CREATE ROLE ${r};`); } catch {} }

// ── Prereq: baseline tabloları (migration'larda değil) + set_updated_at ──
await db.exec(`
  CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

  CREATE TABLE public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    ad text, soyad text, kan text, mizac text,
    UNIQUE (tenant_id, id)
  );

  CREATE TABLE public.nutrition_allergens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL
  );

  CREATE TABLE public.nutrition_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    plan_family_id uuid NOT NULL,
    revision_number integer NOT NULL DEFAULT 1,
    CONSTRAINT nutrition_plans_tenant_id_key UNIQUE (tenant_id, id),
    CONSTRAINT nutrition_plans_family_revision_key UNIQUE (tenant_id, plan_family_id, revision_number)
  );
  CREATE TABLE public.nutrition_plan_days (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    plan_date date NOT NULL,
    FOREIGN KEY (tenant_id, plan_id) REFERENCES public.nutrition_plans (tenant_id, id) ON DELETE CASCADE,
    UNIQUE (tenant_id, plan_id, id)
  );
  CREATE TABLE public.nutrition_plan_meals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    plan_day_id uuid NOT NULL,
    label text NOT NULL,
    FOREIGN KEY (tenant_id, plan_id, plan_day_id) REFERENCES public.nutrition_plan_days (tenant_id, plan_id, id) ON DELETE CASCADE,
    UNIQUE (tenant_id, plan_id, id)
  );
  CREATE TABLE public.nutrition_plan_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    meal_id uuid NOT NULL,
    grams numeric NOT NULL,
    food_name_snapshot text NOT NULL,
    FOREIGN KEY (tenant_id, plan_id, meal_id) REFERENCES public.nutrition_plan_meals (tenant_id, plan_id, id) ON DELETE CASCADE
  );
`);

// ── Apply 6 FAZ7 migrations in order ──
for (const f of [
  "20270102000000_nutrition_client_profiles.sql",
  "20270102000100_nutrition_client_measurements.sql",
  "20270102000200_nutrition_client_allergens.sql",
  "20270102000300_nutrition_client_food_preferences.sql",
  "20270102000400_nutrition_plan_clients.sql",
  "20270102000500_nutrition_client_rpcs.sql",
]) {
  try { await db.exec(mig(f)); ok(`migration applies: ${f}`, true); }
  catch (e) { ok(`migration applies: ${f}`, false, e.message); }
}

// ── Fixtures ──
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";  // tenant A
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";  // tenant B
const q = (s, p = []) => db.query(s, p);
const one = async (s, p = []) => (await q(s, p)).rows[0];
const val = async (s, p = []) => Object.values((await one(s, p)))[0];
const tryErr = async (s, p = []) => { try { await q(s, p); return null; } catch (e) { return e; } };

const clientA = (await one(`INSERT INTO clients (tenant_id, ad, soyad, kan, mizac) VALUES ($1,'Ayşe','Yılmaz','0','dem') RETURNING id`, [TA])).id;
const clientB = (await one(`INSERT INTO clients (tenant_id, ad, soyad) VALUES ($1,'Foreign','Client') RETURNING id`, [TB])).id;
const alg1 = (await one(`INSERT INTO nutrition_allergens (code) VALUES ('gluten') RETURNING id`)).id;
const alg2 = (await one(`INSERT INTO nutrition_allergens (code) VALUES ('milk') RETURNING id`)).id;

console.log("\n[Profiles]");
await q(`INSERT INTO nutrition_client_profiles (tenant_id, client_id, goal_type, activity_level, daily_meal_count, target_weight_kg) VALUES ($1,$2,'weight_loss','moderate',3,70)`, [TA, clientA]);
ok("profile insert (valid)", true);
ok("profile UNIQUE(tenant,client) — ikinci insert reddedilir",
  !!(await tryErr(`INSERT INTO nutrition_client_profiles (tenant_id, client_id) VALUES ($1,$2)`, [TA, clientA])));
ok("profile goal_type CHECK reddi", !!(await tryErr(`INSERT INTO nutrition_client_profiles (tenant_id, client_id, goal_type) VALUES ($1,$2,'bogus')`, [TA, clientB])));
ok("profile cross-tenant guard (clientA + tenantB) reddi",
  !!(await tryErr(`INSERT INTO nutrition_client_profiles (tenant_id, client_id) VALUES ($1,$2)`, [TB, clientA])));

console.log("\n[Measurements]");
await q(`INSERT INTO nutrition_client_measurements (tenant_id, client_id, weight_kg, height_cm) VALUES ($1,$2,72,168)`, [TA, clientA]);
await q(`INSERT INTO nutrition_client_measurements (tenant_id, client_id, weight_kg) VALUES ($1,$2,71.5)`, [TA, clientA]);
ok("measurement aynı danışan çok satır (tarih-unique YOK)",
  Number(await val(`SELECT count(*) FROM nutrition_client_measurements WHERE client_id=$1`, [clientA])) === 2);
ok("measurement weight<=0 CHECK reddi", !!(await tryErr(`INSERT INTO nutrition_client_measurements (tenant_id, client_id, weight_kg) VALUES ($1,$2,-3)`, [TA, clientA])));

console.log("\n[Allergens]");
await q(`INSERT INTO nutrition_client_allergens (tenant_id, client_id, allergen_id) VALUES ($1,$2,$3)`, [TA, clientA, alg1]);
ok("allergen insert (valid, vocab reuse)", true);
ok("allergen duplicate UNIQUE reddi", !!(await tryErr(`INSERT INTO nutrition_client_allergens (tenant_id, client_id, allergen_id) VALUES ($1,$2,$3)`, [TA, clientA, alg1])));
ok("allergen unknown allergen_id FK reddi", !!(await tryErr(`INSERT INTO nutrition_client_allergens (tenant_id, client_id, allergen_id) VALUES ($1,$2,gen_random_uuid())`, [TA, clientA])));

console.log("\n[Preferences]");
await q(`INSERT INTO nutrition_client_food_preferences (tenant_id, client_id, stance, food_label) VALUES ($1,$2,'avoided','Kırmızı et')`, [TA, clientA]);
ok("preference insert (free-text)", true);
ok("preference stance CHECK reddi", !!(await tryErr(`INSERT INTO nutrition_client_food_preferences (tenant_id, client_id, stance, food_label) VALUES ($1,$2,'hate','x')`, [TA, clientA])));
ok("preference empty food_label reddi", !!(await tryErr(`INSERT INTO nutrition_client_food_preferences (tenant_id, client_id, stance, food_label) VALUES ($1,$2,'preferred','   ')`, [TA, clientA])));

console.log("\n[Context resolution — kaçınılan besin advisory kaynak (§16/§17)]");
// clientA'da zaten 1 avoided (food_id NULL — 'Kırmızı et' label-only). Ekleyelim:
const foodAvoid = await val(`SELECT gen_random_uuid()`);   // structured avoided food_id
const foodPref = await val(`SELECT gen_random_uuid()`);    // preferred food_id (avoided DEĞİL)
await q(`INSERT INTO nutrition_client_food_preferences (tenant_id, client_id, stance, food_id, food_label) VALUES ($1,$2,'avoided',$3,'Fıstık')`, [TA, clientA, foodAvoid]);
await q(`INSERT INTO nutrition_client_food_preferences (tenant_id, client_id, stance, food_id, food_label) VALUES ($1,$2,'preferred',$3,'Elma')`, [TA, clientA, foodPref]);
// GET route query şekli: stance='avoided' satırları (food_id + food_label).
const avoidedRows = (await q(`SELECT food_id, food_label FROM nutrition_client_food_preferences WHERE tenant_id=$1 AND client_id=$2 AND stance='avoided' ORDER BY food_label`, [TA, clientA])).rows;
ok("avoided sorgusu 2 satır döner (label-only + structured)", avoidedRows.length === 2);
const avoidedIds = new Set(avoidedRows.filter((r) => r.food_id).map((r) => r.food_id));
ok("avoided food_id kümesi YALNIZ structured (label-only null hariç) = 1", avoidedIds.size === 1);
ok("structured avoided food_id kümede (exact match → advisory)", avoidedIds.has(foodAvoid));
ok("preferred food_id kümede DEĞİL (uyarı yok)", !avoidedIds.has(foodPref));
ok("label-only avoided (food_id NULL) exact-id ile eşleşMEZ (fuzzy YOK)",
  avoidedRows.some((r) => r.food_id === null) && !avoidedIds.has(null));
// declared alerjen var ama food↔allergen mapping tablosu YOK → otomatik güvenlik iddiası imkansız (§19).
ok("nutrition_food_allergens mapping tablosu YOK (auto allergy warning devre-dışı)",
  (await val(`SELECT to_regclass('public.nutrition_food_allergens')`)) === null);
ok("clientA'da beyan alerjen mevcut (advisory-only context)",
  Number(await val(`SELECT count(*) FROM nutrition_client_allergens WHERE tenant_id=$1 AND client_id=$2`, [TA, clientA])) >= 1);

console.log("\n[Assign RPC — immutable recipient]");
const famA = crypto?.randomUUID ? crypto.randomUUID() : (await val(`SELECT gen_random_uuid()`));
const planV1 = (await one(`INSERT INTO nutrition_plans (tenant_id, title, status, plan_family_id, revision_number) VALUES ($1,'Plan A','draft',$2,1) RETURNING id`, [TA, famA])).id;
// assign A → clientA
const parseJ = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const b1 = await one(`SELECT nutrition_plan_assign_client($1,$2,$3,NULL) AS r`, [TA, planV1, clientA]);
ok("assign (unbound → clientA) başarılı", !!b1.r && parseJ(b1.r).client_id === clientA);
// idempotent same client
ok("assign aynı client idempotent", (await tryErr(`SELECT nutrition_plan_assign_client($1,$2,$3,NULL)`, [TA, planV1, clientA])) === null);
// different client → 45021
const otherClientA = (await one(`INSERT INTO clients (tenant_id, ad) VALUES ($1,'Diger') RETURNING id`, [TA])).id;
{ const e = await tryErr(`SELECT nutrition_plan_assign_client($1,$2,$3,NULL)`, [TA, planV1, otherClientA]);
  ok("assign farklı client → 45021 immutable", e && String(e.message + (e.code||"")).match(/45021|immutable/i)); }
// foreign client (tenant B) → 45020
{ const e = await tryErr(`SELECT nutrition_plan_assign_client($1,$2,$3,NULL)`, [TA, planV1, clientB]);
  ok("assign foreign-tenant client → 45020", e && String(e.message + (e.code||"")).match(/45020|not_found/i)); }
// non-existent plan → 45014
{ const e = await tryErr(`SELECT nutrition_plan_assign_client($1,gen_random_uuid(),$2,NULL)`, [TA, clientA]);
  ok("assign non-existent plan → 45014", e && String(e.message + (e.code||"")).match(/45014|plan_not_found/i)); }
// archived-family no-bind → 45022
{ const famArch = await val(`SELECT gen_random_uuid()`);
  const pArch = (await one(`INSERT INTO nutrition_plans (tenant_id, title, status, plan_family_id, revision_number) VALUES ($1,'Arch','archived',$2,1) RETURNING id`, [TA, famArch])).id;
  const e = await tryErr(`SELECT nutrition_plan_assign_client($1,$2,$3,NULL)`, [TA, pArch, otherClientA]);
  ok("assign archived-family (unbound) → 45022", e && String(e.message + (e.code||"")).match(/45022|archived/i)); }

console.log("\n[Revision inherits binding; V2 same family]");
const planV2 = (await one(`INSERT INTO nutrition_plans (tenant_id, title, status, plan_family_id, revision_number) VALUES ($1,'Plan A','draft',$2,2) RETURNING id`, [TA, famA])).id;
ok("V2 aynı family → binding zaten geçerli (tek binding satırı)",
  Number(await val(`SELECT count(*) FROM nutrition_plan_clients WHERE tenant_id=$1 AND plan_family_id=$2`, [TA, famA])) === 1);
ok("assign V2 (same family) farklı client → yine 45021",
  (await tryErr(`SELECT nutrition_plan_assign_client($1,$2,$3,NULL)`, [TA, planV2, otherClientA])) != null);

console.log("\n[P0 — client hard-delete cascade]");
// day/meal/item under V1
const dayV1 = (await one(`INSERT INTO nutrition_plan_days (tenant_id, plan_id, plan_date) VALUES ($1,$2,'2027-01-01') RETURNING id`, [TA, planV1])).id;
const mealV1 = (await one(`INSERT INTO nutrition_plan_meals (tenant_id, plan_id, plan_day_id, label) VALUES ($1,$2,$3,'Kahvaltı') RETURNING id`, [TA, planV1, dayV1])).id;
await q(`INSERT INTO nutrition_plan_items (tenant_id, plan_id, meal_id, grams, food_name_snapshot) VALUES ($1,$2,$3,100,'Yulaf')`, [TA, planV1, mealV1]);
// standalone plan (different family, no binding)
const famStand = await val(`SELECT gen_random_uuid()`);
const planStand = (await one(`INSERT INTO nutrition_plans (tenant_id, title, status, plan_family_id, revision_number) VALUES ($1,'Standalone','draft',$2,1) RETURNING id`, [TA, famStand])).id;

await q(`DELETE FROM clients WHERE id=$1 AND tenant_id=$2`, [clientA, TA]);
const cnt = async (t, w, p) => Number(await val(`SELECT count(*) FROM ${t} WHERE ${w}`, p));
ok("client silindi", (await cnt("clients", "id=$1", [clientA])) === 0);
ok("profile CASCADE = 0", (await cnt("nutrition_client_profiles", "client_id=$1", [clientA])) === 0);
ok("measurements CASCADE = 0", (await cnt("nutrition_client_measurements", "client_id=$1", [clientA])) === 0);
ok("allergens CASCADE = 0", (await cnt("nutrition_client_allergens", "client_id=$1", [clientA])) === 0);
ok("preferences CASCADE = 0", (await cnt("nutrition_client_food_preferences", "client_id=$1", [clientA])) === 0);
ok("plan binding CASCADE = 0", (await cnt("nutrition_plan_clients", "client_id=$1", [clientA])) === 0);
ok("bound plan family V1+V2 trigger-cascade = 0", (await cnt("nutrition_plans", "plan_family_id=$1", [famA])) === 0);
ok("bound plan days = 0 (composite-FK cascade)", (await cnt("nutrition_plan_days", "plan_id=$1", [planV1])) === 0);
ok("bound plan meals = 0", (await cnt("nutrition_plan_meals", "plan_id=$1", [planV1])) === 0);
ok("bound plan items = 0", (await cnt("nutrition_plan_items", "plan_id=$1", [planV1])) === 0);
ok("STANDALONE plan KORUNDU (etkilenmedi)", (await cnt("nutrition_plans", "id=$1", [planStand])) === 1);

console.log(`\n=== BEHAVIOR HARNESS: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
