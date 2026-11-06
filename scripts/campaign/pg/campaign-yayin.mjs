// KAMPANYA MERKEZİ — YAYIN AKŞAMI 03.11.2026 GERÇEK PostgreSQL testi. YALNIZ yerel geçici embedded-postgres;
// production YOK; sağlayıcı çağrısı YOK; sentetik veriler. Ayarlar production'un 03.11 15:36Z salt okunur kopyası:
// ortak günlük bütçe 300, aylık plan 50.000, uzman payı %60, dakika sınırı 30, sağlayıcı bilgisi geçerliliği 21600 sn;
// önerilen yayın seçimi: hd:bodygraph + numk:core (IP/gün 4, 300/300/1), atlas:western.natal + western.transit (IP/gün 4,
// 30/30/1), numb:analysis/timing/place (IP/gün 10, 0 kredi); Sinastri ve numb:relation (2 kişi) KAPALI.
// Kapsam: kapalı teknik reddi; 6 saatlik tazelik; ortak 300 kredi hiçbir eşzamanlılıkta aşılmaz; dakika sınırı; IP/gün teknik
// bazında; aynı IP'de 5. kişi; uzman payı; yerel teknik kredi harcamaz ve sağlayıcı durumu bayatken çalışır; bakım çift çalışması.
// Çalıştırma: node scripts/campaign/pg/campaign-yayin.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGS = [
  "20271229000000_campaign_center_core.sql",
  "20271229000100_campaign_center_quota_rpc.sql",
  "20271229000200_campaign_center_admin_ui.sql",
  "20271229000300_campaign_provider_usage_gap.sql",
  "20271229000400_campaign_event_stats.sql",
  "20271229000500_campaign_provider_gap_hardening.sql",
  "20271229000600_campaign_legacy_provider_rpc_narrow.sql",
].map((f) => fs.readFileSync(path.join(REPO, "supabase/migrations", f), "utf8"));
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
const ADMIN = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const DEMO = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const EXPERT = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";

const watchdog = setTimeout(() => {
  console.error("FAIL campaign-yayin: 6 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 6 * 60_000);
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-yayin-pg-"));
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
const nocomment = (s) => s.replace(/--[^\n]*/g, "");
const hex = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");



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
  const svc = await newClient("service_role", { clock: true });
  const T0 = new Date("2026-11-03T17:00:00Z"); // 20:00 TR (yayın akşamı)
  const at = (min) => new Date(T0.getTime() + min * 60_000).toISOString();
  const sv = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv, JSON.stringify({ global_daily_credit_budget: 300, provider_monthly_quota: 50000, expert_reserve_pct: 60, provider_minute_limit: 30, provider_state_max_age_seconds: 21600 })]);
  const c = (await svc.query("SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, rid(), JSON.stringify({ name: "Yayın", undated: true })])).rows[0].r;
  const T = (key, enabled, ip, daily, credit, max) => ({ technique_key: key, enabled, ip_daily_limit: ip, daily_analysis_limit: daily, daily_credit_budget: credit, max_credit_per_analysis: max, comments_enabled: false });
  let ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, c.version, JSON.stringify([
    T("hd:bodygraph", true, 4, 300, 300, 1), T("numk:core", true, 4, 300, 300, 1),
    T("atlas:western.natal", true, 4, 30, 30, 1), T("atlas:western.transit", true, 4, 30, 30, 1), T("atlas:western.synastry", false, 1, 30, 30, 1),
    T("numb:analysis", true, 10, 300, 0, 0), T("numb:timing", true, 10, 300, 0, 0), T("numb:place", true, 10, 300, 0, 0), T("numb:relation", false, 10, 300, 0, 0),
  ])])).rows[0].r.version;
  ver = (await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3) r", [OWNER, c.id, ver])).rows[0].r.version;
  let ipn = 0;
  const nextIp = () => `10.${(ipn >> 16) & 255}.${(ipn >> 8) & 255}.${ipn++ & 255}`;
  const rs = (cl, tech, now, ip = nextIp(), browser = null) =>
    tryq(cl, "SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), tech, hex(ip), browser ? hex(browser) : null, now]).then((x) => (x.ok ? x.rows[0].r : { ok: false, reason: `sql:${x.code}` }));
  const settle = (id, now, spent = 1) => svc.query("SELECT public.campaign_settle($1,'completed',$2,$3) r", [id, spent, now]).then((x) => x.rows[0].r);
  const usage = async (scope, day = "2026-11-03") => (await admin.query("SELECT reserved_credits rc, spent_credits sc, reserved_analyses ra, used_analyses ua FROM public.campaign_usage_daily WHERE day_tr=$1 AND scope=$2", [day, scope])).rows[0] ?? { rc: 0, sc: 0 };

  // ── Sabah okuması (08:43 TR = 05:43Z) akşam bayat: 6 saatlik geçerlilik geçmiş ──
  await svc.query("SELECT public.campaign_observe_usage($1,49877,49877,50000,NULL,$2)", [OWNER, "2026-11-02T22:47:23Z"]);
  await svc.query("SELECT public.campaign_observe_usage($1,49876,49876,50000,NULL,$2)", [OWNER, "2026-11-03T05:43:57Z"]);
  const st = await rs(svc, "hd:bodygraph", at(0));
  check("Y01 sabah 08:43 okuması akşam bayat (21600 sn aşıldı) → ücretli rezervasyon reddi (saglayici_durumu_bilinmiyor)", st.ok === false && st.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(st));
  const loc = await rs(svc, "numb:analysis", at(0));
  check("Y02 sağlayıcı bilgisi bayatken yerel teknik (0 kredi) yine çalışır", loc.ok === true && loc.max_credits === 0, JSON.stringify(loc));
  const g0 = await usage("global");
  check("Y03 yerel teknik ortak kredi bütçesinden düşmez", g0.rc === 0 && g0.sc === 0, JSON.stringify(g0));
  // Owner'ın yayın öncesi yeni okuması (sabahki ile tutarlı, ≥ 1 sa arayla) → fark yeniden doğrulanır (24 sa)
  const v3 = (await svc.query("SELECT public.campaign_observe_usage($1,49860,49860,50000,NULL,$2) r", [OWNER, at(0)])).rows[0].r;
  check("Y04 yayın öncesi yeni okuma → fark yeniden doğrulandı, geçerlilik 24 sa ileri (yarın akşam)", v3.gap_status === "dogrulandi" && Date.parse(v3.verified_until) === T0.getTime() + 24 * 3600_000, JSON.stringify(v3));

  // ── Kapalı teknikler ──
  const syn = await rs(svc, "atlas:western.synastry", at(1));
  const rel = await rs(svc, "numb:relation", at(1));
  const nf = await rs(svc, "atlas:western.composite", at(1));
  check("Y05 Sinastri (kapalı) → teknik_kapali", syn.ok === false && syn.reason === "teknik_kapali", JSON.stringify(syn));
  check("Y06 Bütüncül İlişki (2 kişi, kapalı) → teknik_kapali", rel.ok === false && rel.reason === "teknik_kapali", JSON.stringify(rel));
  check("Y07 kampanyada satırı olmayan teknik → teknik_kapali", nf.ok === false && nf.reason === "teknik_kapali", JSON.stringify(nf));

  // ── Dakika sınırı: 120 eşzamanlı karışık ücretli istek, farklı IP ──
  const PAID = ["hd:bodygraph", "numk:core", "atlas:western.natal", "atlas:western.transit"];
  const b0 = await parallel(120, (cl, i) => rs(cl, PAID[i % 4], at(2)));
  const ok0 = b0.filter((x) => x.ok).length;
  check("Y08 120 eşzamanlı ücretli istek → tam 30 izin (dakika sınırı 30), gerisi saglayici_dakika_siniri, SQL hatası yok", ok0 === 30 && b0.filter((x) => !x.ok).every((x) => x.reason === "saglayici_dakika_siniri"), `ok=${ok0} ${JSON.stringify([...new Set(b0.map((x) => x.reason ?? "ok"))])}`);
  for (const x of b0.filter((y) => y.ok)) await settle(x.reservation_id, at(2));

  // ── Ortak 300 kredi: dakika dakika 120'şer eşzamanlı istek; toplam hiçbir anda 300'ü aşmaz ──
  let maxSeen = 0;
  let minute = 3;
  const reasons = new Set();
  for (; minute < 40; minute++) {
    const b = await parallel(120, (cl, i) => rs(cl, PAID[i % 4], at(minute)));
    b.forEach((x) => reasons.add(x.ok ? "ok" : x.reason));
    const g = await usage("global");
    maxSeen = Math.max(maxSeen, g.rc + g.sc);
    for (const x of b.filter((y) => y.ok)) await settle(x.reservation_id, at(minute));
    if (b.every((x) => !x.ok)) break;
  }
  const gEnd = await usage("global");
  check("Y09 ortak günlük bütçe 300: eşzamanlı yükte toplam (ayrılan + harcanan) hiçbir an 300'ü aşmaz ve tam 300'de durur", maxSeen <= 300 && gEnd.sc === 300 && gEnd.rc === 0, `max=${maxSeen} son=${JSON.stringify(gEnd)} nedenler=${JSON.stringify([...reasons])}`);
  const natal = await usage(`tech:${c.id}:atlas:western.natal`);
  const transit = await usage(`tech:${c.id}:atlas:western.transit`);
  check("Y10 Atlas teknik tavanları (30 analiz / 30 kredi) aşılmaz", natal.sc <= 30 && transit.sc <= 30, JSON.stringify({ natal, transit }));
  const after = await rs(svc, "hd:bodygraph", at(minute + 1));
  check("Y11 bütçe dolduktan sonra ücretli istek → genel_kredi_doldu", after.ok === false && after.reason === "genel_kredi_doldu", JSON.stringify(after));
  const locAfter = await rs(svc, "numb:timing", at(minute + 1));
  check("Y12 bütçe dolu iken yerel teknikler çalışmaya devam eder", locAfter.ok === true, JSON.stringify(locAfter));

  // ── IP/gün teknik bazında (ertesi gün, yeni bütçe) ──
  const D2 = (min) => new Date(Date.parse("2026-11-04T09:00:00Z") + min * 60_000).toISOString();
  await svc.query("SELECT public.campaign_observe_usage($1,49500,49500,50000,NULL,$2)", [OWNER, D2(0)]);
  const ip = "203.0.113.77";
  const same = [];
  for (let i = 0; i < 6; i++) same.push(await rs(svc, "hd:bodygraph", D2(1), ip, `tarayici-${i}`));
  check("Y13 aynı IP, farklı tarayıcı (ör. aynı evde 6 kişi) → hd:bodygraph tam 4 izin, 5. ve 6. ip_hakki_doldu", same.filter((x) => x.ok).length === 4 && same.slice(4).every((x) => x.reason === "ip_hakki_doldu"), JSON.stringify(same.map((x) => x.reason ?? "ok")));
  const other = await rs(svc, "numk:core", D2(1), ip, "tarayici-0");
  check("Y14 IP/gün sınırı TEKNİK BAZINDA: aynı IP hd hakkını bitirse de numk:core açılır", other.ok === true, JSON.stringify(other));
  const par = await parallel(60, (cl) => rs(cl, "atlas:western.natal", D2(2), "198.51.100.9"));
  check("Y15 aynı IP'den 60 eşzamanlı Natal → tam 4 izin", par.filter((x) => x.ok).length === 4 && par.filter((x) => x.reason === "ip_hakki_doldu").length === 56, JSON.stringify([...new Set(par.map((x) => x.reason ?? "ok"))]));
  const br = [];
  for (let i = 0; i < 6; i++) br.push(await rs(svc, "numk:core", D2(3), `192.0.2.${i}`, "tek-tarayici"));
  check("Y16 farklı IP + aynı tarayıcı kimliği → tarayıcı/gün 4 ile sınırlı", br.filter((x) => x.ok).length === 4 && br.slice(4).every((x) => x.reason === "tarayici_hakki_doldu"), JSON.stringify(br.map((x) => x.reason ?? "ok")));

  // ── Uzman payı %60: gerçek kalan uzman tabanına inince kampanya durur ──
  await svc.query("SELECT public.campaign_observe_usage($1,30000,30000,50000,NULL,$2)", [OWNER, D2(10)]);
  const ex = await rs(svc, "hd:bodygraph", D2(11));
  check("Y17 gerçek kalan 30.000 (uzman tabanı %60 = 30.000) → uzman_payi_korunuyor", ex.ok === false && ex.reason === "uzman_payi_korunuyor", JSON.stringify(ex));

  // ── Çökme: sonuçlanmayan rezervasyon kredisi iade EDİLMEZ; bakım iki kez paralel çalışsa da tek işlem ──
  await svc.query("SELECT public.campaign_observe_usage($1,49400,49400,50000,NULL,$2)", [OWNER, D2(20)]);
  const crash = await rs(svc, "atlas:western.transit", D2(21));
  const ttl = await val(admin, "SELECT reservation_ttl_seconds FROM public.campaign_settings");
  const later = new Date(Date.parse(D2(21)) + (ttl + 60) * 1000).toISOString();
  const ex2 = await parallel(2, (cl) => tryq(cl, "SELECT public.campaign_expire_stale($1, 500) r", [later]));
  const stt = (await admin.query("SELECT state, spent_credits FROM public.campaign_reservations WHERE id=$1", [crash.reservation_id])).rows[0];
  const gD2 = await usage("global", "2026-11-04");
  check("Y18 çöken analiz (settle yok) → süre dolunca bakım rezervasyonu harcandı sayar (fail-closed); iki paralel bakım çifte işlem yapmaz", crash.ok === true && ex2.every((x) => x.ok) && stt && stt.state !== "reserved" && gD2.rc === 0, JSON.stringify({ stt, gD2, e: ex2.map((x) => x.rows?.[0] ?? x.msg) }));

  // ── Kampanya Kapalı / acil durdurma ──
  const cv = await val(admin, "SELECT version FROM public.campaigns WHERE id=$1", [c.id]);
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'kapali',$3)", [OWNER, c.id, cv]);
  const closed = await rs(svc, "numb:analysis", D2(30));
  check("Y19 kampanya Kapalı → yerel teknik dahil rezervasyon yok (kampanya_kapali)", closed.ok === false && closed.reason === "kampanya_kapali", JSON.stringify(closed));
  const cv2 = await val(admin, "SELECT version FROM public.campaigns WHERE id=$1", [c.id]);
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3)", [OWNER, c.id, cv2]);
  const sv3 = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv3, JSON.stringify({ kill_switch: true })]);
  const ks = await rs(svc, "numb:analysis", D2(31));
  check("Y20 acil durdurma (kill_switch) → kampanya_kapali", ks.ok === false && ks.reason === "kampanya_kapali", JSON.stringify(ks));
  const leak = await val(admin, "SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'campaign%' AND column_name ~ '(birth|dogum|first_?name|last_?name|full_?name|isim|soyad|raw_ip|ip_address|email|phone|telefon)'");
  check("Y21 kampanya tablolarında doğum / ad / ham IP / e-posta / telefon kolonu yok", leak === 0, String(leak));
} finally {
  clearTimeout(watchdog);
  for (const cl of opened) { try { await cl.end(); } catch { /* */ } }
  await server.stop();
}
console.log(`\ncampaign-yayin: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
