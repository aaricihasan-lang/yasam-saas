/**
 * DEMO VİTRİN — Doğaltaş sentetik vitrin HARNESS'i (DEMO-DATA-01 / 03).
 *
 * Production'a SIFIR temas: embedded-postgres (127.0.0.1) + PROD ile birebir kolonlu stones / minerals /
 * stone_knowledge_articles / stone_knowledge_categories / stone_exclusions + GERÇEK Next route handler'ları.
 *
 *   A) SAF: fixture kalitesi + taksonomi + 42 mineral uyumu + owner referansı YOK + migration = üretici
 *      + owner→demo bypass (ADMIN_LIBRARY) kodda YOK + version benzersizliği.
 *   B) DB/route: kilitler, idempotency, demo liste/sayaç/ilk-referans/detay/arama/makaleler,
 *      demo yazmaları DB'yi DEĞİŞTİRMEZ, tenant izolasyonu (demo↔owner↔başka uzman).
 *
 * Çalıştır: npx tsx scripts/demo-vitrin/dogaltasHarness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { startAnamnezTestEnv, SERVICE_KEY, ANON_KEY } from "../anamnez/testEnv";
import { startEmbedShim } from "../dogal-destek-p2/beslenme/pgrestEmbedShim";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const MIG_DIR = path.join(process.cwd(), "supabase", "migrations");
const MIG = "20271006400000_demo_vitrin_dogaltas_seed.sql";
const OWNER_TENANT = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

type Json = Record<string, unknown>;
type Auth = { id: string; token: string };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: unknown, method: string, params: Record<string, string>, auth: Auth, body?: unknown, query = "") {
  const headers: Record<string, string> = { "x-user-id": auth.id, "x-session-token": auth.token };
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  let json: Json = {};
  try { json = (await res.clone().json()) as Json; } catch { json = {}; }
  return { status: res.status, json };
}

// PROD ile birebir kolonlar (2026-10-04 salt-okunur information_schema teyidi).
const DDL = `
create table public.stones (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, stone_name text not null, short_description text,
  general_info text, source_note text, physical_effects text, spiritual_effects text, other_effects text, warning_text text,
  warning_tags jsonb default '[]'::jsonb, feng_shui text, meditation text, care text, application text,
  chakras jsonb default '[]'::jsonb, assignments jsonb default '{}'::jsonb, images jsonb default '[]'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(), image_upload_failed boolean default false,
  origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz,
  constraint stones_origin_type_chk check (origin_type is null or origin_type = any (array['admin_transfer','expert_created','legacy']))
);
create table public.minerals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, source_id text, name text, aciklama text,
  organ_etkileri jsonb default '[]'::jsonb, fiziksel jsonb default '[]'::jsonb, zihinsel jsonb default '[]'::jsonb,
  cakralar jsonb default '[]'::jsonb, fizyoloji jsonb default '[]'::jsonb, eksiklik_belirtileri jsonb default '[]'::jsonb,
  fazlalik_belirtileri jsonb default '[]'::jsonb, doz_asimi jsonb default '[]'::jsonb, iceren_taslar jsonb default '[]'::jsonb,
  kategori text, created_at timestamptz default now(), origin_type text, origin_label text, origin_source_id uuid,
  origin_transfer_batch_id uuid, transferred_at timestamptz, updated_at timestamptz not null default now()
);
create table public.stone_exclusions (tenant_id uuid not null, stone_id uuid not null, excluded_at timestamptz default now(), primary key (tenant_id, stone_id));
create table public.stone_knowledge_categories (
  id uuid primary key default gen_random_uuid(), name text not null, slug text, icon text, color text, sort_order int default 0,
  is_active boolean default true, created_at timestamptz default now(), updated_at timestamptz default now()
);
insert into public.stone_knowledge_categories(name, slug, sort_order) values
  ('Şifa','sifa',1),('Araştırma','arastirma',2),('Mineroloji','mineroloji',3),('Uygulamalar','uygulamalar',4),('Genel','genel',5);
create table public.stone_knowledge_articles (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, title text not null, content text not null default '',
  category text not null default 'Genel', sub_category text not null default '', tags text[] not null default '{}',
  related_stones text[] not null default '{}', related_minerals text[] not null default '{}', source text not null default '',
  source_section text not null default '', keyword text not null default '', notes text not null default '',
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz,
  constraint stone_knowledge_articles_origin_type_chk check (origin_type is null or origin_type = any (array['admin_transfer','expert_created','legacy']))
);
grant select, insert, update, delete on all tables in schema public to service_role;
`;

async function main(): Promise<void> {
  // ═════════════════════════ A) SAF ═════════════════════════
  const fx = await import("../../lib/demo/demoDogaltasFixture");
  const tax = await import("../../lib/dogaltas/stoneTaxonomy");
  const scope = await import("../../lib/dogaltas/stoneTenantScope");
  const { buildDogaltasSeedSql } = await import("./buildDogaltasSeedSql");
  const listFetch = await import("../../lib/dogaltas/stonesListFetch");

  section("A1 Sentetik taş vitrini — kalite + taksonomi");
  const S = fx.DEMO_STONES_SEED;
  ok(S.length >= 15 && S.length <= 25, `taş sayısı 15–25 (${S.length})`);
  ok(new Set(S.map((s) => s.id)).size === S.length && new Set(S.map((s) => s.stone_name)).size === S.length, "id ve adlar benzersiz");
  const TEXT = ["short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects",
    "warning_text", "feng_shui", "meditation", "care", "application"] as const;
  ok(S.every((s) => TEXT.every((k) => typeof s[k] === "string" && s[k].trim().length >= 20)), "her taşın 11 metin alanı dolu");
  ok(S.every((s) => s.chakras.length > 0 && s.chakras.every((c) => (tax.STONE_CHAKRA_OPTIONS as readonly string[]).includes(c))), "çakralar kanonik taksonomide");
  ok(S.every((s) => s.warning_tags.length > 0 && s.warning_tags.every((w) => (tax.STONE_WARNING_OPTIONS as readonly string[]).includes(w))), "uyarı etiketleri kanonik taksonomide");
  const minerals = new Set<string>(fx.DEMO_TENANT_MINERAL_NAMES);
  ok(fx.DEMO_TENANT_MINERAL_NAMES.length === 42, "demo tenant mineral listesi 42");
  ok(S.every((s) => (s.assignments.Mineraller ?? []).length > 0 && s.assignments.Mineraller.every(([m]) => minerals.has(m))),
    "her taşın Mineraller ataması YALNIZ demo'nun 42 mineralinden");
  const SECTIONS = ["Elementler", "Mineraller", "Etkili Organlar", "Astrolojik Atama", "Çakra Atama", "Burçlar", "Mizaçlar", "Kan Grupları"];
  ok(S.every((s) => Object.keys(s.assignments).every((k) => SECTIONS.includes(k))), "atama anahtarları detay sayfasının bölümleriyle aynı");
  ok(S.every((s) => s.source_note.includes("SENTETİK")), "her taş açıkça SENTETİK işaretli");
  ok(S.every((s) => !/tedavi eder|iyileştirir|kesin etki/i.test(Object.values(s).join(" "))), "tıbbi vaat ifadesi yok");
  const sorted = [...S].sort((a, b) => (a.stone_name < b.stone_name ? -1 : 1));
  ok(sorted[0].stone_name === "AGAT", "alfabetik ilk (demo referans) taş: AGAT");

  section("A2 Sentetik makaleler");
  const A = fx.DEMO_ARTICLES_SEED;
  ok(A.length >= 5 && A.length <= 8, `makale sayısı 5–8 (${A.length})`);
  ok(A.every((a) => ["Şifa", "Araştırma", "Mineroloji", "Uygulamalar", "Genel"].includes(a.category)), "kategoriler mevcut 5 kategoriden");
  ok(A.every((a) => a.content.includes("SENTETİK") && a.content.length > 200), "makaleler dolu + SENTETİK işaretli");
  ok(A.every((a) => a.related_minerals.every((m) => minerals.has(m))), "makale mineralleri demo'nun 42 mineralinden");
  ok(A.every((a) => a.related_stones.every((n) => S.some((s) => s.stone_name === n))), "makale taş referansları sentetik taşlar");

  section("A3 Güvenlik: owner verisi/bypass YOK");
  const sql = readFileSync(path.join(MIG_DIR, MIG), "utf8").split("\r\n").join("\n");
  ok(sql === buildDogaltasSeedSql(), `${MIG} = üretici çıktısı`);
  ok(!sql.includes(OWNER_TENANT) && !src("lib/demo/demoDogaltasFixture.ts").includes(OWNER_TENANT), "migration/fixture owner tenant id'si İÇERMEZ");
  ok(!/"images":\s*\[\s*\{/.test(sql) && /'\[\]'::jsonb, \(now\(\)/.test(sql), "görsel yok (images=[]) → owner storage referansı yok");
  ok(JSON.stringify(scope.stoneReadTenantIds("x", true)) === JSON.stringify(["x"]), "stoneReadTenantIds(demo) = yalnız kendi tenant'ı (bypass yok)");
  ok(["lib/dogaltas/stoneTenantScope.ts", "app/api/dogaltas/stones/route.ts", "app/api/dogaltas/stones/[id]/route.ts", "app/api/dogaltas/minerals/route.ts", "app/api/dogaltas/knowledge/route.ts"]
     .every((f) => !src(f).split("\n").some((l) => !/^\s*(\*|\/\/)/.test(l) && /ADMIN_LIBRARY_TENANT_ID/.test(l))), "Doğaltaş okuma yollarında ADMIN_LIBRARY_TENANT_ID kullanımı YOK (bypass geri gelmedi)");
  const versions = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).map((f) => f.split("_")[0]);
  ok(versions.filter((v) => v === "20271006400000").length === 1, "20271006400000 version'ı benzersiz");

  // ═════════════════════════ B) DB + ROUTE ═════════════════════════
  const env = await startAnamnezTestEnv({ port: 54861, dirName: "demo-dogaltas-pgdata", extraSql: [DDL] });
  const pool = new pg.Pool({ host: "127.0.0.1", port: 54861, user: "postgres", password: "testpw", database: "postgres", max: 12 });
  const shim = await startEmbedShim(pool);
  process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const q = async (s: string, a: unknown[] = []) => (await su.query(s, a)).rows;
  const q1 = async (s: string, a: unknown[] = []) => (await q(s, a))[0];
  try {
    const DT = fx.DEMO_TENANT_ID;
    const XT = randomUUID();
    await q(`insert into public.tenants(id,name) values ($1,'demo'),($2,'owner'),($3,'other')`, [DT, OWNER_TENANT, XT]);
    const perms = JSON.stringify({ stones: true, clients: true });
    const mk = async (email: string, tenant: string, demo: boolean): Promise<Auth> => {
      const id = randomUUID(); const token = `zz-dogaltas-${id.slice(0, 8)}`;
      await q(`insert into public.users(id,email,role,active,approval_status,module_permissions,package_type,plan,tenant_id,is_demo_account,membership_status)
               values ($1,$2,'expert',true,'approved',$3,'premium','premium',$4,$5,'active')`, [id, email, perms, tenant, demo]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const DEMO = await mk("uzman@test.com", DT, true);
    const OWNER = await mk("zz.owner@example.test", OWNER_TENANT, false);
    const OTHER = await mk("zz.other@example.test", XT, false);
    const ownerStone = (await q1(`insert into public.stones(tenant_id, stone_name, general_info) values ($1,'ZZ OWNER GERÇEK TAŞ','owner-özel içerik') returning id`, [OWNER_TENANT])).id as string;
    await q(`insert into public.stone_knowledge_articles(tenant_id, title, content) values ($1,'ZZ OWNER MAKALE','owner-özel')`, [OWNER_TENANT]);
    for (const m of ["SİLİSYUM", "DEMİR"]) await q(`insert into public.minerals(tenant_id, name) values ($1,$2)`, [DT, m]);
    await q(`insert into public.minerals(tenant_id, name) values ($1,'ZZ OWNER MİNERAL')`, [OWNER_TENANT]);

    section("B1 Migration kilitleri");
    const intruder = randomUUID();
    await q(`insert into public.users(id,email,role,tenant_id,is_demo_account) values ($1,'zz.intruder@example.test','expert',$2,false)`, [intruder, DT]);
    let threw = false;
    try { await su.query(sql); } catch (e) { threw = String(e).includes("demo-olmayan"); await su.query("ROLLBACK").catch(() => {}); }
    ok(threw && Number((await q1(`select count(*) c from stones where tenant_id=$1`, [DT])).c) === 0, "demo-olmayan kullanıcı varsa DURUR, hiçbir şey yazmaz");
    await q(`delete from public.users where id=$1`, [intruder]);
    const foreignId = fx.DEMO_STONES_SEED[3].id;
    await q(`insert into public.stones(id, tenant_id, stone_name) values ($1,$2,'ZZ çakışma')`, [foreignId, XT]);
    threw = false;
    try { await su.query(sql); } catch (e) { threw = String(e).includes("başka tenantta"); await su.query("ROLLBACK").catch(() => {}); }
    ok(threw, "sabit id başka tenant'ta varsa DURUR (overwrite/çakışma yok)");
    await q(`delete from public.stones where id=$1`, [foreignId]);

    section("B2 Migration: uygula + tekrar uygula (idempotent, overwrite yok)");
    await su.query(sql);
    const c1 = [Number((await q1(`select count(*) c from stones where tenant_id=$1`, [DT])).c), Number((await q1(`select count(*) c from stone_knowledge_articles where tenant_id=$1`, [DT])).c)];
    ok(c1[0] === S.length && c1[1] === A.length, `demo: ${c1[0]} taş, ${c1[1]} makale`, c1);
    await q(`update stones set short_description='ZZ elle değişti' where id=$1`, [S[0].id]);
    await su.query(sql);
    const c2 = [Number((await q1(`select count(*) c from stones where tenant_id=$1`, [DT])).c), Number((await q1(`select count(*) c from stone_knowledge_articles where tenant_id=$1`, [DT])).c)];
    ok(JSON.stringify(c1) === JSON.stringify(c2), "ikinci uygulama duplicate üretmez");
    ok((await q1(`select short_description d from stones where id=$1`, [S[0].id])).d === "ZZ elle değişti", "mevcut satır OVERWRITE edilmez");
    await q(`update stones set short_description=$2 where id=$1`, [S[0].id, S[0].short_description]);
    ok(Number((await q1(`select count(*) c from stones where tenant_id=$1`, [OWNER_TENANT])).c) === 1, "owner tenant'ına dokunulmadı");
    ok(Number((await q1(`select count(*) c from stones where images <> '[]'::jsonb and tenant_id=$1`, [DT])).c) === 0, "sentetik taşlarda görsel yok");

    const stonesRoute = await import("../../app/api/dogaltas/stones/route");
    const stoneOne = await import("../../app/api/dogaltas/stones/[id]/route");
    const bulkDel = await import("../../app/api/dogaltas/stones/bulk-delete/route");
    const knowledge = await import("../../app/api/dogaltas/knowledge/route");
    const knowledgeCats = await import("../../app/api/dogaltas/knowledge/categories/route");
    const mineralsRoute = await import("../../app/api/dogaltas/minerals/route");
    const exclusions = await import("../../app/api/dogaltas/stone-exclusions/route");

    section("B3 Demo: liste / sayaç / ilk referans / detay");
    const lst = await call(stonesRoute.GET, "GET", {}, DEMO, undefined, "?mode=list&limit=50&withCount=1");
    const rows = (lst.json.rows as Json[]) ?? [];
    ok(lst.status === 200 && lst.json.count === S.length && rows.length === S.length, `toplam=${lst.json.count}, yüklü=${rows.length}`, lst.json.count);
    ok(rows[0]?.stone_name === "AGAT", "ilk satır (demo referans taşı) AGAT", rows[0]?.stone_name);
    ok(rows.every((r) => !String(r.stone_name).includes("OWNER")), "listede owner taşı YOK");
    const imgCount = rows.reduce((n, r) => n + listFetch.stoneListImageCount(r.images), 0);
    ok(imgCount === 0, "görsel sayacı 0 (yanlış pozitif yok)");
    const ref = await call(stonesRoute.GET, "GET", {}, DEMO, undefined, "?mode=list&limit=1");
    ok(((ref.json.rows as Json[]) ?? [])[0]?.id === S.find((s) => s.stone_name === "AGAT")!.id, "getDemoReferenceStoneId sorgusu (limit=1) AGAT'ı döndürür");
    const page2 = await call(stonesRoute.GET, "GET", {}, DEMO, undefined, "?mode=list&limit=12&offset=12&withCount=1");
    ok(((page2.json.rows as Json[]) ?? []).length === S.length - 12 && page2.json.count === S.length, "sayfalama: 2. sayfa doğru");
    const cnt = await call(stonesRoute.GET, "GET", {}, DEMO, undefined, "?mode=count");
    ok(cnt.json.count === S.length, "mode=count = taş sayısı");
    for (const s of [S[0], S[10], S[19]]) {
      const d = await call(stoneOne.GET, "GET", { id: s.id }, DEMO);
      const body = JSON.stringify(d.json);
      ok(d.status === 200 && body.includes(s.stone_name) && body.includes("SENTETİK"), `detay açılır: ${s.stone_name}`, d.status);
    }
    const ownerRead = await call(stoneOne.GET, "GET", { id: ownerStone }, DEMO);
    ok(ownerRead.status === 404 || ownerRead.status === 403, "demo owner'ın GERÇEK taşını OKUYAMAZ", ownerRead.status);

    section("B4 Arama (uygulamanın ürettiği Türkçe-duyarsız regex, PostgREST imatch ≡ ~*)");
    for (const [term, expect] of [["ametist", "AMETİST"], ["sitrin", "SİTRİN"], ["kaplan", "KAPLAN GÖZÜ"], ["selenit", "SELENİT"]] as const) {
      const or = listFetch.buildStonesListSearchOrFilter(term, "name") ?? "";
      const m = /imatch\."(.*)"$/.exec(or.split(",")[0]);
      const re = m ? m[1] : "";
      const hit = await q(`select stone_name from stones where tenant_id=$1 and stone_name ~* $2`, [DT, re]);
      ok(hit.some((h) => h.stone_name === expect), `"${term}" → ${expect}`, hit.map((h) => h.stone_name));
    }

    section("B5 Taş Bilgi Kütüphanesi");
    const kn = await call(knowledge.GET, "GET", {}, DEMO);
    const arts = ((kn.json.rows ?? kn.json.articles) as Json[]) ?? [];
    ok(kn.status === 200 && arts.length === A.length, `demo makale sayısı ${arts.length}`, kn.json);
    ok(arts.every((a) => !String(a.title).includes("OWNER")), "owner makalesi demoya görünmez");
    const kc = await call(knowledgeCats.GET, "GET", {}, DEMO);
    ok(kc.status === 200, "kategoriler okunur");

    section("B6 Mineral 'tümü' modu (DEMO-DATA-02: değişmedi)");
    const mall = await call(mineralsRoute.GET, "GET", {}, DEMO, undefined, "?mode=all");
    const mrows = (mall.json.rows as Json[]) ?? [];
    ok(mall.status === 200 && mrows.length === 2 && mrows.every((r) => !String(r.name).includes("OWNER")), "yalnız demo'nun kendi mineralleri (owner birleşimi yok)", mrows.map((r) => r.name));

    section("B7 Demo yazmaları veritabanını DEĞİŞTİRMEZ");
    const snap = async () => JSON.stringify(await q(`select tenant_id, count(*)::int n, max(updated_at)::text u from stones group by 1 order by 1`))
      + JSON.stringify(await q(`select tenant_id, count(*)::int n from stone_knowledge_articles group by 1 order by 1`))
      + JSON.stringify(await q(`select count(*)::int n from stone_exclusions`));
    const before = await snap();
    const W: [string, unknown, string, Record<string, string>, unknown][] = [
      ["taş ekle", stonesRoute.POST, "POST", {}, { stone_name: "ZZ DEMO YAZMA" }],
      ["taş düzenle", stoneOne.PATCH, "PATCH", { id: S[0].id }, { short_description: "x" }],
      ["taş sil", stoneOne.DELETE, "DELETE", { id: S[0].id }, {}],
      ["toplu sil", bulkDel.POST, "POST", {}, { ids: [S[1].id, S[2].id] }],
      ["makale ekle", knowledge.POST, "POST", {}, { title: "x", content: "y", category: "Genel" }],
      ["gizle (exclusion)", exclusions.POST, "POST", {}, { stoneIds: [S[3].id] }],
    ];
    for (const [label, h, m, p, b] of W) {
      if (typeof h !== "function") { ok(false, `handler yok: ${label}`); continue; }
      const r = await call(h, m, p, DEMO, b);
      ok(r.status === 403 || (r.status === 200 && r.json.demo === true), `${label} → ${r.status}${r.json.demo ? " demo" : ""}`, r.json);
    }
    ok((await snap()) === before, "tüm demo yazma denemelerinden sonra veritabanı DEĞİŞMEDİ");

    section("B8 Tenant izolasyonu (owner / başka uzman)");
    const ol = await call(stonesRoute.GET, "GET", {}, OWNER, undefined, "?mode=list&limit=50&withCount=1");
    ok(ol.json.count === 1 && ((ol.json.rows as Json[]) ?? []).every((r) => !String(r.id).startsWith("de5a0020")), "owner listesinde demo sentetik taşı YOK");
    ok([403, 404].includes((await call(stoneOne.GET, "GET", { id: S[0].id }, OWNER)).status), "owner demo taşını detayda göremez");
    const xl = await call(stonesRoute.GET, "GET", {}, OTHER, undefined, "?mode=list&limit=50&withCount=1");
    ok(xl.json.count === 0, "başka uzman demo/owner taşı görmez");
    ok([403, 404].includes((await call(stoneOne.GET, "GET", { id: S[0].id }, OTHER)).status), "başka uzman demo taşını detayda göremez");
    const okn = await call(knowledge.GET, "GET", {}, OWNER);
    ok(((okn.json.rows ?? okn.json.articles) as Json[] ?? []).every((a) => !String(a.id).startsWith("de5a0021")), "owner makale listesinde demo makalesi YOK");
  } finally {
    await shim.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await env.stop();
  }

  console.log(`\nDEMO DOĞALTAŞ HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { for (const f of failures) console.error(`  - ${f}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
