#!/usr/bin/env node
/**
 * Doğaltaş Kütüphanesi F1 — ROLLBACK provası (gömülü PG; PROD'a temas YOK).
 *   A) Kütüphanede veri varken ROLLBACK DURUR (veri kaybı yok).
 *   B) Onay ayarı yoksa ROLLBACK DURUR.
 *   C) Boş kütüphanede yalnız stone_library_* nesnelerini kaldırır; mevcut tablolar + pg_trgm korunur; migration tekrar uygulanabilir.
 * Çalıştır: node scripts/stone-library/pg/rollback-check.mjs
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const FIXTURE = read("scripts/stone-library/pg/fixture.sql");
const MIGRATION = read("supabase/migrations/20271201000000_stone_library_core.sql");
const ROLLBACK = read("scripts/stone-library/sql/ROLLBACK_20271201000000.sql");
const POSTFLIGHT = read("scripts/stone-library/sql/postflight_readonly.sql");
const PREFLIGHT = read("scripts/stone-library/sql/preflight_readonly.sql");
const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;`;
const OWNER = "00000000-0000-4000-8000-0000000000f1";

let pass = 0;
let fail = 0;
const ok = (c, label, extra) => {
  if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`); }
};

async function withDb(fn, { migrate = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-rb-"));
  const port = 57100 + Math.floor(Math.random() * 800);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  try {
    await c.query(BOOT);
    await c.query(FIXTURE);
    if (migrate) await c.query(MIGRATION);
    if (migrate) await c.query(`INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('20271201000000','stone_library_core')`);
    await fn(c);
  } finally {
    await c.end().catch(() => {});
    await server.stop().catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM — geçici klasör */ }
  }
}
const errMsg = async (c, sql) => { try { await c.query(sql); return null; } catch (e) { await c.query("ROLLBACK").catch(() => {}); return String(e.message); } };
const legacyHash = async (c) => (await c.query(`SELECT md5(coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.stones s),'') ||
  coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.stone_sources s),'') ||
  coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.stone_entries s),'') ||
  coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.client_stones s),'') ||
  coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.dogaltas_inventory s),'') ||
  coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.users s),'')) h`)).rows[0].h;
const slCount = async (c) => Number((await c.query(`SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'stone\\_library\\_%')
  + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'stone\\_library\\_%') n`)).rows[0].n);

try {
  console.log("\n[preflight]");
  await withDb(async (c) => {
    ok((await c.query(PREFLIGHT)).rows[0]?.sonuc === "READY_TO_APPLY", "uygulama öncesi preflight → READY_TO_APPLY");
    await c.query(MIGRATION);
    await c.query(`INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('20271201000000','stone_library_core')`);
    ok((await c.query(PREFLIGHT)).rows[0]?.sonuc === "ALREADY_APPLIED", "uygulama sonrası preflight → ALREADY_APPLIED");
  }, { migrate: false });

  console.log("\n[postflight]");
  await withDb(async (c) => {
    const r = await c.query(POSTFLIGHT);
    const rows = Array.isArray(r) ? r[r.length - 1].rows : r.rows;
    ok(rows[0]?.sonuc === "POSTFLIGHT PASS", "postflight_readonly.sql → POSTFLIGHT PASS");
  });

  console.log("\n[A/B: veri varken / onaysız ROLLBACK durur]");
  await withDb(async (c) => {
    ok(/onay ayarı yok/.test(await errMsg(c, ROLLBACK) ?? ""), "onay ayarı yokken ROLLBACK durdu");
    await c.query(`SELECT public.stone_library_stone_save($1, NULL, '{"slug":"zz-veri","name_tr":"ZZ Veri"}')`, [OWNER]);
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F1'`);
    ok(/kütüphanede veri var/.test(await errMsg(c, ROLLBACK) ?? ""), "kütüphanede taş varken ROLLBACK durdu");
    ok((await c.query(`SELECT count(*)::int n FROM public.stone_library_stones`)).rows[0].n === 1, "durdurulan ROLLBACK hiçbir şeyi silmedi");
  });

  console.log("\n[C: boş kütüphanede ROLLBACK]");
  await withDb(async (c) => {
    const before = await legacyHash(c);
    ok((await slCount(c)) > 40, "migration sonrası stone_library nesneleri var");
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F1'`);
    ok((await errMsg(c, ROLLBACK)) === null, "ROLLBACK başarıyla çalıştı");
    ok((await slCount(c)) === 0, "stone_library_* tablo / fonksiyon kalmadı");
    ok((await legacyHash(c)) === before, "mevcut tablolar (stones, stone_sources, stone_entries, client_stones, dogaltas_inventory, users) birebir");
    ok((await c.query(`SELECT count(*)::int n FROM pg_extension WHERE extname='pg_trgm'`)).rows[0].n === 1, "pg_trgm uzantısı korunur");
    ok((await c.query(`SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version='20271201000000'`)).rows[0].n === 0, "migration kaydı defterden silindi");
    ok((await errMsg(c, MIGRATION)) === null, "migration geri dönüşten sonra yeniden uygulanabilir");
  });
} catch (e) {
  fail++;
  console.error("rollback-check çöktü:", e);
}
console.log(`\nstone-library rollback-check: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
