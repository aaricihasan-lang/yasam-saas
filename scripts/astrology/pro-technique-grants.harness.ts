/**
 * GÖKYÜZÜ ATLASI — TEKNİK BAZLI YETKİLENDİRME (owner kararı 2026-11-03; migration 20271230000000).
 *
 * A) Katalog: 48 izin = motor teknikleri (44) + Batı Horary + 3 Gökyüzü Aracı; motor / arayüz listeleriyle birebir.
 * B) Saf çözüm: NULL / bozuk → hiçbiri; "all" → katalog; "list" → yalnız katalogdakiler; doğrulama (boş seçim reddi).
 * C) GERÇEK route handler'ları (uzman + admin yüzeyi) + GERÇEK verifyUserRequest / requireModuleAccess / verifyAdminRequest;
 *    fetch yalnız sahte PostgREST'e ve sahte Roxy'ye gider. Roxy isteği SAYILIR: kapalı teknik için 0 istek.
 *    Kapsam: plan / çalıştırma / önbellek görünümü / kayıtlı sonuç (results/[id]) / ortak birim (Klasik Asalet → Natal birimi) /
 *    kayıtlı analiz kilidi (liste + aç + rapor + toplu rapor) / not / Horary / Gökyüzü Araçları / admin kayıt ucu
 *    (boş seçim, bilinmeyen anahtar, uzman token'ı, iptal = istek yok) / izin kaldırılınca anında red / modül kapalıyken seçim korunur.
 * SENTETİK kişiler; gerçek DB / Roxy YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-technique-grants.harness.ts
 * CI: `astro-pro` işi (scripts/astrology/pro-run-all.mjs pro-*.harness.ts dosyalarını otomatik keşfeder).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createStore, installFetchShim, type FakeStore } from "./fakeSupabase";
import { hasTechniqueEntitlement, resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import {
  ASTRO_GRANT_ITEMS,
  ASTRO_GRANT_KEYS,
  categoryState,
  readTechniqueGrants,
  resolveTechniqueGrants,
  validateTechniqueGrants,
} from "@/lib/astrology/access/techniqueGrants";
import { TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-techgrants";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));

const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = {
  owner: "7e000000-0000-4000-8000-000000000001",
  admin2: "7e000000-0000-4000-8000-000000000002",
  exAll: "7e000000-0000-4000-8000-000000000003",
  exNatal: "7e000000-0000-4000-8000-000000000004",
  exDign: "7e000000-0000-4000-8000-000000000005",
  exNone: "7e000000-0000-4000-8000-000000000006",
  exOff: "7e000000-0000-4000-8000-000000000007",
  exSky: "7e000000-0000-4000-8000-000000000008",
  exNew: "7e000000-0000-4000-8000-000000000009",
};
type Who = keyof typeof U;
const tok = (w: Who) => `tok-techgrants-${w}-xxxxxxxxxxxxxx`;

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

const expert = (id: string, perms: Record<string, unknown>, grants: unknown) => ({
  id, role: "expert", active: true, approval_status: "approved", package_type: "premium", is_super_admin: false, is_demo_account: false,
  tenant_id: TA, email: `${id.slice(-2)}@sentetik.test`, module_permissions: perms, astrology_technique_grants: grants,
});
const store: FakeStore = createStore({
  users: [
    { id: U.owner, role: "admin", active: true, approval_status: "approved", is_super_admin: true, is_demo_account: false, tenant_id: TA, email: "owner@sentetik.test", module_permissions: {} },
    { id: U.admin2, role: "admin", active: true, approval_status: "approved", is_super_admin: false, is_demo_account: false, tenant_id: TA, email: "admin2@sentetik.test", module_permissions: {} },
    expert(U.exAll, { astrology: true }, { mode: "all" }),
    expert(U.exNatal, { astrology: true }, { mode: "list", techniques: ["western.natal"] }),
    expert(U.exDign, { astrology: true }, { mode: "list", techniques: ["western.classical_dignities"] }),
    expert(U.exNone, { astrology: true }, null),
    expert(U.exOff, { astrology: false, numerology: true }, { mode: "all" }),
    expert(U.exSky, { astrology: true }, { mode: "list", techniques: ["sky.lunations"] }),
    expert(U.exNew, { numerology: true }, null),
  ],
});
for (const w of Object.keys(U) as Who[]) store.sessions.set(tok(w), U[w]);
const userRow = (id: string) => store.tables.users.find((u) => u.id === id)!;

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

function req(surface: "expert" | "admin" | "users", path: string, who: Who, method = "GET", body?: unknown): NextRequest {
  const base = surface === "admin" ? "/api/admin/astroloji" : surface === "users" ? "/api/admin/users" : "/api/astroloji";
  const h: Record<string, string> = { [surface === "expert" ? "x-user-id" : "x-admin-id"]: U[who], "x-session-token": tok(who) };
  if (body !== undefined) h["Content-Type"] = "application/json";
  return new NextRequest(`http://localhost${base}${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}
async function call(res: Promise<Response>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const r = await res;
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return { status: r.status, json: {}, text: `[${ct}]` };
  const text = await r.text();
  return { status: r.status, json: JSON.parse(text), text };
}

async function main() {
  // ─── A) Katalog ─────────────────────────────────────────────────────────────
  await t("A1 katalog: 48 benzersiz izin (Batı 19 · Vedik 19 · KP 6 · Diğer 4) — 44 + 1 + 3", () => {
    assert.equal(ASTRO_GRANT_KEYS.length, 48);
    assert.equal(new Set(ASTRO_GRANT_KEYS).size, 48);
    const by = (c: string) => ASTRO_GRANT_ITEMS.filter((i) => i.category === c).length;
    assert.deepEqual([by("western"), by("vedic"), by("kp"), by("other")], [19, 19, 6, 4]);
    for (const i of ASTRO_GRANT_ITEMS) assert.ok(i.label.trim().length > 1, i.key);
  });
  await t("A2 yayım kuralı: motor kaydındaki HER teknik katalogda; katalogdaki her motor anahtarı motorda; Atlas arayüz listesi aynı küme", () => {
    const engine = new Set<string>(TECHNIQUE_IDS);
    const other = ["western.horary_lilly", "sky.ephemeris", "sky.lunations", "sky.degree_crossings"];
    assert.equal(TECHNIQUE_IDS.length, 44);
    assert.deepEqual([...engine].filter((k) => !ASTRO_GRANT_KEYS.includes(k)), [], "katalogda olmayan motor tekniği (owner yayım onayı gerekir)");
    assert.deepEqual(ASTRO_GRANT_KEYS.filter((k) => !engine.has(k) && !other.includes(k)), [], "motorda olmayan katalog anahtarı");
    assert.deepEqual([...UI_TECHNIQUES].sort(), [...TECHNIQUE_IDS].sort());
  });

  // ─── B) Saf çözüm ───────────────────────────────────────────────────────────
  await t("B1 resolveTechniqueGrants: NULL/bozuk → []; all → 48; list → katalog sırası, bilinmeyen atılır", () => {
    for (const bad of [null, undefined, "all", [], {}, { mode: "ALL" }, { mode: "list" }, { mode: "list", techniques: "western.natal" }]) assert.deepEqual(resolveTechniqueGrants(bad), [], JSON.stringify(bad));
    assert.equal(resolveTechniqueGrants({ mode: "all" }).length, 48);
    assert.deepEqual(resolveTechniqueGrants({ mode: "list", techniques: ["kp.chart", "western.natal", "western.yok", 5] }), ["western.natal", "kp.chart"]);
    assert.deepEqual(readTechniqueGrants({ mode: "list", techniques: ["sky.ephemeris", "x.y"] }), { mode: "list", techniques: ["sky.ephemeris"] });
    assert.equal(readTechniqueGrants("bozuk"), null);
  });
  await t("B2 validateTechniqueGrants: boş seçim EMPTY_SELECTION; bilinmeyen / tekrar / ek alan reddi; all yalnız {mode}", () => {
    assert.deepEqual(validateTechniqueGrants({ mode: "list", techniques: [] }), { ok: false, code: "EMPTY_SELECTION", error: "En az bir teknik seçmelisiniz." });
    assert.equal(validateTechniqueGrants({ mode: "list", techniques: ["western.yok"] }).ok, false);
    assert.equal(validateTechniqueGrants({ mode: "list", techniques: ["western.natal", "western.natal"] }).ok, false);
    assert.equal(validateTechniqueGrants({ mode: "list", techniques: ["western.natal"], extra: 1 }).ok, false);
    assert.equal(validateTechniqueGrants({ mode: "all", techniques: [] }).ok, false);
    assert.equal(validateTechniqueGrants(null).ok, false);
    assert.deepEqual(validateTechniqueGrants({ mode: "all" }), { ok: true, grants: { mode: "all" } });
    assert.deepEqual(validateTechniqueGrants({ mode: "list", techniques: ["kp.chart", "western.natal"] }), { ok: true, grants: { mode: "list", techniques: ["western.natal", "kp.chart"] } });
  });
  await t("B3 kategori kutusu üç durum: hiçbiri / bir kısmı / tamamı (Tümünü Seç'ten tek teknik kaldırılınca 'bir kısmı')", () => {
    const all = new Set(ASTRO_GRANT_KEYS);
    assert.equal(categoryState(all, "kp"), "all");
    all.delete("kp.horary");
    assert.equal(categoryState(all, "kp"), "some");
    assert.equal(categoryState(new Set(), "kp"), "none");
  });
  await t("B4 yetki çözümü: owner → 48; uzman modül açık + kayıt yok → 0; modül kapalı + 'all' → modül yok, 0; bayrak 'true' metni → kapalı", () => {
    const R = resolveAstrologyEntitlements;
    assert.equal(R({ isOwner: true }).techniques.length, 48);
    assert.deepEqual(R({ isOwner: false, role: "expert", flags: { astrology: true } }).techniques, []);
    assert.equal(R({ isOwner: false, role: "expert", flags: { astrology: true }, techniqueGrants: { mode: "all" } }).techniques.length, 48);
    const off = R({ isOwner: false, role: "expert", flags: { astrology: false }, techniqueGrants: { mode: "all" } });
    assert.deepEqual([off.module, off.techniques.length], [false, 0]);
    assert.equal(R({ isOwner: false, role: "expert", flags: { astrology: "true" }, techniqueGrants: { mode: "all" } }).module, false);
    assert.equal(R({ isOwner: false, role: "admin", flags: { astrology: true }, techniqueGrants: { mode: "all" } }).techniques.length, 0);
    assert.equal(hasTechniqueEntitlement({ techniques: ["western.natal"] }, "western.natal"), true);
    assert.equal(hasTechniqueEntitlement(undefined, "western.natal"), false);
    assert.equal(hasTechniqueEntitlement({} as never, "western.natal"), false);
  });

  // ─── C) Gerçek route'lar ────────────────────────────────────────────────────
  const X = {
    access: await import("@/app/api/astroloji/access/route"),
    profiles: await import("@/app/api/astroloji/profiles/route"),
    plan: await import("@/app/api/astroloji/engine/plan/route"),
    run: await import("@/app/api/astroloji/engine/run/route"),
    view: await import("@/app/api/astroloji/engine/view/route"),
    result: await import("@/app/api/astroloji/results/[id]/route"),
    analyses: await import("@/app/api/astroloji/analyses/route"),
    analysis: await import("@/app/api/astroloji/analyses/[id]/route"),
    analysisReport: await import("@/app/api/astroloji/analyses/[id]/report/route"),
    combined: await import("@/app/api/astroloji/analyses/report/route"),
    workspace: await import("@/app/api/astroloji/workspace/route"),
    notes: await import("@/app/api/astroloji/notes/route"),
    horary: await import("@/app/api/astroloji/horary/western/route"),
    horaryRecords: await import("@/app/api/astroloji/horary/western/records/route"),
    eph: await import("@/app/api/astroloji/efemeris/route"),
    ay: await import("@/app/api/astroloji/efemeris/ay/route"),
    derece: await import("@/app/api/astroloji/efemeris/derece/route"),
  };
  const A = { access: await import("@/app/api/admin/astroloji/access/route") };
  const G = await import("@/app/api/admin/users/[id]/astrology-techniques/route");
  const ctxP = (id: string) => ({ params: Promise.resolve({ id }) });
  const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
  const TRANSIT = { technique: "western.transit", options: { nodeType: "true", transitMoment: "now" } };
  const DIGN = { technique: "western.classical_dignities", options: {} };
  const birth = { birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" };
  const mk = async (who: Who, label: string) => {
    let r = await call(X.profiles.POST(req("expert", "/profiles", who, "POST", { label, clientId: null, ...birth })));
    if (r.status === 409 && r.json.code === "DUPLICATE_PROFILE") {
      const ids = (r.json.duplicates as { profileId: string }[]).map((d) => d.profileId);
      r = await call(X.profiles.POST(req("expert", "/profiles", who, "POST", { label, clientId: null, ...birth, confirmDifferentPerson: ids })));
    }
    assert.equal(r.status, 201, r.text);
    return (r.json.profile as { id: string }).id;
  };
  const techOf = async (who: Who, surface: "expert" | "admin" = "expert") => {
    const r = await call((surface === "admin" ? A.access : X.access).GET(req(surface, "/access", who)));
    return { status: r.status, techniques: ((r.json.entitlements as { techniques?: string[] } | undefined)?.techniques ?? null) as string[] | null };
  };

  const origErr = console.error;
  console.error = () => undefined;
  try {
    await t("C1 erişim yoklaması sunucu kararını taşır: all → 48 · liste → yalnız seçilen · kayıt yok → 0 · modül kapalı → 404 · owner (admin kabuğu) → 48", async () => {
      assert.deepEqual([(await techOf("exAll")).techniques?.length], [48]);
      assert.deepEqual((await techOf("exNatal")).techniques, ["western.natal"]);
      assert.deepEqual((await techOf("exNone")).techniques, []);
      assert.equal((await techOf("exOff")).status, 404);
      assert.equal((await techOf("owner", "admin")).techniques?.length, 48);
    });

    let pN = "";
    await t("C2 izinli teknik çalışır; kapalı teknik plan / çalıştırma / görünümde 403 ve Roxy'ye 0 istek; karışık seçim BÜTÜNÜYLE reddedilir", async () => {
      pN = await mk("exNatal", "Sentetik Natal");
      const h0 = roxyHits;
      const ok = await call(X.run.POST(req("expert", "/engine/run", "exNatal", "POST", { profileId: pN, selections: [NATAL] })));
      assert.equal(ok.status, 200, ok.text.slice(0, 200));
      assert.equal(roxyHits, h0 + 1);
      const h1 = roxyHits;
      for (const [label, r] of [
        ["run transit", X.run.POST(req("expert", "/engine/run", "exNatal", "POST", { profileId: pN, selections: [TRANSIT] }))],
        ["run karışık", X.run.POST(req("expert", "/engine/run", "exNatal", "POST", { profileId: pN, selections: [NATAL, TRANSIT] }))],
        ["plan transit", X.plan.POST(req("expert", "/engine/plan", "exNatal", "POST", { profileId: pN, selections: [TRANSIT] }))],
        ["view transit", X.view.POST(req("expert", "/engine/view", "exNatal", "POST", { profileId: pN, selections: [TRANSIT] }))],
        ["workspace transit", X.workspace.POST(req("expert", "/workspace", "exNatal", "POST", { profileId: pN, revision: 1, ...TRANSIT }))],
      ] as const) {
        const x = await call(r);
        assert.deepEqual([label, x.status, x.json.code], [label, 403, "TECHNIQUE_NOT_ENTITLED"], x.text.slice(0, 200));
      }
      assert.equal(roxyHits, h1, "kapalı teknik için sağlayıcı isteği oluştu");
    });

    await t("C3 kayıt yok (Astroloji açık, teknik seçilmemiş) → Natal bile 403; Roxy 0", async () => {
      const p = await mk("exNone", "Sentetik Yok");
      const h = roxyHits;
      const r = await call(X.run.POST(req("expert", "/engine/run", "exNone", "POST", { profileId: p, selections: [NATAL] })));
      assert.deepEqual([r.status, r.json.code], [403, "TECHNIQUE_NOT_ENTITLED"]);
      assert.equal(roxyHits, h);
    });

    await t("C4 ORTAK BİRİM: yalnız Klasik Asalet izni → Asalet çalışır (Natal birimi); ham Natal ne çalıştırma, ne önbellek görünümü, ne results/[id] ile açılır", async () => {
      const p = await mk("exDign", "Sentetik Asalet");
      const r = await call(X.run.POST(req("expert", "/engine/run", "exDign", "POST", { profileId: p, selections: [DIGN] })));
      assert.equal(r.status, 200, r.text.slice(0, 300));
      const rowId = store.tables.astro_provider_results?.find((x) => x.owner_user_id === U.exDign)?.id as string | undefined;
      assert.ok(rowId, "natal birimi satırı yok");
      assert.equal(store.tables.astro_provider_results.find((x) => x.id === rowId)!.technique, "western.natal");
      const h = roxyHits;
      const n1 = await call(X.run.POST(req("expert", "/engine/run", "exDign", "POST", { profileId: p, selections: [NATAL] })));
      const n2 = await call(X.view.POST(req("expert", "/engine/view", "exDign", "POST", { profileId: p, selections: [NATAL] })));
      const n3 = await call(X.result.GET(req("expert", `/results/${rowId}`, "exDign"), ctxP(rowId!)));
      assert.deepEqual([n1.status, n2.status, n3.status, n3.json.code], [403, 403, 403, "TECHNIQUE_NOT_ENTITLED"]);
      assert.equal(roxyHits, h);
    });

    let aId = "";
    await t("C5 KAYITLI ANALİZ KİLİDİ: izin kaldırılınca listede kilitli; aç / Word / PDF / toplu rapor açılmaz; kayıt silinmez; izin geri gelince açılır", async () => {
      const sv = await call(X.analyses.POST(req("expert", "/analyses", "exNatal", "POST", { profileId: pN, revision: 1, ...NATAL, saveRequestId: randomUUID() })));
      assert.equal(sv.status, 201, sv.text.slice(0, 200));
      aId = sv.json.analysisId as string;
      assert.equal((await call(X.analysis.GET(req("expert", `/analyses/${aId}`, "exNatal"), ctxP(aId)))).status, 200);
      const before = store.tables.astro_analyses.length;
      userRow(U.exNatal).astrology_technique_grants = { mode: "list", techniques: ["western.transit"] };
      const list = await call(X.analyses.GET(req("expert", `/analyses?profileId=${pN}`, "exNatal")));
      assert.equal(list.status, 200);
      const item = (list.json.analyses as { id: string; locked: boolean }[]).find((a) => a.id === aId)!;
      assert.equal(item.locked, true);
      const g = await call(X.analysis.GET(req("expert", `/analyses/${aId}`, "exNatal"), ctxP(aId)));
      assert.deepEqual([g.status, g.json.code], [403, "ANALYSIS_TECHNIQUE_LOCKED"]);
      assert.ok(!g.text.includes("technical") && !g.text.includes("RXN"), "kilitli analiz içeriği sızdı");
      for (const fmt of ["docx", "pdf"]) {
        const rp = await call(X.analysisReport.GET(req("expert", `/analyses/${aId}/report?format=${fmt}`, "exNatal"), ctxP(aId)));
        assert.equal(rp.status, 403, `${fmt} raporu kilitli analizde üretildi`);
      }
      const sel = await call(X.combined.GET(req("expert", `/analyses/report?format=docx&profileId=${pN}&ids=${aId}`, "exNatal")));
      assert.equal(sel.status, 403);
      const all = await call(X.combined.GET(req("expert", `/analyses/report?format=docx&profileId=${pN}&all=1`, "exNatal")));
      assert.equal(all.status, 404, "tümü kapsamında kilitli analiz atlanmalı");
      assert.equal(store.tables.astro_analyses.length, before, "kayıt silindi");
      userRow(U.exNatal).astrology_technique_grants = { mode: "list", techniques: ["western.natal"] };
      assert.equal((await call(X.analysis.GET(req("expert", `/analyses/${aId}`, "exNatal"), ctxP(aId)))).status, 200);
    });

    await t("C6 not yazımı kapalı teknikte 403; izinli teknikte çalışır", async () => {
      const no = await call(X.notes.PUT(req("expert", "/notes", "exNatal", "PUT", { profileId: pN, technique: "western.transit", sectionKey: "overall", body: "x", expectedRevision: null })));
      assert.deepEqual([no.status, no.json.code], [403, "TECHNIQUE_NOT_ENTITLED"]);
      const ok = await call(X.notes.PUT(req("expert", "/notes", "exNatal", "PUT", { profileId: pN, sectionKey: "overall", body: "natal notu", expectedRevision: null })));
      assert.equal(ok.status, 201, ok.text.slice(0, 200));
    });

    await t("C7 Batı Horary: izin yoksa hesap + kayıt listesi 403; izinliyse kapıdan geçer (geçersiz gövde → 400)", async () => {
      const no = await call(X.horary.POST(req("expert", "/horary/western", "exNatal", "POST", {})));
      const noList = await call(X.horaryRecords.GET(req("expert", "/horary/western/records", "exNatal")));
      assert.deepEqual([no.status, no.json.code, noList.status], [403, "TECHNIQUE_NOT_ENTITLED", 403]);
      const ok = await call(X.horary.POST(req("expert", "/horary/western", "exAll", "POST", {})));
      assert.equal(ok.status, 400, ok.text.slice(0, 200));
    });

    await t("C8 Gökyüzü Araçları ayrı ayrı: yalnız Ay Evreleri izni → Ay ucu geçer (400 geçersiz gövde); Efemeris + Derece 403", async () => {
      const ay = await call(X.ay.POST(req("expert", "/efemeris/ay", "exSky", "POST", {})));
      const eph = await call(X.eph.POST(req("expert", "/efemeris", "exSky", "POST", {})));
      const der = await call(X.derece.POST(req("expert", "/efemeris/derece", "exSky", "POST", {})));
      assert.deepEqual([ay.status, eph.status, eph.json.code, der.status], [400, 403, "TECHNIQUE_NOT_ENTITLED", 403]);
      const ayNo = await call(X.ay.POST(req("expert", "/efemeris/ay", "exNatal", "POST", {})));
      assert.equal(ayNo.status, 403);
    });

    await t("C9 izin anında geri alınır (önbellek yok): aynı oturumla bir sonraki istek reddedilir; geri verilince çalışır", async () => {
      userRow(U.exNatal).astrology_technique_grants = { mode: "list", techniques: ["kp.chart"] };
      const r = await call(X.run.POST(req("expert", "/engine/run", "exNatal", "POST", { profileId: pN, selections: [NATAL] })));
      assert.equal(r.status, 403);
      userRow(U.exNatal).astrology_technique_grants = { mode: "list", techniques: ["western.natal"] };
      const r2 = await call(X.run.POST(req("expert", "/engine/run", "exNatal", "POST", { profileId: pN, selections: [NATAL] })));
      assert.equal(r2.status, 200);
    });

    await t("C10 Astroloji kapatılınca teknik seçimi KORUNUR, erişim kapanır; yeniden açılınca aynı seçim geri gelir", async () => {
      userRow(U.exNatal).module_permissions = { astrology: false };
      assert.equal((await techOf("exNatal")).status, 404);
      assert.deepEqual(userRow(U.exNatal).astrology_technique_grants, { mode: "list", techniques: ["western.natal"] });
      userRow(U.exNatal).module_permissions = { astrology: true };
      assert.deepEqual((await techOf("exNatal")).techniques, ["western.natal"]);
    });

    // ─── Admin kayıt ucu ──────────────────────────────────────────────────────
    const put = (who: Who, target: string, body: unknown) => call(G.PUT(req("users", `/${target}/astrology-techniques`, who, "PUT", body), ctxP(target)));
    await t("C11 admin ucu: boş seçim 400 EMPTY_SELECTION · bilinmeyen teknik 400 · hatalı enableModule 400 — hiçbiri DB'ye yazmaz", async () => {
      const snap = JSON.stringify(userRow(U.exNew));
      const e1 = await put("owner", U.exNew, { grants: { mode: "list", techniques: [] }, enableModule: true });
      const e2 = await put("owner", U.exNew, { grants: { mode: "list", techniques: ["western.yok"] }, enableModule: true });
      const e3 = await put("owner", U.exNew, { grants: { mode: "all" }, enableModule: "evet" });
      assert.deepEqual([e1.status, e1.json.code, e2.status, e3.status], [400, "EMPTY_SELECTION", 400, 400]);
      assert.equal(JSON.stringify(userRow(U.exNew)), snap);
    });
    await t("C12 Astroloji'yi açarken: modül + teknikler TEK istekte; yalnız seçilenler açılır (yeni eğitim kullanıcısı); diğer modüller korunur", async () => {
      const before = await call(G.GET(req("users", `/${U.exNew}/astrology-techniques`, "owner"), ctxP(U.exNew)));
      assert.deepEqual([before.status, before.json.moduleEnabled, before.json.grants], [200, false, null]);
      const r = await put("owner", U.exNew, { grants: { mode: "list", techniques: ["western.solar_return"] }, enableModule: true });
      assert.deepEqual([r.status, r.json.moduleEnabled], [200, true], r.text);
      assert.deepEqual(userRow(U.exNew).module_permissions, { numerology: true, astrology: true });
      assert.deepEqual((await techOf("exNew")).techniques, ["western.solar_return"]);
    });
    await t("C13 düzenleme (enableModule yok) modülü AÇMAZ; normal admin de uzman iznini düzenler (mevcut modül kuralı); 'Tümü' → all", async () => {
      const r = await put("admin2", U.exOff, { grants: { mode: "list", techniques: ["western.natal", "western.transit"] } });
      assert.deepEqual([r.status, r.json.moduleEnabled], [200, false]);
      assert.equal((userRow(U.exOff).module_permissions as Record<string, unknown>).astrology, false);
      const all = await put("owner", U.exNew, { grants: { mode: "all" } });
      assert.deepEqual([all.status, (all.json.grants as { mode: string }).mode], [200, "all"]);
      assert.equal((await techOf("exNew")).techniques?.length, 48);
    });
    await t("C14 uzman oturumu admin ucunu kullanamaz (başka uzmanın iznini değiştiremez); admin hedef 409", async () => {
      const ex = await call(G.PUT(new NextRequest(`http://localhost/api/admin/users/${U.exNone}/astrology-techniques`, {
        method: "PUT",
        headers: { "x-admin-id": U.exAll, "x-session-token": tok("exAll"), "Content-Type": "application/json" },
        body: JSON.stringify({ grants: { mode: "all" } }),
      }), ctxP(U.exNone)));
      assert.ok(ex.status === 401 || ex.status === 403, String(ex.status));
      assert.equal(userRow(U.exNone).astrology_technique_grants, null);
      const adm = await put("owner", U.admin2, { grants: { mode: "all" } });
      assert.equal(adm.status, 409);
    });
    await t("C15 panel istemcisi: iptal hiçbir istek göndermez; kayıt yalnız 'İzinleri Kaydet' ile; Astroloji anahtarı açılırken modül hemen kaydedilmez", () => {
      const comp = readFileSync(join(__dirname, "..", "..", "components/admin/members/AstrologyTechniqueAccess.tsx"), "utf8");
      const cancelFn = comp.slice(comp.indexOf("const cancel = useCallback"), comp.indexOf("}, [saving]);"));
      assert.ok(cancelFn.length > 0 && !/fetch\(/.test(cancelFn), "iptal istek gönderiyor");
      assert.equal((comp.match(/method: "PUT"/g) ?? []).length, 1, "tek kayıt noktası");
      assert.match(comp, /enableModule: open === "enable"/);
      assert.match(comp, /draft\.size === 0[\s\S]{0,200}setWarn\(/);
      const page = readFileSync(join(__dirname, "..", "..", "app/admin/users/[id]/page.tsx"), "utf8");
      assert.match(page, /key === "astrology" && next\s*\?\s*setAstroTechOpenSignal/);
    });
    await t("C16 tüm Horary + Gökyüzü uçları teknik kapısını kapıdan hemen sonra (Gökyüzü: bayraktan sonra) uygular", () => {
      const root = join(__dirname, "..", "..");
      const files: [string, string][] = [
        ["app/api/admin/astroloji/horary/western/route.ts", "ASTRO_GRANT_HORARY_LILLY"],
        ["app/api/admin/astroloji/horary/western/report/route.ts", "ASTRO_GRANT_HORARY_LILLY"],
        ["app/api/admin/astroloji/horary/western/records/route.ts", "ASTRO_GRANT_HORARY_LILLY"],
        ["app/api/admin/astroloji/horary/western/records/[id]/route.ts", "ASTRO_GRANT_HORARY_LILLY"],
        ["app/api/admin/astroloji/horary/western/records/[id]/report/route.ts", "ASTRO_GRANT_HORARY_LILLY"],
        ["app/api/admin/astroloji/efemeris/route.ts", "ASTRO_GRANT_SKY_EPHEMERIS"],
        ["app/api/admin/astroloji/efemeris/ay/route.ts", "ASTRO_GRANT_SKY_LUNATIONS"],
        ["app/api/admin/astroloji/efemeris/derece/route.ts", "ASTRO_GRANT_SKY_DEGREES"],
      ];
      for (const [f, k] of files) {
        const s = readFileSync(join(root, f), "utf8");
        const handlers = s.split(/export async function /).slice(1);
        assert.ok(handlers.length > 0, f);
        for (const h of handlers) assert.ok(h.includes(`astrologyTechniqueDenied(gate.ctx, ${k})`), `${f}: ${h.slice(0, 12)} teknik kapısı yok`);
      }
    });
  } finally {
    console.error = origErr;
    restore();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
