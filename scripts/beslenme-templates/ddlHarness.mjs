/**
 * Beslenme FAZ 6 — Template DDL + RPC harness (PGlite, gerçek Postgres semantiği).
 * Plan + template migration'larını yükler, create-from/apply/duplicate senaryolarını doğrular.
 * DB YOK (in-memory PGlite). CI/local static gate.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = join(ROOT, "supabase", "migrations");
const read = (f) => readFileSync(join(MIG, f), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${extra}`); } };

const db = new PGlite();

// Supabase roles (normally provisioned by the platform).
for (const r of ["anon", "authenticated", "service_role"]) {
  try { await db.exec(`CREATE ROLE ${r};`); } catch { /* exists */ }
}

// Shared trigger fn (normally from an earlier migration).
await db.exec(`CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;`);

// Plan schema (tables only) then template schema + RPCs.
for (const f of [
  "20261231000000_nutrition_plans.sql",
  "20261231000100_nutrition_plan_days.sql",
  "20261231000200_nutrition_plan_meals.sql",
  "20261231000300_nutrition_plan_items.sql",
  "20261231000400_nutrition_plan_item_nutrients.sql",
  "20270101000000_nutrition_templates.sql",
  "20270101000100_nutrition_template_meals.sql",
  "20270101000200_nutrition_template_items.sql",
  "20270101000300_nutrition_template_item_nutrients.sql",
  "20270101000400_nutrition_template_rpcs.sql",
]) {
  try { await db.exec(read(f)); } catch (e) { fail++; console.log(`  ❌ APPLY ${f}: ${e.message}`); }
}
console.log("=== migrations applied ===");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

// ---- Build a source plan tree directly ----
const plan = await one(
  `INSERT INTO nutrition_plans (tenant_id,title,start_date,end_date,daily_energy_target,status,plan_family_id,revision_number)
   VALUES ($1,'SRC','2026-08-02','2026-08-04',2000,'draft',gen_random_uuid(),1) RETURNING id`, [T]);
const day = await one(
  `INSERT INTO nutrition_plan_days (tenant_id,plan_id,plan_date) VALUES ($1,$2,'2026-08-02') RETURNING id`, [T, plan.id]);
const meal = await one(
  `INSERT INTO nutrition_plan_meals (tenant_id,plan_id,plan_day_id,meal_type,label,sort_order)
   VALUES ($1,$2,$3,'breakfast','Kahvaltı',0) RETURNING id`, [T, plan.id, day.id]);
async function addItem(name, grams, energy) {
  const it = await one(
    `INSERT INTO nutrition_plan_items (tenant_id,plan_id,meal_id,food_id,grams,quantity,food_name_snapshot,food_ownership_snapshot,portion_label_snapshot,portion_gram_snapshot,external_provider_snapshot,external_version_snapshot,sort_order)
     VALUES ($1,$2,$3,gen_random_uuid(),$4,1,$5,'system','1 orta',$4,'usda_fdc','usda-foundation-v1',0) RETURNING id`,
    [T, plan.id, meal.id, grams, name]);
  await db.query(`INSERT INTO nutrition_plan_item_nutrients (tenant_id,item_id,nutrient_code,amount,unit_code) VALUES ($1,$2,'energy',$3,'kcal'),($1,$2,'protein',1.5,'g')`,
    [T, it.id, energy]);
  return it.id;
}
await addItem("Elma", 182, 52);
await addItem("Yumurta", 100, 143);

// ---- 1) create_from_meal ----
const tmplMeal = await one(`SELECT nutrition_template_create_from_meal($1,$2,'Standart Kahvaltı',null) AS t`, [T, meal.id]);
const tm = tmplMeal.t;
ok("create_from_meal returns template", tm && tm.template_type === "meal");
const tmMeals = await q(`SELECT * FROM nutrition_template_meals WHERE template_id=$1`, [tm.id]);
const tmItems = await q(`SELECT * FROM nutrition_template_items WHERE template_id=$1 ORDER BY food_name_snapshot`, [tm.id]);
const tmNut = await q(`SELECT * FROM nutrition_template_item_nutrients tn JOIN nutrition_template_items ti ON ti.id=tn.item_id WHERE ti.template_id=$1`, [tm.id]);
ok("meal template has 1 meal", tmMeals.length === 1, `got ${tmMeals.length}`);
ok("meal template has 2 items", tmItems.length === 2, `got ${tmItems.length}`);
ok("meal template has 4 nutrient rows", tmNut.length === 4, `got ${tmNut.length}`);
ok("snapshot verbatim (Elma 182/52)", tmItems[0].food_name_snapshot === "Elma" && Number(tmItems[0].grams) === 182 &&
   tmItems[0].external_version_snapshot === "usda-foundation-v1");
ok("template meal id != source meal id", tmMeals[0].id !== meal.id);

// ---- 2) create_from_day ----
const tmplDay = (await one(`SELECT nutrition_template_create_from_day($1,$2,'Standart Gün',null) AS t`, [T, day.id])).t;
ok("create_from_day type=day", tmplDay.template_type === "day");
const tdItems = await q(`SELECT count(*)::int c FROM nutrition_template_items WHERE template_id=$1`, [tmplDay.id]);
ok("day template copied 2 items", tdItems[0].c === 2, `got ${tdItems[0].c}`);

// ---- 3) apply_day to empty target ----
const plan2 = await one(`INSERT INTO nutrition_plans (tenant_id,title,start_date,end_date,status,plan_family_id,revision_number)
  VALUES ($1,'TARGET','2026-09-01','2026-09-02','draft',gen_random_uuid(),1) RETURNING id`, [T]);
const day2 = await one(`INSERT INTO nutrition_plan_days (tenant_id,plan_id,plan_date) VALUES ($1,$2,'2026-09-01') RETURNING id`, [T, plan2.id]);
const ad = (await one(`SELECT nutrition_template_apply_day($1,$2,$3,$4) AS r`, [T, tmplDay.id, plan2.id, day2.id])).r;
ok("apply_day ok", ad.ok === true);
const day2meals = await q(`SELECT * FROM nutrition_plan_meals WHERE plan_day_id=$1`, [day2.id]);
const day2items = await q(`SELECT * FROM nutrition_plan_items WHERE meal_id=$1`, [day2meals[0]?.id]);
ok("apply_day created 1 meal + 2 items", day2meals.length === 1 && day2items.length === 2);
ok("applied item ids differ from template", day2items.every(i => !tmItems.find(t => t.id === i.id)));
ok("applied snapshot verbatim energy 52", (await q(`SELECT amount FROM nutrition_plan_item_nutrients WHERE item_id=$1 AND nutrient_code='energy'`, [day2items.find(i=>i.food_name_snapshot==='Elma').id]))[0].amount == 52);

// ---- 4) apply_day again -> TARGET_NOT_EMPTY (45012) ----
let notEmpty = "no-error";
try { await db.query(`SELECT nutrition_template_apply_day($1,$2,$3,$4)`, [T, tmplDay.id, plan2.id, day2.id]); }
catch (e) { notEmpty = e.code; }
ok("apply_day on non-empty -> 45012", notEmpty === "45012", `got ${notEmpty}`);

// ---- 5) apply_meal append (day now non-empty) ----
const am = (await one(`SELECT nutrition_template_apply_meal($1,$2,$3,$4) AS r`, [T, tm.id, plan2.id, day2.id])).r;
ok("apply_meal ok (append)", am.ok === true);
const day2mealsAfter = await q(`SELECT sort_order FROM nutrition_plan_meals WHERE plan_day_id=$1 ORDER BY sort_order`, [day2.id]);
ok("apply_meal appended (2 meals, sort 0 & 1)", day2mealsAfter.length === 2 && Number(day2mealsAfter[1].sort_order) === 1, JSON.stringify(day2mealsAfter));

// ---- 6) duplicate ----
const dup = (await one(`SELECT nutrition_template_duplicate($1,$2,null) AS t`, [T, tm.id])).t;
ok("duplicate new id + (Kopya) title", dup.id !== tm.id && /Kopya/.test(dup.title));
const dupItems = await q(`SELECT count(*)::int c FROM nutrition_template_items WHERE template_id=$1`, [dup.id]);
ok("duplicate copied 2 items", dupItems[0].c === 2, `got ${dupItems[0].c}`);

// ---- 7) source plan mutation does NOT change template ----
await db.query(`UPDATE nutrition_plan_items SET grams=999 WHERE meal_id=$1`, [meal.id]);
const tmItemsAfter = await q(`SELECT grams FROM nutrition_template_items WHERE template_id=$1`, [tm.id]);
ok("template immutable vs source mutation", tmItemsAfter.every(i => Number(i.grams) === 182 || Number(i.grams) === 100));

// ---- 8) source food delete survival (delete source plan entirely) ----
await db.query(`DELETE FROM nutrition_plans WHERE id=$1`, [plan.id]);
const tmSurvive = await q(`SELECT count(*)::int c FROM nutrition_template_items WHERE template_id=$1`, [tm.id]);
ok("template survives source plan delete", tmSurvive[0].c === 2, `got ${tmSurvive[0].c}`);

// ---- 9) not_found errors ----
let nf = "no";
try { await db.query(`SELECT nutrition_template_create_from_meal($1,$2,'x',null)`, [T, "00000000-0000-4000-8000-000000000000"]); }
catch (e) { nf = e.code; }
ok("create_from_meal unknown source -> 45014", nf === "45014", `got ${nf}`);

// ---- 10) RPC security (prosecdef false, invoker) ----
const sec = await q(`SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'nutrition_template_%'`);
ok("all template fns SECURITY INVOKER (prosecdef=false)", sec.length >= 6 && sec.every(r => r.prosecdef === false), JSON.stringify(sec.map(s=>[s.proname,s.prosecdef])));

console.log(`\n=== TEMPLATE DDL HARNESS: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
