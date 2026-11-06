// KAMPANYA MERKEZİ KM-2 — 20271229000200 (Owner paneli: idempotent oluşturma + atomik kopyalama) GERÇEK PostgreSQL doğrulaması.
// YALNIZ yerel geçici embedded-postgres; production / staging / uzak DB YOK; sağlayıcı çağrısı YOK. Sentetik veriler.
// KM-1 migration'ları (20271229000000 + 20271229000100) önce uygulanır; Supabase varsayılan ACL'si migration'lardan ÖNCE kurulur.
// Kapsam: 3 migration 2× idempotent, Owner denetimi, çift gönderim / eşzamanlı oluşturma (tek kayıt), geçersiz alanda yarım kayıt yok,
// atomik kopya (kampanya + teknikler; Kapalı; bitmiş tarihli → tarihsiz), tek yayındaki kampanya kuralı, yetki / SECURITY DEFINER.
// Çalıştırma: node scripts/campaign/pg/campaign-admin.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGS = ["20271229000000_campaign_center_core.sql", "20271229000100_campaign_center_quota_rpc.sql", "20271229000200_campaign_center_admin_ui.sql"].map((f) =>
  fs.readFileSync(path.join(REPO, "supabase/migrations", f), "utf8"),
);
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
const INACTIVE = "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d";
const EXPERT = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";

const watchdog = setTimeout(() => {
  console.error("FAIL campaign-admin: 6 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 6 * 60_000);
watchdog.unref();

async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 56000 + Math.floor(Math.random() * 2500);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km2-campaign-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", "max_connections=120"], onLog: () => {}, onError: () => {} });
const opened = new Set();
const newClient = async (role = null) => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  c.on("error", () => {});
  opened.add(c);
  await c.connect();
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
  // Production ön / son kontrol SQL'leri (docs/campaign/uretim) gerçekten doğrulanır: önce hepsi true, sonra hepsi true.
  const sqlDoc = (f) => fs.readFileSync(path.join(REPO, "docs/campaign/uretim", f), "utf8");
  const pre = (await admin.query(sqlDoc("01-onkontrol.sql"))).rows;
  check("U01 production ön kontrol SQL'i (migration öncesi) tüm satırlar true", pre.length === 5 && pre.every((r) => r.ok === true), JSON.stringify(pre.filter((r) => !r.ok)));
  for (const m of MIGS) await admin.query(m);
  const post = (await admin.query(sqlDoc("02-sonkontrol.sql"))).rows;
  check("U02 production son kontrol SQL'i (3 migration sonrası) tüm satırlar true", post.length === 11 && post.every((r) => r.ok === true), JSON.stringify(post.filter((r) => !r.ok)));
  const preAgain = (await admin.query(sqlDoc("01-onkontrol.sql"))).rows;
  check("U03 ön kontrol uygulama sonrası 'zaten var' durumunu yakalar (yanlışlıkla ikinci uygulama uyarısı)", preAgain.filter((r) => !r.ok).length === 2);
  let twice = true;
  try {
    for (const m of MIGS) await admin.query(m);
  } catch (e) {
    twice = false;
    console.log(String(e.message));
  }
  check("M01 üç migration da iki kez çalışır (idempotent)", twice);
  check("M02 KM-2 migration'ında DROP / TRUNCATE / DELETE yok", !/\bDROP\s+(TABLE|COLUMN|INDEX)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(nocomment(MIGS[2])));
  check("M03 KM-2 migration yalnız campaign* nesnelerine dokunur", !/\b(clients|human_design_|numerology_|astro_|tenant_id|user_sessions)\b/i.test(nocomment(MIGS[2])));

  const svc = await newClient("service_role");
  const create = (c, actor, r, fields) => c.query("SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [actor, r, JSON.stringify(fields)]).then((x) => x.rows[0].r);
  const dup = (c, actor, r, src, name = null) => c.query("SELECT public.campaign_admin_duplicate($1,$2,$3,$4) r", [actor, r, src, name]).then((x) => x.rows[0].r);
  const count = () => val(admin, "SELECT count(*)::int FROM public.campaigns");

  // ── İdempotent oluşturma ──
  const R1 = rid();
  const c1 = await create(svc, OWNER, R1, { name: "Kasım kampanyası", undated: true, cta_target: "bolum", slogan: "Ücretsiz keşif" });
  const c1b = await create(svc, OWNER, R1, { name: "BAŞKA AD", undated: true });
  check("C01 Owner oluşturur; aynı istek kimliği tekrarı aynı kaydı döndürür (replay)", c1.ok && c1.replay === false && c1b.replay === true && c1b.id === c1.id && (await count()) === 1);
  check("C02 tekrar isteği ilk kaydı DEĞİŞTİRMEZ", (await val(admin, "SELECT name FROM public.campaigns WHERE id=$1", [c1.id])) === "Kasım kampanyası");
  check("C03 yeni kampanya Kapalı başlar ve create_request_id kaydedilir", (await val(admin, "SELECT status||':'||create_request_id::text FROM public.campaigns WHERE id=$1", [c1.id])) === `kapali:${R1}`);

  const R2 = rid();
  const conc = await Promise.all(Array.from({ length: 20 }, async () => {
    const c = await newClient("service_role");
    const r = await tryq(c, "SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, R2, JSON.stringify({ name: "Eşzamanlı", undated: true })]);
    await c.end();
    opened.delete(c);
    return r;
  }));
  const ids = new Set(conc.filter((x) => x.ok).map((x) => x.rows[0].r.id));
  check("C04 aynı istek kimliğiyle 20 eşzamanlı oluşturma → tam 1 kampanya", conc.every((x) => x.ok) && ids.size === 1 && (await val(admin, "SELECT count(*)::int FROM public.campaigns WHERE create_request_id=$1", [R2])) === 1);
  check("C05 eşzamanlıdan yalnız biri replay=false", conc.filter((x) => x.ok && x.rows[0].r.replay === false).length === 1);

  const before = await count();
  for (const [n, who] of [["admin", ADMIN], ["demo", DEMO], ["pasif", INACTIVE], ["uzman", EXPERT], ["yok", rid()]]) {
    const r = await tryq(svc, "SELECT public.campaign_admin_create($1,$2,$3::jsonb)", [who, rid(), JSON.stringify({ name: "x", undated: true })]);
    check(`C06 Owner olmayan (${n}) oluşturamaz (42501)`, !r.ok && r.code === "42501", r.msg);
  }
  check("C07 reddedilen oluşturmalar kayıt bırakmaz", (await count()) === before);
  const nul = await tryq(svc, "SELECT public.campaign_admin_create($1,NULL,$2::jsonb)", [OWNER, JSON.stringify({ name: "x" })]);
  check("C08 istek kimliği zorunlu", !nul.ok && /CAMPAIGN_REQUEST_ID_REQUIRED/.test(nul.msg));
  const R3 = rid();
  const bad = await tryq(svc, "SELECT public.campaign_admin_create($1,$2,$3::jsonb)", [OWNER, R3, JSON.stringify({ name: "x", undated: true, cta_target: "javascript:alert(1)" })]);
  const badImg = await tryq(svc, "SELECT public.campaign_admin_create($1,$2,$3::jsonb)", [OWNER, rid(), JSON.stringify({ name: "x", undated: true, image_ref: "../etc/passwd.png" })]);
  check("C09 geçersiz CTA / görsel yolu reddedilir; yarım kayıt yok", !bad.ok && !badImg.ok && (await val(admin, "SELECT count(*)::int FROM public.campaigns WHERE create_request_id=$1", [R3])) === 0 && (await count()) === before);
  const bad2 = await tryq(svc, "SELECT public.campaign_admin_create($1,$2,$3::jsonb) r", [OWNER, R3, JSON.stringify({ name: "Düzeltilmiş", undated: true })]);
  check("C10 başarısız istek kimliği düzeltilmiş içerikle yeniden kullanılabilir", bad2.ok && bad2.rows[0].r.replay === false);

  // ── Atomik kopya ──
  const v1 = await val(admin, "SELECT version FROM public.campaigns WHERE id=$1", [c1.id]);
  const items = [
    { technique_key: "hd:bodygraph", enabled: true, ip_daily_limit: 2, daily_analysis_limit: 40, daily_credit_budget: 40, max_credit_per_analysis: 1, comments_enabled: true },
    { technique_key: "kozmik:paket", enabled: true, ip_daily_limit: 3, daily_analysis_limit: 200, daily_credit_budget: 0, max_credit_per_analysis: 0, comments_enabled: false },
    { technique_key: "numk:core", enabled: false, ip_daily_limit: 1, daily_analysis_limit: 30, daily_credit_budget: 30, max_credit_per_analysis: 1, comments_enabled: false },
  ];
  await svc.query("SELECT public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb)", [OWNER, c1.id, v1, JSON.stringify(items)]);
  const v2 = await val(admin, "SELECT version FROM public.campaigns WHERE id=$1", [c1.id]);
  await svc.query("SELECT public.campaign_admin_set_status($1,$2,'aktif',$3)", [OWNER, c1.id, v2]);
  const D1 = rid();
  const d1 = await dup(svc, OWNER, D1, c1.id);
  const copy = (await admin.query("SELECT * FROM public.campaigns WHERE id=$1", [d1.id])).rows[0];
  const srcT = (await admin.query("SELECT technique_key, enabled, ip_daily_limit, daily_analysis_limit, daily_credit_budget, max_credit_per_analysis, comments_enabled FROM public.campaign_techniques WHERE campaign_id=$1 ORDER BY technique_key", [c1.id])).rows;
  const cpT = (await admin.query("SELECT technique_key, enabled, ip_daily_limit, daily_analysis_limit, daily_credit_budget, max_credit_per_analysis, comments_enabled FROM public.campaign_techniques WHERE campaign_id=$1 ORDER BY technique_key", [d1.id])).rows;
  check("D01 kopya Kapalı taslak, ad “(kopya)”, metinler aynı", d1.ok && d1.replay === false && copy.status === "kapali" && copy.name === "Kasım kampanyası (kopya)" && copy.slogan === "Ücretsiz keşif");
  check("D02 teknik satırları birebir kopyalanır (3 satır, limitler ve yorum bayrakları)", cpT.length === 3 && JSON.stringify(cpT) === JSON.stringify(srcT));
  check("D03 kaynak Aktif kalır; tek yayındaki kampanya kuralı bozulmaz", (await val(admin, "SELECT status FROM public.campaigns WHERE id=$1", [c1.id])) === "aktif" && (await val(admin, "SELECT count(*)::int FROM public.campaigns WHERE status <> 'kapali' AND archived_at IS NULL")) === 1);
  const d1b = await dup(svc, OWNER, D1, c1.id);
  check("D04 aynı istek kimliğiyle kopya tekrarı yeni kayıt açmaz (replay)", d1b.replay === true && d1b.id === d1.id && (await val(admin, "SELECT count(*)::int FROM public.campaigns WHERE create_request_id=$1", [D1])) === 1);
  const D2 = rid();
  const concD = await Promise.all(Array.from({ length: 10 }, async () => {
    const c = await newClient("service_role");
    const r = await tryq(c, "SELECT public.campaign_admin_duplicate($1,$2,$3,NULL) r", [OWNER, D2, c1.id]);
    await c.end();
    opened.delete(c);
    return r;
  }));
  const dupIds = new Set(concD.filter((x) => x.ok).map((x) => x.rows[0].r.id));
  check("D05 10 eşzamanlı kopya (aynı istek) → tek kopya, teknikler tek kez", concD.every((x) => x.ok) && dupIds.size === 1 && (await val(admin, "SELECT count(*)::int FROM public.campaign_techniques WHERE campaign_id=$1", [[...dupIds][0]])) === 3);

  const P = rid();
  const past = await create(svc, OWNER, P, { name: "Eylül (bitti)", undated: false, starts_at: "2026-09-01T07:00:00Z", ends_at: "2026-09-30T20:00:00Z" });
  const dp = await dup(svc, OWNER, rid(), past.id, "Eylül yeniden");
  const dpr = (await admin.query("SELECT name, undated, starts_at, ends_at, status FROM public.campaigns WHERE id=$1", [dp.id])).rows[0];
  check("D06 bitmiş tarihli kampanyanın kopyası tarihsiz olur; özel ad kullanılır", dpr.undated === true && dpr.starts_at === null && dpr.ends_at === null && dpr.name === "Eylül yeniden" && dpr.status === "kapali");
  const fut = await create(svc, OWNER, rid(), { name: "Aralık", undated: false, starts_at: "2099-12-01T07:00:00Z", ends_at: "2099-12-31T20:00:00Z" });
  const df = await dup(svc, OWNER, rid(), fut.id);
  check("D07 bitmemiş tarihli kampanyanın kopyası tarihleri korur", (await val(admin, "SELECT (NOT undated AND starts_at IS NOT NULL AND ends_at IS NOT NULL)::text FROM public.campaigns WHERE id=$1", [df.id])) === "true");
  const longName = "U".repeat(80);
  const ln = await create(svc, OWNER, rid(), { name: longName, undated: true });
  const dl = await tryq(svc, "SELECT public.campaign_admin_duplicate($1,$2,$3,NULL) r", [OWNER, rid(), ln.id]);
  check("D08 80 karakterlik adın kopyası ad sınırını aşmaz", dl.ok && (await val(admin, "SELECT char_length(name)::int FROM public.campaigns WHERE id=$1", [dl.rows[0].r.id])) === 80);
  const b0 = await count();
  const nf = await tryq(svc, "SELECT public.campaign_admin_duplicate($1,$2,$3,NULL)", [OWNER, rid(), rid()]);
  check("D09 olmayan kaynak → CAMPAIGN_NOT_FOUND, kayıt yok", !nf.ok && /CAMPAIGN_NOT_FOUND/.test(nf.msg) && (await count()) === b0);
  for (const [n, who] of [["admin", ADMIN], ["demo", DEMO], ["uzman", EXPERT]]) {
    const r = await tryq(svc, "SELECT public.campaign_admin_duplicate($1,$2,$3,NULL)", [who, rid(), c1.id]);
    check(`D10 Owner olmayan (${n}) kopyalayamaz (42501)`, !r.ok && r.code === "42501", r.msg);
  }
  check("D11 reddedilen kopyalar kayıt bırakmaz", (await count()) === b0);
  const crossR = await dup(svc, OWNER, R1, past.id);
  check("D12 oluşturma kimliği kopyada yeniden kullanılırsa ilk kayıt döner (kopya yapılmaz)", crossR.replay === true && crossR.id === c1.id && (await count()) === b0);
  check("D13 kopya denetim kaydına kaynakla yazılır", (await val(admin, "SELECT count(*)::int FROM public.campaign_audit_log WHERE action='campaign_duplicate' AND campaign_id=$1 AND detail->>'source'=$2", [d1.id, c1.id])) === 1);

  // ── Yetki / güvenlik ──
  for (const role of ["anon", "authenticated"]) {
    const c = await newClient(role);
    const a = await tryq(c, "SELECT public.campaign_admin_create($1,$2,'{}'::jsonb)", [OWNER, rid()]);
    const b = await tryq(c, "SELECT public.campaign_admin_duplicate($1,$2,$3,NULL)", [OWNER, rid(), c1.id]);
    check(`G01 ${role} iki RPC'yi de çalıştıramaz`, a.code === "42501" && b.code === "42501", `${a.code}/${b.code}`);
  }
  const defs = (await admin.query("SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('campaign_admin_create','campaign_admin_duplicate') ORDER BY proname")).rows;
  check("G02 iki RPC de SECURITY DEFINER + sabit search_path", defs.length === 2 && defs.every((x) => x.prosecdef && (x.proconfig ?? []).some((s) => s === "search_path=pg_catalog, public, pg_temp")));
  const upd = await tryq(svc, "UPDATE public.campaigns SET create_request_id = gen_random_uuid() WHERE id=$1", [c1.id]);
  const ins = await tryq(svc, "INSERT INTO public.campaigns (name, created_by, updated_by) VALUES ('x',$1,$1)", [OWNER]);
  check("G03 service_role campaigns tablosuna doğrudan yazamaz (yalnız RPC)", upd.code === "42501" && ins.code === "42501", `${upd.code}/${ins.code}`);
  const idx = await val(admin, "SELECT count(*)::int FROM pg_indexes WHERE indexname='campaigns_create_request_uq' AND indexdef ILIKE '%UNIQUE%'");
  check("G04 create_request_id kısmi tekil indeksi var", idx === 1);
  const dupKey = await tryq(admin, "UPDATE public.campaigns SET create_request_id=$1 WHERE id=$2", [R1, past.id]);
  check("G05 aynı create_request_id iki kampanyada olamaz (23505)", dupKey.code === "23505");
  check("G06 tek yayındaki kampanya indeksi korunur", (await val(admin, "SELECT count(*)::int FROM pg_indexes WHERE indexname='campaigns_single_live_uq'")) === 1);
  const rls = await val(admin, "SELECT bool_and(relrowsecurity)::text FROM pg_class WHERE relname IN ('campaigns','campaign_techniques') AND relnamespace='public'::regnamespace");
  check("G07 RLS açık kalır (campaigns, campaign_techniques)", rls === "true");
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
console.log(`\ncampaign-admin: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
