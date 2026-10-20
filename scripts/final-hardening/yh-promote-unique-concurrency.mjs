#!/usr/bin/env node
/**
 * YH-02 (AŞAMA 1) — documents/promote mükerrer güvencesi: kısmi UNIQUE indeks (20271104000300)
 * eşzamanlı iki aynı isteği tek kaynağa indirger mi? Yerel GEÇİCİ embedded-postgres; prod'a temas YOK.
 *
 *   U1 Aynı (tenant, origin_job_ref) için 10 eşzamanlı INSERT → tam 1 başarı, 9 × 23505.
 *   U2 Arşivlenmiş kaynak engel değildir (yeniden yükseltme mümkün).
 *   U3 Başka tenant aynı job ref'i kullanabilir; origin_job_ref NULL satırlar serbest.
 *   U4 Mevcut aktif mükerrer varsa migration açık hatayla durur ve indeks kurulmaz (veri değişmez).
 *
 * Çalıştır: node scripts/final-hardening/yh-promote-unique-concurrency.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nm = path.join(root, "node_modules");
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;
const MIG = fs.readFileSync(path.join(root, "supabase/migrations/20271104000300_yh_document_sources_origin_unique.sql"), "utf8");
// 20260925000000 tanımının ilgili alt kümesi (sütun adları/tipleri aynı).
const TABLE = `
CREATE TABLE public.yh_document_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_kind text NOT NULL DEFAULT 'document',
  title text NOT NULL DEFAULT 't',
  origin_job_ref uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  classification text NOT NULL DEFAULT 'unclassified',
  CONSTRAINT yhds_tenant_id_unique UNIQUE (tenant_id, id)
);`;
const N = 10;
const TA = "10000000-0000-0000-0000-0000000000a1";
const TB = "10000000-0000-0000-0000-0000000000b1";
const JOB = "20000000-0000-0000-0000-000000000001";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  PASS ${m}`); } else { fail++; console.error(`  FAIL ${m}`, d ?? ""); } };

async function withDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yh-uq-"));
  const port = 57000 + Math.floor(Math.random() * 900);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", `max_connections=${N + 20}`], onLog: () => {}, onError: () => {} });
  const clients = [];
  try {
    await server.initialise();
    await server.start();
    const mk = async () => {
      const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
      c.on("error", () => {});
      await c.connect();
      clients.push(c);
      return c;
    };
    await fn(mk);
  } finally {
    await Promise.all(clients.map((c) => c.end().catch(() => {})));
    await server.stop().catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }
}

try {
  await withDb(async (mk) => {
    const admin = await mk();
    await admin.query(TABLE);
    await admin.query(MIG);
    await admin.query(MIG); // idempotent
    const cs = [];
    for (let i = 0; i < N; i++) cs.push(await mk());
    const res = await Promise.all(cs.map((c) =>
      c.query("INSERT INTO public.yh_document_sources (tenant_id, origin_job_ref) VALUES ($1, $2) RETURNING id", [TA, JOB])
        .then(() => "ok").catch((e) => e.code)));
    ok(res.filter((r) => r === "ok").length === 1 && res.filter((r) => r === "23505").length === N - 1,
      `U1 ${N} eşzamanlı aynı promote → 1 kaynak, ${N - 1} × 23505`, res.join(","));
    await admin.query("UPDATE public.yh_document_sources SET status='archived' WHERE tenant_id=$1", [TA]);
    let r = await admin.query("INSERT INTO public.yh_document_sources (tenant_id, origin_job_ref) VALUES ($1, $2) RETURNING id", [TA, JOB]).then(() => "ok").catch((e) => e.code);
    ok(r === "ok", "U2 arşivlenmiş kaynak yeniden yükseltmeyi engellemez", r);
    r = await admin.query("INSERT INTO public.yh_document_sources (tenant_id, origin_job_ref) VALUES ($1, $2)", [TB, JOB]).then(() => "ok").catch((e) => e.code);
    const r2 = await admin.query("INSERT INTO public.yh_document_sources (tenant_id, origin_job_ref) VALUES ($1, NULL), ($1, NULL)", [TA]).then(() => "ok").catch((e) => e.code);
    ok(r === "ok" && r2 === "ok", "U3 başka tenant aynı job ref'i kullanabilir; NULL ref serbest", `${r} ${r2}`);
  });
  await withDb(async (mk) => {
    const admin = await mk();
    await admin.query(TABLE);
    await admin.query("INSERT INTO public.yh_document_sources (tenant_id, origin_job_ref) VALUES ($1,$2),($1,$2)", [TA, JOB]);
    let err = "";
    try { await admin.query(MIG); } catch (e) { err = e.message; await admin.query("ROLLBACK").catch(() => {}); }
    const idx = (await admin.query("SELECT count(*)::int n FROM pg_indexes WHERE indexname='yhds_tenant_origin_active_uq'")).rows[0].n;
    const rows = (await admin.query("SELECT count(*)::int n FROM public.yh_document_sources")).rows[0].n;
    ok(/mükerrer/.test(err) && idx === 0 && rows === 2, "U4 mevcut mükerrer → migration durdu, indeks yok, veri değişmedi", err);
  });
} catch (e) {
  fail++;
  console.error("HATA", e);
}
console.log(`\nyh promote unique concurrency: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
