// KAMPANYA MERKEZİ — B-4 (20271229000500) GERÇEK PostgreSQL doğrulaması. YALNIZ yerel geçici embedded-postgres; production /
// uzak DB YOK; sağlayıcı çağrısı YOK (yalnız sentetik /usage + başlık değerleri). Kapsam: 6 migration 2× idempotent; tek gözlemli
// fark doğrulanmamış (başlıktan kalan türetilmez); ≥ 1 saat arayla tutarlı iki okuma → doğrulandı; doğrulama 24 saat; başka
// anahtar tüketimi (fark kayması) → doğrulama silinir, ücretli rezervasyon fail-closed; başlıktan türetilen kalan aynı ayda
// yükselmez; yeni ay; tolerans; Owner/rol yetkisi; 7 günlük eski davranışın artık geçmediği; uzman payı; dakika sınırı ayrı;
// production son kontrol SQL'i (05-b4-sonkontrol.sql).
// Çalıştırma: node scripts/campaign/pg/campaign-b4.mjs
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
  console.error("FAIL campaign-b4: 6 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-b4-pg-"));
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
  for (const m of MIGS) await admin.query(m);
  let twice = true;
  try {
    for (const m of MIGS) await admin.query(m);
  } catch (e) {
    twice = false;
    console.log(String(e.message));
  }
  check("B01 altı migration da iki kez çalışır (idempotent)", twice);
  check(
    "B02 000500: DROP / TRUNCATE / DELETE yok; rezervasyon / yetki / kapanış RPC'leri yeniden tanımlanmaz",
    !/\bDROP\s+(TABLE|COLUMN|INDEX|FUNCTION)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(nocomment(MIGS[5])) && !/FUNCTION public\.campaign_(observe_provider|record_provider_call|reserve|authorize_call|settle)\b/.test(MIGS[5]),
  );
  const pol = await val(admin, "SELECT public.campaign__gap_policy()");
  check("B03 politika sabitleri: 24 saat geçerlilik, 60 dk ara, 48 saat karşılaştırma; başlık RPC'si sertleştirilmiş", pol.valid_hours === 24 && pol.min_spacing_minutes === 60 && pol.compare_max_hours === 48 && pol.header_hardened === true, JSON.stringify(pol));
  {
    // 000300 sonradan yeniden uygulanırsa (eski 7 günlük gövde) kod kapısının okuduğu bayrak false olur.
    const cl = await newClient();
    await cl.query("BEGIN");
    await cl.query(MIGS[3].replace(/^\s*BEGIN;\s*$/m, "").replace(/^\s*COMMIT;\s*$/m, ""));
    const p2 = await val(cl, "SELECT public.campaign__gap_policy()");
    await cl.query("ROLLBACK");
    await cl.end();
    opened.delete(cl);
    check("B03b 000300 yeniden uygulanırsa header_hardened=false (uygulama ücretli isteği reddeder)", p2.header_hardened === false, JSON.stringify(p2));
  }

  const svc = await newClient("service_role", { clock: true });
  const NOW = new Date("2026-11-10T09:00:00Z");
  const at = (min) => new Date(NOW.getTime() + min * 60_000).toISOString();
  const usage = (real, head, limit, now, actor = OWNER) =>
    tryq(svc, "SELECT public.campaign_observe_usage($1,$2,$3,$4,NULL,$5) r", [actor, real, head, limit, now]).then((x) => (x.ok ? x.rows[0].r : { ok: false, code: x.code }));
  const header = (rem, now, obs = now) => svc.query("SELECT public.campaign_observe_header($1,NULL,NULL,$2,$3) r", [rem, obs, now]).then((x) => x.rows[0].r);
  const ps = async () => (await admin.query("SELECT remaining, remaining_gap, gap_observed_at, gap_verified_at, gap_drift, gap_drift_at, usage_remaining_real, observed_at FROM public.campaign_provider_state WHERE provider='roxy'")).rows[0];
  const plus = (iso, min) => new Date(Date.parse(iso) + min * 60_000).getTime();

  // ── Kampanya + ücretli teknik (rezervasyon davranışı için) ──
  const sv = await val(admin, "SELECT version FROM public.campaign_settings");
  await svc.query("SELECT public.campaign_admin_update_settings($1,$2,$3::jsonb)", [OWNER, sv, JSON.stringify({ global_daily_credit_budget: 500, provider_monthly_quota: 50000, expert_reserve_pct: 50 })]);
  const c = (await svc.query("SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, rid(), JSON.stringify({ name: "B4", undated: true })])).rows[0].r;
  const tech = [{ technique_key: "hd:bodygraph", enabled: true, ip_daily_limit: 50, daily_analysis_limit: 400, daily_credit_budget: 400, max_credit_per_analysis: 1, comments_enabled: false }];
  const ver = (await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [OWNER, c.id, c.version, JSON.stringify(tech)])).rows[0].r.version;
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3)", [OWNER, c.id, ver]);
  let ipn = 0;
  const rs = (now) =>
    svc.query("SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex(`10.0.${Math.floor(ipn / 250)}.${ipn++ % 250}`), null, now]).then((x) => x.rows[0].r);

  // ── 1) Tek gözlem: gerçek kalan doğrudan yazılır, fark DOĞRULANMAMIŞ ──
  const u1 = await usage(27709, 49629, 50000, at(0));
  const s1 = await ps();
  check(
    "F01 ilk okuma: ilk_gozlem; kalan = gerçek; fark kaydedildi ama doğrulanmadı",
    u1.ok && u1.gap_status === "ilk_gozlem" && s1.remaining === 27709 && s1.usage_remaining_real === 27709 && s1.remaining_gap === 21920 && s1.gap_verified_at === null,
    JSON.stringify(u1),
  );
  const r1 = await rs(at(1));
  check("F02 gerçek okuma tazeyken (≤ 15 dk) ücretli rezervasyon açılır", r1.ok === true, JSON.stringify(r1));
  const h1 = await header(49600, at(2));
  check("F03 doğrulanmamış farkla başlıktan kalan TÜRETİLMEZ (fark_dogrulanmadi)", h1.applied === false && h1.why === "fark_dogrulanmadi" && (await ps()).remaining === 27709, JSON.stringify(h1));
  const r2 = await rs(at(16));
  check("F04 15 dk sonra (başlık işlenmediği için) ücretli rezervasyon fail-closed", r2.ok === false && r2.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r2));

  // ── 2) 1 saatten yakın ikinci okuma: taban korunur, doğrulama yok ──
  const u2 = await usage(27690, 49610, 50000, at(30));
  const s2 = await ps();
  check("F05 30 dk sonra tutarlı okuma → bekliyor_ara; ilk taban korunur", u2.gap_status === "bekliyor_ara" && s2.gap_verified_at === null && new Date(s2.gap_observed_at).toISOString() === at(0), JSON.stringify(u2));

  // ── 3) ≥ 1 saat arayla tutarlı okuma → doğrulandı, başlık 24 saat kullanılabilir ──
  const u3 = await usage(27600, 49520, 50000, at(61));
  check("F06 61 dk sonra tutarlı okuma → dogrulandi; geçerlilik tam 24 saat", u3.gap_status === "dogrulandi" && u3.drift === 0 && Date.parse(u3.verified_until) === plus(at(61), 24 * 60), JSON.stringify(u3));
  const h2 = await header(49500, at(62));
  check("F07 doğrulanmış farkla başlık 49.500 → kalan 27.580", h2.applied === true && (await ps()).remaining === 27580, JSON.stringify(h2));
  const h3 = await header(49900, at(63));
  check("F08 başlık yükselse bile türetilen kalan aynı ayda YÜKSELMEZ", h3.applied === true && (await ps()).remaining === 27580, JSON.stringify(h3));
  const r3 = await rs(at(64));
  check("F09 tazelenen durumla ücretli rezervasyon açılır", r3.ok === true, JSON.stringify(r3));

  // ── 4) 24 saat sonra doğrulama düşer (eski 7 günlük kabul kapandı) ──
  const h4 = await header(49400, at(61 + 24 * 60 + 1));
  check("F10 doğrulamadan 24 saat sonra başlık işlenmez (fark_dogrulanmadi)", h4.applied === false && h4.why === "fark_dogrulanmadi", JSON.stringify(h4));
  const h5 = await header(49400, at(61 + 3 * 24 * 60));
  check("F11 3 gün sonra da işlenmez (000300'ün 7 günlük kabulü artık geçerli değil)", h5.applied === false && h5.why === "fark_dogrulanmadi");
  const r4 = await rs(at(61 + 3 * 24 * 60 + 1));
  check("F12 süresi dolmuş doğrulamayla ücretli rezervasyon fail-closed", r4.ok === false && r4.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r4));

  // ── 5) Başka anahtar tüketimi: fark kayması → doğrulama silinir ──
  const D0 = 4 * 24 * 60;
  await usage(27000, 48920, 50000, at(D0));
  const v5 = await usage(26900, 48820, 50000, at(D0 + 70));
  check("F13 (hazırlık) yeniden iki tutarlı okuma → dogrulandi", v5.gap_status === "dogrulandi", JSON.stringify(v5));
  // Aynı hesapta başka anahtar 3.000 kredi tüketti: gerçek 3.100 düştü, bu anahtarın başlığı yalnız 100.
  const k1 = await usage(23800, 48720, 50000, at(D0 + 140));
  const sk = await ps();
  check("F14 fark 3.000 kaydı → kayma; doğrulama silinir, kayma kaydedilir", k1.gap_status === "kayma" && k1.drift === 3000 && sk.gap_verified_at === null && sk.gap_drift === 3000 && sk.gap_drift_at !== null, JSON.stringify(k1));
  const h6 = await header(48700, at(D0 + 141));
  check("F15 kayma sonrası başlıktan kalan türetilmez (eski farkla 3.000 fazla gösterilemez)", h6.applied === false && h6.why === "fark_dogrulanmadi" && (await ps()).remaining === 23800, JSON.stringify(h6));
  const r5 = await rs(at(D0 + 140 + 16));
  check("F16 kayma sonrası taze gerçek okuma yoksa ücretli rezervasyon fail-closed", r5.ok === false && r5.reason === "saglayici_durumu_bilinmiyor", JSON.stringify(r5));
  const k2 = await usage(23700, 48620, 50000, at(D0 + 210));
  check("F17 kaymadan sonra ≥ 1 saat arayla tutarlı okuma → yeniden dogrulandi", k2.gap_status === "dogrulandi" && k2.drift === 0, JSON.stringify(k2));
  const h7 = await header(48600, at(D0 + 211));
  check("F18 yeni doğrulanmış farkla (24.920) kalan doğru: 23.680", h7.applied === true && (await ps()).remaining === 23680, JSON.stringify(h7));

  // ── 6) Tolerans: plan 50.000 → ‰0,5 = 25 kredi ──
  const t1 = await usage(23600, 48545, 50000, at(D0 + 280));
  check("F19 25 kredilik kayma tolerans içinde → dogrulandi", t1.gap_status === "dogrulandi" && t1.drift === 25 && t1.tolerance === 25, JSON.stringify(t1));
  const t2 = await usage(23500, 48472, 50000, at(D0 + 350));
  check("F20 27 kredilik kayma tolerans dışında → kayma", t2.gap_status === "kayma" && t2.drift === 27, JSON.stringify(t2));

  // ── 7) Ay değişimi + 48 saat sınırı + başlıksız okuma ──
  await usage(20000, 45000, 50000, "2026-11-30T22:00:00Z");
  const m1 = await usage(19990, 44990, 50000, "2026-12-01T00:30:00Z");
  check("F21 yeni UTC ayında önceki okuma karşılaştırılmaz → ilk_gozlem", m1.gap_status === "ilk_gozlem", JSON.stringify(m1));
  const m2 = await header(44980, "2026-12-01T00:31:00Z");
  check("F22 yeni ayın ilk okumasıyla başlıktan kalan türetilmez", m2.applied === false && m2.why === "fark_dogrulanmadi", JSON.stringify(m2));
  const g1 = await usage(19000, 43990, 50000, "2026-12-03T06:00:00Z");
  check("F23 48 saatten eski önceki okuma karşılaştırılmaz → ilk_gozlem", g1.gap_status === "ilk_gozlem", JSON.stringify(g1));
  const n1 = await usage(19000, null, 50000, "2026-12-03T08:00:00Z");
  const sn = await ps();
  check("F24 başlıksız okuma → fark_yok; fark ve doğrulama temizlenir", n1.gap_status === "fark_yok" && sn.remaining_gap === null && sn.gap_verified_at === null, JSON.stringify(n1));

  // ── 8) Uzman payı + 120 eşzamanlı ücretli istek (doğrulanmış farkla tazelenmiş durumda aşım yok) ──
  await usage(25040, 50040, 50000, "2026-12-04T09:00:00Z");
  await usage(25040, 50040, 50000, "2026-12-04T10:10:00Z");
  const hh = await header(50040, "2026-12-04T10:11:00Z");
  const open = await val(admin, "SELECT coalesce(sum(max_credits),0)::int FROM public.campaign_reservations WHERE state='reserved'");
  const conc = await Promise.all(
    Array.from({ length: 120 }, async (_, i) => {
      const cl = await newClient("service_role", { clock: true });
      const x = await tryq(cl, "SELECT public.campaign_reserve($1,$2,$3,$4,$5) r", [crypto.randomBytes(18).toString("base64url"), "hd:bodygraph", hex(`172.16.9.${i}`), null, "2026-12-04T10:12:00Z"]);
      await cl.end();
      opened.delete(cl);
      return x.ok ? x.rows[0].r : { ok: false, reason: `sql:${x.code}` };
    }),
  );
  const okN = conc.filter((x) => x.ok === true).length;
  const reasons = [...new Set(conc.filter((x) => !x.ok).map((x) => x.reason))];
  const minute = await val(admin, "SELECT provider_minute_limit FROM public.campaign_settings");
  const expectOk = Math.min(Math.max(0, 40 - open), minute);
  check(
    `F25 120 eşzamanlı ücretli istek: uzman tabanı üstü 40 kredi − açık rezervasyon (${open}), dakika sınırı ${minute} → ${expectOk} izin, aşım yok`,
    hh.applied === true && okN === expectOk && reasons.every((r) => r === "uzman_payi_korunuyor" || r === "saglayici_dakika_siniri"),
    `ok=${okN} ${JSON.stringify(reasons)} ${JSON.stringify(hh)}`,
  );

  // ── 9) Yetki ──
  for (const [n, who] of [["admin", ADMIN], ["demo", DEMO], ["uzman", EXPERT]]) {
    const r = await usage(1, 1, 10, at(0), who);
    check(`F26 Owner olmayan (${n}) gerçek kullanım yazamaz (42501)`, r.ok === false && r.code === "42501", JSON.stringify(r));
  }
  for (const role of ["anon", "authenticated"]) {
    const cl = await newClient(role);
    const a = await tryq(cl, "SELECT public.campaign_observe_usage($1,1,1,1,NULL,NULL)", [OWNER]);
    const b = await tryq(cl, "SELECT public.campaign_observe_header(1,1,NULL,NULL,NULL)");
    const p = await tryq(cl, "SELECT public.campaign__gap_policy()");
    check(`F27 ${role} sertleştirilmiş RPC'leri çalıştıramaz`, a.code === "42501" && b.code === "42501" && p.code === "42501", `${a.code}/${b.code}/${p.code}`);
  }
  const defs = (await admin.query("SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('campaign_observe_usage','campaign_observe_header')")).rows;
  check("F28 SECURITY DEFINER + sabit search_path korunur", defs.length === 2 && defs.every((x) => x.prosecdef && (x.proconfig ?? []).includes("search_path=pg_catalog, public, pg_temp")));
  const upd = await tryq(svc, "UPDATE public.campaign_provider_state SET gap_verified_at = now()");
  check("F29 service_role doğrulama alanını doğrudan yazamaz (yalnız RPC)", upd.code === "42501", JSON.stringify(upd));

  // ── 10) Production son kontrol SQL'i ──
  const sc = (await admin.query(fs.readFileSync(path.join(REPO, "docs/campaign/uretim/05-b4-sonkontrol.sql"), "utf8"))).rows;
  check("F30 production 000500 son kontrol SQL'i 5/5", sc.length === 5 && sc.every((x) => x.ok === true), JSON.stringify(sc.filter((x) => !x.ok)));
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
console.log(`\ncampaign-b4: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
