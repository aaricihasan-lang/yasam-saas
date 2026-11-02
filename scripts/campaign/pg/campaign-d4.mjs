// KAMPANYA MERKEZİ — D-4 (20271229000600) GERÇEK PostgreSQL rol testi. YALNIZ yerel geçici embedded-postgres; production YOK;
// sağlayıcı çağrısı YOK. Kapsam: eski kalan yazan RPC'lerin yetkileri (PUBLIC / anon / authenticated / uzman / admin / demo /
// service_role), 000600 öncesi B-4 atlama yolunun gerçekten var olduğu ve 000600 sonrası kapandığı, bütçe / ayar yükseltme
// denemeleri, record_provider_call sınırları, B-4 + uzman payı yeniden doğrulaması, tüm kampanya fonksiyonlarında sabit
// search_path, production son kontrol SQL'i (06-d4-sonkontrol.sql).
// Çalıştırma: node scripts/campaign/pg/campaign-d4.mjs
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
  console.error("FAIL campaign-d4: 6 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-d4-pg-"));
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
  await admin.query(
    `INSERT INTO public.users (id, role, active, is_super_admin, is_demo_account) VALUES
      ($1,'admin',true,true,false), ($2,'admin',true,false,false), ($3,'admin',true,true,true), ($4,'expert',true,false,false)`,
    [OWNER, ADMIN, DEMO, EXPERT],
  );
  // ── 1) 000500 sonrası (000600 ÖNCESİ) durum: eski RPC ile B-4 atlanabiliyor muydu? ──
  for (const m of MIGS.slice(0, 6)) await admin.query(m);
  const svc = await newClient("service_role", { clock: true });
  const NOW = "2026-11-10T09:00:00Z";
  const sv = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv, JSON.stringify({ global_daily_credit_budget: 500, provider_monthly_quota: 50000, expert_reserve_pct: 50 })]);
  const c = (await svc.query("SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, rid(), JSON.stringify({ name: "D4", undated: true })])).rows[0].r;
  const ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, c.version, JSON.stringify([{ technique_key: "hd:bodygraph", enabled: true, ip_daily_limit: 50, daily_analysis_limit: 400, daily_credit_budget: 400, max_credit_per_analysis: 1, comments_enabled: false }])])).rows[0].r.version;
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3)", [OWNER, c.id, ver]);
  let ipn = 0;
  const rs = (now) => svc.query("SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex(`10.9.0.${ipn++}`), null, now]).then((x) => x.rows[0].r);
  // Gerçek hesap kalanı uzman tabanında (25.000): ücretli rezervasyon uzman payı nedeniyle REDDEDİLMELİ.
  await svc.query("SELECT public.campaign_observe_usage($1,25000,46920,50000,NULL,$2)", [OWNER, NOW]);
  const r0 = await rs(NOW);
  check("D01 gerçek kalan uzman tabanında → ücretli rezervasyon reddi (uzman_payi_korunuyor)", r0.ok === false && r0.reason === "uzman_payi_korunuyor", JSON.stringify(r0));
  const bypass = await tryq(svc, "SELECT public.campaign_observe_provider('roxy',49000,50000,NULL,false,$1) r", [NOW]);
  const r1 = await rs(NOW);
  check("D02 (000600 ÖNCESİ, bulgu kanıtı) service_role eski RPC ile kalanı 49.000 yazabiliyor ve rezervasyon AÇILIYOR — B-4 atlanıyor", bypass.ok && r1.ok === true, JSON.stringify({ bypass: bypass.ok, r1 }));
  // ── 2) 000600 uygulanır (iki kez: idempotent) ──
  let twice = true;
  try {
    await admin.query(MIGS[6]);
    await admin.query(MIGS[6]);
  } catch (e) {
    twice = false;
    console.log(String(e.message));
  }
  check("D03 000600 iki kez çalışır (idempotent); DROP / DELETE / gövde değişikliği yok", twice && !/\bDROP\b|\bDELETE\b|CREATE OR REPLACE FUNCTION/i.test(nocomment(MIGS[6])));
  const exists = await val(admin, "SELECT count(*)::int FROM pg_proc WHERE proname='campaign_observe_provider'");
  check("D04 fonksiyon SİLİNMEDİ", exists === 1);
  await svc.query("SELECT public.campaign_observe_usage($1,25000,46920,50000,NULL,$2)", [OWNER, "2026-11-10T09:05:00Z"]);
  const svc2 = await newClient("service_role", { clock: true });
  const deny = await tryq(svc2, "SELECT public.campaign_observe_provider('roxy',49000,50000,NULL,false,NULL) r");
  check("D05 000600 SONRASI service_role eski RPC'yi çalıştıramaz (42501)", deny.ok === false && deny.code === "42501", JSON.stringify(deny));
  const r2 = await svc2.query("SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex("10.9.1.1"), null, "2026-11-10T09:05:30Z"]).then((x) => x.rows[0].r);
  check("D06 atlama yolu kapandıktan sonra uzman payı korunur (rezervasyon reddi)", r2.ok === false && r2.reason === "uzman_payi_korunuyor", JSON.stringify(r2));
  // ── 3) Rol matrisi: eski iki RPC + bütçe / ayar RPC'leri ──
  for (const role of ["anon", "authenticated"]) {
    const cl = await newClient(role);
    const a = await tryq(cl, "SELECT public.campaign_observe_provider('roxy',1,1,NULL,false,NULL)");
    const b = await tryq(cl, "SELECT public.campaign_record_provider_call(1,200,'ok',99999,NULL,NULL,NULL)");
    const s = await tryq(cl, "SELECT public.campaign_admin_update_settings($1,1,'{\"global_daily_credit_budget\":99999}'::jsonb)", [OWNER]);
    const u = await tryq(cl, "UPDATE public.campaign_settings SET global_daily_credit_budget = 99999");
    const p = await tryq(cl, "UPDATE public.campaign_provider_state SET remaining = 99999");
    check(`D07 ${role}: eski RPC'ler, ayar RPC'si ve doğrudan tablo yazımı reddedilir (42501)`, [a, b, s, u, p].every((x) => x.code === "42501"), JSON.stringify([a, b, s, u, p].map((x) => x.code)));
  }
  const pub = (await admin.query("SELECT count(*)::int n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'campaign%' AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))")).rows[0].n;
  check("D08 hiçbir kampanya fonksiyonu anon / authenticated (uzman oturumu dahil) tarafından çalıştırılamaz", pub === 0, String(pub));
  for (const [n, who] of [["uzman", EXPERT], ["admin (owner değil)", ADMIN], ["demo owner", DEMO]]) {
    const sv2 = await val(admin, "SELECT version FROM public.campaign_settings");
    const s = await tryq(svc2, "SELECT public.campaign_admin_update_settings($1,$2,'{\"global_daily_credit_budget\":99999}'::jsonb)", [who, sv2]);
    check(`D09 service_role üzerinden ${n} kimliğiyle kredi bütçesi yükseltilemez (42501)`, s.ok === false && s.code === "42501", JSON.stringify(s));
  }
  check("D10 kredi bütçesi değişmedi (500)", (await val(admin, "SELECT global_daily_credit_budget FROM public.campaign_settings")) === 500);
  // record_provider_call: yalnız 'pending' çağrı satırı; olmayan çağrı → red, durum değişmez.
  const before = await val(admin, "SELECT remaining FROM public.campaign_provider_state WHERE provider='roxy'");
  const rec = await svc2.query("SELECT public.campaign_record_provider_call(987654,200,'ok',99999,NULL,NULL,NULL) r").then((x) => x.rows[0].r);
  check("D11 record_provider_call: bekleyen çağrı yoksa kalan YAZILMAZ (cagri_yok_veya_sonuclandi)", rec.ok === false && (await val(admin, "SELECT remaining FROM public.campaign_provider_state WHERE provider='roxy'")) === before, JSON.stringify(rec));
  // ── 4) Tüm kampanya fonksiyonları: SECURITY DEFINER olanlarda sabit search_path ──
  const defs = (await admin.query("SELECT proname, proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'campaign%' AND prosecdef")).rows;
  check(`D12 ${defs.length} SECURITY DEFINER kampanya fonksiyonunun hepsinde sabit search_path`, defs.length > 10 && defs.every((x) => (x.proconfig ?? []).includes("search_path=pg_catalog, public, pg_temp")), JSON.stringify(defs.filter((x) => !(x.proconfig ?? []).includes("search_path=pg_catalog, public, pg_temp")).map((x) => x.proname)));
  // ── 5) B-4 yeniden doğrulama (000600 sonrası) ──
  const pol = await val(admin, "SELECT public.campaign__gap_policy()");
  check("D13 B-4 politikası etkin (header_hardened)", pol.header_hardened === true);
  const sc = (await admin.query(fs.readFileSync(path.join(REPO, "docs/campaign/uretim/06-d4-sonkontrol.sql"), "utf8"))).rows;
  check("D14 production 000600 son kontrol SQL'i 4/4", sc.length === 4 && sc.every((x) => x.ok === true), JSON.stringify(sc.filter((x) => !x.ok)));
  await svc2.end();
  opened.delete(svc2);
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
console.log(`\ncampaign-d4: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
