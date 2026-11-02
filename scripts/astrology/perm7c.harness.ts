/**
 * ASTROLOJİ AŞAMA 7C — UZMAN YETKİLERİ · ROXY OTOMATİK YORUM ALT-YETKİSİ · ÇOK UZMANLI GÜVENLİK.
 * GERÇEK route handler'ları (admin + uzman yüzeyi) + GERÇEK verifyUserRequest / requireModuleAccess /
 * verifyAdminRequest; fetch yalnız sahte PostgREST'e ve sahte Roxy'ye gider. SENTETİK kişiler.
 *
 * Yetki DB'den her istekte okunur → testte users.module_permissions değiştirilip AYNI oturum token'ıyla
 * (açık kalan sekme) bir sonraki istek denenir.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/perm7c.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createFakeClient, createStore, installFetchShim, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-perm7c";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const ROOT = join(__dirname, "..", "..");
const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));
const NARR = "[RXN-sun-summary]";

const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_A = "c7c70001-0000-4000-8000-0000000000aa";
const U = {
  owner: "e0e0e0e0-0000-4000-8000-000000000001",
  admin2: "e0e0e0e0-0000-4000-8000-000000000002",
  exNone: "e0e0e0e0-0000-4000-8000-000000000003",
  exA: "e0e0e0e0-0000-4000-8000-000000000004",
  exAI: "e0e0e0e0-0000-4000-8000-000000000005",
  exInterpOnly: "e0e0e0e0-0000-4000-8000-000000000006",
  exB: "e0e0e0e0-0000-4000-8000-000000000007",
  demo: "e0e0e0e0-0000-4000-8000-000000000008",
  pending: "e0e0e0e0-0000-4000-8000-000000000009",
  nonPremium: "e0e0e0e0-0000-4000-8000-00000000000a",
};
type Who = keyof typeof U | "anon";
const tok = (w: keyof typeof U) => `tok-perm7c-${w}-xxxxxxxxxxxxxx`;

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    process.stderr.write(`FAIL ${name}\n     ${(e as Error).message}\n`);
  }
}

const expert = (id: string, tenant: string, perms: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, role: "expert", active: true, approval_status: "approved", package_type: "premium", is_super_admin: false, is_demo_account: false,
  tenant_id: tenant, email: `${id.slice(-2)}@sentetik.test`, module_permissions: perms, ...extra,
});
const store: FakeStore = createStore({
  users: [
    { id: U.owner, role: "admin", active: true, approval_status: "approved", is_super_admin: true, is_demo_account: false, tenant_id: TA, email: "owner@sentetik.test", module_permissions: {} },
    { id: U.admin2, role: "admin", active: true, approval_status: "approved", is_super_admin: false, is_demo_account: false, tenant_id: TA, email: "admin2@sentetik.test", module_permissions: { astrology: true, astrology_provider_interp: true } },
    expert(U.exNone, TA, {}),
    expert(U.exA, TA, { astrology: true }),
    expert(U.exAI, TA, { astrology: true, astrology_provider_interp: true }),
    expert(U.exInterpOnly, TA, { astrology_provider_interp: true }),
    expert(U.exB, TB, { astrology: true, astrology_provider_interp: true }),
    expert(U.demo, TA, { astrology: true, astrology_provider_interp: true }, { is_demo_account: true }),
    expert(U.pending, TA, { astrology: true }, { approval_status: "pending" }),
    expert(U.nonPremium, TA, { astrology: true }, { package_type: "trial", plan: "trial" }),
  ],
  clients: [{ id: CLIENT_A, tenant_id: TA, ad: "Sentetik", soyad: "Danışan", dogum: "1990-07-15", created_at: "2026-01-01T00:00:00Z" }],
});
for (const w of Object.keys(U) as (keyof typeof U)[]) store.sessions.set(tok(w), U[w]);
const setPerms = (id: string, perms: Record<string, unknown>) => {
  store.tables.users.find((u) => u.id === id)!.module_permissions = perms;
};

let roxyHits = 0;
const restore = installFetchShim({
  store,
  supabaseUrl: SUPA,
  roxyBase: ROXY_BASE,
  roxy: ({ url, body }) => {
    roxyHits += 1;
    assert.ok(url.startsWith(`${ROXY_BASE}/astrology/natal-chart?lang=tr`), url);
    const raw = structuredClone(FIXTURE);
    raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
    raw.houseSystem = body.houseSystem;
    return new Response(JSON.stringify(raw), { status: 200, headers: { "Content-Type": "application/json" } });
  },
});

function req(surface: "expert" | "admin", path: string, who: Who, method = "GET", body?: unknown): NextRequest {
  const base = surface === "admin" ? "/api/admin/astroloji" : "/api/astroloji";
  const h: Record<string, string> = who === "anon" ? {} : { [surface === "admin" ? "x-admin-id" : "x-user-id"]: U[who], "x-session-token": tok(who) };
  if (body !== undefined) h["Content-Type"] = "application/json";
  return new NextRequest(`http://localhost${base}${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}
async function call(res: Promise<Response>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const r = await res;
  const text = await r.text();
  return { status: r.status, json: JSON.parse(text), text };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

async function main() {
  // Uzman yüzeyi modülleri (re-export) — Next'in route'a verdiği gibi doğrudan içe aktarılır.
  const X = {
    access: await import("@/app/api/astroloji/access/route"),
    profiles: await import("@/app/api/astroloji/profiles/route"),
    profile: await import("@/app/api/astroloji/profiles/[id]/route"),
    run: await import("@/app/api/astroloji/engine/run/route"),
    view: await import("@/app/api/astroloji/engine/view/route"),
    result: await import("@/app/api/astroloji/results/[id]/route"),
    analyses: await import("@/app/api/astroloji/analyses/route"),
    analysis: await import("@/app/api/astroloji/analyses/[id]/route"),
    notes: await import("@/app/api/astroloji/notes/route"),
    kb: await import("@/app/api/astroloji/kb/route"),
    link: await import("@/app/api/astroloji/profiles/[id]/client/route"),
    status: await import("@/app/api/astroloji/client-status/route"),
    unmapped: await import("@/app/api/astroloji/unmapped/route"),
    delPreview: await import("@/app/api/astroloji/profiles/delete/preview/route"),
    del: await import("@/app/api/astroloji/profiles/delete/route"),
  };
  const A = {
    access: await import("@/app/api/admin/astroloji/access/route"),
    profiles: await import("@/app/api/admin/astroloji/profiles/route"),
    status: await import("@/app/api/admin/astroloji/client-status/route"),
  };
  const ctxP = (id: string) => ({ params: Promise.resolve({ id }) });
  const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
  const birth = { birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" };
  const astroQueries = () => store.log.filter((l) => l.table.startsWith("astro_") || l.table.startsWith("rpc:astro_")).length;

  const origErr = console.error;
  console.error = () => undefined;
  try {
    await t("çözüm (saf): owner → hepsi; uzman astrology → modül; +interp → yorum; yalnız interp → hiçbiri; owner olmayan admin → hiçbiri; bayrak yalnız boolean true", () => {
      const R = resolveAstrologyEntitlements;
      assert.equal(R({ isOwner: true }).providerInterpretations, true);
      assert.deepEqual(R({ isOwner: false, role: "expert", flags: { astrology: true } }), { module: true, engine: true, knowledgeBank: true, providerInterpretations: false });
      assert.equal(R({ isOwner: false, role: "expert", flags: { astrology: true, astrology_provider_interp: true } }).providerInterpretations, true);
      assert.equal(R({ isOwner: false, role: "expert", flags: { astrology_provider_interp: true } }).module, false, "alt-yetki tek başına erişim açmaz");
      assert.equal(R({ isOwner: false, role: "admin", flags: { astrology: true, astrology_provider_interp: true } }).module, false, "owner olmayan admin");
      for (const v of ["true", 1, { on: true }, null]) assert.equal(R({ isOwner: false, role: "expert", flags: { astrology: v } }).module, false, `bayrak ${JSON.stringify(v)}`);
    });

    await t("yetkisiz matris (uzman yüzeyi): izinsiz uzman / owner olmayan admin / yalnız-yorum / demo / onay bekleyen / Premium değil / oturumsuz → 24 route'un (Aşama 8 tekli + UAT 2. tur toplu rapor ucu dahil) hepsi tek tip 404, astroloji verisine sorgu yok", async () => {
      // D8: demo örnek görünümü ucu (app/api/astroloji/demo/**) admin aynası DEĞİL → bu matristen ayrı test edilir (aşağıda).
      const routes = walk(join(ROOT, "app/api/astroloji")).filter((f) => !/[\\/]astroloji[\\/]demo[\\/]/.test(f));
      assert.equal(routes.length, 24); // Aşama 8: analyses/[id]/report; UAT 2. tur (L): analyses/report (seçili/tüm)
      const before = astroQueries();
      for (const who of ["exNone", "admin2", "exInterpOnly", "demo", "pending", "nonPremium", "anon"] as const) {
        for (const f of routes) {
          const sub = relative(join(ROOT, "app/api/astroloji"), f).replace(/\\/g, "/").replace(/\/?route\.ts$/, "");
          const path = "/" + sub.replace(/\[id\]/g, randomUUID());
          const mod = (await import(pathToFileURL(f).href)) as Record<string, (r: NextRequest, c?: unknown) => Promise<Response>>;
          for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
            if (typeof mod[m] !== "function") continue;
            const body = m === "GET" || m === "DELETE" ? undefined : {};
            const x = await call(mod[m](req("expert", path, who, m, body), ctxP(randomUUID())));
            assert.equal(x.status, 404, `${who} ${m} ${path}: ${x.status}`);
            assert.deepEqual(x.json, { ok: false, error: "Bulunamadı." });
          }
        }
      }
      assert.equal(astroQueries(), before, "yetkisiz isteklerde astroloji tablosu okundu");
    });

    await t("D8 demo örnek ucu: demo DIŞINDAKİ herkes tek tip 404; demo yalnız sentetik örneği görür, yazma 403, astroloji tablosu okunmaz", async () => {
      const before = astroQueries();
      const demoRoute = (await import(pathToFileURL(join(ROOT, "app/api/astroloji/demo/[...path]/route.ts")).href)) as Record<string, (r: NextRequest) => Promise<Response>>;
      for (const who of ["exNone", "admin2", "exInterpOnly", "exAI", "pending", "nonPremium", "anon"] as const) {
        for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
          const x = await call(demoRoute[m](req("expert", "/demo/profiles", who, m, m === "GET" || m === "DELETE" ? undefined : {})));
          assert.equal(x.status, 404, `demo ucu ${who} ${m}: ${x.status}`);
          assert.deepEqual(x.json, { ok: false, error: "Bulunamadı." });
        }
      }
      // Admin kabuğu yolundan demo ucu yoktur; owner bile demo örneğini görmez (yalnız demo hesabı).
      assert.equal((await call(demoRoute.GET(req("expert", "/demo/profiles", "owner")))).status, 404);
      // Gerçek erişim yoklaması demo hesabına 404 KALIR; demo yoklaması salt okunur görünüm + yorum yetkisi YOK.
      assert.equal((await call(X.access.GET(req("expert", "/access", "demo")))).status, 404);
      const da = await call(demoRoute.GET(req("expert", "/demo/access", "demo")));
      const de = da.json.entitlements as { providerInterpretations?: unknown } | undefined;
      assert.deepEqual([da.status, da.json.demo, da.json.readOnly, da.json.isOwner, de?.providerInterpretations], [200, true, true, false, false]);
      const dl = await call(demoRoute.GET(req("expert", "/demo/profiles", "demo")));
      assert.equal(dl.status, 200);
      const profiles = dl.json.profiles as { label: string; clientId: unknown }[];
      assert.deepEqual(profiles.map((p) => [p.label.startsWith("Örnek Harita"), p.clientId]), [[true, null], [true, null]]);
      const writes = [["POST", "/demo/profiles"], ["POST", "/demo/analyses"], ["PATCH", "/demo/profiles/x"], ["DELETE", "/demo/analyses/x"], ["PUT", "/demo/notes"], ["POST", "/demo/kb"], ["POST", "/demo/efemeris"], ["POST", "/demo/horary/western"]] as const;
      for (const [m, path] of writes) {
        const x = await call(demoRoute[m](req("expert", path, "demo", m, m === "DELETE" ? undefined : {})));
        assert.deepEqual([x.status, x.json.code], [403, "DEMO_READONLY"], `demo ${m} ${path}`);
      }
      assert.equal(astroQueries(), before, "demo ucu astroloji tablosu okudu");
    });

    await t("admin kabuğu yüzeyi owner-only kalır: Astroloji yetkili uzman (x-admin-id / x-user-id) ve owner olmayan admin → 404; owner → 200", async () => {
      for (const who of ["exAI", "admin2"] as const) assert.equal((await call(A.access.GET(req("admin", "/access", who)))).status, 404);
      const spoof = new NextRequest("http://localhost/api/admin/astroloji/access", { headers: { "x-user-id": U.exAI, "x-session-token": tok("exAI") } });
      assert.equal((await call(A.access.GET(spoof))).status, 404);
      const o = await call(A.access.GET(req("admin", "/access", "owner")));
      assert.equal(o.status, 200);
      assert.equal(o.json.isOwner, true);
    });

    await t("erişim yoklaması: owner (uzman yüzeyi) isOwner; exA yorum KAPALI; exAI yorum AÇIK; owner önizlemesi yalnız owner'da", async () => {
      const o = await call(X.access.GET(req("expert", "/access", "owner")));
      assert.equal(o.status, 200);
      assert.equal(o.json.isOwner, true);
      const a = await call(X.access.GET(req("expert", "/access", "exA")));
      assert.deepEqual([a.status, a.json.isOwner, (a.json.entitlements as Record<string, boolean>).providerInterpretations, a.json.ownerPreviewAvailable], [200, false, false, false]);
      const ai = await call(X.access.GET(req("expert", "/access", "exAI")));
      assert.equal((ai.json.entitlements as Record<string, boolean>).providerInterpretations, true);
    });

    // ─── exA (yorum yok) ve exAI (yorum var) kendi verisini oluşturur ───────────
    const mk = async (who: "exA" | "exAI" | "exB", label: string, clientId: string | null = null) => {
      let r = await call(X.profiles.POST(req("expert", "/profiles", who, "POST", { label, clientId, ...birth })));
      // 2026-10-16: aynı uzmanda aynı kişi tekrar → açık "Farklı kişi olarak devam et" onayı (sentetik kurgu).
      if (r.status === 409 && r.json.code === "DUPLICATE_PROFILE") {
        const ids = (r.json.duplicates as { profileId: string }[]).map((d) => d.profileId);
        r = await call(X.profiles.POST(req("expert", "/profiles", who, "POST", { label, clientId, ...birth, confirmDifferentPerson: ids })));
      }
      assert.equal(r.status, 201, r.text);
      return (r.json.profile as { id: string }).id;
    };
    let pA = "";
    let pAI = "";
    let aAI = "";
    let rAI = "";
    let aAIBody = "";
    await t("exA (yorum yetkisi YOK): hesap teknik sonucu tam; Roxy anlatısı yanıtta YOK; yorum alanı yok sayılır (kayıtta yorum YOK); kendi notu + KB çalışır", async () => {
      pA = await mk("exA", "Sentetik A — natal", CLIENT_A);
      const run = await call(X.run.POST(req("expert", "/engine/run", "exA", "POST", { profileId: pA, selections: [NATAL] })));
      assert.equal(run.status, 200, run.text.slice(0, 200));
      assert.ok(!run.text.includes(NARR), "yorum yetkisi yokken anlatı döndü");
      const v = (run.json.results as { view: { technical: { bodies: unknown[] }; interpretation: { visible: boolean; reason?: string } } }[])[0].view;
      assert.ok(v.technical.bodies.length > 5, "teknik sonuç engellendi");
      assert.deepEqual(v.interpretation, { visible: false, reason: "not_entitled" });
      const n = await call(X.notes.PUT(req("expert", "/notes", "exA", "PUT", { profileId: pA, sectionKey: "overall", body: "exA notu", expectedRevision: null })));
      assert.equal(n.status, 201, n.text);
      const k = await call(X.kb.POST(req("expert", "/kb", "exA", "POST", { tradition: "western", topicKey: "planet_in_house:saturn:7", title: "exA KB", body: "exA mesleki notu" })));
      assert.equal(k.status, 201, k.text);
      // 2026-10-12: istemcinin includeProviderInterp alanı yok sayılır; yetkisiz uzmanın kaydına yorum YAZILMAZ (403 yerine).
      const bad = await call(X.analyses.POST(req("expert", "/analyses", "exA", "POST", { profileId: pA, revision: 1, ...NATAL, includeProviderInterp: true, saveRequestId: randomUUID() })));
      assert.equal(bad.status, 201);
      assert.ok(!JSON.stringify(bad.json).match(/interpret|summary|content/i), "yanıt yorum taşımamalı");
      const ok = await call(X.analyses.POST(req("expert", "/analyses", "exA", "POST", { profileId: pA, revision: 1, ...NATAL, includeProviderInterp: false, saveRequestId: randomUUID() })));
      assert.equal(ok.status, 201, ok.text);
      const open = await call(X.analysis.GET(req("expert", `/analyses/${ok.json.analysisId}`, "exA"), ctxP(ok.json.analysisId as string)));
      assert.ok(open.text.includes("exA notu") && !open.text.includes(NARR));
    });

    await t("exAI (yorum yetkisi VAR): anlatı görünür; yorumlu analiz kaydedilir ve açılır", async () => {
      pAI = await mk("exAI", "Sentetik AI — natal");
      const run = await call(X.run.POST(req("expert", "/engine/run", "exAI", "POST", { profileId: pAI, selections: [NATAL] })));
      assert.ok(run.text.includes(NARR), "yetkili uzman anlatıyı görmeli");
      rAI = ((run.json.results as { view: { id: string } }[])[0]).view.id;
      await call(X.notes.PUT(req("expert", "/notes", "exAI", "PUT", { profileId: pAI, sectionKey: "overall", body: "exAI notu", expectedRevision: null })));
      const s = await call(X.analyses.POST(req("expert", "/analyses", "exAI", "POST", { profileId: pAI, revision: 1, ...NATAL, includeProviderInterp: true, saveRequestId: randomUUID() })));
      assert.equal(s.status, 201, s.text);
      aAI = s.json.analysisId as string;
      const open = await call(X.analysis.GET(req("expert", `/analyses/${aAI}`, "exAI"), ctxP(aAI)));
      assert.ok(open.text.includes(NARR) && open.text.includes("exAI notu"));
      aAIBody = open.text;
    });

    let snapBefore = "";
    await t("yorum yetkisi KAPATILIR (açık sekme, aynı token): kayıtlı snapshot / liste / önbellek / görünüm / yeniden hesap → anlatı YOK; varlığı da sızmaz; not + teknik korunur; DB snapshot değişmez", async () => {
      snapBefore = JSON.stringify(store.tables.astro_analyses.find((a) => a.id === aAI));
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: false });
      const h = roxyHits;
      const open = await call(X.analysis.GET(req("expert", `/analyses/${aAI}`, "exAI"), ctxP(aAI)));
      assert.equal(open.status, 200);
      assert.ok(!open.text.includes(NARR), "kayıtlı analizden anlatı sızdı");
      const an = open.json.analysis as { interpretation: unknown; versions: Record<string, unknown>; notes: { body: string }[]; technical: { bodies: unknown[] } };
      assert.deepEqual(an.interpretation, { visible: false, reason: "not_entitled" });
      assert.equal(an.versions.interpretationSchema ?? null, null, "yorum şeması adı sızdı");
      assert.ok(an.notes.some((x) => x.body === "exAI notu") && an.technical.bodies.length > 5, "not / teknik kayboldu");
      const list = await call(X.analyses.GET(req("expert", `/analyses?profileId=${pAI}`, "exAI")));
      assert.ok((list.json.analyses as { providerInterpIncluded: boolean }[]).every((x) => x.providerInterpIncluded === false), "listede yorum bayrağı sızdı");
      const res = await call(X.result.GET(req("expert", `/results/${rAI}`, "exAI"), ctxP(rAI)));
      assert.ok(res.status === 200 && !res.text.includes(NARR), "önbellek sonucundan anlatı sızdı");
      const vw = await call(X.view.POST(req("expert", "/engine/view", "exAI", "POST", { profileId: pAI, selections: [NATAL] })));
      assert.ok(vw.status === 200 && !vw.text.includes(NARR), "yalnız-önbellek görünümünden anlatı sızdı");
      const rr = await call(X.run.POST(req("expert", "/engine/run", "exAI", "POST", { profileId: pAI, selections: [NATAL] })));
      assert.ok(!rr.text.includes(NARR), "yeniden hesap (önbellek) anlatı döndü");
      assert.equal(roxyHits, h, "önbellekli sonuç için Roxy çağrıldı");
      // Owner önizleme bayrağını kendi açmaya çalışsa bile yetki artmaz.
      const pv = await call(X.analysis.GET(req("expert", `/analyses/${aAI}?previewNoInterp=0`, "exAI"), ctxP(aAI)));
      assert.ok(!pv.text.includes(NARR));
      assert.equal(JSON.stringify(store.tables.astro_analyses.find((a) => a.id === aAI)), snapBefore, "DB snapshot değişti");
    });

    await t("yorum yetkisi YENİDEN açılır → aynı kayıtlar anlatıyla birebir geri gelir", async () => {
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
      const open = await call(X.analysis.GET(req("expert", `/analyses/${aAI}`, "exAI"), ctxP(aAI)));
      assert.equal(open.text, aAIBody);
    });

    await t("Astroloji modül yetkisi KAPATILIR (açık sekme): tüm uçlar 404, kayıtlar silinmez; yeniden açılınca uzmanın kendi kayıtları aynen erişilir", async () => {
      const rows = () => JSON.stringify([store.tables.astro_birth_profiles.filter((p) => p.owner_user_id === U.exAI), store.tables.astro_analyses.filter((a) => a.owner_user_id === U.exAI), store.tables.astro_expert_notes.filter((n) => n.owner_user_id === U.exAI)]);
      const before = rows();
      setPerms(U.exAI, { astrology: false, astrology_provider_interp: true });
      assert.equal((await call(X.profiles.GET(req("expert", "/profiles", "exAI")))).status, 404);
      assert.equal((await call(X.analysis.GET(req("expert", `/analyses/${aAI}`, "exAI"), ctxP(aAI)))).status, 404);
      assert.equal((await call(X.result.GET(req("expert", `/results/${rAI}`, "exAI"), ctxP(rAI)))).status, 404);
      assert.equal(rows(), before, "yetki kaldırma kayıtları değiştirdi");
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
      const list = await call(X.profiles.GET(req("expert", "/profiles", "exAI")));
      assert.deepEqual((list.json.profiles as { id: string }[]).map((p) => p.id), [pAI]);
      assert.equal(await call(X.analysis.GET(req("expert", `/analyses/${aAI}`, "exAI"), ctxP(aAI))).then((r) => r.text), aAIBody);
    });

    await t("çok uzmanlı izolasyon: exA ↔ exAI (aynı tenant) ve exB (başka tenant) birbirinin profil / analiz / sonuç / KB kaydını göremez (404 / listede yok)", async () => {
      await mk("exB", "Sentetik B — natal");
      for (const [who, pid, aid, rid] of [["exA", pAI, aAI, rAI], ["exB", pAI, aAI, rAI]] as const) {
        assert.equal((await call(X.profile.GET(req("expert", `/profiles/${pid}`, who), ctxP(pid)))).status, 404);
        assert.equal((await call(X.analysis.GET(req("expert", `/analyses/${aid}`, who), ctxP(aid)))).status, 404);
        assert.equal((await call(X.result.GET(req("expert", `/results/${rid}`, who), ctxP(rid)))).status, 404);
        const l = await call(X.profiles.GET(req("expert", "/profiles", who)));
        assert.ok(!l.text.includes(pAI) && !l.text.includes("Sentetik AI"));
        const kb = await call(X.kb.GET(req("expert", "/kb", who)));
        assert.ok(!kb.text.includes("exAI"));
      }
      assert.equal((await call(X.profile.GET(req("expert", `/profiles/${pA}`, "exAI"), ctxP(pA)))).status, 404);
      const kbAI = await call(X.kb.GET(req("expert", "/kb", "exAI")));
      assert.ok(!kbAI.text.includes("exA mesleki notu"), "exAI exA'nın KB kaydını gördü");
    });

    await t("sinastri / composite snapshot'ından yorum sızdırma: yetki kapalıyken anlatı ve varlığı sızmaz; açıkken görünür", async () => {
      const partner = await mk("exAI", "Sentetik AI — karşı taraf");
      const db = createFakeClient(store);
      const r = await db.rpc("astro_analysis_save_v2", {
        p_tenant_id: TA, p_user_id: U.exAI, p_profile_id: pAI, p_profile_revision: 1, p_partner_profile_id: partner, p_partner_profile_revision: 1, p_result_ids: [],
        p_technique: "western.synastry", p_title: "AI sinastri", p_save_request_id: randomUUID(), p_technique_params: { partnerProfileId: partner },
        p_profile_snapshot: { label: "AI", partner: { label: "karşı" } }, p_method_snapshot: {}, p_technical_snapshot: { schema: "astro.western.synastry.v1", aspects: [{ a: "venus", type: "trine", b: "mars" }] },
        p_kb_snapshot: [], p_provider_interp_included: true, p_provider_interp_snapshot: { provider: "roxy", lang: "tr", notice: "n", content: { summary: "<SYN-GIZLI-YORUM>", aspects: [{ text: "<SYN-ICERDE>" }] } },
        p_versions_snapshot: { provider: "roxy", interpretationSchema: "astro.western.synastry.interp.v1" }, p_notes: [],
      });
      const sid = (r.data as { analysis_id: string }).analysis_id;
      setPerms(U.exAI, { astrology: true });
      const off = await call(X.analysis.GET(req("expert", `/analyses/${sid}`, "exAI"), ctxP(sid)));
      assert.equal(off.status, 200);
      for (const s of ["<SYN-GIZLI-YORUM>", "<SYN-ICERDE>", "synastry.interp"]) assert.ok(!off.text.includes(s), `sinastri yorumu sızdı: ${s}`);
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
      const on = await call(X.analysis.GET(req("expert", `/analyses/${sid}`, "exAI"), ctxP(sid)));
      assert.ok(on.text.includes("<SYN-GIZLI-YORUM>") && on.text.includes("<SYN-ICERDE>"));
    });

    await t("DY durum rozeti ucu: yetkili uzman KENDİ eşleştirmesini görür (yorum yetkisinden bağımsız); izinsiz uzman / owner olmayan admin 404; başka uzman sayı görmez", async () => {
      const sv = await call(X.analyses.POST(req("expert", "/analyses", "exA", "POST", { profileId: pA, revision: 1, ...NATAL, includeProviderInterp: false, saveRequestId: randomUUID() })));
      assert.equal(sv.status, 201);
      const sA = await call(X.status.GET(req("expert", `/client-status?clientId=${CLIENT_A}`, "exA")));
      assert.equal(sA.json.status, "has_analyses", "exA (yorum yetkisi yok) rozeti görmeli");
      // 3 = önceki testte yorum alanı "true" gönderilen kayıt da artık (yorumsuz) kaydedilir (2026-10-12; eskiden 403).
      assert.equal(sA.json.analysisCount, 3);
      const sAI = await call(X.status.GET(req("expert", `/client-status?clientId=${CLIENT_A}`, "exAI")));
      assert.deepEqual([sAI.json.status, sAI.json.analysisCount], ["not_linked", 0], "başka uzmanın analiz sayısı sızdı");
      const sB = await call(X.status.GET(req("expert", `/client-status?clientId=${CLIENT_A}`, "exB")));
      assert.equal(sB.json.status, "not_linked");
      for (const who of ["exNone", "admin2", "exInterpOnly", "demo"] as const) assert.equal((await call(X.status.GET(req("expert", `/client-status?clientId=${CLIENT_A}`, who)))).status, 404);
      assert.equal((await call(A.status.GET(req("admin", `/client-status?clientId=${CLIENT_A}`, "admin2")))).status, 404);
      assert.equal((await call(A.status.GET(req("admin", `/client-status?clientId=${CLIENT_A}`, "owner")))).json.status, "not_linked");
    });

    await t("sistem alan denetimi yalnız sahibine: uzman (yetkili) 404; owner uzman yüzeyinde de 200", async () => {
      assert.equal((await call(X.unmapped.GET(req("expert", "/unmapped", "exAI")))).status, 404);
      assert.equal((await call(X.unmapped.PATCH(req("expert", "/unmapped", "exAI", "PATCH", { id: randomUUID(), classification: "ignored" })))).status, 404);
      assert.equal((await call(X.unmapped.GET(req("expert", "/unmapped", "owner")))).status, 200);
    });

    await t("kalıcı silme güvenliği uzman yüzeyinde: exA kendi profilini 2 onayla siler; exAI'nin profilini önizleyemez/silemez", async () => {
      const p = await mk("exA", "Sentetik A — silinecek");
      const pv = await call(X.delPreview.POST(req("expert", "/profiles/delete/preview", "exA", "POST", { mode: "single", profileIds: [p] })));
      assert.equal(pv.status, 200, pv.text);
      assert.equal((await call(X.del.POST(req("expert", "/profiles/delete", "exA", "POST", { mode: "single", profileIds: [p], confirmToken: pv.json.confirmToken, confirmations: 1 })))).status, 400);
      const d = await call(X.del.POST(req("expert", "/profiles/delete", "exA", "POST", { mode: "single", profileIds: [p], confirmToken: pv.json.confirmToken, confirmations: 2 })));
      assert.equal(d.status, 200, d.text);
      assert.equal((await call(X.delPreview.POST(req("expert", "/profiles/delete/preview", "exA", "POST", { mode: "single", profileIds: [pAI] })))).status, 404);
      assert.ok(store.tables.astro_birth_profiles.some((x) => x.id === pAI));
    });

    await t("eşleştirme uzman yüzeyinde: exA kendi tenant danışanına bağlar; exB (başka tenant) aynı danışanı bağlayamaz", async () => {
      const p = await mk("exA", "Sentetik A — eşleştirme");
      assert.equal((await call(X.link.PUT(req("expert", `/profiles/${p}/client`, "exA", "PUT", { clientId: CLIENT_A, expectedClientId: null }), ctxP(p)))).status, 200);
      const pb = await mk("exB", "Sentetik B — eşleştirme");
      assert.equal((await call(X.link.PUT(req("expert", `/profiles/${pb}/client`, "exB", "PUT", { clientId: CLIENT_A, expectedClientId: null }), ctxP(pb)))).status, 404);
    });

    await t("owner uzman yüzeyinde de çalışır (kendi kayıtları; uzman kayıtlarını görmez)", async () => {
      const l = await call(X.profiles.GET(req("expert", "/profiles", "owner")));
      assert.equal(l.status, 200);
      assert.ok(!l.text.includes("Sentetik A") && !l.text.includes("Sentetik AI"), "owner uzman kayıtlarını görmemeli (owner workspace view kaldırıldı)");
    });
  } finally {
    console.error = origErr;
    restore();
  }
  console.log(`\nastrology perm7c (uzman yetkileri) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("perm7c harness çöktü:", e);
  process.exit(1);
});
