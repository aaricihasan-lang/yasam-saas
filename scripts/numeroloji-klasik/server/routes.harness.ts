/**
 * Klasik Numeroloji — SERVİS + ROUTE harness'i (gerçek route handler'ları + gerçek migration'lı yerel PG).
 *
 * PROD/STAGING'E SIFIR TEMAS: geçici embedded-postgres + PostgREST shim (127.0.0.1). Sağlayıcı çağrıları
 * SAHTE (fetch kilidi: yalnız 127.0.0.1 gerçek; sağlayıcı host'u sahte yanıt; diğer her host → hata).
 * Normalize katmanı test sürecinde sahte modüle yönlendirilir (sağlayıcı metni repoya girmez).
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/server/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";

const ROOT = path.resolve(__dirname, "../../..");
const FAKE_NORMALIZE = path.join(__dirname, "fixtures", "fakeNormalize.ts");
{
  const M = Module as unknown as { _resolveFilename: (req: string, parent: { filename?: string } | undefined, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, parent: { filename?: string } | undefined, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    if (req === "../normalize" && parent?.filename && /numeroloji-klasik[\\/]server[\\/]normalizerBridge\.ts$/.test(parent.filename)) return FAKE_NORMALIZE;
    return orig.call(this, req, parent, ...rest);
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
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
  }
}
const section = (s: string) => console.log(`\n[${s}]`);

// ── Sahte sağlayıcı ─────────────────────────────────────────────────────────
type Responder = (url: string, body: Record<string, unknown> | null) => Response | Promise<Response>;
const provider = { calls: [] as Array<{ url: string; body: Record<string, unknown> | null; key: string | null }>, responder: null as Responder | null, blocked: [] as string[] };
const rateHeaders = (remaining = 49000) => ({ "content-type": "application/json", "x-ratelimit-limit": "50000", "x-ratelimit-remaining": String(remaining), "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 86400 * 20) });
const defaultResponder: Responder = (url, body) => new Response(JSON.stringify({ echo: { url: url.replace(/\?.*$/, ""), body } }), { status: 200, headers: rateHeaders() });
async function fakeProviderFetch(url: string, init: RequestInit): Promise<Response> {
  const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  const h = (init.headers ?? {}) as Record<string, string>;
  provider.calls.push({ url, body, key: h["X-API-Key"] ?? null });
  const signal = init.signal;
  const work = Promise.resolve((provider.responder ?? defaultResponder)(url, body));
  if (!signal) return work;
  // Gerçek fetch gibi: AbortSignal tetiklenince AbortError ile reddet (zaman aşımı senaryosu).
  return Promise.race([
    work,
    new Promise<Response>((_r, rej) => {
      if (signal.aborted) rej(Object.assign(new Error("aborted"), { name: "AbortError" }));
      signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
  ]);
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    if (u.startsWith("https://roxyapi.com/api/v2/numerology/")) return fakeProviderFetch(u, init ?? {});
    provider.blocked.push(u.replace(/[?#].*$/, ""));
    throw new Error(`ağ kilidi: ${u.replace(/[?#].*$/, "")}`);
  }) as typeof fetch;

  const LEGACY = `create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
      name text, surname text, birth_date text, analysis_data jsonb, created_at timestamptz default now());`;
  const MIGS = ["20270121000000_numerology_core_rls_lock.sql", "20271120000300_numerology_records_client_link.sql", "20271205000000_numerology_classic_core.sql"]
    .map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.NUMK_PG_PORT ?? 54591),
    dirName: `num-klasik-${Date.now()}`,
    extraSql: [LEGACY, ...MIGS, "grant select on public.numerology_records to service_role;"],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.NUMEROLOGY_CLASSIC_ENABLED = "true";
  process.env.NUMEROLOGY_CLASSIC_PROVIDER_CALLS = "true";
  process.env.ROXY_API_KEY = "zz-numk-fake-key-NOT-REAL";
  // Taban adres ortamdan değiştirilemez (providerClient yalnız resmî host'a birebir eşit değeri kabul eder); fetch sahtedir.
  delete process.env.NUMEROLOGY_CLASSIC_QUOTA_FLOOR;
  process.env.NUMEROLOGY_CLASSIC_CACHE_SECRET = "zz-numk-cache-secret";
  delete process.env.USAGE360_ENABLED;
  const su = env.su;
  su.on("error", (e) => console.error("  (test PG bağlantı hatası)", e.message));

  try {
    // ── Tohum ──
    const TA = randomUUID();
    const TB = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_NUMK_A'),($2,'ZZ_NUMK_B')`, [TA, TB]);
    const mk = async (label: string, tenant: string, perms: Record<string, boolean>, demo = false) => {
      const id = randomUUID();
      const token = `zz-numk-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
         values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,$6)`,
        [id, `ZZ_NUMK_${label}`, `zz.numk.${label.toLowerCase()}@example.test`, JSON.stringify(perms), tenant, demo],
      );
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const U = {
      A: await mk("A", TA, { numerology: true, clients: true }),
      A2: await mk("A2", TA, { numerology: true, clients: false }),
      DEMO: await mk("DEMO", TA, { numerology: true, clients: true }, true),
      NOMOD: await mk("NOMOD", TA, { clients: true, numerology: false }),
      B: await mk("B", TB, { numerology: true, clients: true }),
    };
    const cA = randomUUID();
    const cB = randomUUID();
    await su.query(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,'ZZ Ayşe','YILMAZ'),($3,$4,'ZZ Bora','DEMİR')`, [cA, TA, cB, TB]);
    const legacyA = randomUUID();
    await su.query(`insert into public.numerology_records(id, tenant_id, name, surname, birth_date, analysis_data, client_id) values ($1,$2,'ZZ Ayşe','YILMAZ','1990-03-21','{"lifePath":7}',$3)`, [legacyA, TA, cA]);
    const lucky1 = { gemstones: ["Ruby", "Garnet"], colors: ["red"], day: "Sunday", element: "Fire", rulingPlanet: "Sun", compatibleNumbers: [3, 5], incompatibleNumbers: [6] };
    await su.query(`insert into public.numerology_classic_catalog(kind, number, lang, payload, spec_version) values ('lucky_association',1,'en',$1,'s'),('pythagorean_meaning',7,'tr','{"title":"Arayıcı"}','s')`, [JSON.stringify(lucky1)]);

    const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const pc = await import("../../../lib/numeroloji-klasik/server/providerClient");
    const quota = await import("../../../lib/numeroloji-klasik/server/quota");
    const svc = await import("../../../lib/numeroloji-klasik/server/service");
    const repo = await import("../../../lib/numeroloji-klasik/server/repository");
    const input = await import("../../../lib/numeroloji-klasik/input");
    const fakeNorm = await import("./fixtures/fakeNormalize");

    // ── Servis düzeyi (enjekte bağımlılıklar; gerçek istemci + sahte fetch) ──
    type Deps = Parameters<typeof svc.computeClassicAnalysis>[2];
    const memBuckets = new Map<string, number>();
    const memRateLimit = async (scope: string, value: string, limit: number) => {
      const k = `${scope}:${value}`;
      const n = (memBuckets.get(k) ?? 0) + 1;
      memBuckets.set(k, n);
      return { allowed: n <= limit, retryAfterSec: n <= limit ? 0 : 30 };
    };
    const sleeps: number[] = [];
    const deps = (over: Partial<Deps> = {}): Deps => ({
      providerCallsEnabled: true,
      config: { apiKey: "zz-numk-fake-key-NOT-REAL", baseUrl: pc.CLASSIC_PROVIDER_BASE_URL },
      callProvider: (c, id, p, o) => pc.callClassicEndpoint(c, id, p, { ...o, fetchImpl: fakeProviderFetch, sleep: async (ms) => { sleeps.push(ms); }, timeoutMs: 30 }),
      normalize: fakeNorm.normalizeEndpointResponse,
      verify: fakeNorm.verifyWithOracle,
      rateLimit: memRateLimit,
      quotaState: new quota.ProviderQuotaState(),
      quotaFloor: 3000,
      cacheSecret: "zz-numk-cache-secret",
      ...over,
    });
    const ctxA = { db, tenantId: TA, userId: U.A.id, isDemo: false, canLinkClients: true };
    const ctxB = { db, tenantId: TB, userId: U.B.id, isDemo: false, canLinkClients: true };
    const req = (body: unknown) => {
      const v = input.validateAnalysisRequest(body);
      if (!v.ok) throw new Error(`doğrulama: ${v.error}`);
      return v.value;
    };
    const person = (fullName: string, techniques: string[] = ["core"], extra: Record<string, unknown> = {}) =>
      req({ kind: "person", techniques, ...extra, input: { fullName, birth: { year: 1987, month: 2, day: 14 } } });
    const countRows = async (tenant: string) => (await su.query(`select count(*)::int n from public.numerology_classic_analyses where tenant_id = $1`, [tenant])).rows[0].n as number;

    section("depo: katalog okuyucu");
    const ce = await repo.getCatalogEntry(db, "lucky_association", 1, "en");
    ok(ce.ok && input.canonicalJson(ce.value.payload) === input.canonicalJson(lucky1), "getCatalogEntry(lucky_association, 1, en)", ce);
    const ce2 = await repo.getCatalogEntry(db, "lucky_association", 2, "en");
    ok(!ce2.ok && ce2.reason === "not_found", "olmayan katalog girdisi → not_found");

    section("servis: önbellek / yeniden açma / tek-uçuş");
    provider.calls.length = 0;
    const s1 = await svc.computeClassicAnalysis(ctxA, person("Deniz Kaya"), deps());
    ok(s1.status === 201 && s1.body.ok, "kişi analizi hesaplanır + kaydedilir (201)", s1);
    ok(provider.calls.length === 1 && provider.calls[0].url === "https://roxyapi.com/api/v2/numerology/chart?lang=tr", "tek çağrı: /numerology/chart?lang=tr", provider.calls.map((c) => c.url));
    ok(provider.calls[0]?.body?.fullName === "Deniz Kaya" && provider.calls[0]?.body?.targetDate === svc.istanbulToday(new Date()) && !("currentYear" in (provider.calls[0]?.body ?? {})), "gövde: fullName + doğum + targetDate (Europe/Istanbul bugünü); currentYear YOK", provider.calls[0]?.body);
    const id1 = s1.body.ok ? s1.body.analysis.id : "";
    ok(s1.body.ok && s1.body.analysis.status === "complete" && !!(s1.body.analysis.result as Record<string, unknown>).chart, "status complete + result.chart");
    ok(s1.body.ok && (s1.body.analysis.verification as Record<string, { status?: string }>).chart?.status === "match", "doğrulama (oracle) sonucu kayıtlı");
    ok(s1.body.ok && input.canonicalJson((s1.body.analysis.result as Record<string, Record<string, unknown>>).chart.luckyEn ?? null) === input.canonicalJson(lucky1), "chart sonucuna EN uğurlu ilişkiler katalogdan eklendi (luckyEn; ek çağrı yok)");
    ok(s1.body.ok && !JSON.stringify(s1.body).toLowerCase().includes("roxy"), "uzman yanıtında sağlayıcı adı yok");

    provider.calls.length = 0;
    const s2 = await svc.computeClassicAnalysis(ctxA, person("Deniz Kaya"), deps());
    ok(s2.status === 201 && provider.calls.length === 0, "aynı girdi → önbellek isabeti, 0 sağlayıcı çağrısı", provider.calls.length);
    const meta2 = (await su.query(`select provider_meta from public.numerology_classic_analyses where id = $1`, [s2.body.ok ? s2.body.analysis.id : null])).rows[0]?.provider_meta;
    ok(meta2?.cache_hits === 1 && meta2?.provider_calls === 0, "provider_meta: cache_hits=1, provider_calls=0", meta2);
    ok(!JSON.stringify(meta2).includes("zz-numk-fake-key"), "provider_meta anahtar içermez");

    provider.calls.length = 0;
    const g1 = await repo.getAnalysis(db, TA, id1);
    ok(g1.ok && provider.calls.length === 0, "kayıtlı analizi açma → 0 çağrı");
    const gB = await repo.getAnalysis(db, TB, id1);
    ok(!gB.ok && gB.reason === "not_found", "başka tenant aynı id'yi okuyamaz (not_found)");

    provider.calls.length = 0;
    const sB = await svc.computeClassicAnalysis(ctxB, person("Deniz Kaya"), deps());
    ok(sB.status === 201 && provider.calls.length === 1, "başka tenant aynı girdi → önbellek PAYLAŞILMAZ (1 çağrı)");

    provider.calls.length = 0;
    provider.responder = async (u, b) => { await new Promise((r) => setTimeout(r, 15)); return defaultResponder(u, b); };
    const before = await countRows(TA);
    const conc = await Promise.all([1, 2, 3].map(() => svc.computeClassicAnalysis(ctxA, person("Eşzamanlı Kişi"), deps())));
    provider.responder = null;
    const ids = new Set(conc.map((c) => (c.body.ok ? c.body.analysis.id : "x")));
    ok(provider.calls.length === 1 && conc.every((c) => c.status === 201) && ids.size === 1, "3 eşzamanlı aynı istek → 1 sağlayıcı çağrısı, tek kayıt", { calls: provider.calls.length, ids: [...ids] });
    ok((await countRows(TA)) === before + 1, "eşzamanlı istekler tek satır yazdı");

    provider.calls.length = 0;
    provider.responder = async (u, b) => { await new Promise((r) => setTimeout(r, 15)); return defaultResponder(u, b); };
    await Promise.all([
      svc.computeClassicAnalysis(ctxA, person("Paylaşımlı Çağrı", ["core"]), deps()),
      svc.computeClassicAnalysis(ctxA, person("Paylaşımlı Çağrı", ["core", "bridge"]), deps()),
    ]);
    provider.responder = null;
    const chartCalls = provider.calls.filter((c) => c.url.includes("/numerology/chart")).length;
    ok(chartCalls === 1 && provider.calls.length === 2, "farklı istekler ortak uç için tek-uçuş (chart 1 kez + bridge 1)", provider.calls.map((c) => c.url));

    section("servis: hatalar / kısmi sonuç / yeniden deneme");
    provider.calls.length = 0;
    provider.responder = (u, b) => (u.includes("/bridge") ? new Response("{}", { status: 500 }) : defaultResponder(u, b));
    const p1 = await svc.computeClassicAnalysis(ctxA, person("Kısmi Kişi", ["core", "bridge", "chaldean"]), deps());
    provider.responder = null;
    ok(p1.status === 201 && p1.body.ok && p1.body.analysis.status === "partial" && JSON.stringify(p1.body.analysis.meta.failed) === '["bridge"]', "bir uç 500 → status partial, failed=[bridge], kayıt yapılır", p1.body);
    ok(p1.body.ok && !("bridge" in (p1.body.analysis.result as object)) && "chaldean" in (p1.body.analysis.result as object), "başarılı uçlar sonuçta, düşen yok");

    provider.calls.length = 0;
    const rowsBefore = await countRows(TA);
    provider.responder = () => new Promise<Response>(() => undefined); // asla yanıt vermez → zaman aşımı
    const t1 = await svc.computeClassicAnalysis(ctxA, person("Zaman Aşımı"), deps());
    provider.responder = null;
    ok(t1.status === 504 && !t1.body.ok && t1.body.code === "PROVIDER_TIMEOUT", "tüm çağrılar zaman aşımı → 504 PROVIDER_TIMEOUT", t1);
    ok(provider.calls.length === 1, "zaman aşımında YENİDEN DENEME YOK (1 çağrı)", provider.calls.length);
    ok((await countRows(TA)) === rowsBefore, "tümü düştü → kayıt YOK");
    ok(!t1.body.ok && !/roxy|api|http/i.test(t1.body.error), "hata mesajı Türkçe, sağlayıcı/iç ayrıntı yok", t1.body);

    provider.calls.length = 0;
    sleeps.length = 0;
    let n429 = 0;
    provider.responder = (u, b) => (n429++ === 0 ? new Response("{}", { status: 429, headers: { "retry-after": "1" } }) : defaultResponder(u, b));
    const r429 = await svc.computeClassicAnalysis(ctxA, person("Yeniden Deneme"), deps());
    provider.responder = null;
    ok(r429.status === 201 && provider.calls.length === 2 && sleeps[0] === 1000, "429 + Retry-After 1 sn → tek yeniden deneme, başarı", { s: r429.status, n: provider.calls.length, sleeps });

    provider.calls.length = 0;
    provider.responder = () => new Response("{oops", { status: 200, headers: rateHeaders() });
    const mj = await svc.computeClassicAnalysis(ctxA, person("Bozuk Json"), deps());
    provider.responder = null;
    ok(mj.status === 502 && !mj.body.ok && mj.body.code === "PROVIDER_ERROR" && provider.calls.length === 1, "bozuk JSON → 502, yeniden deneme yok, kayıt yok", mj);

    provider.calls.length = 0;
    provider.responder = (u, b) => new Response(JSON.stringify({ __reject: true, echo: { url: u, body: b } }), { status: 200, headers: rateHeaders() });
    const nr = await svc.computeClassicAnalysis(ctxA, person("Normalize Reddi"), deps());
    const nr2 = await svc.computeClassicAnalysis(ctxA, person("Normalize Reddi"), deps());
    provider.responder = null;
    ok(nr.status === 502 && nr2.status !== 201, "normalize reddi → 502 (önbelleğe bozuk sonuç YAZILMAZ)", { a: nr.status, b: nr2.status });

    section("servis: kota tabanı / limitler / kilit");
    provider.calls.length = 0;
    const qs = new quota.ProviderQuotaState();
    provider.responder = (u, b) => new Response(JSON.stringify({ echo: { url: u, body: b } }), { status: 200, headers: rateHeaders(2500) });
    const q1 = await svc.computeClassicAnalysis(ctxA, person("Kota Bir"), deps({ quotaState: qs }));
    provider.responder = null;
    ok(q1.status === 201 && qs.known(Date.now()) === 2500, "yanıt başlığından kalan kota gözlemlendi (2500)");
    provider.calls.length = 0;
    const q2 = await svc.computeClassicAnalysis(ctxA, person("Kota İki"), deps({ quotaState: qs }));
    ok(q2.status === 503 && !q2.body.ok && q2.body.code === "QUOTA_PROTECTED" && provider.calls.length === 0, "kalan < taban (3000) → 503 QUOTA_PROTECTED, 0 çağrı (HD/Atlas korunur)", q2);
    const q3 = await svc.computeClassicAnalysis(ctxA, person("Deniz Kaya"), deps({ quotaState: qs }));
    ok(q3.status === 201 && provider.calls.length === 0, "taban altındayken bile önbellek isabeti çalışır (0 çağrı)");
    const coldQs = new quota.ProviderQuotaState();
    const q4 = await svc.computeClassicAnalysis(ctxA, person("Kota Soğuk"), deps({ quotaState: coldQs }));
    ok(q4.status === 503 && provider.calls.length === 0 && coldQs.known(Date.now()) === 2500, "soğuk başlangıç: defterden son kalan kota okunur → yine engel", { s: q4.status, k: coldQs.known(Date.now()) });
    const q5 = await svc.computeClassicAnalysis(ctxA, person("Kota Taban Düşük"), deps({ quotaState: coldQs, quotaFloor: 1000 }));
    ok(q5.status === 201 && provider.calls.length === 1, "taban 1000 iken kalan 2500 → çağrıya izin");
    await su.query(`delete from public.numerology_classic_provider_calls where quota_remaining is not null and quota_remaining < 3000`);
    // NK-006: başlık payı (hesap sayacı başlıktan düşük) + 429 soğuması
    provider.calls.length = 0;
    const gq = new quota.ProviderQuotaState();
    gq.observe({ limit: 50000, remaining: 20000, resetAt: Date.now() + 86400_000 }, Date.now());
    const nkg1 = await svc.computeClassicAnalysis(ctxA, person("Kota Pay"), deps({ quotaState: gq, quotaHeaderGap: 18000 }));
    ok(nkg1.status === 503 && !nkg1.body.ok && nkg1.body.code === "QUOTA_PROTECTED" && provider.calls.length === 0, "NK-006: başlık 20000 − pay 18000 < taban 3000 → 503, 0 çağrı", nkg1.status);
    const rq = new quota.ProviderQuotaState();
    rq.observe({ limit: 50000, remaining: 40000, resetAt: Date.now() + 86400_000 }, Date.now());
    provider.responder = () => new Response(JSON.stringify({ code: "rate_limited" }), { status: 429, headers: { ...rateHeaders(40000), "retry-after": "999" } });
    const r1 = await svc.computeClassicAnalysis(ctxA, person("Kota Dört Yüz Yirmi Dokuz"), deps({ quotaState: rq }));
    provider.responder = null;
    const nkBefore = provider.calls.length;
    const r2 = await svc.computeClassicAnalysis(ctxA, person("Kota Soğuma"), deps({ quotaState: rq }));
    ok(r1.status !== 201 && r2.status === 503 && !r2.body.ok && r2.body.code === "QUOTA_PROTECTED" && provider.calls.length === nkBefore, "NK-006: 429 sonrası soğuma → sonraki hesap 503 QUOTA_PROTECTED, 0 çağrı", { r1: r1.status, r2: r2.status });
    const usageCalls = provider.calls.filter((c) => /\/usage/.test(c.url)).length;
    ok(usageCalls === 0, "/usage ucu otomatik çağrılmadı");

    provider.calls.length = 0;
    const denyScope = (scope: string) => async (s: string, v: string, l: number, w: number) => (s === scope ? { allowed: false, retryAfterSec: 120 } : memRateLimit(s, v, l));
    const rl1 = await svc.computeClassicAnalysis(ctxA, person("Limit Kullanıcı"), deps({ rateLimit: denyScope("numk-user") }));
    ok(rl1.status === 429 && !rl1.body.ok && rl1.body.code === "RATE_LIMITED" && rl1.body.retryAfterSec === 120 && provider.calls.length === 0, "kullanıcı/saat limiti → 429 + Retry-After, 0 çağrı", rl1);
    const rl2 = await svc.computeClassicAnalysis(ctxA, person("Limit Tenant"), deps({ rateLimit: denyScope("numk-tenant") }));
    ok(rl2.status === 429 && provider.calls.length === 0, "tenant/gün limiti → 429, 0 çağrı");
    const rl3 = await svc.computeClassicAnalysis(ctxA, person("Limit Kilit"), deps({ rateLimit: denyScope("numk-inflight") }));
    ok(rl3.status === 409 && !rl3.body.ok && rl3.body.code === "IN_PROGRESS" && provider.calls.length === 0, "başka instance aynı anahtarı hesaplıyor → 409, 0 çağrı");
    const seen: string[] = [];
    await svc.computeClassicAnalysis(ctxA, person("Limit Kapsam"), deps({ rateLimit: async (s, v, l) => { seen.push(s); return memRateLimit(s, v, l); } }));
    ok(seen.join(",") === "numk-inflight,numk-user,numk-tenant", "sıra: kilit → kullanıcı → tenant (yalnız gerçek çağrıda)", seen);
    seen.length = 0;
    await svc.computeClassicAnalysis(ctxA, person("Limit Kapsam"), deps({ rateLimit: async (s, v, l) => { seen.push(s); return memRateLimit(s, v, l); } }));
    ok(seen.length === 0, "önbellek isabetinde limit/kilit TÜKETİLMEZ");

    section("servis: demo / bayrak / yapılandırma / danışan bağı");
    provider.calls.length = 0;
    const d1 = await svc.computeClassicAnalysis({ ...ctxA, isDemo: true }, person("Demo Kişi"), deps());
    ok(d1.status === 403 && !d1.body.ok && d1.body.code === "DEMO_READONLY" && provider.calls.length === 0, "demo → 403 DEMO_READONLY, 0 çağrı");
    const f1 = await svc.computeClassicAnalysis(ctxA, person("Bayrak Kapalı"), deps({ providerCallsEnabled: false }));
    ok(f1.status === 503 && !f1.body.ok && f1.body.code === "PROVIDER_CALLS_DISABLED" && provider.calls.length === 0, "çağrı bayrağı kapalı → 503, 0 çağrı");
    const c1 = await svc.computeClassicAnalysis(ctxA, person("Anahtarsız"), deps({ config: null }));
    ok(c1.status === 503 && !c1.body.ok && c1.body.code === "NOT_CONFIGURED" && provider.calls.length === 0, "anahtar yok → 503 NOT_CONFIGURED");
    const l1 = await svc.computeClassicAnalysis({ ...ctxA, canLinkClients: false }, person("Bağ İzinsiz", ["core"], { clientId: cA }), deps());
    ok(l1.status === 403 && !l1.body.ok && l1.body.code === "CLIENTS_PERMISSION_REQUIRED" && provider.calls.length === 0, "clients izni yok + danışan bağı → 403, 0 çağrı");
    const l2 = await svc.computeClassicAnalysis(ctxA, person("Bağ Yabancı", ["core"], { clientId: cB }), deps());
    ok(l2.status === 404 && !l2.body.ok && l2.body.code === "CLIENT_NOT_FOUND" && provider.calls.length === 0, "başka tenant'ın danışanı → 404, 0 çağrı");
    const l3 = await svc.computeClassicAnalysis(ctxA, person("Bağlı Kişi", ["core"], { clientId: cA }), deps());
    ok(l3.status === 201 && l3.body.ok && l3.body.analysis.clientId === cA, "kendi danışanı → bağlı kayıt");

    section("servis: tarih bağımlı + ilişki / işletme / isim");
    provider.calls.length = 0;
    const day = (iso: string) => deps({ now: () => new Date(iso) });
    await svc.computeClassicAnalysis(ctxA, person("Günlük Kişi", ["personal_day"]), day("2026-10-29T09:00:00Z"));
    await svc.computeClassicAnalysis(ctxA, person("Günlük Kişi", ["personal_day"]), day("2026-10-29T15:00:00Z"));
    await svc.computeClassicAnalysis(ctxA, person("Günlük Kişi", ["personal_day"]), day("2026-10-30T09:00:00Z"));
    ok(provider.calls.length === 2 && provider.calls[0].body?.targetDate === "2026-10-29" && provider.calls[1].body?.targetDate === "2026-10-30", "kişisel gün: aynı gün önbellek, yeni gün yeni çağrı", provider.calls.map((c) => c.body));
    provider.calls.length = 0;
    const relR = await svc.computeClassicAnalysis(ctxA, req({ kind: "relationship", input: { person1: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 } }, person2: { fullName: "Ayşe", birth: { year: 1992, month: 3, day: 4 } } } }), deps());
    ok(relR.status === 201 && provider.calls.length === 1 && provider.calls[0].url.includes("/numerology/compatibility") && (provider.calls[0].body?.person2 as { fullName?: string })?.fullName === "Ayşe", "ilişki → /compatibility tek çağrı");
    provider.calls.length = 0;
    const busR = await svc.computeClassicAnalysis(ctxA, req({ kind: "business", input: { name: "Yaşam & Şifa" } }), deps());
    ok(busR.status === 201 && provider.calls.length === 1 && provider.calls[0].url.includes("/numerology/business-name"), "işletme → /business-name tek çağrı");
    provider.calls.length = 0;
    const namR = await svc.computeClassicAnalysis(ctxA, req({ kind: "names", input: { candidates: ["Ada", "Defne", "Elif"] } }), deps());
    ok(namR.status === 201 && provider.calls.length === 3 && provider.calls.every((c) => c.url.includes("/numerology/dual")), "isimler → aday başına /dual (3)");
    ok(namR.body.ok && Object.keys(namR.body.analysis.result as object).sort().join(",") === "dual#1,dual#2,dual#3", "sonuç aday etiketleriyle");

    section("servis: İki Sistem yerel türetme / hedef tarih");
    provider.calls.length = 0;
    const du = await svc.computeClassicAnalysis(ctxA, person("İki Sistem", ["dual"]), deps());
    ok(du.status === 201 && provider.calls.length === 2 && !provider.calls.some((c) => c.url.includes("/numerology/dual")), "İki Sistem → chart + chaldean (2 çağrı), /dual ÇAĞRILMADI", provider.calls.map((c) => c.url));
    const duRes = du.body.ok ? (du.body.analysis.result as Record<string, { pythagorean?: { value?: number }; chaldean?: { root?: number }; verification?: unknown }>) : {};
    ok(duRes.dual?.pythagorean?.value === 6 && duRes.dual?.chaldean?.root === 6 && !!duRes.dual?.verification, "dual sonuç: expression + kalde destiny birleşik + doğrulanmış", duRes.dual);
    const duMeta = (await su.query(`select provider_meta from public.numerology_classic_analyses where id = $1`, [du.body.ok ? du.body.analysis.id : null])).rows[0]?.provider_meta;
    ok(duMeta?.derived?.dual === "dual_from_chart_chaldean" && du.body.ok && du.body.analysis.status === "complete", "provider_meta.derived.dual = dual_from_chart_chaldean", duMeta?.derived);
    provider.calls.length = 0;
    provider.responder = (u, b) => (u.includes("/chaldean") ? new Response("{}", { status: 500 }) : defaultResponder(u, b));
    const du2 = await svc.computeClassicAnalysis(ctxA, person("İki Sistem Kısmi", ["dual"]), deps());
    provider.responder = null;
    ok(du2.status === 201 && du2.body.ok && du2.body.analysis.status === "partial" && du2.body.analysis.meta.failed.includes("dual") && du2.body.analysis.meta.failed.includes("chaldean"), "chaldean düşerse dual da düşer → partial", du2.body.ok ? du2.body.analysis.meta : du2.body);
    provider.calls.length = 0;
    const fut = await svc.computeClassicAnalysis(ctxA, req({ kind: "person", input: { fullName: "Gelecek Kişi", birth: { year: 2099, month: 1, day: 1 } } }), deps());
    ok(fut.status === 400 && !fut.body.ok && fut.body.code === "TARGET_BEFORE_BIRTH" && provider.calls.length === 0, "referans gün doğumdan önce → 400, 0 çağrı (sağlayıcı 400'ü kota düşürür)", fut);

    section("depo: CAS / yumuşak silme / notlar / mevcut kayıt salt okuma");
    const g = await repo.getAnalysis(db, TA, id1);
    const rv = g.ok ? g.value.row_version : 0;
    const u1 = await repo.updateAnalysis(db, TA, id1, rv + 5, { title: "x" });
    ok(!u1.ok && u1.reason === "conflict", "yanlış row_version → conflict");
    const u2 = await repo.updateAnalysis(db, TB, id1, rv, { title: "x" });
    ok(!u2.ok && u2.reason === "not_found", "başka tenant güncelleyemez → not_found");
    const u3 = await repo.updateAnalysis(db, TA, id1, rv, { title: "Yeni Başlık" });
    ok(u3.ok && u3.value.row_version === rv + 1 && u3.value.title === "Yeni Başlık", "doğru row_version → güncellenir, sürüm +1");
    const del1 = await repo.softDeleteAnalysis(db, TB, id1, null);
    ok(!del1.ok && del1.reason === "not_found", "başka tenant silemez");
    const nt = await repo.insertNote(db, TA, { clientId: cA, legacyRecordId: legacyA, classicAnalysisId: id1, snapshot: { a: 1 }, body: "not", createdBy: U.A.id });
    ok(nt.ok, "karşılaştırma notu eklenir");
    if (nt.ok) {
      ok(!(await repo.getNote(db, TB, nt.value.id)).ok, "başka tenant notu okuyamaz");
      const nu = await repo.updateNote(db, TA, nt.value.id, nt.value.row_version, { body: "güncel" });
      ok(nu.ok && nu.value.row_version === nt.value.row_version + 1, "not CAS güncelleme");
      const nc = await repo.updateNote(db, TA, nt.value.id, nt.value.row_version, { body: "eski sürüm" });
      ok(!nc.ok && nc.reason === "conflict", "not eski sürüm → conflict");
      const nl = await repo.listNotes(db, TA, { clientId: cA });
      ok(nl.ok && nl.value.length === 1, "danışan notları listelenir");
      const nd = await repo.softDeleteNote(db, TA, nt.value.id, nu.ok ? nu.value.row_version : 0);
      ok(nd.ok && !(await repo.getNote(db, TA, nt.value.id)).ok, "not yumuşak silinir");
    }
    const lg = await repo.readLegacyNumerologyRecord(db, TA, legacyA);
    ok(lg.ok && lg.value.name === "ZZ Ayşe", "mevcut Numeroloji kaydı okunur (salt okuma)");
    const lgB = await repo.readLegacyNumerologyRecord(db, TB, legacyA);
    ok(!lgB.ok && lgB.reason === "not_found", "mevcut kayıt başka tenant'tan okunamaz");
    const ll = await repo.listLegacyRecordsForClient(db, TA, cA);
    ok(ll.ok && ll.value.length === 1 && !("analysis_data" in ll.value[0]), "danışana bağlı mevcut kayıt özeti (analysis_data taşınmaz)");
    const legacyAfter = (await su.query(`select name, analysis_data::text a from public.numerology_records where id = $1`, [legacyA])).rows[0];
    ok(legacyAfter.name === "ZZ Ayşe" && legacyAfter.a === '{"lifePath": 7}', "mevcut kayıt DEĞİŞMEDİ");
    const ledgerKeys = (await su.query(`select string_agg(row_to_json(c)::text, '') t from public.numerology_classic_provider_calls c`)).rows[0].t as string;
    ok(!!ledgerKeys && !ledgerKeys.includes("zz-numk-fake-key") && !ledgerKeys.includes("Deniz"), "defter: anahtar ve kişisel girdi yok");
    const cacheTxt = (await su.query(`select string_agg(cache_key, ',') k from public.numerology_classic_response_cache`)).rows[0].k as string;
    ok(cacheTxt.split(",").every((k) => /^[0-9a-f]{64}$/.test(k)), "önbellek anahtarları 64 hex (ham girdi değil)");

    section("SEC-01: önbellek süresi (expires_at) + süresi geçen satır okunmaz");
    const cacheMod = await import("../../../lib/numeroloji-klasik/server/cache");
    const { CLASSIC_PROVIDER_SPEC_VERSION } = await import("../../../lib/numeroloji-klasik/endpoints");
    const DAY = 86_400_000;
    // Yeni bölümler kendi limit sayacını kullanır (paylaşılan memRateLimit kilit/kullanıcı sayaçları tükenmesin).
    const allowAll = async () => ({ allowed: true, retryAfterSec: 0 });
    const d2 = (over: Partial<Deps> = {}) => deps({ rateLimit: allowAll, ...over });
    provider.calls.length = 0;
    const ttlNow = new Date();
    const e1 = await svc.computeClassicAnalysis(ctxA, person("Süreli Önbellek"), d2({ now: () => ttlNow }));
    const keyOf = (fullName: string) => cacheMod.classicCacheKey(
      { tenantId: TA, endpointId: "chart", input: { fullName, year: 1987, month: 2, day: 14, targetDate: svc.istanbulToday(ttlNow) }, lang: "tr", specVersion: CLASSIC_PROVIDER_SPEC_VERSION, adapterVersion: svc.CLASSIC_ADAPTER_VERSION },
      "zz-numk-cache-secret",
    );
    const k1 = keyOf("Süreli Önbellek");
    const row1 = (await su.query(`select expires_at, created_at from public.numerology_classic_response_cache where tenant_id = $1 and cache_key = $2`, [TA, k1])).rows[0];
    const ttlMs = row1 ? new Date(row1.expires_at).getTime() - ttlNow.getTime() : -1;
    ok(e1.status === 201 && !!row1?.expires_at && Math.abs(ttlMs - 90 * DAY) < 5000, "yazılan önbellek satırında expires_at = şimdi + 90 gün (varsayılan TTL)", { ttlDays: ttlMs / DAY });
    ok((await su.query(`select count(*)::int n from public.numerology_classic_response_cache where expires_at is null`)).rows[0].n === 0, "hiçbir yeni önbellek satırı süresiz (expires_at null) değil");
    await su.query(`update public.numerology_classic_response_cache set expires_at = now() - interval '1 minute' where tenant_id = $1 and cache_key = $2`, [TA, k1]);
    provider.calls.length = 0;
    const e2 = await svc.computeClassicAnalysis(ctxA, person("Süreli Önbellek"), d2());
    ok(e2.status === 201 && provider.calls.length === 1, "süresi geçmiş önbellek satırı OKUNMAZ → yeni sağlayıcı çağrısı", provider.calls.length);
    const row2 = (await su.query(`select expires_at from public.numerology_classic_response_cache where tenant_id = $1 and cache_key = $2`, [TA, k1])).rows[0];
    ok(!!row2 && new Date(row2.expires_at).getTime() > Date.now() + 89 * DAY, "süresi geçmiş satır yeni yanıtla yenilendi (expires_at ileri)", row2);
    provider.calls.length = 0;
    await svc.computeClassicAnalysis(ctxA, person("Süreli Önbellek"), d2());
    ok(provider.calls.length === 0, "yenilenen satır tekrar isabet verir (0 çağrı)");
    const ttlShort = new Date();
    await svc.computeClassicAnalysis(ctxA, person("Kısa Süreli"), d2({ cacheTtlDays: 7, now: () => ttlShort }));
    const rowS = (await su.query(`select expires_at from public.numerology_classic_response_cache where tenant_id = $1 and cache_key = $2`, [TA, keyOf("Kısa Süreli")])).rows[0];
    ok(!!rowS && Math.abs(new Date(rowS.expires_at).getTime() - ttlShort.getTime() - 7 * DAY) < 5000, "cacheTtlDays=7 → expires_at = şimdi + 7 gün", rowS);
    const nullRow = { created_at: new Date(Date.now() - 91 * DAY).toISOString(), expires_at: null };
    ok(cacheMod.cacheRowExpiresAt(nullRow, 90) < Date.now() && cacheMod.cacheRowExpiresAt({ ...nullRow, created_at: new Date().toISOString() }, 90) > Date.now(), "expires_at'sız eski satır: created_at + TTL ile değerlendirilir");

    section("SEC-07: sırsız ortamda önbellek KAPALI (okuma/yazma yok)");
    provider.calls.length = 0;
    const cacheCountBefore = (await su.query(`select count(*)::int n from public.numerology_classic_response_cache`)).rows[0].n as number;
    const nc1 = await svc.computeClassicAnalysis(ctxA, person("Önbelleksiz Kişi"), d2({ cacheSecret: null, cacheDisabled: true }));
    const nc2 = await svc.computeClassicAnalysis(ctxA, person("Önbelleksiz Kişi"), d2({ cacheSecret: null, cacheDisabled: true }));
    const cacheCountAfter = (await su.query(`select count(*)::int n from public.numerology_classic_response_cache`)).rows[0].n as number;
    ok(nc1.status === 201 && nc2.status === 201 && provider.calls.length === 2 && cacheCountAfter === cacheCountBefore, "cacheDisabled → önbelleğe yazılmaz, ikinci istek de sağlayıcıya gider", { calls: provider.calls.length, before: cacheCountBefore, after: cacheCountAfter });
    provider.calls.length = 0;
    await svc.computeClassicAnalysis(ctxA, person("Deniz Kaya"), d2({ cacheSecret: null, cacheDisabled: true }));
    ok(provider.calls.length === 1, "cacheDisabled → mevcut önbellek satırı da OKUNMAZ (Deniz Kaya için çağrı yapıldı)");
    const depsMod = await import("../../../lib/numeroloji-klasik/server/deps");
    const realDepsOff = depsMod.buildClassicServiceDeps(db, { NODE_ENV: "production", NUMEROLOGY_CLASSIC_PROVIDER_CALLS: "true" });
    const realDepsSr = depsMod.buildClassicServiceDeps(db, { NODE_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "sr-key" });
    const realDepsTest = depsMod.buildClassicServiceDeps(db, { NODE_ENV: "test" });
    ok(realDepsOff.cacheDisabled === true && realDepsOff.cacheSecret === null, "gerçek kablolama: iki sır da yok + production → önbellek kapalı");
    ok(realDepsSr.cacheDisabled === false && realDepsSr.cacheSecret === "sr-key" && realDepsSr.cacheTtlDays === 90, "gerçek kablolama: service-role türetmesi + TTL 90");
    ok(realDepsTest.cacheDisabled === false && realDepsTest.cacheSecret === null, "gerçek kablolama: NODE_ENV=test → düz SHA-256 serbest");

    section("SEC-03: kalan kota bilinmiyorsa süreç başına tek çağrı (keşif)");
    {
      // Bu bölümde sahte sağlayıcı bilinçli gecikir → istemci zaman aşımı geniş tutulur.
      const slowCall: Partial<Deps> = { callProvider: (c, id, p, o) => pc.callClassicEndpoint(c, id, p, { ...o, fetchImpl: fakeProviderFetch, sleep: async () => undefined, timeoutMs: 3000 }) };
      provider.calls.length = 0;
      let inFlightNow = 0;
      let maxInFlight = 0;
      provider.responder = async (u, b) => {
        inFlightNow++;
        maxInFlight = Math.max(maxInFlight, inFlightNow);
        await new Promise((r) => setTimeout(r, 25));
        inFlightNow--;
        // x-ratelimit-remaining YOK (sağlayıcı başlık göndermiyor)
        return new Response(JSON.stringify({ echo: { url: u.replace(/\?.*$/, ""), body: b } }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const logs: string[] = [];
      const noHdrQs = new quota.ProviderQuotaState();
      await su.query(`delete from public.numerology_classic_provider_calls where quota_remaining is not null`);
      const dd = d2({ ...slowCall, quotaState: noHdrQs, log: (m) => logs.push(m) });
      const par = await Promise.all(["Keşif Bir", "Keşif İki", "Keşif Üç"].map((n) => svc.computeClassicAnalysis(ctxA, person(n), dd)));
      ok(par.every((x) => x.status === 201) && provider.calls.length === 3 && maxInFlight === 1, "başlık yok + 3 eşzamanlı farklı istek → hepsi başarılı ama SIRAYLA (aynı anda en çok 1)", { s: par.map((x) => x.status), max: maxInFlight });
      await svc.computeClassicAnalysis(ctxA, person("Keşif Dört"), dd);
      ok(logs.filter((m) => m.includes("kalan-kota başlığı")).length === 1, "başlık hiç gelmiyor → yalnız BİR kez loglanır", logs);
      provider.calls.length = 0;
      const busyQs = new quota.ProviderQuotaState();
      provider.responder = async (u, b) => {
        await new Promise((r) => setTimeout(r, 150));
        return new Response(JSON.stringify({ echo: { url: u.replace(/\?.*$/, ""), body: b } }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const [bz1, bz2] = await Promise.all([
        svc.computeClassicAnalysis(ctxA, person("Yoğun Bir"), d2({ ...slowCall, quotaState: busyQs, discoveryWaitMs: 30 })),
        svc.computeClassicAnalysis(ctxA, person("Yoğun İki"), d2({ ...slowCall, quotaState: busyQs, discoveryWaitMs: 30 })),
      ]);
      const busyOne = [bz1, bz2].find((x) => x.status === 429);
      const okOne = [bz1, bz2].find((x) => x.status === 201);
      ok(!!okOne && !!busyOne && !busyOne.body.ok && busyOne.body.code === "CLASSIC_BUSY" && busyOne.body.retryAfterSec === 5 && provider.calls.length === 1, "keşif sırası süre içinde gelmezse 429 CLASSIC_BUSY (Retry-After 5), 0 ek çağrı", { a: bz1.body, b: bz2.body });
      ok(!!busyOne && !busyOne.body.ok && !/roxy|api|http/i.test(busyOne.body.error), "CLASSIC_BUSY mesajı Türkçe, iç ayrıntı yok");
      provider.calls.length = 0;
      let mx = 0;
      let cur = 0;
      provider.responder = async (u, b) => {
        cur++;
        mx = Math.max(mx, cur);
        await new Promise((r) => setTimeout(r, 20));
        cur--;
        return defaultResponder(u, b);
      };
      const freshQs = new quota.ProviderQuotaState();
      await su.query(`delete from public.numerology_classic_provider_calls where quota_remaining is not null`);
      const fr = await Promise.all(["Taze Bir", "Taze İki", "Taze Üç"].map((n) => svc.computeClassicAnalysis(ctxA, person(n), d2({ ...slowCall, quotaState: freshQs }))));
      provider.responder = null;
      ok(fr.every((x) => x.status === 201) && freshQs.isFresh(Date.now()) && provider.calls.length === 3, "ilk yanıt taze kalan-kota başlığı getirince bekleyenler serbest kalır (3/3 başarı)", { s: fr.map((x) => x.status), mx });
      provider.calls.length = 0;
      let mx2 = 0;
      let cur2 = 0;
      provider.responder = async (u, b) => {
        cur2++;
        mx2 = Math.max(mx2, cur2);
        await new Promise((r) => setTimeout(r, 20));
        cur2--;
        return defaultResponder(u, b);
      };
      await Promise.all(["Paralel Bir", "Paralel İki", "Paralel Üç"].map((n) => svc.computeClassicAnalysis(ctxA, person(n), d2({ ...slowCall, quotaState: freshQs }))));
      provider.responder = null;
      ok(mx2 > 1, "kota TAZE bilinirken kapı devre dışı (paralel çağrı serbest)", mx2);
      const staleQs = new quota.ProviderQuotaState();
      staleQs.observe({ limit: 50000, remaining: 49000, resetAt: Date.now() + 20 * DAY }, Date.now(), Date.now() - 11 * 60_000);
      ok(!staleQs.isFresh(Date.now()) && staleQs.known(Date.now()) === 49000, "10 dk'dan eski gözlem bayat → keşif modu (değer taban kontrolünde yine kullanılır)");
      await su.query(`delete from public.numerology_classic_provider_calls where quota_remaining is not null`);
      await su.query(`insert into public.numerology_classic_provider_calls (tenant_id, endpoint_id, outcome, quota_remaining, quota_reset_at, created_at) values ($1, 'chart', 'ok', 40000, now() + interval '20 days', now() - interval '2 hours')`, [TA]);
      const coldOld = new quota.ProviderQuotaState();
      await coldOld.loadOnce(db, Date.now());
      ok(coldOld.known(Date.now()) === 40000 && !coldOld.isFresh(Date.now()), "soğuk başlangıç: 2 saatlik defter gözlemi okunur ama BAYAT sayılır (keşif)", { k: coldOld.known(Date.now()) });
      await su.query(`delete from public.numerology_classic_provider_calls where quota_remaining = 40000`);
    }

    section("SEC-01: purgeClassicPersonalData (kalıcı temizlik; tüm tenant'lar)");
    {
      const retention = await import("../../../lib/numeroloji-klasik/server/retention");
      const cmp = await import("../../../lib/numeroloji-klasik/server/compareService");
      const mkAnalysis = async (tenant: string, title: string, deletedAgo: string | null) =>
        (await su.query(
          `insert into public.numerology_classic_analyses (tenant_id, kind, title, input, result, methodology_version, api_schema_version, status, deleted_at)
           values ($1, 'person', $2, '{"fullName":"ZZ Silinecek"}', '{"chart":{"x":1}}', 'm', 's', 'complete', ${deletedAgo === null ? "null" : `now() - interval '${deletedAgo}'`}) returning id`,
          [tenant, title],
        )).rows[0].id as string;
      const oldA = await mkAnalysis(TA, "ZZ eski silinmiş", "31 days");
      const oldB = await mkAnalysis(TB, "ZZ eski silinmiş B", "45 days");
      const recentA = await mkAnalysis(TA, "ZZ yeni silinmiş", "29 days");
      const liveA = await mkAnalysis(TA, "ZZ canlı", null);
      const snap = {
        schema: "num-compare-note-v1", missing: null, sourceHashes: { legacy: "h1", classic: "h2" },
        rows: [{ k: "lifePath", p: null, l: { d: "7", v: 7, r: 7 }, c: { v: 7, t: "single", kd: null }, rel: "same_value" }, { k: "bridge", p: null, l: null, c: { v: 3, t: "single", kd: null }, rel: "one_missing" }],
        stones: { legacy: ["hayat-yolu:Ametist"], classicDirect: ["Yakut"], classicDerived: ["Garnet"], overlap: ["Ametist"] }, rowsHash: "x",
      };
      const mkNote = async (tenant: string, analysisId: string | null, deletedAgo: string | null) =>
        (await su.query(
          `insert into public.numerology_comparative_notes (tenant_id, classic_analysis_id, legacy_record_id, snapshot, body, deleted_at)
           values ($1, $2, $3, $4, 'ZZ not gövdesi', ${deletedAgo === null ? "null" : `now() - interval '${deletedAgo}'`}) returning id`,
          [tenant, analysisId, legacyA, JSON.stringify(snap)],
        )).rows[0].id as string;
      const noteOnOld = await mkNote(TA, oldA, null);
      const noteOnRecent = await mkNote(TA, recentA, null);
      const noteOldDeleted = await mkNote(TA, liveA, "40 days");
      const noteRecentDeleted = await mkNote(TA, liveA, "5 days");
      await su.query(`insert into public.numerology_classic_response_cache (tenant_id, cache_key, endpoint_id, lang, spec_version, adapter_version, normalized, expires_at)
                      values ($1, repeat('a', 64), 'chart', 'tr', 's', 'a', '{}', now() - interval '1 day'), ($2, repeat('b', 64), 'chart', 'tr', 's', 'a', '{}', now() - interval '1 hour'),
                             ($1, repeat('c', 64), 'chart', 'tr', 's', 'a', '{}', now() + interval '1 day')`, [TA, TB]);
      await su.query(`insert into public.numerology_classic_response_cache (tenant_id, cache_key, endpoint_id, lang, spec_version, adapter_version, normalized, expires_at, created_at)
                      values ($1, repeat('d', 64), 'chart', 'tr', 's', 'a', '{}', null, now() - interval '100 days'), ($1, repeat('e', 64), 'chart', 'tr', 's', 'a', '{}', null, now() - interval '10 days')`, [TA]);
      const bad = await retention.purgeClassicPersonalData(db, { now: new Date(), softDeletedGraceDays: -1 });
      ok(!bad.ok && bad.step === "invalid_grace", "geçersiz grace → işlem yapılmaz");
      // NK-R5: kayıtlı AKTİF analiz yaşına bakılmaksızın korunur; çağrı defteri bu temizlikte değişmez.
      const ancientLive = (await su.query(
        `insert into public.numerology_classic_analyses (tenant_id, kind, title, input, result, methodology_version, api_schema_version, status, created_at)
         values ($1, 'person', 'ZZ 5 yıllık canlı', '{"fullName":"ZZ Eski"}', '{"chart":{"x":1}}', 'm', 's', 'complete', now() - interval '5 years') returning id`, [TA])).rows[0].id as string;
      const oldLedger = (await su.query(`insert into public.numerology_classic_provider_calls (tenant_id, endpoint_id, outcome, created_at) values ($1, 'chart', 'ok', now() - interval '500 days') returning id`, [TA])).rows[0].id as string;
      const snapshotState = async () => (await su.query(`select (select count(*) from public.numerology_classic_analyses) a, (select count(*) from public.numerology_comparative_notes) n,
        (select count(*) from public.numerology_classic_response_cache) c, (select md5(string_agg(snapshot::text, '|' order by id)) from public.numerology_comparative_notes) s`)).rows[0];
      // Kuru çalıştırma: aday sayıları raporlanır, HİÇBİR şey silinmez/değişmez; denetim kaydı yazılır.
      const st0 = await snapshotState();
      const dry = await retention.purgeClassicPersonalData(db, { now: new Date(), cacheTtlDays: 90, dryRun: true, actor: "test" });
      const st1 = await snapshotState();
      ok(dry.ok && dry.dryRun && dry.analysesDeleted === 2 && dry.notesDeleted === 1 && dry.notesScrubbed === 1 && dry.cacheDeleted >= 3, "NK-R5 kuru çalıştırma: adaylar raporlandı", dry);
      ok(JSON.stringify(st0) === JSON.stringify(st1), "NK-R5 kuru çalıştırma: hiçbir satır silinmedi / değişmedi", { st0, st1 });
      const dryLog = (await su.query(`select dry_run, ok, step, actor, counts, deleted_ids from public.numerology_classic_purge_log where id=$1`, [dry.logId])).rows[0];
      ok(dryLog?.dry_run === true && dryLog.ok === true && dryLog.step === "dry_run_done" && dryLog.actor === "test" && (dryLog.deleted_ids?.candidates?.analyses ?? []).includes(oldA), "NK-R5 denetim kaydı (kuru): aday kimlikleri ve sayılar kayıtlı", dryLog);
      // Fail-closed: denetim kaydı yazılamazsa hiçbir şey silinmez.
      await su.query(`revoke insert on public.numerology_classic_purge_log from service_role`);
      const blockedRun = await retention.purgeClassicPersonalData(db, { now: new Date(), cacheTtlDays: 90, actor: "test" });
      await su.query(`grant insert on public.numerology_classic_purge_log to service_role`);
      ok(!blockedRun.ok && blockedRun.step === "audit_log" && JSON.stringify(await snapshotState()) === JSON.stringify(st0), "NK-R5 fail-closed: denetim kaydı yazılamazsa 0 silme", blockedRun);
      ok(!(await retention.purgeClassicPersonalData(db, { now: new Date(), tenantId: "x' or 1=1" })).ok, "NK-R5 geçersiz tenant kimliği → işlem yok");
      // Tenant kapsamı: yalnız B tenant'ı; A'nın adayları dokunulmadan kalır.
      const onlyB = await retention.purgeClassicPersonalData(db, { now: new Date(), cacheTtlDays: 90, tenantId: TB, actor: "test" });
      const existsQ = async (table: string, id: string) => (await su.query(`select count(*)::int n from public.${table} where id = $1`, [id])).rows[0].n === 1;
      ok(onlyB.ok && onlyB.analysesDeleted === 1 && !(await existsQ("numerology_classic_analyses", oldB)) && (await existsQ("numerology_classic_analyses", oldA)) && Object.keys(onlyB.byTenant).every((t) => t === TB),
        "NK-R5 tenant kapsamı: yalnız B'nin süresi geçmiş verisi silindi, A dokunulmadı", { onlyB: onlyB.byTenant });
      const bLog = (await su.query(`select tenant_scope, ok, deleted_ids from public.numerology_classic_purge_log where id=$1`, [onlyB.logId])).rows[0];
      ok(bLog?.tenant_scope === TB && bLog.ok === true && (bLog.deleted_ids?.analyses ?? []).includes(oldB), "NK-R5 denetim kaydı: tenant kapsamı + silinen analiz kimliği", bLog);
      const pr = await retention.purgeClassicPersonalData(db, { now: new Date(), cacheTtlDays: 90 });
      ok(pr.ok && (await existsQ("numerology_classic_analyses", ancientLive)) && (await existsQ("numerology_classic_provider_calls", oldLedger)), "NK-R5: 5 yıllık AKTİF analiz ve 500 günlük defter satırı KORUNDU", pr);
      const logRows = (await su.query(`select count(*)::int n from public.numerology_classic_purge_log`)).rows[0].n;
      ok(logRows === 3, "NK-R5: denetim kaydı = kuru + tenant + tam (3); geçersiz girdi ve kayıt yazılamayan çalıştırma kayıt açmaz", logRows);
      ok(pr.ok && pr.analysesDeleted === 1 && pr.notesDeleted === 1 && pr.notesScrubbed === 1, "grace (30 gün) geçmiş yumuşak silinmiş analiz (A; B önceki tenant kapsamlı çalıştırmada) + not kalıcı silindi; bağlı not temizlendi", pr);
      const exists = async (table: string, id: string) => (await su.query(`select count(*)::int n from public.${table} where id = $1`, [id])).rows[0].n === 1;
      ok(!(await exists("numerology_classic_analyses", oldA)) && !(await exists("numerology_classic_analyses", oldB)), "31/45 gün önce silinen analizler YOK (tüm tenant'lar)");
      ok((await exists("numerology_classic_analyses", recentA)) && (await exists("numerology_classic_analyses", liveA)), "29 gün önce silinen + canlı analiz korunur");
      ok(!(await exists("numerology_comparative_notes", noteOldDeleted)) && (await exists("numerology_comparative_notes", noteRecentDeleted)), "40 gün önce silinen not YOK; 5 gün önce silinen korunur");
      const scrubbed = (await su.query(`select classic_analysis_id, snapshot, body from public.numerology_comparative_notes where id = $1`, [noteOnOld])).rows[0];
      const ss = scrubbed?.snapshot as { classicDeleted?: boolean; rows?: Array<{ c: unknown; l: unknown }>; stones?: { classicDirect: unknown[]; legacy: unknown[] }; sourceHashes?: { classic: unknown; legacy: unknown } };
      ok(!!scrubbed && scrubbed.classic_analysis_id === null && scrubbed.body === "ZZ not gövdesi", "kalıcı silinen analize bağlı not KORUNUR; FK bağı boşaldı, gövde aynı");
      ok(ss?.classicDeleted === true && ss.rows?.length === 1 && ss.rows.every((r) => r.c === null && r.l !== null) && ss.stones?.classicDirect.length === 0 && ss.stones?.legacy.length === 1 && ss.sourceHashes?.classic === null && ss.sourceHashes?.legacy === "h1", "not anlık görüntüsünden klasik taraf çıkarıldı, mevcut taraf korundu", ss);
      ok(!JSON.stringify(ss).includes("Yakut") && !JSON.stringify(ss).includes("Garnet"), "klasik taş adları not anlık görüntüsünde kalmadı");
      const noteRecentRow = (await su.query(`select classic_analysis_id, snapshot from public.numerology_comparative_notes where id = $1`, [noteOnRecent])).rows[0];
      ok(noteRecentRow.classic_analysis_id === recentA && JSON.stringify(noteRecentRow.snapshot).includes("Yakut"), "grace içindeki analize bağlı not DB'de değişmez (görünümde gizlenir — SEC-06)");
      const cacheLeft = (await su.query(`select string_agg(left(cache_key, 1), '' order by cache_key) k from public.numerology_classic_response_cache where cache_key ~ '^(a|b|c|d|e)\\1{63}$'`)).rows[0].k as string;
      ok(cacheLeft === "ce" && pr.ok && pr.cacheDeleted + onlyB.cacheDeleted >= 3, "süresi geçen önbellek (A+B tenant) + 100 günlük süresiz satır silindi; geçerli + yeni süresiz satır kaldı", { cacheLeft, n: pr.ok ? pr.cacheDeleted : null });
      const again = await retention.purgeClassicPersonalData(db, { now: new Date(), cacheTtlDays: 90 });
      ok(again.ok && again.analysesDeleted === 0 && again.notesDeleted === 0 && again.notesScrubbed === 0, "ikinci çalıştırma idempotent (0 silme)", again);
      ok(retention.CLASSIC_SOFT_DELETE_GRACE_DEFAULT_DAYS === 30, "varsayılan grace 30 gün");
      const strip = cmp.stripClassicFromSnapshot(snap) as { missing?: string };
      ok(strip.missing === "classic" && (cmp.stripClassicFromSnapshot({ ...snap, missing: "legacy" }) as { missing?: string }).missing === "both", "strip: missing alanı klasik eksik olarak güncellenir");
      await su.query(`delete from public.numerology_comparative_notes where id = any($1::uuid[])`, [[noteOnOld, noteOnRecent, noteRecentDeleted]]);
      await su.query(`delete from public.numerology_classic_analyses where id = any($1::uuid[])`, [[recentA, liveA, ancientLive]]);
      await su.query(`delete from public.numerology_classic_provider_calls where id = $1`, [oldLedger]);
    }

    // ── Route düzeyi (gerçek guard + gerçek deps kablolaması + fetch kilidi) ──
    const listRoute = await import("../../../app/api/numeroloji-klasik/analyses/route");
    const oneRoute = await import("../../../app/api/numeroloji-klasik/analyses/[id]/route");
    const entRoute = await import("../../../app/api/numeroloji-klasik/entitlements/route");
    const catRoute = await import("../../../app/api/numeroloji-klasik/catalog/route");
    type Auth = { id?: string; token?: string };
    type H = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
    async function call(handler: unknown, method: string, auth: Auth, opts: { params?: Record<string, string>; body?: unknown; raw?: string; query?: string } = {}) {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      const body = opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
      if (body !== undefined) headers["content-type"] = "application/json";
      const r = new NextRequest(`http://localhost/api/numeroloji-klasik/test${opts.query ?? ""}`, { method, headers, body });
      const res = await (handler as H)(r, { params: Promise.resolve(opts.params ?? {}) });
      const text = await res.clone().text();
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* boş */ }
      return { status: res.status, json, text, res };
    }
    const asA = { id: U.A.id, token: U.A.token };
    const asA2 = { id: U.A2.id, token: U.A2.token };
    const asB = { id: U.B.id, token: U.B.token };
    const asDemo = { id: U.DEMO.id, token: U.DEMO.token };
    const asNomod = { id: U.NOMOD.id, token: U.NOMOD.token };
    const personBody = (fullName: string, extra: Record<string, unknown> = {}) => ({ kind: "person", title: "Deneme", ...extra, input: { fullName, birth: { year: 1991, month: 7, day: 9 } } });

    section("route: bayrak kapalı → 404 (kimliksiz dahil)");
    process.env.NUMEROLOGY_CLASSIC_ENABLED = "TRUE";
    const someId = randomUUID();
    const off = [
      await call(listRoute.GET, "GET", {}), await call(listRoute.POST, "POST", asA, { body: personBody("Kapalı") }),
      await call(oneRoute.GET, "GET", asA, { params: { id: someId } }), await call(oneRoute.PATCH, "PATCH", asA, { params: { id: someId }, body: { title: "x", rowVersion: 1 } }),
      await call(oneRoute.DELETE, "DELETE", asA, { params: { id: someId } }), await call(entRoute.GET, "GET", asA), await call(catRoute.GET, "GET", asA),
    ];
    ok(off.every((r) => r.status === 404), "7 uç da 404", off.map((r) => r.status));
    process.env.NUMEROLOGY_CLASSIC_ENABLED = "true";

    section("route: kimlik / modül izni");
    const noAuth = await call(listRoute.GET, "GET", {});
    ok(noAuth.status === 401 || noAuth.status === 403, "oturumsuz → 401/403", noAuth.status);
    const nomod = await call(listRoute.POST, "POST", asNomod, { body: personBody("İzinsiz") });
    ok(nomod.status === 403, "numeroloji izni yok → 403", nomod.status);
    const wrongTok = await call(listRoute.GET, "GET", { id: U.A.id, token: U.B.token });
    ok(wrongTok.status === 401 || wrongTok.status === 403, "başkasının token'ı → red", wrongTok.status);

    section("route: hesap + liste + aç (0 çağrı) + başlıklar");
    provider.calls.length = 0;
    const p = await call(listRoute.POST, "POST", asA, { body: personBody("Route Kişi") });
    ok(p.status === 201 && p.json.ok === true, "POST → 201", p.json);
    ok(provider.calls.length === 1 && provider.calls[0].key === "zz-numk-fake-key-NOT-REAL", "gerçek kablolama: 1 sağlayıcı çağrısı, anahtar env'den başlıkta");
    ok((p.res.headers.get("cache-control") ?? "").includes("no-store"), "no-store başlığı");
    ok(!/roxy/i.test(p.text) && !p.text.includes("zz-numk-fake-key"), "yanıtta sağlayıcı adı / anahtar yok");
    const aid = ((p.json.analysis ?? {}) as { id?: string }).id ?? "";
    const arv = ((p.json.analysis ?? {}) as { rowVersion?: number }).rowVersion ?? 0;
    provider.calls.length = 0;
    const gA = await call(oneRoute.GET, "GET", asA, { params: { id: aid } });
    ok(gA.status === 200 && ((gA.json.analysis ?? {}) as { id?: string }).id === aid && provider.calls.length === 0, "GET id → 200, 0 sağlayıcı çağrısı");
    ok(!("provider_meta" in ((gA.json.analysis ?? {}) as object)) && !/roxy/i.test(gA.text), "görünüm provider_meta / sağlayıcı adı içermez");
    const gUpper = await call(oneRoute.GET, "GET", asA, { params: { id: aid.toUpperCase() } });
    ok(gUpper.status === 200, "büyük harf uuid kabul (kanonik küçük harf)");
    // Sayfalama kanıtı için 25 eski tarihli sentetik satır (yeni kayıt en üstte kalır).
    await su.query(`insert into public.numerology_classic_analyses (tenant_id, kind, input, methodology_version, api_schema_version, status, created_at)
                    select $1, 'business', '{"name":"ZZ"}', 'm', 's', 'complete', now() - (g || ' days')::interval from generate_series(1, 25) g`, [TA]);
    const lA = await call(listRoute.GET, "GET", asA);
    ok(lA.status === 200 && Array.isArray(lA.json.rows) && (lA.json.rows as Array<{ id: string }>).some((r) => r.id === aid) && (lA.json.rows as unknown[]).length <= 20, "liste (≤ 20) yeni kaydı içerir");
    ok(!(lA.json.rows as Array<Record<string, unknown>>).some((r) => "result" in r || "input" in r), "liste özet (sonuç/girdi taşımaz)");
    const lB = await call(listRoute.GET, "GET", asB);
    ok(lB.status === 200 && !(lB.json.rows as Array<{ id: string }>).some((r) => r.id === aid), "başka tenant listesinde görünmez");
    const lPage = await call(listRoute.GET, "GET", asA, { query: "?offset=20" });
    ok(lPage.status === 200 && lA.json.hasMore === true && lA.json.nextOffset === 20, "sayfalama: hasMore + nextOffset", { hasMore: lA.json.hasMore, next: lA.json.nextOffset });
    const lClient = await call(listRoute.GET, "GET", asA, { query: `?clientId=${cA}` });
    ok(lClient.status === 200 && (lClient.json.rows as Array<{ clientId: string }>).every((r) => r.clientId === cA), "danışan filtresi");
    const lBad = await call(listRoute.GET, "GET", asA, { query: "?clientId=abc" });
    ok(lBad.status === 400, "geçersiz clientId sorgusu → 400");

    section("route: çapraz tenant / geçersiz kimlik → 404");
    ok((await call(oneRoute.GET, "GET", asB, { params: { id: aid } })).status === 404, "B, A'nın analizini okuyamaz → 404");
    ok((await call(oneRoute.PATCH, "PATCH", asB, { params: { id: aid }, body: { title: "x", rowVersion: arv } })).status === 404, "B güncelleyemez → 404");
    ok((await call(oneRoute.DELETE, "DELETE", asB, { params: { id: aid } })).status === 404, "B silemez → 404");
    ok((await call(oneRoute.GET, "GET", asA, { params: { id: randomUUID() } })).status === 404, "olmayan uuid → 404");
    ok((await call(oneRoute.GET, "GET", asA, { params: { id: "1 or 1=1" } })).status === 404, "uuid olmayan id → 404");
    const still = (await su.query(`select title, deleted_at from public.numerology_classic_analyses where id = $1`, [aid])).rows[0];
    ok(still.title === "Deneme" && still.deleted_at === null, "çapraz tenant denemeleri kaydı DEĞİŞTİRMEDİ");

    section("route: PATCH (CAS + danışan bağı)");
    const pc1 = await call(oneRoute.PATCH, "PATCH", asA, { params: { id: aid }, body: { title: "x", rowVersion: arv + 3 } });
    ok(pc1.status === 409 && pc1.json.code === "CONFLICT", "eski rowVersion → 409");
    const pc2 = await call(oneRoute.PATCH, "PATCH", asA, { params: { id: aid }, body: { clientId: cB, rowVersion: arv } });
    ok(pc2.status === 404 && pc2.json.code === "CLIENT_NOT_FOUND", "başka tenant'ın danışanına bağlama → 404");
    const pc3 = await call(oneRoute.PATCH, "PATCH", asA2, { params: { id: aid }, body: { clientId: cA, rowVersion: arv } });
    ok(pc3.status === 403 && pc3.json.code === "CLIENTS_PERMISSION_REQUIRED", "clients izni olmayan uzman bağlayamaz → 403");
    const pc4 = await call(oneRoute.PATCH, "PATCH", asA, { params: { id: aid }, body: { title: "Yeni", clientId: cA, rowVersion: arv } });
    ok(pc4.status === 200 && ((pc4.json.row ?? {}) as { rowVersion?: number; clientId?: string }).rowVersion === arv + 1 && ((pc4.json.row ?? {}) as { clientId?: string }).clientId === cA, "doğru sürüm → 200, bağ kuruldu, sürüm +1", pc4.json);
    const pc5 = await call(oneRoute.PATCH, "PATCH", asA, { params: { id: aid }, body: { title: "x", rowVersion: arv + 1, result: { hacked: true } } });
    ok(pc5.status === 400, "PATCH fazla alan (result) → 400");
    const pc6 = await call(oneRoute.PATCH, "PATCH", asA, { params: { id: aid }, raw: "{bozuk" });
    ok(pc6.status === 400, "PATCH bozuk JSON → 400");

    section("route: gövde doğrulama / boyut");
    provider.calls.length = 0;
    const v1 = await call(listRoute.POST, "POST", asA, { raw: JSON.stringify({ ...personBody("Büyük"), title: "x".repeat(17000) }) });
    ok(v1.status === 413, "16 KB üstü gövde → 413", v1.status);
    const v2 = await call(listRoute.POST, "POST", asA, { body: { ...personBody("Fazla"), tenantId: TB } });
    ok(v2.status === 400 && v2.json.code === "UNKNOWN_FIELD", "gövdede tenantId (fazla alan) → 400");
    const v3 = await call(listRoute.POST, "POST", asA, { body: personBody("<script>alert(1)</script>") });
    ok(v3.status === 400 && v3.json.code === "INVALID_NAME", "script etiketi → 400");
    const v4 = await call(listRoute.POST, "POST", asA, { body: { kind: "person", input: { fullName: "Ali", birth: { year: 2023, month: 2, day: 29 } } } });
    ok(v4.status === 400 && v4.json.code === "INVALID_DATE", "29 Şubat 2023 → 400");
    const v5 = await call(listRoute.POST, "POST", asA, { raw: "nope" });
    ok(v5.status === 400 && v5.json.code === "MALFORMED_JSON", "bozuk JSON → 400");
    ok(provider.calls.length === 0, "geçersiz gövdelerde 0 sağlayıcı çağrısı");
    const v6 = await call(listRoute.POST, "POST", asA, { body: personBody("Bağ Dene", { clientId: cB }) });
    ok(v6.status === 404 && provider.calls.length === 0, "POST başka tenant danışanı → 404, 0 çağrı");
    const v7 = await call(listRoute.POST, "POST", asA2, { body: personBody("Bağ Dene", { clientId: cA }) });
    ok(v7.status === 403 && provider.calls.length === 0, "POST clients izni yok + bağ → 403, 0 çağrı");

    section("route: demo");
    provider.calls.length = 0;
    const dm1 = await call(listRoute.POST, "POST", asDemo, { body: personBody("Demo Route") });
    ok(dm1.status === 403 && dm1.json.code === "DEMO_READONLY" && provider.calls.length === 0, "demo POST → 403, 0 çağrı");
    ok((await call(oneRoute.PATCH, "PATCH", asDemo, { params: { id: aid }, body: { title: "d", rowVersion: arv + 1 } })).status === 403, "demo PATCH → 403");
    ok((await call(oneRoute.DELETE, "DELETE", asDemo, { params: { id: aid } })).status === 403, "demo DELETE → 403");
    const dmL = await call(listRoute.GET, "GET", asDemo);
    ok(dmL.status === 200, "demo liste okuyabilir");
    const ent = await call(entRoute.GET, "GET", asDemo);
    ok(ent.status === 200 && ent.json.canCompute === false && ent.json.canWrite === false && ent.json.isDemo === true, "demo entitlements: hesap/yazma kapalı", ent.json);

    section("route: entitlements / katalog / çağrı bayrağı");
    const entA = await call(entRoute.GET, "GET", asA);
    ok(entA.status === 200 && entA.json.canCompute === true && entA.json.canLinkClients === true, "A entitlements: hesap + danışan bağı açık");
    const entA2 = await call(entRoute.GET, "GET", asA2);
    ok(entA2.json.canLinkClients === false, "A2 (clients izni yok): canLinkClients=false");
    ok(!/roxy|zz-numk/i.test(entA.text), "entitlements sağlayıcı/anahtar sızdırmaz");
    process.env.NUMEROLOGY_CLASSIC_PROVIDER_CALLS = "false";
    provider.calls.length = 0;
    const pf = await call(listRoute.POST, "POST", asA, { body: personBody("Çağrı Kapalı") });
    ok(pf.status === 503 && pf.json.code === "PROVIDER_CALLS_DISABLED" && provider.calls.length === 0, "çağrı bayrağı kapalı → 503, 0 çağrı");
    ok((await call(oneRoute.GET, "GET", asA, { params: { id: aid } })).status === 200, "çağrı bayrağı kapalıyken kayıtlı analiz açılır");
    ok((await call(entRoute.GET, "GET", asA)).json.canCompute === false, "entitlements canCompute=false");
    process.env.NUMEROLOGY_CLASSIC_PROVIDER_CALLS = "true";
    const cat1 = await call(catRoute.GET, "GET", asA, { query: "?kind=lucky_association&number=1&lang=en" });
    ok(cat1.status === 200 && input.canonicalJson(((cat1.json.entry ?? {}) as { payload?: unknown }).payload ?? null) === input.canonicalJson(lucky1), "katalog tek girdi (lucky 1/en)");
    const cat2 = await call(catRoute.GET, "GET", asA, { query: "?kind=pythagorean_meaning" });
    ok(cat2.status === 200 && Array.isArray(cat2.json.entries) && (cat2.json.entries as unknown[]).length === 1, "katalog liste (tr)");
    ok((await call(catRoute.GET, "GET", asA, { query: "?kind=x" })).status === 400, "katalog geçersiz kind → 400");
    ok((await call(catRoute.GET, "GET", asA, { query: "?kind=pythagorean_meaning&number=8" })).status === 404, "katalogda olmayan sayı → 404");

    section("SEC-05: clients izni olmayan uzman — danışan filtresi 403, clientId daima null");
    const a2f = await call(listRoute.GET, "GET", asA2, { query: `?clientId=${cA}` });
    ok(a2f.status === 403 && a2f.json.code === "CLIENTS_PERMISSION_REQUIRED", "A2 ?clientId= → 403 CLIENTS_PERMISSION_REQUIRED", a2f.json);
    const a2l = await call(listRoute.GET, "GET", asA2);
    const a2rows = (a2l.json.rows ?? []) as Array<{ id: string; clientId: string | null }>;
    ok(a2l.status === 200 && a2rows.some((r) => r.id === aid) && a2rows.every((r) => r.clientId === null), "A2 listesi: danışana bağlı kayıt görünür ama clientId null", a2rows.find((r) => r.id === aid));
    ok(!a2l.text.includes(cA), "A2 liste yanıtında danışan kimliği hiç geçmiyor");
    const a2g = await call(oneRoute.GET, "GET", asA2, { params: { id: aid } });
    ok(a2g.status === 200 && ((a2g.json.analysis ?? {}) as { clientId?: unknown }).clientId === null && !a2g.text.includes(cA), "A2 analiz görünümü: clientId null");
    const aGv = await call(oneRoute.GET, "GET", asA, { params: { id: aid } });
    ok(((aGv.json.analysis ?? {}) as { clientId?: unknown }).clientId === cA, "A (clients izni var) aynı kaydı clientId ile görür");
    const a2rv = ((a2g.json.analysis ?? {}) as { rowVersion?: number }).rowVersion ?? 0;
    const a2p = await call(oneRoute.PATCH, "PATCH", asA2, { params: { id: aid }, body: { title: "A2 başlık", rowVersion: a2rv } });
    ok(a2p.status === 200 && ((a2p.json.row ?? {}) as { clientId?: unknown }).clientId === null && !a2p.text.includes(cA), "A2 başlık PATCH yanıtı: clientId null (bağ DB'de korunur)", a2p.json);
    ok((await su.query(`select client_id from public.numerology_classic_analyses where id = $1`, [aid])).rows[0].client_id === cA, "A2 PATCH danışan bağını değiştirmedi");
    provider.calls.length = 0;
    const a2post = await call(listRoute.POST, "POST", asA2, { body: personBody("Route Kişi") });
    ok(a2post.status === 201 && ((a2post.json.analysis ?? {}) as { clientId?: unknown }).clientId === null, "A2 POST yanıtı: clientId null");

    section("SEC-04: akış gövde sınırı (Content-Length'siz / chunked)");
    {
      let pulls = 0;
      const chunk = new TextEncoder().encode("x".repeat(4096));
      const endless = new ReadableStream<Uint8Array>({
        pull(ctrl) {
          pulls++;
          if (pulls > 10_000) ctrl.close();
          else ctrl.enqueue(chunk);
        },
      });
      const r = new NextRequest("http://localhost/api/numeroloji-klasik/test", {
        method: "POST",
        headers: { "x-user-id": U.A.id, "x-session-token": U.A.token, "content-type": "application/json" },
        body: endless,
        duplex: "half",
      } as unknown as ConstructorParameters<typeof NextRequest>[1]);
      ok(!r.headers.get("content-length"), "istekte Content-Length yok");
      provider.calls.length = 0;
      const res = await listRoute.POST(r);
      ok(res.status === 413 && pulls < 20 && provider.calls.length === 0, "16 KB aşılınca okuma kesilir → 413 (sonsuz akış tüketilmedi), 0 çağrı", { status: res.status, pulls });
      const small = new ReadableStream<Uint8Array>({
        start(ctrl) {
          const t = new TextEncoder().encode(JSON.stringify(personBody("Akış Kişi")));
          ctrl.enqueue(t.slice(0, 10));
          ctrl.enqueue(t.slice(10));
          ctrl.close();
        },
      });
      const r2 = new NextRequest("http://localhost/api/numeroloji-klasik/test", {
        method: "POST",
        headers: { "x-user-id": U.A.id, "x-session-token": U.A.token, "content-type": "application/json" },
        body: small,
        duplex: "half",
      } as unknown as ConstructorParameters<typeof NextRequest>[1]);
      const res2 = await listRoute.POST(r2);
      ok(res2.status === 201, "parçalı (chunked) küçük gövde → normal işlenir (201)", res2.status);
    }

    section("route: yumuşak silme");
    const dl = await call(oneRoute.DELETE, "DELETE", asA, { params: { id: aid }, query: "?rowVersion=999" });
    ok(dl.status === 409, "DELETE eski rowVersion → 409");
    const dl2 = await call(oneRoute.DELETE, "DELETE", asA, { params: { id: aid } });
    ok(dl2.status === 200, "DELETE → 200");
    ok((await call(oneRoute.GET, "GET", asA, { params: { id: aid } })).status === 404, "silinen kayıt → 404");
    ok((await call(oneRoute.DELETE, "DELETE", asA, { params: { id: aid } })).status === 404, "ikinci DELETE → 404");
    const soft = (await su.query(`select deleted_at from public.numerology_classic_analyses where id = $1`, [aid])).rows[0];
    ok(!!soft?.deleted_at, "satır fiziksel olarak duruyor (yumuşak silme)");

    section("ağ kilidi");
    ok(provider.blocked.length === 0, "izinsiz host'a hiçbir istek gitmedi", provider.blocked);
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
