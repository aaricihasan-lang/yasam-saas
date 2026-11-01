// KAMPANYA MERKEZİ KM-1 — 20271228000000 + 20271228000100 GERÇEK PostgreSQL doğrulaması.
// YALNIZ yerel geçici embedded-postgres; production / staging / uzak DB YOK; sağlayıcı çağrısı YOK. Sentetik veriler.
// Supabase varsayılan ACL'si (service_role dahil herkese ALL) migration'lardan ÖNCE uygulanır → REVOKE'lar gerçek
// varsayılana karşı sınanır. Kapsam: idempotency (2×), yetki/RLS/manifest, Owner denetimi, 100 eşzamanlı rezervasyon,
// genel/teknik/IP/tarayıcı sınırları, limit düşürme, kapatma/acil anahtar, tek yayındaki kampanya, 0 kredili paket,
// 1/2/5/değişken kredi, idempotent tekrar (asla yeni izin vermez), çağrı öncesi yetkilendirme + rezervasyon kredi tavanı,
// zaman aşımı, önbellek isabeti, çökme sonrası süre dolumu, Türkiye gece yarısı / UTC sınırı, sağlayıcı aylık/dakika kotası,
// uzman payı, 429 bekleme, CTA / görsel yolu izin listesi, gerçek yorum izni (modül VE teknik), denetim kaydı, veri en aza indirme.
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
  const PUBLIC_RPC = ["campaign_reserve", "campaign_settle", "campaign_authorize_call", "campaign_record_provider_call", "campaign_observe_provider", "campaign_expire_stale", "campaign_purge_subjects", "campaign_admin_save", "campaign_admin_set_status", "campaign_admin_set_techniques", "campaign_admin_archive", "campaign_admin_update_settings", "campaign_admin_save_template", "campaign_admin_archive_template"];
  check("Y03 fonksiyon sayısı (14 RPC + 8 iç)", fns.length === 22, String(fns.length));
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
  // Sağlayıcı gözlemi: limit verilmezse Owner'ın tanımladığı aylık kota sağlayıcı limiti olarak gözlenir (tutarlı durum).
  const observe = async (remaining, limit) => {
    const q = limit === undefined ? await val(admin, "SELECT provider_monthly_quota FROM public.campaign_settings") : limit;
    return svc.query("SELECT public.campaign_observe_provider('roxy',$1,$2,NULL,false,NULL)", [remaining, q]);
  };
  const authz = async (c, id, credits = 1, endpoint = "x/y", now = null) => (await c.query("SELECT public.campaign_authorize_call($1,$2,$3,$4) r", [id, endpoint, credits, now])).rows[0].r;
  const recordRes = async (c, callId, http, outcome, remaining = null) => (await c.query("SELECT public.campaign_record_provider_call($1,$2,$3,$4,NULL,NULL,NULL) r", [callId, http, outcome, remaining])).rows[0].r;
  const callOk = async (c, id, credits = 1, endpoint = "x/y") => { const a = await authz(c, id, credits, endpoint); if (!a.ok) throw new Error("izin yok: " + JSON.stringify(a)); return recordRes(c, a.call_id, 200, "ok"); };
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
  const zcall = await authz(svc, (await reserve(svc, "kozmik:paket", "9.9.9.3")).reservation_id);
  check("R12 0 kredili rezervasyon için sağlayıcı çağrısı yetkilendirilmez", zcall.ok === false && zcall.reason === "sifir_maliyetli_teknik", JSON.stringify(zcall));

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
  const rlA = await authz(svc, rlRes.reservation_id, 1, "numerology/chart");
  await recordRes(svc, rlA.call_id, 429, "rate_limited", 850);
  const pc = await reserve(svc, "numk:dual", "12.1.1.1");
  check("S07 429 sonrası 10 dk bekleme → reddedilir; kalan kota gözlemi güncellenir", pc.reason === "saglayici_bekleme" && (await val(admin, "SELECT remaining FROM public.campaign_provider_state")) === 850);
  await admin.query("UPDATE public.campaign_provider_state SET cooldown_until = NULL");
  await settings({ provider_monthly_quota: 100000 });
  await observe(90000);


  // ── D3: Owner kotası + sağlayıcının gözlenen aylık limiti → güvenli uzman payı ──
  await resetDay();
  await settings({ provider_monthly_quota: 100000, expert_reserve_pct: 60, provider_quota_mismatch_pct: 5 });
  await admin.query("UPDATE public.campaign_provider_state SET quota_limit = NULL, limit_observed_at = NULL");
  await svc.query("SELECT public.campaign_observe_provider('roxy',90000,NULL,NULL,false,NULL)");
  const d3a = await reserve(svc, "numk:dual", "45.0.0.1");
  check("D3a sağlayıcının aylık limiti bilinmiyor (kalan biliniyor) → ücretli rezervasyon yok (saglayici_kotasi_bilinmiyor)", d3a.reason === "saglayici_kotasi_bilinmiyor", JSON.stringify(d3a));
  await observe(90000, 100000);
  await admin.query("UPDATE public.campaign_provider_state SET limit_observed_at = now() - interval '2 hours'");
  const d3b = await reserve(svc, "numk:dual", "45.0.0.2");
  check("D3b limit gözlemi eski (kalan taze) → ret (fail-closed)", d3b.reason === "saglayici_kotasi_bilinmiyor", JSON.stringify(d3b));
  await settings({ provider_monthly_quota: 1000 });
  await observe(900, 100000);
  const d3c = await reserve(svc, "numk:dual", "45.0.0.3");
  check("D3c Owner kotası çok düşük girilmiş (1.000 ↔ gözlenen 100.000) → saglayici_kotasi_uyusmuyor", d3c.reason === "saglayici_kotasi_uyusmuyor", JSON.stringify(d3c));
  await settings({ provider_monthly_quota: 98000 });
  await observe(59500, 100000);
  const d3d = await reserve(svc, "numk:dual", "45.0.0.4");
  await observe(60100, 100000);
  const d3d2 = await reserve(svc, "numk:dual", "45.0.0.5");
  check("D3d tolerans içinde (98.000 ↔ 100.000): uzman tabanı BÜYÜK kotadan (60.000) — kalan 59.500 ret, 60.100 kabul", d3d.reason === "uzman_payi_korunuyor" && d3d2.ok === true, JSON.stringify({ d3d, d3d2 }));
  await resetDay();
  await settings({ provider_monthly_quota: 100000 });
  await observe(90000, 97000);
  await admin.query("INSERT INTO public.campaign_usage_daily (day_tr, scope, spent_credits) VALUES (date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')::date)::date, 'month', 38799) ON CONFLICT (day_tr, scope) DO UPDATE SET spent_credits = 38799");
  const d3e = await reserve(svc, "numk:dual", "45.0.0.6");
  check("D3e kampanya aylık payı KÜÇÜK kotadan (97.000 × %40 = 38.800): 38.799 harcanmışken 2 kredi → aylik_kampanya_payi_doldu", d3e.reason === "aylik_kampanya_payi_doldu", JSON.stringify(d3e));
  await resetDay();
  await observe(120000, 100000);
  const d3f = await reserve(svc, "numk:dual", "45.0.0.7");
  check("D3f kalan kota > gözlenen limit (tutarsız gözlem) → saglayici_kotasi_uyusmuyor", d3f.reason === "saglayici_kotasi_uyusmuyor", JSON.stringify(d3f));
  await settings({ provider_quota_mismatch_pct: 0 });
  await observe(90000, 99999);
  const d3g = await reserve(svc, "numk:dual", "45.0.0.8");
  const d3gBad = await tryq(svc, "SELECT public.campaign_admin_update_settings($1,$2,'{\"provider_quota_mismatch_pct\":51}'::jsonb)", [OWNER, await val(admin, "SELECT version FROM public.campaign_settings")]);
  const d3gNa = await tryq(svc, "SELECT public.campaign_admin_update_settings($1,$2,'{\"provider_quota_mismatch_pct\":10}'::jsonb)", [ADMIN, await val(admin, "SELECT version FROM public.campaign_settings")]);
  check("D3g tolerans %0 iken 1 kredilik fark bile ret; tolerans > %50 reddedilir (23514); Owner olmayan değiştiremez (42501)", d3g.reason === "saglayici_kotasi_uyusmuyor" && d3gBad.code === "23514" && d3gNa.code === "42501", JSON.stringify({ d3g, b: d3gBad.code, n: d3gNa.code }));
  const d3h = await reserve(svc, "kozmik:paket", "45.0.0.9");
  check("D3h kota uyuşmazlığında 0 kredili Kozmik paketi etkilenmez", d3h.ok === true, JSON.stringify(d3h));
  const res3 = await Promise.all(pool.slice(0, 20).map((c, i) => reserve(c, "numk:dual", `45.1.0.${i}`)));
  check("D3i uyuşmazlık altında 20 eşzamanlı ücretli istek → hepsi ret, kredi rezerve edilmez", res3.every((r) => r.reason === "saglayici_kotasi_uyusmuyor") && (await usage("global")).rc === 0);
  await settings({ provider_quota_mismatch_pct: 5 });
  await resetDay();
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
  await callOk(svc, v1.reservation_id, 1, "astrology/kp/planets");
  await callOk(svc, v1.reservation_id, 1, "astrology/kp/planets");
  const v1s = await settle(svc, v1.reservation_id, "completed", 1);
  const uv = await usage(`tech:${C1}:atlas:kp.transit`);
  check("C02 değişken maliyet (azami 15): 15 rezerve, defterde 2 çağrı → bildirilen 1 olsa bile 2 harcanır, 13 serbest", v1.max_credits === 15 && v1s.spent_credits === 2 && uv.rc === 0 && uv.sc === 2, JSON.stringify({ v1s, uv }));

  const ch = await reserve(svc, "numk:dual", "32.0.0.1");
  const chs = await settle(svc, ch.reservation_id, "cache_hit");
  const uch = await usage(`tech:${C1}:numk:dual`);
  check("C03 kesin önbellek isabeti: kredi serbest (0 harcanır), analiz kullanıldı sayılır", chs.spent_credits === 0 && chs.state === "completed" && uch.rc === 0, JSON.stringify(chs));
  const ch2 = await reserve(svc, "numk:dual", "32.0.0.2");
  await callOk(svc, ch2.reservation_id, 1, "numerology/chart");
  const ch2s = await settle(svc, ch2.reservation_id, "cache_hit");
  check("C04 defterde çağrı varken 'cache_hit' bildirimi ücretsiz sayılmaz", ch2s.outcome === "completed" && ch2s.spent_credits === 1, JSON.stringify(ch2s));

  const to = await reserve(svc, "numk:dual", "33.0.0.1");
  const toA = await authz(svc, to.reservation_id, 1, "numerology/chart");
  await recordRes(svc, toA.call_id, null, "timeout");
  const toPending = await authz(svc, to.reservation_id, 1, "numerology/chart");
  const tos = await settle(svc, to.reservation_id, "aborted_no_call");
  check("C05 sağlayıcı zaman aşımı + sonucu yazılmamış (pending) izin: 'aborted_no_call' bildirilse de failed_after_call ve iki izin de harcanmış (2)", toPending.ok === true && tos.outcome === "failed_after_call" && tos.spent_credits === 2, JSON.stringify(tos));
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
  check("C08 aynı rezervasyonu ikinci kez kapatma bütçeyi değiştirmez (replay)", twiceS.replay === true && uch2.sc === uch.sc + 1 + 2 + 1, JSON.stringify({ twiceS, uch, uch2 }));
  const late = await authz(svc, ch.reservation_id);
  const doubleRec = await recordRes(svc, toA.call_id, 200, "ok");
  check("C09 kapanmış rezervasyon için çağrı yetkilendirilmez; aynı çağrı sonucu iki kez yazılamaz", late.reason === "rezervasyon_kapali" && doubleRec.reason === "cagri_yok_veya_sonuclandi", JSON.stringify({ late, doubleRec }));

  // ── İdempotency ──
  const K = key();
  const i1 = await reserve(svc, "numk:dual", "40.0.0.1", { key: K });
  const ub = await usage(`tech:${C1}:numk:dual`);
  const i2 = await reserve(svc, "numk:dual", "40.0.0.1", { key: K });
  const ua = await usage(`tech:${C1}:numk:dual`);
  check("I01 süren isteğin tekrarı → ok:false 'istek_suruyor' (YENİ izin yok), aynı rezervasyon, bütçe değişmez", i1.ok === true && i2.ok === false && i2.reason === "istek_suruyor" && i2.state === "reserved" && i2.reservation_id === i1.reservation_id && ua.ra === ub.ra && ua.rc === ub.rc, JSON.stringify(i2));
  const i3 = await reserve(svc, "hd:bodygraph", "40.0.0.1", { key: K });
  check("I02 aynı anahtar farklı teknik → idempotency_cakismasi", i3.reason === "idempotency_cakismasi");
  const K2 = key();
  const ipar = await Promise.all(pool.slice(0, 20).map((c) => reserve(c, "numk:dual", "41.0.0.1", { key: K2 })));
  const cnt = await val(admin, "SELECT count(*)::int FROM public.campaign_reservations WHERE idempotency_key=$1", [K2]);
  check("I03 aynı anahtarla 20 eşzamanlı istek → tek rezervasyon, tam 1 izin, 19 'istek_suruyor'", cnt === 1 && ipar.filter((r) => r.ok).length === 1 && ipar.filter((r) => r.reason === "istek_suruyor").length === 19 && new Set(ipar.map((r) => r.reservation_id)).size === 1);
  const bad = await reserve(svc, "numk:dual", "x", { key: "kisa" });
  check("I04 geçersiz istek kimliği reddedilir", bad.reason === "gecersiz_istek");


  // ── Y1: tekrar hiçbir koşulda yeni izin vermez (F1 / F2) ──
  await resetDay();
  const KF = key();
  const f0 = await reserve(svc, "numk:dual", "42.0.0.1", { key: KF });
  await setStatus(C1, "kapali");
  const f1 = await reserve(svc, "numk:dual", "42.0.0.1", { key: KF });
  const f1a = await authz(svc, f0.reservation_id, 1, "numerology/chart");
  check("F1 kampanya KAPALI iken aynı kimlikle tekrar → ok:false; açık rezervasyon için de çağrı izni yok (kampanya_kapali)", f0.ok && f1.ok === false && f1.reason === "istek_suruyor" && f1a.ok === false && f1a.reason === "kampanya_kapali", JSON.stringify({ f1, f1a }));
  await setStatus(C1, "aktif");
  await admin.query("UPDATE public.campaign_provider_state SET observed_at = now() - interval '2 hours'");
  const f2new = await reserve(svc, "numk:dual", "42.0.0.2");
  const f2 = await reserve(svc, "numk:dual", "42.0.0.1", { key: KF });
  check("F2 sağlayıcı durumu bilinmiyorken yeni istek de tekrar da ok:false", f2new.ok === false && f2new.reason === "saglayici_durumu_bilinmiyor" && f2.ok === false, JSON.stringify({ f2new, f2 }));
  await observe(90000);
  await settle(svc, f0.reservation_id, "completed", 2);
  const f3 = await reserve(svc, "numk:dual", "42.0.0.1", { key: KF });
  check("I05 tamamlanmış isteğin tekrarı → ok:false 'istek_tamamlandi' (state=completed)", f3.ok === false && f3.reason === "istek_tamamlandi" && f3.state === "completed", JSON.stringify(f3));
  const KR = key();
  const r0 = await reserve(svc, "kozmik:paket", "42.0.0.3", { key: KR });
  await settle(svc, r0.reservation_id, "aborted_no_call");
  const r0b = await reserve(svc, "kozmik:paket", "42.0.0.3", { key: KR });
  check("I06 iptal edilmiş (released) isteğin tekrarı → ok:false 'onceki_istek_sonlandi'", r0b.ok === false && r0b.reason === "onceki_istek_sonlandi" && r0b.state === "released", JSON.stringify(r0b));
  const KD = key();
  await settings({ global_daily_credit_budget: 0 });
  const d0 = await reserve(svc, "numk:dual", "42.0.0.4", { key: KD });
  await settings({ global_daily_credit_budget: 100000 });
  const d1 = await reserve(svc, "numk:dual", "42.0.0.4", { key: KD });
  check("I07 reddedilmiş istek (satır yok) tekrarında normal değerlendirilir; reddin nedeni ayrı (genel_kredi_doldu)", d0.ok === false && d0.reason === "genel_kredi_doldu" && d0.replay === undefined && d1.ok === true, JSON.stringify({ d0, d1 }));

  // ── O1: çağrı öncesi yetkilendirme ve rezervasyon kredi tavanı (F5b) ──
  const o1 = await reserve(svc, "numk:dual", "43.0.0.1");
  const o1a = await authz(svc, o1.reservation_id, 1);
  const o1b = await authz(svc, o1.reservation_id, 1);
  const o1c = await authz(svc, o1.reservation_id, 1);
  const o1big = await authz(svc, (await reserve(svc, "numk:dual", "43.0.0.2")).reservation_id, 3);
  check("F5b azami 2 kredilik rezervasyona 1+1 izin, 3. izin ve tek seferde 3 kredi reddedilir (rezervasyon_kredi_tavani)", o1a.ok && o1b.ok && o1c.reason === "rezervasyon_kredi_tavani" && o1big.reason === "rezervasyon_kredi_tavani", JSON.stringify({ o1c, o1big }));
  const o1s = await settle(svc, o1.reservation_id, "completed", 50);
  check("O1a kapanışta bildirilen 50 kredi azami krediyle (2) sınırlanır", o1s.spent_credits === 2, JSON.stringify(o1s));
  const race = await reserve(svc, "numk:person_all", "43.0.0.3");
  const ra = await Promise.all(pool.slice(0, 30).map((c) => authz(c, race.reservation_id, 1)));
  const ledger = await val(admin, "SELECT coalesce(sum(credits),0)::int FROM public.campaign_provider_calls WHERE reservation_id=$1", [race.reservation_id]);
  check("O1b aynı rezervasyon (azami 5) için 30 eşzamanlı izin → tam 5 izin, defter 5", ra.filter((x) => x.ok).length === 5 && ra.filter((x) => x.reason === "rezervasyon_kredi_tavani").length === 25 && ledger === 5, `ok=${ra.filter((x) => x.ok).length} defter=${ledger}`);
  await settle(svc, race.reservation_id, "completed", 5);
  const TL = (o = {}) => [T("hd:bodygraph", { daily_analysis_limit: 10 }), T("numk:dual", { max_credit_per_analysis: 2, ...o }), T("numk:person_all", { max_credit_per_analysis: 5 }), T("atlas:kp.transit", { max_credit_per_analysis: 15 }), T("kozmik:paket", { max_credit_per_analysis: 0, daily_credit_budget: 0, ip_daily_limit: 3, daily_analysis_limit: 50 }), T("atlas:horary.lilly", { max_credit_per_analysis: 0, daily_credit_budget: 0 })];
  await resetDay();
  await setTech(C1, TL({ daily_credit_budget: 2 }));
  const ob = await reserve(svc, "numk:dual", "43.0.0.4");
  const obA = await authz(svc, ob.reservation_id, 2);
  const obS = await settle(svc, ob.reservation_id, "completed", 9);
  const obU = await usage(`tech:${C1}:numk:dual`);
  const ob2 = await reserve(svc, "numk:dual", "43.0.0.5");
  check("O1c rezervasyon üstü harcama bütçeyi aşamaz: bütçe 2 → harcanan 2, sonraki istek teknik_kredi_doldu", obA.ok && obS.spent_credits === 2 && obU.sc === 2 && ob2.reason === "teknik_kredi_doldu", JSON.stringify({ obS, obU, ob2 }));
  await setTech(C1, TL());
  const clk2 = await newClient("service_role", { clock: true });
  const ox = await reserve(svc, "numk:dual", "43.0.0.6");
  const oxA = await clk2.query("SELECT public.campaign_authorize_call($1,'x',1, now() + interval '11 minutes') r", [ox.reservation_id]).then((x) => x.rows[0].r);
  await settings({ kill_switch: true });
  const okill = await authz(svc, ox.reservation_id, 1);
  await settings({ kill_switch: false });
  await admin.query("UPDATE public.campaign_provider_state SET cooldown_until = now() + interval '5 minutes'");
  const ocool = await authz(svc, ox.reservation_id, 1);
  await admin.query("UPDATE public.campaign_provider_state SET cooldown_until = NULL");
  check("O1d süresi dolmuş / acil anahtar / 429 beklemesi altında çağrı izni yok", oxA.reason === "rezervasyon_suresi_doldu" && okill.reason === "kampanya_kapali" && ocool.reason === "saglayici_bekleme", JSON.stringify({ oxA, okill, ocool }));
  const directIns = await tryq(svc, "INSERT INTO public.campaign_provider_calls (reservation_id, provider, endpoint, outcome, credits) VALUES ($1,'roxy','x','ok',1)", [ox.reservation_id]);
  check("O1e defter yalnız yetkilendirme RPC'siyle yazılır (service_role doğrudan ekleyemez)", directIns.code === "42501", directIns.code);
  const badEp = [];
  for (const ep of ["../evil", "/abs", ".x"]) badEp.push(await authz(svc, ox.reservation_id, 1, ep));
  check("O1f defter uç etiketinde yol atlama / mutlak yol reddedilir", badEp.every((x) => x.reason === "gecersiz_istek"), JSON.stringify(badEp));

  // ── O2 / D1: CTA hedefi ve görsel yolu izin listesi (F6) ──
  const badCta = ["javascript:alert", "data:text", "https://evil.example", "//evil.example", "../x", "register/../x", "bolum?x=1", "Atlas:western.natal", "evil:western.natal"];
  const ctaRes = [];
  for (const v of badCta) ctaRes.push((await tryq(svc, "SELECT public.campaign_admin_save($1,$2,$3,$4::jsonb)", [OWNER, C1, await ver(C1), JSON.stringify({ cta_target: v })])).code);
  check("F6 CTA: javascript:, data:, dış adres, //, yol atlama, sorgu, büyük harf, bilinmeyen modül → 23514", ctaRes.every((c) => c === "23514"), ctaRes.join(","));
  const goodCta = [];
  for (const v of ["bolum", "register", "atlas:western.natal", "numk:person_all", "atlas:kp.ruling_interval"]) goodCta.push((await tryq(svc, "SELECT public.campaign_admin_save($1,$2,$3,$4::jsonb)", [OWNER, C1, await ver(C1), JSON.stringify({ cta_target: v })])).ok);
  check("F6b CTA izinli hedefler (bolum, register, modül:teknik) kabul edilir", goodCta.every(Boolean), goodCta.join(","));
  const badImg = ["../a.webp", "/a.webp", "http://x/a.png", "assets/../a.webp", "assets/a.svg", "campaign/.hidden.png", "assets/a.webp?x", "assets//a.webp", "javascript:a.png"];
  const imgRes = [];
  for (const v of badImg) imgRes.push((await tryq(svc, "SELECT public.campaign_admin_save($1,$2,$3,$4::jsonb)", [OWNER, C1, await ver(C1), JSON.stringify({ image_ref: v })])).code);
  check("D1 görsel yolu: yol atlama, mutlak yol, şema, svg, gizli dosya, sorgu, boş bölüm → 23514", imgRes.every((c) => c === "23514"), imgRes.join(","));
  const goodImg = [];
  for (const v of ["assets/hero-manzara.webp", "campaign/2026/k1.png", null]) goodImg.push((await tryq(svc, "SELECT public.campaign_admin_save($1,$2,$3,$4::jsonb)", [OWNER, C1, await ver(C1), JSON.stringify({ image_ref: v })])).ok);
  check("D1b izinli görsel yolları (assets/, campaign/, boş) kabul edilir", goodImg.every(Boolean), goodImg.join(","));

  // ── O3: gerçek yorum izni = modül ana anahtarı VE teknik anahtarı (F7) ──
  await setTech(C1, TL({ comments_enabled: true }));
  await save(svc, OWNER, C1, await ver(C1), { module_comments: { numk: false } });
  const c1r = await reserve(svc, "numk:dual", "44.0.0.1");
  await save(svc, OWNER, C1, await ver(C1), { module_comments: { numk: true } });
  const c2r = await reserve(svc, "numk:dual", "44.0.0.2");
  await setTech(C1, TL({ comments_enabled: false }));
  const c3r = await reserve(svc, "numk:dual", "44.0.0.3");
  await save(svc, OWNER, C1, await ver(C1), { module_comments: {} });
  await setTech(C1, TL({ comments_enabled: true }));
  const c4r = await reserve(svc, "numk:dual", "44.0.0.4");
  check("F7 yorum: modül kapalı + teknik açık → false; ikisi açık → true; modül açık + teknik kapalı → false; modül tanımsız → false", c1r.comments_enabled === false && c2r.comments_enabled === true && c3r.comments_enabled === false && c4r.comments_enabled === false, JSON.stringify([c1r.comments_enabled, c2r.comments_enabled, c3r.comments_enabled, c4r.comments_enabled]));
  await setTech(C1, TL());

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
