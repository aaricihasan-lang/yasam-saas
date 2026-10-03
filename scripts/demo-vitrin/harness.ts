/**
 * DEMO VİTRİN — uzman@test.com eksiksizlik HARNESS'i (AŞAMA 2).
 *
 * Production'a SIFIR temas: geçici embedded-postgres (127.0.0.1) + GERÇEK repo migration'ları
 * (anamnez + consents + combinations + charges + tüm nutrition zinciri + BU işin 3 migration'ı) +
 * PROD ile birebir kolonlu legacy danışan tabloları + GERÇEK Next route handler'ları.
 *
 * Kapsam:
 *   A) SAF kurallar: Dijital İçerik demo kuralı (sunucu+istemci), route guard, Premium/Beslenme,
 *      sekme kaydı + YH sekme izni + ?tab=ucretlendirme, demo fetch kapısı, YH fixture, statik
 *      kod sözleşmeleri (paralel demo sayfası yok, seed SQL üreticiyle birebir).
 *   B) DB + route: seed idempotent + kilitler, YH izni migration'ı, çöp danışan temizliği,
 *      demo okumaları (tüm sekmeler + Word + YH), demo yazmaları → 403 + DB değişmez,
 *      tenant izolasyonu, gerçek uzman/izinsiz uzman regresyonu.
 *
 * Çalıştır: npx tsx scripts/demo-vitrin/harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { startAnamnezTestEnv, SERVICE_KEY, ANON_KEY, type TestEnv } from "../anamnez/testEnv";
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
const readMig = (f: string) => readFileSync(path.join(MIG_DIR, f), "utf8");

type Json = Record<string, unknown>;
type Auth = { id: string; token: string };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: unknown, method: string, params: Record<string, string>, auth: Auth | null, body?: unknown, query = "") {
  const headers: Record<string, string> = {};
  if (auth) { headers["x-user-id"] = auth.id; headers["x-session-token"] = auth.token; }
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (typeof handler !== "function") throw new Error(`handler yok (${method})`);
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  const ct = res.headers.get("content-type") ?? "";
  let json: Json = {};
  let bytes = 0;
  if (ct.includes("application/json")) {
    try { json = (await res.clone().json()) as Json; } catch { json = {}; }
  } else {
    bytes = (await res.clone().arrayBuffer()).byteLength;
  }
  return { status: res.status, json, ct, bytes };
}

// PROD ile birebir legacy kolonlar (2026-10-03 salt-okunur information_schema teyidi).
const LEGACY_DDL = `
create table public.appointments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  user_id uuid, title text not null, appointment_date timestamptz, notes text, created_at timestamptz default now(), status text default 'bekliyor'
);
create table public.client_analyses (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  analysis_type text, analysis_data jsonb, note text, created_at timestamptz default now(), image_url text
);
create table public.client_homeworks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  title text, homework_type text, description text, start_date date, end_date date, status text default 'devam',
  expert_note text, client_feedback text, created_at timestamptz default now(), alert_dismissed_at timestamptz
);
create table public.client_sessions (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade, tenant_id uuid not null,
  tarih text, ozet text, bilgi text, created_at timestamptz default now(), session_date date, session_type text, duration_minutes integer,
  fee numeric, session_note text, actions_done text, suggestions text, next_plan text
);
create table public.client_stones (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  stone_name text, stone_type text, note text, created_at timestamptz default now(), usage_area text, combination_text text,
  warning_text text, other_notes text, image_url text, stone_date date
);
create table public.client_stone_photos (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  stone_id uuid references public.client_stones(id) on delete cascade, file_path text, image_url text, created_at timestamptz default now()
);
create table public.yasam_hafizasi_client_outbox (id bigserial primary key, tenant_id uuid, client_id uuid, created_at timestamptz default now());
`;
const PRE_SQL = `
drop table if exists public.nutrition_client_allergens, public.nutrition_client_measurements,
  public.nutrition_client_profiles, public.nutrition_allergens cascade;
alter table public.clients add constraint zz_clients_tenant_id_id_key unique (tenant_id, id);
create or replace function public.set_updated_at() returns trigger language plpgsql as $f$
  begin new.updated_at = now(); return new; end; $f$;
create or replace function public.yh_immutable_unaccent(text) returns text
  language sql immutable parallel safe as $f$ select $1 $f$;
`;
const GRANTS = `grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;`;

const SEED_MIG = "20271005300000_demo_vitrin_fixture_seed.sql";
const YH_MIG = "20271005300100_demo_vitrin_yh_permission.sql";
const JUNK_MIG = "20271005300200_demo_vitrin_junk_client_cleanup.sql";

async function main(): Promise<void> {
  // ═════════════════════════ A) SAF KURALLAR ═════════════════════════
  const core = await import("../../lib/auth/moduleAccessCore");
  const perms = await import("../../lib/auth/modulePermissions");
  const hub = await import("../../lib/auth/hubVisibility");
  const routeGuard = await import("../../lib/auth/routeModuleAccess");
  const tabs = await import("../../lib/danisan/clientDetailTabs");
  const guardLib = await import("../../lib/demo/demoReadOnlyFetchGuard");
  const fx = await import("../../lib/demo/demoVitrinFixture");
  const yhFx = await import("../../lib/demo/demoYasamHafizasi");
  const { CLIENT_MODULE_DETAIL_TAB } = await import("../../lib/yasam-hafizasi/client/clientSources");
  const { buildSeedSql } = await import("./buildSeedSql");

  // Prod'daki uzman@test.com izin JSON'u (2026-10-03 admin GET ile okundu) + AŞAMA 2 YH izni.
  const DEMO_PERMS_PROD = {
    stok: true, stones: true, clients: true, cupping: true, beslenme: true, ders_notu: false, numerology: true,
    energy_body: true, reflexology: true, appointments: true, aromatherapy: true, belge_ceviri: false,
    human_design: true, sifa_rehberi: true, video_ceviri: false, cosmic_calendar: true, digital_content: true,
    personal_archive: true,
  };
  const DEMO_PERMS = { ...DEMO_PERMS_PROD, yasam_hafizasi: true };
  // "Yeniden Premium'a alındı / varsayılan paket uygulandı" senaryosu: belge_ceviri + AI bayrakları true.
  const DEMO_PERMS_REGRADED = { ...DEMO_PERMS, ...perms.buildPremiumModulePermissionsPayload(), video_ceviri: true, ders_notu: true, belge_ceviri: true };
  const expert = (p: Record<string, boolean>, demo: boolean) =>
    ({ id: "u", role: "expert", package_type: "premium", plan: "premium", active: true, approval_status: "approved",
       membership_status: "active", module_permissions: p, is_demo_account: demo }) as never;

  section("A1 Dijital İçerik — demo kuralı KODDA (sunucu resolveModuleAccess)");
  for (const p of [DEMO_PERMS, DEMO_PERMS_REGRADED]) {
    const tag = p === DEMO_PERMS ? "mevcut izin" : "yeniden-Premium";
    ok(core.resolveModuleAccess("expert", p, "personal_archive", { isDemo: true }) === true, `demo personal_archive açık (${tag})`);
    for (const k of ["belge_ceviri", "belge_ceviri_ai", "video_ceviri", "ders_notu"]) {
      ok(core.resolveModuleAccess("expert", p, k, { isDemo: true }) === false, `demo ${k} KAPALI (${tag})`);
    }
    ok(core.resolveModuleAccess("expert", p, "digital_content", { isDemo: true }) === true, `demo digital_content hub açık (${tag})`);
  }
  ok(core.resolveModuleAccess("expert", { belge_ceviri: true }, "digital_content", { isDemo: true }) === false,
    "demo: yalnız belge_ceviri hub'ı AÇMAZ");
  ok(core.resolveModuleAccess("expert", { belge_ceviri: true }, "belge_ceviri") === true, "regresyon: gerçek uzman belge_ceviri izniyle açık");
  ok(core.resolveModuleAccess("expert", { belge_ceviri: true }, "digital_content") === true, "regresyon: gerçek uzman hub belge_ceviri ile açık");
  ok(core.resolveModuleAccess("expert", { video_ceviri: true }, "video_ceviri") === false, "regresyon: video_ceviri uzmanda admin-only");
  ok(core.resolveModuleAccess("admin", {}, "belge_ceviri", { isDemo: true }) === true, "admin her şeyi geçer");

  section("A2 Dijital İçerik — istemci (hub kartları + route guard) aynı kural");
  for (const p of [DEMO_PERMS, DEMO_PERMS_REGRADED]) {
    const u = expert(p, true);
    const vis = hub.visibleHubChildren(u, hub.DIGITAL_CONTENT_HUB_CHILDREN).map((c) => c.id);
    ok(JSON.stringify(vis) === JSON.stringify(["personal_archive"]), `demo DC alt kartları = [Kişisel Arşiv] (${p === DEMO_PERMS ? "mevcut" : "yeniden-Premium"})`, vis);
    ok(perms.hasModulePermission(u, "belge_ceviri") === false, "demo hasModulePermission(belge_ceviri)=false");
    ok(perms.hasModulePermission(u, "digital_content") === true, "demo hasModulePermission(digital_content)=true");
    for (const [route, want] of [["/belge-ceviri", "deny"], ["/video-ceviri", "deny"], ["/ders-notu", "deny"], ["/digital-content", "allow"], ["/dashboard/kisisel-arsiv", "allow"]] as const) {
      ok(routeGuard.evaluateRouteModuleGuard(route, u) === want, `demo route ${route} → ${want}`);
    }
  }
  const real = expert({ ...DEMO_PERMS, belge_ceviri: true }, false);
  ok(JSON.stringify(hub.visibleHubChildren(real, hub.DIGITAL_CONTENT_HUB_CHILDREN).map((c) => c.id)) === JSON.stringify(["personal_archive", "belge_ceviri"]),
    "regresyon: gerçek uzman (belge_ceviri izinli) DC'de Arşiv + Belge Çeviri görür");
  ok(routeGuard.evaluateRouteModuleGuard("/belge-ceviri", real) === "allow", "regresyon: gerçek uzman /belge-ceviri allow");

  section("A3 Ana hub + alt hub (demo, YH izni dahil)");
  const demoU = expert(DEMO_PERMS, true);
  for (const r of ["/danisan-yolculugu", "/yasam-hafizasi", "/dogaltas", "/urun-stok", "/enerji-beden", "/dashboard/biyoenerji",
    "/refleksoloji", "/kupa", "/dogal-destek", "/aromaterapi", "/sifa-rehberi", "/beslenme", "/digital-content",
    "/dashboard/kisisel-arsiv", "/life-analysis", "/numeroloji", "/human-design", "/cosmic-calendar", "/dashboard/clients/x", "/dashboard/ajanda"]) {
    ok(routeGuard.evaluateRouteModuleGuard(r, demoU) === "allow", `demo route ${r} allow`);
  }
  for (const r of ["/admin", "/admin/users", "/yebs", "/video-ceviri", "/ders-notu"]) {
    const d = routeGuard.evaluateRouteModuleGuard(r, demoU);
    ok(d === "deny" || d === "skip", `demo admin-only/AI route ${r} kapalı (${d}; /admin UI'si ayrıca admin guard'lı)`);
  }
  ok(routeGuard.evaluateRouteModuleGuard("/yasam-hafizasi", expert(DEMO_PERMS_PROD, true)) === "deny", "YH izni yokken /yasam-hafizasi deny (migration ÖNCESİ)");
  ok(JSON.stringify(hub.visibleHubChildren(demoU, hub.ENERGY_BODY_HUB_CHILDREN).map((c) => c.id)) === JSON.stringify(["energy_body", "reflexology", "cupping"]), "Enerji & Beden alt kartları tam");

  section("A4 Premium varsayılan paket — Beslenme");
  ok((perms.PREMIUM_EXPERT_MODULE_KEYS as readonly string[]).includes("beslenme"), "PREMIUM_EXPERT_MODULE_KEYS beslenme içerir");
  ok(perms.buildPremiumModulePermissionsPayload().beslenme === true, "premium payload beslenme=true");
  ok(!("yasam_hafizasi" in perms.buildPremiumModulePermissionsPayload()), "premium payload YH İÇERMEZ (atomik grade sözleşmesi korunur)");
  ok(src("app/api/register/route.ts").includes("modulePermissions: DEFAULT_MODULE_PERMISSIONS"), "kayıt (register) hâlâ fail-closed DEFAULT izinle başlar");

  section("A5 Danışan detay sekme kaydı (tek kaynak) + YH izni + ?tab=ucretlendirme");
  const page = src("app/dashboard/clients/[id]/page.tsx");
  ok(page.includes("visibleTabs.map((tab) =>") && !/<Tab label=\{t\("tab\./.test(page), "sekme çubuğu kayıttan render edilir (hard-coded <Tab> yok)");
  for (const t of tabs.CLIENT_DETAIL_TABS) ok(page.includes(`openedTabs.has("${t}")`), `sekme paneli mevcut: ${t}`);
  ok(tabs.resolveClientDetailTab("ucretlendirme") === "ucretlendirme", "DEMO-07 ?tab=ucretlendirme → Ücretlendirme");
  const withYh = tabs.visibleClientDetailTabs((k) => perms.hasModulePermission(demoU, k)).map((t) => t.id);
  const noYh = tabs.visibleClientDetailTabs((k) => perms.hasModulePermission(expert({ clients: true }, false), k)).map((t) => t.id);
  ok(withYh.length === 12 && withYh.includes("hafiza") && withYh.includes("beslenme") && withYh.includes("anamnez") && withYh.includes("ucretlendirme"),
    "demo (YH izinli) 12 sekme görür", withYh);
  ok(!noYh.includes("hafiza") && noYh.length === 11, "DEMO-03 YH izni olmayan uzman YH sekmesini GÖRMEZ", noYh);
  ok(tabs.visibleClientDetailTabs(null).every((t) => t.id !== "hafiza"), "izin henüz yüklenmedi → YH sekmesi fail-closed gizli");
  ok(tabs.resolveClientDetailTab("hafiza", tabs.visibleClientDetailTabs((k) => perms.hasModulePermission(expert({ clients: true }, false), k))) === "genel",
    "izinsiz uzman ?tab=hafiza → genel");
  ok(page.includes('openedTabs.has("hafiza") && canSeeTab("hafiza")'), "YH paneli izin olmadan render edilmez");
  ok(tabs.visibleClientDetailTabs((k) => perms.hasModulePermission(expert({}, false) as never, k)).length === 11 &&
     tabs.visibleClientDetailTabs(() => true).length === 12, "admin/izinli = 12, izinsiz = 11");
  ok(Object.values(CLIENT_MODULE_DETAIL_TAB).every((t) => (tabs.CLIENT_DETAIL_TABS as readonly string[]).includes(t)), "YH deep-link sekmeleri kayıtta");

  section("A6 Demo istemci salt-okunur kapısı (UX katmanı)");
  const blocked = [
    ["PATCH", "/api/clients/x"], ["PATCH", "/api/clients/x/notes"], ["POST", "/api/clients/x/stones"], ["DELETE", "/api/clients/x/stones"],
    ["POST", "/api/clients/x/sessions"], ["POST", "/api/clients/x/homeworks"], ["POST", "/api/clients/x/analyses"],
    ["POST", "/api/clients/x/analyses/upload-image"], ["POST", "/api/clients/x/charges"], ["POST", "/api/clients/x/anamnez"],
    ["PATCH", "/api/clients/x/anamnez/y"], ["POST", "/api/clients/x/anamnez/y/attachments/prepare"], ["POST", "/api/clients/x/consents"],
    ["DELETE", "/api/clients/x/cascade-delete"], ["POST", "/api/clients/x/stone-photos/prepare"], ["PUT", "/api/beslenme/clients/x/profile"],
    ["POST", "/api/beslenme/clients/x/plans"], ["POST", "/api/clients/x/yasam-hafizasi/snapshots"], ["POST", "/api/appointments"],
    ["PATCH", "/api/appointments/x"], ["POST", "/api/clients"],
  ];
  for (const [m, p] of blocked) ok(guardLib.isDemoBlockedRequest(m, p) === true, `kapı engeller: ${m} ${p}`);
  const allowed = [
    ["GET", "/api/clients/x/anamnez"], ["POST", "/api/clients/x/word-report"], ["POST", "/api/clients/word-report-bulk"],
    ["POST", "/api/clients/x/stone-photos/signed-urls"], ["POST", "/api/clients/x/yasam-hafizasi/search"],
    ["POST", "/api/yasam-hafizasi/search"], ["POST", "/api/yasam-hafizasi/client-search"], ["POST", "/api/beslenme/plans/x/word"],
    ["POST", "/api/auth/session"], ["POST", "/api/usage/beacon"], ["POST", "https://example.com/x"],
  ];
  for (const [m, p] of allowed) ok(guardLib.isDemoBlockedRequest(m, p.startsWith("http") ? null : p) === false, `kapı geçirir: ${m} ${p}`);

  section("A7 Paralel demo danışan mimarisi kaldırıldı (statik)");
  const liste = src("app/danisan-yolculugu/liste/page.tsx");
  ok(!liste.includes("/demo/danisan") && !liste.includes("DEMO_CLIENTS") && !liste.includes("demoSession"), "liste demo'yu fixture/paralel sayfaya YÖNLENDİRMEZ");
  ok(liste.includes("router.push(`/dashboard/clients/${id}`)"), "liste her hesap için gerçek detay sayfasını açar");
  ok(!src("app/danisan-yolculugu/page.tsx").includes("DEMO_CLIENTS"), "DY hub istatistiği demo fixture'dan hesaplanmaz");
  ok(!src("app/danisan-yolculugu/kayit/page.tsx").includes("addDemoClient"), "kayıt sayfası yerel sahte danışan üretmez");
  const legacy = src("app/demo/danisan/[id]/page.tsx");
  ok(legacy.includes("redirect(") && !legacy.includes("TABS"), "eski /demo/danisan/[id] yalnız yönlendirme");
  ok(fx.LEGACY_DEMO_CLIENT_REDIRECT["demo-0"] === fx.DEMO_CLIENT_IDS.eylul, "demo-0 → Eylül Karaca (sentetik DB kaydı)");
  ok(!readdirSync(path.join(process.cwd(), "lib/demo")).some((f) => f === "demoClients.ts" || f === "demoSession.ts"), "eski fixture modülleri kaldırıldı");

  section("A8 Seed SQL üreticiyle birebir + sentetiklik");
  ok(readMig(SEED_MIG).split("\r\n").join("\n") === buildSeedSql(), `${SEED_MIG} = buildSeedSql() çıktısı`);
  ok(fx.DEMO_CLIENTS_SEED.every((c) => /^0500 000 00 \d\d$/.test(c.telefon) && c.email.endsWith("@example.test")), "telefon/e-posta atanmamış/örnek alanda");
  ok(fx.DEMO_NOTES_SEED.every((n) => n.notlar.includes("SENTETİK")), "notlar sentetik işaretli");
  ok(new Set(fx.DEMO_CLIENTS_SEED.map((c) => c.id)).size === fx.DEMO_CLIENTS_SEED.length, "danışan id'leri benzersiz");
  // Migration version çakışması (2026-10-03 prod preflight bulgusu: 20271003200000/200100 başka işe ait).
  const versions = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).map((f) => f.split("_")[0]);
  const dupVersions = versions.filter((v, i) => versions.indexOf(v) !== i);
  ok(dupVersions.length === 0, "repo'da migration version'ları benzersiz", dupVersions);
  ok([SEED_MIG, YH_MIG, JUNK_MIG].every((m) => m.startsWith("202710053")) &&
     !readdirSync(MIG_DIR).some((f) => f.startsWith("202710053") && ![SEED_MIG, YH_MIG, JUNK_MIG].includes(f)),
    "demo vitrin migration'ları ayrı ve temiz 202710053xxxxx bloğunda");

  section("A9 Yaşam Hafızası demo fixture (saf)");
  ok(yhFx.demoYhProfessionalCandidates("uyku").length >= 3, "mesleki 'uyku' ≥3 sonuç");
  ok(yhFx.demoYhProfessionalCandidates("BOGAZ").length >= 1 && yhFx.demoYhProfessionalCandidates("boğaz").length >= 1, "Türkçe aksan-duyarsız (boğaz/BOGAZ)");
  ok(yhFx.demoYhProfessionalCandidates("").length === 0 && yhFx.demoYhProfessionalCandidates("zzqq").length === 0, "boş/eşleşmeyen sorgu → 0");
  ok(yhFx.demoYhProfessionalCandidates("uyku").every((c) => c.tenantId === fx.DEMO_TENANT_ID && c.sourceModule !== "yebs"), "mesleki sonuçlar demo tenant'ı, YEBS yok");
  const cr = yhFx.demoYhTenantClientRows("uyku", 50);
  ok(cr.length >= 2 && cr.every((r) => fx.DEMO_CLIENTS_SEED.some((c) => c.id === r.client_id)), "danışan sonuçları seed danışanlarına bağlı", cr.length);
  const seededIds = new Set<string>([
    ...fx.DEMO_NOTES_SEED, ...fx.DEMO_SESSIONS_SEED, ...fx.DEMO_HOMEWORKS_SEED, ...fx.DEMO_STONES_SEED, ...fx.DEMO_APPOINTMENTS_SEED,
  ].map((x) => x.id));
  ok(yhFx.demoYhTenantClientRows("a", 500).every((r) => seededIds.has(r.source_id)), "danışan sonuç kaynakları GERÇEK seed kayıt id'leri");
  ok(yhFx.demoYhClientRows("uyku", fx.DEMO_CLIENT_IDS.eylul, 50).length >= 1 && yhFx.demoYhClientRows("uyku", randomUUID(), 50).length === 0,
    "danışan-içi arama yalnız o danışan");

  // ═════════════════════════ B) DB + ROUTE ═════════════════════════
  const nutritionMigs = readdirSync(MIG_DIR).filter((f) => /_nutrition_.*\.sql$/.test(f)).sort();
  const env: TestEnv = await startAnamnezTestEnv({
    port: 54741,
    dirName: "demo-vitrin-pgdata",
    extraSql: [
      PRE_SQL, LEGACY_DDL,
      readMig("20260625160000_client_combinations.sql"),
      readMig("20260924062228_client_charges.sql"),
      ...nutritionMigs.map(readMig),
      GRANTS,
    ],
  });
  const pool = new pg.Pool({ host: "127.0.0.1", port: 54741, user: "postgres", password: "testpw", database: "postgres", max: 16 });
  const shim = await startEmbedShim(pool);
  process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const q = async (sql: string, args: unknown[] = []) => (await su.query(sql, args)).rows;
  const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
  console.log(`\nembedded-postgres + embed shim hazır (${shim.url}); nutrition migration: ${nutritionMigs.length}.`);

  try {
    const DT = fx.DEMO_TENANT_ID;
    const RT = randomUUID();
    await q(`insert into public.tenants(id, name) values ($1,'ZZ_DEMO_TENANT'),($2,'ZZ_REAL_TENANT')`, [DT, RT]);
    const mkUser = async (label: string, o: { tenant: string; email: string; perms: Record<string, boolean>; demo?: boolean; role?: string }): Promise<Auth> => {
      const id = randomUUID();
      const token = `zz-demo-vitrin-${label}-${id.slice(0, 8)}`;
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, membership_status)
               values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,'active')`,
        [id, `ZZ ${label}`, o.email, o.role ?? "expert", JSON.stringify(o.perms), o.tenant, o.demo === true]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const DEMO = await mkUser("demo", { tenant: DT, email: "uzman@test.com", perms: DEMO_PERMS_PROD, demo: true });
    const REAL = await mkUser("real", { tenant: RT, email: "zz.real@example.test", perms: { ...DEMO_PERMS, belge_ceviri: true } });
    const NOYH = await mkUser("noyh", { tenant: RT, email: "zz.noyh@example.test", perms: DEMO_PERMS_PROD });
    // Çöp danışan (DEMO-06) + bağlı not.
    const JUNK = "b87c0899-0ec1-4180-87a6-c3e7737e3dca";
    await q(`insert into public.clients(id, tenant_id, ad, soyad, gorusme) values ($1,$2,'lgj','kgjvn','2026-06-23')`, [JUNK, DT]);
    await q(`insert into public.client_notes(tenant_id, client_id, notlar) values ($1,$2,'x')`, [DT, JUNK]);
    const realClient = randomUUID();
    await q(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,'ZZ Gerçek','Uzman Danışanı')`, [realClient, RT]);

    section("B1 Seed migration kilitleri");
    const probe = randomUUID();
    await q(`insert into public.users(id, email, role, tenant_id, is_demo_account) values ($1,'zz.intruder@example.test','expert',$2,false)`, [probe, DT]);
    let threw = false;
    try { await su.query(readMig(SEED_MIG)); } catch (e) { threw = String(e).includes("demo-olmayan"); await su.query("ROLLBACK").catch(() => {}); }
    ok(threw, "tenant'ta demo-olmayan kullanıcı varsa seed HATA verir");
    ok(Number((await q1(`select count(*) c from clients where tenant_id=$1`, [DT])).c) === 1, "kilit tetiklenince hiçbir satır yazılmadı");
    await q(`delete from public.users where id=$1`, [probe]);

    section("B2 Seed migration (uygula + tekrar uygula = idempotent)");
    const TABLES = ["clients", "client_notes", "appointments", "client_stones", "client_sessions", "client_homeworks", "client_analyses",
      "client_charges", "client_anamneses", "client_consents", "nutrition_client_profiles", "nutrition_client_measurements",
      "nutrition_client_food_preferences", "nutrition_plans", "nutrition_plan_days", "nutrition_plan_meals", "nutrition_plan_items",
      "nutrition_plan_item_nutrients", "nutrition_plan_clients"];
    const counts = async () => {
      const out: Record<string, number> = {};
      for (const t of TABLES) out[t] = Number((await q1(`select count(*) c from public.${t} where tenant_id=$1`, [DT])).c);
      return out;
    };
    await su.query(readMig(SEED_MIG));
    const c1 = await counts();
    ok(c1.clients === 7 && c1.client_notes === 4, "6 sentetik danışan (+ çöp) ve notlar yazıldı", c1);
    ok(c1.client_anamneses === 1 && c1.client_charges === 5 && c1.nutrition_plan_items === 6 && c1.nutrition_plan_item_nutrients === 30 && c1.nutrition_plan_days === 7,
      "anamnez/ücret/plan zinciri yazıldı", c1);
    await su.query(readMig(SEED_MIG));
    ok(JSON.stringify(await counts()) === JSON.stringify(c1), "ikinci uygulama duplicate ÜRETMEZ");
    ok(Number((await q1(`select count(*) c from clients where tenant_id=$1`, [RT])).c) === 1, "gerçek tenant'a dokunulmadı");
    const { validateAnswers, validateFormCustom } = await import("../../lib/danisan/anamnez/validate");
    const an = await q1(`select answers, form_custom, template_version from client_anamneses where tenant_id=$1`, [DT]);
    const fc = validateFormCustom(an.template_version, an.form_custom);
    ok(fc.ok, "seed anamnez form_custom geçerli", fc);
    ok(fc.ok && validateAnswers(an.template_version, fc.value, an.answers).ok, "seed anamnez cevapları std-v1 doğrulamasından geçer",
      fc.ok ? validateAnswers(an.template_version, fc.value, an.answers) : null);

    section("B3 YH izni migration'ı (yalnız demo hesap)");
    await su.query(readMig(YH_MIG));
    const dp = (await q1(`select module_permissions p from users where id=$1`, [DEMO.id])).p as Record<string, boolean>;
    ok(dp.yasam_hafizasi === true && dp.belge_ceviri === false && dp.beslenme === true && dp.cupping === true, "demo: yasam_hafizasi=true, diğer izinler korunur", dp);
    const np = (await q1(`select module_permissions p from users where id=$1`, [NOYH.id])).p as Record<string, boolean>;
    ok(np.yasam_hafizasi === undefined, "başka uzmanın izni DEĞİŞMEDİ");
    await su.query(readMig(YH_MIG));
    ok(JSON.stringify((await q1(`select module_permissions p from users where id=$1`, [DEMO.id])).p) === JSON.stringify(dp), "tekrar uygulama no-op");

    section("B4 DEMO-06 çöp danışan temizliği");
    await su.query(readMig(JUNK_MIG));
    ok(!(await q1(`select 1 x from clients where id=$1`, [JUNK])), "çöp danışan silindi");
    ok(Number((await q1(`select count(*) c from client_notes where client_id=$1`, [JUNK])).c) === 0, "bağlı not CASCADE ile silindi");
    ok(Number((await q1(`select count(*) c from clients where tenant_id=$1`, [DT])).c) === 6, "demo tenant'ında yalnız 6 sentetik danışan");
    await su.query(readMig(JUNK_MIG));
    ok(true, "tekrar uygulama no-op (hata yok)");
    // Kilit: yanlış ad → durdurulur.
    await q(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,'Gerçek','Kişi')`, [JUNK, DT]);
    threw = false;
    try { await su.query(readMig(JUNK_MIG)); } catch (e) { threw = String(e).includes("beklenen test artığı değil"); await su.query("ROLLBACK").catch(() => {}); }
    ok(threw && !!(await q1(`select 1 x from clients where id=$1`, [JUNK])), "ad eşleşmezse SİLMEZ (kilit)");
    await q(`delete from clients where id=$1`, [JUNK]);

    // ── Route'lar ──
    const C = "../../app/api/clients";
    const r = {
      list: await import(`${C}/route`),
      one: await import(`${C}/[id]/route`),
      notes: await import(`${C}/[id]/notes/route`),
      appts: await import(`${C}/[id]/appointments/route`),
      stones: await import(`${C}/[id]/stones/route`),
      sessions: await import(`${C}/[id]/sessions/route`),
      homeworks: await import(`${C}/[id]/homeworks/route`),
      analyses: await import(`${C}/[id]/analyses/route`),
      charges: await import(`${C}/[id]/charges/route`),
      anamnez: await import(`${C}/[id]/anamnez/route`),
      anamnezOne: await import(`${C}/[id]/anamnez/[anamnesisId]/route`),
      anamnezPdf: await import(`${C}/[id]/anamnez/[anamnesisId]/pdf/route`),
      anamnezComplete: await import(`${C}/[id]/anamnez/[anamnesisId]/complete/route`),
      anamnezPrepare: await import(`${C}/[id]/anamnez/[anamnesisId]/attachments/prepare/route`),
      consents: await import(`${C}/[id]/consents/route`),
      combos: await import(`${C}/[id]/combinations/route`),
      cascade: await import(`${C}/[id]/cascade-delete/route`),
      word: await import(`${C}/[id]/word-report/route`),
      wordBulk: await import(`${C}/word-report-bulk/route`),
      yhClient: await import(`${C}/[id]/yasam-hafizasi/search/route`),
      yhSnap: await import(`${C}/[id]/yasam-hafizasi/snapshots/route`),
      apptOne: await import("../../app/api/appointments/[id]/route"),
      apptRoot: await import("../../app/api/appointments/route"),
      besProfile: await import("../../app/api/beslenme/clients/[clientId]/profile/route"),
      besMeas: await import("../../app/api/beslenme/clients/[clientId]/measurements/route"),
      besPrefs: await import("../../app/api/beslenme/clients/[clientId]/preferences/route"),
      besPlans: await import("../../app/api/beslenme/clients/[clientId]/plans/route"),
      besAllergens: await import("../../app/api/beslenme/clients/[clientId]/allergens/route"),
      besPlanWord: await import("../../app/api/beslenme/plans/[id]/word/route"),
      besAccess: await import("../../app/api/beslenme/access/route"),
      yhHealth: await import("../../app/api/yasam-hafizasi/health/route"),
      yhConfig: await import("../../app/api/yasam-hafizasi/config/route"),
      yhSearch: await import("../../app/api/yasam-hafizasi/search/route"),
      yhTenant: await import("../../app/api/yasam-hafizasi/client-search/route"),
    };
    const E = fx.DEMO_CLIENT_IDS.eylul;
    const P = { id: E };
    const anamId = fx.DEMO_ANAMNESES_SEED[0].id;

    section("B5 Demo okumaları — danışan listesi + detayın TÜM sekmeleri");
    const lst = await call(r.list.GET, "GET", {}, DEMO, undefined, "?limit=100");
    const names = ((lst.json.clients as Json[]) ?? []).map((c) => `${c.ad} ${c.soyad}`);
    ok(lst.status === 200 && names.length === 6 && names.includes("Eylül Karaca") && !names.some((n) => n.includes("lgj")), "liste: 6 sentetik danışan", names);
    const reads: [string, unknown, Record<string, string>, (j: Json) => boolean][] = [
      ["genel (client)", r.one.GET, P, (j) => JSON.stringify(j).includes("Eylül")],
      ["notlar", r.notes.GET, P, (j) => JSON.stringify(j).includes("SENTETİK")],
      ["randevular", r.appts.GET, P, (j) => JSON.stringify(j).includes("Kontrol seansı")],
      ["taşlar", r.stones.GET, P, (j) => JSON.stringify(j).includes("Ametist")],
      ["seanslar", r.sessions.GET, P, (j) => JSON.stringify(j).includes("Biyoenerji")],
      ["ödevler", r.homeworks.GET, P, (j) => JSON.stringify(j).includes("Uyku günlüğü")],
      ["analizler", r.analyses.GET, P, (j) => JSON.stringify(j).includes("before_chakra_bogaz")],
      ["ücretlendirme", r.charges.GET, P, (j) => JSON.stringify(j).includes("Ametist ve akuamarin")],
      ["anamnez listesi", r.anamnez.GET, P, (j) => ((j.anamneses as Json[]) ?? []).length === 1 && j.demo === undefined],
      ["anamnez detay", r.anamnezOne.GET, { id: E, anamnesisId: anamId }, (j) => JSON.stringify(j).includes("gerilim tipi")],
      ["KVKK onam geçmişi", r.consents.GET, P, (j) => ((j.history as Json[]) ?? []).length === 2],
      ["beslenme profili", r.besProfile.GET, { clientId: E }, (j) => JSON.stringify(j).includes("Karma beslenme")],
      ["beslenme ölçümleri", r.besMeas.GET, { clientId: E }, (j) => JSON.stringify(j).includes("Takip ölçümü")],
      ["beslenme tercihleri", r.besPrefs.GET, { clientId: E }, (j) => JSON.stringify(j).includes("Yulaf")],
      ["beslenme planları", r.besPlans.GET, { clientId: E }, (j) => JSON.stringify(j).includes("Dengeli enerji")],
      ["beslenme alerjenleri", r.besAllergens.GET, { clientId: E }, () => true],
    ];
    for (const [label, h, params, check] of reads) {
      const res = await call(h, "GET", params, DEMO);
      ok(res.status === 200 && check(res.json), `demo GET ${label} → 200 + sentetik veri`, { status: res.status, body: JSON.stringify(res.json).slice(0, 200) });
    }
    const pdf = await call(r.anamnezPdf.GET, "GET", { id: E, anamnesisId: anamId }, DEMO);
    ok(pdf.status === 200 && pdf.ct.includes("pdf") && pdf.bytes > 1000, "demo anamnez PDF → 200 application/pdf", { s: pdf.status, ct: pdf.ct, b: pdf.bytes });
    const acc = await call(r.besAccess.GET, "GET", {}, DEMO);
    ok(acc.status === 200 && acc.json.access === true, "demo /api/beslenme/access → access:true");

    section("B6 Word raporları (salt-okunur; demo açık)");
    const w = await call(r.word.POST, "POST", P, DEMO, { exportMode: "full" });
    ok(w.status === 200 && w.ct.includes("officedocument") && w.bytes > 5000, "demo danışan Word (tam) → 200 DOCX", { s: w.status, ct: w.ct, b: w.bytes, j: w.json });
    const wt = await call(r.word.POST, "POST", P, DEMO, { exportMode: "tab", tabName: "seanslar" });
    ok(wt.status === 200 && wt.ct.includes("officedocument"), "demo sekme Word → 200", { s: wt.status, j: wt.json });
    const wr = await call(r.word.POST, "POST", P, DEMO, { exportMode: "dateRange", dateRange: { start: "2020-01-01", end: "2099-12-31" } });
    ok(wr.status === 200 && wr.ct.includes("officedocument"), "demo tarih aralığı Word → 200", { s: wr.status, j: wr.json });
    const wb = await call(r.wordBulk.POST, "POST", {}, DEMO, { exportMode: "all" });
    ok(wb.status === 200 && wb.ct.includes("officedocument"), "demo toplu Word → 200", { s: wb.status, j: wb.json });
    const pw = await call(r.besPlanWord.POST, "POST", { id: fx.DEMO_NUTRITION_PLAN.id }, DEMO, {});
    ok(pw.status === 200 && pw.ct.includes("officedocument"), "demo beslenme planı Word → 200", { s: pw.status, j: pw.json });
    const before = await counts();
    ok(JSON.stringify(before) === JSON.stringify(await counts()), "Word üretimi DB'ye yazmaz");

    section("B7 Yaşam Hafızası (demo fixture; DB/RPC yok)");
    const h = await call(r.yhHealth.GET, "GET", {}, DEMO);
    ok(h.status === 200 && (h.json.tenantRows as number) > 0 && (h.json.flags as Json).yh_enabled === true, "health → hazır (fixture)", h.json);
    const { deriveYhCardStatus } = await import("../../lib/yasam-hafizasi/ui/healthStatus");
    ok(JSON.stringify(deriveYhCardStatus(h.json as never)).includes("ready"), "ana kart durumu 'ready'", deriveYhCardStatus(h.json as never));
    const cfg = await call(r.yhConfig.GET, "GET", {}, DEMO);
    ok(cfg.status === 200 && (cfg.json.flags as Json).yh_enabled === true, "config → açık");
    const s1 = await call(r.yhSearch.POST, "POST", {}, DEMO, { q: "uyku" });
    const res1 = (s1.json.results as Json[]) ?? [];
    ok(s1.status === 200 && res1.length >= 3 && s1.json.disabled === undefined, "mesleki arama 'uyku' → sonuç", s1.json);
    ok(res1.every((x) => typeof x.sourceLink === "string" && x.isShared === false && !("tenantId" in x)), "DTO güvenli (tenantId yok, kaynak bağlantısı allowlist)");
    const s2 = await call(r.yhTenant.POST, "POST", {}, DEMO, { q: "uyku" });
    const res2 = (s2.json.results as Json[]) ?? [];
    ok(s2.status === 200 && res2.length >= 1 && res2.every((x) => String(x.clientDeepLink).startsWith("/dashboard/clients/de5a0001-")), "tüm danışanlarda arama → seed danışan deep-link'leri", s2.json);
    ok(res2.some((x) => x.clientName === "Eylül Karaca"), "danışan adı çözülür");
    const s3 = await call(r.yhClient.POST, "POST", P, DEMO, { q: "nefes" });
    ok(s3.status === 200 && ((s3.json.results as Json[]) ?? []).length >= 1, "danışan-içi arama → sonuç", s3.json);
    const s4 = await call(r.yhClient.POST, "POST", { id: realClient }, DEMO, { q: "nefes" });
    ok(s4.status === 404, "demo başka tenant'ın danışanında YH araması yapamaz (404)", s4.status);
    const snap = await call(r.yhSnap.POST, "POST", P, DEMO, { items: [] });
    ok(snap.status === 403, "YH snapshot yazımı demo'da 403", snap.status);

    section("B8 Demo YAZMALARI → 403 ve DB DEĞİŞMEZ");
    const snapshotBefore = await counts();
    const sid = fx.DEMO_SESSIONS_SEED[0].id;
    const writes: [string, unknown, string, Record<string, string>, unknown][] = [
      ["clients POST", r.list.POST, "POST", {}, { ad: "X", soyad: "Y" }],
      ["client PATCH", r.one.PATCH, "PATCH", P, { ad: "Değişti" }],
      ["notes PATCH", r.notes.PATCH, "PATCH", P, { notlar: "x" }],
      ["appointments POST", r.appts.POST, "POST", P, { title: "x", appointment_date: "2026-12-01T10:00:00Z" }],
      ["appointment PATCH", r.apptOne.PATCH, "PATCH", { id: fx.DEMO_APPOINTMENTS_SEED[0].id }, { title: "x" }],
      ["appointment DELETE", r.apptOne.DELETE, "DELETE", { id: fx.DEMO_APPOINTMENTS_SEED[0].id }, {}],
      ["appointments root POST", r.apptRoot.POST, "POST", {}, { title: "x", client_id: E, appointment_date: "2026-12-01T10:00:00Z" }],
      ["stones POST", r.stones.POST, "POST", P, { stone_name: "x" }],
      ["stones PATCH", r.stones.PATCH, "PATCH", P, { id: fx.DEMO_STONES_SEED[0].id, stone_name: "x" }],
      ["stones DELETE", r.stones.DELETE, "DELETE", P, { id: fx.DEMO_STONES_SEED[0].id }],
      ["sessions POST", r.sessions.POST, "POST", P, { session_note: "x" }],
      ["sessions PATCH", r.sessions.PATCH, "PATCH", P, { id: sid, session_note: "x" }],
      ["sessions DELETE", r.sessions.DELETE, "DELETE", P, { id: sid }],
      ["homeworks POST", r.homeworks.POST, "POST", P, { title: "x" }],
      ["homeworks PATCH", r.homeworks.PATCH, "PATCH", P, { id: fx.DEMO_HOMEWORKS_SEED[0].id, title: "x" }],
      ["homeworks DELETE", r.homeworks.DELETE, "DELETE", P, { id: fx.DEMO_HOMEWORKS_SEED[0].id }],
      ["analyses POST", r.analyses.POST, "POST", P, { analysis_type: "chakra", analysis_data: {} }],
      ["analyses DELETE", r.analyses.DELETE, "DELETE", P, { id: fx.DEMO_ANALYSES_SEED[0].id }],
      ["charges POST", r.charges.POST, "POST", P, { category: "session", amount: 10 }],
      ["charges PATCH", r.charges.PATCH, "PATCH", P, { id: fx.DEMO_CHARGES_SEED[0].id, amount: 99 }],
      ["charges DELETE", r.charges.DELETE, "DELETE", P, { id: fx.DEMO_CHARGES_SEED[0].id }],
      ["anamnez POST", r.anamnez.POST, "POST", P, { title: "x", assessmentDate: "2026-10-01", mode: "standard" }],
      ["anamnez PATCH", r.anamnezOne.PATCH, "PATCH", { id: E, anamnesisId: anamId }, { revision: 2, answers: {} }],
      ["anamnez DELETE", r.anamnezOne.DELETE, "DELETE", { id: E, anamnesisId: anamId }, { confirm: "SİL" }],
      ["anamnez complete", r.anamnezComplete.POST, "POST", { id: E, anamnesisId: anamId }, { revision: 2 }],
      ["anamnez ek prepare", r.anamnezPrepare.POST, "POST", { id: E, anamnesisId: anamId }, { name: "a.pdf", size: 10, type: "application/pdf" }],
      ["consents POST", r.consents.POST, "POST", P, { consent_type: "iletisim_izni", status: "granted", method: "diger" }],
      ["combinations POST", r.combos.POST, "POST", P, { name: "x" }],
      ["cascade-delete", r.cascade.DELETE, "DELETE", P, { confirm: true }],
      ["beslenme profil PUT", r.besProfile.PUT, "PUT", { clientId: E }, { goal_type: "other" }],
      ["beslenme ölçüm POST", r.besMeas.POST, "POST", { clientId: E }, { weight_kg: 60 }],
      ["beslenme tercih POST", r.besPrefs.POST, "POST", { clientId: E }, { stance: "preferred", food_label: "x" }],
      ["beslenme plan POST", r.besPlans.POST, "POST", { clientId: E }, { title: "x", start_date: "2026-10-01", end_date: "2026-10-02" }],
      ["beslenme alerjen PUT", r.besAllergens.PUT, "PUT", { clientId: E }, { items: [] }],
    ];
    for (const [label, h2, m, params, body] of writes) {
      const res = await call(h2, m, params, DEMO, body);
      ok(res.status === 403, `demo ${label} → 403`, { status: res.status, body: JSON.stringify(res.json).slice(0, 160) });
    }
    ok(JSON.stringify(await counts()) === JSON.stringify(snapshotBefore), "tüm yazma denemelerinden sonra demo verisi DEĞİŞMEDİ");
    const eylul = await q1(`select ad from clients where id=$1`, [E]);
    ok(eylul.ad === "Eylül", "danışan adı değişmedi");

    section("B9 Tenant izolasyonu + gerçek uzman regresyonu");
    const x1 = await call(r.one.GET, "GET", P, REAL);
    ok(x1.status === 404 || x1.status === 403, "gerçek uzman demo danışanını OKUYAMAZ", x1.status);
    const x2 = await call(r.word.POST, "POST", P, REAL, { exportMode: "full" });
    ok(x2.status === 404 || x2.status === 403, "gerçek uzman demo danışanının Word'ünü alamaz", x2.status);
    const x3 = await call(r.one.GET, "GET", { id: realClient }, DEMO);
    ok(x3.status === 404 || x3.status === 403, "demo gerçek tenant danışanını OKUYAMAZ", x3.status);
    const rl = await call(r.list.GET, "GET", {}, REAL, undefined, "?limit=100");
    ok(rl.status === 200 && ((rl.json.clients as Json[]) ?? []).length === 1, "gerçek uzman yalnız kendi danışanını görür");
    const rw = await call(r.word.POST, "POST", { id: realClient }, REAL, { exportMode: "full" });
    ok(rw.status === 200, "regresyon: gerçek uzman Word raporu çalışır", rw.status);
    const ry = await call(r.yhSearch.POST, "POST", {}, REAL, { q: "uyku" });
    ok(ry.status === 200 && ((ry.json.results as Json[]) ?? []).length === 0 && ry.json.disabled === true,
      "gerçek uzman fixture ALMAZ (kendi tenant flag'i kapalı → disabled)", ry.json);
    const rt = await call(r.yhTenant.POST, "POST", {}, REAL, { q: "uyku" });
    ok(!JSON.stringify(rt.json).includes("de5a0001-"), "gerçek uzmanın danışan aramasında demo kaydı YOK");
    const ny = await call(r.yhHealth.GET, "GET", {}, NOYH);
    ok(ny.status === 403, "YH izni olmayan uzman → YH 403", ny.status);
    const ns = await call(r.yhClient.POST, "POST", { id: realClient }, NOYH, { q: "x" });
    ok(ns.status === 403, "YH izni olmayan uzman danışan-içi YH → 403", ns.status);
  } finally {
    await shim.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await env.stop();
  }

  console.log(`\nDEMO VİTRİN HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
