#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-I — yasal saklama × imha yürütmesi EŞZAMANLILIK testi (yerel, geçici embedded-postgres; prod'a
 * temas YOK; sentetik süre / gerekçe). İki sıra: (1) saklama önce başlar → yürütme bekler, önizleme iptal olur,
 * satırlar korunur; (2) yürütme önce başlar → saklama bekler, yürütme tamamlanır, saklama sonra işlenir.
 * Her iki sırada da karşılıklı kilitlenme (deadlock) YOK ve sonuç seri bir sıralamaya eşdeğer.
 * Kullanım: node scripts/session-model/f2i-hold-race.mjs
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
  M("20280103000600_auth_purge_audit_retention_f2f.sql"), M("20280103000700_auth_owner_step_up_f2g.sql"), M("20280103000800_auth_audit_retention_disposal_f2h.sql"),
  M("20280103000900_auth_security_hardening_f2i.sql"),
];
const OWNER = "00000000-0000-0000-0000-00000000a001";
const VE = "00000000-0000-0000-0000-00000000e0d1";
const AND1 = "00000000-0000-0000-0000-00000000e0b2";
const N = 2;
const H = (s) => `encode(sha256(convert_to('${s}', 'UTF8')), 'hex')`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2i-pg-"));
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const [A, B] = workers;
  const pending = async (p) => { const t = Symbol("t"); return (await Promise.race([p, sleep(700).then(() => t)])) === t; };
  await admin.query(`INSERT INTO public.auth_recovery_events (subject_user_id, actor_id, event, created_at)
    SELECT '${VE}'::uuid, '${VE}'::uuid, 'code_used', now() - interval '400 days' FROM generate_series(1, 6)
    UNION ALL SELECT '${AND1}'::uuid, '${AND1}'::uuid, 'code_used', now() - interval '400 days' FROM generate_series(1, 4)`);
  await proof("retention_policy", (await one(`SELECT public.auth_retention_table_uuid('auth_recovery_events') AS u`)).u);
  ok((await one(`SELECT public.auth_retention_policy_set('o-mfa', 'auth_recovery_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'silme', NULL) AS r`)).r.ok === true, "politika (sentetik)");
  const prepare = async () => {
    const pv = (await one(`SELECT public.auth_retention_preview('o-mfa', 'auth_recovery_events') AS r`)).r;
    await proof("retention_execute", pv.run_id);
    return pv;
  };
  const exec = (c, pv) => c.query(`SELECT public.auth_retention_execute('o-mfa', '${pv.run_id}', '${pv.confirm_text}') AS r`).then((x) => x.rows[0].r);
  const veOld = async () => Number((await one(`SELECT count(*) n FROM public.auth_recovery_events WHERE subject_user_id = '${VE}' AND created_at < now() - interval '300 days'`)).n);

  console.log("\n── Sıra 1: saklama önce (işlem açık) → yürütme ──");
  const pv1 = await prepare();
  ok(Number(pv1.candidates) === 10, `önizleme 10 aday (${pv1.candidates})`);
  await A.query("BEGIN");
  await A.query(`SELECT public.auth_retention_hold_set('o-mfa', 'subject_user', '${VE}', 'Sentetik test — dava (yarış)')`);
  const e1 = exec(B, pv1);
  ok(await pending(e1), "yürütme, açık saklama işlemi bitene kadar BEKLİYOR");
  await A.query("COMMIT");
  const r1 = await e1;
  ok(r1.ok !== true, `yürütme reddedildi (${r1.code})`);
  ok(await veOld() === 6, "saklamadaki kişinin 6 satırı KORUNDU");
  const hid = (await one(`SELECT id FROM public.auth_retention_holds WHERE released_at IS NULL`)).id;
  await proof("retention_policy", (await one(`SELECT public.auth_retention_table_uuid('hold:' || ${hid}) AS u`)).u);
  ok((await one(`SELECT public.auth_retention_hold_release('o-mfa', ${hid}) AS r`)).r.ok === true, "saklama kanıtla kaldırıldı");

  console.log("\n── Sıra 2: yürütme önce (işlem açık) → saklama ──");
  const pv2 = await prepare();
  await B.query("BEGIN");
  const r2 = await exec(B, pv2);
  ok(r2.ok === true, `yürütme tamamlandı (${JSON.stringify(r2).slice(0, 80)})`);
  const h2 = A.query(`SELECT public.auth_retention_hold_set('o-mfa', 'subject_user', '${AND1}', 'Sentetik test — dava (yarış 2)') AS r`).then((x) => x.rows[0].r);
  ok(await pending(h2), "saklama, açık yürütme işlemi bitene kadar BEKLİYOR");
  await B.query("COMMIT");
  const hr = await h2;
  ok(hr.ok === true, "saklama sonra işlendi (kilitlenme yok)");
  ok(Number((await one(`SELECT count(*) n FROM public.auth_recovery_events WHERE created_at < now() - interval '300 days'`)).n) === 0, "yürütme önce geldiği için satırlar silindi (seri sıralamaya eşdeğer)");
  ok(Number((await one(`SELECT count(*) n FROM public.auth_retention_runs WHERE state = 'completed'`)).n) === 1, "tek tamamlanmış çalıştırma");
} catch (e) {
  fail++;
  console.error("HATA", e.message);
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* Windows EPERM */ }
}
console.log(`\nsession-f2i hold race: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
