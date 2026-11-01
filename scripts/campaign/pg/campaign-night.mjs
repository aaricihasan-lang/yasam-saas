// KAMPANYA MERKEZİ — gece operasyonu (02.11.2026) GERÇEK PostgreSQL doğrulaması. YALNIZ yerel geçici embedded-postgres;
// production / uzak DB YOK; sağlayıcı çağrısı YOK; sentetik veriler.
// Kapsam: 5 migration 2× idempotent; 120 eşzamanlı ücretli rezervasyon kredi bütçesini AŞMAZ; aynı IP'den 120 eşzamanlı istek
// günlük IP hakkını aşmaz; aynı idempotency anahtarıyla 50 eşzamanlı istek tek rezervasyon; kampanya gün içinde kapanınca
// açık rezervasyona yeni sağlayıcı çağrısı yetkisi YOK; zaman aşımı kredisi iade EDİLMEZ; sağlayıcıya gidilmeden hata iade
// edilir; yarım rezervasyon bakımı idempotent; teknik limiti düşürülünce yeni rezervasyon yok; Türkiye günü sınırı (21:00Z);
// 000400 olay sayaçları (doğrulama, kapalı kampanya, teknik, UTM, tekil özet, 100 eşzamanlı artış, saklama, yetki).
// Çalıştırma: node scripts/campaign/pg/campaign-night.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG_FILES = [
  "20271229000000_campaign_center_core.sql",
  "20271229000100_campaign_center_quota_rpc.sql",
  "20271229000200_campaign_center_admin_ui.sql",
  "20271229000300_campaign_provider_usage_gap.sql",
  "20271229000400_campaign_event_stats.sql",
];
const MIGS = MIG_FILES.map((f) => fs.readFileSync(path.join(REPO, "supabase/migrations", f), "utf8"));
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS public.users (id uuid PRIMARY KEY, role text, active boolean, is_super_admin boolean NOT NULL DEFAULT false,
  is_demo_account boolean NOT NULL DEFAULT false, tenant_id uuid);`;
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";

const watchdog = setTimeout(() => {
  console.error("FAIL campaign-night: 8 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 8 * 60_000);
watchdog.unref();

async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 53000 + Math.floor(Math.random() * 2500);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-night-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", "max_connections=160"], onLog: () => {}, onError: () => {} });
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
async function tryq(c, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, code: e.code, msg: String(e.message) };
  }
}
const val = async (c, sql, params = []) => Object.values((await c.query(sql, params)).rows[0])[0];
const rid = () => crypto.randomUUID();
const idem = () => crypto.randomBytes(18).toString("base64url");
const hex = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const nocomment = (s) => s.replace(/--[^\n]*/g, "");
/** N paralel bağlantıda aynı anda çalıştır (her biri kendi oturumu). */
async function parallel(n, fn) {
  const clients = await Promise.all(Array.from({ length: n }, () => newClient("service_role", { clock: true })));
  try {
    return await Promise.all(clients.map((cl, i) => fn(cl, i)));
  } finally {
    await Promise.all(clients.map(async (cl) => { try { await cl.end(); } catch { /* */ } opened.delete(cl); }));
  }
}

await server.initialise();
await server.start();
try {
  const admin = await newClient();
  await admin.query(BOOT);
  await admin.query("INSERT INTO public.users (id, role, active, is_super_admin, is_demo_account) VALUES ($1,'admin',true,true,false)", [OWNER]);
  for (const m of MIGS) await admin.query(m);
  let twice = true;
  try {
    for (const m of MIGS) await admin.query(m);
  } catch (e) {
    twice = false;
    console.log(String(e.message));
  }
  check("V01 beş migration da iki kez çalışır (idempotent)", twice);
  check("V02 000400: DROP / TRUNCATE yok; mevcut kota RPC'leri yeniden tanımlanmaz", !/\bDROP\s+(TABLE|COLUMN|INDEX|FUNCTION)\b|\bTRUNCATE\b/i.test(nocomment(MIGS[4])) && !/FUNCTION public\.campaign_(reserve|authorize_call|settle|record_provider_call|observe_[a-z]+)\b/.test(MIGS[4]));

  const svc = await newClient("service_role", { clock: true });
  const NOW = new Date("2026-11-10T09:00:00Z");
  const at = (min) => new Date(NOW.getTime() + min * 60_000).toISOString();
  const sv = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv, JSON.stringify({ global_daily_credit_budget: 1000, provider_monthly_quota: 50000, expert_reserve_pct: 10 })]);
  await svc.query("SELECT public.campaign_observe_usage($1,40000,40000,50000,NULL,$2)", [OWNER, NOW.toISOString()]);
  const c = (await svc.query("SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, rid(), JSON.stringify({ name: "Gece", undated: true })])).rows[0].r;
  const T = (key, ip, daily, credit, max) => ({ technique_key: key, enabled: true, ip_daily_limit: ip, daily_analysis_limit: daily, daily_credit_budget: credit, max_credit_per_analysis: max, comments_enabled: false });
  let ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, c.version, JSON.stringify([T("hd:bodygraph", 5, 500, 40, 1), T("numb:analysis", 3, 1000, 0, 0), T("numk:names", 5, 100, 30, 3)])])).rows[0].r.version;
  ver = (await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3) r", [OWNER, c.id, ver])).rows[0].r.version;
  const reserve = (cl, tech, ip, now, key = idem(), browser = null) => tryq(cl, "SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [key, tech, hex(ip), browser, now]).then((x) => (x.ok ? x.rows[0].r : { ok: false, reason: `sql:${x.code}` }));

  // ── Sağlayıcı dakika sınırı (varsayılan): 120 eşzamanlı ücretli istekte sınır kadar izin ──
  const minuteLimit = await val(admin, "SELECT provider_minute_limit FROM public.campaign_settings");
  const cc0 = await parallel(120, (cl, i) => reserve(cl, "hd:bodygraph", `10.9.${i >> 8}.${i & 255}`, at(0)));
  const ok0 = cc0.filter((x) => x.ok).length;
  check(`C00 120 eşzamanlı ücretli istek → en çok dakika sınırı (${minuteLimit}) kadar izin, gerisi saglayici_dakika_siniri`, ok0 === Math.min(minuteLimit, 40) && cc0.filter((x) => !x.ok).every((x) => x.reason === "saglayici_dakika_siniri"), `ok=${ok0} ${JSON.stringify([...new Set(cc0.map((x) => x.reason))])}`);
  // Bu rezervasyonları sağlayıcıya gitmeden kapat (kredi iade) ve dakika sınırını yükselt → kredi bütçesini sına.
  for (const x of cc0.filter((y) => y.ok)) await svc.query("SELECT public.campaign_settle($1,'aborted_no_call',0,$2)", [x.reservation_id, at(0)]);
  const sv2 = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv2, JSON.stringify({ provider_minute_limit: 10000 })]);
  // ── 120 eşzamanlı ücretli rezervasyon (farklı IP) → teknik kredi bütçesi 40 AŞILMAZ ──
  const cc1 = await parallel(120, (cl, i) => reserve(cl, "hd:bodygraph", `10.0.${i >> 8}.${i & 255}`, at(1)));
  const ok1 = cc1.filter((x) => x.ok).length;
  const credits1 = await val(admin, "SELECT coalesce(sum(max_credits),0)::int FROM public.campaign_reservations WHERE technique_key='hd:bodygraph' AND state='reserved'");
  check("C01 120 eşzamanlı ücretli rezervasyon → tam 40 izin (teknik kredi bütçesi), ayrılan kredi 40, SQL hatası yok", ok1 === 40 && credits1 === 40 && cc1.every((x) => !String(x.reason ?? "").startsWith("sql:")), `ok=${ok1} kredi=${credits1} ${JSON.stringify(cc1.find((x) => !x.ok))}`);
  // ── Aynı IP'den 120 eşzamanlı (yerel teknik) → IP günlük hakkı 3 AŞILMAZ ──
  const cc2 = await parallel(120, (cl) => reserve(cl, "numb:analysis", "203.0.113.50", at(2)));
  const ok2 = cc2.filter((x) => x.ok).length;
  check("C02 aynı IP'den 120 eşzamanlı istek → tam 3 izin (IP günlük hakkı), gerisi ip_hakki_doldu", ok2 === 3 && cc2.filter((x) => x.reason === "ip_hakki_doldu").length === 117, `ok=${ok2} ${JSON.stringify([...new Set(cc2.map((x) => x.reason))])}`);
  // ── Aynı idempotency anahtarı 50 eşzamanlı → tek rezervasyon ──
  const sameKey = idem();
  const cc3 = await parallel(50, (cl, i) => reserve(cl, "numb:analysis", `198.51.100.${i}`, at(3), sameKey));
  const rows3 = await val(admin, "SELECT count(*)::int FROM public.campaign_reservations WHERE idempotency_key=$1", [sameKey]);
  check("C03 aynı istek kimliğiyle 50 eşzamanlı istek → TEK rezervasyon (diğerleri tekrar / sürüyor)", rows3 === 1 && cc3.filter((x) => x.ok && !x.replay).length <= 1, `satır=${rows3} ${JSON.stringify([...new Set(cc3.map((x) => x.reason ?? (x.replay ? "replay" : "ok")))])}`);

  // ── Ücretli rezervasyon yaşam döngüsü ──
  // Açık ücretli rezervasyonları kapat (bütçe dolu) → yeni bütçe ile ayrı teknik: numk:names (azami 3 kredi)
  const r1 = await reserve(svc, "numk:names", "192.0.2.1", at(5));
  check("L01 çok kredili teknik rezervasyonu (azami 3)", r1.ok === true && r1.max_credits === 3, JSON.stringify(r1));
  const auth = (res, n = 1, now = at(6)) => svc.query("SELECT public.campaign_authorize_call($1,'numerology/dual',$2,$3) r", [res, n, now]).then((x) => x.rows[0].r);
  const a1 = await auth(r1.reservation_id);
  await svc.query("SELECT public.campaign_record_provider_call($1,NULL,'timeout',NULL,NULL,NULL,$2)", [a1.call_id, at(6)]);
  const spentBefore = await val(admin, "SELECT coalesce(spent_credits,0)::int FROM public.campaign_usage_daily WHERE scope='global' AND day_tr='2026-11-10'");
  await svc.query("SELECT public.campaign_settle($1,'failed_after_call',0,$2)", [r1.reservation_id, at(7)]);
  const st1 = (await admin.query("SELECT state, spent_credits FROM public.campaign_reservations WHERE id=$1", [r1.reservation_id])).rows[0];
  const spentAfter = await val(admin, "SELECT coalesce(spent_credits,0)::int FROM public.campaign_usage_daily WHERE scope='global' AND day_tr='2026-11-10'");
  check("L02 zaman aşımı (sağlayıcı yanıtı yok) kredisi İADE EDİLMEZ (harcanan ≥ 1, istemci 0 bildirse bile)", st1.spent_credits >= 1 && spentAfter - spentBefore >= 1, JSON.stringify({ st1, spentBefore, spentAfter }));
  const a1b = await auth(r1.reservation_id, 1, at(8));
  check("L03 sonuçlandırılmış rezervasyona ikinci sağlayıcı çağrısı yetkisi YOK (yeniden deneme ikinci ücretli çağrı yapamaz)", a1b.ok === false && a1b.reason === "rezervasyon_kapali", JSON.stringify(a1b));
  const r2 = await reserve(svc, "numk:names", "192.0.2.2", at(9));
  const reservedBefore = await val(admin, "SELECT reserved_credits::int FROM public.campaign_usage_daily WHERE scope='global' AND day_tr='2026-11-10'");
  await svc.query("SELECT public.campaign_settle($1,'aborted_no_call',0,$2)", [r2.reservation_id, at(10)]);
  const reservedAfter = await val(admin, "SELECT reserved_credits::int FROM public.campaign_usage_daily WHERE scope='global' AND day_tr='2026-11-10'");
  const st2 = (await admin.query("SELECT spent_credits FROM public.campaign_reservations WHERE id=$1", [r2.reservation_id])).rows[0];
  check("L04 sağlayıcıya hiç gidilmeden hata → kredi iade (harcanan 0, ayrılan geri)", st2.spent_credits === 0 && reservedBefore - reservedAfter === 3, JSON.stringify({ st2, reservedBefore, reservedAfter }));
  const r3 = await reserve(svc, "numk:names", "192.0.2.3", at(11));
  const fakeAuth = await tryq(svc, "SELECT public.campaign_authorize_call($1,'numerology/dual',4,$2) r", [r3.reservation_id, at(11)]);
  check("L05 rezervasyon azamisinin (3) üstünde kredi yetkisi YOK", fakeAuth.ok && fakeAuth.rows[0].r.ok === false && fakeAuth.rows[0].r.reason === "rezervasyon_kredi_tavani");
  // ── Kampanya gün içinde kapanınca ──
  ver = (await svc.query("SELECT public.campaign_admin_set_status($1,$2,'kapali',$3) r", [OWNER, c.id, ver])).rows[0].r.version;
  const a3 = await auth(r3.reservation_id, 1, at(12));
  const r4 = await reserve(svc, "numb:analysis", "192.0.2.4", at(12));
  check("K01 kampanya kapanınca açık rezervasyona yeni sağlayıcı çağrısı yetkisi YOK", a3.ok === false && a3.reason === "kampanya_kapali", JSON.stringify(a3));
  check("K02 kampanya kapanınca yeni rezervasyon YOK", r4.ok === false, JSON.stringify(r4));
  ver = (await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3) r", [OWNER, c.id, ver])).rows[0].r.version;
  // ── Yarım rezervasyon bakımı (idempotent) ──
  const ttl = await val(admin, "SELECT reservation_ttl_seconds FROM public.campaign_settings");
  const late = new Date(NOW.getTime() + 11 * 60_000 + (ttl + 5) * 1000).toISOString();
  const e1 = await val(svc, "SELECT public.campaign_expire_stale($1, 5000)", [late]);
  const e2 = await val(svc, "SELECT public.campaign_expire_stale($1, 5000)", [late]);
  const st3 = (await admin.query("SELECT state, spent_credits FROM public.campaign_reservations WHERE id=$1", [r3.reservation_id])).rows[0];
  check("M01 süresi dolan yarım rezervasyonlar kapatılır; ikinci çalıştırma 0 (idempotent)", e1 >= 1 && e2 === 0 && st3.state === "expired", JSON.stringify({ e1, e2, st3 }));
  check("M02 süresi dolan rezervasyon harcandı sayılır (fail-closed; kredi iadesi yok)", st3.spent_credits >= 1, JSON.stringify(st3));
  // ── Teknik limiti gün içinde düşürülür ──
  const used = await val(admin, `SELECT (used_analyses + reserved_analyses)::int FROM public.campaign_usage_daily WHERE scope = 'tech:' || $1 || ':numb:analysis' AND day_tr='2026-11-10'`, [c.id]);
  ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, ver, JSON.stringify([T("hd:bodygraph", 5, 500, 40, 1), T("numb:analysis", 3, used, 0, 0), T("numk:names", 5, 100, 30, 3)])])).rows[0].r.version;
  const r5 = await reserve(svc, "numb:analysis", "192.0.2.5", at(20));
  check("K03 teknik günlük limiti kullanılan sayıya düşürülünce yeni rezervasyon YOK", r5.ok === false && /kontenjan/.test(r5.reason), JSON.stringify({ used, r5 }));
  ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, ver, JSON.stringify([T("hd:bodygraph", 5, 500, 40, 1), T("numb:analysis", 3, 1000, 0, 0), T("numk:names", 5, 100, 30, 3)])])).rows[0].r.version;
  // ── Türkiye günü sınırı (UTC 21:00 = TR 00:00) ──
  const before = await reserve(svc, "numb:analysis", "192.0.2.6", "2026-11-10T20:59:59Z");
  const after = await reserve(svc, "numb:analysis", "192.0.2.6", "2026-11-10T21:00:00Z");
  check("D01 20:59:59Z → TR günü 10.11, 21:00:00Z → 11.11 (IP hakkı yeni günde sıfırlanır)", before.day_tr === "2026-11-10" && after.day_tr === "2026-11-11", JSON.stringify({ before, after }));

  // ── 000400 olay sayaçları ──
  const ev = (cl, e, opts = {}) => tryq(cl, "SELECT public.campaign_record_event($1,$2,$3,$4,$5,$6) r", [opts.campaign ?? c.id, e, opts.tech ?? null, opts.utm ?? null, opts.hash ?? null, opts.now ?? at(30)]).then((x) => (x.ok ? x.rows[0].r : { ok: false, reason: `sql:${x.code}` }));
  const e01 = await ev(svc, "sayfa", { utm: "Instagram" });
  const cnt = (e, utm = "") => val(admin, "SELECT coalesce(sum(count),0)::int FROM public.campaign_event_daily WHERE campaign_id=$1 AND event=$2 AND utm_source=$3", [c.id, e, utm]);
  check("E01 sayfa olayı sayılır, UTM küçük harfe çevrilir", e01.ok === true && (await cnt("sayfa", "instagram")) === 1, JSON.stringify(e01));
  check("E02 bilinmeyen olay / bozuk UTM / bozuk özet reddedilir", (await ev(svc, "hack")).ok === false && (await ev(svc, "sayfa", { utm: "a b<script>" })).ok === false && (await ev(svc, "sayfa", { hash: "xyz" })).ok === false);
  check("E03 kampanyada açık olmayan teknik için olay reddedilir", (await ev(svc, "rapor_indir", { tech: "hd:variables" })).ok === false && (await ev(svc, "rapor_indir", { tech: "hd:bodygraph" })).ok === true);
  const h = hex("onayli-tarayici");
  const u1 = await ev(svc, "sayfa", { hash: h });
  const u2 = await ev(svc, "sayfa", { hash: h });
  const uniq = await val(admin, "SELECT count(*)::int FROM public.campaign_event_uniques WHERE campaign_id=$1", [c.id]);
  check("E04 aynı gün aynı onaylı özet → tek tekil, sayfa sayacı 2 artar", u1.new_unique === true && u2.new_unique === false && uniq === 1);
  await parallel(100, (cl) => ev(cl, "uyelik_tikla", { utm: "yarisma" }));
  check("E05 100 eşzamanlı olay → sayaç tam 100 (kayıp / çift yok)", (await cnt("uyelik_tikla", "yarisma")) === 100);
  const tr1 = await ev(svc, "sayfa", { now: "2026-11-10T20:59:59Z", utm: "sinir" });
  const tr2 = await ev(svc, "sayfa", { now: "2026-11-10T21:00:00Z", utm: "sinir" });
  check("E06 olay günü Türkiye saatine göre (21:00Z → ertesi gün)", tr1.day_tr === "2026-11-10" && tr2.day_tr === "2026-11-11", JSON.stringify({ tr1, tr2 }));
  const uc = (await svc.query("SELECT public.campaign_event_unique_counts('2026-11-01','2026-11-30') r")).rows[0].r;
  check("E07 panel tekil sayımı yalnız sayı döner (özet dönmez)", Array.isArray(uc) && uc.length === 1 && uc[0].uniques === 1 && !JSON.stringify(uc).includes(h));
  await ev(svc, "sayfa", { hash: hex("eski"), now: "2026-07-01T09:00:00Z" });
  const pr = (await svc.query("SELECT public.campaign_purge_event_subjects(90,$1) r", [at(30)])).rows[0].r;
  const left = await val(admin, "SELECT count(*)::int FROM public.campaign_event_uniques");
  check("E08 saklama: 90 günden eski tekil özet silinir, yenisi kalır; toplu sayaç kalır", pr.ok === true && pr.deleted === 1 && left === 1 && (await val(admin, "SELECT count(*)::int FROM public.campaign_event_daily WHERE day_tr='2026-07-01'")) === 1, JSON.stringify(pr));
  check("E09 saklama gün sınırı dışı değer reddedilir", (await svc.query("SELECT public.campaign_purge_event_subjects(0,NULL) r")).rows[0].r.ok === false);
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'kapali',$3) r", [OWNER, c.id, ver]);
  check("E10 kapalı kampanyaya olay yazılmaz", (await ev(svc, "sayfa")).ok === false);
  for (const role of ["anon", "authenticated"]) {
    const cl = await newClient(role);
    const a = await tryq(cl, "SELECT public.campaign_record_event($1,'sayfa',NULL,NULL,NULL,NULL)", [c.id]);
    const b = await tryq(cl, "SELECT public.campaign_purge_event_subjects(1,NULL)");
    const d = await tryq(cl, "SELECT * FROM public.campaign_event_daily");
    check(`G01 ${role} olay RPC'lerini çalıştıramaz ve tabloları okuyamaz`, a.code === "42501" && b.code === "42501" && d.code === "42501", `${a.code}/${b.code}/${d.code}`);
  }
  const ins = await tryq(svc, "INSERT INTO public.campaign_event_daily (day_tr, campaign_id, event, count) VALUES ('2026-11-10',$1,'sayfa',999)", [c.id]);
  check("G02 service_role olay tablosuna doğrudan yazamaz (yalnız RPC)", ins.code === "42501");
  const defs = (await admin.query("SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('campaign_record_event','campaign_purge_event_subjects','campaign_event_unique_counts')")).rows;
  check("G03 yeni RPC'ler SECURITY DEFINER + sabit search_path", defs.length === 3 && defs.every((x) => x.prosecdef && (x.proconfig ?? []).includes("search_path=pg_catalog, public, pg_temp")));
  const rls = (await admin.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('campaign_event_daily','campaign_event_uniques')")).rows;
  check("G04 olay tablolarında RLS açık", rls.length === 2 && rls.every((x) => x.relrowsecurity));
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
console.log(`\ncampaign-night: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
