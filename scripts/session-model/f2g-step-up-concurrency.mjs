#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-G — Owner işleme özel kanıt EŞZAMANLILIK testi (yerel, geçici embedded-postgres; prod'a temas YOK).
 * Ayrı bağlantılardan GERÇEK paralel çağrılar:
 *   1) Tek kanıt + aynı hedef (MFA kapatma) için N eşzamanlı işlem → TAM 1 başarı, kanıt 'consumed', diğerleri step_up_required.
 *   2) Tek kanıt + N FARKLI hedef (cihaz onayı) → yalnız kanıtın hedefi onaylanır; diğer cihazlar beklemede kalır.
 *   3) Doğrulama ile işlem yarışı: kanıt doğrulanırken paralel işlem → doğrulanmadan önce gelen RED, sonra gelen tek kullanım.
 * Kullanım: node scripts/session-model/f2g-step-up-concurrency.mjs
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
const F = (n) => `scripts/final-hardening/fixtures/${n}`;
const M = (n) => `supabase/migrations/${n}`;
const files = [
  F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"), F("session-f2c-fixture.sql"), F("session-f2d-fixture.sql"),
  M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"), M("20271003200100_admin_audit_session_actions.sql"),
  M("20280103000000_auth_session_hardening_f2a.sql"), M("20280103000100_auth_mfa_core_f2b.sql"), M("20280103000200_auth_session_insert_lock_f2b.sql"),
  M("20280103000300_auth_trusted_devices_qr_f2c.sql"), M("20280103000400_auth_email_otp_f2d.sql"), M("20280103000500_auth_account_recovery_f2e.sql"),
  M("20280103000600_auth_purge_audit_retention_f2f.sql"), M("20280103000700_auth_owner_step_up_f2g.sql"),
];
const OWNER = "00000000-0000-0000-0000-00000000a001";
const VE = "00000000-0000-0000-0000-00000000e0d1";
const AND1 = "00000000-0000-0000-0000-00000000e0b2";
const N = 8;
const H = (s) => `encode(sha256(convert_to('${s}', 'UTF8')), 'hex')`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2g-pg-"));
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
  const conn = async () => {
    const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
    c.on("error", () => {});
    await c.connect();
    clients.push(c);
    return c;
  };
  const admin = await conn();
  await admin.query(BOOT);
  for (const f of files) await admin.query(fs.readFileSync(path.join(root, f), "utf8"));
  const workers = await Promise.all(Array.from({ length: N }, () => conn()));
  const one = async (sql) => (await admin.query(sql)).rows[0];
  await admin.query(`
    UPDATE public.users SET email_verified_at = now() WHERE id IN ('${OWNER}', '${VE}', '${AND1}');
    SELECT set_config('yasam.mfa_policy', 'on', false);
    UPDATE public.users SET mfa_required = true WHERE id IN ('${OWNER}', '${VE}', '${AND1}');
    SELECT set_config('yasam.mfa_policy', 'off', false);
    SELECT set_config('yasam.mfa_finalize', 'on', false);
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method)
    VALUES ('${OWNER}', 'o-mfa', true, 'desktop_web', 'admin', now() + interval '1 day', 'qr_device');
    SELECT set_config('yasam.mfa_finalize', 'off', false);`);
  const odev = (await one(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
    VALUES ('${OWNER}', repeat('O',120), ${H("owner-phone")}, 'ABCD-EFGH', 'active', now()) RETURNING id`)).id;
  const proof = async (action, target) => {
    const b = (await one(`SELECT public.auth_owner_step_up_begin('o-mfa', '${action}', '${target}') AS r`)).r;
    await admin.query(`SELECT public.auth_qr_decide('${b.challenge_id}', '${b.qr_nonce}', '${odev}', 'approve', '${b.match_code}')`);
    return b.challenge_id;
  };

  console.log("\n── 1) tek kanıt × aynı hedef × N paralel ──");
  const p1 = await proof("mfa_disable", VE);
  const r1 = await Promise.all(workers.map((w) => w.query(`SELECT public.auth_mfa_set_required('o-mfa', '${VE}', false, 'paralel') AS r`)));
  const okN = r1.filter((x) => x.rows[0].r.ok === true && x.rows[0].r.changed === true).length;
  ok(okN === 1, `yalnız 1 işlem başarılı (${okN})`);
  ok(r1.filter((x) => x.rows[0].r.code === "step_up_required" || x.rows[0].r.changed === false).length === N - 1, "diğerleri reddedildi / değişiklik yok");
  ok((await one(`SELECT state FROM public.auth_mfa_challenges WHERE id = '${p1}'`)).state === "consumed", "kanıt tüketildi");
  ok(Number((await one(`SELECT count(*) n FROM public.auth_recovery_events WHERE event = 'step_up_used' AND detail->>'challenge_id' = '${p1}'`)).n) === 1, "tek kullanım kaydı");

  console.log("\n── 2) tek kanıt × N farklı hedef ──");
  const devs = [];
  for (let i = 0; i < N; i++) {
    const u = i === 0 ? AND1 : VE;
    if (i > 1) break;
    devs.push((await one(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state)
      VALUES ('${u}', repeat('P',120), ${H(`pend-${i}`)}, 'ABCD-EFGH', 'pending_owner') RETURNING id`)).id);
  }
  const p2 = await proof("device_approve", devs[0]);
  const r2 = await Promise.all(devs.map((d, i) => workers[i].query(`SELECT public.auth_device_owner_decide('o-mfa', '${d}', 'approve', true, 'telefon', NULL) AS r`)));
  ok(r2[0].rows[0].r.ok === true, "kanıtın hedefi onaylandı");
  ok(r2.slice(1).every((x) => x.rows[0].r.code === "step_up_required"), "başka hedefler kanıtsız kaldı");
  ok((await one(`SELECT state FROM public.auth_trusted_devices WHERE id = '${devs[1]}'`)).state === "pending_owner", "diğer cihaz beklemede");
  ok((await one(`SELECT state FROM public.auth_mfa_challenges WHERE id = '${p2}'`)).state === "consumed", "kanıt tüketildi");

  console.log("\n── 3) doğrulama ↔ işlem yarışı ──");
  const b3 = (await one(`SELECT public.auth_owner_step_up_begin('o-mfa', 'device_approve', '${devs[1]}') AS r`)).r;
  const early = (await workers[0].query(`SELECT public.auth_device_owner_decide('o-mfa', '${devs[1]}', 'approve', true, 'telefon', NULL) AS r`)).rows[0].r;
  ok(early.code === "step_up_required", "doğrulama tamamlanmadan işlem RED");
  const [dec, ...ops] = await Promise.all([
    workers[0].query(`SELECT public.auth_qr_decide('${b3.challenge_id}', '${b3.qr_nonce}', '${odev}', 'approve', '${b3.match_code}') AS r`),
    ...workers.slice(1).map((w) => w.query(`SELECT public.auth_device_owner_decide('o-mfa', '${devs[1]}', 'approve', true, 'telefon', NULL) AS r`)),
  ]);
  ok(dec.rows[0].r.result === "approved", "telefon onayı");
  const okOps = ops.filter((x) => x.rows[0].r.ok === true).length;
  ok(okOps <= 1, `yarışta en fazla 1 onay (${okOps})`);
  const after = (await workers[1].query(`SELECT public.auth_device_owner_decide('o-mfa', '${devs[1]}', 'approve', true, 'telefon', NULL) AS r`)).rows[0].r;
  const state = (await one(`SELECT state FROM public.auth_trusted_devices WHERE id = '${devs[1]}'`)).state;
  ok(okOps === 1 ? state === "owner_approved" && after.ok !== true : after.ok === true && state === "owner_approved", "sonuç: cihaz TAM 1 kez onaylı");
  ok((await one(`SELECT state FROM public.auth_mfa_challenges WHERE id = '${b3.challenge_id}'`)).state === "consumed", "kanıt tek kez tüketildi");
} catch (e) {
  fail++;
  console.error("HATA", e.message);
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* Windows EPERM */ }
}
console.log(`\nsession-f2g concurrency: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
