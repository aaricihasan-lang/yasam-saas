#!/usr/bin/env node
/**
 * SEC-NEW-03a / MI-P08 (M6 + M7) — drift kapısının kendisini sınayan yerel test (prod'a temas YOK).
 * M5'TEN BAĞIMSIZ sürüm: varsayılan ACL kuralı (SEC-NEW-03) bu teslimatın kapsamında değildir.
 *
 * Geçici embedded-postgres üzerinde:
 *   D1  Fixture (prod kanıtındaki durum) → manifest.sql → compare.mjs: iki kural da FAIL vermeli
 *       (sorun gerçekten yakalanıyor); Numeroloji tablosu yalnız UYARI.
 *   D2  20271104000500/600 uygulanır → aynı kurallar FAIL vermemeli.
 *   D3  Kasıtlı gelecekteki drift (TRUNCATE GRANT, koşulsuz politika) → yeniden FAIL.
 *   D4  Supabase benzeri kısıtlı yürütücü (postgres üyesi, süper kullanıcı DEĞİL) ile
 *       migration'lar hatasız biter ve kurallar temiz kalır.
 *   D5  v1 (eski) manifest çökme yerine UYARI üretir.
 *
 * Kullanım: node scripts/final-hardening/db-privileges-drift-check.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareManifest } from "./drift/compare.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const nm = path.join(root, "node_modules");
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;

const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const FIXTURE = read("scripts/final-hardening/fixtures/db-privileges-fixture.sql");
const MANIFEST_SQL = read("scripts/final-hardening/drift/manifest.sql");
const MIGRATIONS = [
  "supabase/migrations/20271104000500_revoke_client_truncate_references.sql",
  "supabase/migrations/20271104000600_drop_broad_client_policies.sql",
].map(read);
const fullExpected = JSON.parse(read("supabase/expected-manifest.json"));
// Yalnız AŞAMA 1 v2 kuralları (fixture diğer modül nesnelerini içermez).
const EXPECTED = {
  tables_no_client_dangerous_privileges: fullExpected.tables_no_client_dangerous_privileges,
  broad_client_policies_absent: fullExpected.broad_client_policies_absent,
};

const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);`;

let pass = 0;
let fail = 0;
const check = (id, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS ${id}`); }
  else { fail += 1; console.error(`FAIL ${id} ${detail}`); }
};
const has = (list, re) => list.some((m) => re.test(m));

async function manifestOf(client) {
  const { rows } = await client.query(MANIFEST_SQL);
  return rows[0].manifest;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-dacl-"));
const port = 56000 + Math.floor(Math.random() * 3000);
const server = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
});
const conn = (database, user = "postgres", password = "pw") =>
  new pg.Client({ host: "localhost", port, user, password, database });

try {
  await server.initialise();
  await server.start();

  // ── D1–D3: süper kullanıcı yürütücü ─────────────────────────────────────────
  const c = conn("postgres");
  await c.connect();
  await c.query(BOOT);
  await c.query(FIXTURE);

  let r = compareManifest(await manifestOf(c), EXPECTED);
  check("D1c 12 tablo tehlikeli yetki yakalandı",
    ["bio_imaginations", "healing_guide_sections", "symbols_view", "user_location_prefs"].every((t) => has(r.fails, new RegExp(`Tablo ${t}: anon tehlikeli`))));
  check("D1d geniş politikalar yakalandı",
    ["client_homeworks", "client_stone_photos", "tenants"].every((t) => has(r.fails, new RegExp(`Policy public\\.${t} `))));
  check("D1e Numeroloji yalnız UYARI", !has(r.fails, /demo_numerology/) && has(r.warnings, /demo_numerology_ip_usage.*Numeroloji/));

  for (const m of [...MIGRATIONS, ...MIGRATIONS]) await c.query(m);
  r = compareManifest(await manifestOf(c), EXPECTED);
  check("D2 migration sonrası FAIL yok", r.fails.length === 0, JSON.stringify(r.fails));
  check("D2b Numeroloji UYARI olarak kaldı (dokunulmadı)", has(r.warnings, /demo_numerology_ip_usage/));
  check("D2c dar politika korunmuş (FAIL yok)", !has(r.fails, /hw tenant scoped/));

  await c.query("GRANT TRUNCATE ON public.chakra_notes TO authenticated");
  r = compareManifest(await manifestOf(c), EXPECTED);
  check("D3b yeni TRUNCATE GRANT drift'i yakalandı", has(r.fails, /Tablo chakra_notes: authenticated tehlikeli yetki açık \(truncate\)/));
  await c.query("REVOKE TRUNCATE ON public.chakra_notes FROM authenticated");

  await c.query(`CREATE POLICY "drift test" ON public.tenants FOR SELECT TO anon USING (true)`);
  r = compareManifest(await manifestOf(c), EXPECTED);
  check("D3c yeni koşulsuz politika drift'i yakalandı", has(r.fails, /Policy public\.tenants "drift test"/));
  await c.query(`DROP POLICY "drift test" ON public.tenants`);

  r = compareManifest(await manifestOf(c), EXPECTED);
  check("D3d geri alınca yeniden temiz", r.fails.length === 0, JSON.stringify(r.fails));

  // D5: v1 manifest (yeni alanlar yok) → çökme yok, UYARI
  const v1 = await manifestOf(c);
  delete v1.default_acls;
  v1.tables = v1.tables.map(({ anon, authenticated, ...t }) => ({
    ...t,
    anon: { select: anon.select, insert: anon.insert, update: anon.update, delete: anon.delete },
    authenticated: { select: authenticated.select, insert: authenticated.insert, update: authenticated.update, delete: authenticated.delete },
  }));
  v1.policies = v1.policies.map((p) => { const q = { ...p }; delete q.using_true; delete q.check_true; return q; });
  r = compareManifest(v1, EXPECTED);
  check("D5 v1 manifest → yalnız UYARI", r.fails.length === 0 && r.warnings.filter((w) => /Manifest v1/.test(w)).length === 2, JSON.stringify(r));

  // ── D4: Supabase benzeri kısıtlı yürütücü ───────────────────────────────────
  await c.query("CREATE DATABASE limited_db");
  await c.query("CREATE ROLE mig_limited LOGIN PASSWORD 'pw' NOSUPERUSER");
  await c.query("GRANT postgres TO mig_limited");
  await c.end();

  const s = conn("limited_db");
  await s.connect();
  await s.query(BOOT);
  await s.query(FIXTURE);
  await s.end();

  const l = conn("limited_db", "mig_limited", "pw");
  await l.connect();
  let migErr = null;
  try {
    for (const m of [...MIGRATIONS, ...MIGRATIONS]) await l.query(m);
  } catch (e) {
    migErr = e;
  }
  check("D4a kısıtlı yürütücüde migration hatasız", migErr === null, migErr?.message ?? "");
  r = compareManifest(await manifestOf(l), EXPECTED);
  check("D4b kısıtlı yürütücü sonrası kurallar temiz", r.fails.length === 0, JSON.stringify(r.fails));
  await l.end();
} finally {
  await server.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nPASS ${pass} / FAIL ${fail}`);
console.log(fail ? "RESULT: FAIL" : "RESULT: PASS");
process.exit(fail ? 1 : 0);
