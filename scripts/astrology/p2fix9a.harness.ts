/**
 * ASTROLOJİ AŞAMA 9A — DÖRT P2 BULGUSUNUN KAPATILMASI.
 *   P2-01 Vedik/KP zodyak etiketi · P2-02 Roxy çağrı güvenliği (kilit / yeniden kontrol / süre bütçesi)
 *   P2-03 uzman başına kapasite koruması · P2-04 KP ruling konum ayrımı (gerçek çağrı kanıtı: fixtures/golden9a).
 * Ağ YOK, gerçek Roxy YOK: sağlayıcı = depodaki golden yanıtlar; route'lar gerçek handler + sahte PostgREST.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/p2fix9a.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createFakeClient, createStore, installFetchShim, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, previewAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildTechniqueView, zodiacOfTechnique } from "@/lib/astrology/view/techniqueView";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { kpRulingBody } from "@/lib/astrology/providers/roxy/requests";
import { projectRoxyKpRuling } from "@/lib/astrology/providers/roxy/kp";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { ASTRO_RATE_LIMITS, ASTRO_ROXY_MAX_RETRIES, ASTRO_ROXY_MAX_RETRY_AFTER_MS, ASTRO_ROXY_TIMEOUT_MS, ASTRO_ROXY_WORST_CALL_MS, ASTRO_RUN_BUDGET_MS, ASTRO_RUN_MAX_DURATION_S } from "@/lib/astrology/config";
import { ASTRO_RECORD_CAPS, ASTRO_WRITE_LIMITS, enforceAstroWrite } from "@/lib/astrology/limits";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { rateLimitBucket } from "@/lib/security/dbRateLimit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-p2fix9a";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const ROOT = join(__dirname, "..", "..");
const DIR = join(__dirname, "fixtures", "golden");
const DIR9 = join(__dirname, "fixtures", "golden9a");
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const GOLDEN: { name: string; endpoint: string; body: J; response: J }[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(DIR, f), "utf8")) }));
const G9 = (n: string) => JSON.parse(readFileSync(join(DIR9, `${n}.json`), "utf8"));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    process.stderr.write(`FAIL ${name}\n     ${(e as Error).stack?.split("\n").slice(0, 3).join("\n     ")}\n`);
  }
}

const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_X = "c9c90001-0000-4000-8000-0000000000aa";
const U = {
  owner: "e9e9e9e9-0000-4000-8000-000000000001",
  ex1: "e9e9e9e9-0000-4000-8000-000000000002",
  ex2: "e9e9e9e9-0000-4000-8000-000000000003",
  exB: "e9e9e9e9-0000-4000-8000-000000000004",
};
type Who = keyof typeof U;
const tok = (w: Who) => `tok-p2fix9a-${w}-xxxxxxxxxxxxxx`;
const expert = (id: string, tenant: string) => ({
  id, role: "expert", active: true, approval_status: "approved", package_type: "premium", is_super_admin: false, is_demo_account: false,
  tenant_id: tenant, email: `${id.slice(-2)}@sentetik.test`, module_permissions: { astrology: true, astrology_provider_interp: true },
});
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });

function newStore(): FakeStore {
  const s = createStore({
    users: [
      { id: U.owner, role: "admin", active: true, approval_status: "approved", is_super_admin: true, is_demo_account: false, tenant_id: TA, email: "owner@sentetik.test", module_permissions: {} },
      expert(U.ex1, TA),
      expert(U.ex2, TA),
      expert(U.exB, TB),
    ],
    clients: [{ id: CLIENT_X, tenant_id: TA, ad: "Sentetik", soyad: "Danışan", dogum: "1990-07-15", created_at: "2026-01-01T00:00:00Z" }],
  });
  for (const w of Object.keys(U) as Who[]) s.sessions.set(tok(w), U[w]);
  return s;
}

/** Sahte sağlayıcı (golden; ağ yok) + çağrı sayacı. */
function goldenDeps(over: Partial<EngineDeps> = {}) {
  const calls: { endpoint: string; body: J }[] = [];
  const score = (a: J, b: J) => Object.keys(b ?? {}).filter((k) => JSON.stringify(a?.[k]) === JSON.stringify(b[k])).length;
  const deps: EngineDeps = {
    config: { apiKey: "k-test", baseUrl: ROXY_BASE },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      if (endpoint === "/astrology/natal-chart") return { ok: true, raw: structuredClone(NATAL), attempts: 1 };
      const c = GOLDEN.filter((g) => g.endpoint === endpoint).sort((x, y) => score(body, y.body) - score(body, x.body))[0];
      return c ? { ok: true, raw: structuredClone(c.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    now: () => new Date("2026-10-07T09:41:00Z"),
    ...over,
  };
  return { deps, calls };
}

async function mkProfile(ctx: EngineCtx): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}

async function main() {
  // ═══ P2-01 — zodyak ═══════════════════════════════════════════════════════════════════════════════
  await t("P2-01: gerçek yöntem — 47 golden'ın teknik katmanı: Vedik/KP 'sidereal', Batı 'tropical' (zodiac alanı taşıyanlarda); görünüm zodyağı gelenekten ve teknikle uyumlu", () => {
    let checked = 0;
    const map: Record<string, string> = {};
    for (const tid of ["western.natal", "western.transit", "western.progression", "western.solar_arc", "western.solar_return", "western.synastry", "western.composite", "western.relocation", "vedic.d1", "vedic.varga", "vedic.dasha", "vedic.drishti", "vedic.ashtakavarga", "vedic.shadbala", "vedic.panchanga", "vedic.transit", "kp.chart", "kp.dasha", "kp.ruling", "kp.transit", "kp.horary"]) map[tid] = tid;
    for (const tid of Object.keys(map)) {
      const z = zodiacOfTechnique(tid);
      assert.equal(z, tid.startsWith("western.") ? "tropical" : "sidereal", tid);
      checked += 1;
    }
    // Teknik katmanın KENDİ zodiac alanı (Roxy projeksiyonu) ile uyuşma — uyuşmazsa hata fırlatılır (sessiz etiket yok).
    assert.throws(() => zodiacOfTechnique("vedic.d1", { zodiac: "tropical" }), /uyuşmazlığı/);
    assert.throws(() => zodiacOfTechnique("western.natal", { zodiac: "sidereal" }), /uyuşmazlığı/);
    assert.equal(zodiacOfTechnique("vedic.d1", { zodiac: "sidereal" }), "sidereal");
    assert.ok(checked === 21);
  });

  await t("P2-01: buildTechniqueView method.zodiac — Vedik D1 / KP chart golden projeksiyonu 'sidereal', natal 'tropical'", () => {
    const view = (technique: string, technical: unknown) =>
      buildTechniqueView({
        technique,
        rows: [{ id: "r1", technique, provider: "roxy", provider_api_version: "v", adapter_version: "a", projection_version: "p", technical: technical as Record<string, unknown>, created_at: "2026-10-07T00:00:00Z" }],
        combined: technical,
        options: {},
        timeKnowledge: { primary: true, partner: null },
        visibility: { visible: false, reason: "not_entitled" },
        interpretations: null,
      });
    const proj = (tid: string, golden: string, opts: Record<string, unknown>) => {
      const def = getTechnique(tid)!;
      const o = def.parseOptions(opts, new Date("2026-10-07T09:41:00Z"))!;
      const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, o)[0];
      const g = GOLDEN.find((x) => x.name === golden)!;
      const p = def.project(u, g.response, o) as J;
      assert.ok(p.ok, `${tid}: ${JSON.stringify(p.errors)}`);
      return p.technical;
    };
    const d1 = proj("vedic.d1", "vedic-d1", {});
    assert.equal(d1.zodiac, "sidereal");
    assert.equal(view("vedic.d1", d1).method.zodiac, "sidereal");
    const kp = proj("kp.chart", "kp-chart", { ayanamsa: "kp-newcomb", nodeType: "mean" });
    assert.equal(kp.zodiac, "sidereal");
    assert.equal(view("kp.chart", kp).method.zodiac, "sidereal");
    const ru = proj("kp.ruling", "kp-ruling-planets", { atUtc: "2026-10-07T09:00", nodeType: "mean" });
    assert.equal(view("kp.ruling", ru).method.zodiac, "sidereal", "zodiac alanı olmayan KP tekniği gelenekten");
    assert.equal(view("western.natal", { zodiac: "tropical", bodies: [] }).method.zodiac, "tropical");
    // saati bilinmeyen (teknik null) Vedik bağlamında da zodyak gelenekten (görünüm bu durumu planlamada zaten engeller)
    assert.equal(zodiacOfTechnique("vedic.d1", null), "sidereal");
  });

  const store = newStore();
  const ctx: EngineCtx = { db: createFakeClient(store), tenantId: TA, userId: U.ex1, entitlements: FULL };
  const pa = await mkProfile(ctx);

  await t("P2-01: kaydetme önizlemesi + YENİ kayıtlı analiz method_snapshot.zodiac — Vedik/KP 'sidereal', Batı 'tropical'; ESKİ kayıt değiştirilmez, rapor teknikten doğru gösterir", async () => {
    const { deps } = goldenDeps();
    for (const [technique, options, z] of [
      ["vedic.d1", {}, "sidereal"],
      ["kp.chart", { ayanamsa: "kp-newcomb", nodeType: "mean" }, "sidereal"],
      ["western.natal", { houseSystem: "placidus", nodeType: "true" }, "tropical"],
    ] as const) {
      assert.equal((await runAstrology(ctx, { profileId: pa, selections: [{ technique, options }] }, deps, { ownerPreviewHideInterp: false })).status, 200);
      const pv = await previewAnalysis(ctx, { profileId: pa, revision: 1, technique, options }, false);
      assert.equal((pv.body as J).summary.zodiac, z, `${technique} önizleme`);
      assert.equal((pv.body as J).summary.technique, technique);
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, technique, options, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201);
      const row = store.tables.astro_analyses.find((r) => r.id === (sv.body as J).analysisId)!;
      assert.equal((row.method_snapshot as J).zodiac, z, `${technique} snapshot`);
    }
    // Eski (9A öncesi) Vedik kaydı "tropical" taşır → DB'de AYNEN kalır; rapor zodyağı teknikten doğru yazar.
    const d1 = store.tables.astro_analyses.find((r) => r.technique === "vedic.d1")!;
    const old = { ...structuredClone(d1), id: randomUUID(), method_snapshot: { ...(d1.method_snapshot as J), zodiac: "tropical" } };
    store.tables.astro_analyses.push(old);
    const a = ((await getAnalysis(ctx, old.id, false)).body as J).analysis;
    assert.equal(a.method.zodiac, "tropical", "eski snapshot okunurken değiştirilmez");
    const texts = reportTexts(buildAstroReport(a)).join("\n");
    assert.ok(texts.includes("Sidereal (nirayana)") && !texts.includes("Tropikal"), "rapor zodyağı teknikten");
  });

  await t("P2-01: UI kaydetme özeti sabit 'Tropikal' yazmaz; sunucunun zodyağını gösterir", () => {
    const s = read("app/admin/astroloji/_components/AnalysisWorkspace.tsx");
    assert.ok(!/>\s*Tropikal · \{shownSummary/.test(s) && !/^\s*Tropikal · \{/m.test(s), "sabit Tropikal kaldı");
    assert.match(s, /shownSummary\.s\.zodiac === "sidereal" \? \(shownSummary\.s\.technique\.startsWith\("kp\."\) \? "Sidereal \(KP\)" : "Sidereal \(nirayana\)"\) : "Tropikal"/);
    assert.ok(!/zodiac: "tropical",/.test(read("lib/astrology/analyses/service.ts")), "önizlemede sabit zodiac");
  });

  // ═══ P2-02 — Roxy çağrı güvenliği ═════════════════════════════════════════════════════════════════
  await t("P2-02: kilit penceresi ≥ 2 × en kötü çağrı (45 sn); en kötü çağrı = (1+retry) × zaman aşımı + bekleme; route maxDuration = bütçe + 60 sn", () => {
    assert.equal(ASTRO_ROXY_WORST_CALL_MS, ASTRO_ROXY_TIMEOUT_MS * (1 + ASTRO_ROXY_MAX_RETRIES) + ASTRO_ROXY_MAX_RETRY_AFTER_MS);
    assert.equal(ASTRO_ROXY_WORST_CALL_MS, 45_000);
    assert.ok(ASTRO_RATE_LIMITS.inFlight.windowSeconds * 1000 >= 2 * ASTRO_ROXY_WORST_CALL_MS, `kilit ${ASTRO_RATE_LIMITS.inFlight.windowSeconds} sn`);
    assert.equal(ASTRO_RUN_BUDGET_MS, (ASTRO_RUN_MAX_DURATION_S - 60) * 1000);
    for (const f of ["app/api/admin/astroloji/engine/run/route.ts", "app/api/astroloji/engine/run/route.ts"]) assert.match(read(f), new RegExp(`^export const maxDuration = ${ASTRO_RUN_MAX_DURATION_S};$`, "m"), f);
  });

  await t("P2-02: istemci en kötü süre sınırı — ağ hatası / zaman aşımı / 5xx yeniden DENENMEZ; 503+Retry-After yalnız 1 kez; deneme sayısı ≤ 2", async () => {
    const cfg = { apiKey: "k", baseUrl: ROXY_BASE };
    let n = 0;
    const net = await callRoxy(cfg, "/astrology/natal-chart", {}, { fetchImpl: async () => { n += 1; throw new TypeError("network"); }, sleep: async () => undefined });
    assert.equal(net.ok, false);
    assert.equal(n, 1);
    n = 0;
    const s500 = await callRoxy(cfg, "/astrology/natal-chart", {}, { fetchImpl: async () => { n += 1; return new Response("{}", { status: 500 }); }, sleep: async () => undefined });
    assert.equal(n, 1);
    assert.equal(s500.ok, false);
    n = 0;
    const waits: number[] = [];
    const busy = await callRoxy(cfg, "/astrology/natal-chart", {}, { fetchImpl: async () => { n += 1; return new Response("{}", { status: 503, headers: { "retry-after": "5" } }); }, sleep: async (ms) => { waits.push(ms); } });
    assert.equal(busy.ok, false);
    assert.equal(n, 2, "en fazla 1 yeniden deneme");
    assert.ok(waits.every((w) => w <= ASTRO_ROXY_MAX_RETRY_AFTER_MS));
    n = 0;
    const t0 = Date.now();
    const hang = await callRoxy(cfg, "/astrology/natal-chart", {}, {
      timeoutMs: 60,
      fetchImpl: (_u, init) => new Promise((_, rej) => { n += 1; init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); }),
      sleep: async () => undefined,
    });
    assert.equal(hang.ok, false);
    assert.equal((hang as J).kind, "timeout");
    assert.equal(n, 1, "zaman aşımı yeniden denenmez");
    assert.ok(Date.now() - t0 < 1000);
  });

  // Paylaşılan "DB" kilit simülasyonu (auth_rate_limit_hit gibi atomik sayaç + pencere).
  function sharedLimiter(opts: { inflightAllowed?: () => Promise<boolean> } = {}) {
    const counts = new Map<string, number>();
    return async (scope: string, value: string, limit: number) => {
      if (scope === "astro-roxy-inflight" && opts.inflightAllowed) return { allowed: await opts.inflightAllowed(), retryAfterSec: 0 };
      const k = `${scope}:${value}`;
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      return { allowed: n <= limit, retryAfterSec: 1 };
    };
  }

  await t("P2-02: çift tık / eşzamanlı iki istek (aynı hesap) → sağlayıcı TEK kez çağrılır; ikinci istek sonucu önbellekten alır", async () => {
    const s = newStore();
    const c: EngineCtx = { db: createFakeClient(s), tenantId: TA, userId: U.ex1, entitlements: FULL };
    const pid = await mkProfile(c);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const g = goldenDeps({ rateLimit: sharedLimiter(), sleep: async () => { release(); await new Promise((r) => setTimeout(r, 5)); } });
    const slowCall = g.deps.callProvider;
    g.deps.callProvider = async (...a) => { await gate; await new Promise((r) => setTimeout(r, 20)); return slowCall(...a); };
    const sel = [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }];
    const [a, b] = await Promise.all([
      runAstrology(c, { profileId: pid, selections: sel }, g.deps, { ownerPreviewHideInterp: false }),
      runAstrology(c, { profileId: pid, selections: sel }, g.deps, { ownerPreviewHideInterp: false }),
    ]);
    assert.equal(a.status, 200, JSON.stringify(a.body).slice(0, 200));
    assert.equal(b.status, 200, JSON.stringify(b.body).slice(0, 200));
    assert.equal(g.calls.length, 1, `sağlayıcı ${g.calls.length} kez çağrıldı`);
  });

  await t("P2-02: kilit süresi dolduktan SONRA gelen istek (planlaması önceki çağrı bitmeden yapılmış) → kilidi alınca önbelleği yeniden okur, sağlayıcıyı ÇAĞIRMAZ", async () => {
    const s = newStore();
    const c: EngineCtx = { db: createFakeClient(s), tenantId: TA, userId: U.ex1, entitlements: FULL };
    const pid = await mkProfile(c);
    const sel = [{ technique: "vedic.d1", options: {} }];
    const A = goldenDeps();
    let aDone!: () => void;
    const aFinished = new Promise<void>((r) => (aDone = r));
    // B: plan önbelleği BOŞ görür (A henüz kaydetmedi); kilit alımı A bitene kadar bekletilir, sonra "süresi dolmuş" kilit verilir.
    const B = goldenDeps({ rateLimit: sharedLimiter({ inflightAllowed: async () => { await aFinished; return true; } }) });
    const pb = runAstrology(c, { profileId: pid, selections: sel }, B.deps, { ownerPreviewHideInterp: false });
    const ra = await runAstrology(c, { profileId: pid, selections: sel }, A.deps, { ownerPreviewHideInterp: false });
    aDone();
    const rb = await pb;
    assert.equal(ra.status, 200);
    assert.equal(rb.status, 200, JSON.stringify(rb.body).slice(0, 200));
    assert.equal(A.calls.length, 1);
    assert.equal(B.calls.length, 0, "kilit sonrası yeniden kontrol olmadan ikinci ücretli çağrı olurdu");
  });

  await t("P2-02: kilit başkasındayken bekleyen istek sağlayıcıyı çağırmaz; sonuç gelmezse 409 IN_PROGRESS (yeniden deneme yok)", async () => {
    const s = newStore();
    const c: EngineCtx = { db: createFakeClient(s), tenantId: TA, userId: U.ex1, entitlements: FULL };
    const pid = await mkProfile(c);
    const g = goldenDeps({ rateLimit: sharedLimiter({ inflightAllowed: async () => false }), sleep: async () => undefined });
    const r = await runAstrology(c, { profileId: pid, selections: [{ technique: "vedic.d1", options: {} }] }, g.deps, { ownerPreviewHideInterp: false });
    assert.equal(g.calls.length, 0);
    assert.match(JSON.stringify(r.body), /IN_PROGRESS/);
  });

  await t("P2-02: çalıştırma süre bütçesi — bütçeye sığmayan birim BAŞLATILMAZ (RUN_TIME_BUDGET), tamamlananlar kayıtlı; yeniden çalıştırmada yalnız eksik çağrılır", async () => {
    const s = newStore();
    const c: EngineCtx = { db: createFakeClient(s), tenantId: TA, userId: U.ex1, entitlements: FULL };
    const pid = await mkProfile(c);
    let clock = 0;
    const g = goldenDeps({ clock: () => clock });
    const inner = g.deps.callProvider;
    g.deps.callProvider = async (...a) => { clock += 100_000; return inner(...a); }; // her çağrı 100 sn sürüyormuş gibi
    const sel = [
      { technique: "vedic.d1", options: {} },
      { technique: "vedic.ashtakavarga", options: {} },
      { technique: "vedic.shadbala", options: {} },
      { technique: "vedic.panchanga", options: {} },
    ];
    const r = await runAstrology(c, { profileId: pid, selections: sel, confirmNewRequests: true }, g.deps, { ownerPreviewHideInterp: false });
    // 0 sn: başla (0+45+10 ≤ 240) → 100 sn; başla (100+55=155 ≤ 240) → 200 sn; 200+55 > 240 → kalan ikisi başlatılmaz.
    assert.equal(g.calls.length, 2, `çağrı ${g.calls.length}`);
    assert.equal((JSON.stringify(r.body).match(/RUN_TIME_BUDGET/g) ?? []).length >= 1, true, JSON.stringify(r.body).slice(0, 300));
    clock = 0;
    const g2 = goldenDeps({ clock: () => 0 });
    const r2 = await runAstrology(c, { profileId: pid, selections: sel, confirmNewRequests: true }, g2.deps, { ownerPreviewHideInterp: false });
    assert.equal(r2.status, 200);
    assert.equal(g2.calls.length, 2, "yalnız eksik iki birim çağrıldı (tamamlananlar önbellekten)");
  });

  // ═══ P2-03 — kapasite koruması (gerçek route'lar) ══════════════════════════════════════════════════
  const rstore = newStore();
  const restore = installFetchShim({ store: rstore, supabaseUrl: SUPA, roxyBase: ROXY_BASE, roxy: () => new Response("{}", { status: 500 }) });
  const R = {
    profiles: await import("@/app/api/astroloji/profiles/route"),
    kb: await import("@/app/api/astroloji/kb/route"),
    kbId: await import("@/app/api/astroloji/kb/[id]/route"),
    notes: await import("@/app/api/astroloji/notes/route"),
    analyses: await import("@/app/api/astroloji/analyses/route"),
  };
  const req = (path: string, who: Who, method: string, body?: unknown) =>
    new NextRequest(`http://localhost/api/astroloji${path}`, { method, headers: { "x-user-id": U[who], "x-session-token": tok(who), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (r: Promise<Response>) => {
    const x = await r;
    return { status: x.status, body: (await x.json()) as J };
  };
  const kbBody = (i: number) => ({ tradition: "western", topicKey: "planet_in_sign:sun:cancer", title: `Kayıt ${i}`, body: "kısa gövde" });

  await t("P2-03: yazma hızı — aynı uzman 10 dk'da 120 yazma; 121. → 429 WRITE_RATE_LIMITED (hiçbir şey yazılmaz); başka uzman ve başka tenant etkilenmez", async () => {
    rstore.rateCounters.clear();
    for (let i = 0; i < ASTRO_WRITE_LIMITS.write.limit; i++) assert.equal((await json(R.kb.POST(req("/kb", "ex1", "POST", kbBody(i))))).status, 201, `yazma ${i}`);
    const before = rstore.tables.astro_kb_entries.length;
    const over = await json(R.kb.POST(req("/kb", "ex1", "POST", kbBody(999))));
    assert.equal(over.status, 429);
    assert.equal(over.body.code, "WRITE_RATE_LIMITED");
    assert.equal(rstore.tables.astro_kb_entries.length, before);
    assert.equal((await json(R.kb.POST(req("/kb", "ex2", "POST", kbBody(1))))).status, 201, "aynı tenant başka uzman");
    assert.equal((await json(R.kb.POST(req("/kb", "exB", "POST", kbBody(1))))).status, 201, "başka tenant");
    // okuma serbest
    assert.equal((await json(R.kb.GET(req("/kb", "ex1", "GET")))).status, 200);
  });

  await t("P2-03: eşzamanlı 140 istek → atomik DB sayacı yalnız 120'sine izin verir (yarışla aşılamaz)", async () => {
    rstore.rateCounters.clear();
    const before = rstore.tables.astro_kb_entries.filter((r) => r.owner_user_id === U.ex2).length;
    const res = await Promise.all(Array.from({ length: 140 }, (_, i) => json(R.kb.POST(req("/kb", "ex2", "POST", kbBody(i))))));
    assert.equal(res.filter((r) => r.status === 201).length, 120);
    assert.equal(res.filter((r) => r.status === 429).length, 20);
    assert.equal(rstore.tables.astro_kb_entries.filter((r) => r.owner_user_id === U.ex2).length - before, 120);
  });

  await t("P2-03: kayıt tavanı — KB 1000'e ulaşınca YENİ kayıt 409 RECORD_CAP_REACHED; mevcut kaydı güncelleme ve SİLME serbest; başka uzman etkilenmez", async () => {
    rstore.rateCounters.clear();
    const mine = rstore.tables.astro_kb_entries.filter((r) => r.owner_user_id === U.ex1);
    const template = mine[0];
    for (let i = mine.length; i < ASTRO_RECORD_CAPS.kbEntries; i++) rstore.tables.astro_kb_entries.push({ ...template, id: randomUUID(), title: `dolgu ${i}`, topic_key: `planet_in_sign:moon:aries` });
    const over = await json(R.kb.POST(req("/kb", "ex1", "POST", kbBody(5000))));
    assert.equal(over.status, 409);
    assert.equal(over.body.code, "RECORD_CAP_REACHED");
    const upd = await json(R.kbId.PATCH(req(`/kb/${template.id}`, "ex1", "PATCH", { ...kbBody(1), title: "güncellendi", expectedRevision: template.revision }), { params: Promise.resolve({ id: String(template.id) }) }));
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    const cur = rstore.tables.astro_kb_entries.find((r) => r.id === template.id)!;
    const del = await json(R.kbId.DELETE(req(`/kb/${template.id}?expectedRevision=${Number(cur.revision)}`, "ex1", "DELETE"), { params: Promise.resolve({ id: String(template.id) }) }));
    assert.ok(del.status === 200 || del.status === 204, `silme ${del.status} ${JSON.stringify(del.body)}`);
    assert.equal((await json(R.kb.POST(req("/kb", "ex1", "POST", kbBody(6000))))).status, 201, "silinince yer açılır");
    assert.equal((await json(R.kb.POST(req("/kb", "exB", "POST", kbBody(7000))))).status, 201, "başka tenant etkilenmez");
  });

  await t("P2-03: profil tavanı 2000 + kayıtlı analiz günlük 200 / toplam 3000 + not tavanı (güncelleme tavana takılmaz) — enforceAstroWrite", async () => {
    const s = newStore();
    const c: EngineCtx = { db: createFakeClient(s), tenantId: TA, userId: U.ex1, entitlements: FULL };
    s.tables.astro_birth_profiles = Array.from({ length: ASTRO_RECORD_CAPS.profiles }, () => ({ id: randomUUID(), tenant_id: TA, owner_user_id: U.ex1 }));
    assert.equal((await enforceAstroWrite(c, "profile_create"))?.status, 409);
    assert.equal(await enforceAstroWrite(c, "profile_revision"), null, "revizyon (güncelleme) tavana takılmaz");
    assert.equal(await enforceAstroWrite({ ...c, userId: U.ex2 }, "profile_create"), null, "başka uzman");
    // Günlük kova: yazma kovası (120/10 dk) günlük tavandan önce dolduğundan gün içindeki birikim sayaç ön-yüklenerek sınanır.
    s.rateCounters.clear();
    s.rateCounters.set(rateLimitBucket("astro-analysis-day", `${TA}:${U.ex1}`), ASTRO_WRITE_LIMITS.analysisPerDay.limit - 1);
    assert.equal(await enforceAstroWrite(c, "analysis_save"), null, "200. analiz izinli");
    const d = await enforceAstroWrite(c, "analysis_save");
    assert.equal(d?.status, 429);
    assert.equal(((await d!.json()) as J).code, "ANALYSIS_DAILY_LIMIT");
    s.rateCounters.clear();
    s.tables.astro_analyses = Array.from({ length: ASTRO_RECORD_CAPS.analyses }, () => ({ id: randomUUID(), tenant_id: TA, owner_user_id: U.ex1 }));
    assert.equal((await enforceAstroWrite(c, "analysis_save"))?.status, 409);
    s.tables.astro_expert_notes = Array.from({ length: ASTRO_RECORD_CAPS.notes }, () => ({ id: randomUUID(), tenant_id: TA, owner_user_id: U.ex1 }));
    assert.equal((await enforceAstroWrite(c, "note_save", { creating: true }))?.status, 409);
    assert.equal(await enforceAstroWrite(c, "note_save", { creating: false }), null, "mevcut notu güncelleme serbest");
  });

  await t("P2-03: tüm yazma route'ları korumayı kapıdan SONRA çağırır (yetkisiz 404 kalır); okuma/silme route'larında yok", () => {
    const writes: [string, string, string][] = [
      ["app/api/admin/astroloji/profiles/route.ts", "POST", "profile_create"],
      ["app/api/admin/astroloji/profiles/[id]/revisions/route.ts", "POST", "profile_revision"],
      ["app/api/admin/astroloji/kb/route.ts", "POST", "kb_create"],
      ["app/api/admin/astroloji/kb/[id]/route.ts", "PATCH", "kb_update"],
      ["app/api/admin/astroloji/notes/route.ts", "PUT", "note_save"],
      ["app/api/admin/astroloji/analyses/route.ts", "POST", "analysis_save"],
    ];
    for (const [f, m, kind] of writes) {
      const s = read(f);
      const body = s.slice(s.indexOf(`export async function ${m}(`));
      const fn = body.slice(0, body.indexOf("\n}\n") + 2);
      const iGate = fn.indexOf("requireAstrologyAccess(req");
      const iLim = fn.indexOf(`enforceAstroWrite(gate.ctx, "${kind}"`);
      assert.ok(iGate > 0 && iLim > iGate, `${f} ${m}`);
    }
    for (const f of ["app/api/admin/astroloji/kb/[id]/route.ts"]) {
      const s = read(f);
      const del = s.slice(s.indexOf("export async function DELETE("));
      assert.ok(!del.includes("enforceAstroWrite"), "silme sınırlanmaz");
    }
  });

  await t("P2-03 (9B-P2-01 ile güncellendi): çok büyük eşleşen Bilgi Bankası analize KOPYALANMAZ → kayıt başarılı, satır küçük, KB açılışta güncel kayıtlardan gelir", async () => {
    const s = newStore();
    const c: EngineCtx = { db: createFakeClient(s), tenantId: TA, userId: U.ex1, entitlements: FULL };
    const pid = await mkProfile(c);
    const { deps } = goldenDeps();
    assert.equal((await runAstrology(c, { profileId: pid, selections: [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }] }, deps, { ownerPreviewHideInterp: false })).status, 200);
    const big = "ğüşıöç".repeat(3300); // ~19 800 karakter, ~40 KB UTF-8
    for (let i = 0; i < 45; i++) assert.equal((await createKb(c, { tradition: "western", topicKey: "planet_in_sign:sun:cancer", title: `Büyük ${i}`, body: big })).status, 201);
    const sv = await saveAnalysis(c, { profileId: pid, revision: 1, technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" }, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    const row = s.tables.astro_analyses.find((r) => r.id === (sv.body as J).analysisId)!;
    assert.deepEqual(row.kb_snapshot, [], "KB kopyası yazılmamalı");
    assert.ok(Buffer.byteLength(JSON.stringify(row)) < 200_000, `satır ${Buffer.byteLength(JSON.stringify(row))} bayt`);
    const a = ((await getAnalysis(c, row.id as string, false)).body as J).analysis;
    assert.equal(a.knowledgeBank.length, 45, "KB açılışta güncel kayıtlardan");
  });
  restore();

  // ═══ P2-04 — KP ruling konum ayrımı ═══════════════════════════════════════════════════════════════
  const WITH = G9("kp-ruling-newyork-with-birth");
  const NO = G9("kp-ruling-newyork-no-birth");
  const IST = GOLDEN.find((g) => g.name === "kp-ruling-planets")!;
  const NY = { latitude: 40.7128, longitude: -74.006 };

  await t("P2-04 kanıt (gerçek çağrı R2): yalnız konum değişince natal significator'lar DEĞİŞİYOR → sağlayıcı natal haritayı gözlem yerinde kuruyor", () => {
    assert.deepEqual({ ...WITH.body, latitude: IST.body.latitude, longitude: IST.body.longitude }, IST.body, "R2 gövdesi yalnız konumda farklı");
    const sig = (r: J) => Object.fromEntries(r.significators.map((x: J) => [x.planet, x.signifies.join(",")]));
    const a = sig(IST.response);
    const b = sig(WITH.response);
    assert.notEqual(a.Sun, b.Sun, "Güneş significator'ı değişmeliydi (kanıt)");
    assert.notEqual(a.Mars, b.Mars);
    assert.deepEqual(NO.response.rulingPlanets, WITH.response.rulingPlanets, "R3: ruling planets doğum verisinden bağımsız");
    assert.equal(NO.response.significators, undefined);
  });

  await t("P2-04: istek — doğum yerinde gövde AYNEN (golden ile birebir, doğum verili); farklı yerde doğum verisi GÖNDERİLMEZ (R3 gövdesiyle birebir)", () => {
    const def = getTechnique("kp.ruling")!;
    const o = def.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "mean" }, new Date())!;
    const atBirth = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, o)[0].body;
    assert.deepEqual(atBirth, IST.body);
    const sameAsBirth = kpRulingBody(SYNTH_A, "2026-10-07T09:00", "mean", { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude });
    assert.deepEqual(sameAsBirth, IST.body, "doğum yeri açıkça seçilse de aynı");
    const ny = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null, places: { target: NY } } as J, o)[0].body;
    assert.deepEqual(ny, NO.body);
    assert.ok(!("birthDate" in ny) && !("birthTime" in ny));
  });

  await t("P2-04: projeksiyon — R3 (doğum verisiz) kabul, significatorsOmitted='place_differs', significator yok; doğum verili yanıt doğum verisiz istekte REDDEDİLİR; doğum yerindeki golden aynen", () => {
    const base = { atUtc: "2026-10-07T09:00", local: "2026-10-07T12:00:00", utcOffsetHours: 3 };
    const no = projectRoxyKpRuling(NO.response, { ...base, place: NY, withBirth: false }) as J;
    assert.ok(no.ok, JSON.stringify(no.errors));
    assert.equal(no.technical.significatorsOmitted, "place_differs");
    assert.deepEqual(no.technical.significators, []);
    assert.deepEqual(no.technical.rulingPlanets, ["venus", "sun", "ketu", "mars"]);
    const leak = projectRoxyKpRuling(WITH.response, { ...base, place: NY, withBirth: false }) as J;
    assert.equal(leak.ok, false, "gözlem yeri haritasından gelen significator kabul edilmemeli");
    const ist = projectRoxyKpRuling(IST.response, { ...base, place: { latitude: 41.0082, longitude: 28.9784 } }) as J;
    assert.ok(ist.ok);
    assert.equal(ist.technical.significatorsOmitted, undefined);
    assert.equal(ist.technical.significators.length, 4);
  });

  await t("P2-04: rapor + UI — yeni farklı-yer kaydı açıklama gösterir (tablo yok); ESKİ farklı-yer kaydı uyarı gösterir; doğum yerinde uyarı yok", () => {
    const base = { atUtc: "2026-10-07T09:00", local: "2026-10-07T12:00:00", utcOffsetHours: 3 };
    const profile = { label: "A", client: null, revision: { revision: 1, birthDate: "1990-07-15", birthTime: "14:30:00", timeKnown: true, latitude: 41.0082, longitude: 28.9784, locationLabel: "İstanbul", timezone: "Europe/Istanbul" } };
    const rep = (technical: J) => reportTexts(buildAstroReport({ id: randomUUID(), title: "t", technique: "kp.ruling", analysisAt: "2026-10-07T10:00:00Z", params: {}, profile, technical })).join("\n");
    const no = (projectRoxyKpRuling(NO.response, { ...base, place: NY, withBirth: false }) as J).technical;
    const legacy = (projectRoxyKpRuling(WITH.response, { ...base, place: NY }) as J).technical;
    const ist = (projectRoxyKpRuling(IST.response, { ...base, place: { latitude: 41.0082, longitude: 28.9784 } }) as J).technical;
    const a = rep(no);
    assert.ok(a.includes("natal significator'lar bu hesapta alınmadı") && !a.includes("Ruling planet'lerin natal evleri"));
    const b = rep(legacy);
    assert.ok(b.includes("Uyarı: Bu eski kayıtta gözlem yeri doğum yerinden farklı"));
    const c = rep(ist);
    assert.ok(!c.includes("Uyarı: Bu eski kayıtta") && c.includes("Ruling planet'lerin natal evleri"));
    const ui = read("app/admin/astroloji/_components/KpPanels.tsx");
    assert.ok(ui.includes('data-testid="astro-kp-ruling-sig-omitted"') && ui.includes('data-testid="astro-kp-ruling-legacy-warning"'));
    assert.match(read("app/admin/astroloji/_components/TimingPanels.tsx"), /<KpRulingPanel [^>]*birthplace=\{birthplace\}/);
  });

  await t("P2-04: gerçek çağrı defteri — 9A'da 3 çağrı (R1–R3), toplam 50 ≤ 57; fixture'larda API anahtarı yok", () => {
    const l = G9("roxy-call-ledger-9a");
    assert.equal(l.total, 50);
    assert.equal(l.calls.length, 3);
    assert.ok(l.calls.every((c: J) => c.status === "200"));
    for (const f of readdirSync(DIR9)) assert.ok(!readFileSync(join(DIR9, f), "utf8").includes(process.env.ROXY_API_KEY!), f);
  });

  console.log(`\nastrology p2fix9a harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
