#!/usr/bin/env node
/**
 * DY-05/DB-03 negatif test: stone-photos ile başka bir bucket'ı BİRLİKTE kapsayan istemci politikası
 * varsa M2 (20271120001100) hiçbir şey değiştirmeden durmalı. Yerel GEÇİCİ embedded-postgres.
 * Çalıştır: node scripts/final-hardening/stone-photos-shared-policy-check.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nm = path.join(root, "node_modules");
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;

const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
CREATE TABLE IF NOT EXISTS storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text,
  owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  PASS ${m}`); } else { fail++; console.error(`  FAIL ${m}`, d ?? ""); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-shared-"));
const port = 58000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
try {
  await server.initialise();
  await server.start();
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  c.on("error", () => {});
  await c.connect();
  await c.query(BOOT);
  await c.query(fs.readFileSync(path.join(root, "scripts/final-hardening/fixtures/stone-photos-shared-policy-fixture.sql"), "utf8"));
  let err = "";
  try {
    await c.query(fs.readFileSync(path.join(root, "supabase/migrations/20271120001100_stone_photos_private_bucket.sql"), "utf8"));
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    await c.query("ROLLBACK").catch(() => {});
  }
  ok(/başka|store-product-images/.test(err) || /DY-05/.test(err), "paylaşımlı politika → migration açık hatayla durdu", err);
  const pub = (await c.query("SELECT id, public FROM storage.buckets ORDER BY id")).rows;
  ok(pub.every((r) => r.public === true), "hiçbir bucket değişmedi (stone-photos dahil)", JSON.stringify(pub));
  const pol = (await c.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND policyname='shared public read'")).rows[0].n;
  ok(pol === 1, "paylaşımlı politika SİLİNMEDİ (diğer bucket yetkisi korunur)");
  await c.end();
} catch (e) {
  fail++;
  console.error("HATA", e);
} finally {
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
}
console.log(`\nstone-photos shared-policy check: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
