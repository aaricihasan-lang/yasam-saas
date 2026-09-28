// ============================================================
// Beslenme — YEDEK v3 KAPSAMI harness'i (Ayarlar → Yedekle / Geri Yükle, lib/backup).
//   [A] REGISTRY: migration'lardaki TÜM tenant'lı nutrition_* tabloları sınıflandırılmış;
//       nutrition_food_tenant_hidden = YEDEK; nutrition_destructive_challenges = YEDEK DIŞI
//       (transient); kişisel kopya origin_food_id + gizleme food_id ebeveyni SİSTEM tenant'ında.
//   [B] GERÇEK MOTOR + GERÇEK DB (PGlite): lib/backup exportTableAll → veri kaybı →
//       restoreChunk (topolojik sıra) — satır sayıları birebir; kopya bağı + gizleme korunur;
//       ikinci geri yükleme idempotent; başka tenant / SİSTEM kataloğu yedeğe GİRMEZ;
//       challenge tablosu yedeğe GİRMEZ.
//   [C] GÜVENLİK: sahte yedek satırı başka tenant'ın besinine işaret ederse (gizleme / kopya bağı)
//       reddedilir / bağ boşaltılır; sistem besini artık yoksa kopya korunur, bağ NULL.
// Çalıştırma: npx tsx scripts/beslenme-editability/backupHarness.mjs   FAIL → exit 1.
// ============================================================
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bootstrapNutritionDb, ROOT } from "./pgBootstrap.mjs";
import { BACKUP_REGISTRY, getRegistryEntry, isExportable, topologicalOrder } from "../../lib/backup/registry.ts";
import { exportTableAll, restoreChunk } from "../../lib/backup/engine.ts";
import { SYSTEM_NUTRITION_TENANT_ID as SYS } from "../../lib/beslenme/systemTenant.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };

// ── PGlite üzerinde Supabase-js alt kümesi (lib/backup motorunun kullandığı kadar) ──
function makeDb(pg) {
  const ident = (s) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad ident ${s}`);
    return `"${s}"`;
  };
  function builder(table) {
    const st = { op: "select", cols: "*", count: false, head: false, where: [], params: [], order: null, limit: null, rows: null, onConflict: null, returning: null };
    const addParam = (v) => { st.params.push(v); return `$${st.params.length}`; };
    const b = {
      select(cols = "*", opts = {}) {
        if (st.op === "upsert") { st.returning = cols; return b; }
        st.cols = cols; st.count = opts.count === "exact"; st.head = !!opts.head; return b;
      },
      eq(c, v) { st.where.push(`${ident(c)} = ${addParam(v)}`); return b; },
      gt(c, v) { st.where.push(`${ident(c)} > ${addParam(v)}`); return b; },
      in(c, arr) { st.where.push(`${ident(c)}::text = ANY(${addParam(arr.map(String))}::text[])`); return b; },
      order(c, o = {}) { st.order = `${ident(c)} ${o.ascending === false ? "DESC" : "ASC"}`; return b; },
      limit(n) { st.limit = n; return b; },
      upsert(rows, opts = {}) { st.op = "upsert"; st.rows = rows; st.onConflict = opts.onConflict; return b; },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      try {
        if (st.op === "upsert") {
          if (!st.rows.length) return { data: [], error: null };
          const cols = [...new Set(st.rows.flatMap((r) => Object.keys(r)))].map(ident);
          const conflict = st.onConflict.split(",").map((x) => ident(x.trim())).join(", ");
          const ret = st.returning ? st.returning.split(",").map((x) => ident(x.trim())).join(", ") : "1";
          const r = await pg.query(
            `INSERT INTO ${ident(table)} (${cols.join(", ")}) SELECT ${cols.join(", ")} FROM jsonb_populate_recordset(NULL::${ident(table)}, $1::jsonb) ON CONFLICT (${conflict}) DO NOTHING RETURNING ${ret}`,
            [JSON.stringify(st.rows)],
          );
          return { data: r.rows, error: null };
        }
        const where = st.where.length ? ` WHERE ${st.where.join(" AND ")}` : "";
        if (st.head && st.count) {
          const r = await pg.query(`SELECT count(*)::int n FROM ${ident(table)}${where}`, st.params);
          return { data: null, count: r.rows[0].n, error: null };
        }
        const cols = st.cols === "*" ? "*" : st.cols.split(",").map((x) => ident(x.trim())).join(", ");
        const sql = `SELECT ${cols} FROM ${ident(table)}${where}${st.order ? ` ORDER BY ${st.order}` : ""}${st.limit !== null ? ` LIMIT ${Number(st.limit)}` : ""}`;
        const r = await pg.query(sql, st.params);
        const data = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
        return { data, count: st.count ? data.length : null, error: null };
      } catch (e) {
        return { data: null, count: null, error: { code: e.code ?? "XX000", message: e.message } };
      }
    }
    return b;
  }
  return { from: (t) => builder(t) };
}

console.log("\n[A] registry sınıflandırması");
const tenantTables = new Set();
for (const f of readdirSync(join(ROOT, "supabase", "migrations")).filter((x) => /_nutrition_.*\.sql$/.test(x))) {
  const sql = readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
  for (const m of sql.matchAll(/CREATE TABLE public\.(nutrition_[a-z_]+)\s*\(([\s\S]*?)\n\);/g)) if (/\btenant_id\s+uuid/.test(m[2])) tenantTables.add(m[1]);
}
const unclassified = [...tenantTables].filter((t) => !getRegistryEntry(t));
ok(`tenant'lı ${tenantTables.size} nutrition tablosunun hepsi registry'de`, unclassified.length === 0, unclassified.join(","));
const hidden = getRegistryEntry("nutrition_food_tenant_hidden");
const ch = getRegistryEntry("nutrition_destructive_challenges");
const foods = getRegistryEntry("nutrition_foods");
ok("nutrition_food_tenant_hidden = YEDEK (beslenme modülü)", !!hidden && isExportable(hidden) && hidden.class === "backup" && hidden.module === "beslenme");
ok("nutrition_destructive_challenges = YEDEK DIŞI (transient)", !!ch && !isExportable(ch) && ch.class === "transient");
ok("kişisel kopya bağı: origin_food_id ebeveyni SİSTEM tenant'ında, optional",
  foods.fkParents.some((p) => p.column === "origin_food_id" && p.table === "nutrition_foods" && p.optional === true && p.parentTenantId === SYS));
ok("gizleme: food_id ebeveyni SİSTEM tenant'ında (zorunlu)",
  hidden.fkParents.some((p) => p.column === "food_id" && p.table === "nutrition_foods" && !p.optional && p.parentTenantId === SYS));
const nutritionExportable = BACKUP_REGISTRY.filter((e) => e.table.startsWith("nutrition_") && isExportable(e)).map((e) => e.table);
ok(`dışa aktarılan nutrition tablosu sayısı 26`, nutritionExportable.length === 26, String(nutritionExportable.length));
let topo = [];
try { topo = topologicalOrder(); } catch { topo = []; }
ok("topolojik sıra kurulabiliyor (FK döngüsü yok)", topo.length > 0);
const pos = new Map(topo.map((e, i) => [e.table, i]));
ok("gizleme tablosu besinlerden SONRA", pos.get("nutrition_food_tenant_hidden") > pos.get("nutrition_foods"));

console.log("\n[B] gerçek motor + gerçek DB gidiş-dönüş");
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
const { db: pg } = await bootstrapNutritionDb();
const one = async (sql, p = []) => (await pg.query(sql, p)).rows[0];
const idOf = async (tbl, code) => (await one(`SELECT id FROM ${tbl} WHERE code=$1`, [code])).id;
const ENERGY = await idOf("nutrition_nutrients", "energy");
const KCAL = await idOf("nutrition_units", "kcal");
const PIECE = await idOf("nutrition_units", "piece");
const ALLERGEN = (await one(`SELECT id FROM nutrition_allergens LIMIT 1`)).id;
const SF = [];
for (let i = 0; i < 4; i++) {
  const f = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,$2) RETURNING id`, [SYS, `Sistem ${i}`])).id;
  await pg.query(`INSERT INTO nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams) VALUES ($1,$2,$3,46,$4,100)`, [SYS, f, ENERGY, KCAL]);
  SF.push(f);
}
async function seedTenant(T, tag) {
  const client = (await one(`INSERT INTO clients (tenant_id, ad) VALUES ($1,$2) RETURNING id`, [T, `Danışan ${tag}`])).id;
  const src = (await one(`INSERT INTO nutrition_sources (tenant_id, title, source_type) VALUES ($1,$2,'book') RETURNING id`, [T, `Kaynak ${tag}`])).id;
  const food = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,$2) RETURNING id`, [T, `Ev Yoğurdu ${tag}`])).id;
  await pg.query(`INSERT INTO nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams, source_id) VALUES ($1,$2,$3,61,$4,100,$5)`, [T, food, ENERGY, KCAL, src]);
  await pg.query(`INSERT INTO nutrition_food_portions (tenant_id, food_id, label_tr, quantity, measure_unit_id, gram_weight) VALUES ($1,$2,'1 kase',2,$3,150)`, [T, food, PIECE]);
  await pg.query(`INSERT INTO nutrition_food_external_refs (tenant_id, food_id, provider, external_id) VALUES ($1,$2,'manual',$3)`, [T, food, `m-${tag}`]);
  await pg.query(`INSERT INTO nutrition_food_traditional (tenant_id, food_id, thermal_quality, source_id) VALUES ($1,$2,'cold',$3)`, [T, food, src]);
  await pg.query(`INSERT INTO nutrition_food_sources (tenant_id, food_id, source_id) VALUES ($1,$2,$3)`, [T, food, src]);
  const fork = (await one(`SELECT nutrition_food_fork_system($1,$2,$3) AS id`, [T, SYS, SF[0]])).id;
  await pg.query(`INSERT INTO nutrition_food_tenant_hidden (tenant_id, food_id) VALUES ($1,$2)`, [T, SF[1]]);
  const topic = (await one(`INSERT INTO nutrition_topics (tenant_id, topic_type, title) VALUES ($1,'dietary_pattern',$2) RETURNING id`, [T, `Akdeniz ${tag}`])).id;
  await pg.query(`INSERT INTO nutrition_topic_sections (tenant_id, topic_id, heading, content) VALUES ($1,$2,'Özet','...')`, [T, topic]);
  await pg.query(`INSERT INTO nutrition_topic_foods (tenant_id, topic_id, food_id, relation_type) VALUES ($1,$2,$3,'recommended')`, [T, topic, fork]);
  await pg.query(`INSERT INTO nutrition_topic_sources (tenant_id, topic_id, source_id) VALUES ($1,$2,$3)`, [T, topic, src]);
  const plan = (await one(`SELECT nutrition_plan_create_with_days($1,$2,date '2026-10-01',date '2026-10-02',1800,NULL) AS p`, [T, `Plan ${tag}`])).p;
  const day = (await one(`SELECT id FROM nutrition_plan_days WHERE plan_id=$1 ORDER BY plan_date LIMIT 1`, [plan.id])).id;
  const meal = (await one(`INSERT INTO nutrition_plan_meals (tenant_id, plan_id, plan_day_id, meal_type, label) VALUES ($1,$2,$3,'breakfast','Kahvaltı') RETURNING id`, [T, plan.id, day])).id;
  await pg.query(`SELECT nutrition_plan_item_create_or_replace($1,$2,NULL,$3,150,NULL,$4::jsonb,$5::jsonb)`, [T, meal, food,
    JSON.stringify({ food_name: `Ev Yoğurdu ${tag}`, food_ownership: "custom" }), JSON.stringify([{ nutrient_code: "energy", amount: 61, unit_code: "kcal" }])]);
  await pg.query(`SELECT nutrition_template_create_from_day($1,$2,$3,NULL)`, [T, day, `Gün şablonu ${tag}`]);
  await pg.query(`INSERT INTO nutrition_client_profiles (tenant_id, client_id) VALUES ($1,$2)`, [T, client]);
  await pg.query(`INSERT INTO nutrition_client_measurements (tenant_id, client_id, weight_kg) VALUES ($1,$2,70)`, [T, client]);
  await pg.query(`INSERT INTO nutrition_client_allergens (tenant_id, client_id, allergen_id) VALUES ($1,$2,$3)`, [T, client, ALLERGEN]);
  await pg.query(`INSERT INTO nutrition_client_food_preferences (tenant_id, client_id, stance, food_label) VALUES ($1,$2,'avoided','Süt')`, [T, client]);
  await pg.query(`INSERT INTO nutrition_plan_clients (tenant_id, plan_family_id, client_id) VALUES ($1,$2,$3)`, [T, plan.plan_family_id ?? plan.id, client]);
  await pg.query(`INSERT INTO nutrition_destructive_challenges (tenant_id,user_id,action,scope_hash,item_count,code_hash,expires_at) VALUES ($1,$2,'food_reset_all',$3,1,$3,now()+interval '5 min')`, [T, UA, "a".repeat(64)]);
  return { fork };
}
const seededA = await seedTenant(A, "A");
await seedTenant(B, "B");

const db = makeDb(pg);
const order = topologicalOrder().filter((e) => e.table.startsWith("nutrition_"));
ok("dışa aktarım sırasında challenge tablosu YOK", !order.some((e) => e.table === "nutrition_destructive_challenges"));
const backup = {};
const incomplete = [];
for (const e of order) {
  const r = await exportTableAll(db, e, A, { pageSize: 3 }); // küçük sayfa → keyset sayfalama gerçekten çalışır
  backup[e.table] = r.rows;
  if (!r.complete) incomplete.push(`${e.table}:${r.error ?? `${r.rows.length}/${r.expected_count}`}`);
}
ok("26 tablonun her biri eksiksiz dışa aktarıldı (sayfalı, expected_count eşit)", incomplete.length === 0, incomplete.join("; "));
const empty = order.filter((e) => backup[e.table].length === 0).map((e) => e.table);
ok("26 tablonun HER BİRİ yedekte dolu", empty.length === 0, empty.join(","));
ok("gizleme satırı yedekte", backup.nutrition_food_tenant_hidden.some((r) => r.food_id === SF[1]));
ok("kişisel kopya origin_food_id ile yedekte", backup.nutrition_foods.some((r) => r.origin_food_id === SF[0]));
ok("B tenant'ının hiçbir satırı yedekte yok", order.every((e) => backup[e.table].every((r) => r.tenant_id === undefined || r.tenant_id === A)));
ok("SİSTEM kataloğu yedekte yok", !backup.nutrition_foods.some((r) => SF.includes(r.id)));
const counts = Object.fromEntries(order.map((e) => [e.table, backup[e.table].length]));

// Veri kaybı (A)
for (const t of ["nutrition_plan_clients", "nutrition_plans", "nutrition_templates", "nutrition_topics", "nutrition_food_tenant_hidden", "nutrition_foods", "nutrition_sources",
  "nutrition_client_profiles", "nutrition_client_measurements", "nutrition_client_allergens", "nutrition_client_food_preferences"]) {
  await pg.query(`DELETE FROM ${t} WHERE tenant_id=$1`, [A]);
}
const ctx = { tenantId: A, userId: UA, role: "admin", modulePermissions: {}, membershipActive: true };
async function restoreAll(bk) {
  const reports = [];
  for (const e of order) reports.push(await restoreChunk(db, ctx, e.table, bk[e.table] ?? []));
  return reports;
}
const rep1 = await restoreAll(backup);
const failed = rep1.filter((r) => r.failed.length > 0 || r.parent_missing > 0 || r.status === "FAILED").map((r) => `${r.table}:${r.status}`);
ok("geri yükleme hatasız (FK/parent_missing/failed yok)", failed.length === 0, failed.join("; "));
const mismatch = [];
for (const e of order) {
  const n = Number((await one(`SELECT count(*) n FROM ${e.table} WHERE tenant_id=$1`, [A])).n);
  if (n !== counts[e.table]) mismatch.push(`${e.table}: ${n}/${counts[e.table]}`);
}
ok("her tabloda satır sayısı birebir geri geldi", mismatch.length === 0, mismatch.join("; "));
ok("kişisel kopya bağı KORUNDU (origin NULL'a düşmedi)", (await one(`SELECT origin_food_id FROM nutrition_foods WHERE id=$1`, [seededA.fork]))?.origin_food_id === SF[0]);
ok("kişisel kopya effective çözülüyor", (await one(`SELECT * FROM nutrition_food_resolve_effective($1,$2,$3)`, [A, SYS, SF[0]]))?.redirected === true);
ok("gizlenen sistem besini A'da hâlâ gizli", !(await one(`SELECT * FROM nutrition_food_resolve_effective($1,$2,$3)`, [A, SYS, SF[1]])));
ok("plan kalemi snapshot değeri korunmuş (61 kcal)", Number((await one(`SELECT n.amount FROM nutrition_plan_item_nutrients n WHERE n.tenant_id=$1 AND n.nutrient_code='energy'`, [A])).amount) === 61);
ok("challenge tablosuna geri yükleme YAZMADI (yalnız B'nin + A'nın silinmemiş kaydı)", Number((await one(`SELECT count(*) n FROM nutrition_destructive_challenges`)).n) === 2);
const rep2 = await restoreAll(backup);
ok("ikinci geri yükleme idempotent (0 yeni satır)", rep2.reduce((s, r) => s + r.inserted, 0) === 0, String(rep2.reduce((s, r) => s + r.inserted, 0)));
ok("B tenant'ı etkilenmedi", Number((await one(`SELECT count(*) n FROM nutrition_foods WHERE tenant_id=$1`, [B])).n) === 2);

console.log("\n[C] sahte yedek satırları + katalog değişimi");
const bFood = (await one(`SELECT id FROM nutrition_foods WHERE tenant_id=$1 AND origin_food_id IS NULL LIMIT 1`, [B])).id;
const hostile = {
  nutrition_foods: [{ id: "cccccccc-0000-4000-8000-00000000000c", tenant_id: A, name_tr: "Sızma denemesi", aliases: [], is_active: true, sort_order: 0, origin_food_id: bFood }],
  nutrition_food_tenant_hidden: [{ tenant_id: A, food_id: bFood }],
};
const rf = await restoreChunk(db, ctx, "nutrition_foods", hostile.nutrition_foods);
const rh = await restoreChunk(db, ctx, "nutrition_food_tenant_hidden", hostile.nutrition_food_tenant_hidden);
ok("başka tenant'ın besinine işaret eden kopya bağı BOŞALTILDI (fk_nulled)", rf.fk_nulled === 1 && (await one(`SELECT origin_food_id FROM nutrition_foods WHERE id=$1`, ["cccccccc-0000-4000-8000-00000000000c"]))?.origin_food_id === null);
ok("başka tenant'ın besinini gizleme satırı REDDEDİLDİ (parent_missing)", rh.parent_missing === 1 && !(await one(`SELECT 1 x FROM nutrition_food_tenant_hidden WHERE tenant_id=$1 AND food_id=$2`, [A, bFood])));
// Sistem besini katalogdan kalkmışsa: kopya korunur (bağ NULL), gizleme satırı atlanır
await pg.query(`DELETE FROM nutrition_topics WHERE tenant_id=$1`, [A]); // rehber→besin RESTRICT
await pg.query(`DELETE FROM nutrition_foods WHERE tenant_id=$1`, [A]);
await pg.query(`DELETE FROM nutrition_food_tenant_hidden WHERE tenant_id=$1`, [A]);
await pg.query(`DELETE FROM nutrition_foods WHERE id = ANY($1::uuid[])`, [[SF[0], SF[1]]]);
const r3f = await restoreChunk(db, ctx, "nutrition_foods", backup.nutrition_foods);
const r3h = await restoreChunk(db, ctx, "nutrition_food_tenant_hidden", backup.nutrition_food_tenant_hidden);
const forkBack = await one(`SELECT origin_food_id FROM nutrition_foods WHERE id=$1`, [seededA.fork]);
ok("sistem besini artık yoksa kişisel kopya KORUNUR, bağ NULL (DB ON DELETE SET NULL ile tutarlı)", !!forkBack && forkBack.origin_food_id === null && r3f.fk_nulled >= 1);
ok("var olmayan sistem besininin gizleme satırı atlanır", r3h.parent_missing === 1);

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
