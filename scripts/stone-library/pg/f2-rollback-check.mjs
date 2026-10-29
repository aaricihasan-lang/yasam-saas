#!/usr/bin/env node
/**
 * Doğaltaş Kütüphanesi F2 — postflight + YALNIZ-F2 geri dönüş provası (gömülü PG; PROD'a temas YOK).
 *   A) F1 + F2 → F2 postflight PASS.
 *   B) Onaysız / görsel-izin kaydı varken F2 ROLLBACK durur.
 *   C) Boşken F2 kaldırılır, F1 migration yeniden uygulanır → F1 postflight PASS (27 RPC, 17 tablo); mevcut tablolar birebir;
 *      F2 yeniden uygulanabilir → F2 postflight PASS.
 * Çalıştır: node scripts/stone-library/pg/f2-rollback-check.mjs
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const FIXTURE = read("scripts/stone-library/pg/fixture.sql");
const F1 = read("supabase/migrations/20271201000000_stone_library_core.sql");
const F2 = read("supabase/migrations/20271201000100_stone_library_f2.sql");
const F1_POST = read("scripts/stone-library/sql/postflight_readonly.sql");
const F2_POST = read("scripts/stone-library/sql/f2_postflight_readonly.sql");
const F2_RB = read("scripts/stone-library/sql/ROLLBACK_20271201000100.sql");
const OWNER = "00000000-0000-4000-8000-0000000000f1";
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);`;

let pass = 0;
let fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x)}` : ""}`); } };
const last = (r) => (Array.isArray(r) ? r[r.length - 1].rows : r.rows);
const errMsg = async (c, sql) => { try { await c.query(sql); return null; } catch (e) { await c.query("ROLLBACK").catch(() => {}); return String(e.message); } };

async function withDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-f2rb-"));
  const port = 57950 + Math.floor(Math.random() * 600);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  try {
    await c.query(BOOT); await c.query(FIXTURE); await c.query(F1); await c.query(F2);
    await c.query(`INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('20271201000000','core'),('20271201000100','f2') ON CONFLICT DO NOTHING`);
    await fn(c);
  } finally {
    await c.end().catch(() => {}); await server.stop().catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }
}
const legacy = async (c) => (await c.query(`SELECT md5(coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.stones s),'') ||
  coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.client_stones s),'') || coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.users s),'')) h`)).rows[0].h;

try {
  console.log("\n[A: F2 postflight]");
  await withDb(async (c) => { ok(last(await c.query(F2_POST))[0]?.sonuc === "F2 POSTFLIGHT PASS", "F1 + F2 → F2 POSTFLIGHT PASS"); });

  console.log("\n[B: koruma]");
  await withDb(async (c) => {
    ok(/onay ayarı yok/.test((await errMsg(c, F2_RB)) ?? ""), "onaysız F2 ROLLBACK durdu");
    await c.query(`SELECT public.stone_library_source_save($1, NULL, '{"source_key":"zz-src","kind":"api","real_name":"ZZ"}')`, [OWNER]);
    const src = (await c.query(`SELECT id FROM public.stone_library_sources LIMIT 1`)).rows[0].id;
    await c.query(`SELECT public.stone_library_license_grant_save($1, NULL, $2)`, [OWNER, JSON.stringify({ source_id: src, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ",
      commercial_display: true, storage_allowed: true, post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "ZZ" })]);
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F2'`);
    ok(/görsel \/ lisans izni kaydı var/.test((await errMsg(c, F2_RB)) ?? ""), "lisans izni kaydı varken F2 ROLLBACK durdu (veri kaybı yok)");
  });

  console.log("\n[C: yalnız F2 geri dönüşü + F1 onarımı]");
  await withDb(async (c) => {
    const before = await legacy(c);
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F2'`);
    ok((await errMsg(c, F2_RB)) === null, "F2 ROLLBACK çalıştı");
    ok((await c.query(`SELECT to_regclass('public.stone_library_images') IS NULL AND to_regclass('public.stone_library_license_grants') IS NULL v`)).rows[0].v, "F2 tabloları kaldırıldı");
    ok((await c.query(`SELECT count(*)::int n FROM information_schema.columns WHERE column_name IN ('quality_flags','has_image') AND table_name LIKE 'stone_library_%'`)).rows[0].n === 0, "F2 kolonları kaldırıldı");
    ok((await errMsg(c, F1)) === null, "F1 migration yeniden uygulandı (özgün F1 fonksiyon gövdeleri)");
    ok(last(await c.query(F1_POST))[0]?.sonuc === "POSTFLIGHT PASS", "F1 POSTFLIGHT PASS (17 tablo, 27 RPC)");
    ok((await legacy(c)) === before, "mevcut tablolar birebir");
    ok((await c.query(`SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version='20271201000100'`)).rows[0].n === 0, "F2 defter kaydı silindi");
    ok((await errMsg(c, F2)) === null && last(await c.query(F2_POST))[0]?.sonuc === "F2 POSTFLIGHT PASS", "F2 yeniden uygulanabilir → F2 POSTFLIGHT PASS");
  });
} catch (e) { fail++; console.error("çöktü:", e); }
console.log(`\nstone-library F2 rollback-check: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
