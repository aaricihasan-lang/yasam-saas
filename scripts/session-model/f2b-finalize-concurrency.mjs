#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-B — MFA tamamlama EŞZAMANLILIK testi (yerel, geçici embedded-postgres; prod'a temas YOK).
 *   1) Aynı doğrulanmış challenge için N eşzamanlı auth_finalize_login (farklı token'lar) → TAM 1 oturum,
 *      kalanı 'consumed'; DB'de challenge'a bağlı tek oturum.
 *   2) Aynı challenge için N eşzamanlı mark_verified → TAM 1 true.
 *   3) Aynı kullanıcı için N eşzamanlı auth_mfa_begin → açık challenge sınırı (5) aşılmaz.
 * Kullanım: node scripts/session-model/f2b-finalize-concurrency.mjs
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
  "scripts/final-hardening/fixtures/session-f2a-fixture.sql",
  "scripts/final-hardening/fixtures/session-f2b-fixture.sql",
  "supabase/migrations/20270129000200_user_sessions_expiry_touch.sql",
  "supabase/migrations/20271003200000_session_model_v2.sql",
  "supabase/migrations/20271003200100_admin_audit_session_actions.sql",
  "supabase/migrations/20280103000000_auth_session_hardening_f2a.sql",
  "supabase/migrations/20280103000100_auth_mfa_core_f2b.sql",
  "supabase/migrations/20280103000200_auth_session_insert_lock_f2b.sql",
];

const OWNER = "00000000-0000-0000-0000-00000000a001";
const EXP = "00000000-0000-0000-0000-00000000e0f2";
const H = (s) => `encode(sha256(convert_to('${s}', 'UTF8')), 'hex')`;
const fin = (ch, bind, tok) =>
  `SELECT public.auth_finalize_login('${ch}', ${H(bind)}, '${tok}', '203.0.113.9', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', NULL,
     now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600) AS r`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2b-pg-"));
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
  // Test kurulumu: süper kullanıcı politika bayrağıyla (F2-B'de yöntem yok → set_required 'no_method').
  await admin.query(`SELECT set_config('yasam.mfa_policy', 'on', false); UPDATE public.users SET mfa_required = true WHERE id = '${EXP}'; SELECT set_config('yasam.mfa_policy', 'off', false);`);

  const N = 8;
  for (let i = 0; i < N; i++) { const c = new pg.Client(cfg); await c.connect(); clients.push(c); }

  // 1) Aynı doğrulanmış challenge'ı N istemci aynı anda tamamlamaya çalışır.
  const ch = (await admin.query(`SELECT (public.auth_mfa_begin('${EXP}', ${H("race-bind")}, 'desktop_web', 'x', 'UA', 300))->>'challenge_id' AS id`)).rows[0].id;
  await admin.query(`SELECT public.auth_mfa_mark_verified('${ch}', 'qr_device')`);
  const r1 = await Promise.all(clients.map((c, i) => c.query(fin(ch, "race-bind", `f2b-race-${i}`)).then((x) => x.rows[0].r)));
  const ins1 = r1.filter((r) => r.inserted === true).length;
  const cons1 = r1.filter((r) => r.reason === "consumed").length;
  ok(ins1 === 1 && cons1 === N - 1, `${N} eşzamanlı tamamlama → 1 oturum / ${N - 1} consumed (gerçek ${ins1}/${cons1})`);
  const live1 = (await admin.query(`SELECT count(*)::int n FROM public.user_sessions WHERE mfa_challenge_id='${ch}'`)).rows[0].n;
  const allRace = (await admin.query(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token LIKE 'f2b-race-%'`)).rows[0].n;
  ok(live1 === 1 && allRace === 1, `DB'de challenge'a bağlı TAM 1 oturum (gerçek ${live1}, yarış token satırı ${allRace})`);

  // 2) Aynı challenge'ı N istemci aynı anda doğrulanmış işaretler.
  const ch2 = (await admin.query(`SELECT (public.auth_mfa_begin('${EXP}', ${H("race-bind-2")}, 'desktop_web', 'x', 'UA', 300))->>'challenge_id' AS id`)).rows[0].id;
  const r2 = await Promise.all(clients.map((c) => c.query(`SELECT public.auth_mfa_mark_verified('${ch2}', 'qr_device') AS v`).then((x) => x.rows[0].v)));
  ok(r2.filter((v) => v === true).length === 1, `${N} eşzamanlı doğrulama işareti → TAM 1 true (gerçek ${r2.filter((v) => v === true).length})`);

  // 3) Açık challenge sınırı yarışta aşılmaz (kullanıcı kilidi).
  await admin.query(`UPDATE public.auth_mfa_challenges SET state='expired' WHERE user_id='${EXP}' AND state IN ('pending','verified')`);
  const r3 = await Promise.all(clients.map((c, i) => c.query(`SELECT public.auth_mfa_begin('${EXP}', ${H(`b-${i}`)}, 'desktop_web', 'x', 'UA', 300) AS r`).then((x) => x.rows[0].r)));
  const okN = r3.filter((r) => r.ok === true).length;
  const open = (await admin.query(`SELECT count(*)::int n FROM public.auth_mfa_challenges WHERE user_id='${EXP}' AND state IN ('pending','verified')`)).rows[0].n;
  ok(okN === 5 && open === 5, `${N} eşzamanlı başlatma → en fazla 5 açık challenge (başarılı ${okN}, açık ${open})`);

  await admin.end();
} catch (e) {
  fail++;
  console.log(`  FAIL beklenmeyen hata: ${e?.message ?? e}`);
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM: geçici klasör kalabilir */ }
}
console.log(`\nsession-f2b concurrency: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
