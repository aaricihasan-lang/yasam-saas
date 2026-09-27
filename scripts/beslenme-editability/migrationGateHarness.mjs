// ============================================================
// Beslenme — PRODUCTION MIGRATION GATE harness'i (GERÇEK PostgreSQL 18, embedded-postgres).
// Production'a SIFIR temas: geçici yerel küme, sentetik veri, iş sonunda silinir.
//
// Supabase ortamı taklit edilir:
//   • roller: anon, authenticated (NOLOGIN), service_role (NOLOGIN BYPASSRLS)
//   • ALTER DEFAULT PRIVILEGES: public şemada YENİ tablo/fonksiyon/sequence → anon, authenticated,
//     service_role'e ALL (Supabase varsayılanı). Böylece migration'daki REVOKE'ların gerçekten
//     çalıştığı kanıtlanır (varsayılan geniş yetki kapatılmış olmalı).
//   • extensions şeması + unaccent/pgcrypto; yh_immutable_unaccent gerçek tanımı.
//
// Kapsam (talimat §1–§20): fresh zincir · mevcut şema üzerine upgrade (veri/checksum/arama
//   birebir) · GRANT/EXECUTE/RLS matrisi · anon/authenticated negatif testler · SECURITY DEFINER
//   yokluğu + search_path · challenge okunamazlığı · consume eşzamanlılığı · 5 yanlış kilit ·
//   tenant IDOR · sistem satırı checksum · origin/hidden unique + eşzamanlı fork · FK davranışı ·
//   arama izolasyonu · snapshot refresh durum/tenant · kilit/süre ölçümü.
// Çalıştır: node scripts/beslenme-editability/migrationGateHarness.mjs   FAIL → exit 1.
// ============================================================
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = path.join(ROOT, "supabase", "migrations");
const NEW = [
  "20270201000000_nutrition_food_atomic_replace.sql",
  "20270201000100_nutrition_food_personalization.sql",
  "20270201000200_nutrition_destructive_challenges.sql",
  "20270201000300_nutrition_plan_refresh_snapshots.sql",
];
const OLD = readdirSync(MIG).filter((f) => /_nutrition_.*\.sql$/.test(f) && !NEW.includes(f)).sort();
const read = (f) => readFileSync(path.join(MIG, f), "utf8");

const DATA_DIR = path.join(os.tmpdir(), `beslenme-gate-pg-${process.pid}`);
const PORT = 54000 + (process.pid % 900);
const PW = "gatepw";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };
const errOf = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };

const SYS = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
const UB = "bbbbbbbb-1111-4000-8000-00000000000b";

const pgServer = new EmbeddedPostgres({
  databaseDir: DATA_DIR, port: PORT, user: "postgres", password: PW, persistent: false,
  initdbFlags: ["--encoding=UTF8", "--no-locale"], onLog: () => {}, onError: () => {},
});
const client = (database) => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database });

const SUPABASE_BASE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT anon, authenticated, service_role TO postgres;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS extensions;
  GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
  CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
  CREATE OR REPLACE FUNCTION public.yh_immutable_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $f$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1) $f$;
  CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $f$;
  CREATE TABLE IF NOT EXISTS public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, ad text, soyad text, kan text, mizac text,
    UNIQUE (tenant_id, id)
  );
`;

async function applyFiles(c, files) {
  const timings = {};
  for (const f of files) {
    const t0 = Date.now();
    await c.query(read(f));
    timings[f] = Date.now() - t0;
  }
  return timings;
}

// Tüm nutrition tablolarının içerik özeti (verilen kolonlar; satır sırası bağımsız).
async function tableDigest(c, table, cols) {
  const colList = cols.map((x) => `"${x}"`).join(", ");
  const r = await c.query(`SELECT count(*)::int n, coalesce(md5(string_agg(md5(row(${colList})::text), '' ORDER BY md5(row(${colList})::text))), '') h FROM public.${table}`);
  return `${r.rows[0].n}:${r.rows[0].h}`;
}
async function nutritionTables(c) {
  return (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'nutrition\\_%' ORDER BY 1`)).rows.map((r) => r.table_name);
}
async function columnsOf(c, table) {
  return (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows.map((r) => r.column_name);
}

async function seed(c) {
  const id = async (tbl, code) => (await c.query(`SELECT id FROM ${tbl} WHERE code=$1`, [code])).rows[0].id;
  const ENERGY = await id("nutrition_nutrients", "energy"), PROT = await id("nutrition_nutrients", "protein");
  const KCAL = await id("nutrition_units", "kcal"), G = await id("nutrition_units", "g"), PIECE = await id("nutrition_units", "piece");
  const sys = [];
  for (let i = 0; i < 60; i++) {
    const f = (await c.query(`INSERT INTO nutrition_foods (tenant_id, name_tr, aliases) VALUES ($1,$2,$3) RETURNING id`, [SYS, `Sistem Besini ${i} Şeftali`, [`alias${i}`]])).rows[0].id;
    await c.query(`INSERT INTO nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams) VALUES ($1,$2,$3,$4,$5,100),($1,$2,$6,$7,$8,100)`, [SYS, f, ENERGY, 40 + i, KCAL, PROT, 1 + i / 10, G]);
    await c.query(`INSERT INTO nutrition_food_portions (tenant_id, food_id, label_tr, quantity, measure_unit_id, gram_weight) VALUES ($1,$2,'1 adet',1,$3,$4)`, [SYS, f, PIECE, 100 + i]);
    await c.query(`INSERT INTO nutrition_food_external_refs (tenant_id, food_id, provider, external_id) VALUES ($1,$2,'usda_fdc',$3)`, [SYS, f, String(100000 + i)]);
    if (i % 5 === 0) await c.query(`INSERT INTO nutrition_food_traditional (tenant_id, food_id, thermal_quality) VALUES ($1,$2,'hot')`, [SYS, f]);
    sys.push(f);
  }
  for (const [T, tag] of [[A, "A"], [B, "B"]]) {
    const cl = (await c.query(`INSERT INTO clients (tenant_id, ad) VALUES ($1,$2) RETURNING id`, [T, `Danışan ${tag}`])).rows[0].id;
    const src = (await c.query(`INSERT INTO nutrition_sources (tenant_id, title, source_type) VALUES ($1,$2,'book') RETURNING id`, [T, `Kaynak ${tag}`])).rows[0].id;
    for (let k = 0; k < 5; k++) {
      const f = (await c.query(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,$2) RETURNING id`, [T, `Özel ${tag}${k} Yoğurt`])).rows[0].id;
      await c.query(`INSERT INTO nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams, source_id) VALUES ($1,$2,$3,$4,$5,100,$6)`, [T, f, ENERGY, 60 + k, KCAL, src]);
    }
    const topic = (await c.query(`INSERT INTO nutrition_topics (tenant_id, topic_type, title) VALUES ($1,'dietary_pattern',$2) RETURNING id`, [T, `Rehber ${tag}`])).rows[0].id;
    await c.query(`INSERT INTO nutrition_topic_sections (tenant_id, topic_id, heading, content) VALUES ($1,$2,'Özet','...')`, [T, topic]);
    const plan = (await c.query(`SELECT nutrition_plan_create_with_days($1,$2,date '2026-10-01',date '2026-10-07',1800,NULL) p`, [T, `Plan ${tag}`])).rows[0].p;
    const day = (await c.query(`SELECT id FROM nutrition_plan_days WHERE plan_id=$1 ORDER BY plan_date LIMIT 1`, [plan.id])).rows[0].id;
    const meal = (await c.query(`INSERT INTO nutrition_plan_meals (tenant_id, plan_id, plan_day_id, meal_type, label) VALUES ($1,$2,$3,'breakfast','Kahvaltı') RETURNING id`, [T, plan.id, day])).rows[0].id;
    await c.query(`SELECT nutrition_plan_item_create_or_replace($1,$2,NULL,$3,150,NULL,$4::jsonb,$5::jsonb)`, [T, meal, sys[0],
      JSON.stringify({ food_name: "Sistem Besini 0 Şeftali", food_ownership: "system", external_provider: "usda_fdc" }), JSON.stringify([{ nutrient_code: "energy", amount: 40, unit_code: "kcal" }])]);
    await c.query(`SELECT nutrition_template_create_from_day($1,$2,$3,NULL)`, [T, day, `Şablon ${tag}`]);
    await c.query(`INSERT INTO nutrition_client_measurements (tenant_id, client_id, weight_kg) VALUES ($1,$2,70)`, [T, cl]);
  }
  return { sys, ENERGY, KCAL, PROT, G, PIECE };
}

async function main() {
  await pgServer.initialise();
  await pgServer.start();
  const admin = client("postgres");
  await admin.connect();
  await admin.query("CREATE DATABASE fresh");
  await admin.query("CREATE DATABASE upgrade");
  await admin.end();

  // ═════ Q. FRESH DB: tüm nutrition zinciri + 4 yeni ═════
  console.log("\n[Q] fresh DB: mevcut nutrition zinciri + 4 yeni migration");
  const fresh = client("fresh");
  await fresh.connect();
  await fresh.query(SUPABASE_BASE);
  let freshErr = null;
  try { await applyFiles(fresh, [...OLD, ...NEW]); } catch (e) { freshErr = e.message; }
  ok(`${OLD.length} mevcut + 4 yeni migration sıfırdan hatasız`, freshErr === null, freshErr ?? "");
  await fresh.end();

  // ═════ R. UPGRADE: önce eski zincir + veri, sonra 4 yeni ═════
  console.log("\n[R] mevcut şema + veri üzerine upgrade");
  const c = client("upgrade");
  await c.connect();
  await c.query(SUPABASE_BASE);
  await applyFiles(c, OLD);
  const S = await seed(c);
  const beforeTables = await nutritionTables(c);
  const beforeCols = {};
  const beforeDigest = {};
  for (const t of beforeTables) {
    beforeCols[t] = await columnsOf(c, t);
    beforeDigest[t] = await tableDigest(c, t, beforeCols[t]);
  }
  const searchSig = async (T, q) =>
    (await c.query(`SELECT id, is_system FROM nutrition_food_search($1,$2,$3,NULL,false,200,0) ORDER BY id`, [T, SYS, q])).rows.map((r) => `${r.id}:${r.is_system}`).join(",");
  const beforeSearch = { A: await searchSig(A, null), B: await searchSig(B, null), As: await searchSig(A, "seftali"), Bs: await searchSig(B, "yogurt") };

  let upErr = null;
  let timings = {};
  try { timings = await applyFiles(c, NEW); } catch (e) { upErr = e.message; }
  ok("4 migration mevcut şema + veri üzerine hatasız uygulandı", upErr === null, upErr ?? "");
  const afterDigestDiff = [];
  for (const t of beforeTables) {
    const d = await tableDigest(c, t, beforeCols[t]);
    if (d !== beforeDigest[t]) afterDigestDiff.push(t);
  }
  ok(`mevcut ${beforeTables.length} nutrition tablosunun satır sayısı + içeriği BİREBİR (DML yok)`, afterDigestDiff.length === 0, afterDigestDiff.join(", "));
  ok("mevcut satırlarda origin_food_id NULL", Number((await c.query(`SELECT count(*) n FROM nutrition_foods WHERE origin_food_id IS NOT NULL`)).rows[0].n) === 0);
  ok("yeni tablolar boş başlar", Number((await c.query(`SELECT (SELECT count(*) FROM nutrition_food_tenant_hidden)+(SELECT count(*) FROM nutrition_destructive_challenges) n`)).rows[0].n) === 0);
  const afterSearch = { A: await searchSig(A, null), B: await searchSig(B, null), As: await searchSig(A, "seftali"), Bs: await searchSig(B, "yogurt") };
  ok("arama sonuçları upgrade öncesi/sonrası birebir (kopya/gizleme yokken davranış aynı)", JSON.stringify(beforeSearch) === JSON.stringify(afterSearch));
  const newTables = (await nutritionTables(c)).filter((t) => !beforeTables.includes(t));
  ok("yalnız 2 yeni tablo eklendi", JSON.stringify(newTables.sort()) === JSON.stringify(["nutrition_destructive_challenges", "nutrition_food_tenant_hidden"]), newTables.join(","));
  ok("nutrition_foods'a eklenen tek kolon origin_food_id",
    (await columnsOf(c, "nutrition_foods")).filter((x) => !beforeCols.nutrition_foods.includes(x)).join(",") === "origin_food_id");
  const colDiffs = [];
  for (const t of beforeTables) {
    const added = (await columnsOf(c, t)).filter((x) => !beforeCols[t].includes(x));
    if (t !== "nutrition_foods" && added.length) colDiffs.push(`${t}:${added}`);
  }
  ok("diğer mevcut tablolarda kolon değişikliği yok", colDiffs.length === 0, colDiffs.join("; "));
  console.log(`     ⏱ süreler (ms): ${Object.entries(timings).map(([f, ms]) => `${f.slice(15, 45)}=${ms}`).join(" · ")}`);

  // ═════ Yeni nesnelerin kataloğu ═════
  const NEW_FUNCS = [
    "nutrition_food_assert_writable", "nutrition_food_nutrients_replace", "nutrition_food_portions_replace",
    "nutrition_food_traditional_replace", "nutrition_food_resolve_effective", "nutrition_food_fork_system",
    "nutrition_food_remove", "nutrition_food_reset_personalized", "nutrition_food_search",
    "nutrition_challenge_consume", "nutrition_plan_refresh_item_snapshots", "nutrition_foods_origin_guard",
  ];
  const fns = (await c.query(`
    SELECT p.proname, p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid) args, p.oid::regprocedure::text sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
           has_function_privilege('service_role', p.oid, 'EXECUTE') svc_x,
           EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type='EXECUTE') public_x
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY($1) ORDER BY p.proname`, [NEW_FUNCS])).rows;

  console.log("\n[E] RPC EXECUTE matrisi (Supabase varsayılan yetkileri AÇIKKEN)");
  ok(`12 yeni/değişen fonksiyonun hepsi bulundu`, fns.length === NEW_FUNCS.length, fns.map((f) => f.proname).join(","));
  for (const f of fns) {
    const isTrigger = f.proname === "nutrition_foods_origin_guard";
    ok(`${f.proname}: PUBLIC ✗ anon ✗ authenticated ✗ service_role ${isTrigger ? "(trigger)" : "✓"}`,
      !f.public_x && !f.anon_x && !f.auth_x && (isTrigger || f.svc_x),
      `public=${f.public_x} anon=${f.anon_x} auth=${f.auth_x} svc=${f.svc_x}`);
  }
  console.log("\n[F/G] SECURITY DEFINER + search_path");
  ok("yeni fonksiyonların HİÇBİRİ SECURITY DEFINER değil (hepsi INVOKER)", fns.every((f) => !f.prosecdef), fns.filter((f) => f.prosecdef).map((f) => f.proname).join(","));
  ok("trigger dışı tüm yeni fonksiyonlarda sabit search_path (pg_catalog, public)",
    fns.filter((f) => f.proname !== "nutrition_foods_origin_guard").every((f) => (f.proconfig ?? []).some((x) => x === "search_path=pg_catalog, public")),
    fns.map((f) => `${f.proname}=${f.proconfig}`).join(" | "));
  const dyn = NEW.map(read).join("\n");
  ok("yeni migration'larda dinamik SQL (EXECUTE format/string) YOK", !/\bEXECUTE\s+(format|'|\$|[a-z_]+\s*\|\|)/i.test(dyn.replace(/GRANT EXECUTE|REVOKE ALL ON FUNCTION|EXECUTE FUNCTION/g, "")));

  console.log("\n[C/D] yeni tabloların RLS + GRANT matrisi");
  for (const t of ["nutrition_food_tenant_hidden", "nutrition_destructive_challenges"]) {
    const r = (await c.query(`SELECT relrowsecurity rls, relforcerowsecurity force,
        (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=$1)::int policies
      FROM pg_class WHERE oid = ('public.'||$1)::regclass`, [t])).rows[0];
    ok(`${t}: RLS AÇIK, policy yok (istemciye satır dönmez)`, r.rls === true && r.policies === 0);
    for (const role of ["anon", "authenticated"]) {
      const privs = (await c.query(`SELECT string_agg(p, ',') s FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege($1, ('public.'||$2)::regclass, p)`, [role, t])).rows[0].s;
      ok(`${t}: ${role} tablo yetkisi YOK`, !privs, privs ?? "");
    }
    const svc = (await c.query(`SELECT has_table_privilege('service_role', ('public.'||$1)::regclass, 'SELECT,INSERT,UPDATE,DELETE') x`, [t])).rows[0].x;
    ok(`${t}: service_role SELECT/INSERT/UPDATE/DELETE ✓ (sunucu yolu)`, svc === true);
  }
  const fooodsAnon = (await c.query(`SELECT has_table_privilege('anon','public.nutrition_foods','SELECT') a, has_column_privilege('authenticated','public.nutrition_foods','origin_food_id','SELECT') b`)).rows[0];
  ok("nutrition_foods (yeni kolon dahil) anon/authenticated'a kapalı kalır", !fooodsAnon.a && !fooodsAnon.b);

  console.log("\n[H/§19] rol bazlı NEGATİF testler (SET ROLE)");
  const asRole = async (role, sql, params = []) => {
    await c.query("BEGIN");
    try { await c.query(`SET LOCAL ROLE ${role}`); const r = await c.query(sql, params); await c.query("ROLLBACK"); return { ok: true, rows: r.rows }; }
    catch (e) { await c.query("ROLLBACK"); return { ok: false, code: e.code }; }
  };
  // bir challenge satırı olsun (service_role ile)
  const chId = (await c.query(`INSERT INTO nutrition_destructive_challenges (tenant_id,user_id,action,scope_hash,item_count,code_hash,expires_at)
    VALUES ($1,$2,'food_reset_all',$3,1,$4, now()+interval '5 min') RETURNING id`, [A, UA, "s".repeat(64), "c".repeat(64)])).rows[0].id;
  for (const role of ["anon", "authenticated"]) {
    ok(`${role}: challenge tablosunu OKUYAMAZ (42501)`, (await asRole(role, `SELECT * FROM nutrition_destructive_challenges`)).code === "42501");
    ok(`${role}: challenge tablosuna YAZAMAZ`, (await asRole(role, `UPDATE nutrition_destructive_challenges SET attempts=0`)).code === "42501");
    ok(`${role}: hidden tablosunu okuyamaz / yazamaz`,
      (await asRole(role, `SELECT * FROM nutrition_food_tenant_hidden`)).code === "42501"
      && (await asRole(role, `INSERT INTO nutrition_food_tenant_hidden (tenant_id, food_id) VALUES ($1,$2)`, [A, S.sys[1]])).code === "42501");
    ok(`${role}: reset RPC çağıramaz`, (await asRole(role, `SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [A, SYS, []])).code === "42501");
    ok(`${role}: fork / remove / consume / refresh / replace / search RPC çağıramaz`,
      (await asRole(role, `SELECT nutrition_food_fork_system($1,$2,$3)`, [A, SYS, S.sys[1]])).code === "42501"
      && (await asRole(role, `SELECT nutrition_food_remove($1,$2,$3)`, [A, SYS, S.sys[1]])).code === "42501"
      && (await asRole(role, `SELECT nutrition_challenge_consume($1,$2,$3,'food_reset_all',$4,$5)`, [chId, A, UA, "s".repeat(64), "c".repeat(64)])).code === "42501"
      && (await asRole(role, `SELECT nutrition_plan_refresh_item_snapshots($1,$2,'[]'::jsonb)`, [A, A])).code === "42501"
      && (await asRole(role, `SELECT nutrition_food_nutrients_replace($1,$2,$3,'[]'::jsonb)`, [A, SYS, S.sys[1]])).code === "42501"
      && (await asRole(role, `SELECT * FROM nutrition_food_search($1,$2,NULL,NULL,false,5,0)`, [A, SYS])).code === "42501");
  }
  // Savunma derinliği: yanlışlıkla GRANT verilse bile RLS (policy yok) satır döndürmez.
  await c.query("BEGIN");
  await c.query("GRANT SELECT ON public.nutrition_destructive_challenges TO authenticated");
  await c.query("SET LOCAL ROLE authenticated");
  const leaked = (await c.query("SELECT count(*)::int n FROM nutrition_destructive_challenges")).rows[0].n;
  await c.query("ROLLBACK");
  ok("savunma derinliği: hatalı GRANT olsa bile RLS → 0 satır (kod özeti sızmaz)", leaked === 0);
  const chCols = await columnsOf(c, "nutrition_destructive_challenges");
  ok("challenge tablosunda düz kod kolonu YOK (yalnız code_hash sha256)", !chCols.includes("code") && chCols.includes("code_hash"));
  const svcRead = await asRole("service_role", `SELECT count(*)::int n FROM nutrition_destructive_challenges`);
  ok("service_role (sunucu) challenge okuyabilir", svcRead.ok && svcRead.rows[0].n === 1);

  // ═════ Fonksiyonel güvenlik (service_role bağlamı = sunucu) ═════
  const q1 = async (sql, p = []) => (await c.query(sql, p)).rows[0];
  const sysDigest = async () => {
    const parts = [];
    for (const t of ["nutrition_foods", "nutrition_food_nutrients", "nutrition_food_portions", "nutrition_food_external_refs", "nutrition_food_traditional"]) {
      const cols = (await columnsOf(c, t)).filter((x) => x !== "search_tsv");
      const colList = cols.map((x) => `"${x}"`).join(", ");
      parts.push((await q1(`SELECT count(*)::int n, md5(coalesce(string_agg(md5(row(${colList})::text), '' ORDER BY id),'')) h FROM ${t} WHERE tenant_id=$1`, [SYS])));
    }
    return JSON.stringify(parts);
  };

  console.log("\n[L] sistem tenant satırı: fork / düzenle / Sil / reset / toplu reset sonrası checksum");
  const sys0 = await sysDigest();
  const forkA1 = (await q1(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [A, SYS, S.sys[1]])).id;
  const forkA2 = (await q1(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [A, SYS, S.sys[2]])).id;
  const forkA3 = (await q1(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [A, SYS, S.sys[3]])).id;
  await c.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,$4::jsonb)`, [A, SYS, forkA1, JSON.stringify([{ nutrient_id: S.ENERGY, amount: 999, unit_id: S.KCAL }])]);
  await c.query(`UPDATE nutrition_foods SET name_tr='A kişisel ad' WHERE tenant_id=$1 AND id=$2`, [A, forkA1]);
  await c.query(`SELECT nutrition_food_remove($1,$2,$3)`, [A, SYS, S.sys[4]]);          // sistem → gizle
  await c.query(`SELECT nutrition_food_remove($1,$2,$3)`, [A, SYS, forkA3]);            // kopya → sil+gizle
  await c.query(`SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [A, SYS, [forkA2]]);   // tek
  const forkB = (await q1(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [B, SYS, S.sys[1]])).id;
  await c.query(`SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [A, SYS, [forkA1]]);   // toplu (kalan)
  ok("sistem tenant satırları (besin + değer + porsiyon + dış ref + geleneksel) BİREBİR aynı", (await sysDigest()) === sys0);
  ok("tenant bağlamında sistem besinine yazma reddedilir (45014)", (await errOf(c.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,'[]'::jsonb)`, [A, SYS, S.sys[5]]))) === "45014");
  ok("SİSTEM bağlamında yazma reddedilir (45030)", (await errOf(c.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,'[]'::jsonb)`, [SYS, SYS, S.sys[5]]))) === "45030");
  ok("remove sistem satırını silmez (satır duruyor)", !!(await q1(`SELECT 1 x FROM nutrition_foods WHERE id=$1 AND tenant_id=$2`, [S.sys[4], SYS])));
  ok("reset ilgili fork dışında B'nin kopyasına dokunmadı", !!(await q1(`SELECT 1 x FROM nutrition_foods WHERE id=$1`, [forkB])));

  console.log("\n[K] tenant / IDOR negatif (sunucu RPC'leri yanlış tenant ile)");
  ok("A, B'nin kopyasını resetleyemez (45014)", (await errOf(c.query(`SELECT nutrition_food_reset_personalized($1,$2,$3::uuid[])`, [A, SYS, [forkB]]))) === "45014");
  ok("A, B'nin kopyasını silemez (45014)", (await errOf(c.query(`SELECT nutrition_food_remove($1,$2,$3)`, [A, SYS, forkB]))) === "45014");
  ok("A, B'nin kopyasına değer yazamaz (45014)", (await errOf(c.query(`SELECT nutrition_food_nutrients_replace($1,$2,$3,'[]'::jsonb)`, [A, SYS, forkB]))) === "45014");
  ok("A, B'nin kopyasını effective çözemez", !(await q1(`SELECT id FROM nutrition_food_resolve_effective($1,$2,$3)`, [A, SYS, forkB])));
  const bPlan = (await q1(`SELECT id FROM nutrition_plans WHERE tenant_id=$1`, [B])).id;
  ok("A, B'nin planını yenileyemez (45014)", (await errOf(c.query(`SELECT nutrition_plan_refresh_item_snapshots($1,$2,'[{\"item_id\":\"00000000-0000-4000-8000-000000000000\",\"food_name\":\"x\",\"food_ownership\":\"custom\"}]'::jsonb)`, [A, bPlan]))) === "45014");
  const chB = (await q1(`INSERT INTO nutrition_destructive_challenges (tenant_id,user_id,action,scope_hash,item_count,code_hash,expires_at)
    VALUES ($1,$2,'food_reset_one',$3,1,$4, now()+interval '5 min') RETURNING id`, [B, UB, "s".repeat(64), "c".repeat(64)])).id;
  ok("A, B'nin challenge'ını tüketemez (not_found) + B'nin denemesi artmaz",
    (await q1(`SELECT nutrition_challenge_consume($1,$2,$3,'food_reset_one',$4,$5) r`, [chB, A, UA, "s".repeat(64), "x".repeat(64)])).r === "not_found"
    && Number((await q1(`SELECT attempts FROM nutrition_destructive_challenges WHERE id=$1`, [chB])).attempts) === 0);
  await c.query(`SELECT nutrition_food_remove($1,$2,$3)`, [B, SYS, S.sys[10]]);
  ok("B'nin gizlemesi A'yı etkilemez", !!(await q1(`SELECT id FROM nutrition_food_resolve_effective($1,$2,$3)`, [A, SYS, S.sys[10]])));

  console.log("\n[O] arama tenant izolasyonu");
  const forkB2 = (await q1(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [B, SYS, S.sys[20]])).id;
  const sa = (await c.query(`SELECT id, tenant_id FROM nutrition_food_search($1,$2,NULL,NULL,true,200,0)`, [A, SYS])).rows;
  ok("A araması yalnız A ∪ SİSTEM satırı döndürür (inactive dahil)", sa.every((r) => r.tenant_id === A || r.tenant_id === SYS));
  ok("A araması B'nin özel besinini / kopyasını döndürmez", !sa.some((r) => r.id === forkB || r.id === forkB2));
  ok("B'nin kopyası sistem aslını A'da gizlemez; B'nin gizlemesi A'ya yansımaz", sa.some((r) => r.id === S.sys[20]) && sa.some((r) => r.id === S.sys[10]));
  const sb = (await c.query(`SELECT id FROM nutrition_food_search($1,$2,NULL,NULL,false,200,0)`, [B, SYS])).rows.map((r) => r.id);
  ok("B araması: kendi kopyası var → sistem aslı YOK (çift kayıt yok); gizlediği YOK", sb.includes(forkB2) && !sb.includes(S.sys[20]) && !sb.includes(S.sys[10]));
  const cntA = Number((await q1(`SELECT total_count n FROM nutrition_food_search($1,$2,NULL,NULL,false,1,0)`, [A, SYS])).n);
  const expA = Number((await q1(`SELECT count(*) n FROM nutrition_foods f WHERE (f.tenant_id=$1 OR (f.tenant_id=$2 AND NOT EXISTS (SELECT 1 FROM nutrition_foods c2 WHERE c2.tenant_id=$1 AND c2.origin_food_id=f.id) AND NOT EXISTS (SELECT 1 FROM nutrition_food_tenant_hidden h WHERE h.tenant_id=$1 AND h.food_id=f.id))) AND f.is_active`, [A, SYS])).n);
  ok(`A toplam = effective küme (${cntA})`, cntA === expA, `${cntA} vs ${expA}`);
  ok("unaccent araması (gerçek sözlük): 'seftali' → 'Şeftali'", (await c.query(`SELECT 1 FROM nutrition_food_search($1,$2,'seftali',NULL,false,5,0)`, [A, SYS])).rows.length > 0);

  console.log("\n[M] origin_food_id UNIQUE + EŞZAMANLI fork (2 bağlantı)");
  const c2 = client("upgrade"); await c2.connect();
  const c3 = client("upgrade"); await c3.connect();
  const target = S.sys[30];
  const [f1, f2] = await Promise.all([
    c2.query(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [A, SYS, target]),
    c3.query(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [A, SYS, target]),
  ]);
  ok("paralel iki fork → AYNI kopya id", f1.rows[0].id === f2.rows[0].id);
  ok("paralel iki fork → tek kopya satırı", Number((await q1(`SELECT count(*) n FROM nutrition_foods WHERE tenant_id=$1 AND origin_food_id=$2`, [A, target])).n) === 1);
  // advisory lock olmadan doğrudan iki eşzamanlı transaction → DB UNIQUE ikincisini reddeder
  await c2.query("BEGIN"); await c3.query("BEGIN");
  await c2.query(`INSERT INTO nutrition_foods (tenant_id, name_tr, origin_food_id) VALUES ($1,'yarış 1',$2)`, [A, S.sys[31]]);
  const p3 = c3.query(`INSERT INTO nutrition_foods (tenant_id, name_tr, origin_food_id) VALUES ($1,'yarış 2',$2)`, [A, S.sys[31]]).then(() => null, (e) => e.code);
  await new Promise((r) => setTimeout(r, 300));
  await c2.query("COMMIT");
  const raceCode = await p3; await c3.query("ROLLBACK");
  ok("uygulama kilidi atlansa bile DB UNIQUE ikinci kopyayı reddeder (23505)", raceCode === "23505", String(raceCode));
  ok("aynı tenant+origin ikinci kopya (sıralı) → 23505", (await errOf(c.query(`INSERT INTO nutrition_foods (tenant_id, name_tr, origin_food_id) VALUES ($1,'dup',$2)`, [A, target]))) === "23505");
  ok("origin_food_id sonradan başka besine çevrilemez", (await errOf(c.query(`UPDATE nutrition_foods SET origin_food_id=$2 WHERE tenant_id=$1 AND origin_food_id=$3`, [A, S.sys[32], target]))) === "23514");

  console.log("\n[N] hidden UNIQUE");
  ok("aynı tenant+food gizleme ikinci kez → 23505 (PK)", (await errOf(c.query(`INSERT INTO nutrition_food_tenant_hidden (tenant_id, food_id) VALUES ($1,$2)`, [A, S.sys[4]]))) === "23505");
  await c.query(`SELECT nutrition_food_remove($1,$2,$3)`, [A, SYS, S.sys[4]]);
  ok("Sil tekrarı idempotent (tek gizleme satırı)", Number((await q1(`SELECT count(*) n FROM nutrition_food_tenant_hidden WHERE tenant_id=$1 AND food_id=$2`, [A, S.sys[4]])).n) === 1);

  console.log("\n[§10] FK: sistem besini bakım/import ile silinirse");
  const forkMaint = (await q1(`SELECT nutrition_food_fork_system($1,$2,$3) id`, [A, SYS, S.sys[40]])).id;
  await c.query(`INSERT INTO nutrition_food_tenant_hidden (tenant_id, food_id) VALUES ($1,$2)`, [B, S.sys[40]]);
  await c.query(`DELETE FROM nutrition_foods WHERE id=$1`, [S.sys[40]]);
  const fm = await q1(`SELECT origin_food_id, name_tr FROM nutrition_foods WHERE id=$1`, [forkMaint]);
  ok("tenant kopyası CASCADE silinmez; origin NULL'a düşer (kopya özgün besin olarak korunur)", !!fm && fm.origin_food_id === null);
  ok("kopyanın değerleri korunur", Number((await q1(`SELECT count(*) n FROM nutrition_food_nutrients WHERE food_id=$1`, [forkMaint])).n) === 2);
  ok("ilgili gizleme satırı temizlenir (gizlenecek besin kalmadı)", Number((await q1(`SELECT count(*) n FROM nutrition_food_tenant_hidden WHERE food_id=$1`, [S.sys[40]])).n) === 0);

  console.log("\n[I] challenge consume EŞZAMANLILIK");
  const mkCh = async (T = A, U = UA, action = "food_reset_all") => (await q1(`INSERT INTO nutrition_destructive_challenges (tenant_id,user_id,action,scope_hash,item_count,code_hash,expires_at)
    VALUES ($1,$2,$3,$4,1,$5, now()+interval '5 min') RETURNING id`, [T, U, action, "s".repeat(64), "c".repeat(64)])).id;
  const consume = (cl, id, code = "c".repeat(64), T = A, U = UA, action = "food_reset_all") =>
    cl.query(`SELECT nutrition_challenge_consume($1,$2,$3,$4,$5,$6) r`, [id, T, U, action, "s".repeat(64), code]).then((x) => x.rows[0].r);
  const chPar = await mkCh();
  const par = await Promise.all([consume(c2, chPar), consume(c3, chPar), consume(c, chPar)]);
  ok("3 paralel geçerli istek → yalnız BİRİ ok, diğerleri used", par.filter((x) => x === "ok").length === 1 && par.filter((x) => x === "used").length === 2, par.join(","));
  const chBlk = await mkCh();
  await c2.query("BEGIN");
  const first = await consume(c2, chBlk);
  let secondDone = false;
  const secondP = consume(c3, chBlk).then((x) => { secondDone = true; return x; });
  await new Promise((r) => setTimeout(r, 400));
  const blocked = !secondDone;
  await c2.query("COMMIT");
  const second = await secondP;
  ok("açık transaction'daki tüketim satırı kilitler; ikinci istek BEKLER (FOR UPDATE, SELECT→UPDATE yarışı yok)", blocked && first === "ok" && second === "used", `${first}/${second}/blocked=${blocked}`);

  console.log("\n[J] 5 yanlış deneme kilidi");
  const chLock = await mkCh();
  const chOther = await mkCh();
  const wrong = [];
  for (let i = 0; i < 5; i++) wrong.push(await consume(c, chLock, "d".repeat(64)));
  ok("1–5. yanlış deneme → invalid_code", wrong.every((x) => x === "invalid_code"), wrong.join(","));
  ok("5 yanlıştan sonra DOĞRU kod → locked", (await consume(c, chLock)) === "locked");
  ok("6. deneme de locked (kalıcı)", (await consume(c, chLock, "d".repeat(64))) === "locked");
  ok("attempts=5 kaydedildi", Number((await q1(`SELECT attempts FROM nutrition_destructive_challenges WHERE id=$1`, [chLock])).attempts) === 5);
  ok("aynı kullanıcının BAŞKA challenge'ı etkilenmez → ok", (await consume(c, chOther)) === "ok");

  console.log("\n[P] snapshot refresh: tenant + durum");
  const aPlan = (await q1(`SELECT id FROM nutrition_plans WHERE tenant_id=$1`, [A])).id;
  const aItem = (await q1(`SELECT id FROM nutrition_plan_items WHERE tenant_id=$1 AND plan_id=$2`, [A, aPlan])).id;
  const bItem = (await q1(`SELECT id FROM nutrition_plan_items WHERE tenant_id=$1`, [B])).id;
  const payload = (itemId) => JSON.stringify([{ item_id: itemId, food_id: S.sys[0], food_name: "Sistem Besini 0 Şeftali", food_ownership: "system", nutrients: [{ nutrient_code: "energy", amount: 41, unit_code: "kcal" }] }]);
  ok("B'nin kalemi A'nın planına sokulamaz (45014, kısmi işlem yok)", (await errOf(c.query(`SELECT nutrition_plan_refresh_item_snapshots($1,$2,$3::jsonb)`, [A, aPlan, payload(bItem)]))) === "45014");
  ok("draft planda çalışır", Number((await q1(`SELECT nutrition_plan_refresh_item_snapshots($1,$2,$3::jsonb) n`, [A, aPlan, payload(aItem)])).n) === 1);
  for (const st of ["active", "archived"]) {
    await c.query(`UPDATE nutrition_plans SET status=$2 WHERE id=$1`, [aPlan, st]);
    ok(`status='${st}' plan yenilenemez (45010)`, (await errOf(c.query(`SELECT nutrition_plan_refresh_item_snapshots($1,$2,$3::jsonb)`, [A, aPlan, payload(aItem)]))) === "45010");
  }
  ok("reddedilen yenilemelerde snapshot değişmedi (41)", Number((await q1(`SELECT amount FROM nutrition_plan_item_nutrients WHERE item_id=$1 AND nutrient_code='energy'`, [aItem])).amount) === 41);

  console.log("\n[T] kilit davranışı");
  const m1 = read(NEW[1]);
  ok("000100: SET LOCAL lock_timeout (kuyrukta beklemez; aşımda tamamen geri alınır)", /SET LOCAL lock_timeout = '10s';/.test(m1));
  ok("hiçbir migration CONCURRENTLY/VALIDATE ayrı adım gerektirmez (tek transaction)", NEW.every((f) => /BEGIN;/.test(read(f)) && /COMMIT;/.test(read(f))));
  // Uzun süren bir okuma transaction'ı varken lock_timeout gerçekten devreye girer mi? (ayrı veritabanında)
  const adm = client("postgres"); await adm.connect(); await adm.query("CREATE DATABASE locktest"); await adm.end();
  const l1 = client("locktest"); await l1.connect(); await l1.query(SUPABASE_BASE); await applyFiles(l1, [...OLD, NEW[0]]);
  const l2 = client("locktest"); await l2.connect();
  await l2.query("BEGIN"); await l2.query("SELECT count(*) FROM nutrition_foods");   // ACCESS SHARE tutar
  const t0 = Date.now();
  const lockErr = await errOf(l1.query(read(NEW[1]).replace("SET LOCAL lock_timeout = '10s';", "SET LOCAL lock_timeout = '1s';")));
  const waited = Date.now() - t0;
  await l1.query("ROLLBACK").catch(() => {});
  await l2.query("ROLLBACK");
  const colExists = (await l1.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='nutrition_foods' AND column_name='origin_food_id'`)).rows[0].n;
  ok("açık işlem varken migration kilit zaman aşımıyla DURUR (55P03) ve hiçbir şey uygulanmaz", lockErr === "55P03" && colExists === 0 && waited < 5000, `${lockErr} ${waited}ms col=${colExists}`);
  await l1.end(); await l2.end();

  await c2.end(); await c3.end(); await c.end();
}

try {
  await main();
} catch (e) {
  fail++;
  console.log(`  ❌ BEKLENMEYEN HATA: ${e.stack ?? e}`);
} finally {
  try { await pgServer.stop(); } catch {}
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
}
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
