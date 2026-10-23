#!/usr/bin/env node
/**
 * DB-01 — envanter sorgusunun yerel doğrulaması (geçici embedded-postgres; prod'a temas YOK).
 *   I1  Üretilen sorgu READ ONLY işlemde hatasız çalışır ve her iz için bool döner.
 *   I2  Boş veritabanında iz taşıyan her migration "NESNELER YOK" / "UYGULANMAMIŞ OLASI" olur (kesin değil).
 *   I3  Bilinen migration'lar (oturum modeli v2 zinciri) uygulanınca "NESNELER VAR" olur;
 *       yalnız ACL değiştiren M6 iz nesnesi taşımaz → BİLİNMİYOR (drift manifest'iyle izlenir).
 *   I4  Sorgu hiçbir kullanıcı tablosunu okumaz (yalnız katalog / information_schema).
 *   I5  Ters yön: repoda CREATE'i olmayan tablo 'prod'da olup repoda olmayan' listesine düşer.
 *   I6  Kayıt listesiyle (schema_migrations): kayıt + nesne → UYGULANMIŞ; kayıtsız + nesne → ELLE
 *       UYGULANMIŞ OLASI; kayıtsız + iz yok → BİLİNMİYOR (kayıt yokluğu "uygulanmadı" SAYILMAZ);
 *       repoda olmayan kayıt ayrı listelenir; kayıt sorgusu SQL gövdesi döndürmez.
 * Kullanım: node scripts/final-hardening/migration-inventory-check.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildInventory, classify, compareRecorded, emitProbeSql, emitRecordedSql, parseRecorded } from "./drift/migration-inventory.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const nm = path.join(root, "node_modules");
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;

const rows = buildInventory();
const probeSql = emitProbeSql(rows);
let pass = 0;
let fail = 0;
const ok = (c, m, d = "") => { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c ? "" : ` ${d}`}`); };

const body = probeSql.replace(/^--.*$/gm, "");
ok(!/\bFROM\s+public\.(?!\w*\s*\()/i.test(body.replace(/format\('%I\.%I'[^)]*\)/g, "")), "I4 sorgu public tablolarından satır okumuyor");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inv-pg-"));
const port = 56000 + Math.floor(Math.random() * 3000);
const server = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
});
try {
  await server.initialise();
  await server.start();
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  await c.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`);

  const runProbe = async () => {
    await c.query("BEGIN");
    try {
      const res = await c.query(probeSql);
      const last = Array.isArray(res) ? res.at(-1) : res;
      return last.rows[0].probe;
    } finally {
      await c.query("ROLLBACK");
    }
  };
  let probe = await runProbe();
  ok(Array.isArray(probe.markers) && probe.markers.every((m) => typeof m.exists === "boolean"),
    `I1 sorgu çalıştı (${probe.markers.length} iz, hepsi bool)`);
  let out = classify(rows, { probe });
  ok(out.filter((r) => r.markers.length).every((r) => r.status === "NESNELER YOK" && /OLASI/.test(r.verdict)),
    "I2 boş DB → iz taşıyanların hepsi NESNELER YOK / UYGULANMAMIŞ OLASI (kesin damga yok)");

  const chain = [
    "scripts/final-hardening/fixtures/session-model-fixture.sql",
    "supabase/migrations/20270129000200_user_sessions_expiry_touch.sql",
    "supabase/migrations/20271003200000_session_model_v2.sql",
  ];
  for (const f of chain) await c.query(fs.readFileSync(path.join(root, f), "utf8"));
  probe = await runProbe();
  out = classify(rows, { probe });
  const v2 = out.find((r) => r.file === "20271003200000_session_model_v2.sql");
  ok(v2?.status === "NESNELER VAR", `I3 session_model_v2 → NESNELER VAR (${v2?.present}/${v2?.total})`, JSON.stringify(v2?.missing));
  const m6 = out.find((r) => r.file === "20271120001500_revoke_client_truncate_references.sql");
  ok(m6 && m6.markers.length === 0 && m6.verdict === "BİLİNMİYOR",
    "I3b M6 iz nesnesi taşımaz → BİLİNMİYOR (kesin damga vurulmaz; drift manifest'iyle izlenir)", JSON.stringify(m6?.verdict));

  // I6 kayıt listesi: v2 kayıtlı; expiry_touch kayıtsız (nesneleri var); repoda olmayan sahte kayıt.
  const recorded = parseRecorded(JSON.stringify([{ recorded: [
    { version: "20271003200000", name: "session_model_v2" }, { version: "19990101000000", name: "prod_only" },
  ] }]));
  out = classify(rows, { probe }, recorded);
  const v2r = out.find((r) => r.file === "20271003200000_session_model_v2.sql");
  const tr = out.find((r) => r.file === "20270129000200_user_sessions_expiry_touch.sql");
  const m6r = out.find((r) => r.file === "20271120001500_revoke_client_truncate_references.sql");
  const cmp = compareRecorded(rows, recorded);
  ok(v2r?.verdict === "UYGULANMIŞ (kayıt + katalog)", "I6a kayıt + nesne → UYGULANMIŞ", v2r?.verdict);
  ok(/ELLE UYGULANMIŞ OLASI/.test(tr?.verdict ?? ""), "I6b kayıtsız + nesne → ELLE UYGULANMIŞ OLASI (kayıt yokluğu ≠ uygulanmadı)", tr?.verdict);
  ok(m6r?.verdict === "BİLİNMİYOR" && m6r?.recorded === "KAYITSIZ", "I6c kayıtsız + iz yok → BİLİNMİYOR", m6r?.verdict);
  ok(cmp.recordedTotal === 2 && cmp.recordedInRepo === 1 && cmp.recordedNotInRepo.includes("19990101000000"), "I6d repoda olmayan kayıt ayrı listelenir", cmp);
  const noProbe = classify(rows, null, recorded).find((r) => r.file === "20270129000200_user_sessions_expiry_touch.sql");
  ok(noProbe?.verdict === "BİLİNMİYOR" && noProbe?.status === "KAYITSIZ + KATALOG YOK", "I6e katalog olmadan kayıtsız → yine BİLİNMİYOR", noProbe);
  ok(!/statements/.test(emitRecordedSql().replace(/- 'statements'/, "")) && /READ ONLY/.test(emitRecordedSql()), "I6f kayıt sorgusu salt-okunur ve SQL gövdesi döndürmez");
  await c.query("CREATE TABLE public.zz_prod_only (id int)");
  probe = await runProbe();
  classify(rows, { probe });
  ok(classify.prodOnly.some((x) => x.name === "zz_prod_only") && !classify.prodOnly.some((x) => x.name === "user_sessions"),
    "I5 repoda olmayan prod tablosu ters listede; repodaki tablo listede değil", JSON.stringify(classify.prodOnly));
  await c.end();
} finally {
  await server.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nmigration-inventory check: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
