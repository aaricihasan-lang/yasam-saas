// KAMPANYA MERKEZİ — GECE OPERASYONU 03.11 (yayın öncesi) GERÇEK PostgreSQL testi. YALNIZ yerel geçici embedded-postgres;
// production YOK; sağlayıcı çağrısı YOK. Ayarlar production'un 03.11 salt okunur kopyası: ortak bütçe 30, aylık plan 50.000, uzman
// payı %60, dakika sınırı 30, hd:bodygraph (IP/gün 1, günlük 30 analiz, 30 kredi, analiz başına 1). Kapsam: sağlayıcı bilgisinin
// 15 dk (900 sn) geçerlilik kilidi ve Owner ayarıyla (provider_state_max_age_seconds) çözümü + yine fail-closed sınır; IP / teknik /
// ortak bütçe; 120 eşzamanlı istek; bakımın (campaign_expire_stale) iki paralel çalıştırmada çifte işlem / kredi iadesi yapmaması;
// saklama temizliğinin yalnız 30 günden eski kimlik sayaçlarını silmesi; kampanya kapalıyken rezervasyon yok.
// Çalıştırma: node scripts/campaign/pg/campaign-gece.mjs
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
  console.error("FAIL campaign-gece: 6 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-gece-pg-"));
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



await server.initialise();
await server.start();
try {
  const admin = await newClient();
  await admin.query(BOOT);
  await admin.query("INSERT INTO public.users (id, role, active, is_super_admin, is_demo_account) VALUES ($1,'admin',true,true,false)", [OWNER]);
  for (const m of MIGS) await admin.query(m);
  const svc = await newClient("service_role", { clock: true });
  const T0 = new Date("2026-11-03T05:00:00Z"); // 08:00 TR
  const at = (min) => new Date(T0.getTime() + min * 60_000).toISOString();
  const sv = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv, JSON.stringify({ global_daily_credit_budget: 30, provider_monthly_quota: 50000, expert_reserve_pct: 60, provider_minute_limit: 30 })]);
  const s0 = (await admin.query("SELECT provider_state_max_age_seconds a, reservation_ttl_seconds t FROM public.campaign_settings")).rows[0];
  check("G00 varsayılan sağlayıcı geçerlilik süresi 900 sn, rezervasyon süresi 600 sn (production ile aynı)", s0.a === 900 && s0.t === 600, JSON.stringify(s0));
  const c = (await svc.query("SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, rid(), JSON.stringify({ name: "Eğitim", undated: true })])).rows[0].r;
  let ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, c.version, JSON.stringify([{ technique_key: "hd:bodygraph", enabled: true, ip_daily_limit: 1, daily_analysis_limit: 30, daily_credit_budget: 30, max_credit_per_analysis: 1, comments_enabled: false }])])).rows[0].r.version;
  ver = (await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3) r", [OWNER, c.id, ver])).rows[0].r.version;
  let ipn = 0;
  const rs = (now, ip = `10.1.${Math.floor(ipn / 250)}.${ipn++ % 250}`) =>
    svc.query("SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex(ip), null, now]).then((x) => x.rows[0].r);
  const settle = (id, now) => svc.query("SELECT public.campaign_settle($1,'completed',1,$2) r", [id, now]).then((x) => x.rows[0].r);

  // Owner'ın iki gerçek okuması (production: 1. okuma 22:47Z, gerçek kalan 49.877, fark 0) — ikincisi ≥ 1 saat sonra.
  await svc.query("SELECT public.campaign_observe_usage($1,49877,49877,50000,NULL,$2)", [OWNER, at(-70)]);
  const v2 = (await svc.query("SELECT public.campaign_observe_usage($1,49876,49876,50000,NULL,$2) r", [OWNER, at(0)])).rows[0].r;
  check("G01 iki tutarlı okuma → fark doğrulandı", v2.gap_status === "dogrulandi", JSON.stringify(v2));
  const r1 = await rs(at(1));
  check("G02 doğrulamadan hemen sonra ücretli rezervasyon açılır", r1.ok === true, JSON.stringify(r1));
  if (r1.ok) await settle(r1.reservation_id, at(1));
  // ── 15 dk kilidi: arada sağlayıcı çağrısı / gözlem yoksa ──
  const r2 = await rs(at(16));
  check("G03 BULGU: 900 sn ayarında 15 dk boşluktan sonra ücretli rezervasyon reddedilir (saglayici_durumu_bilinmiyor) — eğitimde kilitlenme riski", r2.ok === false && r2.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r2));
  // Kampanyanın kendi sağlayıcı çağrısının başlığı (doğrulanmış farkla) durumu tazeler.
  await svc.query("SELECT public.campaign_observe_usage($1,49870,49870,50000,NULL,$2)", [OWNER, at(20)]);
  await svc.query("SELECT public.campaign_observe_header($1,50000,NULL,$2,$2)", [49869, at(21)]);
  const r3 = await rs(at(35));
  check("G04 son başlık gözleminden 14 dk sonra hâlâ açık (çağrılar durumu tazeler)", r3.ok === true, JSON.stringify(r3));
  if (r3.ok) await settle(r3.reservation_id, at(35));
  // ── Çözüm: Owner geçerlilik süresini 6 saate alır ──
  const sv2 = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv2, JSON.stringify({ provider_state_max_age_seconds: 21600 })]);
  await svc.query("SELECT public.campaign_observe_usage($1,49860,49860,50000,NULL,$2)", [OWNER, at(60)]);
  const r4 = await rs(at(60 + 90));
  const r5 = await rs(at(60 + 5 * 60));
  check("G05 geçerlilik 21600 sn: son gözlemden 1,5 sa ve 5 sa sonra ücretli rezervasyon açık", r4.ok === true && r5.ok === true, JSON.stringify({ r4, r5 }));
  for (const r of [r4, r5]) if (r.ok) await settle(r.reservation_id, at(60 + 5 * 60));
  const r6 = await rs(at(60 + 6 * 60 + 1));
  check("G06 6 saati aşınca yine fail-closed (saglayici_durumu_bilinmiyor)", r6.ok === false && r6.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r6));
  check("G07 ayar DB'de 60–86400 sn ile sınırlı (86401 reddedilir)", (await tryq(svc, "SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, await val(admin, "SELECT version FROM public.campaign_settings"), JSON.stringify({ provider_state_max_age_seconds: 86401 })])).ok === false || (await val(admin, "SELECT provider_state_max_age_seconds FROM public.campaign_settings")) === 21600);

  // ── Yeni gün: 120 eşzamanlı istek (farklı IP) → tam 30 (teknik 30 / ortak bütçe 30 / dakika 30), aşım yok ──
  const D2 = "2026-11-04T06:00:00Z";
  await svc.query("SELECT public.campaign_observe_usage($1,49800,49800,50000,NULL,$2)", [OWNER, "2026-11-04T05:59:00Z"]);
  const conc = await Promise.all(Array.from({ length: 120 }, async (_, i) => {
    const cl = await newClient("service_role", { clock: true });
    const x = await tryq(cl, "SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex(`172.20.${Math.floor(i / 200)}.${i % 200}`), null, D2]);
    await cl.end();
    opened.delete(cl);
    return x.ok ? x.rows[0].r : { ok: false, reason: `sql:${x.code}` };
  }));
  const okN = conc.filter((x) => x.ok).length;
  const why = [...new Set(conc.filter((x) => !x.ok).map((x) => x.reason))];
  const g = (await admin.query("SELECT reserved_credits + spent_credits AS k, reserved_analyses + used_analyses AS a FROM public.campaign_usage_daily WHERE day_tr='2026-11-04' AND scope='global'")).rows[0];
  check(`G08 120 eşzamanlı istek → tam 30 izin; ortak kredi 30'u aşmaz (red nedenleri: ${why.join(", ")})`, okN === 30 && Number(g.k) === 30 && why.every((r) => !r.startsWith("sql:")), JSON.stringify({ okN, g, why }));
  const same = await rs("2026-11-04T06:30:00Z", "172.20.0.5");
  check("G09 aynı IP aynı gün ikinci analiz → reddedilir (IP/gün 1 veya kontenjan dolu)", same.ok === false && ["ip_hakki_doldu", "teknik_kontenjan_doldu", "genel_kredi_doldu", "teknik_kredi_doldu"].includes(same.reason), JSON.stringify(same));
  const sameNew = await rs("2026-11-05T06:30:00Z", "172.20.0.5");
  check("G10 ertesi gün (TR) aynı IP yeniden 1 hak — ama sağlayıcı bilgisi 6 saati aştıysa fail-closed", sameNew.ok === false && sameNew.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(sameNew));

  // ── Bakım: 30 açık rezervasyon (sonuçlanmamış) — iki paralel expire_stale → her biri BİR kez; kredi iade edilmez ──
  const open = await val(admin, "SELECT count(*)::int FROM public.campaign_reservations WHERE state='reserved'");
  const late = "2026-11-04T06:20:00Z"; // TTL 600 sn geçti
  const [e1, e2] = await Promise.all([1, 2].map(async () => {
    const cl = await newClient("service_role", { clock: true });
    const x = await val(cl, "SELECT public.campaign_expire_stale($1, 5000)", [late]);
    await cl.end();
    opened.delete(cl);
    return x;
  }));
  const after = (await admin.query("SELECT count(*) FILTER (WHERE state='reserved')::int AS acik, count(*) FILTER (WHERE state='expired')::int AS biten FROM public.campaign_reservations")).rows[0];
  const g2 = (await admin.query("SELECT reserved_credits, spent_credits FROM public.campaign_usage_daily WHERE day_tr='2026-11-04' AND scope='global'")).rows[0];
  check(`G11 iki paralel bakım: ${open} açık rezervasyon tam bir kez kapandı (${e1}+${e2}), açık kalmadı`, Number(e1) + Number(e2) === open && after.acik === 0 && after.biten >= open, JSON.stringify({ e1, e2, after }));
  check("G12 süresi dolan rezervasyonun kredisi İADE EDİLMEZ (harcandı sayılır; uzman payı korunur)", Number(g2.reserved_credits) === 0 && Number(g2.spent_credits) === 30, JSON.stringify(g2));
  const e3 = await val(svc, "SELECT public.campaign_expire_stale($1, 5000)", [late]);
  check("G13 üçüncü bakım çalıştırması 0 (idempotent)", Number(e3) === 0);

  // ── Saklama temizliği: yalnız 30 günden eski kimlik sayaçları; rezervasyon / sayaç / ayar silinmez ──
  await admin.query("INSERT INTO public.campaign_subject_daily (day_tr, campaign_id, technique_key, subject_kind, subject_hash, used) VALUES ('2026-09-20', $1, 'hd:bodygraph', 'ip', $2, 1)", [c.id, hex("eski")]);
  const before = (await admin.query("SELECT (SELECT count(*) FROM public.campaign_reservations)::int r, (SELECT count(*) FROM public.campaign_usage_daily)::int u, (SELECT count(*) FROM public.campaign_subject_daily WHERE day_tr >= '2026-11-01')::int yeni")).rows[0];
  const pg1 = await tryq(svc, "SELECT public.campaign_purge_subjects(30, $1) r", ["2026-11-04T07:00:00Z"]);
  const aft = (await admin.query("SELECT (SELECT count(*) FROM public.campaign_reservations)::int r, (SELECT count(*) FROM public.campaign_usage_daily)::int u, (SELECT count(*) FROM public.campaign_subject_daily WHERE day_tr >= '2026-11-01')::int yeni, (SELECT count(*) FROM public.campaign_subject_daily WHERE day_tr < '2026-10-01')::int eski")).rows[0];
  check("G14 saklama temizliği yalnız 30 günden eski HMAC kimlik sayacını siler; rezervasyon / günlük sayaç / yeni kimlikler korunur", pg1.ok && aft.eski === 0 && aft.r === before.r && aft.u === before.u && aft.yeni === before.yeni, JSON.stringify({ pg1: pg1.ok ? pg1.rows[0] : pg1, before, aft }));

  // ── Kampanya kapalı → rezervasyon yok ──
  const vK = await val(admin, "SELECT version FROM public.campaigns WHERE id=$1", [c.id]);
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'kapali',$3)", [OWNER, c.id, vK]);
  await svc.query("SELECT public.campaign_observe_usage($1,49790,49790,50000,NULL,$2)", [OWNER, "2026-11-05T06:00:00Z"]);
  const rk = await rs("2026-11-05T06:01:00Z");
  check("G15 kampanya Kapalı → rezervasyon reddedilir", rk.ok === false, JSON.stringify(rk));
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
console.log(`\ncampaign-gece: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
