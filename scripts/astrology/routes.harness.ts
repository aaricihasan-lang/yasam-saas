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
  const result = await import("@/app/api/admin/astroloji/results/[id]/route");

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
    { name: "GET results/[id]", exec: (w) => result.GET(req(`/api/admin/astroloji/results/${PID}`, w), ctxP(PID)) },
  ];

  const NOT_FOUND = JSON.stringify({ ok: false, error: "Bulunamadı." });
  const astroWrites = () => store.log.filter((l) => l.table.startsWith("astro_") && l.op !== "select").length + store.log.filter((l) => l.table.startsWith("rpc:astro_")).length;

  const captured: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => captured.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));

  try {
    // ─── 1) Erişim matrisi: owner olmayan HERKES → aynı 404 ─────────────────
    for (const who of ["anon", "expert", "demo", "admin2", "spoof"] as Who[]) {
      await t(`matris: ${who} → 8 uçta da 404 (aynı gövde, no-store), Roxy/yazım yok`, async () => {
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
