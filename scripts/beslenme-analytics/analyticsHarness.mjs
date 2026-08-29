/**
 * Beslenme FAZ 6 — Plan Analitiği harness (PGlite, gerçek Postgres semantiği + SAF reduce).
 *
 * 5 plan migration'ını in-memory PGlite'a yükler, bilinen 3-4 günlük fixture kurar
 * (bazı boş, bazı item'lı; donmuş nutrient snapshot'ları), snapshot satırlarını okur ve
 * GERÇEK reducePlanAnalytics'i (lib/beslenme/analyticsReduce.ts) çağırır — kopya mantık YOK.
 *
 * Doğrular: tam günlük toplamlar, haftalık ortalamalar, içerik-günü vs boş-gün sayıları,
 *   hedef delta, min/max, ERKEN YUVARLAMA YOK (94.64 ham kalır), boş günler ortalamayı
 *   DİLUTE ETMEZ, ve analitiğin YALNIZ snapshot okuduğu (canlı nutrition_foods'a dokunmadığı).
 *
 * Çalıştır:  node --import tsx scripts/beslenme-analytics/analyticsHarness.mjs
 *   (tsx loader — harness gerçek reducePlanAnalytics'i .ts'ten import eder; extensionless
 *    import Next/tsc uyumu için korunur, node çıplak ESM'de .ts çözemez.)
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reducePlanAnalytics } from "../../lib/beslenme/analyticsReduce.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = join(ROOT, "supabase", "migrations");
const readMig = (f) => readFileSync(join(MIG, f), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`); }
};
const near = (a, b, eps = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

// ── PGlite + Supabase roller + shared trigger fn ──
const db = new PGlite();
for (const r of ["anon", "authenticated", "service_role"]) {
  try { await db.exec(`CREATE ROLE ${r};`); } catch { /* exists */ }
}
await db.exec(`CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;`);

for (const f of [
  "20261231000000_nutrition_plans.sql",
  "20261231000100_nutrition_plan_days.sql",
  "20261231000200_nutrition_plan_meals.sql",
  "20261231000300_nutrition_plan_items.sql",
  "20261231000400_nutrition_plan_item_nutrients.sql",
]) {
  try { await db.exec(readMig(f)); } catch (e) { fail++; console.log(`  FAIL  APPLY ${f}: ${e.message}`); }
}
console.log("=== 5 plan migrations applied ===");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

// ── Fixture: plan 2026-08-02..08-12, target 2000; 5 gün (A/C/D içerik, B/E boş) ──
const plan = await one(
  `INSERT INTO nutrition_plans (tenant_id,title,start_date,end_date,daily_energy_target,status,plan_family_id,revision_number)
   VALUES ($1,'ANALİTİK','2026-08-02','2026-08-12',2000,'draft',gen_random_uuid(),1) RETURNING id`, [T]);

async function addDay(date, override) {
  return one(
    `INSERT INTO nutrition_plan_days (tenant_id,plan_id,plan_date,energy_target_override)
     VALUES ($1,$2,$3,$4) RETURNING id`, [T, plan.id, date, override]);
}
async function addMeal(dayId, label, sort) {
  return one(
    `INSERT INTO nutrition_plan_meals (tenant_id,plan_id,plan_day_id,meal_type,label,sort_order)
     VALUES ($1,$2,$3,'breakfast',$4,$5) RETURNING id`, [T, plan.id, dayId, label, sort]);
}
// snapshot: { code: amountPer100g }  → item = grams/100 × amount (HAM)
async function addItem(mealId, name, grams, snap, sort) {
  const it = await one(
    `INSERT INTO nutrition_plan_items (tenant_id,plan_id,meal_id,food_id,grams,quantity,food_name_snapshot,food_ownership_snapshot,portion_label_snapshot,portion_gram_snapshot,external_provider_snapshot,external_version_snapshot,sort_order)
     VALUES ($1,$2,$3,gen_random_uuid(),$4,1,$5,'system',null,null,null,null,$6) RETURNING id`,
    [T, plan.id, mealId, grams, name, sort]);
  for (const [code, amount] of Object.entries(snap)) {
    await db.query(
      `INSERT INTO nutrition_plan_item_nutrients (tenant_id,item_id,nutrient_code,amount,unit_code)
       VALUES ($1,$2,$3,$4,$5)`,
      [T, it.id, code, amount, code === "energy" ? "kcal" : (code === "sodium" || code === "potassium" ? "mg" : "g")]);
  }
  return it.id;
}

const ELMA = { energy: 52, protein: 0.3, carbohydrate: 13.8, fiber: 2.4, total_fat: 0.2, sugar: 10.4, sodium: 1, potassium: 107 };
const YUMURTA = { energy: 143, protein: 13, carbohydrate: 1.1, fiber: 0, total_fat: 9.5, sodium: 142, potassium: 138 };
const EKMEK = { energy: 265, protein: 9, carbohydrate: 49, fiber: 2.7, total_fat: 3.2 };

// Day A (content, default target): Elma 182g
const dayA = await addDay("2026-08-02", null);
const mA = await addMeal(dayA.id, "Kahvaltı", 0);
await addItem(mA.id, "Elma", 182, ELMA, 0);

// Day B (empty)
await addDay("2026-08-03", null);

// Day C (content, default target): Yumurta 100g + Ekmek 50g
const dayC = await addDay("2026-08-04", null);
const mC = await addMeal(dayC.id, "Öğle", 0);
await addItem(mC.id, "Yumurta", 100, YUMURTA, 0);
await addItem(mC.id, "Ekmek", 50, EKMEK, 1);

// Day D (content, OVERRIDE 1800) — week 1: Elma 200g
const dayD = await addDay("2026-08-10", 1800);
const mD = await addMeal(dayD.id, "Akşam", 0);
await addItem(mD.id, "Elma", 200, ELMA, 0);

// Day E (empty) — week 1
await addDay("2026-08-11", null);

// ── Snapshot satırlarını oku (numeric'ler float8'e cast — Supabase number semantiği) ──
const days = await q(
  `SELECT id, plan_date::text AS plan_date, energy_target_override::float8 AS energy_target_override
   FROM nutrition_plan_days WHERE tenant_id=$1 AND plan_id=$2 ORDER BY plan_date`, [T, plan.id]);
const meals = await q(
  `SELECT id, plan_day_id FROM nutrition_plan_meals WHERE tenant_id=$1 AND plan_id=$2`, [T, plan.id]);
const items = await q(
  `SELECT id, meal_id, grams::float8 AS grams FROM nutrition_plan_items WHERE tenant_id=$1 AND plan_id=$2`, [T, plan.id]);
const nutrients = await q(
  `SELECT item_id, nutrient_code, amount::float8 AS amount, unit_code
   FROM nutrition_plan_item_nutrients WHERE tenant_id=$1 AND item_id = ANY($2)`,
  [T, items.map((i) => i.id)]);

const planTarget = Number((await one(
  `SELECT daily_energy_target::float8 AS t FROM nutrition_plans WHERE id=$1`, [plan.id])).t);
const startDate = (await one(`SELECT start_date::text AS s FROM nutrition_plans WHERE id=$1`, [plan.id])).s;

// ── GERÇEK reduce (analyticsReduce.ts) ──
const A = reducePlanAnalytics({ days, meals, items, nutrients, planDefaultTarget: planTarget, startDate });

const byDate = (d) => A.daily.find((x) => x.plan_date === d);
const dA = byDate("2026-08-02"), dB = byDate("2026-08-03"), dC = byDate("2026-08-04"), dD = byDate("2026-08-10"), dE = byDate("2026-08-11");

console.log("\n[A] Günlük tam toplamlar (HAM, snapshot grams/100 × amount)");
ok("5 günlük satır (boş dahil)", A.daily.length === 5, `got ${A.daily.length}`);
ok("Day A energy = 94.64 (52×1.82)", near(dA.energyTotal, 94.64));
ok("Day A protein = 0.546", near(dA.nutrients.find((n) => n.nutrient_code === "protein")?.amount, 0.546));
ok("Day A carbohydrate = 25.116", near(dA.nutrients.find((n) => n.nutrient_code === "carbohydrate")?.amount, 25.116));
ok("Day A fiber = 4.368", near(dA.nutrients.find((n) => n.nutrient_code === "fiber")?.amount, 4.368));
ok("Day C energy = 275.5 (143 + 132.5)", near(dC.energyTotal, 275.5));
ok("Day C protein = 17.5", near(dC.nutrients.find((n) => n.nutrient_code === "protein")?.amount, 17.5));
ok("Day C total_fat = 11.1", near(dC.nutrients.find((n) => n.nutrient_code === "total_fat")?.amount, 11.1));
ok("Day D energy = 104 (52×2.0)", near(dD.energyTotal, 104));

console.log("\n[B] İçerik günü vs boş gün (LOCKED §26 — boş gün ≠ sıfır)");
ok("Day A içerik", dA.isContentDay === true && dA.itemCount === 1);
ok("Day B boş (itemCount 0)", dB.isContentDay === false && dB.itemCount === 0);
ok("Day C içerik (2 item)", dC.isContentDay === true && dC.itemCount === 2);
ok("Day E boş", dE.isContentDay === false && dE.itemCount === 0);
ok("summary.planDayCount = 5", A.summary.planDayCount === 5, `got ${A.summary.planDayCount}`);
ok("summary.contentDayCount = 3", A.summary.contentDayCount === 3, `got ${A.summary.contentDayCount}`);

console.log("\n[C] ERKEN YUVARLAMA YOK — 94.64 ham korunur");
ok("Day A energyTotal ≈ 94.64 (1e-9)", near(dA.energyTotal, 94.64));
ok("Day A energyTotal yuvarlanMAMIŞ (≠ 95, ≠ 94)", dA.energyTotal !== 95 && dA.energyTotal !== 94 && dA.energyTotal !== Math.round(dA.energyTotal));

console.log("\n[D] Ortalamalar YALNIZ içerik günü — boş günler DİLUTE ETMEZ");
// içerik ort = (94.64+275.5+104)/3 = 158.0466…  (5'e bölerse 94.828 olurdu → yanlış)
ok("avgEnergyPerContentDay = 158.04666… (3 güne bölünür)", near(A.summary.avgEnergyPerContentDay, 474.14 / 3));
ok("boş-gün DİLUTE YOK (≠ 474.14/5 = 94.828)", !near(A.summary.avgEnergyPerContentDay, 474.14 / 5, 1e-6));
ok("avgMacros.protein = 6.21533…", near(A.summary.avgMacros.protein, 18.646 / 3));
ok("avgMacros.carbohydrate = 26.10533…", near(A.summary.avgMacros.carbohydrate, 78.316 / 3));
ok("avgMacros.fiber = 3.506", near(A.summary.avgMacros.fiber, 10.518 / 3));
ok("avgMacros.total_fat = 3.95466…", near(A.summary.avgMacros.total_fat, 11.864 / 3));

console.log("\n[E] İkincil nutrient ortalamaları (mevcutsa)");
ok("avgMacros.sugar = 13.24266… ((18.928+0+20.8)/3)", near(A.summary.avgMacros.sugar, 39.728 / 3));
ok("avgMacros.sodium = 48.6066… ((1.82+142+2)/3)", near(A.summary.avgMacros.sodium, 145.82 / 3));
ok("avgMacros.potassium = 182.2466… ((194.74+138+214)/3)", near(A.summary.avgMacros.potassium, 546.74 / 3));

console.log("\n[F] Hedef delta (gün override ?? plan default)");
ok("Day A effectiveTarget = 2000 (plan default)", dA.effectiveTarget === 2000);
ok("Day D effectiveTarget = 1800 (gün override)", dD.effectiveTarget === 1800);
ok("Day A energyDelta = -1905.36", near(dA.energyDelta, 94.64 - 2000));
ok("Day D energyDelta = -1696", near(dD.energyDelta, 104 - 1800));
ok("summary.targetAvg = 1933.333… ((2000+2000+1800)/3)", near(A.summary.targetAvg, 5800 / 3));
ok("summary.delta = avgEnergy - targetAvg", near(A.summary.delta, 474.14 / 3 - 5800 / 3));

console.log("\n[G] min/max enerji (içerik günü)");
ok("minEnergy = 94.64", near(A.summary.minEnergy, 94.64));
ok("maxEnergy = 275.5", near(A.summary.maxEnergy, 275.5));

console.log("\n[H] Haftalık kovalar (start_date'ten ardışık 7-gün)");
ok("2 hafta kovası", A.weekly.length === 2, `got ${A.weekly.length}`);
const w0 = A.weekly.find((w) => w.weekIndex === 0);
const w1 = A.weekly.find((w) => w.weekIndex === 1);
ok("W0 tarih aralığı 08-02..08-08", w0.dateStart === "2026-08-02" && w0.dateEnd === "2026-08-08", `${w0?.dateStart}..${w0?.dateEnd}`);
ok("W0 contentDays=2 emptyDays=1 (A,C içerik; B boş)", w0.contentDays === 2 && w0.emptyDays === 1);
ok("W0 avgEnergy = 185.07 ((94.64+275.5)/2)", near(w0.avgEnergy, 370.14 / 2));
ok("W0 avgMacros.protein = 9.023", near(w0.avgMacros.protein, 18.046 / 2));
ok("W0 targetAvg = 2000, delta = 185.07-2000", near(w0.targetAvg, 2000) && near(w0.delta, 370.14 / 2 - 2000));
ok("W1 tarih aralığı 08-09..08-15", w1.dateStart === "2026-08-09" && w1.dateEnd === "2026-08-15", `${w1?.dateStart}..${w1?.dateEnd}`);
ok("W1 contentDays=1 emptyDays=1 (D içerik; E boş)", w1.contentDays === 1 && w1.emptyDays === 1);
ok("W1 avgEnergy = 104, targetAvg = 1800 (override), delta = -1696", near(w1.avgEnergy, 104) && near(w1.targetAvg, 1800) && near(w1.delta, 104 - 1800));

console.log("\n[I] SNAPSHOT-only kaynak — canlı nutrition_foods OKUNMAZ (yapısal)");
const analyticsSrc = readFileSync(join(ROOT, "lib", "beslenme", "analytics.ts"), "utf8");
const reduceSrc = readFileSync(join(ROOT, "lib", "beslenme", "analyticsReduce.ts"), "utf8");
ok("analytics.ts canlı nutrition_foods OKUMAZ", !/from\(["']nutrition_foods["']\)|nutrition_food_nutrients/.test(analyticsSrc));
ok("analyticsReduce.ts hiçbir DB tablosu okumaz (.from YOK)", !/\.from\(/.test(reduceSrc));
ok("analytics.ts YALNIZ 4 plan-snapshot tablosunu .from() eder",
  (analyticsSrc.match(/\.from\(\s*["']([a-z_]+)["']/g) || [])
    .every((m) => /nutrition_plan_days|nutrition_plan_meals|nutrition_plan_items|nutrition_plan_item_nutrients/.test(m)));
// Canlı food değişse bile snapshot satırları aynı → reduce çıktısı DEĞİŞMEZ (deterministik saflık).
const A2 = reducePlanAnalytics({ days, meals, items, nutrients, planDefaultTarget: planTarget, startDate });
ok("aynı snapshot → aynı çıktı (canlı food mutasyonu etkisiz; deterministik)",
  JSON.stringify(A2) === JSON.stringify(A));

console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Plan Analitiği: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));
