// KAMPANYA MERKEZİ KM-1 — 20271228000000 + 20271228000100 GERÇEK PostgreSQL doğrulaması.
// YALNIZ yerel geçici embedded-postgres; production / staging / uzak DB YOK; sağlayıcı çağrısı YOK. Sentetik veriler.
// Supabase varsayılan ACL'si (service_role dahil herkese ALL) migration'lardan ÖNCE uygulanır → REVOKE'lar gerçek
// varsayılana karşı sınanır. Kapsam: idempotency (2×), yetki/RLS/manifest, Owner denetimi, 100 eşzamanlı rezervasyon,
// genel/teknik/IP/tarayıcı sınırları, limit düşürme, kapatma/acil anahtar, tek yayındaki kampanya, 0 kredili paket,
// 1/2/5/değişken kredi, idempotent tekrar, zaman aşımı, önbellek isabeti, çökme sonrası süre dolumu, Türkiye gece yarısı /
// UTC sınırı, sağlayıcı aylık/dakika kotası, uzman payı, 429 bekleme, denetim kaydı, veri en aza indirme.
// Çalıştırma: node scripts/campaign/pg/campaign-quota.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG_CORE = path.join(REPO, "supabase/migrations/20271228000000_campaign_center_core.sql");
const MIG_RPC = path.join(REPO, "supabase/migrations/20271228000100_campaign_center_quota_rpc.sql");
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase gerçek varsayılanı: yeni tablolarda herkese ALL (REVOKE'ların bunu kapattığı sınanır).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS public.users (id uuid PRIMARY KEY, role text, active boolean, is_super_admin boolean NOT NULL DEFAULT false,
  is_demo_account boolean NOT NULL DEFAULT false, tenant_id uuid);
CREATE TABLE IF NOT EXISTS public.clients (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, full_name text);`;

const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const ADMIN = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const DEMO = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const INACTIVE = "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d";
const EXPERT = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";

const watchdog = setTimeout(() => {
  console.error("FAIL campaign-quota: 8 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 8 * 60_000);
watchdog.unref();

async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 59000 + Math.floor(Math.random() * 3000);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km1-campaign-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", "max_connections=200"], onLog: () => {}, onError: () => {} });
const opened = new Set();
const newClient = async (role = null, opts = {}) => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  c.on("error", () => {});
  opened.add(c);
  await c.connect();
  if (opts.clock) await c.query("SET campaign.allow_clock_override = 'on'");
  if (role) await c.query(`SET ROLE ${role}`);
  return c;
};
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
};
const hex = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const key = () => crypto.randomBytes(18).toString("base64url");
async function tryq(c, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, code: e.code, msg: String(e.message) };
  }
}
const val = async (c, sql, params = []) => Object.values((await c.query(sql, params)).rows[0])[0];

await server.initialise();
await server.start();
try {
  const admin = await newClient();
  await admin.query(BOOT);
  await admin.query(
    `INSERT INTO public.users (id, role, active, is_super_admin, is_demo_account) VALUES
      ($1,'admin',true,true,false), ($2,'admin',true,false,false), ($3,'admin',true,true,true), ($4,'admin',false,true,false), ($5,'expert',true,false,false)`,
    [OWNER, ADMIN, DEMO, INACTIVE, EXPERT],
  );
  const core = fs.readFileSync(MIG_CORE, "utf8");
  const rpc = fs.readFileSync(MIG_RPC, "utf8");
  await admin.query(core);
  await admin.query(rpc);
  let twice = true;
  try {
    await admin.query(core);
    await admin.query(rpc);
  } catch (e) {
    twice = false;
    console.log(String(e.message));
  }
  check("K01 iki migration da iki kez çalışır (idempotent)", twice);
  const nocomment = (s) => s.replace(/--[^\n]*/g, "");
  check("K02 migration'larda DROP TABLE / TRUNCATE yok", !/\bDROP\s+TABLE\b|\bTRUNCATE\b/i.test(nocomment(core) + nocomment(rpc)));
  const deletes = (nocomment(rpc).match(/\bDELETE\s+FROM\s+[a-z_.]+/gi) ?? []);
  check("K03 tek DELETE yalnız campaign_purge_subjects içinde (kimlik sayaçları)", deletes.length === 1 && /campaign_subject_daily/.test(deletes[0]) && !/\bDELETE\s+FROM\b/i.test(nocomment(core)), deletes.join(","));
  check("K04 tenant/danışan/uzman tablolarına referans yok (yalnız users okuma)", !/\b(clients|human_design_|numerology_|astro_|tenant_id)\b/i.test(nocomment(core + rpc).replace(/public\.users u/g, "")));

  // ── Yetkiler + RLS ──
  const TABLES = ["campaign_settings", "campaigns", "campaign_techniques", "campaign_text_templates", "campaign_usage_daily", "campaign_subject_daily", "campaign_reservations", "campaign_provider_calls", "campaign_provider_state", "campaign_audit_log"];
  for (const t of TABLES) {
    const r = (await admin.query(`SELECT
      has_table_privilege('anon','public.${t}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') a,
      has_table_privilege('authenticated','public.${t}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') u,
      has_table_privilege('service_role','public.${t}','SELECT') s_sel,
      has_table_privilege('service_role','public.${t}','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') s_w,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.${t}'::regclass) rls,
      (SELECT count(*) FROM pg_policies WHERE tablename='${t}')::int pol`)).rows[0];
    check(`Y01 ${t}: anon/authenticated sıfır yetki; service_role yalnız SELECT; RLS açık, politika yok`, !r.a && !r.u && r.s_sel && !r.s_w && r.rls && r.pol === 0, JSON.stringify(r));
  }
  for (const s of ["campaign_provider_calls_id_seq", "campaign_audit_log_id_seq"]) {
    const r = (await admin.query(`SELECT has_sequence_privilege('anon','public.${s}','USAGE,SELECT,UPDATE') a, has_sequence_privilege('service_role','public.${s}','USAGE,SELECT,UPDATE') s`)).rows[0];
    check(`Y02 ${s}: istemci ve service_role doğrudan kullanamaz`, !r.a && !r.s);
  }
  const fns = (await admin.query(`SELECT p.proname, p.oid::regprocedure::text sig, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u,
      has_function_privilege('service_role', p.oid, 'EXECUTE') s
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'campaign%'`)).rows;
  const PUBLIC_RPC = ["campaign_reserve", "campaign_settle", "campaign_record_provider_call", "campaign_observe_provider", "campaign_expire_stale", "campaign_purge_subjects", "campaign_admin_save", "campaign_admin_set_status", "campaign_admin_set_techniques", "campaign_admin_archive", "campaign_admin_update_settings", "campaign_admin_save_template", "campaign_admin_archive_template"];
  check("Y03 fonksiyon sayısı (13 RPC + 8 iç)", fns.length === 21, String(fns.length));
  for (const f of fns) {
    const isRpc = PUBLIC_RPC.includes(f.proname);
    const sp = (f.proconfig ?? []).some((x) => x.startsWith("search_path=pg_catalog, public, pg_temp"));
    check(`Y04 ${f.proname}: anon/authenticated çalıştıramaz; service_role ${isRpc ? "çalıştırır" : "çalıştıramaz"}; search_path sabit`, !f.a && !f.u && f.s === isRpc && sp, JSON.stringify({ a: f.a, u: f.u, s: f.s, sp }));
    if (isRpc) check(`Y05 ${f.proname}: SECURITY DEFINER`, f.prosecdef === true);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, "supabase/expected-manifest.json"), "utf8"));
  const inM = (sec, n) => manifest[sec].names.includes(n) && manifest[sec].optional.includes(n);
  check("Y06 manifest: tablolar tables_no_client_grant + tables_rls_enabled (names + optional)", TABLES.every((t) => inM("tables_no_client_grant", t) && inM("tables_rls_enabled", t)));
  check("Y07 manifest: tüm campaign fonksiyonları functions_no_client_execute (names + optional)", fns.every((f) => inM("functions_no_client_execute", f.proname)));

  const anon = await newClient("anon");
  const authd = await newClient("authenticated");
  const svc = await newClient("service_role");
  const r1 = await tryq(anon, "SELECT * FROM public.campaigns");
  const r2 = await tryq(authd, "SELECT public.campaign_reserve($1,'hd:bodygraph',$2)", [key(), hex("x")]);
  check("Y08 anon tablo okuyamaz, authenticated RPC çağıramaz (42501)", r1.code === "42501" && r2.code === "42501", `${r1.code} ${r2.code}`);
  const r3 = await tryq(svc, "INSERT INTO public.campaign_usage_daily (day_tr, scope) VALUES (current_date, 'global')");
  const r4 = await tryq(svc, "UPDATE public.campaign_settings SET kill_switch = true");
  const r5 = await tryq(svc, "SELECT public.campaign__finalize(gen_random_uuid(), 'completed', 0, now())");
  const r6 = await tryq(svc, "SELECT public.campaign_actor_is_owner($1)", [OWNER]);
  check("Y09 service_role sayaç/ayar tablosuna doğrudan yazamaz, iç fonksiyonları çağıramaz", r3.code === "42501" && r4.code === "42501" && r5.code === "42501" && r6.code === "42501", [r3.code, r4.code, r5.code, r6.code].join(","));
  const r7 = await tryq(svc, "SELECT count(*) FROM public.clients");
  check("Y10 tenant izolasyonu: kampanya migration'ları istemci tablolarına yetki açmaz (service_role varsayılanı aynen)", r7.ok === true && !(await val(admin, "SELECT has_table_privilege('anon','public.campaigns','SELECT')")));

  // ── Owner denetimi ──
  const save = (c, actor, id, ver, fields) => c.query("SELECT public.campaign_admin_save($1,$2,$3,$4::jsonb) r", [actor, id, ver, JSON.stringify(fields)]).then((x) => x.rows[0].r);
  for (const [who, id] of [["admin (super değil)", ADMIN], ["demo hesap", DEMO], ["pasif hesap", INACTIVE], ["uzman", EXPERT], ["boş", null]]) {
    const r = await tryq(svc, "SELECT public.campaign_admin_save($1,NULL,NULL,$2::jsonb)", [id, JSON.stringify({ name: "x" })]);
    check(`O01 ${who} kampanya oluşturamaz (42501)`, r.code === "42501", r.code);
  }
  const rs = await tryq(svc, "SELECT public.campaign_admin_update_settings($1,1,'{\"kill_switch\":true}'::jsonb)", [ADMIN]);
  check("O02 admin (super değil) ayar değiştiremez", rs.code === "42501");
  const unk = await tryq(svc, "SELECT public.campaign_admin_save($1,NULL,NULL,'{\"name\":\"x\",\"status\":\"aktif\"}'::jsonb)", [OWNER]);
  check("O03 kaydetme durum alanını kabul etmez (bilinmeyen alan)", unk.ok === false && /CAMPAIGN_FIELD_UNKNOWN/.test(unk.msg));

  const settings = async (fields) => {
    const v = await val(admin, "SELECT version FROM public.campaign_settings");
    return (await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb) r", [OWNER, v, JSON.stringify(fields)])).rows[0].r;
  };
  const ver = (id) => val(admin, "SELECT version FROM public.campaigns WHERE id=$1", [id]);
  const createCampaign = async (name, extra = {}) => (await save(svc, OWNER, null, null, { name, ...extra })).id;
  const setTech = async (id, items) => (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, id, await ver(id), JSON.stringify(items)])).rows[0].r;
  const setStatus = async (id, st) => (await svc.query("SELECT public.campaign_admin_set_status($1,$2,$3,$4) r", [OWNER, id, st, await ver(id)])).rows[0].r;
  const T = (k, o = {}) => ({ technique_key: k, enabled: true, ip_daily_limit: 1000, daily_analysis_limit: 100000, daily_credit_budget: 100000, max_credit_per_analysis: 1, comments_enabled: false, ...o });
  const reserveQ = "SELECT public.campaign_reserve($1,$2,$3,$4,$5) r";
  const reserve = async (c, k, ip, opts = {}) => (await c.query(reserveQ, [opts.key ?? key(), k, hex(ip), opts.browser ? hex(opts.browser) : null, opts.now ?? null])).rows[0].r;
  const settle = async (c, id, outcome, spent = null, now = null) => (await c.query("SELECT public.campaign_settle($1,$2,$3,$4) r", [id, outcome, spent, now])).rows[0].r;
  const usage = async (scope, day = null) => (await admin.query(`SELECT reserved_analyses ra, used_analyses ua, reserved_credits rc, spent_credits sc FROM public.campaign_usage_daily WHERE scope=$1 AND day_tr=coalesce($2::date, (now() AT TIME ZONE 'Europe/Istanbul')::date)`, [scope, day])).rows[0] ?? { ra: 0, ua: 0, rc: 0, sc: 0 };
  const observe = (remaining) => svc.query("SELECT public.campaign_observe_provider('roxy',$1,NULL,NULL,false,NULL)", [remaining]);
  const resetDay = async () => {
    // Test izolasyonu: yalnız yerel geçici DB'de, süper kullanıcı ile sayaçları ve rezervasyonları temizler.
    await admin.query("TRUNCATE public.campaign_provider_calls, public.campaign_reservations, public.campaign_usage_daily, public.campaign_subject_daily");
    await admin.query("UPDATE public.campaign_provider_state SET minute_window=NULL, minute_count=0, cooldown_until=NULL");
  };

  // Varsayılan: ücretli çağrı kapalı başlar.
  const s0 = (await admin.query("SELECT * FROM public.campaign_settings")).rows[0];
  check("D01 varsayılan ayar: genel kredi bütçesi 0, sağlayıcı kotası tanımsız, acil anahtar kapalı", s0.global_daily_credit_budget === 0 && s0.provider_monthly_quota === null && s0.kill_switch === false);

  const C1 = await createCampaign("Test Kampanyası 1");
  check("O04 Owner kampanya oluşturur (Kapalı başlar) + denetim kaydı", (await val(admin, "SELECT status FROM public.campaigns WHERE id=$1", [C1])) === "kapali" && (await val(admin, "SELECT count(*)::int FROM public.campaign_audit_log WHERE campaign_id=$1 AND action='campaign_create'", [C1])) === 1);
  await settings({ global_daily_credit_budget: 100000, provider_monthly_quota: 100000, expert_reserve_pct: 60, provider_minute_limit: 10000 });
  await observe(90000);
  await setTech(C1, [T("hd:bodygraph", { daily_analysis_limit: 37 }), T("numk:dual", { max_credit_per_analysis: 2 }), T("numk:person_all", { max_credit_per_analysis: 5 }), T("atlas:kp.transit", { max_credit_per_analysis: 15 }), T("kozmik:paket", { max_credit_per_analysis: 0, daily_credit_budget: 0, ip_daily_limit: 3, daily_analysis_limit: 50 }), T("atlas:horary.lilly", { max_credit_per_analysis: 0, daily_credit_budget: 0 })]);
  const zc = await tryq(svc, "SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb)", [OWNER, C1, await ver(C1), JSON.stringify([T("kozmik:paket", { max_credit_per_analysis: 0, daily_credit_budget: 10 })])]);
  check("D02 0 kredili teknikte kredi bütçesi DB'de reddedilir (23514)", zc.code === "23514", zc.code);

  const closed = await reserve(svc, "hd:bodygraph", "1.1.1.1");
  check("R01 Kapalı kampanyada rezervasyon yok", closed.ok === false && closed.reason === "kampanya_kapali", JSON.stringify(closed));
  await setStatus(C1, "aktif");

  // ── R02: 100 eşzamanlı istek, teknik kontenjanı 37 ──
  const pool = [];
  for (let i = 0; i < 100; i++) pool.push(await newClient("service_role"));
  const res100 = await Promise.all(pool.map((c, i) => reserve(c, "hd:bodygraph", `10.0.0.${i}`)));
  const ok100 = res100.filter((r) => r.ok).length;
  const u100 = await usage(`tech:${C1}:hd:bodygraph`);
  check("R02 100 eşzamanlı rezervasyon → tam 37 kabul (teknik kontenjanı aşılmaz)", ok100 === 37 && u100.ra === 37, `ok=${ok100} ra=${u100.ra}`);
  check("R03 reddedilen 63 isteğin nedeni teknik_kontenjan_doldu", res100.filter((r) => !r.ok && r.reason === "teknik_kontenjan_doldu").length === 63);
  const g100 = await usage("global");
  check("R04 genel sayaç = 37 analiz / 37 kredi rezerve", g100.ra === 37 && g100.rc === 37, JSON.stringify(g100));

  // ── R05: limit gün içinde düşürülür → kullanım sıfırlanmaz ──
  await setTech(C1, [T("hd:bodygraph", { daily_analysis_limit: 10 }), T("numk:dual", { max_credit_per_analysis: 2 }), T("numk:person_all", { max_credit_per_analysis: 5 }), T("atlas:kp.transit", { max_credit_per_analysis: 15 }), T("kozmik:paket", { max_credit_per_analysis: 0, daily_credit_budget: 0, ip_daily_limit: 3, daily_analysis_limit: 50 }), T("atlas:horary.lilly", { max_credit_per_analysis: 0, daily_credit_budget: 0 })]);
  const afterLower = await reserve(svc, "hd:bodygraph", "10.9.9.9");
  const u2 = await usage(`tech:${C1}:hd:bodygraph`);
  check("R05 limit 37→10 düşürüldü: kullanım 37 korunur, yeni istek reddedilir", afterLower.ok === false && afterLower.reason === "teknik_kontenjan_doldu" && u2.ra === 37, JSON.stringify({ afterLower, u2 }));

  // ── R06: genel kredi bütçesi (eşzamanlı) ──
  await resetDay();
  await settings({ global_daily_credit_budget: 10 });
  const res20 = await Promise.all(pool.slice(0, 20).map((c, i) => reserve(c, "numk:dual", `20.0.0.${i}`)));
  const g20 = await usage("global");
  check("R06 genel günlük kredi 10, teknik 2 kredi, 20 eşzamanlı → tam 5 kabul", res20.filter((r) => r.ok).length === 5 && g20.rc === 10 && res20.filter((r) => r.reason === "genel_kredi_doldu").length === 15, JSON.stringify(g20));

  // ── R07: IP + tarayıcı limiti (eşzamanlı aynı IP) ──
  await resetDay();
  await settings({ global_daily_credit_budget: 100000 });
  const resIp = await Promise.all(pool.slice(0, 12).map((c) => reserve(c, "kozmik:paket", "7.7.7.7")));
  check("R07 aynı IP 12 eşzamanlı, IP/gün 3 → tam 3 kabul", resIp.filter((r) => r.ok).length === 3 && resIp.filter((r) => r.reason === "ip_hakki_doldu").length === 9);
  const resBr = await Promise.all(pool.slice(0, 6).map((c, i) => reserve(c, "kozmik:paket", `8.8.8.${i}`, { browser: "tarayici-A" })));
  check("R08 farklı IP + aynı tarayıcı kimliği → tarayıcı hakkı 3 ile sınırlı", resBr.filter((r) => r.ok).length === 3 && resBr.filter((r) => r.reason === "tarayici_hakki_doldu").length === 3);

  // ── R09: 0 kredili paket: kredi/sağlayıcı denetimi işletilmez ──
  await resetDay();
  await settings({ global_daily_credit_budget: 0, provider_monthly_quota: null });
  await admin.query("UPDATE public.campaign_provider_state SET observed_at = NULL, remaining = NULL");
  const z1 = await reserve(svc, "kozmik:paket", "9.9.9.1");
  const p1 = await reserve(svc, "numk:dual", "9.9.9.2");
  const gz = await usage("global");
  check("R09 0 kredili Kozmik paketi: kredi bütçesi 0 + sağlayıcı bilinmiyorken bile kabul, kredi rezerve edilmez", z1.ok === true && z1.max_credits === 0 && gz.rc === 0, JSON.stringify({ z1, gz }));
  check("R10 aynı koşulda ücretli teknik reddedilir (genel kredi 0)", p1.ok === false && p1.reason === "genel_kredi_doldu", JSON.stringify(p1));
  const zsettle = await settle(svc, z1.reservation_id, "completed", null);
  check("R11 0 kredili kapanış: harcanan kredi 0, analiz 1", zsettle.spent_credits === 0 && (await usage(`tech:${C1}:kozmik:paket`)).ua === 1);
  const zcall = await tryq(svc, "SELECT public.campaign_record_provider_call($1,'roxy','x/y',200,'ok',1) r", [(await reserve(svc, "kozmik:paket", "9.9.9.3")).reservation_id]);
  check("R12 0 kredili rezervasyona sağlayıcı çağrısı yazılamaz", zcall.ok && zcall.rows[0].r.reason === "sifir_maliyetli_teknik");

  // ── Sağlayıcı kotası ──
  await resetDay();
  await settings({ global_daily_credit_budget: 100000 });
  const pq = await reserve(svc, "numk:dual", "11.0.0.1");
  check("S01 sağlayıcı aylık kotası tanımsız → ücretli rezervasyon yok", pq.reason === "saglayici_kotasi_tanimsiz", JSON.stringify(pq));
  await settings({ provider_monthly_quota: 1000, expert_reserve_pct: 60 });
  const ps1 = await reserve(svc, "numk:dual", "11.0.0.2");
  check("S02 sağlayıcı durumu gözlenmemiş → reddedilir (fail-closed)", ps1.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(ps1));
  await admin.query("UPDATE public.campaign_provider_state SET remaining=900, observed_at = now() - interval '20 minutes'");
  const ps2 = await reserve(svc, "numk:dual", "11.0.0.3");
  check("S03 eski (15 dk'dan eski) gözlem → reddedilir", ps2.reason === "saglayici_durumu_bilinmiyor");
  await observe(601);
  const ps3 = await reserve(svc, "numk:dual", "11.0.0.4");
  check("S04 kalan 601, uzman tabanı 600, 2 kredi → uzman payı korunur", ps3.reason === "uzman_payi_korunuyor", JSON.stringify(ps3));
  await observe(900);
  await admin.query("INSERT INTO public.campaign_usage_daily (day_tr, scope, spent_credits) VALUES (date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')::date)::date, 'month', 399) ON CONFLICT (day_tr, scope) DO UPDATE SET spent_credits = 399");
  const ps4 = await reserve(svc, "numk:dual", "11.0.0.5");
  check("S05 aylık kampanya payı (1000 × %40 = 400) dolu → reddedilir", ps4.reason === "aylik_kampanya_payi_doldu", JSON.stringify(ps4));
  await resetDay();
  await observe(900);
  await settings({ provider_minute_limit: 5 });
  const pm = await Promise.all(pool.slice(0, 6).map((c, i) => reserve(c, "numk:dual", `12.0.0.${i}`)));
  check("S06 sağlayıcı dakika tavanı 5 kredi, 2 kredilik 6 eşzamanlı → 2 kabul", pm.filter((r) => r.ok).length === 2 && pm.filter((r) => r.reason === "saglayici_dakika_siniri").length === 4);
  await settings({ provider_minute_limit: 10000 });
  const rlRes = pm.find((r) => r.ok);
  await svc.query("SELECT public.campaign_record_provider_call($1,'roxy','numerology/chart',429,'rate_limited',1,850,NULL,NULL,NULL)", [rlRes.reservation_id]);
  const pc = await reserve(svc, "numk:dual", "12.1.1.1");
  check("S07 429 sonrası 10 dk bekleme → reddedilir; kalan kota gözlemi güncellenir", pc.reason === "saglayici_bekleme" && (await val(admin, "SELECT remaining FROM public.campaign_provider_state")) === 850);
  await admin.query("UPDATE public.campaign_provider_state SET cooldown_until = NULL");
  await settings({ provider_monthly_quota: 100000 });
  await observe(90000);

  // ── Kredi maliyetleri ve sonuçlandırma ──
  await resetDay();
  for (const [k, mx] of [["hd:bodygraph", 1], ["numk:dual", 2], ["numk:person_all", 5]]) {
    const r = await reserve(svc, k, `30.0.0.${mx}`);
    const ur = await usage(`tech:${C1}:${k}`);
    const st = await settle(svc, r.reservation_id, "completed", mx);
    const us = await usage(`tech:${C1}:${k}`);
    check(`C01 ${mx} kredilik teknik: ${mx} rezerve → tamamlanınca ${mx} harcanır, rezerv sıfırlanır`, r.max_credits === mx && ur.rc === mx && st.spent_credits === mx && us.rc === 0 && us.sc === mx && us.ua === 1, JSON.stringify({ ur, us }));
  }
  const v1 = await reserve(svc, "atlas:kp.transit", "31.0.0.1");
  await svc.query("SELECT public.campaign_record_provider_call($1,'roxy','astrology/kp/planets',200,'ok',1)", [v1.reservation_id]);
  await svc.query("SELECT public.campaign_record_provider_call($1,'roxy','astrology/kp/planets',200,'ok',1)", [v1.reservation_id]);
  const v1s = await settle(svc, v1.reservation_id, "completed", 1);
  const uv = await usage(`tech:${C1}:atlas:kp.transit`);
  check("C02 değişken maliyet (azami 15): 15 rezerve, defterde 2 çağrı → bildirilen 1 olsa bile 2 harcanır, 13 serbest", v1.max_credits === 15 && v1s.spent_credits === 2 && uv.rc === 0 && uv.sc === 2, JSON.stringify({ v1s, uv }));

  const ch = await reserve(svc, "numk:dual", "32.0.0.1");
  const chs = await settle(svc, ch.reservation_id, "cache_hit");
  const uch = await usage(`tech:${C1}:numk:dual`);
  check("C03 kesin önbellek isabeti: kredi serbest (0 harcanır), analiz kullanıldı sayılır", chs.spent_credits === 0 && chs.state === "completed" && uch.rc === 0, JSON.stringify(chs));
  const ch2 = await reserve(svc, "numk:dual", "32.0.0.2");
  await svc.query("SELECT public.campaign_record_provider_call($1,'roxy','numerology/chart',200,'ok',1)", [ch2.reservation_id]);
  const ch2s = await settle(svc, ch2.reservation_id, "cache_hit");
  check("C04 defterde çağrı varken 'cache_hit' bildirimi ücretsiz sayılmaz", ch2s.outcome === "completed" && ch2s.spent_credits === 1, JSON.stringify(ch2s));

  const to = await reserve(svc, "numk:dual", "33.0.0.1");
  await svc.query("SELECT public.campaign_record_provider_call($1,'roxy','numerology/chart',NULL,'timeout',1)", [to.reservation_id]);
  const tos = await settle(svc, to.reservation_id, "aborted_no_call");
  check("C05 sağlayıcı zaman aşımı: 'aborted_no_call' bildirilse de failed_after_call + 1 kredi harcanır", tos.outcome === "failed_after_call" && tos.spent_credits === 1, JSON.stringify(tos));
  const to2 = await reserve(svc, "numk:dual", "33.0.0.2");
  const to2s = await settle(svc, to2.reservation_id, "failed_after_call", null);
  check("C06 defter kaydı olmasa bile failed_after_call en az 1 kredi", to2s.spent_credits === 1);

  const ab = await reserve(svc, "kozmik:paket", "34.0.0.1");
  const ipBefore = await val(admin, "SELECT used FROM public.campaign_subject_daily WHERE subject_hash=$1 AND subject_kind='ip'", [hex("34.0.0.1")]);
  const abs = await settle(svc, ab.reservation_id, "aborted_no_call");
  const ipAfter = await val(admin, "SELECT used FROM public.campaign_subject_daily WHERE subject_hash=$1 AND subject_kind='ip'", [hex("34.0.0.1")]);
  check("C07 çağrı yapılmadan iptal: analiz + IP hakkı + kredi iade", abs.state === "released" && ipBefore === 1 && ipAfter === 0);
  const twiceS = await settle(svc, ch.reservation_id, "completed", 5);
  const uch2 = await usage(`tech:${C1}:numk:dual`);
  check("C08 aynı rezervasyonu ikinci kez kapatma bütçeyi değiştirmez (replay)", twiceS.replay === true && uch2.sc === uch.sc + 1 + 1 + 1, JSON.stringify({ twiceS, uch, uch2 }));
  const late = await tryq(svc, "SELECT public.campaign_record_provider_call($1,'roxy','x',200,'ok',1) r", [ch.reservation_id]);
  check("C09 kapanmış rezervasyona çağrı yazılamaz", late.ok && late.rows[0].r.reason === "rezervasyon_kapali");

  // ── İdempotency ──
  const K = key();
  const i1 = await reserve(svc, "numk:dual", "40.0.0.1", { key: K });
  const ub = await usage(`tech:${C1}:numk:dual`);
  const i2 = await reserve(svc, "numk:dual", "40.0.0.1", { key: K });
  const ua = await usage(`tech:${C1}:numk:dual`);
  check("I01 aynı istek kimliğiyle tekrar → aynı rezervasyon, ikinci kez bütçe tüketmez", i2.replay === true && i2.reservation_id === i1.reservation_id && ua.ra === ub.ra && ua.rc === ub.rc);
  const i3 = await reserve(svc, "hd:bodygraph", "40.0.0.1", { key: K });
  check("I02 aynı anahtar farklı teknik → idempotency_cakismasi", i3.reason === "idempotency_cakismasi");
  const K2 = key();
  const ipar = await Promise.all(pool.slice(0, 20).map((c) => reserve(c, "numk:dual", "41.0.0.1", { key: K2 })));
  const cnt = await val(admin, "SELECT count(*)::int FROM public.campaign_reservations WHERE idempotency_key=$1", [K2]);
  check("I03 aynı anahtarla 20 eşzamanlı tekrar → tek rezervasyon, 19 replay", cnt === 1 && ipar.filter((r) => r.replay).length === 19 && new Set(ipar.map((r) => r.reservation_id)).size === 1);
  const bad = await reserve(svc, "numk:dual", "x", { key: "kisa" });
  check("I04 geçersiz istek kimliği reddedilir", bad.reason === "gecersiz_istek");

  // ── Çökme sonrası süre dolumu ──
  const crash = await reserve(svc, "numk:person_all", "50.0.0.1");
  const clk = await newClient("service_role", { clock: true });
  const exp0 = await val(clk, "SELECT public.campaign_expire_stale(now() + interval '5 minutes', 100)");
  const exp1 = await val(clk, "SELECT public.campaign_expire_stale(now() + interval '11 minutes', 100)");
  const crashRow = (await admin.query("SELECT state, spent_credits FROM public.campaign_reservations WHERE id=$1", [crash.reservation_id])).rows[0];
  check("E01 rezervasyon sonrası çökme: süre dolmadan dokunulmaz, 10 dk sonra 'expired' + azami kredi harcanmış sayılır", exp0 === 0 && exp1 >= 1 && crashRow.state === "expired" && crashRow.spent_credits === 5, JSON.stringify({ exp0, exp1, crashRow }));
  const openLeft = await val(admin, "SELECT count(*)::int FROM public.campaign_reservations WHERE state='reserved' AND expires_at < now() + interval '11 minutes'");
  check("E02 süre dolumundan sonra açık (yarım) rezervasyon kalmaz", openLeft === 0);
  const neg = await val(admin, "SELECT count(*)::int FROM public.campaign_usage_daily WHERE reserved_analyses < 0 OR reserved_credits < 0");
  check("E03 hiçbir sayaç negatife düşmez", neg === 0);

  // ── Türkiye gece yarısı / UTC sınırı ──
  await resetDay();
  const dayOf = async (id) => String((await admin.query("SELECT to_char(day_tr,'YYYY-MM-DD') d FROM public.campaign_reservations WHERE id=$1", [id])).rows[0].d);
  const before = await reserve(clk, "kozmik:paket", "60.0.0.1", { now: "2027-03-14T20:59:59Z" });
  const after = await reserve(clk, "kozmik:paket", "60.0.0.1", { now: "2027-03-14T21:00:00Z" });
  check("Z01 20:59:59Z = TR 23:59:59 → 14 Mart; 21:00:00Z = TR 00:00 → 15 Mart", (await dayOf(before.reservation_id)) === "2027-03-14" && (await dayOf(after.reservation_id)) === "2027-03-15");
  const u1 = await reserve(clk, "kozmik:paket", "60.0.0.2", { now: "2027-03-15T23:59:00Z" });
  const u2b = await reserve(clk, "kozmik:paket", "60.0.0.2", { now: "2027-03-16T00:01:00Z" });
  check("Z02 UTC gece yarısı (TR 02:59→03:01) aynı Türkiye günü sayılır", (await dayOf(u1.reservation_id)) === "2027-03-16" && (await dayOf(u2b.reservation_id)) === "2027-03-16");
  for (let i = 0; i < 3; i++) await reserve(clk, "kozmik:paket", "60.0.0.9", { now: "2027-03-15T20:00:00Z" });
  const full = await reserve(clk, "kozmik:paket", "60.0.0.9", { now: "2027-03-15T20:30:00Z" });
  const next = await reserve(clk, "kozmik:paket", "60.0.0.9", { now: "2027-03-15T21:00:01Z" });
  check("Z03 IP hakkı Türkiye gece yarısında yenilenir (aynı UTC günü içinde)", full.reason === "ip_hakki_doldu" && next.ok === true);
  const noClock = await reserve(svc, "kozmik:paket", "60.0.0.3", { now: "2027-03-14T12:00:00Z" });
  check("Z04 test saati ayarı olmadan p_now yok sayılır (sunucu saati kullanılır)", (await dayOf(noClock.reservation_id)) !== "2027-03-14");

  // ── Kampanya kapatma, acil anahtar, tarih penceresi, tek yayındaki kampanya ──
  await resetDay();
  await setStatus(C1, "kapali");
  const k1 = await reserve(svc, "kozmik:paket", "70.0.0.1");
  check("K10 kampanya kapatıldı → yeni rezervasyon yok", k1.reason === "kampanya_kapali");
  await setStatus(C1, "aktif");
  await settings({ kill_switch: true });
  const k2 = await reserve(svc, "kozmik:paket", "70.0.0.2");
  await settings({ kill_switch: false });
  check("K11 acil anahtar → yeni rezervasyon yok", k2.reason === "kampanya_kapali");
  const C2 = await createCampaign("Test Kampanyası 2", { undated: false, starts_at: "2099-01-01T00:00:00Z" });
  await setTech(C2, [T("kozmik:paket", { max_credit_per_analysis: 0, daily_credit_budget: 0 })]);
  const st2 = await setStatus(C2, "aktif");
  check("K12 ikinci kampanya yayına alınınca birinci otomatik Kapalı + denetim kaydı", st2.closed.includes(C1) && (await val(admin, "SELECT status FROM public.campaigns WHERE id=$1", [C1])) === "kapali" && (await val(admin, "SELECT count(*)::int FROM public.campaign_audit_log WHERE action='campaign_auto_close' AND campaign_id=$1", [C1])) === 1);
  const k3 = await reserve(svc, "kozmik:paket", "70.0.0.3");
  check("K13 başlangıcı gelecekte olan aktif kampanyada rezervasyon yok", k3.reason === "kampanya_kapali");
  const dup = await tryq(admin, "UPDATE public.campaigns SET status='yakinda' WHERE id=$1", [C1]);
  check("K14 DB düzeyinde ikinci yayındaki kampanya engellenir (23505)", dup.code === "23505", dup.code);
  const [cA, cB] = [await newClient("service_role"), await newClient("service_role")];
  const C3 = await createCampaign("Test Kampanyası 3");
  const C4 = await createCampaign("Test Kampanyası 4");
  const par = await Promise.all([
    tryq(cA, "SELECT public.campaign_admin_set_status($1,$2,'aktif',$3)", [OWNER, C3, await ver(C3)]),
    tryq(cB, "SELECT public.campaign_admin_set_status($1,$2,'yakinda',$3)", [OWNER, C4, await ver(C4)]),
  ]);
  const live = await val(admin, "SELECT count(*)::int FROM public.campaigns WHERE status IN ('yakinda','aktif') AND archived_at IS NULL");
  check("K15 iki eşzamanlı yayına alma → sonuçta tek yayındaki kampanya", live === 1, JSON.stringify(par.map((p) => p.code ?? "ok")));
  await admin.query("UPDATE public.campaigns SET undated = true WHERE id = $1", [C2]);
  await setStatus(C2, "yakinda");
  const yk = await reserve(svc, "kozmik:paket", "70.0.0.4");
  check("K16 'yakinda' kampanya (tekniği tanımlı, tarihsiz) rezervasyon kabul etmez", yk.reason === "kampanya_kapali", JSON.stringify(yk));

  // ── Yönetim kuralları ──
  const vc = await tryq(svc, "SELECT public.campaign_admin_save($1,$2,1,'{\"name\":\"eski sürüm\"}'::jsonb)", [OWNER, C1]);
  check("A01 eski sürümle kaydetme reddedilir (iyimser kilit)", vc.ok === false && /CAMPAIGN_VERSION_CONFLICT/.test(vc.msg));
  const arcLive = await tryq(svc, "SELECT public.campaign_admin_archive($1,$2,$3)", [OWNER, C3, await ver(C3)]);
  const liveC = await val(admin, "SELECT id FROM public.campaigns WHERE status IN ('yakinda','aktif')");
  const arc2 = await tryq(svc, "SELECT public.campaign_admin_archive($1,$2,$3)", [OWNER, liveC, await ver(liveC)]);
  check("A02 yayındaki kampanya arşivlenemez", arc2.ok === false && /CAMPAIGN_ARCHIVE_REQUIRES_CLOSED/.test(arc2.msg), `${arcLive.code}/${arc2.msg}`);
  const before5 = await val(admin, "SELECT count(*)::int FROM public.campaign_techniques WHERE campaign_id=$1", [C1]);
  await setTech(C1, [T("hd:bodygraph")]);
  const after5 = (await admin.query("SELECT count(*)::int n, count(*) FILTER (WHERE enabled)::int e FROM public.campaign_techniques WHERE campaign_id=$1", [C1])).rows[0];
  check("A03 teknik listesi daraltılınca satır silinmez, yalnız enabled=false", after5.n === before5 && after5.e === 1);
  const tpl = (await svc.query("SELECT public.campaign_admin_save_template($1,'{\"slogan\":\"Deneme\"}'::jsonb) r", [OWNER])).rows[0].r;
  await svc.query("SELECT public.campaign_admin_archive_template($1,$2)", [OWNER, tpl.id]);
  check("A04 metin şablonu kaydedilir ve arşivlenir (silinmez)", (await val(admin, "SELECT archived_at IS NOT NULL FROM public.campaign_text_templates WHERE id=$1", [tpl.id])) === true);
  const auditW = await tryq(svc, "INSERT INTO public.campaign_audit_log (actor_user_id, action) VALUES ($1,'sahte_kayit')", [OWNER]);
  const auditD = await tryq(svc, "DELETE FROM public.campaign_audit_log");
  check("A05 denetim kaydı service_role tarafından yazılamaz/silinemez (yalnız RPC ekler)", auditW.code === "42501" && auditD.code === "42501");
  check("A06 her Owner değişikliği denetim kaydında", (await val(admin, "SELECT count(DISTINCT action)::int FROM public.campaign_audit_log")) >= 6);

  // ── Veri en aza indirme ──
  await admin.query("INSERT INTO public.campaign_subject_daily (day_tr, campaign_id, technique_key, subject_kind, subject_hash, used) VALUES ((now() AT TIME ZONE 'Europe/Istanbul')::date - 40, $1, 'kozmik:paket', 'ip', $2, 1)", [C1, hex("eski")]);
  const pg1 = (await svc.query("SELECT public.campaign_purge_subjects(30, NULL) r")).rows[0].r;
  check("P01 30 günden eski kimlik sayaçları silinir; ham IP hiçbir tabloda yok", pg1.subjects_deleted === 1 && (await val(admin, "SELECT count(*)::int FROM public.campaign_subject_daily WHERE subject_hash !~ '^[0-9a-f]{64}$'")) === 0);
  const rawIp = await tryq(svc, reserveQ, [key(), "kozmik:paket", "1.2.3.4", null, null]);
  check("P02 ham IP (64 hex olmayan) DB tarafından reddedilir", rawIp.ok && rawIp.rows[0].r.reason === "gecersiz_istek");
} catch (err) {
  fail++;
  console.log(`FAIL beklenmeyen hata — ${err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : err}`);
} finally {
  for (const c of opened) {
    try {
      await c.end();
    } catch {
      /* yoksay */
    }
  }
  try {
    await server.stop();
  } catch {
    /* yoksay */
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\ncampaign-quota: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
