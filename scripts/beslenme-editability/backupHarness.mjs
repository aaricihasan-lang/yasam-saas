// ============================================================
// Beslenme — YEDEK KAPSAMI harness'i (Ayarlar → Yedekle / Geri Yükle v2.2).
//   [A] KAPSAM: migration şemasındaki TÜM tenant'lı nutrition_* tabloları ya yedek listesinde
//       ya da gerekçeli hariç listesinde olmalı (yeni tablo sessizce yedek dışı kalamaz).
//   [B] ROUTE SÖZLEŞMESİ: backup/restore route'ları listeyi kullanıyor; restore FK sırasına
//       diziyor; beslenme tabloları sayfalı okunuyor; UI 2.2 kabul ediyor.
//   [C] GİDİŞ-DÖNÜŞ (PGlite, DB-GERÇEK): 26 tablonun tamamı dolu tenant → yedek (tenant_id
//       süzgeci) → veri kaybı → geri yükleme (FK sırası; JSON anahtar sırası KARIŞTIRILMIŞ) →
//       her tabloda satır sayısı birebir; ikinci geri yükleme 0 yeni satır (idempotent);
//       başka tenant'ın verisi yedeğe GİRMEZ; SİSTEM kataloğu yedeğe GİRMEZ.
// Çalıştırma: npx tsx scripts/beslenme-editability/backupHarness.mjs   FAIL → exit 1.
// ============================================================
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bootstrapNutritionDb, ROOT } from "./pgBootstrap.mjs";
import {
  NUTRITION_BACKUP_TABLES,
  NUTRITION_BACKUP_EXCLUDED,
  orderTablesForRestore,
} from "../../lib/beslenme/backupTables.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };
const src = (p) => readFileSync(join(ROOT, p), "utf8");

console.log("\n[A] kapsam: migration şeması ↔ yedek listesi");
const migDir = join(ROOT, "supabase", "migrations");
const tenantTables = new Set();
for (const f of readdirSync(migDir).filter((x) => /_nutrition_.*\.sql$/.test(x))) {
  const sql = readFileSync(join(migDir, f), "utf8");
  for (const m of sql.matchAll(/CREATE TABLE public\.(nutrition_[a-z_]+)\s*\(([\s\S]*?)\n\);/g)) {
    if (/\btenant_id\s+uuid/.test(m[2])) tenantTables.add(m[1]);
  }
}
const listed = new Set([...NUTRITION_BACKUP_TABLES, ...Object.keys(NUTRITION_BACKUP_EXCLUDED)]);
const missing = [...tenantTables].filter((t) => !listed.has(t));
ok(`migration'daki tenant'lı nutrition tabloları (${tenantTables.size}) sınıflandırılmış`, missing.length === 0, `eksik: ${missing.join(", ")}`);
const ghost = NUTRITION_BACKUP_TABLES.filter((t) => !tenantTables.has(t));
ok("yedek listesindeki her tablo migration'da tenant_id ile var", ghost.length === 0, `yok: ${ghost.join(", ")}`);
ok("yedek listesi 26 tablo", NUTRITION_BACKUP_TABLES.length === 26, String(NUTRITION_BACKUP_TABLES.length));

console.log("\n[B] route sözleşmesi");
const backupSrc = src("app/api/settings/backup/route.ts");
const restoreSrc = src("app/api/settings/restore/route.ts");
const settingsSrc = src("app/settings/page.tsx");
ok("backup route NUTRITION_BACKUP_TABLES okur", /for \(const table of NUTRITION_BACKUP_TABLES\)/.test(backupSrc));
ok("backup: beslenme sayfalı (fetchAllPaged + range) + tenant süzgeci", /fetchAllPaged/.test(backupSrc) && /\.range\(from, to\)/.test(backupSrc) && /\.eq\("tenant_id", tenantId\)/.test(backupSrc));
ok("backup sürümü 2.2", /version: "2\.2"/.test(backupSrc));
ok("restore whitelist beslenme tablolarını içerir", /\.\.\.NUTRITION_BACKUP_TABLES/.test(restoreSrc));
ok("restore FK sırasına dizer (orderTablesForRestore)", /orderTablesForRestore\(/.test(restoreSrc));
ok("restore tenant_id sunucudan override (beslenme dalı dahil)", (restoreSrc.match(/row\.tenant_id = tenantId/g) || []).length >= 2);
ok("restore 2.2 kabul eder", /"2\.2"/.test(restoreSrc));
ok("Ayarlar UI 2.1 + 2.2 yedeği kabul eder", /\["1\.0", "2\.0", "2\.1", "2\.2"\]/.test(settingsSrc));
ok("challenge tablosu bilinçli hariç (gerekçeli)", !!NUTRITION_BACKUP_EXCLUDED.nutrition_destructive_challenges);

console.log("\n[C] gidiş-dönüş (PGlite)");
const SYS = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const { db } = await bootstrapNutritionDb();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const idOf = async (tbl, code) => (await one(`SELECT id FROM ${tbl} WHERE code=$1`, [code])).id;
const ENERGY = await idOf("nutrition_nutrients", "energy");
const KCAL = await idOf("nutrition_units", "kcal");
const PIECE = await idOf("nutrition_units", "piece");
const ALLERGEN = (await one(`SELECT id FROM nutrition_allergens LIMIT 1`)).id;

async function seedTenant(T, tag) {
  const client = (await one(`INSERT INTO clients (tenant_id, ad) VALUES ($1,$2) RETURNING id`, [T, `Danışan ${tag}`])).id;
  const srcId = (await one(`INSERT INTO nutrition_sources (tenant_id, title, source_type) VALUES ($1,$2,'book') RETURNING id`, [T, `Kaynak ${tag}`])).id;
  const food = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,$2) RETURNING id`, [T, `Ev Yoğurdu ${tag}`])).id;
  await db.query(`INSERT INTO nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams, source_id) VALUES ($1,$2,$3,61,$4,100,$5)`, [T, food, ENERGY, KCAL, srcId]);
  await db.query(`INSERT INTO nutrition_food_portions (tenant_id, food_id, label_tr, quantity, measure_unit_id, gram_weight) VALUES ($1,$2,'1 kase',2,$3,150)`, [T, food, PIECE]);
  await db.query(`INSERT INTO nutrition_food_external_refs (tenant_id, food_id, provider, external_id) VALUES ($1,$2,'manual',$3)`, [T, food, `m-${tag}`]);
  await db.query(`INSERT INTO nutrition_food_traditional (tenant_id, food_id, thermal_quality, source_id) VALUES ($1,$2,'cold',$3)`, [T, food, srcId]);
  await db.query(`INSERT INTO nutrition_food_sources (tenant_id, food_id, source_id) VALUES ($1,$2,$3)`, [T, food, srcId]);
  const fork = (await one(`SELECT nutrition_food_fork_system($1,$2,$3) AS id`, [T, SYS, SYS_FOOD])).id;
  await db.query(`INSERT INTO nutrition_food_tenant_hidden (tenant_id, food_id) VALUES ($1,$2)`, [T, SYS_FOOD2]);
  const topic = (await one(`INSERT INTO nutrition_topics (tenant_id, topic_type, title) VALUES ($1,'dietary_pattern',$2) RETURNING id`, [T, `Akdeniz ${tag}`])).id;
  await db.query(`INSERT INTO nutrition_topic_sections (tenant_id, topic_id, heading, content) VALUES ($1,$2,'Özet','...')`, [T, topic]);
  await db.query(`INSERT INTO nutrition_topic_foods (tenant_id, topic_id, food_id, relation_type) VALUES ($1,$2,$3,'recommended')`, [T, topic, fork]);
  await db.query(`INSERT INTO nutrition_topic_sources (tenant_id, topic_id, source_id) VALUES ($1,$2,$3)`, [T, topic, srcId]);
  const plan = (await one(`SELECT nutrition_plan_create_with_days($1,$2,date '2026-10-01',date '2026-10-02',1800,NULL) AS p`, [T, `Plan ${tag}`])).p;
  const day = (await one(`SELECT id FROM nutrition_plan_days WHERE plan_id=$1 ORDER BY plan_date LIMIT 1`, [plan.id])).id;
  const meal = (await one(`INSERT INTO nutrition_plan_meals (tenant_id, plan_id, plan_day_id, meal_type, label) VALUES ($1,$2,$3,'breakfast','Kahvaltı') RETURNING id`, [T, plan.id, day])).id;
  await db.query(`SELECT nutrition_plan_item_create_or_replace($1,$2,NULL,$3,150,NULL,$4::jsonb,$5::jsonb)`, [T, meal, food,
    JSON.stringify({ food_name: `Ev Yoğurdu ${tag}`, food_ownership: "custom" }), JSON.stringify([{ nutrient_code: "energy", amount: 61, unit_code: "kcal" }])]);
  await db.query(`SELECT nutrition_template_create_from_day($1,$2,$3,NULL)`, [T, day, `Gün şablonu ${tag}`]);
  await db.query(`INSERT INTO nutrition_client_profiles (tenant_id, client_id) VALUES ($1,$2)`, [T, client]);
  await db.query(`INSERT INTO nutrition_client_measurements (tenant_id, client_id, weight_kg) VALUES ($1,$2,70)`, [T, client]);
  await db.query(`INSERT INTO nutrition_client_allergens (tenant_id, client_id, allergen_id) VALUES ($1,$2,$3)`, [T, client, ALLERGEN]);
  await db.query(`INSERT INTO nutrition_client_food_preferences (tenant_id, client_id, stance, food_label) VALUES ($1,$2,'avoided','Süt')`, [T, client]);
  await db.query(`INSERT INTO nutrition_plan_clients (tenant_id, plan_family_id, client_id) VALUES ($1,$2,$3)`, [T, plan.plan_family_id ?? plan.id, client]);
  return { client };
}

const SYS_FOOD = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,'Elma Suyu') RETURNING id`, [SYS])).id;
await db.query(`INSERT INTO nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams) VALUES ($1,$2,$3,46,$4,100)`, [SYS, SYS_FOOD, ENERGY, KCAL]);
const SYS_FOOD2 = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,'Muz') RETURNING id`, [SYS])).id;
await seedTenant(A, "A");
await seedTenant(B, "B");

// Yedek: route ile aynı süzgeç (tenant_id = A), tablo sırası karıştırılmış (JSON anahtar sırasına güvenilmez).
const backup = {};
for (const t of [...NUTRITION_BACKUP_TABLES].reverse()) {
  backup[t] = (await db.query(`SELECT * FROM ${t} WHERE tenant_id = $1`, [A])).rows;
}
const empty = NUTRITION_BACKUP_TABLES.filter((t) => backup[t].length === 0);
ok("26 tablonun HER BİRİ yedekte dolu (gerçek kapsam)", empty.length === 0, `boş: ${empty.join(", ")}`);
ok("B tenant'ının hiçbir satırı yedekte yok", NUTRITION_BACKUP_TABLES.every((t) => backup[t].every((r) => r.tenant_id === A)));
ok("SİSTEM kataloğu yedekte yok (Elma Suyu aslı)", !backup.nutrition_foods.some((r) => r.id === SYS_FOOD));
ok("kişisel kopya (origin_food_id) yedekte", backup.nutrition_foods.some((r) => r.origin_food_id === SYS_FOOD));
const counts = Object.fromEntries(NUTRITION_BACKUP_TABLES.map((t) => [t, backup[t].length]));

// Veri kaybı (A): üst kayıtları sil (cascade), danışan KALIR (clients önce geri yüklenir varsayımı).
await db.query(`DELETE FROM nutrition_plan_clients WHERE tenant_id=$1`, [A]);
await db.query(`DELETE FROM nutrition_plans WHERE tenant_id=$1`, [A]);
await db.query(`DELETE FROM nutrition_templates WHERE tenant_id=$1`, [A]);
await db.query(`DELETE FROM nutrition_topics WHERE tenant_id=$1`, [A]);
await db.query(`DELETE FROM nutrition_food_tenant_hidden WHERE tenant_id=$1`, [A]);
await db.query(`DELETE FROM nutrition_foods WHERE tenant_id=$1`, [A]);
await db.query(`DELETE FROM nutrition_sources WHERE tenant_id=$1`, [A]);
for (const t of ["nutrition_client_profiles", "nutrition_client_measurements", "nutrition_client_allergens", "nutrition_client_food_preferences"]) {
  await db.query(`DELETE FROM ${t} WHERE tenant_id=$1`, [A]);
}
const afterLoss = await Promise.all(NUTRITION_BACKUP_TABLES.map(async (t) => Number((await one(`SELECT count(*) n FROM ${t} WHERE tenant_id=$1`, [A])).n)));
ok("veri kaybı simülasyonu: A'nın tüm beslenme satırları 0", afterLoss.every((n) => n === 0), afterLoss.join(","));

// Geri yükleme: route ile aynı sıralama + upsert ignoreDuplicates eşdeğeri (ON CONFLICT DO NOTHING).
async function restore() {
  let inserted = 0;
  const order = orderTablesForRestore(Object.keys(backup), NUTRITION_BACKUP_TABLES);
  for (const t of order) {
    const rows = backup[t].map((r) => ({ ...r, tenant_id: A }));
    if (rows.length === 0) continue;
    const res = await db.query(
      `INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb) ON CONFLICT DO NOTHING`,
      [JSON.stringify(rows)],
    );
    inserted += res.affectedRows ?? 0;
  }
  return inserted;
}
let restoreErr = null;
try { await restore(); } catch (e) { restoreErr = e.message; }
ok("geri yükleme FK hatası olmadan tamamlandı (anahtar sırası karışık)", restoreErr === null, restoreErr ?? "");
const mismatch = [];
for (const t of NUTRITION_BACKUP_TABLES) {
  const n = Number((await one(`SELECT count(*) n FROM ${t} WHERE tenant_id=$1`, [A])).n);
  if (n !== counts[t]) mismatch.push(`${t}: ${n}/${counts[t]}`);
}
ok("her tabloda satır sayısı birebir geri geldi", mismatch.length === 0, mismatch.join("; "));
ok("plan kalemi snapshot değeri korunmuş (61 kcal)", Number((await one(`SELECT n.amount FROM nutrition_plan_item_nutrients n WHERE n.tenant_id=$1 AND n.nutrient_code='energy'`, [A])).amount) === 61);
ok("kişisel kopya effective çözülüyor (geri yükleme sonrası)", (await one(`SELECT * FROM nutrition_food_resolve_effective($1,$2,$3)`, [A, SYS, SYS_FOOD]))?.redirected === true);
ok("gizlenen sistem besini geri yükleme sonrası da A'da gizli", !(await one(`SELECT * FROM nutrition_food_resolve_effective($1,$2,$3)`, [A, SYS, SYS_FOOD2])));
let again = -1;
try { again = await restore(); } catch { again = -2; }
ok("ikinci geri yükleme idempotent (0 yeni satır)", again === 0, String(again));
ok("B tenant'ı etkilenmedi", Number((await one(`SELECT count(*) n FROM nutrition_foods WHERE tenant_id=$1`, [B])).n) === 2);

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
