/**
 * ASTROLOJİ 9C — HttpOnly H5 uyumu. Astroloji API'si (uzman + admin yüzeyi, rapor dahil) web'de YALNIZ HttpOnly
 * çerezle (x-session-token olmadan) çalışır; yetki kuralları aynen korunur. GERÇEK route handler'ları + GERÇEK
 * oturum çözücü (pickSessionCredential / verifyUserRequest / verifyAdminRequest); sahte PostgREST. SENTETİK kişiler.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/httponly9c.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { createStore, createFakeClient, installFetchShim, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineDeps } from "@/lib/astrology/engine/service";
import { saveAnalysis } from "@/lib/astrology/analyses/service";
import { WEB_SESSION_COOKIE } from "@/lib/auth/sessionCookie";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-httponly9c";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";
process.env.SESSION_COOKIE_MODE = "primary";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    process.stderr.write(`FAIL ${name}\n     ${(e as Error).message.split("\n")[0]}\n`);
  }
}

const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = {
  owner: "e9d9d9d9-0000-4000-8000-000000000001",
  admin2: "e9d9d9d9-0000-4000-8000-000000000002",
  exA: "e9d9d9d9-0000-4000-8000-000000000003", // astrology, yorum kapalı
  exAI: "e9d9d9d9-0000-4000-8000-000000000004", // astrology + yorum
  exNone: "e9d9d9d9-0000-4000-8000-000000000005",
  exB: "e9d9d9d9-0000-4000-8000-000000000006", // başka tenant
  demo: "e9d9d9d9-0000-4000-8000-000000000007",
};
type Who = keyof typeof U;
const tok = (w: Who) => `tok-h9c-${w}-xxxxxxxxxxxxxxxxxxxx`;
const expert = (id: string, tenant: string, perms: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, role: "expert", active: true, approval_status: "approved", package_type: "premium", is_super_admin: false, is_demo_account: false,
  tenant_id: tenant, email: `${id.slice(-2)}@sentetik.test`, module_permissions: perms, ...extra,
});
const store: FakeStore = createStore({
  users: [
    { id: U.owner, role: "admin", active: true, approval_status: "approved", is_super_admin: true, is_demo_account: false, tenant_id: TA, email: "owner@sentetik.test", module_permissions: {} },
    { id: U.admin2, role: "admin", active: true, approval_status: "approved", is_super_admin: false, is_demo_account: false, tenant_id: TA, email: "a2@sentetik.test", module_permissions: { astrology: true } },
    expert(U.exA, TA, { astrology: true }),
    expert(U.exAI, TA, { astrology: true, astrology_provider_interp: true }),
    expert(U.exNone, TA, {}),
    expert(U.exB, TB, { astrology: true, astrology_provider_interp: true }),
    expert(U.demo, TA, { astrology: true, astrology_provider_interp: true }, { is_demo_account: true }),
  ],
  clients: [],
});
for (const w of Object.keys(U) as Who[]) store.sessions.set(tok(w), U[w]);
let roxyHits = 0;
const restore = installFetchShim({ store, supabaseUrl: SUPA, roxyBase: ROXY_BASE, roxy: () => { roxyHits += 1; return new Response("{}", { status: 500 }); } });

type Opt = { surface?: "expert" | "admin"; method?: string; body?: unknown; cookie?: Who | null; header?: Who | null; origin?: "same" | "evil" | null; ua?: string; as?: Who };
function req(path: string, who: Who, o: Opt = {}): NextRequest {
  const surface = o.surface ?? "expert";
  const base = surface === "admin" ? "/api/admin/astroloji" : "/api/astroloji";
  const h: Record<string, string> = { [surface === "admin" ? "x-admin-id" : "x-user-id"]: U[o.as ?? who] };
  const cookieWho = o.cookie === undefined ? who : o.cookie;
  if (cookieWho) h.cookie = `${WEB_SESSION_COOKIE}=${tok(cookieWho)}`;
  if (o.header) h["x-session-token"] = tok(o.header);
  if (o.origin === "same") h["sec-fetch-site"] = "same-origin";
  if (o.origin === "evil") h.origin = "https://evil.example";
  if (o.ua) h["user-agent"] = o.ua;
  if (o.body !== undefined) h["content-type"] = "application/json";
  return new NextRequest(`http://localhost${base}${path}`, { method: o.method ?? "GET", headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}
const call = async (r: Promise<Response>) => {
  const x = await r;
  const text = await x.text();
  let json: J = null;
  try { json = JSON.parse(text); } catch { /* ikili gövde */ }
  return { status: x.status, json, ct: x.headers.get("content-type") ?? "" };
};
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
let providerHits = 0;
const deps: EngineDeps = {
  config: { apiKey: "k-test-9c", baseUrl: ROXY_BASE },
  callProvider: async (_c, endpoint) => {
    providerHits += 1;
    return endpoint === "/astrology/natal-chart" ? { ok: true, raw: structuredClone(NATAL), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
  },
  rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  log: () => undefined,
  now: () => new Date("2026-10-10T09:00:00Z"),
};
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };

async function main() {
  const X = {
    access: await import("@/app/api/astroloji/access/route"),
    profiles: await import("@/app/api/astroloji/profiles/route"),
    analysis: await import("@/app/api/astroloji/analyses/[id]/route"),
    report: await import("@/app/api/astroloji/analyses/[id]/report/route"),
  };
  const A = { access: await import("@/app/api/admin/astroloji/access/route") };
  const P = (id: string) => ({ params: Promise.resolve({ id }) });
  // Uzman B'nin (başka tenant) bir analizi
  const ctxB = { db: createFakeClient(store), tenantId: TB, userId: U.exB, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  const pB = ((await createAstroProfile(ctxB, { label: "B kişi", birthDate: "1990-01-01", timeKnown: false, locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null))).body as J).profile.id;
  store.tables.astro_analyses ??= [];
  const bAnalysis = "00000000-0000-4000-8000-0000000b9c9c";
  store.tables.astro_analyses.push({ id: bAnalysis, tenant_id: TB, owner_user_id: U.exB, profile_id: pB, profile_revision: 1, technique: "western.natal", title: "B gizli", analysis_at: "2026-10-10T10:00:00Z", technique_params: {}, profile_snapshot: {}, method_snapshot: {}, technical_snapshot: {}, provider_interp_included: false, provider_interp_snapshot: null, kb_snapshot: [], versions_snapshot: {}, event_kind: "astrology.analysis.saved", client_id: null, created_at: "2026-10-10T10:00:00Z" });

  await t("primary: uzman (modül açık) YALNIZ HttpOnly çerezle (x-session-token YOK) erişir; yorum yetkisi bağımsız (exA kapalı / exAI açık)", async () => {
    const a = await call(X.access.GET(req("/access", "exA")));
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(a.json.entitlements.providerInterpretations, false);
    const b = await call(X.access.GET(req("/access", "exAI")));
    assert.equal(b.status, 200);
    assert.equal(b.json.entitlements.providerInterpretations, true);
  });

  await t("primary: owner admin yüzeyine YALNIZ çerezle erişir; owner olmayan admin 404", async () => {
    assert.equal((await call(A.access.GET(req("/access", "owner", { surface: "admin" })))).status, 200);
    assert.equal((await call(A.access.GET(req("/access", "admin2", { surface: "admin" })))).status, 404);
  });

  await t("primary: modülü kapalı uzman, demo hesap, oturumsuz istek, başka tenant analizi → tek tip 404 (çerez yetki VERMEZ)", async () => {
    for (const w of ["exNone", "demo"] as Who[]) {
      const r = await call(X.access.GET(req("/access", w)));
      assert.equal(r.status, 404, w);
      assert.deepEqual(r.json, { ok: false, error: "Bulunamadı." });
    }
    assert.equal((await call(X.access.GET(req("/access", "exA", { cookie: null })))).status, 404, "oturumsuz");
    assert.equal((await call(X.analysis.GET(req(`/analyses/${bAnalysis}`, "exAI"), P(bAnalysis)))).status, 404, "başka tenant");
    const rep = await call(X.report.GET(req(`/analyses/${bAnalysis}/report?format=pdf`, "exAI"), P(bAnalysis)));
    assert.equal(rep.status, 404);
    assert.ok(!rep.ct.includes("pdf"));
  });

  await t("primary: kimlik karışıklığı — başkasının çereziyle kendi x-user-id'si / başlık ve çerez farklı kullanıcı → 404", async () => {
    assert.equal((await call(X.access.GET(req("/access", "exA", { cookie: "exAI" })))).status, 404, "çerez başkasının");
    assert.equal((await call(X.access.GET(req("/access", "exA", { cookie: "exA", header: "exAI" })))).status, 404, "başlık ↔ çerez çakışması");
  });

  await t("primary: çerezle DURUM DEĞİŞTİREN istek — aynı köken (Sec-Fetch-Site) kabul; yabancı Origin / kökensiz reddedilir ve HİÇBİR şey yazılmaz", async () => {
    const body = { label: "Çerez profil", birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id };
    const n0 = (store.tables.astro_birth_profiles ?? []).length;
    const evil = await call(X.profiles.POST(req("/profiles", "exA", { method: "POST", body, origin: "evil" })));
    const none = await call(X.profiles.POST(req("/profiles", "exA", { method: "POST", body, origin: null })));
    assert.ok([403, 404].includes(evil.status) && [403, 404].includes(none.status), `${evil.status} ${none.status}`);
    assert.equal((store.tables.astro_birth_profiles ?? []).length, n0, "CSRF reddinde kayıt yazıldı");
    const ok = await call(X.profiles.POST(req("/profiles", "exA", { method: "POST", body, origin: "same" })));
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
  });

  await t("primary: Word/PDF raporu çerezle indirilir (kendi analizi), sağlayıcı çağrılmaz", async () => {
    const ctxA = { db: createFakeClient(store), tenantId: TA, userId: U.exA, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
    const pid = (store.tables.astro_birth_profiles ?? []).find((p) => p.owner_user_id === U.exA)!.id as string;
    const sel = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
    const run = await runAstrology(ctxA, { profileId: pid, selections: [sel] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(run.status, 200, JSON.stringify(run.body).slice(0, 200));
    const sv = await saveAnalysis(ctxA, { profileId: pid, revision: 1, ...sel, includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    const id = (sv.body as J).analysisId as string;
    const hitsBefore = providerHits;
    for (const fmt of ["docx", "pdf"]) {
      const r = await call(X.report.GET(req(`/analyses/${id}/report?format=${fmt}`, "exA"), P(id)));
      assert.equal(r.status, 200, `${fmt} ${JSON.stringify(r.json)}`);
    }
    assert.equal(providerHits, hitsBefore, "rapor sağlayıcı çağırdı");
    assert.equal(roxyHits, 0);
  });

  await t("primary: Android uygulama WebView'inde çerez KULLANILMAZ (yalnız token) — çerezle 404, token başlığıyla 200", async () => {
    const UA = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/129.0 Mobile Safari/537.36 YasamSistemiAndroid/1.0";
    assert.equal((await call(X.access.GET(req("/access", "exA", { ua: UA })))).status, 404);
    assert.equal((await call(X.access.GET(req("/access", "exA", { ua: UA, cookie: null, header: "exA" })))).status, 200);
  });

  await t("off modu (bugünkü davranış): çerez yok sayılır, token başlığı gerekir — eski istemci yolu bozulmadı", async () => {
    process.env.SESSION_COOKIE_MODE = "off";
    try {
      assert.equal((await call(X.access.GET(req("/access", "exA")))).status, 404, "off modunda çerez tek başına geçerli olmamalı");
      assert.equal((await call(X.access.GET(req("/access", "exA", { cookie: null, header: "exA" })))).status, 200);
    } finally {
      process.env.SESSION_COOKIE_MODE = "primary";
    }
  });

  await t("istemci: Astroloji API istemcisi ve DY rozeti H5 yardımcılarını kullanır (ham x-session-token / token zorunluluğu yok)", () => {
    const api = readFileSync(join(ROOT, "app/admin/astroloji/_lib/api.ts"), "utf8");
    assert.ok(api.includes("...sessionTokenHeader()") && api.includes("hasSessionCredential()"));
    assert.ok(!/"x-session-token":\s*readSessionToken/.test(api), "ham token başlığı");
    const st = readFileSync(join(ROOT, "components/astrology/AstrologyClientStatus.tsx"), "utf8");
    assert.ok(st.includes("hasSessionCredential(token)") && st.includes("...sessionTokenHeader(token)"));
    assert.ok(!/"x-session-token":\s*token/.test(st));
  });

  restore();
  console.log(`\nastrology httponly9c harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
