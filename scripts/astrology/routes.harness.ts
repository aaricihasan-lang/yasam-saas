/**
 * ASTROLOJİ AŞAMA 1 — ROUTE + ERİŞİM MATRİSİ harness'i (gerçek DB / gerçek Roxy YOK).
 *
 * GERÇEK route handler'ları + GERÇEK verifyAdminRequest (oturum token'ı ↔ x-admin-id binding,
 * role/active) + GERÇEK getServerDb çalışır; global fetch yalnız sahte PostgREST'e ve sahte
 * Roxy'ye yönlendirilir (başka her dış istek engellenir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/routes.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { createStore, installFetchShim, type FakeStore } from "./fakeSupabase";

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
const API_KEY = "test-roxy-key-SECRET-route-55aa";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = API_KEY;
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));
/** GERÇEK Roxy natal yanıtı (golden, 2026-10-07, tek çağrı, sentetik kişi). */
const GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
let roxyRawOverride: Record<string, unknown> | null = null;
/** Aşama 3 golden yanıtları (gerçek, sentetik kişiler) — endpoint → yanıt. */
const GOLDEN3: Record<string, Record<string, unknown>> = {};
for (const n of ["transit", "forecast", "progression", "solar-arc", "solar-return", "lunar-return", "synastry", "composite"]) {
  const f = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", `${n}.json`), "utf8"));
  GOLDEN3[f.endpoint] = f.response;
}
const roxyEndpoints: string[] = [];

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDS = {
  owner: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
  admin2: "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b",
  expert: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
  demo: "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d",
};
const TOK = {
  owner: "tok-owner-aaaaaaaaaaaaaaaa",
  admin2: "tok-admin2-bbbbbbbbbbbbbbbb",
  expert: "tok-expert-cccccccccccccccc",
  demo: "tok-demo-dddddddddddddddd",
};
const CLIENT_A = "11111111-1111-4111-8111-111111111111";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

function seed(): FakeStore {
  const s = createStore({
    users: [
      { id: IDS.owner, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_A, email: "admin@yasamsistemi.com" },
      { id: IDS.admin2, role: "admin", active: true, is_super_admin: false, is_demo_account: false, tenant_id: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2", email: "admin2@x.z" },
      { id: IDS.expert, role: "expert", active: true, is_super_admin: false, is_demo_account: false, tenant_id: "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0", email: "uzman@x.z" },
      { id: IDS.demo, role: "expert", active: true, is_super_admin: false, is_demo_account: true, tenant_id: "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0", email: "demo@x.z" },
    ],
    clients: [{ id: CLIENT_A, tenant_id: TENANT_A, ad: "Ali", soyad: "Yılmaz" }],
  });
  for (const k of Object.keys(TOK) as (keyof typeof TOK)[]) s.sessions.set(TOK[k], IDS[k]);
  return s;
}

let store = seed();
let roxyHits = 0;
const roxyHeaderKeys: string[] = [];
const restore = installFetchShim({
  store: new Proxy({} as FakeStore, { get: (_t, p) => (store as unknown as Record<string | symbol, unknown>)[p], set: (_t, p, v) => ((store as unknown as Record<string | symbol, unknown>)[p] = v, true) }),
  supabaseUrl: SUPA,
  roxyBase: ROXY_BASE,
  roxy: ({ url, headers, body }) => {
    roxyHits += 1;
    roxyHeaderKeys.push(headers.get("x-api-key") ?? "");
    const path = new URL(url).pathname.replace(/^\/api\/v2/, "");
    roxyEndpoints.push(path);
    assert.equal(new URL(url).searchParams.get("lang"), "tr", `lang=tr yok: ${url}`);
    if (GOLDEN3[path]) {
      const r = structuredClone(GOLDEN3[path]) as Record<string, unknown>;
      if (path === "/forecast/transits") r.events = (r.events as { date: string }[]).filter((e) => e.date >= String(body.startDate) && e.date <= String(body.endDate));
      return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    assert.ok(url.startsWith(`${ROXY_BASE}/astrology/natal-chart?lang=tr`), `beklenmeyen Roxy URL: ${url}`);
    if (roxyRawOverride) return new Response(JSON.stringify(roxyRawOverride), { status: 200, headers: { "Content-Type": "application/json" } });
    const raw = structuredClone(FIXTURE);
    raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
    raw.houseSystem = body.houseSystem;
    return new Response(JSON.stringify(raw), { status: 200, headers: { "Content-Type": "application/json" } });
  },
});

type Who = "anon" | "owner" | "admin2" | "expert" | "demo" | "spoof";
function headersFor(who: Who): Record<string, string> {
  if (who === "anon") return {};
  if (who === "spoof") return { "x-admin-id": IDS.owner, "x-session-token": TOK.expert };
  return { "x-admin-id": IDS[who], "x-session-token": TOK[who] };
}

function req(path: string, who: Who, method = "GET", body?: unknown): NextRequest {
  const h: Record<string, string> = { ...headersFor(who) };
  if (body !== undefined) h["Content-Type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

const allBodies: string[] = [];
async function call(res: Promise<Response>): Promise<{ status: number; json: Record<string, unknown>; text: string; headers: Headers }> {
  const r = await res;
  const text = await r.text();
  allBodies.push(text, JSON.stringify([...r.headers.entries()]));
  return { status: r.status, json: JSON.parse(text), text, headers: r.headers };
}

async function main() {
  const access = await import("@/app/api/admin/astroloji/access/route");
  const profiles = await import("@/app/api/admin/astroloji/profiles/route");
  const profile = await import("@/app/api/admin/astroloji/profiles/[id]/route");
  const revisions = await import("@/app/api/admin/astroloji/profiles/[id]/revisions/route");
  const plan = await import("@/app/api/admin/astroloji/engine/plan/route");
  const run = await import("@/app/api/admin/astroloji/engine/run/route");
  const viewRoute = await import("@/app/api/admin/astroloji/engine/view/route");
  const result = await import("@/app/api/admin/astroloji/results/[id]/route");
  const kbList = await import("@/app/api/admin/astroloji/kb/route");
  const kbItem = await import("@/app/api/admin/astroloji/kb/[id]/route");
  const workspace = await import("@/app/api/admin/astroloji/workspace/route");
  const notes = await import("@/app/api/admin/astroloji/notes/route");
  const analyses = await import("@/app/api/admin/astroloji/analyses/route");
  const analysesPreview = await import("@/app/api/admin/astroloji/analyses/preview/route");
  const analysisItem = await import("@/app/api/admin/astroloji/analyses/[id]/route");
  const unmapped = await import("@/app/api/admin/astroloji/unmapped/route");

  const PID = "12121212-1212-4121-8121-121212121212";
  const ctxP = (id: string) => ({ params: Promise.resolve({ id }) });
  const profileBody = { label: "Ali — natal", clientId: CLIENT_A, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" };
  const runBody = (pid: string, extra: Record<string, unknown> = {}) => ({ profileId: pid, selections: [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }], ...extra });

  const ROUTES: { name: string; exec: (who: Who) => Promise<Response> }[] = [
    { name: "GET access", exec: (w) => access.GET(req("/api/admin/astroloji/access", w)) },
    { name: "GET profiles", exec: (w) => profiles.GET(req("/api/admin/astroloji/profiles", w)) },
    { name: "POST profiles", exec: (w) => profiles.POST(req("/api/admin/astroloji/profiles", w, "POST", profileBody)) },
    { name: "GET profiles/[id]", exec: (w) => profile.GET(req(`/api/admin/astroloji/profiles/${PID}`, w), ctxP(PID)) },
    { name: "POST revisions", exec: (w) => revisions.POST(req(`/api/admin/astroloji/profiles/${PID}/revisions`, w, "POST", { ...profileBody, expectedRevision: 1 }), ctxP(PID)) },
    { name: "POST engine/plan", exec: (w) => plan.POST(req("/api/admin/astroloji/engine/plan", w, "POST", runBody(PID))) },
    { name: "POST engine/run", exec: (w) => run.POST(req("/api/admin/astroloji/engine/run", w, "POST", runBody(PID))) },
    { name: "POST engine/view", exec: (w) => viewRoute.POST(req("/api/admin/astroloji/engine/view", w, "POST", runBody(PID))) },
    { name: "GET results/[id]", exec: (w) => result.GET(req(`/api/admin/astroloji/results/${PID}`, w), ctxP(PID)) },
    // Aşama 2
    { name: "GET kb", exec: (w) => kbList.GET(req("/api/admin/astroloji/kb", w)) },
    { name: "POST kb", exec: (w) => kbList.POST(req("/api/admin/astroloji/kb", w, "POST", { tradition: "western", topicKey: "planet_in_house:saturn:7", title: "t", body: "b" })) },
    { name: "GET kb/[id]", exec: (w) => kbItem.GET(req(`/api/admin/astroloji/kb/${PID}`, w), ctxP(PID)) },
    { name: "PATCH kb/[id]", exec: (w) => kbItem.PATCH(req(`/api/admin/astroloji/kb/${PID}`, w, "PATCH", { expectedRevision: 1, tradition: "western", topicKey: "planet_in_house:saturn:7", title: "t", body: "b" }), ctxP(PID)) },
    { name: "DELETE kb/[id]", exec: (w) => kbItem.DELETE(req(`/api/admin/astroloji/kb/${PID}?expectedRevision=1`, w, "DELETE"), ctxP(PID)) },
    { name: "GET workspace", exec: (w) => workspace.GET(req(`/api/admin/astroloji/workspace?profileId=${PID}&revision=1&resultId=${PID}`, w)) },
    { name: "POST workspace", exec: (w) => workspace.POST(req("/api/admin/astroloji/workspace", w, "POST", { profileId: PID, revision: 1, technique: "western.transit", options: { atUtc: "2026-10-07T09:00" } })) },
    { name: "PUT notes", exec: (w) => notes.PUT(req("/api/admin/astroloji/notes", w, "PUT", { profileId: PID, sectionKey: "overall", body: "x", expectedRevision: null })) },
    { name: "GET analyses", exec: (w) => analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${PID}`, w)) },
    { name: "POST analyses", exec: (w) => analyses.POST(req("/api/admin/astroloji/analyses", w, "POST", { profileId: PID, revision: 1, resultId: PID, saveRequestId: PID })) },
    { name: "POST analyses/preview", exec: (w) => analysesPreview.POST(req("/api/admin/astroloji/analyses/preview", w, "POST", { profileId: PID, revision: 1, resultId: PID })) },
    { name: "GET analyses/[id]", exec: (w) => analysisItem.GET(req(`/api/admin/astroloji/analyses/${PID}`, w), ctxP(PID)) },
    { name: "GET unmapped", exec: (w) => unmapped.GET(req("/api/admin/astroloji/unmapped", w)) },
    { name: "PATCH unmapped", exec: (w) => unmapped.PATCH(req("/api/admin/astroloji/unmapped", w, "PATCH", { id: PID, classification: "technical" })) },
  ];

  const NOT_FOUND = JSON.stringify({ ok: false, error: "Bulunamadı." });
  const astroWrites = () => store.log.filter((l) => l.table.startsWith("astro_") && l.op !== "select").length + store.log.filter((l) => l.table.startsWith("rpc:astro_")).length;

  const captured: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => captured.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));

  try {
    // ─── 1) Erişim matrisi: owner olmayan HERKES → aynı 404 ─────────────────
    for (const who of ["anon", "expert", "demo", "admin2", "spoof"] as Who[]) {
      await t(`matris: ${who} → ${ROUTES.length} uçta da 404 (aynı gövde, no-store), Roxy/yazım yok`, async () => {
        store = seed();
        const hits0 = roxyHits;
        for (const r of ROUTES) {
          const res = await call(r.exec(who));
          assert.equal(res.status, 404, `${r.name}: ${res.status} ${res.text.slice(0, 120)}`);
          assert.equal(res.text, NOT_FOUND, `${r.name}: gövde farklı`);
          assert.equal(res.headers.get("cache-control"), "no-store", `${r.name}: no-store yok`);
        }
        assert.equal(roxyHits, hits0, "Roxy çağrıldı");
        assert.equal(astroWrites(), 0, "astro tablosuna yazım/RPC");
      });
    }

    await t("matris: pasif owner (active=false) → 404", async () => {
      store = seed();
      store.tables.users.find((u) => u.id === IDS.owner)!.active = false;
      for (const r of ROUTES) assert.equal((await call(r.exec("owner"))).status, 404, r.name);
    });

    await t("matris: demo bayraklı owner → 404", async () => {
      store = seed();
      store.tables.users.find((u) => u.id === IDS.owner)!.is_demo_account = true;
      for (const r of ROUTES) assert.equal((await call(r.exec("owner"))).status, 404, r.name);
    });

    await t("matris: is_super_admin kolonu okunamıyor → owner bile 404 (e-posta fallback YOK)", async () => {
      store = seed();
      store.failSelect = (table, select) => (table === "users" && /is_super_admin/.test(select) ? { code: "42703", message: "column users.is_super_admin does not exist" } : null);
      for (const r of ROUTES) assert.equal((await call(r.exec("owner"))).status, 404, r.name);
    });

    await t("matris: kill switch kapalı (eksik / 'TRUE' / '1') → owner dahil 404, DB'ye gidilmez", async () => {
      for (const v of [undefined, "TRUE", "1", "false"]) {
        store = seed();
        if (v === undefined) delete process.env.ASTROLOGY_MODULE_ENABLED;
        else process.env.ASTROLOGY_MODULE_ENABLED = v;
        for (const r of ROUTES) assert.equal((await call(r.exec("owner"))).status, 404, `${r.name} (${v})`);
        assert.equal(store.log.length, 0, "kill switch kapalıyken DB sorgusu yapıldı");
      }
      process.env.ASTROLOGY_MODULE_ENABLED = "true";
    });

    // ─── 2) Owner uçtan uca ──────────────────────────────────────────────────
    store = seed();
    let pid = "";
    let resultId = "";
    await t("owner: access 200 (4 yetki), profil oluştur 201, liste + detay", async () => {
      const a = await call(access.GET(req("/api/admin/astroloji/access", "owner")));
      assert.equal(a.status, 200);
      assert.deepEqual(a.json.entitlements, { module: true, engine: true, knowledgeBank: true, providerInterpretations: true });
      assert.equal(a.json.providerConfigured, true);
      const c = await call(profiles.POST(req("/api/admin/astroloji/profiles", "owner", "POST", profileBody)));
      assert.equal(c.status, 201, c.text.slice(0, 200));
      pid = (c.json.profile as { id: string }).id;
      const l = await call(profiles.GET(req("/api/admin/astroloji/profiles", "owner")));
      assert.equal(((l.json.profiles as { clientName: string }[])[0]).clientName, "Ali Yılmaz");
      const d = await call(profile.GET(req(`/api/admin/astroloji/profiles/${pid}`, "owner"), ctxP(pid)));
      assert.equal(d.status, 200);
    });

    await t("owner: plan (1 yeni) → run (1 Roxy, anahtar yalnız başlıkta) → tekrar run (0 Roxy) → GET (0 Roxy)", async () => {
      const p = await call(plan.POST(req("/api/admin/astroloji/engine/plan", "owner", "POST", runBody(pid))));
      assert.equal((p.json.plan as { newRequestCount: number }).newRequestCount, 1);
      assert.equal(roxyHits, 0);
      const r1 = await call(run.POST(req("/api/admin/astroloji/engine/run", "owner", "POST", runBody(pid))));
      assert.equal(r1.status, 200, r1.text.slice(0, 300));
      assert.equal(roxyHits, 1);
      assert.deepEqual(roxyHeaderKeys, [API_KEY]);
      assert.ok(r1.text.includes("[RXN-sun-summary]"), "owner yorum görmeli");
      resultId = ((r1.json.results as { view: { id: string } }[])[0]).view.id;
      const r2 = await call(run.POST(req("/api/admin/astroloji/engine/run", "owner", "POST", runBody(pid))));
      assert.equal(roxyHits, 1, "kayıtlı sonuç → 0 yeni Roxy isteği");
      assert.deepEqual(r2.json.executed, { newResults: 0, cachedResults: 1, providerAttempts: 0 });
      const g = await call(result.GET(req(`/api/admin/astroloji/results/${resultId}`, "owner"), ctxP(resultId)));
      assert.equal(g.status, 200);
      assert.equal(roxyHits, 1);
    });

    await t("owner önizleme (?previewNoInterp=1): run + GET yanıtında sağlayıcı yorumu YOK", async () => {
      const r = await call(run.POST(req("/api/admin/astroloji/engine/run?previewNoInterp=1", "owner", "POST", runBody(pid))));
      const g = await call(result.GET(req(`/api/admin/astroloji/results/${resultId}?previewNoInterp=1`, "owner"), ctxP(resultId)));
      for (const x of [r, g]) {
        assert.equal(x.status, 200);
        for (const m of ["[RXN-", "RXK-", "[RXU-"]) assert.ok(!x.text.includes(m), `önizlemede sızıntı: ${m}`);
        assert.ok(x.text.includes("owner_preview_hidden"));
      }
    });

    await t("owner: revizyon (rektifikasyon) → yeni hesap gerekir; eski revizyon 0 istekle açılır", async () => {
      const rv = await call(revisions.POST(req(`/api/admin/astroloji/profiles/${pid}/revisions`, "owner", "POST", { ...profileBody, birthTime: "14:45", timeAccuracy: "rectified", expectedRevision: 1, changeNote: "rektifikasyon" }), ctxP(pid)));
      assert.equal(rv.status, 200, rv.text.slice(0, 200));
      const p = await call(plan.POST(req("/api/admin/astroloji/engine/plan", "owner", "POST", runBody(pid))));
      assert.equal((p.json.plan as { newRequestCount: number }).newRequestCount, 1);
      const old = await call(run.POST(req("/api/admin/astroloji/engine/run", "owner", "POST", runBody(pid, { revision: 1 }))));
      assert.equal(old.status, 200);
      assert.equal(roxyHits, 1);
    });

    await t("sızıntı: hiçbir yanıtta/başlıkta API anahtarı, ham yanıt, bilinmeyen alan metni veya input_hash yok", async () => {
      const hash = String(store.tables.astro_provider_results[0].input_hash);
      const all = allBodies.join("\n");
      for (const bad of [API_KEY, "raw_response", "[RXU-", hash, "fake-service-role-key"]) assert.ok(!all.includes(bad), `yanıtta sızıntı: ${bad.slice(0, 20)}`);
      const sel = store.log.filter((l) => l.table === "astro_provider_results" && l.op === "select");
      assert.ok(sel.length > 0 && sel.every((l) => !/raw_response/.test(l.select) && l.select !== "*"), "raw_response okundu");
    });

    await t("log: konsol loglarında anahtar / doğum verisi / koordinat / danışan adı yok", async () => {
      const all = captured.join("\n");
      for (const bad of [API_KEY, "1990-07-15", "41.0082", "28.9784", "Yılmaz", "İstanbul", "[RXU-"]) assert.ok(!all.includes(bad), `log sızıntısı: ${bad}`);
    });
    await t("aşama 2 (HTTP): KB ekle → hesapla → çalışma alanı eşleşmesi → not → özet → kaydet (idempotent) → aç = 0 Roxy; önizlemede yorum yok", async () => {
      store = seed();
      roxyRawOverride = GOLDEN;
      const sat = (GOLDEN.planets as { name: string; house: number }[]).find((x) => x.name === "Saturn")!;
      const satKey = `planet_in_house:saturn:${sat.house}`;
      const c = await call(profiles.POST(req("/api/admin/astroloji/profiles", "owner", "POST", profileBody)));
      const gpid = (c.json.profile as { id: string }).id;
      const k = await call(kbList.POST(req("/api/admin/astroloji/kb", "owner", "POST", { tradition: "western", topicKey: satKey, title: "Satürn", body: "KB notum A", tags: ["test"] })));
      assert.equal(k.status, 201, k.text);
      const hits0 = roxyHits;
      const r = await call(run.POST(req("/api/admin/astroloji/engine/run", "owner", "POST", runBody(gpid))));
      const rid = ((r.json.results as { view: { id: string } }[])[0]).view.id;
      assert.equal(roxyHits - hits0, 1);
      const w = await call(workspace.GET(req(`/api/admin/astroloji/workspace?profileId=${gpid}&revision=1&resultId=${rid}`, "owner")));
      assert.deepEqual((w.json.kbMatches as { topicKey: string }[]).map((x) => x.topicKey), [satKey]);
      const n = await call(notes.PUT(req("/api/admin/astroloji/notes", "owner", "PUT", { profileId: gpid, sectionKey: "overall", body: "Ali yorumum", expectedRevision: null })));
      assert.equal(n.status, 201, n.text);
      const pv = await call(analysesPreview.POST(req("/api/admin/astroloji/analyses/preview", "owner", "POST", { profileId: gpid, revision: 1, resultId: rid, includeProviderInterp: true })));
      assert.equal((pv.json.summary as { kbMatchCount: number }).kbMatchCount, 1);
      const reqId = "5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a";
      const sv = await call(analyses.POST(req("/api/admin/astroloji/analyses", "owner", "POST", { profileId: gpid, revision: 1, resultId: rid, includeProviderInterp: true, saveRequestId: reqId })));
      assert.equal(sv.status, 201, sv.text);
      const sv2 = await call(analyses.POST(req("/api/admin/astroloji/analyses", "owner", "POST", { profileId: gpid, revision: 1, resultId: rid, includeProviderInterp: true, saveRequestId: reqId })));
      assert.equal(sv2.json.reused, true);
      const aid = sv.json.analysisId as string;
      const hits1 = roxyHits;
      const open = await call(analysisItem.GET(req(`/api/admin/astroloji/analyses/${aid}`, "owner"), ctxP(aid)));
      const openPrev = await call(analysisItem.GET(req(`/api/admin/astroloji/analyses/${aid}?previewNoInterp=1`, "owner"), ctxP(aid)));
      const list = await call(analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${gpid}`, "owner")));
      roxyRawOverride = null;
      assert.equal(roxyHits, hits1, "kayıtlı analizi açmak Roxy çağırdı");
      assert.equal((list.json.analyses as unknown[]).length, 1);
      const sum = (GOLDEN.planets as { interpretation: { summary: string } }[])[0].interpretation.summary;
      assert.ok(open.text.includes(JSON.stringify(sum).slice(1, -1)), "owner: yorum görünmeli");
      assert.ok(!openPrev.text.includes(JSON.stringify(sum).slice(1, -1)), "önizleme: yorum sızdı");
      for (const x of [open, openPrev]) {
        assert.ok(x.text.includes("KB notum A") && x.text.includes("Ali yorumum"), "uzman verisi eksik");
        for (const bad of ["raw_response", "aspectInterpretation", "input_hash", API_KEY]) assert.ok(!x.text.includes(bad), bad);
      }
    });

    await t("golden (HTTP): gerçek yanıtla run → owner yorum görür; ?previewNoInterp=1 → hiçbir anlatı/ham alan yok, teknik aynı; tekrar 0 istek", async () => {
      store = seed();
      roxyRawOverride = GOLDEN;
      const hits0 = roxyHits;
      const c = await call(profiles.POST(req("/api/admin/astroloji/profiles", "owner", "POST", profileBody)));
      const gpid = (c.json.profile as { id: string }).id;
      const a = await call(run.POST(req("/api/admin/astroloji/engine/run", "owner", "POST", runBody(gpid))));
      const b = await call(run.POST(req("/api/admin/astroloji/engine/run?previewNoInterp=1", "owner", "POST", runBody(gpid))));
      roxyRawOverride = null;
      assert.equal(a.status, 200, a.text.slice(0, 200));
      assert.equal(roxyHits - hits0, 1, "yalnız ilk run sağlayıcıya gitmeli");
      const sum = (GOLDEN.planets as { interpretation: { summary: string } }[])[0].interpretation.summary;
      assert.ok(a.text.includes(JSON.stringify(sum).slice(1, -1)), "A: yorum görünmeli");
      const narr: string[] = [];
      for (const pl of GOLDEN.planets) narr.push(pl.interpretation?.summary, pl.interpretation?.detailed, ...(pl.interpretation?.keywords ?? []));
      for (const as of GOLDEN.aspects) narr.push(as.aspectInterpretation?.summary, ...(as.aspectInterpretation?.keywords ?? []));
      for (const pt of GOLDEN.patterns) narr.push(pt.interpretation, pt.name, pt.interpretationKey);
      narr.push(GOLDEN.aspectsInterpretation.summary);
      for (const x of narr.filter((v): v is string => typeof v === "string" && v.length >= 6)) {
        assert.ok(!b.text.includes(JSON.stringify(x).slice(1, -1)), `B: anlatı sızdı → ${x.slice(0, 30)}`);
      }
      for (const k of ["aspectInterpretation", "interpretationKey", "nameLocalized", "raw_response", "Black Moon Lilith"]) assert.ok(!b.text.includes(k), `B: ${k}`);
      const tech = (r: { json: Record<string, unknown> }) => JSON.stringify((r.json.results as { view: { technical: unknown } }[])[0].view.technical);
      assert.equal(tech(b), tech(a), "teknik veri A/B arasında değişti");
      assert.deepEqual(b.json.executed, { newResults: 0, cachedResults: 1, providerAttempts: 0 });
    });
    await t("aşama 3 (HTTP): A+B profil → transit + forecast 180g + sinastri + composite planla/çalıştır → önizlemede anlatı yok → çalışma alanı → bağlamlı not → kaydet → aç = 0 Roxy", async () => {
      store = seed();
      const hits0 = roxyHits;
      const ep0 = roxyEndpoints.length;
      const a = await call(profiles.POST(req("/api/admin/astroloji/profiles", "owner", "POST", profileBody)));
      const pa = (a.json.profile as { id: string }).id;
      const b = await call(profiles.POST(req("/api/admin/astroloji/profiles", "owner", "POST", { label: "Sentetik B", birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-06-ankara" })));
      assert.equal(b.status, 201, b.text);
      const pb = (b.json.profile as { id: string }).id;
      const sels = [
        { technique: "western.transit", options: { atUtc: "2026-10-07T09:00", nodeType: "true" } },
        { technique: "western.forecast", options: { startDate: "2026-10-01", days: 180 } },
        { technique: "western.synastry", options: { partnerProfileId: pb, houseSystem: "placidus", nodeType: "true" } },
        { technique: "western.composite", options: { partnerProfileId: pb, houseSystem: "placidus", nodeType: "true" } },
      ];
      const pl = await call(plan.POST(req("/api/admin/astroloji/engine/plan", "owner", "POST", { profileId: pa, selections: sels })));
      const sum = pl.json.plan as { selectedCount: number; newRequestCount: number; selections: { newRequests: number }[] };
      assert.deepEqual([sum.selectedCount, sum.newRequestCount, sum.selections.map((x) => x.newRequests).join(",")], [4, 5, "1,2,1,1"]);
      assert.equal(roxyHits, hits0, "plan Roxy çağırdı");
      const prev = await call(run.POST(req("/api/admin/astroloji/engine/run?previewNoInterp=1", "owner", "POST", { profileId: pa, selections: sels })));
      assert.equal(prev.status, 200, prev.text.slice(0, 300));
      assert.equal(roxyHits - hits0, 5);
      assert.deepEqual(roxyEndpoints.slice(ep0).sort(), ["/astrology/composite-chart", "/astrology/synastry", "/astrology/transits", "/forecast/transits", "/forecast/transits"]);
      const narr: string[] = [];
      for (const r of Object.values(GOLDEN3)) {
        const walk = (v: unknown) => {
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === "object") Object.values(v).forEach(walk);
          else if (typeof v === "string" && v.length > 40) narr.push(v);
        };
        walk(r);
      }
      for (const x of narr) assert.ok(!prev.text.includes(JSON.stringify(x).slice(1, -1)), `önizlemede anlatı: ${x.slice(0, 30)}`);
      for (const k of ["transitAspects", "interAspects", "compositePlanets", "raw_response", "input_hash"]) assert.ok(!prev.text.includes(k), k);
      const full = await call(run.POST(req("/api/admin/astroloji/engine/run", "owner", "POST", { profileId: pa, selections: sels })));
      assert.equal(roxyHits - hits0, 5, "ikinci run önbellekten gelmeli");
      assert.ok(narr.some((x) => full.text.includes(JSON.stringify(x).slice(1, -1))), "owner yorumu görmeli");
      // Yalnız-önbellek görünüm ucu: 0 Roxy; önizlemede anlatı yok; hesaplanmamış seçim NOT_COMPUTED.
      const vw = await call(viewRoute.POST(req("/api/admin/astroloji/engine/view?previewNoInterp=1", "owner", "POST", { profileId: pa, selections: [...sels, { technique: "western.transit", options: { atUtc: "2031-01-01T00:00" } }] })));
      assert.equal(vw.status, 200, vw.text.slice(0, 200));
      assert.equal(roxyHits - hits0, 5, "görünüm ucu Roxy çağırdı");
      const vr = vw.json.results as { ok: boolean; code?: string }[];
      assert.deepEqual(vr.map((x) => x.ok), [true, true, true, true, false]);
      assert.equal(vr[4].code, "NOT_COMPUTED");
      for (const x of narr) assert.ok(!vw.text.includes(JSON.stringify(x).slice(1, -1)), "görünüm önizlemesinde anlatı");
      const syn = sels[2];
      const ws = await call(workspace.POST(req("/api/admin/astroloji/workspace", "owner", "POST", { profileId: pa, revision: 1, ...syn })));
      assert.equal(ws.status, 200, ws.text.slice(0, 200));
      assert.equal(ws.json.contextKey, pb);
      const note = await call(notes.PUT(req("/api/admin/astroloji/notes", "owner", "PUT", { profileId: pa, technique: syn.technique, contextKey: pb, sectionKey: "overall", body: "Sinastri yorumum", expectedRevision: null })));
      assert.equal(note.status, 201, note.text);
      const wrong = await call(notes.PUT(req("/api/admin/astroloji/notes", "owner", "PUT", { profileId: pa, technique: syn.technique, contextKey: pb, sectionKey: "planet_in_house:saturn:7", body: "x", expectedRevision: null })));
      assert.equal(wrong.status, 400, "natal bölümü sinastri notuna yazıldı");
      const reqId = "6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b";
      const sv = await call(analyses.POST(req("/api/admin/astroloji/analyses", "owner", "POST", { profileId: pa, revision: 1, ...syn, includeProviderInterp: true, saveRequestId: reqId })));
      assert.equal(sv.status, 201, sv.text);
      const aid = sv.json.analysisId as string;
      const hits1 = roxyHits;
      const open = await call(analysisItem.GET(req(`/api/admin/astroloji/analyses/${aid}`, "owner"), ctxP(aid)));
      const openPrev = await call(analysisItem.GET(req(`/api/admin/astroloji/analyses/${aid}?previewNoInterp=1`, "owner"), ctxP(aid)));
      assert.equal(roxyHits, hits1, "kayıtlı analizi açmak Roxy çağırdı");
      const an = open.json.analysis as { technique: string; profile: { partner: { label: string } }; notes: { body: string }[] };
      assert.deepEqual([an.technique, an.profile.partner.label, an.notes[0].body], ["western.synastry", "Sentetik B", "Sinastri yorumum"]);
      for (const x of narr) assert.ok(!openPrev.text.includes(JSON.stringify(x).slice(1, -1)), "kayıtlı analiz önizlemesinde anlatı");
      // Başka uzman (owner değil) bu analiz ve çalışma alanı için 404.
      assert.equal((await call(analysisItem.GET(req(`/api/admin/astroloji/analyses/${aid}`, "admin2"), ctxP(aid)))).status, 404);
    });

    await t("log (tüm koşu, aşama 3 dahil): anahtar / iki kişinin doğum verisi / koordinat / ad yok; yanıtlarda anahtar yok", async () => {
      const logs = captured.join("\n");
      for (const bad of [API_KEY, "1990-07-15", "1988-03-21", "41.0082", "39.9334", "32.8597", "Sentetik B", "Yılmaz"]) assert.ok(!logs.includes(bad), `log sızıntısı: ${bad}`);
      assert.ok(!allBodies.join("\n").includes(API_KEY), "yanıtta anahtar");
    });
  } finally {
    console.error = origErr;
    restore();
  }

  console.log(`\nastrology routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("routes harness çöktü:", e);
  process.exit(1);
});
