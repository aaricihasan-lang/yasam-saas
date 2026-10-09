/**
 * ASTROLOJİ AŞAMA 7B — Danışan Listesi · Analiz geçmişi · Danışan eşleştirme / Ön İzleme · Arşiv · DY durumu.
 * GERÇEK route handler'ları + GERÇEK verifyAdminRequest + GERÇEK getServerDb; fetch yalnız sahte PostgREST'e
 * (20271101000400 RPC'lerini taklit eden bellek-içi depo) ve sahte Roxy'ye gider. SENTETİK kişiler.
 *
 *   • U1 + U2 aynı tenant (A), UB başka tenant (B); EXPERT (uzman rolü) ve ADMIN2 (owner olmayan admin) yetkisiz.
 *   • Aynı ad + soyad + doğum tarihli üç danışan (A) + aynı kimlikli bir danışan (B).
 *   • 230 doğum profili + tek profilde 205 kayıtlı analiz (200 sınırı yok).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase7b.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createFakeClient, createStore, installFetchShim, type FakeStore } from "./fakeSupabase";
import { astroNorm, maskPhone } from "@/lib/astrology/search/normalize";

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-7b";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));

const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IDS = {
  u1: "81818181-8181-4181-8181-818181818181",
  u2: "82828282-8282-4282-8282-828282828282",
  ub: "8b8b8b8b-8b8b-4b8b-8b8b-8b8b8b8b8b8b",
  expert: "8e8e8e8e-8e8e-4e8e-8e8e-8e8e8e8e8e8e",
  admin2: "8a8a8a8a-8a8a-4a8a-8a8a-8a8a8a8a8a8a",
};
type Who = keyof typeof IDS | "anon";
const TOK: Record<keyof typeof IDS, string> = { u1: "tok7b-u1-xxxxxxxxxxxx", u2: "tok7b-u2-xxxxxxxxxxxx", ub: "tok7b-ub-xxxxxxxxxxxx", expert: "tok7b-ex-xxxxxxxxxxxx", admin2: "tok7b-a2-xxxxxxxxxxxx" };
const K1 = "c7b70001-0000-4000-8000-000000000001";
const K2 = "c7b70002-0000-4000-8000-000000000002";
const K3 = "c7b70003-0000-4000-8000-000000000003";
const K4 = "c7b70004-0000-4000-8000-000000000004";
const KB = "c7b7000b-0000-4000-8000-00000000000b";

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
  clients: [
    // Aynı ad + soyad + doğum tarihi (farklı yazımlar), üç AYRI kişi; sağlık alanları ön izlemede GÖRÜNMEMELİ.
    { id: K1, tenant_id: TA, ad: "İlknur", soyad: "IŞIK", dogum: "1985-05-06", telefon: "0532 123 45 67", kan: "A Rh+", mizac: "safravi", gorusme: "2026-01-01", created_at: "2026-01-02T10:00:00Z" },
    { id: K2, tenant_id: TA, ad: "ilknur ", soyad: " ışık", dogum: "1985-05-06", telefon: null, kan: "0 Rh-", created_at: "2026-02-02T10:00:00Z" },
    { id: K3, tenant_id: TA, ad: "İLKNUR", soyad: "Işık", dogum: "1985-05-06", telefon: "05559876543", created_at: "2026-03-02T10:00:00Z" },
    { id: K4, tenant_id: TA, ad: "İlknur", soyad: "Işık", dogum: "1990-01-01", created_at: "2026-04-02T10:00:00Z" },
    { id: KB, tenant_id: TB, ad: "İlknur", soyad: "Işık", dogum: "1985-05-06", created_at: "2026-05-02T10:00:00Z" },
  ],
});
for (const w of Object.keys(TOK) as (keyof typeof IDS)[]) store.sessions.set(TOK[w], IDS[w]);

let roxyHits = 0;
const restore = installFetchShim({
  store,
  supabaseUrl: SUPA,
  roxyBase: ROXY_BASE,
  roxy: ({ body }) => {
    roxyHits += 1;
    const raw = structuredClone(FIXTURE);
    raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
    raw.houseSystem = body.houseSystem;
    return new Response(JSON.stringify(raw), { status: 200, headers: { "Content-Type": "application/json" } });
  },
});

function req(path: string, who: Who, method = "GET", body?: unknown): NextRequest {
  const h: Record<string, string> = who === "anon" ? {} : { "x-admin-id": IDS[who], "x-session-token": TOK[who] };
  if (body !== undefined) h["Content-Type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}
const texts: Record<string, string[]> = {};
async function call(who: Who, res: Promise<Response>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const r = await res;
  const text = await r.text();
  (texts[who] ??= []).push(text);
  return { status: r.status, json: JSON.parse(text), text };
}

async function main() {
  const profiles = await import("@/app/api/admin/astroloji/profiles/route");
  const profile = await import("@/app/api/admin/astroloji/profiles/[id]/route");
  const link = await import("@/app/api/admin/astroloji/profiles/[id]/client/route");
  const cands = await import("@/app/api/admin/astroloji/clients/candidates/route");
  const preview = await import("@/app/api/admin/astroloji/clients/[id]/preview/route");
  const status = await import("@/app/api/admin/astroloji/client-status/route");
  const analyses = await import("@/app/api/admin/astroloji/analyses/route");
  const analysisItem = await import("@/app/api/admin/astroloji/analyses/[id]/route");
  const run = await import("@/app/api/admin/astroloji/engine/run/route");
  const ctxP = (id: string) => ({ params: Promise.resolve({ id }) });
  const db = createFakeClient(store);
  const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };

  const origErr = console.error;
  console.error = () => undefined;
  try {
    await t("normalizasyon: TS = PG vektörleri (İ/I/ı/i, ğüşöç, büyük-küçük, boşluk); telefon maskesi", () => {
      assert.equal(astroNorm("  İLKNUR   IŞIK "), "ilknur isik");
      assert.equal(astroNorm("ılık İğde Üzüm Şeker Öğün Çay"), "ilik igde uzum seker ogun cay");
      assert.equal(astroNorm("Iİıi"), "iiii");
      assert.equal(astroNorm(null), "");
      assert.equal(maskPhone("0532 123 45 67"), "•••••••••67");
      assert.equal(maskPhone("12"), null);
    });

    // ─── Kurulum: 230 profil (U1) + U2 / UB kayıtları ─────────────────────────
    const created: string[] = [];
    let pk = "";
    await t("kurulum: U1 230 profil + 1 eşleşebilir profil; U2 3, UB 1 profil (RPC ile)", async () => {
      for (let i = 1; i <= 230; i += 1) {
        const d = new Date(Date.UTC(1990, 0, 1 + i)).toISOString().slice(0, 10);
        const r = await db.rpc("astro_profile_create", {
          p_tenant_id: TA, p_user_id: IDS.u1, p_client_id: null, p_label: `Sentetik Kişi ${String(i).padStart(3, "0")}`, p_birth_date: d, p_birth_time: null, p_time_known: false,
          p_time_accuracy: "unknown", p_location_id: "tr-06-ankara", p_location_label: "Ankara", p_latitude: 39.9, p_longitude: 32.8, p_timezone: "Europe/Istanbul", p_dst_choice: "auto",
          p_utc_offset_seconds: 10800, p_birth_utc: `${d}T09:00:00Z`,
        });
        created.push((r.data as { profile_id: string }).profile_id);
      }
      const c = await call("u1", profiles.POST(req("/api/admin/astroloji/profiles", "u1", "POST", { label: "İlknur Işık — natal", birthDate: "1985-05-06", birthTime: "08:15", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" })));
      assert.equal(c.status, 201, c.text);
      pk = (c.json.profile as { id: string }).id;
      for (let i = 1; i <= 3; i += 1) assert.equal((await call("u2", profiles.POST(req("/api/admin/astroloji/profiles", "u2", "POST", { label: `U2 İlknur ${i}`, birthDate: "1985-05-06", timeKnown: false, timeAccuracy: "unknown", locationId: "tr-06-ankara" })))).status, 201);
      assert.equal((await call("ub", profiles.POST(req("/api/admin/astroloji/profiles", "ub", "POST", { label: "UB İlknur", birthDate: "1985-05-06", timeKnown: false, timeAccuracy: "unknown", locationId: "tr-06-ankara" })))).status, 201);
    });

    await t("200'den fazla profil: sayfalar (≤100) 231 kaydın hepsini tekrarsız verir; toplam doğru; U2/UB sızmaz", async () => {
      const seen = new Set<string>();
      let offset = 0;
      let total = 0;
      for (let guard = 0; guard < 10; guard += 1) {
        const r = await call("u1", profiles.GET(req(`/api/admin/astroloji/profiles?sort=name&limit=100&offset=${offset}`, "u1")));
        assert.equal(r.status, 200);
        const rows = r.json.profiles as { id: string; label: string }[];
        assert.ok(rows.length <= 100);
        total = r.json.total as number;
        for (const p of rows) {
          assert.ok(!p.label.startsWith("U2") && !p.label.startsWith("UB"), "başka uzman kaydı");
          seen.add(p.id);
        }
        if (!r.json.hasMore) break;
        offset += rows.length;
      }
      assert.equal(total, 231);
      assert.equal(seen.size, 231);
      assert.ok(created.every((id) => seen.has(id)), "eski kayıt erişilemez kaldı");
      const big = await call("u1", profiles.GET(req("/api/admin/astroloji/profiles?limit=5000", "u1")));
      assert.equal((big.json.profiles as unknown[]).length, 100, "sayfa üst sınırı 100");
      const u2 = await call("u2", profiles.GET(req("/api/admin/astroloji/profiles", "u2")));
      assert.equal(u2.json.total, 3);
    });

    await t("Türkçe arama İ/i/ı/I + boşluk + büyük-küçük; doğum tarihi filtresi; % joker değil; geçersiz tarih 400", async () => {
      for (const q of ["İLKNUR", "ilknur ışık", "  IŞIK ", "isik", "ılknur"]) {
        const r = await call("u1", profiles.GET(req(`/api/admin/astroloji/profiles?q=${encodeURIComponent(q)}`, "u1")));
        assert.deepEqual((r.json.profiles as { id: string }[]).map((p) => p.id), [pk], `q=${q}`);
      }
      assert.equal(((await call("u1", profiles.GET(req("/api/admin/astroloji/profiles?q=%25", "u1")))).json.profiles as unknown[]).length, 0);
      const bd = await call("u1", profiles.GET(req("/api/admin/astroloji/profiles?birthDate=1985-05-06", "u1")));
      assert.deepEqual((bd.json.profiles as { id: string }[]).map((p) => p.id), [pk]);
      assert.equal((await call("u1", profiles.GET(req("/api/admin/astroloji/profiles?birthDate=1985-13-40", "u1")))).status, 400);
      const u2 = await call("u2", profiles.GET(req("/api/admin/astroloji/profiles?q=ilknur", "u2")));
      assert.equal(u2.json.total, 3, "U2 yalnız kendi 3 kaydını bulur");
      assert.ok(!u2.text.includes(pk));
    });

    // ─── Gerçek akış: hesap + 2 kayıtlı analiz (Roxy sahte) ─────────────────────
    let savedA = "";
    await t("kayıtlı analizi açmak 0 Roxy çağrısı (gerçek kaydet → aç akışı)", async () => {
      const r = await call("u1", run.POST(req("/api/admin/astroloji/engine/run", "u1", "POST", { profileId: pk, selections: [NATAL] })));
      assert.equal(r.status, 200, r.text.slice(0, 200));
      for (let i = 0; i < 2; i += 1) {
        const s = await call("u1", analyses.POST(req("/api/admin/astroloji/analyses", "u1", "POST", { profileId: pk, revision: 1, ...NATAL, includeProviderInterp: false, saveRequestId: randomUUID(), title: `Gerçek natal ${i + 1}` })));
        assert.equal(s.status, 201, s.text);
        savedA = s.json.analysisId as string;
      }
      const h = roxyHits;
      const o = await call("u1", analysisItem.GET(req(`/api/admin/astroloji/analyses/${savedA}`, "u1"), ctxP(savedA)));
      assert.equal(o.status, 200);
      assert.equal(roxyHits, h, "açmak Roxy çağırdı");
    });

    await t("200'den fazla kayıtlı analiz: 205 ek analiz → gruplar yalnız mevcut gelenek/teknikler; Batı sayfaları eksiksiz; profil satırında sayı", async () => {
      for (let i = 1; i <= 205; i += 1) {
        const technique = i % 3 === 0 ? "vedic.d1" : i % 3 === 1 ? "western.natal" : "kp.chart";
        await db.rpc("astro_analysis_save_v2", {
          p_tenant_id: TA, p_user_id: IDS.u1, p_profile_id: pk, p_profile_revision: 1, p_partner_profile_id: null, p_partner_profile_revision: null, p_result_ids: [],
          p_technique: technique, p_title: `Analiz ${i}`, p_save_request_id: randomUUID(), p_technique_params: {}, p_profile_snapshot: { label: "İlknur Işık — natal" },
          p_method_snapshot: {}, p_technical_snapshot: {}, p_kb_snapshot: [], p_provider_interp_included: false, p_provider_interp_snapshot: null, p_versions_snapshot: {}, p_notes: [],
        });
      }
      const first = await call("u1", analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${pk}`, "u1")));
      assert.equal(first.status, 200);
      assert.equal(first.json.total, 207);
      const groups = first.json.groups as { tradition: string; count: number; techniques: { technique: string; count: number }[] }[];
      assert.deepEqual(groups.map((g) => g.tradition), ["western", "vedic", "kp"]);
      assert.deepEqual(groups.map((g) => g.count), [71, 68, 68]);
      assert.deepEqual(groups.map((g) => g.techniques.map((x) => x.technique)), [["western.natal"], ["vedic.d1"], ["kp.chart"]], "yalnız mevcut teknikler");
      const seen = new Set<string>();
      let offset = 0;
      for (let guard = 0; guard < 10; guard += 1) {
        const r = await call("u1", analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${pk}&tradition=western&limit=30&offset=${offset}`, "u1")));
        const rows = r.json.analyses as { id: string; technique: string; techniqueLabel: string }[];
        for (const a of rows) {
          assert.ok(a.technique.startsWith("western."));
          seen.add(a.id);
        }
        if (!r.json.hasMore) break;
        offset += rows.length;
      }
      assert.equal(seen.size, 71);
      const kp = await call("u1", analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${pk}&tradition=kp&limit=1`, "u1")));
      assert.match((kp.json.analyses as { techniqueLabel: string }[])[0].techniqueLabel, /^KP · /, "KP etiketi");
      const row = await call("u1", profiles.GET(req(`/api/admin/astroloji/profiles?q=natal`, "u1")));
      assert.equal((row.json.profiles as { analysisCount: number }[])[0].analysisCount, 207);
      assert.equal((await call("u1", analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${pk}&tradition=xyz`, "u1")))).status, 400);
      assert.equal((await call("u2", analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${pk}`, "u2")))).status, 404, "U2 U1 analiz geçmişini göremez");
    });

    // ─── Danışan adayları + Ön İzleme ──────────────────────────────────────────
    await t("adaylar: aynı ad/soyad/doğum tarihli ÜÇ ayrı kayıt; Türkçe yazım farkları; başka tenant yok; kısa arama 400", async () => {
      const r = await call("u1", cands.GET(req(`/api/admin/astroloji/clients/candidates?name=${encodeURIComponent("İlknur Işık")}&birthDate=1985-05-06`, "u1")));
      assert.equal(r.status, 200);
      const ids = (r.json.candidates as { id: string; ref: string }[]).map((c) => c.id).sort();
      assert.deepEqual(ids, [K1, K2, K3].sort());
      const r2 = await call("u1", cands.GET(req(`/api/admin/astroloji/clients/candidates?name=${encodeURIComponent("ILKNUR ISIK")}`, "u1")));
      assert.equal((r2.json.candidates as unknown[]).length, 4);
      assert.ok(!r2.text.includes(KB), "başka tenant danışanı aday");
      const rb = await call("ub", cands.GET(req(`/api/admin/astroloji/clients/candidates?name=${encodeURIComponent("İlknur Işık")}`, "ub")));
      assert.deepEqual((rb.json.candidates as { id: string }[]).map((c) => c.id), [KB]);
      assert.equal((await call("u1", cands.GET(req("/api/admin/astroloji/clients/candidates?name=i", "u1")))).status, 400);
      assert.ok(!r.text.includes("kan") && !r.text.includes("safravi"), "aday listesinde sağlık alanı");
    });

    await t("ön izleme: yalnız ayırt edici alanlar (maskeli telefon); kan/mizaç/görüşme YOK; başka tenant / geçersiz ID 404", async () => {
      const logStart = store.log.length;
      const p = await call("u1", preview.GET(req(`/api/admin/astroloji/clients/${K1}/preview`, "u1"), ctxP(K1)));
      assert.equal(p.status, 200);
      // Sağlık / görüşme kolonları DB'den OKUNMAZ (yalnız yanıttan süzülmek yetmez).
      const clientSelects = store.log.slice(logStart).filter((l) => l.table === "clients").map((l) => l.select);
      assert.ok(clientSelects.length > 0 && clientSelects.every((s) => !/\*|kan|mizac|gorusme|saglik|email/.test(s)), `clients sorgusu: ${clientSelects.join(" | ")}`);
      const c = p.json.client as Record<string, unknown>;
      assert.deepEqual(Object.keys(c).sort(), ["birthDate", "createdAt", "id", "linkedProfiles", "name", "phoneMasked", "ref"]);
      assert.equal(c.phoneMasked, "•••••••••67");
      for (const bad of ["Rh", "safravi", "2026-01-01", "0532", "123 45"]) assert.ok(!p.text.includes(bad), `ön izlemede ${bad}`);
      assert.equal((await call("u1", preview.GET(req(`/api/admin/astroloji/clients/${KB}/preview`, "u1"), ctxP(KB)))).status, 404);
      assert.equal((await call("ub", preview.GET(req(`/api/admin/astroloji/clients/${K1}/preview`, "ub"), ctxP(K1)))).status, 404);
      assert.equal((await call("u1", preview.GET(req(`/api/admin/astroloji/clients/xyz/preview`, "u1"), ctxP("xyz")))).status, 404);
    });

    // ─── Eşleştirme ─────────────────────────────────────────────────────────────
    await t("eşleştir: açık istek; yeniden bağlama onaysız 409; bayat beklenen bağ 409; onayla 200; yabancı/var olmayan danışan 404", async () => {
      const L = (who: Who, body: unknown, pid = pk) => call(who, link.PUT(req(`/api/admin/astroloji/profiles/${pid}/client`, who, "PUT", body), ctxP(pid)));
      assert.equal((await L("u1", { clientId: K1, expectedClientId: null })).status, 200);
      const re = await L("u1", { clientId: K2, expectedClientId: K1 });
      assert.equal(re.status, 409);
      assert.equal(re.json.code, "RELINK_CONFIRM_REQUIRED");
      assert.equal((re.json.currentClient as { id: string }).id, K1);
      const stale = await L("u1", { clientId: K2, expectedClientId: null, confirmRelink: true });
      assert.equal(stale.status, 409);
      assert.equal(stale.json.code, "CLIENT_LINK_CONFLICT");
      assert.equal((await L("u1", { clientId: K2, expectedClientId: K1, confirmRelink: true })).status, 200);
      assert.equal((await L("u1", { clientId: KB, expectedClientId: K2, confirmRelink: true })).status, 404, "başka tenant danışanı");
      assert.equal((await L("u1", { clientId: "deadbeef-0000-4000-8000-000000000000", expectedClientId: K2, confirmRelink: true })).status, 404);
      assert.equal((await L("u1", { clientId: "x", expectedClientId: K2 })).status, 400);
      assert.equal(store.tables.astro_birth_profiles.find((p) => p.id === pk)!.client_id, K2, "reddedilen istek bağı değiştirdi");
    });

    await t("başka uzman / başka tenant U1 profilini eşleştiremez, kaldıramaz, arşivleyemez (404); UB kendi profilini A danışanına bağlayamaz", async () => {
      for (const who of ["u2", "ub"] as const) {
        assert.equal((await call(who, link.PUT(req(`/api/admin/astroloji/profiles/${pk}/client`, who, "PUT", { clientId: K3, expectedClientId: K2, confirmRelink: true }), ctxP(pk)))).status, 404);
        assert.equal((await call(who, link.DELETE(req(`/api/admin/astroloji/profiles/${pk}/client?expectedClientId=${K2}`, who, "DELETE"), ctxP(pk)))).status, 404);
        assert.equal((await call(who, profile.PATCH(req(`/api/admin/astroloji/profiles/${pk}`, who, "PATCH", { archived: true }), ctxP(pk)))).status, 404);
      }
      const ubList = await call("ub", profiles.GET(req("/api/admin/astroloji/profiles", "ub")));
      const ubPid = (ubList.json.profiles as { id: string }[])[0].id;
      assert.equal((await call("ub", link.PUT(req(`/api/admin/astroloji/profiles/${ubPid}/client`, "ub", "PUT", { clientId: K1, expectedClientId: null }), ctxP(ubPid)))).status, 404, "farklı tenant danışanı");
      const p = store.tables.astro_birth_profiles.find((x) => x.id === pk)!;
      assert.equal(p.client_id, K2);
      assert.ok(!p.archived_at);
    });

    await t("DY durum: eşleşme + çok analiz → has_analyses; eşleşme var analiz yok → no_analyses; eşleşme yok → not_linked; U2 / UB görmez", async () => {
      const S = async (who: Who, cid: string) => (await call(who, status.GET(req(`/api/admin/astroloji/client-status?clientId=${cid}`, who)))).json;
      const s2 = await S("u1", K2);
      assert.equal(s2.status, "has_analyses");
      assert.equal(s2.analysisCount, 207);
      // Eşleşme var, analiz yok: başka bir profil K3'e.
      const other = created[0];
      assert.equal((await call("u1", link.PUT(req(`/api/admin/astroloji/profiles/${other}/client`, "u1", "PUT", { clientId: K3, expectedClientId: null }), ctxP(other)))).status, 200);
      assert.equal((await S("u1", K3)).status, "no_analyses");
      assert.equal((await S("u1", K1)).status, "not_linked");
      assert.equal((await S("u2", K2)).status, "not_linked", "U2 U1 eşleştirmesini görür");
      assert.equal((await S("ub", K2)).status, "not_linked");
      const keys = Object.keys(s2).sort();
      assert.deepEqual(keys, ["analysisCount", "lastAnalysisAt", "ok", "status"], "durum ucu içerik sızdırıyor");
    });

    await t("eşleştirmeyi kaldır: onaysız (expected yok) 400; kaldırınca profil + 207 analiz AYNEN, durum not_linked", async () => {
      const before = store.tables.astro_analyses.filter((a) => a.profile_id === pk).length;
      assert.equal((await call("u1", link.DELETE(req(`/api/admin/astroloji/profiles/${pk}/client`, "u1", "DELETE"), ctxP(pk)))).status, 400);
      const d = await call("u1", link.DELETE(req(`/api/admin/astroloji/profiles/${pk}/client?expectedClientId=${K2}`, "u1", "DELETE"), ctxP(pk)));
      assert.equal(d.status, 200, d.text);
      assert.equal(store.tables.astro_analyses.filter((a) => a.profile_id === pk).length, before);
      assert.ok(store.tables.astro_birth_profiles.some((p) => p.id === pk && p.client_id === null));
      assert.equal((await call("u1", status.GET(req(`/api/admin/astroloji/client-status?clientId=${K2}`, "u1")))).json.status, "not_linked");
      const o = await call("u1", analysisItem.GET(req(`/api/admin/astroloji/analyses/${savedA}`, "u1"), ctxP(savedA)));
      assert.equal(o.status, 200);
    });

    await t("Danışan Yolculuğu kaydı silinir (FK SET NULL) → profil/analizler korunur; bozuk bağ (danışan yok) güvenli: clientMissing, ad yok", async () => {
      // K3'e bağlı profil: DB'deki gibi danışan silinince bağ NULL.
      const other = created[0];
      store.tables.clients = store.tables.clients.filter((c) => c.id !== K3);
      for (const p of store.tables.astro_birth_profiles) if (p.client_id === K3) p.client_id = null;
      const d = await call("u1", profile.GET(req(`/api/admin/astroloji/profiles/${other}`, "u1"), ctxP(other)));
      assert.equal(d.status, 200);
      assert.equal((d.json.profile as { clientId: string | null }).clientId, null);
      assert.equal((await call("u1", status.GET(req(`/api/admin/astroloji/client-status?clientId=${K3}`, "u1")))).json.status, "not_linked");
      // FK'siz bir ortamda kalabilecek bozuk bağ: danışan satırı yok ama client_id duruyor.
      const ghost = "c7b700ff-0000-4000-8000-0000000000ff";
      store.tables.astro_birth_profiles.find((p) => p.id === created[1])!.client_id = ghost;
      const g = await call("u1", profile.GET(req(`/api/admin/astroloji/profiles/${created[1]}`, "u1"), ctxP(created[1])));
      assert.equal((g.json.profile as { clientMissing: boolean; clientName: string | null }).clientMissing, true);
      assert.equal((g.json.profile as { clientName: string | null }).clientName, null);
      const un = await call("u1", link.DELETE(req(`/api/admin/astroloji/profiles/${created[1]}/client?expectedClientId=${ghost}`, "u1", "DELETE"), ctxP(created[1])));
      assert.equal(un.status, 200, "bozuk bağ kaldırılabilir");
    });

    await t("arşiv: gizlenir, Arşiv filtresinde bulunur (analiz sayısı aynen), analiz açılır, geri alınır; geçersiz gövde 400", async () => {
      assert.equal((await call("u1", profile.PATCH(req(`/api/admin/astroloji/profiles/${pk}`, "u1", "PATCH", { archived: "evet" }), ctxP(pk)))).status, 400);
      const a = await call("u1", profile.PATCH(req(`/api/admin/astroloji/profiles/${pk}`, "u1", "PATCH", { archived: true }), ctxP(pk)));
      assert.equal(a.status, 200, a.text);
      assert.equal(((await call("u1", profiles.GET(req("/api/admin/astroloji/profiles?q=natal", "u1")))).json.profiles as unknown[]).length, 0);
      const ar = await call("u1", profiles.GET(req("/api/admin/astroloji/profiles?q=natal&archived=1", "u1")));
      assert.deepEqual((ar.json.profiles as { id: string; analysisCount: number }[]).map((p) => [p.id, p.analysisCount]), [[pk, 207]]);
      const h = roxyHits;
      assert.equal((await call("u1", analysisItem.GET(req(`/api/admin/astroloji/analyses/${savedA}`, "u1"), ctxP(savedA)))).status, 200);
      assert.equal(roxyHits, h);
      assert.equal((await call("u1", profile.PATCH(req(`/api/admin/astroloji/profiles/${pk}`, "u1", "PATCH", { archived: false }), ctxP(pk)))).status, 200);
      assert.equal(((await call("u1", profiles.GET(req("/api/admin/astroloji/profiles?q=natal", "u1")))).json.profiles as unknown[]).length, 1);
      assert.equal(store.tables.astro_analyses.filter((x) => x.profile_id === pk).length, 207);
    });

    await t("Astroloji yetkisi olmayan kullanıcı (uzman / owner olmayan admin / oturumsuz): tüm 7B uçları tek tip 404, DB'ye astroloji sorgusu yok", async () => {
      const n0 = store.log.filter((l) => l.table.startsWith("rpc:astro_") || l.table.startsWith("astro_")).length;
      for (const who of ["expert", "admin2", "anon"] as const) {
        const rs = [
          profiles.GET(req("/api/admin/astroloji/profiles", who)),
          profile.PATCH(req(`/api/admin/astroloji/profiles/${pk}`, who, "PATCH", { archived: true }), ctxP(pk)),
          link.PUT(req(`/api/admin/astroloji/profiles/${pk}/client`, who, "PUT", { clientId: K1, expectedClientId: null }), ctxP(pk)),
          link.DELETE(req(`/api/admin/astroloji/profiles/${pk}/client?expectedClientId=${K1}`, who, "DELETE"), ctxP(pk)),
          cands.GET(req("/api/admin/astroloji/clients/candidates?name=ilknur", who)),
          preview.GET(req(`/api/admin/astroloji/clients/${K1}/preview`, who), ctxP(K1)),
          status.GET(req(`/api/admin/astroloji/client-status?clientId=${K1}`, who)),
          analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${pk}`, who)),
        ];
        for (const r of rs) {
          const x = await call(who, r);
          assert.equal(x.status, 404, `${who}: ${x.text}`);
          assert.deepEqual(x.json, { ok: false, error: "Bulunamadı." });
        }
      }
      const n1 = store.log.filter((l) => l.table.startsWith("rpc:astro_") || l.table.startsWith("astro_")).length;
      assert.equal(n1, n0, "yetkisiz isteklerde astroloji verisine dokunuldu");
    });

    await t("sızıntı: U2 / UB yanıtlarının hiçbirinde U1 profil adları, kimliği veya danışan bağı yok", () => {
      for (const who of ["u2", "ub"]) {
        const all = (texts[who] ?? []).join("\n");
        for (const secret of [pk, "İlknur Işık — natal", "Sentetik Kişi", "Gerçek natal"]) assert.ok(!all.includes(secret), `${who}: ${secret}`);
      }
    });
  } finally {
    console.error = origErr;
    restore();
  }
  console.log(`\nastrology phase7b harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase7b harness çöktü:", e);
  process.exit(1);
});
