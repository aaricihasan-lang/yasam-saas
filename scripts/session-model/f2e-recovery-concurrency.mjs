#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-E — hesap kurtarma EŞZAMANLILIK testi (yerel, geçici embedded-postgres; prod'a temas YOK).
 * Ayrı bağlantılardan GERÇEK paralel çağrılar (her biri kendi işleminde):
 *   1) Aynı kurtarma kodu, N farklı challenge'da aynı anda → TAM 1 başarı; kod 'used'; diğerleri 'wrong'.
 *   2) Aynı challenge'a N FARKLI geçerli kod aynı anda → TAM 1 başarı; diğer kodlar harcanmaz (active kalır).
 *   3) Kurtarma koduyla doğrulanmış challenge'a N eşzamanlı finalize → TAM 1 oturum.
 *   4) N eşzamanlı kod üretimi → sonunda TAM 10 aktif kod (tek parti; yarım/karışık set yok).
 *   5) Aynı Owner kurtarma talebine N eşzamanlı yürütme → TAM 1 başarı, TAM 1 bilet.
 *   6) Aynı e-posta değişikliği isteğine N eşzamanlı onay → TAM 1 başarı.
 * Kullanım: node scripts/session-model/f2e-recovery-concurrency.mjs
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
  "scripts/final-hardening/fixtures/session-f2c-fixture.sql",
  "scripts/final-hardening/fixtures/session-f2d-fixture.sql",
  "supabase/migrations/20270129000200_user_sessions_expiry_touch.sql",
  "supabase/migrations/20271003200000_session_model_v2.sql",
  "supabase/migrations/20271003200100_admin_audit_session_actions.sql",
  "supabase/migrations/20280103000000_auth_session_hardening_f2a.sql",
  "supabase/migrations/20280103000100_auth_mfa_core_f2b.sql",
  "supabase/migrations/20280103000200_auth_session_insert_lock_f2b.sql",
  "supabase/migrations/20280103000300_auth_trusted_devices_qr_f2c.sql",
  "supabase/migrations/20280103000400_auth_email_otp_f2d.sql",
  "supabase/migrations/20280103000500_auth_account_recovery_f2e.sql",
];

const OWNER = "00000000-0000-0000-0000-00000000a001";
const VE = "00000000-0000-0000-0000-00000000e0d1";
const VE2 = "00000000-0000-0000-0000-00000000e0d2";
const N = 8;
const H = (s) => `encode(sha256(convert_to('${s}', 'UTF8')), 'hex')`;
const RH = (u, c) => `encode(sha256(convert_to('yasam-recovery-v1:${u}:${c}', 'UTF8')), 'hex')`;
const begin = (u, bind) => `SELECT (public.auth_mfa_begin('${u}', ${H(bind)}, 'desktop_web', 'ip', 'UA', 300)->>'challenge_id') AS id`;
const verify = (ch, bind, u, code) => `SELECT public.auth_recovery_code_verify('${ch}', ${H(bind)}, ${RH(u, code)}) AS r`;
const fin = (ch, bind, tok) =>
  `SELECT public.auth_finalize_login('${ch}', ${H(bind)}, '${tok}', '203.0.113.9', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', NULL,
     now() + interval '30 days', false, true, 604800, 7200, 86400, 900, 2, 600) AS r`;
const hashes = (u, prefix) => `ARRAY[${Array.from({ length: 10 }, (_, i) => RH(u, `${prefix}${i}`)).join(",")}]`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2e-pg-"));
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
    await c.connect();
    clients.push(c);
    return c;
  };
  const admin = await conn();
  await admin.query(BOOT);
  for (const f of files) await admin.query(fs.readFileSync(path.join(root, f), "utf8"));
  const workers = await Promise.all(Array.from({ length: N }, () => conn()));
  const one = async (sql) => (await admin.query(sql)).rows[0];

  // Kurulum: VE / VE2 / Owner MFA zorunlu + MFA'lı oturum + kodlar (yalnız test kısayolu).
  await admin.query(`
    UPDATE public.users SET email_verified_at = now() WHERE id IN ('${VE}', '${VE2}', '${OWNER}');
    SELECT set_config('yasam.mfa_policy', 'on', false);
    UPDATE public.users SET mfa_required = true WHERE id IN ('${VE}', '${VE2}');
    SELECT set_config('yasam.mfa_policy', 'off', false);
    SELECT set_config('yasam.mfa_finalize', 'on', false);
    INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method)
    VALUES ('${VE}', 've-qr', true, 'desktop_web', 'expert', now() + interval '1 day', 'qr_device'),
           ('${OWNER}', 'o-qr', true, 'desktop_web', 'admin', now() + interval '1 day', 'qr_device');
    SELECT set_config('yasam.mfa_finalize', 'off', false);`);
  const g = await one(`SELECT public.auth_recovery_codes_generate('ve-qr', ${hashes(VE, "c")}) AS r`);
  ok(g.r.ok === true, "kurulum: 10 kod");

  // 1) Aynı kod, N challenge.
  console.log("\n── 1) aynı kod × farklı challenge ──");
  const chs = [];
  for (let i = 0; i < N; i++) chs.push((await one(begin(VE, `b1-${i}`))).id);
  // ≤5 açık challenge kuralı: begin sınırı → ilk 5 başarılı; geri kalanları için eskiyi kapatıp yeniden aç.
  const valid = chs.filter(Boolean);
  ok(valid.length === 5, `açık challenge sınırı 5 (${valid.length})`);
  const r1 = await Promise.all(valid.map((ch, i) => workers[i].query(verify(ch, `b1-${chs.indexOf(ch)}`, VE, "c0"))));
  const okCount1 = r1.filter((x) => x.rows[0].r.ok === true).length;
  ok(okCount1 === 1, `aynı kod yalnız 1 kez kabul (${okCount1})`);
  ok(r1.filter((x) => x.rows[0].r.reason === "wrong").length === valid.length - 1, "diğerleri 'wrong'");
  ok((await one(`SELECT state FROM public.auth_recovery_codes WHERE code_hash = ${RH(VE, "c0")}`)).state === "used", "kod 'used'");
  await admin.query(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = '${VE}' AND state IN ('pending','verified')`);
  await admin.query(`DELETE FROM public.auth_recovery_attempts WHERE user_id = '${VE}'`);

  // 2) Aynı challenge, N farklı geçerli kod.
  console.log("\n── 2) aynı challenge × farklı kodlar ──");
  const ch2 = (await one(begin(VE, "b2"))).id;
  const codes2 = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
  const r2 = await Promise.all(codes2.map((c, i) => workers[i].query(verify(ch2, "b2", VE, c))));
  const winners = r2.map((x, i) => (x.rows[0].r.ok === true ? codes2[i] : null)).filter(Boolean);
  ok(winners.length === 1, `challenge'ı yalnız 1 kod doğrular (${winners.length})`);
  const usedNow = Number((await one(`SELECT count(*) AS n FROM public.auth_recovery_codes WHERE user_id = '${VE}' AND kind = 'user' AND state = 'used'`)).n);
  ok(usedNow === 2, `toplam harcanan kod 2 (c0 + kazanan) (${usedNow})`);

  // 3) N eşzamanlı finalize.
  console.log("\n── 3) eşzamanlı finalize ──");
  const r3 = await Promise.all(workers.map((w, i) => w.query(fin(ch2, "b2", `ve-rec-${i}`))));
  const inserted = r3.filter((x) => x.rows[0].r.ok === true && x.rows[0].r.inserted === true).length;
  ok(inserted === 1, `tek oturum (${inserted})`);
  ok(Number((await one(`SELECT count(*) AS n FROM public.user_sessions WHERE mfa_challenge_id = '${ch2}'`)).n) === 1, "DB'de challenge'a bağlı 1 oturum");

  // 4) N eşzamanlı kod üretimi (aynı kullanıcı, farklı partiler).
  console.log("\n── 4) eşzamanlı üretim ──");
  await admin.query(`DELETE FROM public.auth_recovery_attempts`);
  const r4 = await Promise.all(workers.slice(0, 3).map((w, i) => w.query(`SELECT public.auth_recovery_codes_generate('ve-qr', ${hashes(VE, `p${i}-`)}) AS r`)));
  ok(r4.filter((x) => x.rows[0].r.ok === true).length >= 1, "en az bir üretim başarılı");
  const act = await one(`SELECT count(*) AS n, count(DISTINCT batch_id) AS b FROM public.auth_recovery_codes WHERE user_id = '${VE}' AND kind = 'user' AND state = 'active'`);
  ok(Number(act.n) === 10 && Number(act.b) === 1, `sonunda tek parti, tam 10 aktif kod (${act.n}/${act.b})`);

  // 5) Aynı talebe N eşzamanlı yürütme.
  console.log("\n── 5) eşzamanlı kurtarma yürütmesi ──");
  const open = await one(`SELECT public.auth_recovery_case_open('o-qr', '${VE2}', 'telefon', 'kayıtlı numaradan arandı') AS r`);
  const cid = open.r.case_id;
  await admin.query(`UPDATE public.auth_recovery_cases SET opened_at = opened_at - interval '73 hours', not_before = not_before - interval '73 hours',
                      expires_at = expires_at - interval '73 hours' WHERE id = '${cid}'`);
  const r5 = await Promise.all(workers.map((w, i) => w.query(`SELECT public.auth_recovery_case_execute('o-qr', '${cid}', ${RH(VE2, `ticket-${i}`)}, true) AS r`)));
  ok(r5.filter((x) => x.rows[0].r.ok === true).length === 1, "talep yalnız 1 kez yürütülür");
  ok(Number((await one(`SELECT count(*) AS n FROM public.auth_recovery_codes WHERE user_id = '${VE2}' AND kind = 'case_ticket'`)).n) === 1, "tek bilet");
  ok(r5.filter((x) => x.rows[0].r.code === "not_waiting").length === N - 1, "diğerleri 'not_waiting'");

  // 6) Aynı e-posta değişikliği isteğine N eşzamanlı onay.
  console.log("\n── 6) eşzamanlı e-posta değişikliği onayı ──");
  const b = await one(`SELECT public.auth_email_change_begin('ve-qr', 'yeni-adres@test.local', ${H("code-x")}, ${H("to")}, 'synthetic', 100000, 100000) AS r`);
  await admin.query(`SELECT public.auth_email_delivery_result(${Number(b.r.delivery_id)}, true, NULL, 'm')`);
  const r6 = await Promise.all(workers.map((w) => w.query(`SELECT public.auth_email_change_confirm('ve-qr', '${b.r.request_id}', ${H("code-x")}) AS r`)));
  ok(r6.filter((x) => x.rows[0].r.ok === true).length === 1, "değişiklik yalnız 1 kez uygulanır");
  ok((await one(`SELECT email FROM public.users WHERE id = '${VE}'`)).email === "yeni-adres@test.local", "adres güncel");
} catch (e) {
  fail++;
  console.error("HATA", e.message);
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
}
console.log(`\nsession-f2e concurrency: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
