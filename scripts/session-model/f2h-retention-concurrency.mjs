#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-H — denetim imhası EŞZAMANLILIK testi (yerel, geçici embedded-postgres; prod'a temas YOK).
 * Aynı önizlenmiş çalıştırmaya N eşzamanlı yürütme → TAM 1 başarı, satırlar bir kez silinir, tek kayıt.
 * Kullanım: node scripts/session-model/f2h-retention-concurrency.mjs
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
];
const OWNER = "00000000-0000-0000-0000-00000000a001";
const VE = "00000000-0000-0000-0000-00000000e0d1";
const AND1 = "00000000-0000-0000-0000-00000000e0b2";
const N = 8;
const H = (s) => `encode(sha256(convert_to('${s}', 'UTF8')), 'hex')`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2h-pg-"));
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

  console.log("\n── İmha: aynı çalıştırma × N paralel yürütme ──");
  await admin.query(`INSERT INTO public.auth_recovery_events (subject_user_id, actor_id, event, created_at)
    SELECT '${VE}', '${VE}', 'code_used', now() - interval '400 days' FROM generate_series(1, 25)`);
  await proof("retention_policy", (await one(`SELECT public.auth_retention_table_uuid('auth_recovery_events') AS u`)).u);
  const ps = (await one(`SELECT public.auth_retention_policy_set('o-mfa', 'auth_recovery_events', 365, 'Sentetik test gerekçesi — gerçek karar değil', 'silme', NULL) AS r`)).r;
  ok(ps.ok === true, "politika (sentetik)");
  const pv = (await one(`SELECT public.auth_retention_preview('o-mfa', 'auth_recovery_events') AS r`)).r;
  ok(Number(pv.candidates) === 25, `önizleme 25 aday (${pv.candidates})`);
  await proof("retention_execute", pv.run_id);
  const rs = await Promise.all(workers.map((w) => w.query(`SELECT public.auth_retention_execute('o-mfa', '${pv.run_id}', '${pv.confirm_text}') AS r`)));
  const okN = rs.filter((x) => x.rows[0].r.ok === true).length;
  ok(okN === 1, `yalnız 1 yürütme başarılı (${okN})`);
  ok(rs.filter((x) => x.rows[0].r.code === "not_previewed").length === N - 1, "diğerleri not_previewed");
  ok(Number((await one(`SELECT count(*) n FROM public.auth_recovery_events WHERE created_at < now() - interval '300 days'`)).n) === 0, "25 satır TAM bir kez silindi");
  ok(Number((await one(`SELECT count(*) n FROM public.auth_retention_log WHERE run_id = '${pv.run_id}' AND action = 'execute'`)).n) === 1, "tek imha kaydı");
  ok(Number((await one(`SELECT count(*) n FROM public.auth_retention_context`)).n) === 0, "bağlam işaretçisi kalmadı");
} catch (e) {
  fail++;
  console.error("HATA", e.message);
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* Windows EPERM */ }
}
console.log(`\nsession-f2h concurrency: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
