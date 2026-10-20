#!/usr/bin/env node
/**
 * DIJ-03 (AŞAMA 1) — Kişisel Arşiv kotası EŞZAMANLILIK testi. Yerel GEÇİCİ embedded-postgres; prod'a temas YOK.
 *
 * Senaryolar (aynı tenant, 20 ayrı bağlantı, aynı anda):
 *   C1 Rezervasyon yarışı: depoda 3500 bayt, kota 10 000; 20 × 600 baytlık rezervasyon aynı anda.
 *      Beklenen: tam 10 başarı (3500 + 10×600 = 9500 ≤ 10 000; 11. aşar), toplam asla kotayı aşmaz.
 *   C2 Commit yarışı (yalan beyan): 6 nesne 1'er bayt beyanla rezerve edilip GERÇEKTE 1500'er bayt yüklenir;
 *      6 commit aynı anda. Depo 3500 iken kota 10 000 → en fazla 4 commit kabul (3500+4×1500=9500);
 *      reddedilenlerin nesnesi silinince kabul edilenlerin toplamı kotayı aşmamalı.
 *
 * Çalıştır: node scripts/final-hardening/personal-archive-quota-concurrency.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nm = path.join(root, "node_modules");
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;

const N = 20;
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
`;
const T = "10000000-0000-0000-0000-00000000000a";
const Q = 10000;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  PASS ${m}`); } else { fail++; console.error(`  FAIL ${m}`, d ?? ""); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-conc-"));
const port = 59000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", `max_connections=${N + 20}`],
  onLog: () => {}, onError: () => {},
});
const clients = [];
try {
  await server.initialise();
  await server.start();
  const admin = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  admin.on("error", () => {});
  await admin.connect();
  await admin.query(BOOT);
  await admin.query(fs.readFileSync(path.join(root, "supabase/migrations/20271104000200_personal_archive_limits.sql"), "utf8"));
  await admin.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('personal-archive', '${T}/arc/base.pdf', '{"size": 3500}')`);
  for (let i = 0; i < N; i++) {
    const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
    c.on("error", () => {});
    await c.connect();
    clients.push(c);
  }

  console.log("── C1 eşzamanlı rezervasyon ──");
  const res = await Promise.all(clients.map((c, i) =>
    c.query("SELECT public.personal_archive_reserve_upload($1, $2, 600, $3, 100, 3600) AS r", [T, `${T}/arc/c1_${i}.pdf`, Q]).then((x) => x.rows[0].r)));
  const okN = res.filter((r) => r.ok === true).length;
  const sumRes = Number((await admin.query(`SELECT coalesce(sum(declared_bytes),0) s FROM public.personal_archive_upload_reservations WHERE tenant_id = $1`, [T])).rows[0].s);
  ok(okN === 10, `20 eşzamanlı rezervasyondan tam 10 kabul (${okN})`, res.map((r) => r.reason ?? "ok").join(","));
  ok(3500 + sumRes <= Q, `depo + rezervasyon kotayı aşmıyor (${3500 + sumRes} ≤ ${Q})`);

  console.log("── C2 eşzamanlı commit (yalan beyan) ──");
  await admin.query(`DELETE FROM public.personal_archive_upload_reservations`);
  const paths = Array.from({ length: 6 }, (_, i) => `${T}/arc/c2_${i}.pdf`);
  // Önce 6 hazırlık (1'er bayt beyan), SONRA 6 gerçek yükleme (1500'er bayt) — yalan beyan senaryosu.
  for (const p of paths) {
    const r = (await admin.query("SELECT public.personal_archive_reserve_upload($1, $2, 1, $3, 100, 3600) AS r", [T, p, Q])).rows[0].r;
    if (!r.ok) throw new Error(`hazırlık rezervasyonu başarısız: ${JSON.stringify(r)}`);
  }
  for (const p of paths) {
    await admin.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('personal-archive', $1, '{"size": 1500}')`, [p]);
  }
  const commits = await Promise.all(paths.map((p, i) =>
    clients[i].query("SELECT public.personal_archive_commit_upload($1, $2, $3, 5000) AS r", [T, p, Q]).then((x) => ({ p, r: x.rows[0].r }))));
  // Route davranışı: reddedilen nesne silinir.
  for (const { p, r } of commits) if (r.ok !== true) await admin.query(`DELETE FROM storage.objects WHERE name = $1`, [p]);
  const accepted = commits.filter((c) => c.r.ok === true).length;
  const stored = Number((await admin.query("SELECT public.personal_archive_tenant_bytes($1) AS b", [T])).rows[0].b);
  ok(stored <= Q, `kabul edilen commit'ler sonrası depo kotayı aşmıyor (${stored} ≤ ${Q}, kabul ${accepted})`, commits.map((c) => c.r.reason ?? "ok").join(","));
  ok(commits.every((c) => c.r.ok === true || c.r.reason === "quota"), `yalan beyanlı commit'ler 'quota' ile reddedildi (kabul ${accepted}; fazla ret güvenli yöndedir)`);
  const left = Number((await admin.query(`SELECT count(*) n FROM public.personal_archive_upload_reservations`)).rows[0].n);
  ok(left === 0, "commit'ler tüm rezervasyonları kapattı");

  console.log("── C3 eşzamanlı DÜRÜST yüklemeler ──");
  const honest = Array.from({ length: 4 }, (_, i) => `${T}/arc/c3_${i}.pdf`);
  const rs = await Promise.all(honest.map((p, i) =>
    clients[i].query("SELECT public.personal_archive_reserve_upload($1, $2, 1500, $3, 100, 3600) AS r", [T, p, Q]).then((x) => x.rows[0].r)));
  ok(rs.every((r) => r.ok === true), "4 × 1500 dürüst rezervasyon kabul (3500 + 6000 ≤ 10 000)", JSON.stringify(rs));
  for (const p of honest) await admin.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('personal-archive', $1, '{"size": 1500}')`, [p]);
  const cs = await Promise.all(honest.map((p, i) =>
    clients[i].query("SELECT public.personal_archive_commit_upload($1, $2, $3, 5000) AS r", [T, p, Q]).then((x) => x.rows[0].r)));
  ok(cs.every((r) => r.ok === true), "4 eşzamanlı dürüst commit'in hepsi kabul", JSON.stringify(cs));
  const stored2 = Number((await admin.query("SELECT public.personal_archive_tenant_bytes($1) AS b", [T])).rows[0].b);
  ok(stored2 === 9500, `depo 9500 bayt (${stored2})`);
  await admin.end();
} catch (e) {
  fail++;
  console.error("HATA", e);
} finally {
  await Promise.all(clients.map((c) => c.end().catch(() => {})));
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM: geçici dizin */ }
}
console.log(`\npersonal-archive quota concurrency: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
