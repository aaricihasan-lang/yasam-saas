/**
 * ASTROLOJİ AŞAMA 7A — UZMAN VERİ İZOLASYONU + DANIŞAN SİLME GÜVENLİĞİ (gerçek DB / gerçek Roxy YOK).
 *
 * GERÇEK route handler'ları + GERÇEK verifyAdminRequest + GERÇEK getServerDb; fetch yalnız sahte
 * PostgREST'e (20271101000300 kısıtlarını taklit eden bellek-içi depo) ve sahte Roxy'ye gider.
 *
 * Senaryo (SENTETİK kişiler):
 *   • U1 ve U2 AYNI tenant'ta iki ayrı yetkili kullanıcı; UB başka tenant'ta. Modül bugün yalnız
 *     owner'a açık olduğundan üçü de owner kapısından geçen hesaplardır — kapı değil, VERİ sınırı sınanır.
 *   • Aynı ad + soyad + doğum tarihli üç ayrı danışan (tenant A).
 *   • U2 ve UB, U1'in profil / revizyon / sonuç / yorum / analiz / not / KB kimlikleriyle DOĞRUDAN
 *     her API yolunu dener → hepsi 404 (ya da boş), Roxy çağrısı yok, U1 verisi değişmez.
 *   • Önbellek: U2 aynı doğum verisiyle hesaplarsa U1'in sonucu YENİDEN KULLANILMAZ.
 *   • Danışan silme (Danışan Yolculuğu) sonrası Astroloji kayıtları ve snapshot'lar korunur.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase7a.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { createStore, installFetchShim, type FakeStore } from "./fakeSupabase";

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-7a";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));
const NARR = "[RXN-sun-summary]";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IDS = {
  u1: "71717171-7171-4171-8171-717171717171",
  u2: "72727272-7272-4272-8272-727272727272",
  ub: "7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b",
};
const TOK = { u1: "tok-u1-aaaaaaaaaaaaaaaaaa", u2: "tok-u2-bbbbbbbbbbbbbbbbbb", ub: "tok-ub-cccccccccccccccccc" };
type Who = keyof typeof IDS;
// Aynı ad + soyad + doğum tarihi, üç AYRI danışan.
const K = ["c7c70001-0000-4000-8000-000000000001", "c7c70002-0000-4000-8000-000000000002", "c7c70003-0000-4000-8000-000000000003"];

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
    { id: IDS.u1, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_A, email: "u1@sentetik.test" },
    { id: IDS.u2, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_A, email: "u2@sentetik.test" },
    { id: IDS.ub, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_B, email: "ub@sentetik.test" },
  ],
  clients: K.map((id) => ({ id, tenant_id: TENANT_A, ad: "Deneme", soyad: "Kişi", dogum: "1991-02-03" })),
});
for (const w of Object.keys(TOK) as Who[]) store.sessions.set(TOK[w], IDS[w]);

let roxyHits = 0;
/** Sahte Roxy anlatısına kimin hesabı olduğunu gömer → başka uzmana sızıntı metinden yakalanır. */
let narrativeTag = "";
const restore = installFetchShim({
  store,
  supabaseUrl: SUPA,
  roxyBase: ROXY_BASE,
  roxy: ({ url, body }) => {
    roxyHits += 1;
    assert.ok(url.startsWith(`${ROXY_BASE}/astrology/natal-chart?lang=tr`), `beklenmeyen Roxy URL: ${url}`);
    const raw = JSON.parse(JSON.stringify(FIXTURE).split(NARR).join(`${NARR}${narrativeTag}`));
    raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
    raw.houseSystem = body.houseSystem;
    return new Response(JSON.stringify(raw), { status: 200, headers: { "Content-Type": "application/json" } });
  },
});

function req(path: string, who: Who, method = "GET", body?: unknown): NextRequest {
  const h: Record<string, string> = { "x-admin-id": IDS[who], "x-session-token": TOK[who] };
  if (body !== undefined) h["Content-Type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

const bodiesBy: Record<Who, string[]> = { u1: [], u2: [], ub: [] };
async function call(who: Who, res: Promise<Response>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const r = await res;
  const text = await r.text();
  bodiesBy[who].push(text);
  return { status: r.status, json: JSON.parse(text), text };
}

async function main() {
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

  const ctxP = (id: string) => ({ params: Promise.resolve({ id }) });
  const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
  const birth = { birthDate: "1991-02-03", birthTime: "10:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" };
  const createProfile = async (who: Who, label: string, clientId: string | null) => {
    let r = await call(who, profiles.POST(req("/api/admin/astroloji/profiles", who, "POST", { label, clientId, ...birth })));
    // 2026-10-16: aynı kimlikli danışanlar bilerek ayrı profil alır → açık "Farklı kişi olarak devam et" onayı.
    if (r.status === 409 && r.json.code === "DUPLICATE_PROFILE") {
      const ids = (r.json.duplicates as { profileId: string }[]).map((d) => d.profileId);
      r = await call(who, profiles.POST(req("/api/admin/astroloji/profiles", who, "POST", { label, clientId, ...birth, confirmDifferentPerson: ids })));
    }
    assert.equal(r.status, 201, r.text.slice(0, 300));
    return (r.json.profile as { id: string }).id;
  };

  const origErr = console.error;
  console.error = () => undefined;
  try {
    // ─── Kurulum: U1'in verisi ───────────────────────────────────────────────
    const p1: string[] = [];
    let r1 = "";
    let a1 = "";
    let kb1 = "";
    let a1Body = "";
    let r2 = "";
    await t("kurulum: U1 aynı kimlikli 3 danışana 3 ayrı profil; natal hesap + not + KB + kayıtlı analiz (yorum dahil)", async () => {
      for (let i = 0; i < 3; i += 1) p1.push(await createProfile("u1", `Deneme Kişi (${i + 1}) — natal`, K[i]));
      assert.equal(new Set(p1).size, 3);
      const list = await call("u1", profiles.GET(req("/api/admin/astroloji/profiles", "u1")));
      const rows = list.json.profiles as { id: string; clientId: string }[];
      assert.deepEqual(rows.map((x) => x.clientId).sort(), [...K].sort(), "her profil KENDİ danışanına bağlı");

      narrativeTag = "<U1-GIZLI>";
      const run1 = await call("u1", run.POST(req("/api/admin/astroloji/engine/run", "u1", "POST", { profileId: p1[0], selections: [NATAL] })));
      assert.equal(run1.status, 200, run1.text.slice(0, 300));
      assert.equal(roxyHits, 1);
      assert.ok(run1.text.includes("<U1-GIZLI>"), "U1 kendi yorumunu görür");
      r1 = ((run1.json.results as { view: { id: string } }[])[0]).view.id;

      const n = await call("u1", notes.PUT(req("/api/admin/astroloji/notes", "u1", "PUT", { profileId: p1[0], sectionKey: "overall", body: "U1 danışan yorumu", expectedRevision: null })));
      assert.equal(n.status, 201, n.text);
      const k = await call("u1", kbList.POST(req("/api/admin/astroloji/kb", "u1", "POST", { tradition: "western", topicKey: "planet_in_house:saturn:7", title: "U1 KB", body: "U1 mesleki notu" })));
      assert.equal(k.status, 201, k.text);
      kb1 = (k.json.entry as { id: string }).id;
      const sv = await call("u1", analyses.POST(req("/api/admin/astroloji/analyses", "u1", "POST", { profileId: p1[0], revision: 1, ...NATAL, includeProviderInterp: true, saveRequestId: "5a5a5a5a-0001-4a5a-8a5a-5a5a5a5a5a51" })));
      assert.equal(sv.status, 201, sv.text);
      a1 = sv.json.analysisId as string;
      const open = await call("u1", analysisItem.GET(req(`/api/admin/astroloji/analyses/${a1}`, "u1"), ctxP(a1)));
      assert.equal(open.status, 200);
      assert.ok(open.text.includes("<U1-GIZLI>") && open.text.includes("U1 danışan yorumu"));
      a1Body = open.text;
    });

    // ─── Doğrudan ID saldırıları: aynı tenant (U2) + başka tenant (UB) ───────────
    for (const who of ["u2", "ub"] as const) {
      const tag = who === "u2" ? "aynı tenant başka uzman" : "başka tenant";
      await t(`${tag}: profil listesi boş; U1 profil ID'siyle detay / revizyon ekleme 404`, async () => {
        const list = await call(who, profiles.GET(req("/api/admin/astroloji/profiles", who)));
        assert.equal(list.status, 200);
        assert.deepEqual(list.json.profiles, []);
        for (const id of p1) assert.equal((await call(who, profile.GET(req(`/api/admin/astroloji/profiles/${id}`, who), ctxP(id)))).status, 404);
        const rv = await call(who, revisions.POST(req(`/api/admin/astroloji/profiles/${p1[0]}/revisions`, who, "POST", { ...birth, birthTime: "11:00", timeAccuracy: "rectified", expectedRevision: 1 }), ctxP(p1[0])));
        assert.equal(rv.status, 404, rv.text);
        assert.equal(store.tables.astro_birth_profiles.find((p) => p.id === p1[0])!.current_revision, 1, "U1 profili değişti");
      });

      await t(`${tag}: U1 profiliyle plan / run / view → 404, Roxy çağrısı yok`, async () => {
        const h = roxyHits;
        for (const route of [plan, run, viewRoute]) {
          const r = await call(who, route.POST(req("/api/admin/astroloji/engine/x", who, "POST", { profileId: p1[0], selections: [NATAL] })));
          assert.equal(r.status, 404, r.text.slice(0, 200));
        }
        assert.equal(roxyHits, h);
      });

      await t(`${tag}: önbellekten yetkisiz sonuç — U1 sonuç ID'si (tek başına / kendi profiliyle / U1 profiliyle) 404`, async () => {
        assert.equal((await call(who, result.GET(req(`/api/admin/astroloji/results/${r1}`, who), ctxP(r1)))).status, 404);
        assert.equal((await call(who, result.GET(req(`/api/admin/astroloji/results/${r1}?profileId=${p1[0]}&revision=1`, who), ctxP(r1)))).status, 404);
        const own = await createProfile(who, `${who} kendi profili`, null);
        assert.equal((await call(who, result.GET(req(`/api/admin/astroloji/results/${r1}?profileId=${own}&revision=1`, who), ctxP(r1)))).status, 404);
        // Aşama 2 uyumluluk yolu (resultId ile çalışma alanı / önizleme) da yabancı sonucu açmaz.
        assert.equal((await call(who, workspace.GET(req(`/api/admin/astroloji/workspace?profileId=${own}&revision=1&resultId=${r1}`, who)))).status, 404);
      });

      await t(`${tag}: kayıtlı analiz ID'siyle aç 404; liste U1 analizini içermez; önizleme / kaydet U1 profiliyle 404`, async () => {
        assert.equal((await call(who, analysisItem.GET(req(`/api/admin/astroloji/analyses/${a1}`, who), ctxP(a1)))).status, 404);
        const list = await call(who, analyses.GET(req(`/api/admin/astroloji/analyses?profileId=${p1[0]}`, who)));
        assert.ok(list.status === 404 || (list.status === 200 && (list.json.analyses as unknown[]).length === 0), list.text);
        const body = { profileId: p1[0], revision: 1, ...NATAL, includeProviderInterp: true };
        assert.equal((await call(who, analysesPreview.POST(req("/api/admin/astroloji/analyses/preview", who, "POST", body)))).status, 404);
        assert.equal((await call(who, analyses.POST(req("/api/admin/astroloji/analyses", who, "POST", { ...body, saveRequestId: "5a5a5a5a-0001-4a5a-8a5a-5a5a5a5a5a51" })))).status, 404);
      });

      await t(`${tag}: U1 profiline çalışma alanı / not yazma 404; U1 KB kaydını oku / düzenle / sil 404`, async () => {
        assert.equal((await call(who, workspace.POST(req("/api/admin/astroloji/workspace", who, "POST", { profileId: p1[0], revision: 1, ...NATAL })))).status, 404);
        assert.equal((await call(who, notes.PUT(req("/api/admin/astroloji/notes", who, "PUT", { profileId: p1[0], sectionKey: "overall", body: "saldırı", expectedRevision: null })))).status, 404);
        assert.equal((await call(who, notes.PUT(req("/api/admin/astroloji/notes", who, "PUT", { profileId: p1[0], sectionKey: "overall", body: "saldırı", expectedRevision: 1 })))).status, 404);
        assert.equal((await call(who, kbItem.GET(req(`/api/admin/astroloji/kb/${kb1}`, who), ctxP(kb1)))).status, 404);
        assert.equal((await call(who, kbItem.PATCH(req(`/api/admin/astroloji/kb/${kb1}`, who, "PATCH", { tradition: "western", topicKey: "planet_in_house:saturn:7", title: "x", body: "x", expectedRevision: 1 }), ctxP(kb1)))).status, 404);
        assert.equal((await call(who, kbItem.DELETE(req(`/api/admin/astroloji/kb/${kb1}?expectedRevision=1`, who, "DELETE"), ctxP(kb1)))).status, 404);
        const kbl = await call(who, kbList.GET(req("/api/admin/astroloji/kb", who)));
        assert.ok(!kbl.text.includes("U1 mesleki notu"));
        assert.equal(store.tables.astro_expert_notes.filter((x) => x.body === "saldırı").length, 0);
        assert.equal(store.tables.astro_kb_entries.find((x) => x.id === kb1)!.title, "U1 KB");
      });
    }

    await t("aynı tenant başka uzman: sinastri/kompozitte karşı taraf olarak U1 profili → PARTNER_NOT_FOUND, Roxy yok", async () => {
      const own = await createProfile("u2", "U2 sinastri profili", null);
      const h = roxyHits;
      const sel = (technique: string) => ({ technique, options: { partnerProfileId: p1[0], houseSystem: "placidus", nodeType: "true" } });
      const pl = await call("u2", plan.POST(req("/api/admin/astroloji/engine/plan", "u2", "POST", { profileId: own, selections: [sel("western.synastry"), sel("western.composite")] })));
      assert.equal(pl.status, 200, pl.text);
      const sels = (pl.json.plan as { selections: { blocked: { code: string } | null }[] }).selections;
      assert.deepEqual(sels.map((x) => x.blocked?.code), ["PARTNER_NOT_FOUND", "PARTNER_NOT_FOUND"]);
      const rn = await call("u2", run.POST(req("/api/admin/astroloji/engine/run", "u2", "POST", { profileId: own, selections: [sel("western.synastry")] })));
      assert.ok(!rn.text.includes("Deneme Kişi"), "U1 profil adı sızdı");
      assert.equal(roxyHits, h);
    });

    await t("önbellek: U2 AYNI doğum verisiyle hesaplar → U1 sonucu yeniden KULLANILMAZ (yeni istek, ayrı satır); U1 tekrar = 0 istek", async () => {
      const own = await createProfile("u2", "U2 — aynı doğum verisi", null);
      narrativeTag = "<U2-YORUM>";
      const h = roxyHits;
      const pl = await call("u2", plan.POST(req("/api/admin/astroloji/engine/plan", "u2", "POST", { profileId: own, selections: [NATAL] })));
      assert.equal((pl.json.plan as { newRequestCount: number }).newRequestCount, 1, "U2 planı U1 önbelleğini görmemeli");
      const rn = await call("u2", run.POST(req("/api/admin/astroloji/engine/run", "u2", "POST", { profileId: own, selections: [NATAL] })));
      assert.equal(rn.status, 200, rn.text.slice(0, 300));
      assert.equal(roxyHits, h + 1);
      r2 = ((rn.json.results as { view: { id: string } }[])[0]).view.id;
      assert.notEqual(r2, r1);
      assert.ok(rn.text.includes("<U2-YORUM>") && !rn.text.includes("<U1-GIZLI>"), "U2 yalnız kendi yorumunu görür");
      const rows = store.tables.astro_provider_results;
      const same = rows.filter((x) => x.input_hash === rows.find((y) => y.id === r1)!.input_hash);
      assert.deepEqual(same.map((x) => x.owner_user_id).sort(), [IDS.u1, IDS.u2].sort(), "aynı girdi iki uzmanda iki ayrı satır");
      assert.equal((await call("u1", result.GET(req(`/api/admin/astroloji/results/${r2}`, "u1"), ctxP(r2)))).status, 404, "U1 de U2 sonucunu açamaz");
      narrativeTag = "<U1-GIZLI>";
      const again = await call("u1", run.POST(req("/api/admin/astroloji/engine/run", "u1", "POST", { profileId: p1[0], selections: [NATAL] })));
      assert.deepEqual(again.json.executed, { newResults: 0, cachedResults: 1, providerAttempts: 0 });
      assert.equal(roxyHits, h + 1);
    });

    await t("karma kimlik: U2 KENDİ sonuç ID'si + U1 profil/revizyon → 404 (U1 doğum revizyonu sızmaz)", async () => {
      const rv = await call("u1", revisions.POST(req(`/api/admin/astroloji/profiles/${p1[1]}/revisions`, "u1", "POST", { ...birth, birthTime: "10:20", timeAccuracy: "rectified", expectedRevision: 1, changeNote: "U1-GIZLI-REKTIFIKASYON" }), ctxP(p1[1])));
      assert.equal(rv.status, 200, rv.text);
      const g = await call("u2", result.GET(req(`/api/admin/astroloji/results/${r2}?profileId=${p1[1]}&revision=2`, "u2"), ctxP(r2)));
      assert.equal(g.status, 404, g.text.slice(0, 200));
      assert.ok(!g.text.includes("U1-GIZLI-REKTIFIKASYON"));
      assert.equal((await call("u2", result.GET(req(`/api/admin/astroloji/results/${r2}`, "u2"), ctxP(r2)))).status, 200, "U2 kendi sonucunu açar");
    });

    await t("bozuk veri savunması: U2 sonucuna U1 sahipli yorum satırı enjekte edilse bile U2 yalnız kendi yorumunu görür", async () => {
      const own = store.tables.astro_provider_interpretations.find((x) => x.result_id === r2)!;
      // DB FK'si (astro_pi_owner_fk) bunu reddeder; burada doğrudan depoya yazılarak uygulama filtresi sınanır.
      store.tables.astro_provider_interpretations.push({ ...own, id: "eeeeeeee-0000-4000-8000-00000000000e", owner_user_id: IDS.u1, content: { schema: "x", bodies: [{ id: "sun", summary: "<U1-ENJEKTE>" }] } });
      const g = await call("u2", result.GET(req(`/api/admin/astroloji/results/${r2}`, "u2"), ctxP(r2)));
      assert.equal(g.status, 200);
      assert.ok(g.text.includes("<U2-YORUM>") && !g.text.includes("<U1-ENJEKTE>"), "yorum sahiplik filtresi yok");
      store.tables.astro_provider_interpretations = store.tables.astro_provider_interpretations.filter((x) => x.id !== "eeeeeeee-0000-4000-8000-00000000000e");
    });

    await t("provider yorumu: U2 / UB yanıtlarının HİÇBİRİNDE U1 anlatısı, notu veya KB metni yok", async () => {
      for (const who of ["u2", "ub"] as const) {
        const all = bodiesBy[who].join("\n");
        for (const secret of ["<U1-GIZLI>", "<U1-ENJEKTE>", "U1-GIZLI-REKTIFIKASYON", "U1 danışan yorumu", "U1 mesleki notu", "Deneme Kişi (1)"]) assert.ok(!all.includes(secret), `${who} yanıtında sızıntı: ${secret}`);
      }
    });

    await t("danışan silme: aynı kimlikli 3 danışandan biri silinir → profiller, sonuçlar, analizler AYNEN; yalnız o bağ kopar", async () => {
      const before = {
        profiles: store.tables.astro_birth_profiles.length,
        revisions: store.tables.astro_birth_profile_revisions.length,
        results: store.tables.astro_provider_results.length,
        analyses: store.tables.astro_analyses.length,
        notes: store.tables.astro_expert_notes.length,
      };
      // Danışan Yolculuğu silmesi: DELETE FROM clients. DB (20271101000300, PG testinde kanıtlı) astroloji
      // bağlarını SET NULL yapar; sahte depo bunu aynı biçimde uygular.
      store.tables.clients = store.tables.clients.filter((c) => c.id !== K[0]);
      for (const tbl of ["astro_birth_profiles", "astro_analyses"]) for (const r of store.tables[tbl]) if (r.client_id === K[0]) r.client_id = null;
      assert.deepEqual(
        {
          profiles: store.tables.astro_birth_profiles.length,
          revisions: store.tables.astro_birth_profile_revisions.length,
          results: store.tables.astro_provider_results.length,
          analyses: store.tables.astro_analyses.length,
          notes: store.tables.astro_expert_notes.length,
        },
        before,
      );
      const list = await call("u1", profiles.GET(req("/api/admin/astroloji/profiles", "u1")));
      const rows = list.json.profiles as { id: string; clientId: string | null }[];
      assert.equal(rows.length, 3);
      assert.equal(rows.find((x) => x.id === p1[0])!.clientId, null);
      assert.deepEqual(rows.filter((x) => x.id !== p1[0]).map((x) => x.clientId).sort(), [K[1], K[2]].sort(), "diğer iki danışanın bağı etkilenmedi");
      const h = roxyHits;
      const d = await call("u1", profile.GET(req(`/api/admin/astroloji/profiles/${p1[0]}`, "u1"), ctxP(p1[0])));
      assert.equal(d.status, 200);
      const g = await call("u1", result.GET(req(`/api/admin/astroloji/results/${r1}`, "u1"), ctxP(r1)));
      assert.equal(g.status, 200);
      assert.equal(roxyHits, h, "danışan silme sonrası açmak Roxy çağırdı");
    });

    await t("snapshot bütünlüğü: saldırılar + danışan silme + KB/not düzenleme sonrası U1 kayıtlı analizi BİREBİR aynı; açmak 0 Roxy", async () => {
      const k = store.tables.astro_kb_entries.find((x) => x.id === kb1)!;
      const ed = await call("u1", kbItem.PATCH(req(`/api/admin/astroloji/kb/${kb1}`, "u1", "PATCH", { tradition: "western", topicKey: k.topic_key, title: "U1 KB (yeni)", body: "değişti", expectedRevision: 1 }), ctxP(kb1)));
      assert.equal(ed.status, 200, ed.text);
      const h = roxyHits;
      const open = await call("u1", analysisItem.GET(req(`/api/admin/astroloji/analyses/${a1}`, "u1"), ctxP(a1)));
      assert.equal(open.status, 200);
      // Tek fark: analiz SATIRININ danışan bağı (client_id) danışan silinince NULL olur; snapshot AYNEN kalır.
      const strip = (txt: string) => {
        const j = JSON.parse(txt) as { analysis: Record<string, unknown> };
        const { clientId, ...rest } = j.analysis;
        return { clientId, rest: JSON.stringify(rest) };
      };
      const now = strip(open.text);
      const was = strip(a1Body);
      assert.equal(was.clientId, K[0]);
      assert.equal(now.clientId, null);
      assert.equal(now.rest, was.rest, "kayıtlı analiz snapshot'ı değişti");
      assert.ok(open.text.includes("Deneme Kişi"), "kayıt anındaki danışan adı snapshot'ta kalır");
      assert.equal(roxyHits, h);
    });
  } finally {
    console.error = origErr;
    restore();
  }

  console.log(`\nastrology phase7a harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase7a harness çöktü:", e);
  process.exit(1);
});
