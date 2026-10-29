/**
 * Klasik Numeroloji — API-2 harness'i: taşlar / karşılaştırma (kaynaklar, hizala, notlar) / Word raporu.
 * Gerçek route handler'ları + gerçek migration'lı geçici embedded-postgres + PostgREST shim (127.0.0.1).
 *
 * PROD/STAGING'E SIFIR TEMAS. Ağ kilidi: yalnız 127.0.0.1 gerçek; diğer HER host → hata + kayıt (sağlayıcı dahil).
 * Bu uçların hiçbiri sağlayıcı çağırmaz → kilide takılan istek sayısı 0 olmalı.
 * Mevcut Numeroloji tabloları (numerology_records, numerology_stone_assignments) + dogaltas_inventory service_role'e
 * YALNIZ SELECT ile açılır (yazma denemesi DB'de reddedilir) ve tüm koşu öncesi/sonrası özetleri birebir aynı olmalı.
 * Doğaltaş Kütüphanesi yayın RPC'leri test DB'sinde sahte SQL fonksiyonlarıyla taklit edilir.
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/api2/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";

const ROOT = path.resolve(__dirname, "../../..");
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
  }
}
const section = (s: string) => console.log(`\n— ${s}`);

const SOURCE_SECRET = "GizliKaynak Yayınevi";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function walkKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => walkKeys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); walkKeys(x, out); }
  return out;
}

async function docxText(buf: Buffer): Promise<string> {
  const z = await JSZip.loadAsync(buf);
  const parts: string[] = [];
  for (const name of Object.keys(z.files)) if (/\.(xml|rels)$/.test(name)) parts.push(await z.file(name)!.async("string"));
  return parts.join("\n");
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;
  const blocked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    blocked.push(u.replace(/[?#].*$/, ""));
    throw new Error(`ağ kilidi: ${u.replace(/[?#].*$/, "")}`);
  }) as typeof fetch;

  const LEGACY = `
    create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
      name text, surname text, birth_date text, analysis_data jsonb, created_at timestamptz default now());
    create table if not exists public.numerology_stone_assignments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
      analysis_type text not null, value text not null, reason text, stones jsonb, updated_at timestamptz default now());
    create table if not exists public.dogaltas_inventory (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, adet integer);`;
  const MIGS = ["20270121000000_numerology_core_rls_lock.sql", "20271120000300_numerology_records_client_link.sql", "20271205000000_numerology_classic_core.sql"]
    .map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  const LIB = `
    create table public.zz_lib_access (viewer uuid primary key);
    create table public.zz_lib_docs (slug text primary key, ord int not null, doc jsonb not null);
    create function public.stone_library_viewer_allowed(p_viewer uuid) returns boolean language sql stable
      as $$ select exists(select 1 from public.zz_lib_access where viewer = p_viewer) $$;
    create function public.stone_library_expert_search(p_viewer uuid, p_query text, p_filters jsonb, p_limit int, p_offset int) returns jsonb language sql stable
      as $$ select jsonb_build_object('total', (select count(*) from public.zz_lib_docs), 'limit', p_limit, 'offset', p_offset,
              'items', coalesce((select jsonb_agg(jsonb_build_object('slug', d.slug, 'name_tr', d.doc->>'name_tr') order by d.ord)
                                 from (select * from public.zz_lib_docs order by ord limit p_limit offset p_offset) d), '[]'::jsonb)) $$;
    create function public.stone_library_expert_stone(p_viewer uuid, p_slug text) returns jsonb language sql stable
      as $$ select doc from public.zz_lib_docs where slug = p_slug $$;
    grant select on public.zz_lib_access, public.zz_lib_docs to service_role;`;
  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.NUMK_API2_PG_PORT ?? 54595),
    dirName: `num-klasik-api2-${Date.now()}`,
    rpcAllow: ["stone_library_viewer_allowed", "stone_library_expert_search", "stone_library_expert_stone"],
    extraSql: [
      LEGACY,
      ...MIGS,
      LIB,
      // Mevcut tablolar: service_role YALNIZ select (yazma denemesi DB'de reddedilir).
      "revoke all on public.numerology_records, public.numerology_stone_assignments, public.dogaltas_inventory from service_role;",
      "grant select on public.numerology_records, public.numerology_stone_assignments, public.dogaltas_inventory to service_role;",
    ],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.NUMEROLOGY_CLASSIC_ENABLED = "true";
  // Çağrı bayrağı + sahte anahtar AÇIK: bu uçlar yine de sağlayıcıya gitmemeli.
  process.env.NUMEROLOGY_CLASSIC_PROVIDER_CALLS = "true";
  process.env.ROXY_API_KEY = "zz-numk-fake-key-NOT-REAL";
  process.env.STONE_LIBRARY_ENABLED = "true";
  delete process.env.USAGE360_ENABLED;
  const su = env.su;
  su.on("error", (e) => console.error("  (test PG bağlantı hatası)", e.message));

  try {
    const fx = await import("../report/fixtures");
    const { hesaplaNumeroloji } = await import("../../../lib/numeroloji/numerolojiMotor");
    const { NUMEROLOJI_METHODOLOGY_VERSION } = await import("../../../lib/numeroloji/methodology");
    const { readLegacySnapshot } = await import("../../../lib/numeroloji-klasik/compare/legacyReader");
    const { canonicalSha256 } = await import("../../../lib/numeroloji-klasik/compare/hash");

    // ── Tohum ──
    const TA = randomUUID();
    const TB = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_NUMK2_A'),($2,'ZZ_NUMK2_B')`, [TA, TB]);
    const mk = async (label: string, tenant: string, perms: Record<string, boolean>, demo = false) => {
      const id = randomUUID();
      const token = `zz-numk2-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
         values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,$6)`,
        [id, `ZZ_NUMK2_${label}`, `zz.numk2.${label.toLowerCase()}@example.test`, JSON.stringify(perms), tenant, demo],
      );
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const U = {
      A: await mk("A", TA, { numerology: true, clients: true, stones: true }),
      // Gelecek Yılları Göster alt-yetkisi olan uzman (NK-R1)
      AF: await mk("AF", TA, { numerology: true, clients: true, stones: true, numerology_future_years: true }),
      A2: await mk("A2", TA, { numerology: true, clients: false }),
      DEMO: await mk("DEMO", TA, { numerology: true, clients: true }, true),
      NOMOD: await mk("NOMOD", TA, { clients: true, numerology: false }),
      B: await mk("B", TB, { numerology: true, clients: true }),
    };
    await su.query(`insert into public.zz_lib_access(viewer) values ($1),($2)`, [U.A.id, U.DEMO.id]);
    const cA = randomUUID();
    const cB = randomUUID();
    await su.query(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,'ZZ Ayşe','ÖRNEK'),($3,$4,'ZZ Bora','DEMİR')`, [cA, TA, cB, TB]);

    // Mevcut Numeroloji kaydı (gerçek motor, salt-okunur — yalnız tohum için)
    const motor = hesaplaNumeroloji({ firstName: "Ayşe Örnek", lastName: "Işıl", birthDate: "29.11.1988" });
    const legacySnap = { version: 1, motor: JSON.parse(JSON.stringify(motor)), summary: "özet", tas: { bileklik: "Ay Taşı, Ametist", kolye: "İnci" }, calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION, stampedAt: "2026-10-20T10:00:00.000Z" } };
    const legacyA = randomUUID();
    const legacyA2 = randomUUID();
    const legacyB = randomUUID();
    await su.query(
      `insert into public.numerology_records(id, tenant_id, name, surname, birth_date, analysis_data, client_id, created_at) values
         ($1,$2,'Ayşe Örnek','Işıl','1988-11-29',$3,$4, now() - interval '2 days'),
         ($5,$2,'Mehmet','Yılmaz','1990-01-01','{"version":1,"motor":{"hayatYolu":{"display":"20/2"}}}',null, now() - interval '3 days'),
         ($6,$7,'Bora','Demir','1980-05-05',$3,$8, now())`,
      [legacyA, TA, JSON.stringify(legacySnap), cA, legacyA2, legacyB, TB, cB],
    );
    const lr = readLegacySnapshot(legacySnap);
    const hyDisplay = lr.hayatYolu.ok ? lr.hayatYolu.value.display : "?";
    await su.query(
      `insert into public.numerology_stone_assignments(tenant_id, analysis_type, value, reason, stones) values
         ($1,'hayat-yolu',$2,'ZZ neden','["Kaplan Gözü","Ay Taşı"]'), ($3,'hayat-yolu',$2,'B','["Yalnız B Taşı"]')`,
      [TA, hyDisplay, TB],
    );
    await su.query(`insert into public.dogaltas_inventory(tenant_id, name, adet) values ($1,'Ay Taşı',3),($1,'İnci',0),($2,'Berrak Kuvars',9)`, [TA, TB]);

    // Doğaltaş Kütüphanesi (sahte yayın dokümanları; biri kaynak adı / sağlayıcı adı sızdırma denemesi)
    const doc = (slug: string, name_tr: string, extra: Record<string, unknown> = {}) => ({
      slug, name_tr, name_en: null, aliases: [], facets: {}, pairings: [], sections: [], health_notice: {}, medical_notice: {}, display: {}, updated_at: "", ...extra,
    });
    const docs = [
      doc("ay-tasi", "Ay Taşı", { name_en: "Moonstone", facets: { planet: [{ key: "moon", label_tr: "Ay", label_en: "Moon" }], numerical_vibration: [2] }, pairings: [{ slug: "inci", name_tr: "İnci", name_en: "Pearl" }], source_name: SOURCE_SECRET, source_key: "gizli" }),
      doc("inci", "İnci", { name_en: "Pearl", facets: { numerical_vibration: [7] } }),
      doc("berrak-kuvars", "Berrak Kuvars", { name_en: "Clear Quartz", facets: { numerical_vibration: [11] } }),
      doc("neptun-tasi", "Neptün Taşı", { facets: { planet: [{ key: "neptune", label_tr: "Neptün", label_en: "Neptune" }] } }),
      doc("sizinti-tasi", "Sızıntı RoxyAPI Taşı"),
    ];
    for (const [i, d] of docs.entries()) await su.query(`insert into public.zz_lib_docs(slug, ord, doc) values ($1,$2,$3)`, [d.slug, i, JSON.stringify(d)]);

    // Katalog: Life Path 11 EN uğurlu ilişkiler (kayıtlı haritada luckyEn YOK → servis katalogdan okur)
    const lucky11en = { gemstones: ["Moonstone", "Pearl", "Clear Quartz"], colors: ["Silver"], day: "Monday", element: "Air", rulingPlanet: "Neptune", compatibleNumbers: [2], incompatibleNumbers: [1] };
    await su.query(`insert into public.numerology_classic_catalog(kind, number, lang, payload, spec_version) values ('lucky_association',11,'en',$1,'s')`, [JSON.stringify(lucky11en)]);

    // Kayıtlı klasik analizler (provider_meta sağlayıcı adını taşır → uzman yüzeyine SIZMAMALI)
    const insA = async (tenant: string, r: { kind: string; title: string; input: unknown; techniques: readonly string[]; status: string; result: unknown }, client: string | null = null) => {
      const id = randomUUID();
      await su.query(
        `insert into public.numerology_classic_analyses (id, tenant_id, client_id, kind, title, input, techniques, result, verification, provider_meta, methodology_version, api_schema_version, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'{}',$9,'numk-method-1','numerology-openapi-2.0.0',$10)`,
        [id, tenant, client, r.kind, r.title, JSON.stringify(r.input), [...r.techniques], JSON.stringify(r.result), JSON.stringify({ provider: "roxy", api: "v2", reference_date: "2026-10-29", failed: [] }), r.status],
      );
      return id;
    };
    const pA = await insA(TA, fx.PERSON_RECORD, cA);
    const relA = await insA(TA, fx.RELATIONSHIP_RECORD);
    const busA = await insA(TA, fx.BUSINESS_RECORD);
    const namA = await insA(TA, fx.NAMES_RECORD);
    const pB = await insA(TB, fx.PERSON_RECORD, cB);

    // ── Mevcut tablolar: koşu ÖNCESİ özet ──
    const legacyDigest = async () => {
      const tabs = (await su.query(
        `select table_name from information_schema.tables where table_schema = 'public'
           and (table_name like 'numerology\\_%' or table_name = 'dogaltas_inventory')
           and table_name not like 'numerology\\_classic\\_%' and table_name <> 'numerology_comparative_notes' order by 1`,
      )).rows.map((r: { table_name: string }) => r.table_name);
      const out: Record<string, string> = {};
      for (const t of tabs) {
        const r = (await su.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public."${t}" x`)).rows[0];
        out[t] = `${r.n}:${r.h}`;
      }
      return out;
    };
    const digestBefore = await legacyDigest();
    ok(Object.keys(digestBefore).includes("numerology_records") && Object.keys(digestBefore).includes("numerology_stone_assignments"), "mevcut tablo özeti alındı", Object.keys(digestBefore));

    // ── Route'lar ──
    const taslarRoute = await import("../../../app/api/numeroloji-klasik/analyses/[id]/taslar/route");
    const kaynakRoute = await import("../../../app/api/numeroloji-klasik/karsilastirma/kaynaklar/route");
    const hizalaRoute = await import("../../../app/api/numeroloji-klasik/karsilastirma/hizala/route");
    const notRoute = await import("../../../app/api/numeroloji-klasik/karsilastirma/notlar/route");
    const notIdRoute = await import("../../../app/api/numeroloji-klasik/karsilastirma/notlar/[id]/route");
    const raporRoute = await import("../../../app/api/numeroloji-klasik/rapor/route");
    const { clearClassicStoneIndexCache } = await import("../../../lib/numeroloji-klasik/stones/libraryAdapter");
    type Auth = { id?: string; token?: string };
    type H = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
    const jsonTexts: string[] = [];
    const docxTexts: string[] = [];
    async function call(handler: unknown, method: string, auth: Auth, opts: { params?: Record<string, string>; body?: unknown; raw?: string; query?: string } = {}) {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      const body = opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
      if (body !== undefined) headers["content-type"] = "application/json";
      const r = new NextRequest(`http://localhost/api/numeroloji-klasik/test${opts.query ?? ""}`, { method, headers, body });
      const res = await (handler as H)(r, { params: Promise.resolve(opts.params ?? {}) });
      const ct = res.headers.get("content-type") ?? "";
      let json: Record<string, unknown> = {};
      let text = "";
      let buf: Buffer | null = null;
      if (ct.includes("json")) {
        text = await res.clone().text();
        try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* boş */ }
        jsonTexts.push(text);
      } else {
        buf = Buffer.from(await res.arrayBuffer());
      }
      return { status: res.status, json, text, res, buf };
    }
    const asA = { id: U.A.id, token: U.A.token };
    const asA2 = { id: U.A2.id, token: U.A2.token };
    const asAF = { id: U.AF.id, token: U.AF.token };
    const asB = { id: U.B.id, token: U.B.token };
    const asDemo = { id: U.DEMO.id, token: U.DEMO.token };
    const asNomod = { id: U.NOMOD.id, token: U.NOMOD.token };

    // ── Bayrak / kimlik / modül ──
    section("bayrak kapalı → 404 (kimliksiz dahil)");
    process.env.NUMEROLOGY_CLASSIC_ENABLED = "TRUE";
    const nid = randomUUID();
    const offs = [
      await call(taslarRoute.GET, "GET", {}, { params: { id: pA } }),
      await call(kaynakRoute.GET, "GET", asA),
      await call(hizalaRoute.POST, "POST", asA, { body: { classicId: pA } }),
      await call(notRoute.GET, "GET", asA),
      await call(notRoute.POST, "POST", asA, { body: { classicId: pA, body: "x" } }),
      await call(notIdRoute.GET, "GET", asA, { params: { id: nid } }),
      await call(notIdRoute.PATCH, "PATCH", asA, { params: { id: nid }, body: { body: "x", rowVersion: 1 } }),
      await call(notIdRoute.DELETE, "DELETE", asA, { params: { id: nid } }),
      await call(raporRoute.POST, "POST", asA, { body: { kind: "person", analysisId: pA } }),
    ];
    ok(offs.every((r) => r.status === 404), "9 handler da 404", offs.map((r) => r.status));
    process.env.NUMEROLOGY_CLASSIC_ENABLED = "true";

    section("kimlik (401) / modül izni (403)");
    const handlers: Array<[string, unknown, string, { params?: Record<string, string>; body?: unknown }]> = [
      ["taslar", taslarRoute.GET, "GET", { params: { id: pA } }],
      ["kaynaklar", kaynakRoute.GET, "GET", {}],
      ["hizala", hizalaRoute.POST, "POST", { body: { classicId: pA } }],
      ["notlar GET", notRoute.GET, "GET", {}],
      ["notlar POST", notRoute.POST, "POST", { body: { classicId: pA, body: "x" } }],
      ["not GET", notIdRoute.GET, "GET", { params: { id: nid } }],
      ["not PATCH", notIdRoute.PATCH, "PATCH", { params: { id: nid }, body: { body: "x", rowVersion: 1 } }],
      ["not DELETE", notIdRoute.DELETE, "DELETE", { params: { id: nid } }],
      ["rapor", raporRoute.POST, "POST", { body: { kind: "person", analysisId: pA } }],
    ];
    for (const [name, h, m, o] of handlers) {
      const r1 = await call(h, m, {}, o);
      ok(r1.status === 401, `${name}: oturumsuz → 401`, r1.status);
      const r2 = await call(h, m, asNomod, o);
      ok(r2.status === 403, `${name}: numeroloji izni yok → 403`, r2.status);
    }

    // ── Taşlar ──
    section("GET analyses/[id]/taslar");
    clearClassicStoneIndexCache();
    const t1 = await call(taslarRoute.GET, "GET", asA, { params: { id: pA } });
    const t1r = (t1.json.result ?? {}) as { libraryAvailable?: boolean; providerDirect?: Array<{ input: string; status: string; stoneKey?: string }>; suggestions?: Array<{ stoneKey: string; reasons: Array<{ method: string }> }>; groups?: unknown[]; disclaimer?: unknown };
    ok(t1.status === 200 && t1.json.ok === true && t1.json.mode === "library", "kütüphane erişimi olan uzman → mode library", { s: t1.status, mode: t1.json.mode, reason: t1.json.reason });
    ok(t1r.libraryAvailable === true && Array.isArray(t1r.groups) && !!t1r.disclaimer, "result = StoneMatchResult (libraryAvailable, groups, disclaimer)");
    const ayDirect = t1r.providerDirect?.find((p) => p.input === "Ay taşı");
    ok(ayDirect?.status === "matched" && ayDirect.stoneKey === "ay-tasi", "doğrudan öneri 'Ay taşı' → ay-tasi", t1r.providerDirect);
    const dag = t1r.providerDirect?.find((p) => p.input === "Dağ kristali");
    ok(dag?.status === "matched" && dag.stoneKey === "berrak-kuvars", "takma ad / EN katalog: 'Dağ kristali' → berrak-kuvars", dag);
    ok(!!t1r.suggestions?.some((s) => s.stoneKey === "neptun-tasi" && s.reasons.some((x) => x.method === "planet")), "yönetici gezegen (Neptün) → türetilmiş planet önerisi");
    const stock = (t1.json.stock ?? {}) as Record<string, number>;
    ok(stock["Ay Taşı"] === 3 && stock["Ay taşı"] === 3 && stock["İnci"] === 0 && !("Berrak Kuvars" in stock) && !("Dağ kristali" in stock), "stok rozetleri: öneri adı + kütüphane adı anahtarlı, yalnız kendi tenant'ı (B'nin Berrak Kuvars'ı YOK)", stock);
    ok(!t1.text.includes(SOURCE_SECRET) && !/source_key|gizli|roxy/i.test(t1.text), "yanıtta kaynak adı / iç alan / sağlayıcı adı yok");
    ok(!t1r.suggestions?.some((s) => s.stoneKey === "sizinti-tasi"), "sızıntılı kütüphane kartı dizine alınmadı");
    const t2 = await call(taslarRoute.GET, "GET", asA2, { params: { id: pA } });
    ok(t2.status === 200 && t2.json.mode === "text_only" && t2.json.reason === "no_access" && typeof t2.json.reasonText === "string", "kütüphane yetkisi yok → text_only / no_access", { mode: t2.json.mode, reason: t2.json.reason });
    ok(((t2.json.result ?? {}) as { providerDirect?: Array<{ status: string }> }).providerDirect?.every((p) => p.status === "text_only") === true, "yedek mod: doğrudan öneriler yalnız ad");
    process.env.STONE_LIBRARY_ENABLED = "false";
    const t3 = await call(taslarRoute.GET, "GET", asA, { params: { id: pA } });
    ok(t3.status === 200 && t3.json.mode === "text_only" && t3.json.reason === "library_disabled", "kütüphane bayrağı kapalı → text_only / library_disabled", t3.json.reason);
    process.env.STONE_LIBRARY_ENABLED = "true";
    ok((await call(taslarRoute.GET, "GET", asB, { params: { id: pA } })).status === 404, "başka tenant'ın analizi → 404");
    ok((await call(taslarRoute.GET, "GET", asA, { params: { id: randomUUID() } })).status === 404, "olmayan uuid → 404");
    ok((await call(taslarRoute.GET, "GET", asA, { params: { id: "1 or 1=1" } })).status === 404, "uuid olmayan id → 404");
    const t4 = await call(taslarRoute.GET, "GET", asA, { params: { id: busA } });
    ok(t4.status === 422 && t4.json.code === "STONES_NOT_AVAILABLE", "kişi haritası olmayan analiz → 422", t4.json);
    ok((await call(taslarRoute.GET, "GET", asDemo, { params: { id: pA } })).status === 200, "demo okuyabilir");
    ok((t1.res.headers.get("cache-control") ?? "").includes("no-store"), "no-store başlığı");

    // ── Kaynaklar ──
    section("GET karsilastirma/kaynaklar");
    const k1 = await call(kaynakRoute.GET, "GET", asA);
    const kl = (k1.json.legacy ?? []) as Array<Record<string, unknown>>;
    const kc = (k1.json.classic ?? []) as Array<Record<string, unknown>>;
    ok(k1.status === 200 && kl.length === 2 && kc.length === 4, "A: 2 mevcut + 4 klasik kayıt", { l: kl.length, c: kc.length });
    ok(kl[0]?.id === legacyA && kl[0]?.fullName === "Ayşe Örnek Işıl" && kl[0]?.methodologyVersion === NUMEROLOJI_METHODOLOGY_VERSION && kl[0]?.clientId === cA && kl[0]?.birthDate === "1988-11-29", "mevcut öğe şekli (en yeni önce)", kl[0]);
    ok(Object.keys(kl[0] ?? {}).sort().join(",") === "birthDate,clientId,createdAt,fullName,id,methodologyVersion", "mevcut öğe anahtarları birebir (analysis_data yok)", Object.keys(kl[0] ?? {}));
    ok(Object.keys(kc[0] ?? {}).sort().join(",") === "clientId,createdAt,id,kind,title", "klasik öğe anahtarları birebir", Object.keys(kc[0] ?? {}));
    ok(![...kl, ...kc].some((x) => x.id === legacyB || x.id === pB), "başka tenant kayıtları görünmez");
    const k2 = await call(kaynakRoute.GET, "GET", asA, { query: `?clientId=${cA}` });
    ok(k2.status === 200 && (k2.json.legacy as unknown[]).length === 1 && (k2.json.classic as Array<{ id: string }>).length === 1 && (k2.json.classic as Array<{ id: string }>)[0].id === pA, "danışan filtresi", { l: (k2.json.legacy as unknown[])?.length, c: (k2.json.classic as unknown[])?.length });
    const k3 = await call(kaynakRoute.GET, "GET", asA2, { query: `?clientId=${cA}` });
    ok(k3.status === 403 && k3.json.code === "CLIENTS_PERMISSION_REQUIRED", "clients izni olmadan clientId → 403 CLIENTS_PERMISSION_REQUIRED", k3.json);
    ok((await call(kaynakRoute.GET, "GET", asA2)).status === 200, "clients izni olmayan uzman filtresiz listeler");
    const k4 = await call(kaynakRoute.GET, "GET", asA, { query: `?q=${encodeURIComponent("yılmaz")}` });
    ok(k4.status === 200 && (k4.json.legacy as Array<{ id: string }>).length === 1 && (k4.json.legacy as Array<{ id: string }>)[0].id === legacyA2, "ad araması (soyad)", k4.json.legacy);
    const k5 = await call(kaynakRoute.GET, "GET", asA, { query: `?q=${encodeURIComponent("Ayşe Işıl")}` });
    ok(k5.status === 200 && (k5.json.legacy as Array<{ id: string }>).length === 1 && (k5.json.legacy as Array<{ id: string }>)[0].id === legacyA, "çok kelimeli ad araması", k5.json.legacy);
    const k6 = await call(kaynakRoute.GET, "GET", asA, { query: `?q=${encodeURIComponent("Çiçekçilik")}` });
    ok(k6.status === 200 && (k6.json.classic as Array<{ id: string }>).length === 1 && (k6.json.classic as Array<{ id: string }>)[0].id === busA, "klasik başlık araması");
    ok((await call(kaynakRoute.GET, "GET", asA, { query: `?q=${encodeURIComponent("a,b)")}` })).status === 400, "q özel karakter (PostgREST enjeksiyonu) → 400");
    ok((await call(kaynakRoute.GET, "GET", asA, { query: `?q=${"a".repeat(61)}` })).status === 400, "q > 60 → 400");
    ok((await call(kaynakRoute.GET, "GET", asA, { query: "?clientId=abc" })).status === 400, "geçersiz clientId → 400");
    const kB = await call(kaynakRoute.GET, "GET", asB, { query: `?clientId=${cA}` });
    ok(kB.status === 200 && (kB.json.legacy as unknown[]).length === 0 && (kB.json.classic as unknown[]).length === 0, "B, A'nın danışan kimliğiyle hiçbir şey göremez");

    // ── Hizala ──
    section("POST karsilastirma/hizala");
    const h1 = await call(hizalaRoute.POST, "POST", asA, { body: { legacyId: legacyA, classicId: pA } });
    const al = (h1.json.alignment ?? {}) as { rows?: Array<Record<string, unknown>>; missing?: unknown; sourceHashes?: { legacy?: string; classic?: string }; stones?: { legacyAssigned?: unknown[]; overlap?: Array<{ nameLegacy: string }> } };
    ok(h1.status === 200 && Array.isArray(al.rows) && al.rows.length > 10 && al.missing === null, "iki kayıt → hizalama (missing null)", { s: h1.status, n: al.rows?.length, m: al.missing });
    const ROW_KEYS = "classic,classicMissingReason,comparable,conceptKey,explanation,labelTr,legacy,legacyMissingReason,position,relation,sameNameDifferentFormula";
    ok(al.rows?.every((r) => Object.keys(r).sort().join(",") === ROW_KEYS) === true, "her satır yalnız iki ayrı taraf (legacy / classic) — birleşik sayı alanı yok", al.rows?.map((r) => Object.keys(r).join(",")).find((k) => k.split(",").sort().join(",") !== ROW_KEYS));
    ok(!walkKeys(h1.json).some((k) => /merged|combined|unified|birlesik/i.test(k)), "yanıtın hiçbir yerinde birleşik alan anahtarı yok");
    ok(al.sourceHashes?.legacy === canonicalSha256(legacySnap), "mevcut taraf KAYDEDİLDİĞİ GİBİ okundu (kanonik özet = analysis_data özeti)");
    const hy = al.rows?.find((r) => r.conceptKey === "hayat_yolu") as { legacy?: { display?: string }; classic?: { value?: number } } | undefined;
    ok(hy?.legacy?.display === hyDisplay && hy?.classic?.value === 11, "Hayat Yolu: mevcut gösterim + klasik 11 ayrı ayrı", hy);
    const hst = (h1.json.stones ?? {}) as { classic?: { mode?: string; result?: unknown } | null; legacyAssignments?: Array<{ analysisType: string; value: string; stones: string[] }> };
    ok(hst.classic?.mode === "library" && !!hst.classic?.result, "klasik taraf taşları (kütüphane modu)");
    ok(hst.legacyAssignments?.length === 1 && hst.legacyAssignments[0].analysisType === "hayat-yolu" && hst.legacyAssignments[0].value === hyDisplay && hst.legacyAssignments[0].stones.join("|") === "Kaplan Gözü|Ay Taşı", "mevcut taş ataması salt-okunur (tenant + tür + değer); B'ninki gelmez", hst.legacyAssignments);
    ok(!!al.stones?.overlap?.some((o) => o.nameLegacy === "Ay Taşı"), "taş kesişimi (kayıttaki tas ↔ klasik)", al.stones?.overlap);
    const srcs = (h1.json.sources ?? {}) as { legacy?: { id?: string }; classic?: { id?: string } };
    ok(srcs.legacy?.id === legacyA && srcs.classic?.id === pA, "sources: iki kayıt özeti");
    ok(!/roxy/i.test(h1.text) && !h1.text.includes(SOURCE_SECRET), "hizalama yanıtında sağlayıcı / kaynak adı yok");
    const h2 = await call(hizalaRoute.POST, "POST", asA, { body: { classicId: pA } });
    ok(h2.status === 200 && (h2.json.alignment as { missing?: string }).missing === "legacy", "yalnız klasik → missing legacy");
    const h3 = await call(hizalaRoute.POST, "POST", asA, { body: { legacyId: legacyA } });
    ok(h3.status === 200 && (h3.json.alignment as { missing?: string }).missing === "classic" && (h3.json.stones as { classic: unknown }).classic === null, "yalnız mevcut → missing classic, klasik taş yok");
    ok((await call(hizalaRoute.POST, "POST", asA, { body: { legacyId: legacyB } })).status === 404, "başka tenant'ın mevcut kaydı → 404");
    ok((await call(hizalaRoute.POST, "POST", asA, { body: { classicId: pB } })).status === 404, "başka tenant'ın klasik analizi → 404");
    ok((await call(hizalaRoute.POST, "POST", asA, { body: { legacyId: legacyA, classicId: pB } })).status === 404, "biri yabancı → 404");
    ok((await call(hizalaRoute.POST, "POST", asA, { body: { classicId: randomUUID() } })).status === 404, "olmayan klasik → 404");
    ok((await call(hizalaRoute.POST, "POST", asA, { body: {} })).status === 400, "kimliksiz → 400");
    ok((await call(hizalaRoute.POST, "POST", asA, { body: { legacyId: "x' or 1=1" } })).status === 400, "geçersiz kimlik → 400");
    ok((await call(hizalaRoute.POST, "POST", asA, { body: { classicId: pA, tenantId: TB } })).status === 400, "fazla alan (tenantId) → 400");
    ok((await call(hizalaRoute.POST, "POST", asA, { raw: "{bozuk" })).status === 400, "bozuk JSON → 400");
    ok((await call(hizalaRoute.POST, "POST", asA, { raw: JSON.stringify({ classicId: pA, pad: "x".repeat(17000) }) })).status === 413, "16 KB üstü → 413");
    ok((await call(hizalaRoute.POST, "POST", asDemo, { body: { legacyId: legacyA, classicId: pA } })).status === 200, "demo hizalayabilir (okuma)");

    // ── Notlar ──
    section("NK-R1: Gelecek Yıllar alt-yetkisi (Mevcut kayıt süzgeci)");
    {
      const zirveOf = (j: Record<string, unknown>) => JSON.stringify(((j.alignment as { rows?: Array<Record<string, unknown>> })?.rows ?? []).filter((r) => r.conceptKey === "zirve" || r.conceptKey === "mucadele"));
      const hNo = await call(hizalaRoute.POST, "POST", asA, { body: { legacyId: legacyA, classicId: pA } });
      const hYes = await call(hizalaRoute.POST, "POST", asAF, { body: { legacyId: legacyA, classicId: pA } });
      const zNo = zirveOf(hNo.json);
      const zYes = zirveOf(hYes.json);
      ok(hNo.status === 200 && hYes.status === 200 && zNo.length > 2 && zYes.length > 2, "iki uzman da hizalayabilir", { a: hNo.status, b: hYes.status });
      ok(zNo !== zYes, "alt-yetkisiz uzman: Mevcut kaydın gelecek zirve/mücadele dönemleri SÜZÜLÜR (yetkiliden farklı)");
      const { redactAnalysisDataForFutureYears } = await import("../../../app/numeroloji/utils/futureYearsRedaction");
      const { currentIstanbulYear } = await import("../../../lib/numeroloji/currentYear");
      const red = redactAnalysisDataForFutureYears(legacySnap, { futureYears: false, currentYear: currentIstanbulYear(), birthDate: "1988-11-29" });
      ok(JSON.stringify(red) !== JSON.stringify(legacySnap), "fikstür gerçekten gelecek dönem içeriyor (test anlamlı)");
      const sh = (j: Record<string, unknown>) => (j.alignment as { sourceHashes?: { legacy?: string } })?.sourceHashes?.legacy;
      ok(sh(hNo.json) === canonicalSha256(legacySnap) && sh(hYes.json) === canonicalSha256(legacySnap), "değişiklik özeti HAM kayıttan (iki uzmanda aynı)");
      const nNo = await call(notRoute.POST, "POST", asA, { body: { legacyId: legacyA, classicId: pA, body: "süzgeç A" } });
      const nYes = await call(notRoute.POST, "POST", asAF, { body: { legacyId: legacyA, classicId: pA, body: "süzgeç AF" } });
      const rh = (j: Record<string, unknown>) => ((j.note as { snapshot?: { rowsHash?: string } })?.snapshot?.rowsHash);
      ok(nNo.status === 201 && nYes.status === 201 && rh(nNo.json) === rh(nYes.json), "kalıcı not görüntüsü yetkili uzmanda da SÜZÜLMÜŞ (alt-yetkisiz okuyucuya sızmaz)");
      for (const j of [nNo.json, nYes.json]) {
        const id = (j.note as { id?: string })?.id;
        if (id) await su.query(`delete from public.numerology_comparative_notes where id=$1`, [id]).catch(() => undefined);
      }
    }

    section("NK-R8: not başka danışana bağlanamaz");
    {
      const cA2 = randomUUID();
      await su.query(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,'ZZ Cem','YILMAZ')`, [cA2, TA]);
      const mm = await call(notRoute.POST, "POST", asA, { body: { legacyId: legacyA, clientId: cA2, body: "yanlış danışan" } });
      ok(mm.status === 400 && mm.json.code === "CLIENT_MISMATCH", "Mevcut kayıt A danışanına bağlı, not B danışanına → 400 CLIENT_MISMATCH", mm.json);
    }

    section("NK-R11: stok rozetleri Doğaltaş izni ister");
    {
      const tNo = await call(taslarRoute.GET, "GET", asA2, { params: { id: pA } });
      ok(tNo.status === 200 && Object.keys((tNo.json.stock ?? {}) as object).length === 0, "Doğaltaş izni yok (A2) → stok boş", tNo.json.stock);
    }

    section("karsilastirma/notlar");
    const nb = "İlk not\u0000 satırı\r\n<b>kalın değil</b>‮ters";
    const n1 = await call(notRoute.POST, "POST", asA, { body: { legacyId: legacyA, classicId: pA, clientId: cA, body: nb } });
    const note1 = (n1.json.note ?? {}) as { id?: string; body?: string; rowVersion?: number; snapshot?: { schema?: string; savedAt?: string; rowsHash?: string; rows?: unknown[]; sourceHashes?: { legacy?: string } }; clientId?: string; legacyId?: string; classicId?: string };
    ok(n1.status === 201 && !!note1.id && note1.rowVersion === 1, "not oluşturuldu (201, rowVersion 1)", n1.json);
    ok(note1.body === "İlk not satırı\n<b>kalın değil</b>ters", "kontrol / yön karakterleri atıldı, metin HAM (HTML kaçışlanmadı)", note1.body);
    ok(note1.snapshot?.schema === "num-compare-note-v1" && typeof note1.snapshot?.savedAt === "string" && /^[0-9a-f]{64}$/.test(note1.snapshot?.rowsHash ?? "") && (note1.snapshot?.rows?.length ?? 0) > 10, "snapshot = buildNoteSnapshot + savedAt (sunucuda yeniden kuruldu)");
    ok(note1.snapshot?.sourceHashes?.legacy === canonicalSha256(legacySnap), "snapshot mevcut kayıt özetini taşır");
    ok(note1.clientId === cA && note1.legacyId === legacyA && note1.classicId === pA, "bağlar kaydedildi");
    const nForged = await call(notRoute.POST, "POST", asA, { body: { classicId: pA, body: "x", snapshot: { forged: true } } });
    ok(nForged.status === 400 && nForged.json.code === "UNKNOWN_FIELD", "istemci snapshot gönderemez → 400");
    ok((await call(notRoute.POST, "POST", asDemo, { body: { classicId: pA, body: "demo" } })).status === 403, "demo POST → 403");
    const nP = await call(notRoute.POST, "POST", asA2, { body: { classicId: pA, clientId: cA, body: "x" } });
    ok(nP.status === 403 && nP.json.code === "CLIENTS_PERMISSION_REQUIRED", "clients izni yok + clientId → 403", nP.json);
    const nC = await call(notRoute.POST, "POST", asA, { body: { classicId: pA, clientId: cB, body: "x" } });
    ok(nC.status === 404 && nC.json.code === "CLIENT_NOT_FOUND", "başka tenant'ın danışanı → 404");
    ok((await call(notRoute.POST, "POST", asA, { body: { classicId: pB, body: "x" } })).status === 404, "başka tenant'ın analizi → 404");
    ok((await call(notRoute.POST, "POST", asA, { body: { legacyId: legacyB, body: "x" } })).status === 404, "başka tenant'ın mevcut kaydı → 404");
    ok((await call(notRoute.POST, "POST", asA, { body: { body: "x" } })).status === 400, "kimliksiz not → 400");
    const nLong = await call(notRoute.POST, "POST", asA, { body: { classicId: pA, body: "ş".repeat(20001) } });
    ok(nLong.status === 400 && nLong.json.code === "BODY_TOO_LONG", "20 001 karakter → 400 BODY_TOO_LONG");
    const nMax = await call(notRoute.POST, "POST", asA2, { body: { classicId: pA, body: "ş".repeat(20000) } });
    ok(nMax.status === 201, "tam 20 000 karakter (≈40 KB) kabul", nMax.status);
    ok((await call(notRoute.POST, "POST", asA, { raw: JSON.stringify({ classicId: pA, body: "x".repeat(100 * 1024) }) })).status === 413, "96 KB üstü gövde → 413");
    ok((await call(notRoute.POST, "POST", asA, { body: { classicId: pA, body: 42 } })).status === 400, "metin olmayan body → 400");
    const nB = await call(notRoute.POST, "POST", asB, { body: { legacyId: legacyB, classicId: pB, body: "B notu" } });
    ok(nB.status === 201, "B kendi notunu yazar");
    const nBId = ((nB.json.note ?? {}) as { id?: string }).id ?? "";
    const n1Id = note1.id ?? "";

    const l1 = await call(notRoute.GET, "GET", asA, { query: `?classicId=${pA}` });
    ok(l1.status === 200 && (l1.json.notes as Array<{ id: string }>).some((x) => x.id === n1Id) && !(l1.json.notes as Array<{ id: string }>).some((x) => x.id === nBId), "liste: classicId filtresi, B'nin notu yok");
    const l2 = await call(notRoute.GET, "GET", asA, { query: `?clientId=${cA}` });
    ok(l2.status === 200 && (l2.json.notes as unknown[]).length === 1, "liste: danışan filtresi");
    ok((await call(notRoute.GET, "GET", asA2, { query: `?clientId=${cA}` })).status === 403, "liste: clients izni yok + clientId → 403");
    ok((await call(notRoute.GET, "GET", asA, { query: "?legacyId=bad" })).status === 400, "liste: geçersiz kimlik → 400");
    const lB = await call(notRoute.GET, "GET", asB);
    ok(lB.status === 200 && !(lB.json.notes as Array<{ id: string }>).some((x) => x.id === n1Id), "B listesinde A'nın notu yok");

    const g1 = await call(notIdRoute.GET, "GET", asA, { params: { id: n1Id } });
    ok(g1.status === 200 && ((g1.json.note ?? {}) as { id?: string }).id === n1Id && g1.json.legacyChanged === false, "GET not → 200, legacyChanged=false");
    ok((await call(notIdRoute.GET, "GET", asB, { params: { id: n1Id } })).status === 404, "B, A'nın notunu okuyamaz → 404");
    ok((await call(notIdRoute.GET, "GET", asA, { params: { id: "zz" } })).status === 404, "uuid olmayan not → 404");
    ok((await call(notIdRoute.GET, "GET", asDemo, { params: { id: n1Id } })).status === 200, "demo okuyabilir");

    const p409 = await call(notIdRoute.PATCH, "PATCH", asA, { params: { id: n1Id }, body: { body: "yeni", rowVersion: 7 } });
    ok(p409.status === 409 && p409.json.code === "CONFLICT", "PATCH eski rowVersion → 409");
    ok((await call(notIdRoute.PATCH, "PATCH", asB, { params: { id: n1Id }, body: { body: "B", rowVersion: 1 } })).status === 404, "B güncelleyemez → 404");
    ok((await call(notIdRoute.PATCH, "PATCH", asDemo, { params: { id: n1Id }, body: { body: "d", rowVersion: 1 } })).status === 403, "demo PATCH → 403");
    ok((await call(notIdRoute.PATCH, "PATCH", asA, { params: { id: n1Id }, body: { body: "y".repeat(20001), rowVersion: 1 } })).status === 400, "PATCH 20 001 karakter → 400");
    ok((await call(notIdRoute.PATCH, "PATCH", asA, { params: { id: n1Id }, body: { body: "y", rowVersion: 1, snapshot: {} } })).status === 400, "PATCH snapshot alanı → 400");
    ok((await call(notIdRoute.PATCH, "PATCH", asA, { params: { id: n1Id }, body: { body: "y" } })).status === 400, "PATCH sürümsüz → 400");
    const p1 = await call(notIdRoute.PATCH, "PATCH", asA, { params: { id: n1Id }, body: { body: "Güncel not", rowVersion: 1 } });
    const pn = (p1.json.note ?? {}) as { rowVersion?: number; body?: string; snapshot?: { savedAt?: string } };
    ok(p1.status === 200 && pn.rowVersion === 2 && pn.body === "Güncel not" && pn.snapshot?.savedAt === note1.snapshot?.savedAt, "PATCH → 200, sürüm 2, snapshot değişmedi", p1.json);

    const d409 = await call(notIdRoute.DELETE, "DELETE", asA, { params: { id: n1Id }, query: "?rowVersion=1" });
    ok(d409.status === 409, "DELETE eski rowVersion → 409");
    ok((await call(notIdRoute.DELETE, "DELETE", asB, { params: { id: n1Id } })).status === 404, "B silemez → 404");
    ok((await call(notIdRoute.DELETE, "DELETE", asDemo, { params: { id: n1Id } })).status === 403, "demo DELETE → 403");
    ok((await call(notIdRoute.DELETE, "DELETE", asA, { params: { id: n1Id }, query: "?rowVersion=x" })).status === 400, "DELETE geçersiz sürüm → 400");

    // ── SEC-05: clients izni olmayan uzman → clientId daima null ──
    section("SEC-05: clients izni yoksa yanıtlarda clientId null");
    const kA2 = await call(kaynakRoute.GET, "GET", asA2);
    const kA2all = [...((kA2.json.legacy ?? []) as Array<{ id: string; clientId: unknown }>), ...((kA2.json.classic ?? []) as Array<{ id: string; clientId: unknown }>)];
    ok(kA2.status === 200 && kA2all.some((x) => x.id === legacyA) && kA2all.some((x) => x.id === pA) && kA2all.every((x) => x.clientId === null) && !kA2.text.includes(cA), "kaynaklar (A2): danışana bağlı kayıtlar görünür, clientId null", kA2all.filter((x) => x.clientId !== null));
    const kAcl = await call(kaynakRoute.GET, "GET", asA);
    ok(((kAcl.json.legacy ?? []) as Array<{ id: string; clientId: unknown }>).find((x) => x.id === legacyA)?.clientId === cA, "kaynaklar (A, izinli): clientId korunur");
    const hA2 = await call(hizalaRoute.POST, "POST", asA2, { body: { legacyId: legacyA, classicId: pA } });
    const hA2s = (hA2.json.sources ?? {}) as { legacy?: { clientId?: unknown }; classic?: { clientId?: unknown } };
    ok(hA2.status === 200 && hA2s.legacy?.clientId === null && hA2s.classic?.clientId === null && !hA2.text.includes(cA), "hizala (A2): sources.*.clientId null", hA2s);
    const nlA2 = await call(notRoute.GET, "GET", asA2, { query: `?classicId=${pA}` });
    const nlA2n = (nlA2.json.notes ?? []) as Array<{ id: string; clientId: unknown }>;
    ok(nlA2.status === 200 && nlA2n.some((x) => x.id === n1Id) && nlA2n.every((x) => x.clientId === null) && !nlA2.text.includes(cA), "notlar listesi (A2): clientId null", nlA2n);
    const ngA2 = await call(notIdRoute.GET, "GET", asA2, { params: { id: n1Id } });
    ok(ngA2.status === 200 && ((ngA2.json.note ?? {}) as { clientId?: unknown }).clientId === null, "not görünümü (A2): clientId null");
    const ngA = await call(notIdRoute.GET, "GET", asA, { params: { id: n1Id } });
    ok(((ngA.json.note ?? {}) as { clientId?: unknown; classicDeleted?: unknown }).clientId === cA && ((ngA.json.note ?? {}) as { classicDeleted?: unknown }).classicDeleted === false, "not görünümü (A, izinli): clientId korunur, classicDeleted=false");

    // ── SEC-06: bağlı klasik analiz yumuşak silinince not klasik tarafı göstermez ──
    section("SEC-06: silinmiş klasik analize bağlı not");
    const pDel = await insA(TA, { ...fx.PERSON_RECORD, title: "ZZ Silinecek Analiz" }, cA);
    const nd = await call(notRoute.POST, "POST", asA, { body: { legacyId: legacyA, classicId: pDel, clientId: cA, body: "Silinecek analize not" } });
    const ndId = ((nd.json.note ?? {}) as { id?: string }).id ?? "";
    const ndSnapBefore = ((nd.json.note ?? {}) as { snapshot?: { rows?: Array<{ c: unknown; l: unknown }> } }).snapshot;
    ok(nd.status === 201 && !!ndSnapBefore?.rows?.some((r) => r.c !== null), "not oluşturuldu (snapshot klasik tarafı içerir)");
    await su.query(`update public.numerology_classic_analyses set deleted_at = now() where id = $1`, [pDel]);
    const ndl = await call(notRoute.GET, "GET", asA, { query: `?classicId=${pDel}` });
    const ndv = ((ndl.json.notes ?? []) as Array<{ id: string; classicId: unknown; classicDeleted?: unknown; body?: string; legacyId?: unknown; snapshot?: { rows?: Array<{ c: unknown; l: unknown }>; stones?: { classicDirect: unknown[]; classicDerived: unknown[]; overlap: unknown[]; legacy: unknown[] }; sourceHashes?: { classic: unknown; legacy: unknown }; classicDeleted?: unknown } }>).find((x) => x.id === ndId);
    ok(ndl.status === 200 && !!ndv && ndv.classicId === null && ndv.classicDeleted === true, "liste: classicId null + classicDeleted: true", ndv && { classicId: ndv.classicId, classicDeleted: ndv.classicDeleted });
    ok(!!ndv && ndv.body === "Silinecek analize not" && ndv.legacyId === legacyA, "not gövdesi + mevcut bağ korunur");
    ok(!!ndv?.snapshot && (ndv.snapshot.rows ?? []).length > 0 && (ndv.snapshot.rows ?? []).every((r) => r.c === null && r.l !== null) && ndv.snapshot.sourceHashes?.classic === null && ndv.snapshot.sourceHashes?.legacy === canonicalSha256(legacySnap), "snapshot: klasik taraf çıkarıldı, mevcut taraf + özeti korundu", ndv?.snapshot?.sourceHashes);
    ok(!!ndv?.snapshot?.stones && ndv.snapshot.stones.classicDirect.length === 0 && ndv.snapshot.stones.classicDerived.length === 0 && ndv.snapshot.stones.overlap.length === 0, "snapshot: klasik taşlar / örtüşme boş");
    ok(!ndl.text.includes(pDel), "liste yanıtında silinmiş analiz kimliği geçmiyor");
    const ndg = await call(notIdRoute.GET, "GET", asA, { params: { id: ndId } });
    const ndgv = (ndg.json.note ?? {}) as { classicId?: unknown; classicDeleted?: unknown; snapshot?: { rows?: Array<{ c: unknown }> } };
    ok(ndg.status === 200 && ndgv.classicId === null && ndgv.classicDeleted === true && (ndgv.snapshot?.rows ?? []).every((r) => r.c === null) && !ndg.text.includes(pDel), "GET not: classicId null + klasik taraf yok", ndgv.classicId);
    const ndp = await call(notIdRoute.PATCH, "PATCH", asA, { params: { id: ndId }, body: { body: "Güncellendi", rowVersion: 1 } });
    ok(ndp.status === 200 && ((ndp.json.note ?? {}) as { classicId?: unknown; classicDeleted?: unknown }).classicDeleted === true && !ndp.text.includes(pDel), "PATCH yanıtı da klasik tarafı göstermez");
    const ndDb = (await su.query(`select classic_analysis_id from public.numerology_comparative_notes where id = $1`, [ndId])).rows[0];
    ok(ndDb.classic_analysis_id === pDel, "DB'de bağ korunur (geri alma / denetim için; yalnız görünüm gizler)");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "comparison", legacyId: legacyA, analysisId: pDel } })).status === 404, "silinmiş analizle karşılaştırma raporu → 404");
    await su.query(`delete from public.numerology_comparative_notes where id = $1`, [ndId]);

    // ── Rapor (B notu silinmeden önce karşılaştırma raporu) ──
    section("POST rapor (Word)");
    const reportCases: Array<[string, Record<string, unknown>]> = [
      ["person/full", { kind: "person", analysisId: pA }],
      ["person/summary+include", { kind: "person", analysisId: pA, variant: "summary", include: ["core", "stones"] }],
      ["person/technical", { kind: "person", analysisId: pA, variant: "technical" }],
      ["stones", { kind: "stones", analysisId: pA }],
      ["relationship", { kind: "relationship", analysisId: relA }],
      ["business", { kind: "business", analysisId: busA }],
      ["names", { kind: "names", analysisId: namA, variant: "summary" }],
      ["comparison/ids", { kind: "comparison", legacyId: legacyA, analysisId: pA }],
      ["comparison/note", { kind: "comparison", noteId: n1Id }],
    ];
    for (const [name, b] of reportCases) {
      const r = await call(raporRoute.POST, "POST", asA, { body: b });
      const ct = r.res.headers.get("content-type") ?? "";
      const cd = r.res.headers.get("content-disposition") ?? "";
      const okBin = r.status === 200 && ct === DOCX_MIME && !!r.buf && r.buf.length > 2000 && r.buf.subarray(0, 2).toString() === "PK";
      ok(okBin, `${name}: 200 docx (zip, boş değil)`, { s: r.status, ct, len: r.buf?.length, j: r.json });
      ok(/^attachment; filename="[A-Za-z0-9._-]+\.docx"/.test(cd) && (r.res.headers.get("cache-control") ?? "").includes("no-store"), `${name}: güvenli ek adı + no-store`, cd);
      if (okBin && r.buf) {
        const txt = await docxText(r.buf);
        docxTexts.push(txt);
        ok(!/roxy/i.test(txt) && !txt.includes(SOURCE_SECRET) && !txt.includes("<script"), `${name}: belgede sağlayıcı / kaynak adı / betik yok`);
        if (name === "comparison/note") ok(txt.includes("Güncel not"), "karşılaştırma raporu notu (güncel metin) içerir");
        if (name === "stones") ok(txt.includes("Ay Taşı"), "taş raporu eşleşen kütüphane taşını içerir");
      }
    }
    const rB = await call(raporRoute.POST, "POST", asB, { body: { kind: "person", analysisId: pA } });
    ok(rB.status === 404, "başka tenant'ın analizi → 404");
    ok((await call(raporRoute.POST, "POST", asB, { body: { kind: "comparison", noteId: n1Id } })).status === 404, "başka tenant'ın notu → 404");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "comparison", legacyId: legacyB } })).status === 404, "başka tenant'ın mevcut kaydı → 404");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "comparison", noteId: nBId } })).status === 404, "B'nin notu A için → 404");
    const km = await call(raporRoute.POST, "POST", asA, { body: { kind: "relationship", analysisId: pA } });
    ok(km.status === 400 && km.json.code === "KIND_MISMATCH", "tür uyuşmazlığı → 400 KIND_MISMATCH");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "stones", analysisId: busA } })).status === 400, "işletme analizine taş raporu → 400");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "pdf", analysisId: pA } })).status === 400, "geçersiz tür → 400");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "person" } })).status === 400, "analiz kimliği yok → 400");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "person", analysisId: pA, include: ["hack"] } })).status === 400, "geçersiz bölüm → 400");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "person", analysisId: pA, variant: "x" } })).status === 400, "geçersiz düzey → 400");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "comparison" } })).status === 400, "kaynaksız karşılaştırma → 400");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "person", analysisId: pA, tenantId: TB } })).status === 400, "fazla alan → 400");
    ok((await call(raporRoute.POST, "POST", asA, { raw: JSON.stringify({ kind: "person", analysisId: pA, pad: "x".repeat(17000) }) })).status === 413, "16 KB üstü → 413");
    const rD = await call(raporRoute.POST, "POST", asDemo, { body: { kind: "person", analysisId: pA, variant: "summary" } });
    ok(rD.status === 200 && (rD.res.headers.get("content-type") ?? "") === DOCX_MIME, "demo kayıtlı analizden Word indirebilir (okuma)");

    // Not silme (rapordan sonra)
    const d1 = await call(notIdRoute.DELETE, "DELETE", asA, { params: { id: n1Id } });
    ok(d1.status === 200 && d1.json.id === n1Id, "DELETE (sürümsüz → güncel sürüm) → 200");
    ok((await call(notIdRoute.GET, "GET", asA, { params: { id: n1Id } })).status === 404, "silinen not → 404");
    ok((await call(notIdRoute.DELETE, "DELETE", asA, { params: { id: n1Id } })).status === 404, "ikinci DELETE → 404");
    const soft = (await su.query(`select deleted_at from public.numerology_comparative_notes where id = $1`, [n1Id])).rows[0];
    ok(!!soft?.deleted_at, "not fiziksel olarak duruyor (yumuşak silme)");
    ok((await call(raporRoute.POST, "POST", asA, { body: { kind: "comparison", noteId: n1Id } })).status === 404, "silinen notla rapor → 404");

    // ── Genel ──
    section("NK-R3: Gelecek Yılları Göster (Klasik)");
    {
      const anRoute = await import("../../../app/api/numeroloji-klasik/analyses/route");
      const anIdRoute = await import("../../../app/api/numeroloji-klasik/analyses/[id]/route");
      const pngRoute = await import("../../../app/api/numeroloji-klasik/rapor/gorsel/route");
      const { currentIstanbulYear } = await import("../../../lib/numeroloji/currentYear");
      const cy = currentIstanbulYear();
      // Gelecek yıl hedefli kayıt (yetkili bir uzmanın hesapladığı varsayımı): zamanlama hedef yılı cy+3
      const futIso = `${cy + 3}-03-15`;
      // Kayıtlar üründe normalize (marka temizliği) sonrası saklanır; Word temizlik fikstürü kasıtlı kirli metin taşır →
      // bu bölümde ürünün gerçekte saklayacağı biçimde (marka/URL/etiket yok) temiz kopya kullanılır.
      const cleanRec = JSON.parse(JSON.stringify(fx.PERSON_RECORD).replace(new RegExp(fx.DIRTY_BRAND, "gi"), "kaynak").replace(/<\/?script>|https?:\/\/[^\s"]+/g, "")) as typeof fx.PERSON_RECORD;
      const pC = await insA(TA, { ...cleanRec, title: "ZZ Temiz Kişi" });
      const pF = await insA(TA, { ...cleanRec, title: "ZZ Gelecek Hedefli", input: { ...(cleanRec.input as object), targetDate: futIso } });
      await su.query(`update public.numerology_classic_analyses set provider_meta = jsonb_set(provider_meta, '{reference_date}', to_jsonb($2::text)) where id=$1`, [pF, futIso]);
      type Pin = { startAge: number };
      const resOf = (j: Record<string, unknown>) => ((j.analysis as { result?: Record<string, unknown> })?.result ?? {}) as Record<string, unknown>;
      const pinsOf = (r: Record<string, unknown>) => (((r.chart as { pinnacles?: Pin[] })?.pinnacles) ?? []);
      const gA = await call(anIdRoute.GET, "GET", asA, { params: { id: pC } });
      const gAF = await call(anIdRoute.GET, "GET", asAF, { params: { id: pC } });
      const birthY = 1988;
      ok(gA.status === 200 && pinsOf(resOf(gA.json)).every((p) => birthY + p.startAge <= cy) && pinsOf(resOf(gA.json)).length < pinsOf(resOf(gAF.json)).length,
        "GET (izinsiz): başlangıç yılı > içinde bulunulan yıl olan zirveler GÖNDERİLMEZ", { a: pinsOf(resOf(gA.json)).map((p) => p.startAge), af: pinsOf(resOf(gAF.json)).map((p) => p.startAge) });
      ok(pinsOf(resOf(gAF.json)).length === 4 && !("futureYearsView" in resOf(gAF.json)), "GET (yetkili): tüm dönemler, kısıt işareti yok");
      ok((resOf(gA.json).futureYearsView as { restricted?: boolean })?.restricted === true, "GET (izinsiz): futureYearsView.restricted işareti (ekran notu)");
      const fA = resOf((await call(anIdRoute.GET, "GET", asA, { params: { id: pF } })).json);
      const fAF = resOf((await call(anIdRoute.GET, "GET", asAF, { params: { id: pF } })).json);
      ok(!("personal_day" in fA) && !("personalYear" in ((fA.chart ?? {}) as object)) && "personal_day" in fAF && "personalYear" in ((fAF.chart ?? {}) as object),
        "GET (izinsiz): gelecek yıl hedefli kişisel yıl/ay/gün GÖNDERİLMEZ; yetkili tam görür");
      const dbRow = await su.query(`select result from public.numerology_classic_analyses where id=$1`, [pF]);
      ok("personal_day" in (dbRow.rows[0].result as object), "veritabanı kaydı DEĞİŞMEDİ (yalnız görünüm daraltılır)");
      // Word / PNG / karşılaştırma
      const wA = await call(raporRoute.POST, "POST", asA, { body: { kind: "person", analysisId: pF, variant: "full" } });
      const wAF = await call(raporRoute.POST, "POST", asAF, { body: { kind: "person", analysisId: pF, variant: "full" } });
      const JSZip = (await import("jszip")).default;
      const xml = async (b: Buffer | null) => (b ? await (await JSZip.loadAsync(b)).file("word/document.xml")!.async("string") : "");
      const xA = await xml(wA.buf);
      const xAF = await xml(wAF.buf);
      ok(wA.status === 200 && !xA.includes("Kişisel gün —") && !xA.includes("Tamamlanma") && xAF.includes("Kişisel gün —") && xAF.includes("Tamamlanma"),
        "Word (izinsiz): gelecek zirve + gelecek yıl kişisel gün YOK; yetkili tam");
      const pgA = await call(pngRoute.POST, "POST", asA, { body: { analysisId: pF } });
      const pgAF = await call(pngRoute.POST, "POST", asAF, { body: { analysisId: pF } });
      ok(pgA.status === 200 && pgAF.status === 200 && !!pgA.buf && !!pgAF.buf && !pgA.buf.equals(pgAF.buf), "PNG (izinsiz) yetkiliden farklı (daraltılmış içerik)");
      const { buildClassicPngSvg } = await import("../../../lib/numeroloji-klasik/report/pngSvg");
      const { redactClassicResultForFutureYears } = await import("../../../lib/numeroloji-klasik/futureYears");
      const red = redactClassicResultForFutureYears(cleanRec.result, { input: { ...(cleanRec.input as object), targetDate: futIso }, referenceDate: futIso }, { futureYears: false, currentYear: cy }) as Record<string, unknown>;
      const svgRed = buildClassicPngSvg({ ...cleanRec, result: red, referenceDate: futIso }, { generatedAt: new Date() });
      ok(!!svgRed && !svgRed.svg.includes("Kişisel Gün") && !svgRed.svg.includes("Kişisel Yıl"), "PNG içeriği (izinsiz): gelecek yıl kişisel yıl/gün kartı YOK");
      const hA = await call(hizalaRoute.POST, "POST", asA, { body: { classicId: pF } });
      const hAF = await call(hizalaRoute.POST, "POST", asAF, { body: { classicId: pF } });
      const zr = (j: Record<string, unknown>) => JSON.stringify(((j.alignment as { rows?: Array<Record<string, unknown>> })?.rows ?? []).filter((r) => r.conceptKey === "zirve" || r.conceptKey === "kisisel_yil" || r.conceptKey === "kisisel_gun"));
      ok(hA.status === 200 && hAF.status === 200 && zr(hA.json) !== zr(hAF.json), "karşılaştırma (izinsiz): Klasik taraf da daraltılır (zirve / kişisel döngü satırları farklı)", { a: zr(hA.json).slice(0, 300), af: zr(hAF.json).slice(0, 300) });
      // Yeni hesap: gelecek yıl hedefi → 403 (sağlayıcıya GİDİLMEZ)
      const before = blocked.length;
      const post = await call(anRoute.POST, "POST", asA, { body: { kind: "person", techniques: ["core"], input: { fullName: "Ayşe Örnek", birth: { year: 1988, month: 11, day: 29 }, targetDate: futIso } } });
      ok(post.status === 403 && post.json.code === "FUTURE_YEARS_PERMISSION_REQUIRED" && blocked.length === before, "POST (izinsiz) gelecek yıl hedefi → 403, sağlayıcı çağrısı YOK", post.json);
      // İzinli durumlar (bu yıl içindeki hedef / yetkili uzman) sağlayıcıya gideceği için burada çağrılmaz (bu paket
      // "0 sağlayıcı çağrısı" değişmezini korur); karar fonksiyonu server/unit.harness.ts'te birim testlidir.
      const eA = await call((await import("../../../app/api/numeroloji-klasik/entitlements/route")).GET, "GET", asA);
      const eAF = await call((await import("../../../app/api/numeroloji-klasik/entitlements/route")).GET, "GET", asAF);
      ok(eA.json.canSeeFutureYears === false && eAF.json.canSeeFutureYears === true, "entitlements.canSeeFutureYears (arayüz ipucu)");
    }

    section("genel değişmezler");
    ok(blocked.length === 0, "ağ kilidi: taşlar / karşılaştırma / rapor boyunca 0 dış istek (sağlayıcı çağrısı yok)", blocked);
    const calls = (await su.query(`select count(*)::int n from public.numerology_classic_provider_calls`)).rows[0].n;
    ok(calls === 0, "sağlayıcı çağrı defteri boş (0 satır)", calls);
    const digestAfter = await legacyDigest();
    ok(JSON.stringify(digestAfter) === JSON.stringify(digestBefore), "mevcut numerology_* + dogaltas_inventory satırları koşu öncesi/sonrası BİREBİR", { before: digestBefore, after: digestAfter });
    const allJson = jsonTexts.join("\n");
    { const m = /roxy/i.exec(allJson); ok(!m, `hiçbir JSON yanıtında sağlayıcı adı yok (${jsonTexts.length} yanıt)`, m ? allJson.slice(Math.max(0, m.index - 300), m.index + 80) : undefined); }
    ok(!allJson.includes(SOURCE_SECRET) && !/"source_(key|name)"/.test(allJson), "hiçbir JSON yanıtında taş kaynağı adı / anahtarı yok");
    ok(!/zz-numk-fake-key/.test(allJson), "anahtar sızmadı");
    ok(docxTexts.length === reportCases.length && docxTexts.every((t) => !/roxy/i.test(t)), `hiçbir Word belgesinde sağlayıcı adı yok (${docxTexts.length} belge)`);
    const pmLeak = (await call(hizalaRoute.POST, "POST", asA, { body: { classicId: pA } })).text;
    ok(!pmLeak.includes("provider_meta") && !pmLeak.includes('"provider"'), "provider_meta uzman yanıtına girmez");
  } finally {
    await env.stop();
    globalThis.fetch = realFetch;
  }
  console.log(`\n${pass} ✓ / ${fail} ✗`);
  if (fail) console.log(`BAŞARISIZ:\n  - ${failures.join("\n  - ")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("harness hatası:", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
