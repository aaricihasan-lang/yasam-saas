/**
 * ASTROLOJİ — KALICI PROFİL SİLME GÜVENLİĞİ (gerçek route handler'ları; sahte PostgREST; gerçek Roxy/DB YOK).
 * SENTETİK kişiler: Ahmet, Ayşe, Can (U1) · U2 aynı tenant · UB başka tenant · yetkisizler.
 *
 *   • Tekli: 1 onay yetmez; 2. onay olmadan silme yok. Toplu: 2 onay yetmez; 3. onay olmadan silme yok.
 *   • Ahmet silinince Ayşe'nin (ve Can'ın) ortak analizleri + snapshot'ları birebir korunur; Ahmet'in hesap verisi
 *     o snapshot'larda kalır; açmak 0 Roxy.
 *   • Eskimiş onay / seçim değişikliği / başka uzman / başka tenant / tekrar / eşzamanlı istek → veri bütünlüğü korunur.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase7c.harness.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createFakeClient, createStore, installFetchShim, type FakeStore } from "./fakeSupabase";

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-7c";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IDS = {
  u1: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
  u2: "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2",
  ub: "dbdbdbdb-dbdb-4dbd-8dbd-dbdbdbdbdbdb",
  expert: "dededede-dede-4ded-8ded-dededededede",
  admin2: "dadadada-dada-4dad-8dad-dadadadadada",
};
type Who = keyof typeof IDS | "anon";
const TOK: Record<keyof typeof IDS, string> = { u1: "tok7c-u1-xxxxxxxxxxxx", u2: "tok7c-u2-xxxxxxxxxxxx", ub: "tok7c-ub-xxxxxxxxxxxx", expert: "tok7c-ex-xxxxxxxxxxxx", admin2: "tok7c-a2-xxxxxxxxxxxx" };

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

const store: FakeStore = createStore({
  users: [
    { id: IDS.u1, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TA, email: "u1@sentetik.test" },
    { id: IDS.u2, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TA, email: "u2@sentetik.test" },
    { id: IDS.ub, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TB, email: "ub@sentetik.test" },
    { id: IDS.expert, role: "expert", active: true, is_super_admin: false, is_demo_account: false, tenant_id: TA, email: "uzman@sentetik.test" },
    { id: IDS.admin2, role: "admin", active: true, is_super_admin: false, is_demo_account: false, tenant_id: TA, email: "admin2@sentetik.test" },
  ],
});
for (const w of Object.keys(TOK) as (keyof typeof IDS)[]) store.sessions.set(TOK[w], IDS[w]);

let roxyHits = 0;
const restore = installFetchShim({
  store,
  supabaseUrl: SUPA,
  roxyBase: ROXY_BASE,
  roxy: () => {
    roxyHits += 1;
    return new Response("{}", { status: 500 });
  },
});

function req(path: string, who: Who, method = "GET", body?: unknown): NextRequest {
  const h: Record<string, string> = who === "anon" ? {} : { "x-admin-id": IDS[who], "x-session-token": TOK[who] };
  if (body !== undefined) h["Content-Type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}
async function call(res: Promise<Response>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const r = await res;
  const text = await r.text();
  return { status: r.status, json: JSON.parse(text), text };
}

async function main() {
  const preview = await import("@/app/api/admin/astroloji/profiles/delete/preview/route");
  const del = await import("@/app/api/admin/astroloji/profiles/delete/route");
  const profile = await import("@/app/api/admin/astroloji/profiles/[id]/route");
  const analysisItem = await import("@/app/api/admin/astroloji/analyses/[id]/route");
  const ctxP = (id: string) => ({ params: Promise.resolve({ id }) });
  const db = createFakeClient(store);

  const mkProfile = async (tenant: string, user: string, label: string, birth: string) => {
    const r = await db.rpc("astro_profile_create", {
      p_tenant_id: tenant, p_user_id: user, p_client_id: null, p_label: label, p_birth_date: birth, p_birth_time: "09:00:00", p_time_known: true, p_time_accuracy: "exact_record",
      p_location_id: "tr-34-istanbul", p_location_label: "İstanbul, Türkiye", p_latitude: 41.0082, p_longitude: 28.9784, p_timezone: "Europe/Istanbul", p_dst_choice: "auto",
      p_utc_offset_seconds: 10800, p_birth_utc: `${birth}T06:00:00Z`,
    });
    return (r.data as { profile_id: string }).profile_id;
  };
  const snap = (label: string, partner: { id: string; label: string; birth: string } | null) => ({
    schema: "astro.analysis.profile.v2",
    label,
    client: null,
    revision: { revision: 1, birthDate: "1984-08-08", birthTime: "10:00:00", timeKnown: true, timeAccuracy: "exact_record", timeAccuracyLabel: "Resmî kayıt (kesin)", locationLabel: "İstanbul, Türkiye", timezone: "Europe/Istanbul" },
    partner: partner
      ? { profileId: partner.id, label: partner.label, client: null, revision: { revision: 1, birthDate: partner.birth, birthTime: "09:00:00", timeKnown: true, timeAccuracy: "exact_record", timeAccuracyLabel: "Resmî kayıt (kesin)", locationLabel: "İstanbul, Türkiye", timezone: "Europe/Istanbul" } }
      : null,
  });
  const mkAnalysis = async (owner: string, tenant: string, pid: string, partner: { id: string; label: string; birth: string } | null, technique: string, title: string, extra: Record<string, unknown> = {}) => {
    const r = await db.rpc("astro_analysis_save_v2", {
      p_tenant_id: tenant, p_user_id: owner, p_profile_id: pid, p_profile_revision: 1, p_partner_profile_id: partner?.id ?? null, p_partner_profile_revision: partner ? 1 : null,
      p_result_ids: extra.resultIds ?? [], p_technique: technique, p_title: title, p_save_request_id: randomUUID(), p_technique_params: partner ? { partnerProfileId: partner.id } : {},
      p_profile_snapshot: snap(title.split(" ")[0], partner), p_method_snapshot: { technique, houseSystem: "placidus", nodeType: "true", timeUnknownMasked: false, warnings: [] },
      // Gerçek şemaya uygun asgari teknik veri (kayıtlı analizi açma yolu konu türetir).
      p_technical_snapshot:
        extra.technical ??
        (technique === "western.composite"
          ? { schema: "astro.western.composite.v1", bodies: [{ id: "sun", sign: "leo", house: 5 }], aspects: [{ a: "sun", type: "trine", b: "moon" }], angles: { ascendant: { sign: "aries" }, midheaven: null } }
          : technique === "western.synastry"
            ? { schema: "astro.western.synastry.v1", aspects: [{ a: "venus", type: "conjunction", b: "mars" }], partnerBodies: partner ? [{ id: "sun", sign: "aries", owner: partner.label }] : [] }
            : { schema: "astro.western.natal.v1", bodies: [], houses: [], aspects: [], patterns: [], angles: null, points: null, summary: null }),
      p_kb_snapshot: [{ entryId: "k1", topicKey: "aspect:sun:trine:moon", topicLabel: "Güneş üçgen Ay", title: "KB", body: "metin", sourceNote: null, tags: [], revision: 1, updatedAt: "2026-10-01" }],
      p_provider_interp_included: !!extra.interp, p_provider_interp_snapshot: extra.interp ?? null, p_versions_snapshot: { provider: "roxy", providerApiVersion: "v2" },
      p_notes: [{ section_key: "overall", body: `${title} notu` }],
    });
    return (r.data as { analysis_id: string }).analysis_id;
  };
  const P = (who: Who, body: unknown) => call(preview.POST(req("/api/admin/astroloji/profiles/delete/preview", who, "POST", body)));
  const D = (who: Who, body: unknown) => call(del.POST(req("/api/admin/astroloji/profiles/delete", who, "POST", body)));
  const exists = (pid: string) => store.tables.astro_birth_profiles.some((p) => p.id === pid);
  const openA = async (aid: string) => {
    const r = await call(analysisItem.GET(req(`/api/admin/astroloji/analyses/${aid}`, "u1"), ctxP(aid)));
    assert.equal(r.status, 200, r.text.slice(0, 200));
    return r.text;
  };

  const origErr = console.error;
  console.error = () => undefined;
  try {
    const ahmet = await mkProfile(TA, IDS.u1, "Ahmet — natal", "1980-04-04");
    const ayse = await mkProfile(TA, IDS.u1, "Ayşe — natal", "1984-08-08");
    const can = await mkProfile(TA, IDS.u1, "Can — natal", "1990-01-01");
    const AH = { id: ahmet, label: "Ahmet — natal", birth: "1980-04-04" };
    // Ayşe'nin önbellekteki sinastri sonucu (Ahmet verisi içerir) + yorumu.
    const rid = randomUUID();
    store.tables.astro_provider_results ??= [];
    store.tables.astro_provider_interpretations ??= [];
    store.tables.astro_provider_results.push({ id: rid, tenant_id: TA, owner_user_id: IDS.u1, profile_id: ayse, profile_revision: 1, partner_profile_id: ahmet, partner_profile_revision: 1, technique: "western.synastry", input_hash: "f".repeat(64), raw_response: { raw: "Ahmet 1980-04-04" }, technical: {}, projection_version: "p", created_at: new Date().toISOString() });
    store.tables.astro_provider_interpretations.push({ id: randomUUID(), tenant_id: TA, owner_user_id: IDS.u1, result_id: rid, projection_version: "p", content: { s: 1 } });
    const aSyn = await mkAnalysis(IDS.u1, TA, ayse, AH, "western.synastry", "Ayşe & Ahmet sinastri", { resultIds: [rid], interp: { provider: "roxy", lang: "tr", notice: "n", content: { schema: "astro.western.synastry.interp.v1", summary: "sinastri yorumu" } }, technical: { schema: "astro.western.synastry.v1", aspects: [{ a: "sun", b: "moon" }], partnerBodies: [{ id: "sun", sign: "aries", owner: "Ahmet" }] } });
    const aComp = await mkAnalysis(IDS.u1, TA, ayse, AH, "western.composite", "Ayşe & Ahmet composite");
    const cComp = await mkAnalysis(IDS.u1, TA, can, AH, "western.composite", "Can & Ahmet composite");
    await mkAnalysis(IDS.u1, TA, ahmet, null, "western.natal", "Ahmet natal");
    await mkAnalysis(IDS.u1, TA, ahmet, { id: ayse, label: "Ayşe — natal", birth: "1984-08-08" }, "western.synastry", "Ahmet & Ayşe");
    // Başka tenant (etkilenmemeli).
    const pb = await mkProfile(TB, IDS.ub, "B tenant", "1970-01-01");
    await mkAnalysis(IDS.ub, TB, pb, null, "western.natal", "B natal");
    const tbBefore = JSON.stringify(store.tables.astro_analyses.filter((a) => a.tenant_id === TB));

    let tok = "";
    await t("tekli önizleme: Ahmet → kendi 2 analiz, korunacak 3 ortak analiz, gereken 2 onay; başka uzman / tenant / yetkisiz 404", async () => {
      const r = await P("u1", { mode: "single", profileIds: [ahmet] });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.requiredConfirmations, 2);
      assert.deepEqual(r.json.totals, { ownAnalyses: 2, sharedPreserved: 3 });
      assert.equal((r.json.profiles as { label: string }[])[0].label, "Ahmet — natal");
      tok = r.json.confirmToken as string;
      for (const who of ["u2", "ub"] as const) assert.equal((await P(who, { mode: "single", profileIds: [ahmet] })).status, 404);
      for (const who of ["expert", "admin2", "anon"] as const) {
        const x = await P(who, { mode: "single", profileIds: [ahmet] });
        assert.equal(x.status, 404);
        assert.deepEqual(x.json, { ok: false, error: "Bulunamadı." });
      }
      assert.equal((await P("u1", { mode: "single", profileIds: [ahmet, ayse] })).status, 400, "tekli modda iki profil");
    });

    await t("tekli: birinci Evet yetmez (onay 1 / onaysız / özetsiz → 400); hiçbir şey silinmez", async () => {
      assert.equal((await D("u1", { mode: "single", profileIds: [ahmet], confirmToken: tok, confirmations: 1 })).json.code, "CONFIRMATION_REQUIRED");
      assert.equal((await D("u1", { mode: "single", profileIds: [ahmet], confirmToken: tok })).status, 400);
      assert.equal((await D("u1", { mode: "single", profileIds: [ahmet], confirmations: 2 })).status, 400);
      assert.equal((await D("u1", { mode: "single", profileIds: [ahmet], confirmToken: "bozuk", confirmations: 2 })).status, 400);
      assert.ok(exists(ahmet));
      assert.equal(store.tables.astro_analyses.filter((a) => a.profile_id === ahmet).length, 2);
    });

    await t("seçim değişirse (başka profil / mod) özet geçersiz → 409, hiçbir şey silinmez", async () => {
      const x = await D("u1", { mode: "single", profileIds: [can], confirmToken: tok, confirmations: 2 });
      assert.equal(x.status, 409);
      assert.equal(x.json.code, "SELECTION_CHANGED");
      assert.equal((await D("u1", { mode: "bulk", profileIds: [ahmet], confirmToken: tok, confirmations: 3 })).json.code, "SELECTION_CHANGED");
      assert.ok(exists(ahmet) && exists(can));
    });

    await t("eskimiş onay: önizlemeden sonra yeni ortak analiz eklenir → 409 DELETE_STALE, hiçbir şey silinmez", async () => {
      const late = await mkAnalysis(IDS.u1, TA, can, AH, "western.synastry", "Can & Ahmet geç");
      const x = await D("u1", { mode: "single", profileIds: [ahmet], confirmToken: tok, confirmations: 2 });
      assert.equal(x.status, 409);
      assert.equal(x.json.code, "DELETE_STALE");
      assert.ok(exists(ahmet));
      assert.ok(store.tables.astro_analyses.some((a) => a.id === late));
      tok = (await P("u1", { mode: "single", profileIds: [ahmet] })).json.confirmToken as string;
    });

    await t("başka uzman / başka tenant U1'in geçerli onay özetiyle silemez (404); veri aynen", async () => {
      for (const who of ["u2", "ub"] as const) assert.equal((await D(who, { mode: "single", profileIds: [ahmet], confirmToken: tok, confirmations: 2 })).status, 404);
      for (const who of ["expert", "admin2", "anon"] as const) assert.equal((await D(who, { mode: "single", profileIds: [ahmet], confirmToken: tok, confirmations: 2 })).status, 404);
      assert.ok(exists(ahmet));
    });

    let before: Record<string, string> = {};
    await t("Ahmet silinir (2 onay): Ayşe'nin ve Can'ın ortak analizleri + snapshot'ları BİREBİR korunur; Ahmet'in hesap verisi kalır; açmak 0 Roxy", async () => {
      before = { syn: await openA(aSyn), comp: await openA(aComp), can: await openA(cComp) };
      const h = roxyHits;
      const r = await D("u1", { mode: "single", profileIds: [ahmet], confirmToken: tok, confirmations: 2 });
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(r.json, { ok: true, deletedProfiles: 1, deletedAnalyses: 2, preservedSharedAnalyses: 4, verified: true, remaining: { profiles: 0, ownAnalyses: 0 } });
      const after = { syn: await openA(aSyn), comp: await openA(aComp), can: await openA(cComp) };
      assert.deepEqual(after, before, "korunan ortak analizlerin açılan içeriği değişti");
      assert.ok(after.syn.includes("Ahmet — natal") && after.syn.includes("1980-04-04") && after.syn.includes("partnerBodies") && after.syn.includes("sinastri yorumu"), "Ahmet'in hesap verisi / yorum korunmadı");
      assert.ok(after.syn.includes("Ayşe & Ahmet sinastri notu"), "kayıt anındaki not kopyası korunmadı");
      assert.equal(roxyHits, h);
      const syn = store.tables.astro_analyses.find((a) => a.id === aSyn)!;
      assert.equal(syn.partner_profile_id, null);
      assert.equal(syn.result_id, null, "önbellek satırı silinince yalnız bağ NULL");
    });

    await t("Ahmet'in kendi kayıtları ve Ahmet verisini içeren önbellek gitti; Ayşe / Can profilleri ve başka tenant aynen", () => {
      assert.ok(!exists(ahmet));
      assert.equal(store.tables.astro_birth_profile_revisions.filter((r) => r.profile_id === ahmet).length, 0);
      assert.equal(store.tables.astro_analyses.filter((a) => a.profile_id === ahmet).length, 0);
      assert.equal(store.tables.astro_provider_results.filter((r) => r.profile_id === ahmet || r.partner_profile_id === ahmet).length, 0);
      assert.equal(store.tables.astro_provider_interpretations.filter((i) => i.result_id === rid).length, 0);
      assert.ok(exists(ayse) && exists(can));
      assert.equal(JSON.stringify(store.tables.astro_analyses.filter((a) => a.tenant_id === TB)), tbBefore);
    });

    await t("tekrar silme → 404 (zaten silinmiş), hiçbir şey değişmez", async () => {
      const n = store.tables.astro_analyses.length;
      assert.equal((await D("u1", { mode: "single", profileIds: [ahmet], confirmToken: tok, confirmations: 2 })).status, 404);
      assert.equal(store.tables.astro_analyses.length, n);
    });

    // ─── Toplu ────────────────────────────────────────────────────────────────
    const x = await mkProfile(TA, IDS.u1, "X", "1971-01-01");
    const y = await mkProfile(TA, IDS.u1, "Y", "1972-01-01");
    const z = await mkProfile(TA, IDS.u1, "Z (arşiv)", "1973-01-01");
    await mkAnalysis(IDS.u1, TA, x, { id: y, label: "Y", birth: "1972-01-01" }, "western.synastry", "X & Y");
    const aY = await mkAnalysis(IDS.u1, TA, ayse, { id: y, label: "Y", birth: "1972-01-01" }, "western.synastry", "Ayşe & Y");
    let btok = "";
    await t("toplu: arşivli profil dahil; aynı profil iki kez seçilse tek sayılır; gereken 3 onay; korunacak 1 ortak analiz", async () => {
      assert.equal((await call(profile.PATCH(req(`/api/admin/astroloji/profiles/${z}`, "u1", "PATCH", { archived: true }), ctxP(z)))).status, 200);
      const r = await P("u1", { mode: "bulk", profileIds: [x, y, z, x] });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.profileCount, 3);
      assert.equal(r.json.requiredConfirmations, 3);
      assert.deepEqual(r.json.totals, { ownAnalyses: 1, sharedPreserved: 1 });
      assert.ok((r.json.profiles as { archived: boolean }[]).some((p) => p.archived));
      btok = r.json.confirmToken as string;
    });

    await t("toplu: ilk iki Evet yetmez (onay 2 → 400); 3. Evet olmadan hiçbir profil silinmez", async () => {
      for (const c of [1, 2, 4]) assert.equal((await D("u1", { mode: "bulk", profileIds: [x, y, z], confirmToken: btok, confirmations: c })).json.code, "CONFIRMATION_REQUIRED");
      assert.ok(exists(x) && exists(y) && exists(z));
    });

    await t("toplu: seçim değişirse (bir profil çıkar / eklenir) 409; kısmi başarı yok", async () => {
      assert.equal((await D("u1", { mode: "bulk", profileIds: [x, y], confirmToken: btok, confirmations: 3 })).json.code, "SELECTION_CHANGED");
      assert.equal((await D("u1", { mode: "bulk", profileIds: [x, y, z, can], confirmToken: btok, confirmations: 3 })).json.code, "SELECTION_CHANGED");
      // Seçimde başka tenant profili → önizleme bile reddedilir; hiçbiri silinmez.
      assert.equal((await P("u1", { mode: "bulk", profileIds: [x, y, pb] })).status, 404);
      assert.ok(exists(x) && exists(y) && exists(z) && exists(pb));
    });

    await t("toplu: eşzamanlı iki silme isteği → biri 200, diğeri 404; Ayşe & Y ortak analizi birebir korunur", async () => {
      const beforeY = await openA(aY);
      const body = { mode: "bulk", profileIds: [z, y, x], confirmToken: btok, confirmations: 3 };
      const [r1, r2] = await Promise.all([D("u1", body), D("u1", body)]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 404]);
      const ok = r1.status === 200 ? r1 : r2;
      assert.deepEqual(ok.json, { ok: true, deletedProfiles: 3, deletedAnalyses: 1, preservedSharedAnalyses: 1, verified: true, remaining: { profiles: 0, ownAnalyses: 0 } });
      assert.ok(!exists(x) && !exists(y) && !exists(z));
      assert.equal(await openA(aY), beforeY);
      assert.ok(!store.tables.astro_analyses.some((a) => a.title === "X & Y"));
      assert.ok(exists(ayse) && exists(can) && exists(pb));
      assert.equal(JSON.stringify(store.tables.astro_analyses.filter((a) => a.tenant_id === TB)), tbBefore);
    });

    // ─── A — YALNIZCA ANALİZLERİ SİL (scope "analyses") ───────────────────────────────────────────────
    const deniz = await mkProfile(TA, IDS.u1, "Deniz — natal", "1991-03-03");
    const denizRow = store.tables.astro_birth_profiles.find((p) => p.id === deniz)!;
    denizRow.client_id = "11111111-1111-4111-8111-111111111111"; // DY bağı (korunmalı)
    const denizProfileBefore = JSON.stringify(denizRow);
    await mkAnalysis(IDS.u1, TA, deniz, null, "western.natal", "Deniz natal");
    await mkAnalysis(IDS.u1, TA, deniz, { id: ayse, label: "Ayşe — natal", birth: "1984-08-08" }, "western.synastry", "Deniz & Ayşe");
    const aysDeniz = await mkAnalysis(IDS.u1, TA, ayse, { id: deniz, label: "Deniz — natal", birth: "1991-03-03" }, "western.synastry", "Ayşe & Deniz");
    store.tables.astro_expert_notes ??= [];
    store.tables.astro_expert_notes.push({ id: randomUUID(), tenant_id: TA, owner_user_id: IDS.u1, profile_id: deniz, technique: "western.natal", section_key: "overall", body: "Deniz çalışma notu" });
    const aysDenizBefore = await openA(aysDeniz);
    const denizCount = () => store.tables.astro_analyses.filter((a) => a.profile_id === deniz).length;

    await t("A önizleme: kapsam 'analyses' özete yazılır; sayılar sunucuda (kendi 2, korunacak ortak 1)", async () => {
      const pv = await P("u1", { mode: "single", scope: "analyses", profileIds: [deniz] });
      assert.equal(pv.status, 200, pv.text);
      assert.equal(pv.json.scope, "analyses");
      assert.deepEqual(pv.json.totals, { ownAnalyses: 2, sharedPreserved: 1 });
      assert.equal(pv.json.requiredConfirmations, 2);
      assert.equal((await P("u1", { mode: "single", scope: "her-şey", profileIds: [deniz] })).status, 400, "bilinmeyen kapsam");
    });

    await t("A: kapsam değişirse (A özetiyle B / B özetiyle A) 409; onay 1 → 400; başka uzman / tenant 404; hiçbir şey silinmez", async () => {
      const a = (await P("u1", { mode: "single", scope: "analyses", profileIds: [deniz] })).json.confirmToken;
      const b = (await P("u1", { mode: "single", profileIds: [deniz] })).json.confirmToken;
      assert.equal((await D("u1", { mode: "single", profileIds: [deniz], confirmToken: a, confirmations: 2 })).status, 409, "A özeti B olarak kullanılamaz");
      assert.equal((await D("u1", { mode: "single", scope: "analyses", profileIds: [deniz], confirmToken: b, confirmations: 2 })).status, 409, "B özeti A olarak kullanılamaz");
      assert.equal((await D("u1", { mode: "single", scope: "analyses", profileIds: [deniz], confirmToken: a, confirmations: 1 })).status, 400);
      assert.equal((await D("u2", { mode: "single", scope: "analyses", profileIds: [deniz], confirmToken: a, confirmations: 2 })).status, 404);
      assert.equal((await D("ub", { mode: "single", scope: "analyses", profileIds: [deniz], confirmToken: a, confirmations: 2 })).status, 404);
      assert.equal(denizCount(), 2);
      assert.ok(exists(deniz));
    });

    await t("A tekli (2 onay): Deniz'in 2 analizi silinir; profil + DY bağı + çalışma notu birebir; Ayşe & Deniz ortak analizi birebir; 0 Roxy", async () => {
      const hits = roxyHits;
      const a = (await P("u1", { mode: "single", scope: "analyses", profileIds: [deniz] })).json.confirmToken;
      const d = await D("u1", { mode: "single", scope: "analyses", profileIds: [deniz], confirmToken: a, confirmations: 2 });
      assert.equal(d.status, 200, d.text);
      assert.deepEqual(d.json, { ok: true, scope: "analyses", deletedProfiles: 0, deletedAnalyses: 2, preservedSharedAnalyses: 1, verified: true, remaining: { profiles: 1, ownAnalyses: 0 } });
      assert.equal(denizCount(), 0);
      assert.equal(JSON.stringify(store.tables.astro_birth_profiles.find((p) => p.id === deniz)), denizProfileBefore);
      assert.ok(store.tables.astro_expert_notes.some((n) => n.profile_id === deniz && n.body === "Deniz çalışma notu"));
      assert.equal(await openA(aysDeniz), aysDenizBefore);
      assert.ok(store.tables.astro_analyses.some((a2) => a2.id === aysDeniz && a2.partner_profile_id === deniz), "canlı karşı taraf bağı duruyor");
      assert.equal(roxyHits, hits);
      // Aynı özetle tekrar → durum değişti (409), hiçbir şey olmaz.
      assert.equal((await D("u1", { mode: "single", scope: "analyses", profileIds: [deniz], confirmToken: a, confirmations: 2 })).status, 409);
    });

    await t("A toplu: 3 onay zorunlu (2 → 400); Ayşe + Can analizleri silinir, profiller kalır; başka tenant aynen", async () => {
      const tbBefore = JSON.stringify(store.tables.astro_analyses.filter((a) => a.tenant_id === TB));
      const pv = await P("u1", { mode: "bulk", scope: "analyses", profileIds: [ayse, can] });
      assert.equal(pv.json.requiredConfirmations, 3);
      const body = { mode: "bulk", scope: "analyses", profileIds: [ayse, can], confirmToken: pv.json.confirmToken };
      assert.equal((await D("u1", { ...body, confirmations: 2 })).status, 400);
      assert.ok(store.tables.astro_analyses.some((a) => a.profile_id === ayse));
      const d = await D("u1", { ...body, confirmations: 3 });
      assert.equal(d.status, 200, d.text);
      assert.equal(d.json.deletedProfiles, 0);
      assert.ok(!store.tables.astro_analyses.some((a) => a.profile_id === ayse || a.profile_id === can));
      assert.ok(exists(ayse) && exists(can) && exists(deniz));
      assert.equal(JSON.stringify(store.tables.astro_analyses.filter((a) => a.tenant_id === TB)), tbBefore);
    });

    await t("2026-10 KALICI DENETİM: B silme admin_audit_log'a started + succeeded yazar (kimlik + sayı; ad/doğum verisi YOK)", async () => {
      const z = await mkProfile(TA, IDS.u1, "Zehra Denetim", "1979-03-03");
      await mkAnalysis(IDS.u1, TA, z, null, "western.natal", "Zehra natal");
      const before = (store.tables.admin_audit_log ?? []).length;
      const pv = await P("u1", { mode: "single", profileIds: [z] });
      const d = await D("u1", { mode: "single", profileIds: [z], confirmToken: pv.json.confirmToken, confirmations: 2 });
      assert.equal(d.status, 200, d.text);
      assert.ok(!exists(z));
      const rows = (store.tables.admin_audit_log ?? []).slice(before);
      assert.deepEqual(rows.map((r) => (r.context as { phase: string }).phase), ["started", "succeeded"]);
      for (const r of rows) {
        assert.equal(r.action, "main_admin_critical_action");
        assert.equal(r.actor_admin_id, IDS.u1);
        assert.equal(r.actor_is_main_admin, true);
        const c = r.context as Record<string, unknown>;
        assert.equal(c.domain, "astrology");
        assert.equal(c.operation, "astro.profile.delete");
        assert.equal(c.tenantId, TA);
        assert.deepEqual(c.entityIds, [z]);
        const txt = JSON.stringify(r);
        assert.ok(!/Zehra|1979-03-03|İstanbul/.test(txt), "denetim kaydına kişisel veri yazılmaz");
      }
      assert.deepEqual(rows[1].result, { status: "succeeded", deletedProfiles: 1, deletedAnalyses: 1, preservedSharedAnalyses: 0 });
    });

    await t("2026-10 KALICI DENETİM fail-closed: audit yazılamazsa HİÇBİR ŞEY silinmez (503); RPC reddi → started + failed", async () => {
      const y = await mkProfile(TA, IDS.u1, "Yaren Denetim", "1981-04-04");
      const pv = await P("u1", { mode: "single", profileIds: [y] });
      const body = { mode: "single", profileIds: [y], confirmToken: pv.json.confirmToken, confirmations: 2 };
      store.failInsert = (tb) => (tb === "admin_audit_log" ? { code: "XX000", message: "audit down" } : null);
      try {
        const d = await D("u1", body);
        assert.equal(d.status, 503, d.text);
        assert.equal(d.json.code, "AUDIT_UNAVAILABLE");
        assert.ok(exists(y), "audit yoksa silme yok");
      } finally {
        store.failInsert = undefined;
      }
      // Başka tenant'ın kullanıcısı aynı profili silemez (404) ve bu deneme de denetlenir (started + failed).
      const before = (store.tables.admin_audit_log ?? []).length;
      const pvB = await P("ub", { mode: "single", profileIds: [y] });
      assert.equal(pvB.status, 404);
      const forged = await D("ub", body);
      assert.notEqual(forged.status, 200);
      assert.ok(exists(y));
      const ok = await D("u1", body);
      assert.equal(ok.status, 200, ok.text);
      const again = await D("u1", body);
      assert.equal(again.status, 404, again.text);
      const phases = (store.tables.admin_audit_log ?? []).slice(before).map((r) => `${(r.context as { phase: string }).phase}:${(r.result as { errorCode?: string }).errorCode ?? ""}`);
      assert.ok(phases.includes("started:") && phases.includes("succeeded:") && phases.includes("failed:PROFILE_NOT_FOUND"), phases.join(","));
    });

    await t("sınırlar: boş seçim / geçersiz kimlik / 100'den fazla → 400", async () => {
      assert.equal((await P("u1", { mode: "bulk", profileIds: [] })).status, 400);
      assert.equal((await P("u1", { mode: "bulk", profileIds: ["x"] })).status, 400);
      assert.equal((await P("u1", { mode: "bulk", profileIds: Array.from({ length: 101 }, () => randomUUID()) })).status, 400);
      assert.equal((await P("u1", { profileIds: [ayse] })).status, 400, "mod zorunlu");
    });
  } finally {
    console.error = origErr;
    restore();
  }
  console.log(`\nastrology phase7c (kalıcı silme) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase7c harness çöktü:", e);
  process.exit(1);
});
