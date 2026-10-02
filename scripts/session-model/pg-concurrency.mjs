#!/usr/bin/env node
/**
 * OTURUM MODELİ v2 — EŞZAMANLILIK testi (yerel, geçici embedded-postgres; prod'a temas YOK).
 *   1) Aynı admin için N eşzamanlı resmi Android girişi → TAM 1 başarılı, kalanı admin_mobile_active.
 *   2) Aktif web yokken 3 eşzamanlı admin web girişi → 1 active + 1 pending + 1 admin_web_limit.
 *   3) Uzman mobil=1 için N eşzamanlı Android girişi → TAM 1 başarılı, kalanı device_limit.
 * Kullanım: node scripts/session-model/pg-concurrency.mjs
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
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;

const files = [
  "scripts/final-hardening/fixtures/session-model-fixture.sql",
  "supabase/migrations/20270129000200_user_sessions_expiry_touch.sql",
  "supabase/migrations/20271003000000_session_model_v2.sql",
];

const ADM = "00000000-0000-0000-0000-00000000a001";
const MOB1 = "00000000-0000-0000-0000-00000000e002";
const call = (user, tok, channel, platform) =>
  `SELECT public.create_session_v2('${user}', '${tok}', '203.0.113.9', 'TR', 'Istanbul', 'UA', '${platform}', '${channel}', NULL,
     now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600) AS r`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-pg-"));
const port = 59000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
});
let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}`); };
const clients = [];
try {
  await server.initialise();
  await server.start();
  const cfg = { host: "localhost", port, user: "postgres", password: "pw", database: "postgres" };
  const admin = new pg.Client(cfg);
  await admin.connect();
  await admin.query(BOOT);
  for (const f of files) await admin.query(fs.readFileSync(path.join(root, f), "utf8"));

  const N = 8;
  for (let i = 0; i < N; i++) { const c = new pg.Client(cfg); await c.connect(); clients.push(c); }

  // 1) Admin Android yarışı
  const r1 = await Promise.all(clients.map((c, i) => c.query(call(ADM, `race-and-${i}`, "android_app", "mobile")).then((x) => x.rows[0].r)));
  const ins1 = r1.filter((r) => r.inserted === true).length;
  const rej1 = r1.filter((r) => r.reason === "admin_mobile_active").length;
  ok(ins1 === 1 && rej1 === N - 1, `admin android ${N} eşzamanlı → 1 başarılı / ${N - 1} admin_mobile_active (gerçek ${ins1}/${rej1})`);
  const live1 = (await admin.query(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id='${ADM}' AND is_active AND client_channel='android_app'`)).rows[0].n;
  ok(live1 === 1, `DB'de tam 1 aktif admin android (gerçek ${live1})`);

  // 2) Admin web yarışı (aktif web yok)
  const r2 = await Promise.all(clients.slice(0, 3).map((c, i) => c.query(call(ADM, `race-web-${i}`, "desktop_web", "desktop")).then((x) => x.rows[0].r)));
  const act2 = r2.filter((r) => r.state === "active").length;
  const pen2 = r2.filter((r) => r.state === "pending_approval").length;
  const lim2 = r2.filter((r) => r.reason === "admin_web_limit").length;
  ok(act2 === 1 && pen2 === 1 && lim2 === 1, `admin web 3 eşzamanlı → 1 active + 1 pending + 1 limit (gerçek ${act2}/${pen2}/${lim2})`);

  // 3) Uzman mobil=1 yarışı
  const r3 = await Promise.all(clients.map((c, i) => c.query(call(MOB1, `race-m1-${i}`, "android_app", "mobile")).then((x) => x.rows[0].r)));
  const ins3 = r3.filter((r) => r.inserted === true).length;
  const lim3 = r3.filter((r) => r.reason === "device_limit").length;
  ok(ins3 === 1 && lim3 === N - 1, `uzman mobil=1 ${N} eşzamanlı android → 1 başarılı / ${N - 1} device_limit (gerçek ${ins3}/${lim3})`);

  await admin.end();
} catch (e) {
  fail++;
  console.log(`  FAIL beklenmeyen hata: ${e?.message ?? e}`);
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await server.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nsession-model concurrency: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
