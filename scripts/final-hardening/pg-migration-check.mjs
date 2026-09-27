#!/usr/bin/env node
/**
 * Yerel, GEÇİCİ embedded-postgres üzerinde migration doğrulayıcı (prod'a temas YOK).
 *
 * Kullanım:
 *   node scripts/final-hardening/pg-migration-check.mjs \
 *     --fixture scripts/final-hardening/fixtures/<x>.sql   (opsiyonel, birden çok olabilir)
 *     --migration supabase/migrations/<y>.sql              (birden çok; sırayla uygulanır)
 *     --twice                                              (idempotency: migration'ları 2. kez uygula)
 *     --assert scripts/final-hardening/fixtures/<z>.sql    (opsiyonel; hata fırlatırsa FAIL)
 *
 * Supabase rolleri (anon/authenticated/service_role) ve `extensions` şeması
 * (pgcrypto) otomatik oluşturulur. `NOTIFY pgrst` zararsızdır.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const nm = path.join(root, "node_modules");

const args = process.argv.slice(2);
const pick = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : [])).filter(Boolean);
const fixtures = pick("--fixture");
const migrations = pick("--migration");
const asserts = pick("--assert");
const twice = args.includes("--twice");

const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;

const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
CREATE TABLE IF NOT EXISTS storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text,
  owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-pg-"));
const port = 56000 + Math.floor(Math.random() * 3000);
const server = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
});
let failed = false;
try {
  await server.initialise();
  await server.start();
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  const run = async (label, file) => {
    const sql = fs.readFileSync(path.resolve(root, file), "utf8");
    try {
      await c.query(sql);
      console.log(`OK   ${label}: ${file}`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${label}: ${file}\n     ${e.message}${e.position ? ` (pos ${e.position})` : ""}${e.where ? `\n     ${e.where}` : ""}`);
    }
  };
  await c.query(BOOT);
  for (const f of fixtures) await run("fixture", f);
  for (const m of migrations) await run("migration", m);
  if (twice) for (const m of migrations) await run("migration(2nd)", m);
  for (const a of asserts) await run("assert", a);
  await c.end();
} finally {
  await server.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? "RESULT: FAIL" : "RESULT: PASS");
process.exit(failed ? 1 : 0);
