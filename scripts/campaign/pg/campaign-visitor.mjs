// KAMPANYA MERKEZİ KM-3 — 20271229000300 (sağlayıcı GERÇEK hesap kalanı + başlık farkı) GERÇEK PostgreSQL doğrulaması.
// YALNIZ yerel geçici embedded-postgres; production / staging / uzak DB YOK; sağlayıcı çağrısı YOK. Sentetik veriler.
// Kapsam: 4 migration 2× idempotent; Owner gerçek kullanım okuması (yalnız Owner, denetim, fark hesabı); başlık gözlemi yalnız
// geçerli farkla (aynı UTC ayı, ≤ 7 gün, ≤ 10 dk, sıra dışı gözlem ezmez); ücretli rezervasyon gerçek gözleme bağlı (başlık
// tek başına hesap kalanı SAYILMAZ); uzman payı gerçek kalanla korunur; yetki / SECURITY DEFINER; production son kontrol SQL'i.
// Çalıştırma: node scripts/campaign/pg/campaign-visitor.mjs
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
  console.error("FAIL campaign-visitor: 6 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km3-campaign-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", "max_connections=60"], onLog: () => {}, onError: () => {} });
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
  for (const m of MIGS) await admin.query(m);
  let twice = true;
  try {
    for (const m of MIGS) await admin.query(m);
  } catch (e) {
    twice = false;
    console.log(String(e.message));
  }
  check("V01 dört migration da iki kez çalışır (idempotent)", twice);
  check(
    "V02 KM-3 migration'ında DROP / TRUNCATE / DELETE yok; mevcut kota RPC'leri yeniden tanımlanmaz",
    !/\bDROP\s+(TABLE|COLUMN|INDEX|FUNCTION)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(nocomment(MIGS[3])) && !/FUNCTION public\.campaign_(observe_provider|record_provider_call|reserve|authorize_call|settle)\b/.test(MIGS[3]),
  );

  const svc = await newClient("service_role", { clock: true });
  const NOW = new Date("2026-11-10T09:00:00Z");
  const at = (min) => new Date(NOW.getTime() + min * 60_000).toISOString();
  const usage = (actor, real, header, limit, now = NOW.toISOString()) => tryq(svc, "SELECT public.campaign_observe_usage($1,$2,$3,$4,NULL,$5) r", [actor, real, header, limit, now]);
  const header = (rem, limit, obs, now) => svc.query("SELECT public.campaign_observe_header($1,$2,NULL,$3,$4) r", [rem, limit, obs, now]).then((x) => x.rows[0].r);
  const ps = async () => (await admin.query("SELECT remaining, quota_limit, remaining_gap, gap_window, observed_at, usage_observed_at FROM public.campaign_provider_state WHERE provider='roxy'")).rows[0];

  // ── Owner gerçek kullanım okuması ──
  for (const [n, who] of [["admin", ADMIN], ["demo", DEMO], ["uzman", EXPERT]]) {
    const r = await usage(who, 27000, 49000, 50000);
    check(`U01 Owner olmayan (${n}) gerçek kullanım yazamaz (42501)`, !r.ok && r.code === "42501", r.msg);
  }
  check("U02 reddedilen yazma durumu değiştirmez", (await ps()).remaining === null);
  const u1 = await usage(OWNER, 27709, 49629, 50000);
  const s1 = await ps();
  check(
    "U03 Owner okuması: kalan = GERÇEK hesap kalanı; fark = başlık − gerçek; ay penceresi",
    u1.ok && s1.remaining === 27709 && s1.remaining_gap === 21920 && s1.gap_window === "2026-11" && s1.quota_limit === 50000 && s1.usage_observed_at !== null,
    JSON.stringify(s1),
  );
  check("U04 denetim kaydı yazılır", (await val(admin, "SELECT count(*)::int FROM public.campaign_audit_log WHERE action='provider_usage_observed'")) === 1);
  const neg = await usage(OWNER, -1, 10, 100);
  const zero = await usage(OWNER, 10, 10, 0);
  check("U05 negatif kalan / sıfır plan sınırı reddedilir", neg.ok && neg.rows[0].r.ok === false && zero.ok && zero.rows[0].r.ok === false);
  const u2 = await usage(OWNER, 30000, 20000, 50000);
  check("U06 başlık gerçek kalandan DÜŞÜKSE fark 0 (düşük olan esas alınır)", u2.ok && (await ps()).remaining_gap === 0);
  await usage(OWNER, 27709, 49629, 50000);

  // ── Başlık gözlemleri ──
  const h1 = await header(49529, 50000, at(1), at(1));
  check("H01 geçerli farkla başlık 49.529 → kalan 27.609", h1.applied === true && (await ps()).remaining === 27609, JSON.stringify(h1));
  const h2 = await header(49000, null, at(-5), at(2));
  check("H02 daha eski anlı gözlem daha yenisini EZMEZ", h2.applied === false && (await ps()).remaining === 27609);
  const h3 = await header(40000, null, at(-30), at(3));
  check("H03 10 dakikadan eski gözlem tazelik sağlamaz", h3.applied === false && h3.why === "eski_gozlem");
  const h4 = await header(49000, null, "2026-12-01T00:05:00Z", "2026-12-01T00:05:00Z");
  check("H04 yeni ayda (fark penceresi geçersiz) kalan GÜNCELLENMEZ", h4.applied === false && h4.why === "fark_bilinmiyor" && (await ps()).remaining === 27609);
  const h5 = await header(49000, null, "2026-11-18T09:00:00Z", "2026-11-18T09:00:00Z");
  check("H05 fark 7 günden eskiyse kalan GÜNCELLENMEZ", h5.applied === false && h5.why === "fark_bilinmiyor");
  const h6 = await header(null, 51000, at(4), at(4));
  const s6 = await ps();
  check("H06 yalnız plan sınırı gözlemi kalanı değiştirmez, sınırı günceller", h6.applied === false && s6.quota_limit === 51000 && s6.remaining === 27609);
  const bad = await tryq(svc, "SELECT public.campaign_observe_header(NULL,NULL,NULL,NULL,NULL) r");
  check("H07 boş gözlem reddedilir", bad.ok && bad.rows[0].r.ok === false);

  // Production KM-3 son kontrol SQL'i (docs/campaign/uretim/03-km3-sonkontrol.sql) temiz uygulama durumunda 4/4.
  {
    const cl = await newClient();
    await cl.query("BEGIN");
    await cl.query("UPDATE public.campaign_provider_state SET remaining_gap=NULL, gap_observed_at=NULL, gap_window=NULL, usage_observed_at=NULL WHERE provider='roxy'");
    const r3 = (await cl.query(fs.readFileSync(path.join(REPO, "docs/campaign/uretim/03-km3-sonkontrol.sql"), "utf8"))).rows;
    await cl.query("ROLLBACK");
    check("U07 production KM-3 son kontrol SQL'i 4/4 (yeni kolonlar, RPC güvenliği, Owner doğrulaması bekleniyor)", r3.length === 4 && r3.every((x) => x.ok === true), JSON.stringify(r3.filter((x) => !x.ok)));
  }

  // ── Ücretli rezervasyon gerçek gözleme bağlı ──
  await admin.query("UPDATE public.campaign_provider_state SET remaining=NULL, observed_at=NULL, quota_limit=NULL, limit_observed_at=NULL, remaining_gap=NULL, gap_observed_at=NULL, gap_window=NULL, usage_observed_at=NULL WHERE provider='roxy'");
  const sv = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv, JSON.stringify({ global_daily_credit_budget: 500, provider_monthly_quota: 50000, expert_reserve_pct: 50 })]);
  const c = (await svc.query("SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, rid(), JSON.stringify({ name: "KM-3", undated: true })])).rows[0].r;
  const ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, c.version, JSON.stringify([{ technique_key: "hd:bodygraph", enabled: true, ip_daily_limit: 5, daily_analysis_limit: 50, daily_credit_budget: 50, max_credit_per_analysis: 1, comments_enabled: false }])])).rows[0].r.version;
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3)", [OWNER, c.id, ver]);
  const rs = (ip, now) => svc.query("SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex(ip), null, now]).then((x) => x.rows[0].r);
  const r0 = await rs("1.1.1.1", NOW.toISOString());
  check("R01 gerçek kullanım okunmadan ücretli rezervasyon YOK", r0.ok === false && r0.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r0));
  await header(49629, 50000, NOW.toISOString(), NOW.toISOString());
  const r1 = await rs("1.1.1.2", NOW.toISOString());
  check("R02 farksız başlık gözlemi rezervasyon AÇMAZ (başlık hesap kalanı sayılmaz)", r1.ok === false && r1.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r1));
  await usage(OWNER, 27709, 49629, 50000, NOW.toISOString());
  const r2 = await rs("1.1.1.3", at(1));
  check("R03 Owner gerçek kullanımı doğruladıktan sonra rezervasyon açılır (1 kredi tavanı)", r2.ok === true && r2.max_credits === 1, JSON.stringify(r2));
  await header(49629 - 2000, 50000, at(2), at(2));
  check("R04 sonraki başlık farkla düzeltilir (kalan 25.709)", (await ps()).remaining === 25709);
  await usage(OWNER, 25000, 46920, 50000, at(3));
  const r3 = await rs("1.1.1.4", at(4));
  check("R05 gerçek kalan uzman tabanında (%50 × 50.000) → uzman_payi_korunuyor", r3.ok === false && r3.reason === "uzman_payi_korunuyor", JSON.stringify(r3));
  await usage(OWNER, 27709, 49629, 50000, at(5));
  const r4 = await rs("1.1.1.5", at(5 + 16));
  check("R06 15 dakikadan eski gözlem → saglayici_durumu_bilinmiyor (fail-closed)", r4.ok === false && r4.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r4));

  // ── Eşzamanlı ücretli istekler: uzman tabanına 5 kredi kala 30 paralel rezervasyon → tam 5 ──
  await usage(OWNER, 25005, 46925, 50000, at(30));
  const openRes = await val(admin, "SELECT coalesce(sum(max_credits),0)::int FROM public.campaign_reservations WHERE state='reserved'");
  const conc = await Promise.all(Array.from({ length: 30 }, async (_, i) => {
    const cl = await newClient("service_role", { clock: true });
    const x = await tryq(cl, "SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex(`9.9.9.${i}`), null, at(31)]);
    await cl.end();
    opened.delete(cl);
    return x;
  }));
  const okN = conc.filter((x) => x.ok && x.rows[0].r.ok === true).length;
  const floorN = conc.filter((x) => x.ok && x.rows[0].r.reason === "uzman_payi_korunuyor").length;
  check(`C01 30 eşzamanlı ücretli rezervasyon: taban üstü 5 kredi − açık rezervasyon (${openRes}) kadar izin, gerisi uzman payı reddi (aşım yok)`, okN === 5 - openRes && floorN === 30 - okN, `ok=${okN} floor=${floorN} ${JSON.stringify(conc.find((x) => !x.ok))}`);

  // ── Yetki ──
  for (const role of ["anon", "authenticated"]) {
    const cl = await newClient(role);
    const a = await tryq(cl, "SELECT public.campaign_observe_usage($1,1,1,1,NULL,NULL)", [OWNER]);
    const b = await tryq(cl, "SELECT public.campaign_observe_header(1,1,NULL,NULL,NULL)");
    check(`G01 ${role} yeni RPC'leri çalıştıramaz`, a.code === "42501" && b.code === "42501", `${a.code}/${b.code}`);
  }
  const defs = (await admin.query("SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('campaign_observe_usage','campaign_observe_header')")).rows;
  check("G02 SECURITY DEFINER + sabit search_path", defs.length === 2 && defs.every((x) => x.prosecdef && (x.proconfig ?? []).includes("search_path=pg_catalog, public, pg_temp")));
  const upd = await tryq(svc, "UPDATE public.campaign_provider_state SET remaining_gap = 0");
  check("G03 service_role sağlayıcı durumuna doğrudan yazamaz (yalnız RPC)", upd.code === "42501");
  const post = (await admin.query(fs.readFileSync(path.join(REPO, "docs/campaign/uretim/02-sonkontrol.sql"), "utf8"))).rows;
  const failed = post.filter((r) => !r.ok).map((r) => r.kontrol);
  check("G04 production son kontrol SQL'i 000300 sonrası güvenlik satırlarının tümünü geçer (yalnız 'kayıt yok' satırları beklenen şekilde false)", failed.every((k) => /kaydı yok|fail-closed/.test(k)), JSON.stringify(failed));
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
console.log(`\ncampaign-visitor: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
