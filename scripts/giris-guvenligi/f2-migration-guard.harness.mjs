#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-J — migration yeniden / sırasız uygulama SALDIRI ve HATA testleri (yalnız geçici embedded-postgres).
 *
 * Ortam production'a benzetilir: Supabase varsayılan yetkileri (pg_default_acl), service_role'ün user_sessions INSERT
 * yetkisi (000200 öncesi prod), supabase_migrations.schema_migrations geçmiş tablosu.
 * Her RED senaryosunda geniş katalog anlık görüntüsü (bütün public fonksiyon gövdeleri / SECURITY DEFINER / search_path /
 * yetkiler, tetikleyiciler, tablo yetkileri) ÖNCE = SONRA olmalıdır (fail-closed: hiçbir şey değişmez).
 *
 * Kullanım: node scripts/giris-guvenligi/f2-migration-guard.harness.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { F2_STAGES, LOCK_FILE } from "./f2-migration-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nm = path.join(root, "node_modules");
const { default: EP } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;

const MIGDIR = path.join(root, "supabase", "migrations");
const FILES = fs.readdirSync(MIGDIR).filter((f) => /^20280103\d{6}_.*\.sql$/.test(f)).sort();
const byV = Object.fromEntries(FILES.map((f) => [f.slice(0, 14), f]));
const LINEAR = F2_STAGES.filter((s) => byV[s.file]).map((s) => s.file);
const FINAL = LINEAR[LINEAR.length - 1];
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
// F2J_KORUMASIZ=1 → negatif kontrol: koruma blokları bellekte sökülür (düzeltmesiz davranışın kanıtı; FAIL beklenir).
const UNGUARDED = process.env.F2J_KORUMASIZ === "1";
const stripGuard = (t) => t.replace(/-- >>> F2 MİGRATION KORUMASI[\s\S]*?-- <<< F2 MİGRATION KORUMASI\r?\n/, "");
const mig = (v) => { const t = fs.readFileSync(path.join(MIGDIR, byV[v]), "utf8"); return UNGUARDED ? stripGuard(t) : t; };
const POST = read("scripts/giris-guvenligi/f2-postflight-check.sql");
const PRE = read("scripts/giris-guvenligi/f2-preflight.sql");

const F = (n) => `scripts/final-hardening/fixtures/${n}`;
const M = (n) => `supabase/migrations/${n}`;
const BASE = [F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"),
  F("session-f2c-fixture.sql"), F("session-f2d-fixture.sql"),
  M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"), M("20271003200100_admin_audit_session_actions.sql")];
const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, created_by text);`;
const PRODLIKE = `GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO service_role;`;

const SNAP = `SELECT md5(coalesce((SELECT string_agg(x, E'\\n' ORDER BY x) FROM (
  SELECT 'fn|' || p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '-')
         || '|' || coalesce(p.proacl::text, '-') AS x
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
  UNION ALL SELECT 'trg|' || g.tgrelid::regclass::text || '.' || g.tgname || '|' || g.tgenabled::text || '|' || g.tgfoid::regproc::text
    FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT g.tgisinternal
  UNION ALL SELECT 'tbl|' || c.relname || '|' || c.relkind::text || '|' || coalesce(c.relacl::text, '-') || '|' || c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
  UNION ALL SELECT 'col|' || c.relname || '.' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' || coalesce(a.attacl::text, '-')
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped) q), '')) AS h`;

let pass = 0, fail = 0, notRun = 0;
const ok = (cond, label, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}${extra ? ` — ${extra}` : ""}`); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2j-guard-"));
const port = 55000 + Math.floor(Math.random() * 2500);
const server = new EP({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
const conn = async (db) => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: db });
  await c.connect();
  c.on("notice", () => {});
  c.on("error", () => {});
  return c;
};
const admin = async (sql) => { const a = await conn("postgres"); try { await a.query(sql); } finally { await a.end(); } };
const apply = async (c, v, text = null) => {
  try {
    await c.query(text ?? mig(v));
    return { ok: true };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    return { ok: false, code: e.code, msg: e.message };
  }
};
const ledger = (c, v) => c.query("INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [v, byV[v]]);
const snap = async (c) => (await c.query(SNAP)).rows[0].h;
const postflight = async (c, final = false) => {
  try {
    await c.query("BEGIN READ ONLY");
    if (final) await c.query("SELECT set_config('f2.postflight_final','on',true)");
    await c.query(POST);
    await c.query("ROLLBACK");
    return "PASS";
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); return `FAIL ${e.message.slice(0, 400)}`; }
};
const preflight = async (c) => {
  await c.query("BEGIN READ ONLY");
  try {
    const r = await c.query(PRE);
    const out = {};
    for (const row of r.rows) {
      const line = Object.values(row)[0];
      const p = line.split("|");
      if (p[0] === "on_kontrol") out[p[1]] = p[2];
      else out[p[0]] = line;
    }
    return out;
  } finally { await c.query("ROLLBACK").catch(() => {}); }
};
let dbn = 0;
const fresh = async (tpl) => { const name = `t${dbn++}`; await admin(`CREATE DATABASE ${name} TEMPLATE ${tpl}`); return { name, c: await conn(name) }; };
const drop = async (h) => { await h.c.end(); await admin(`DROP DATABASE ${h.name}`); };
const refused = async (h, v, code, label, text = null) => {
  const before = await snap(h.c);
  const r = await apply(h.c, v, text);
  const after = await snap(h.c);
  ok(!r.ok && r.code === code, `${label}: ${v} reddedildi (${code})`, r.ok ? "UYGULANDI" : `${r.code} ${r.msg?.slice(0, 160)}`);
  ok(before === after, `${label}: katalog değişmedi (fail-closed)`);
};

try {
  await server.initialise();
  await server.start();
  // Şablon: F2 öncesi (prod benzeri) taban.
  await admin("CREATE DATABASE base0");
  { const c = await conn("base0"); await c.query(BOOT); for (const f of BASE) await c.query(read(f)); await c.query(PRODLIKE); await c.end(); }
  // Şablon: zincirin önekleri.
  const prefix = async (name, upto) => {
    await admin(`CREATE DATABASE ${name} TEMPLATE base0`);
    const c = await conn(name);
    for (const v of LINEAR) { const r = await apply(c, v); if (!r.ok) throw new Error(`${name}: ${v} ${r.msg}`); await ledger(c, v); if (v === upto) break; }
    await c.end();
  };
  await prefix("upto100", "20280103000100");
  await prefix("upto700", "20280103000700");
  await prefix("tamzincir", FINAL);

  // ── 1) Normal sıra + preflight / postflight ───────────────────────────────────
  {
    const h = await fresh("base0");
    let pf = await preflight(h.c);
    ok(pf[LINEAR[0]]?.startsWith("UYGULANABİLİR"), "S1 preflight F2 öncesi: 000000 UYGULANABİLİR", pf[LINEAR[0]]);
    ok(LINEAR.slice(1).every((v) => pf[v]?.startsWith("SIRA HATASI")), "S1 preflight F2 öncesi: sonrakiler SIRA HATASI");
    ok(pf[LOCK_FILE]?.startsWith("SIRA HATASI"), "S1 preflight F2 öncesi: 000200 SIRA HATASI", pf[LOCK_FILE]);
    ok(!Object.keys(pf).some((k) => k.startsWith("bilgi")), "S1 preflight F2 öncesi: tabanda beklenmeyen gövde farkı yok");
    let allOk = true;
    for (const v of LINEAR) {
      pf = await preflight(h.c);
      if (!pf[v]?.startsWith("UYGULANABİLİR")) { allOk = false; console.log(`     ${v} öncesi preflight: ${pf[v]}`); }
      const r = await apply(h.c, v);
      if (!r.ok) { allOk = false; console.log(`     ${v}: ${r.msg}`); }
      await ledger(h.c, v);
    }
    ok(allOk, "S1 normal sıra: her adımda preflight UYGULANABİLİR ve migration başarılı");
    ok((await h.c.query("SELECT public.auth_f2_schema_level() AS l")).rows[0].l === Number(FINAL.slice(8)), "S1 kayıt düzeyi = son aşama");
    ok((await postflight(h.c)) === "PASS", "S1 postflight (000200 öncesi) PASS");
    pf = await preflight(h.c);
    ok(pf[LOCK_FILE]?.startsWith("UYGULANABİLİR"), "S1 preflight: zincir sonrası 000200 UYGULANABİLİR (koşullu)", pf[LOCK_FILE]);
    ok(pf[FINAL]?.startsWith("ZATEN UYGULANMIŞ") && LINEAR.slice(0, -1).every((v) => pf[v]?.startsWith("YENİDEN UYGULAMA YASAK")),
      "S1 preflight: eski aşamalar YENİDEN UYGULAMA YASAK, son aşama ZATEN UYGULANMIŞ");
    ok(pf.gecmis?.includes("UYUMLU"), "S1 preflight: migration geçmişi uyumlu", pf.gecmis);
    const r = await apply(h.c, LOCK_FILE);
    await ledger(h.c, LOCK_FILE);
    ok(r.ok, "S1 000200 en son uygulandı");
    ok((await postflight(h.c, true)) === "PASS", "S1 son postflight (000200 dahil) PASS");
    pf = await preflight(h.c);
    ok(pf[LOCK_FILE]?.startsWith("ZATEN UYGULANMIŞ"), "S1 preflight: 000200 ZATEN UYGULANMIŞ");
    await drop(h);
  }
  // ── 2) Aynı (en son) migration ikinci kez → idempotent, katalog farkı 0 ────────
  {
    const h = await fresh("tamzincir");
    const before = await snap(h.c);
    const r = await apply(h.c, FINAL);
    ok(r.ok && before === (await snap(h.c)), `S2 en son migration (${FINAL}) yeniden: başarılı ve katalog farkı 0`, r.msg);
    const r2 = await apply(h.c, LOCK_FILE);
    ok(r2.ok, "S2 000200 iki kez: zararsız (yalnız REVOKE)");
    await drop(h);
  }
  // ── 3/4/6) Her eski migration bütün zincirden sonra → YF201, hiçbir şey değişmez ──
  for (const v of LINEAR.slice(0, -1)) {
    const h = await fresh("tamzincir");
    const tag = v === "20280103000400" ? "S4" : v === "20280103000600" ? "S6" : "S3";
    await refused(h, v, "YF201", `${tag} zincir sonrası eski dosya`);
    ok((await postflight(h.c)) === "PASS", `${tag} ${v} reddi sonrası postflight PASS (koruma kaybı yok)`);
    await drop(h);
  }
  // ── 5) 000500, 000700 sonrasında ──────────────────────────────────────────────
  {
    const h = await fresh("upto700");
    await refused(h, "20280103000500", "YF201", "S5 000700 sonrası");
    await drop(h);
  }
  // ── 7) Eksik ara migration ──────────────────────────────────────────────────────
  {
    const h = await fresh("upto100");
    await refused(h, "20280103000400", "YF202", "S7 000300 atlanarak");
    const pf = await preflight(h.c);
    ok(pf["20280103000300"]?.startsWith("UYGULANABİLİR") && pf["20280103000400"]?.startsWith("SIRA HATASI"),
      "S7 preflight: 000300 UYGULANABİLİR, 000400 SIRA HATASI");
    await drop(h);
  }
  // ── 8) Yanlış sıra (taban üzerine) ─────────────────────────────────────────────
  {
    const h = await fresh("base0");
    await refused(h, "20280103000300", "YF202", "S8 taban üzerine 000300");
    await refused(h, FINAL, "YF202", `S8 taban üzerine ${FINAL}`);
    await drop(h);
  }
  // ── 9) Yarım kalmış transaction (dosyanın ortasında hata) ───────────────────────
  {
    const h = await fresh("upto100");
    const broken = mig("20280103000300").replace(/(\r?\n)(-- >>> F2 ŞEMA DÜZEYİ KAYDI)/, "$1SELECT 1/0;$1$2");
    ok(broken !== mig("20280103000300"), "S9 hata enjeksiyonu hazırlandı (kayıt bloğundan hemen önce)");
    await refused(h, "20280103000300", "22012", "S9 ortasında hata (node/pg tek sorgu)", broken);
    const lvl = (await h.c.query("SELECT public.auth_f2_schema_level() AS l")).rows[0].l;
    ok(lvl === 100, "S9 kayıt düzeyi değişmedi (100)");
    const r = await apply(h.c, "20280103000300");
    ok(r.ok, "S9 ardından doğru dosya normal uygulanır", r.msg);
    // Gerçek psql (ON_ERROR_STOP KAPALI = en kötü istemci) ile aynı senaryo.
    const psqlBin = ["C:/Users/Mustafa/pgtools/pgsql/bin/psql.exe", "/usr/bin/psql", "/usr/lib/postgresql/17/bin/psql"].find((p) => fs.existsSync(p));
    if (!psqlBin) { notRun++; console.log("NOT RUN S9-psql: psql ikili dosyası yok (yalnız node/pg yolu kanıtlandı)"); }
    else {
      const h2 = await fresh("upto100");
      const before = await snap(h2.c);
      const tmp = path.join(dir, "kirik.sql");
      fs.writeFileSync(tmp, broken);
      const p = spawnSync(psqlBin, ["-X", "-q", "-h", "localhost", "-p", String(port), "-U", "postgres", "-d", h2.name, "-f", tmp],
        { env: { ...process.env, PGPASSWORD: "pw" }, encoding: "utf8" });
      ok(before === (await snap(h2.c)), "S9-psql ON_ERROR_STOP kapalıyken bile katalog değişmedi (BEGIN…COMMIT → ROLLBACK)", (p.stderr || "").slice(0, 200));
      const old = mig("20280103000100");
      fs.writeFileSync(tmp, old);
      const h3 = await fresh("upto700");
      const b3 = await snap(h3.c);
      spawnSync(psqlBin, ["-X", "-q", "-h", "localhost", "-p", String(port), "-U", "postgres", "-d", h3.name, "-f", tmp],
        { env: { ...process.env, PGPASSWORD: "pw" }, encoding: "utf8" });
      ok(b3 === (await snap(h3.c)), "S9-psql ON_ERROR_STOP kapalı + eski dosya (000100, 000700 üzerinde): katalog değişmedi");
      await drop(h2); await drop(h3);
    }
    await drop(h);
  }
  // ── 10–13) Katalog sapmaları: postflight + preflight yakalamalı ─────────────────
  const sig = async (c, name) => (await c.query("SELECT p.oid::regprocedure::text AS s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1", [name])).rows[0].s;
  const drift = async (label, sql) => {
    const h = await fresh("tamzincir");
    for (const s of [].concat(sql)) await h.c.query(typeof s === "function" ? await s(h.c) : s);
    const p = await postflight(h.c);
    ok(p.startsWith("FAIL"), `${label}: postflight FAIL verdi`, p);
    const pf = await preflight(h.c);
    ok(Object.values(pf).some((x) => String(x).startsWith("ŞEMA SAPMASI")) || String(pf.durum).includes("katalog_ozeti=false"),
      `${label}: preflight ŞEMA SAPMASI`, JSON.stringify(pf).slice(0, 200));
    await drop(h);
  };
  await drift("S10 fonksiyon imzası değişti (auth_device_list)", [
    async (c) => `DROP FUNCTION ${await sig(c, "auth_device_list")}`,
    "CREATE FUNCTION public.auth_device_list(p_actor_token text, p_scope text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT '[]'::jsonb $$",
    "REVOKE ALL ON FUNCTION public.auth_device_list(text, text) FROM PUBLIC, anon, authenticated",
  ]);
  await drift("S11a iç yardımcı service_role'e açıldı (auth_step_up_consume)", "GRANT EXECUTE ON FUNCTION public.auth_step_up_consume(uuid) TO service_role");
  await drift("S11b F2 tablosu authenticated'a açıldı (auth_recovery_codes)", "GRANT SELECT ON public.auth_recovery_codes TO authenticated");
  await drift("S11c Owner fonksiyonu anon'a açıldı (auth_qr_decide)", async (c) => `GRANT EXECUTE ON FUNCTION ${await sig(c, "auth_qr_decide")} TO anon`);
  await drift("S12a SECURITY DEFINER → INVOKER (auth_qr_fetch)", async (c) => `ALTER FUNCTION ${await sig(c, "auth_qr_fetch")} SECURITY INVOKER`);
  await drift("S12b search_path sıfırlandı (auth_finalize_login)", async (c) => `ALTER FUNCTION ${await sig(c, "auth_finalize_login")} RESET search_path`);
  await drift("S12c tetikleyici devre dışı (user_sessions_mfa_guard_trg)", "ALTER TABLE public.user_sessions DISABLE TRIGGER user_sessions_mfa_guard_trg");
  await drift("S13 eski gövdeli ek overload (auth_mfa_set_required 3 parametre)", [
    "CREATE FUNCTION public.auth_mfa_set_required(p_actor_token text, p_user_id uuid, p_required boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT '{\"ok\":true}'::jsonb $$",
    "REVOKE ALL ON FUNCTION public.auth_mfa_set_required(text, uuid, boolean) FROM PUBLIC, anon, authenticated",
  ]);
  // ── 14) Migration geçmişi ↔ katalog uyuşmazlığı ────────────────────────────────
  {
    const h = await fresh("tamzincir");
    await h.c.query("DELETE FROM supabase_migrations.schema_migrations WHERE version = '20280103000500'");
    let pf = await preflight(h.c);
    ok(pf.gecmis?.includes("UYUMSUZ") && pf.gecmis.includes("20280103000500"), "S14a geçmişte eksik sürüm yakalandı", pf.gecmis);
    ok(pf[LOCK_FILE]?.startsWith("İNSAN İNCELEMESİ"), "S14a 000200 için İNSAN İNCELEMESİ GEREKLİ", pf[LOCK_FILE]);
    await drop(h);
    const h2 = await fresh("base0");
    await ledger(h2.c, "20280103000000");
    pf = await preflight(h2.c);
    ok(pf.gecmis?.includes("UYUMSUZ") && pf[LINEAR[0]]?.startsWith("İNSAN İNCELEMESİ"),
      "S14b geçmişte var / katalogda yok → 000000 için İNSAN İNCELEMESİ", `${pf.gecmis} ${pf[LINEAR[0]]}`);
    await drop(h2);
    // Kayıt kurcalama: kayıt düzeyi katalogla çelişiyor.
    const h3 = await fresh("tamzincir");
    await h3.c.query("CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $f$ SELECT 300 $f$");
    await refused(h3, FINAL, "YF203", "S14c kayıt kurcalandı (300) — en son dosya bile");
    pf = await preflight(h3.c);
    ok(LINEAR.every((v) => pf[v]?.startsWith("İNSAN İNCELEMESİ")), "S14c preflight: bütün aşamalar İNSAN İNCELEMESİ GEREKLİ");
    await drop(h3);
  }
  // ── 15) 000200 erken ─────────────────────────────────────────────────────────────
  {
    const h = await fresh("base0");
    await refused(h, LOCK_FILE, "YF202", "S15a F2 öncesi tabana 000200");
    await drop(h);
    const h2 = await fresh("upto100");
    const pf = await preflight(h2.c);
    ok(pf[LOCK_FILE]?.startsWith("SIRA HATASI"), "S15b preflight: zincir tamamlanmadan 000200 SIRA HATASI", pf[LOCK_FILE]);
    await drop(h2);
  }
} catch (e) {
  fail++;
  console.log(`FAIL beklenmeyen hata: ${e.stack ?? e}`);
} finally {
  await server.stop().catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* geçici */ }
}
console.log(`\nf2-migration-guard: ${pass} PASS, ${fail} FAIL${notRun ? `, ${notRun} NOT RUN` : ""}`);
process.exit(fail ? 1 : 0);
