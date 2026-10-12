/**
 * ASTROLOJİ 9B P2 KAPATMA — Bilgi Bankası analize kopyalanmaz (güncel kayıtlardan eşleşir) · rapor tarihi Türkiye saati ·
 * atomik kayıt tavanı eşlemesi · kaydetme özeti etiketleri. Gerçek akış (profil → motor → not/KB → kayıt) + GERÇEK
 * rapor route'u; sağlayıcı = golden yanıtlar (ağ YOK, gerçek Roxy YOK).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/p2fix9b.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { NextRequest } from "next/server";
import { createFakeClient, createStore, installFetchShim, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { createKb, deleteKb, updateKb } from "@/lib/astrology/kb/service";
import { KB_STORAGE_MODE, getAnalysis, previewAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { buildAstroReport, instantDateTr, instantDayKeyTr, reportTexts } from "@/lib/astrology/report/model";
import { ASTRO_RECORD_CAPS } from "@/lib/astrology/limits";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-p2fix9b";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const ROOT = join(__dirname, "..", "..");
const DIR = join(__dirname, "fixtures", "golden");
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const GOLDEN: { name: string; endpoint: string; body: J; response: J }[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(DIR, f), "utf8")) }));
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
const U = { ex1: "e9c9c9c9-0000-4000-8000-000000000001", ex2: "e9c9c9c9-0000-4000-8000-000000000002", exB: "e9c9c9c9-0000-4000-8000-000000000003" };
type Who = keyof typeof U;
const tok = (w: Who) => `tok-p2fix9b-${w}-xxxxxxxxxxxxxx`;
const expert = (id: string, tenant: string, perms: Record<string, unknown>) => ({
  id, role: "expert", active: true, approval_status: "approved", package_type: "premium", is_super_admin: false, is_demo_account: false,
  tenant_id: tenant, email: `${id.slice(-2)}@sentetik.test`, module_permissions: perms,
});
const ALL = { astrology: true, astrology_provider_interp: true };
const store: FakeStore = createStore({ users: [expert(U.ex1, TA, ALL), expert(U.ex2, TA, ALL), expert(U.exB, TB, ALL)], clients: [] });
for (const w of Object.keys(U) as Who[]) store.sessions.set(tok(w), U[w]);
const setPerms = (id: string, perms: Record<string, unknown>) => {
  store.tables.users.find((u) => u.id === id)!.module_permissions = perms;
};
let roxyFetch = 0;
const restore = installFetchShim({ store, supabaseUrl: SUPA, roxyBase: ROXY_BASE, roxy: () => { roxyFetch += 1; return new Response("{}", { status: 500 }); } });

const providerCalls: string[] = [];
const score = (a: J, b: J) => Object.keys(b ?? {}).filter((k) => JSON.stringify(a?.[k]) === JSON.stringify(b[k])).length;
const deps: EngineDeps = {
  config: { apiKey: "k", baseUrl: ROXY_BASE },
  callProvider: async (_c, endpoint, body) => {
    providerCalls.push(endpoint);
    if (endpoint === "/astrology/natal-chart") return { ok: true, raw: structuredClone(NATAL), attempts: 1 };
    const c = GOLDEN.filter((g) => g.endpoint === endpoint).sort((x, y) => score(body, y.body) - score(body, x.body))[0];
    return c ? { ok: true, raw: structuredClone(c.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
  },
  rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  log: () => undefined,
  now: () => new Date("2026-10-07T09:41:00Z"),
};
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const ANKARA: ResolvedLocation = { id: "tr-06-ankara", label: "Ankara, Türkiye", timezone: "Europe/Istanbul", latitude: 39.9334, longitude: 32.8597 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : id === ANKARA.id ? ANKARA : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const ctxOf = (userId: string, tenantId = TA): EngineCtx => ({ db: createFakeClient(store), tenantId, userId, entitlements: FULL });
const NATAL_SEL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const KB_TOPIC = "planet_in_sign:sun:cancer"; // golden natal: Güneş Yengeç

async function docxText(buf: Buffer) {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
async function pdfText(buf: Buffer) {
  return ((await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true })).text as string).replace(/\s+/g, " ");
}

async function main() {
  const R = await import("@/app/api/astroloji/analyses/[id]/report/route");
  const report = async (id: string, who: Who, fmt: "docx" | "pdf") => {
    const res = await R.GET(new NextRequest(`http://localhost/api/astroloji/analyses/${id}/report?format=${fmt}`, { headers: { "x-user-id": U[who], "x-session-token": tok(who) } }), { params: Promise.resolve({ id }) });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, cd: res.headers.get("content-disposition") ?? "", text: res.status === 200 ? (fmt === "docx" ? await docxText(buf) : await pdfText(buf)) : buf.toString() };
  };

  // ── Kurulum: uzman 1 (natal + sinastri, not, KB, Roxy yorumu); uzman 2 aynı konuda KENDİ KB'si ──
  const c1 = ctxOf(U.ex1);
  const pa = ((await createAstroProfile(c1, { label: "Danışan A", birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc)).body as J).profile.id;
  const pb = ((await createAstroProfile(c1, { label: "Danışan B", birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: ANKARA.id }, resolveLoc)).body as J).profile.id;
  const SYN_SEL = { technique: "western.synastry", options: { partnerProfileId: pb, houseSystem: "placidus", nodeType: "true" } };
  assert.equal((await runAstrology(c1, { profileId: pa, selections: [NATAL_SEL, SYN_SEL] }, deps, { ownerPreviewHideInterp: false })).status, 200);
  const kb1 = ((await createKb(c1, { tradition: "western", topicKey: KB_TOPIC, title: "Yengeç Güneşi — ilk sürüm", body: "İLK açıklama metni ğüşıöç" })).body as J).entry;
  const kbGone = ((await createKb(c1, { tradition: "western", topicKey: KB_TOPIC, title: "Silinecek genel bilgi", body: "SİLİNECEK metin" })).body as J).entry;
  await createKb(ctxOf(U.ex2), { tradition: "western", topicKey: KB_TOPIC, title: "UZMAN2 GİZLİ KB", body: "uzman 2'nin özel metni" });
  await createKb(ctxOf(U.exB, TB), { tradition: "western", topicKey: KB_TOPIC, title: "TENANT-B GİZLİ KB", body: "başka tenant" });
  const NOTE = "Danışan A için ÖZEL not — 9B ğüşıöç";
  assert.equal((await saveExpertNote(c1, { profileId: pa, technique: "western.natal", sectionKey: "overall", body: NOTE, expectedRevision: null })).status, 201);
  const natalId = ((await saveAnalysis(c1, { profileId: pa, revision: 1, ...NATAL_SEL, includeProviderInterp: true, saveRequestId: randomUUID() }, false)).body as J).analysisId;
  const synId = ((await saveAnalysis(c1, { profileId: pa, revision: 1, ...SYN_SEL, includeProviderInterp: true, saveRequestId: randomUUID() }, false)).body as J).analysisId;
  const callsAfterSetup = providerCalls.length;
  const row = (id: string) => store.tables.astro_analyses.find((r) => r.id === id)!;

  await t("yeni kayıt: kb_snapshot BOŞ (genel Bilgi Bankası kopyalanmaz); not ayrı tabloda; sürümde kbStorage='live-v1'; önizleme eşleşme sayısını yine gösterir", async () => {
    assert.deepEqual(row(natalId).kb_snapshot, []);
    assert.deepEqual(row(synId).kb_snapshot, []);
    assert.equal((row(natalId).versions_snapshot as J).kbStorage, KB_STORAGE_MODE);
    assert.ok(store.tables.astro_analysis_notes.some((n) => n.analysis_id === natalId && n.body === NOTE));
    const pv = await previewAnalysis(c1, { profileId: pa, revision: 1, ...NATAL_SEL }, false);
    assert.equal((pv.body as J).summary.kbMatchCount, 2);
  });

  // 1. eski harita aynı teknik sonuç
  const techBefore = JSON.stringify(row(natalId).technical_snapshot);
  await t("1) eski harita aynı teknik sonuçlarla açılıyor (snapshot birebir; Bilgi Bankası değişse de)", async () => {
    await updateKb(c1, kb1.id, { tradition: "western", topicKey: KB_TOPIC, title: "Yengeç Güneşi — GÜNCEL sürüm", body: "GÜNCEL açıklama metni", expectedRevision: kb1.revision });
    const a = ((await getAnalysis(c1, natalId, false)).body as J).analysis;
    assert.equal(JSON.stringify(a.technical), techBefore);
    assert.equal(JSON.stringify(row(natalId).technical_snapshot), techBefore);
  });

  // 2–3. güncel KB + silinen KB
  await t("2) KB güncellenince eski haritadan yeni Word/PDF GÜNCEL açıklamayı kullanıyor (eski sürüm yok)", async () => {
    for (const fmt of ["docx", "pdf"] as const) {
      const r = await report(natalId, "ex1", fmt);
      assert.equal(r.status, 200);
      assert.ok(r.text.includes("GÜNCEL sürüm") && r.text.includes("GÜNCEL açıklama metni"), `${fmt}: güncel yok`);
      assert.ok(!r.text.includes("İLK açıklama metni") && !r.text.includes("ilk sürüm"), `${fmt}: eski sürüm geldi`);
    }
  });
  await t("3) KB'den silinen açıklama yeni rapora ve kayıtlı görünüme GELMİYOR; KB tamamen boşsa rapor yine çalışıyor", async () => {
    const cur = store.tables.astro_kb_entries.find((r) => r.id === kbGone.id)!;
    assert.equal((await deleteKb(c1, kbGone.id, cur.revision)).status, 200);
    const a = ((await getAnalysis(c1, natalId, false)).body as J).analysis;
    assert.ok(!JSON.stringify(a.knowledgeBank).includes("SİLİNECEK"));
    for (const fmt of ["docx", "pdf"] as const) assert.ok(!(await report(natalId, "ex1", fmt)).text.includes("SİLİNECEK metin"), fmt);
    // Uzman 1'in tüm KB'si silinse de analiz ve rapor çalışır
    const saved = store.tables.astro_kb_entries.filter((r) => r.owner_user_id === U.ex1);
    store.tables.astro_kb_entries = store.tables.astro_kb_entries.filter((r) => r.owner_user_id !== U.ex1);
    try {
      const r = await report(natalId, "ex1", "docx");
      assert.equal(r.status, 200);
      assert.ok(r.text.includes("eşleşen güncel Bilgi Bankası kaydınız yok"));
    } finally {
      store.tables.astro_kb_entries.push(...saved);
    }
  });

  await t("ESKİ analiz (kb_snapshot kopyalı, 9B öncesi): kopya OKUNMAZ; güncel KB gösterilir; satır değiştirilmez", async () => {
    const legacy = { ...structuredClone(row(natalId)), id: randomUUID(), save_request_id: randomUUID(), kb_snapshot: [{ entryId: randomUUID(), topicKey: KB_TOPIC, topicLabel: "x", title: "ESKİ KOPYA BAŞLIK", body: "eski kopya gövde", tradition: "western", tags: [], revision: 1, updatedAt: "2026-01-01" }] };
    store.tables.astro_analyses.push(legacy);
    const before = JSON.stringify(legacy);
    const a = ((await getAnalysis(c1, legacy.id, false)).body as J).analysis;
    assert.ok(!JSON.stringify(a).includes("ESKİ KOPYA"), "eski kopya okundu");
    assert.ok(JSON.stringify(a.knowledgeBank).includes("GÜNCEL sürüm"));
    assert.ok(!(await report(legacy.id, "ex1", "pdf")).text.includes("ESKİ KOPYA"));
    assert.equal(JSON.stringify(store.tables.astro_analyses.find((r) => r.id === legacy.id)), before, "eski satır değişmemeli");
  });

  // 4. notlar
  await t("4) danışana özel ESKİ notlar kaybolmuyor: not çalışma alanında değişse bile kayıtlı analiz/rapor kayıt anındaki notu taşır", async () => {
    const live = store.tables.astro_expert_notes.find((n) => n.owner_user_id === U.ex1 && n.profile_id === pa && n.technique === "western.natal")!;
    assert.equal((await saveExpertNote(c1, { profileId: pa, technique: "western.natal", sectionKey: "overall", body: "SONRADAN değişen not", expectedRevision: live.revision })).status, 200);
    const a = ((await getAnalysis(c1, natalId, false)).body as J).analysis;
    assert.ok(a.notes.some((n: J) => n.body === NOTE));
    for (const fmt of ["docx", "pdf"] as const) {
      const tx = (await report(natalId, "ex1", fmt)).text;
      assert.ok(tx.includes("Danışan A için ÖZEL not"), `${fmt}: kayıtlı not yok`);
    }
  });

  // 5. Roxy yorumu
  await t("5) Roxy yorumları korunuyor (kayıtta); yetki kapalıyken getAnalysis + Word + PDF + sinastri iç içe yorumu SIZDIRMIYOR", async () => {
    assert.ok(row(natalId).provider_interp_snapshot && row(synId).provider_interp_snapshot, "yorum snapshot'ı silinmemeli");
    const on = await report(natalId, "ex1", "docx");
    assert.ok(on.text.includes("Roxy otomatik yorumu"));
    setPerms(U.ex1, { astrology: true });
    try {
      for (const id of [natalId, synId]) {
        const a = JSON.stringify(((await getAnalysis({ ...c1, entitlements: resolveAstrologyEntitlements({ isOwner: false, role: "expert", flags: { astrology: true } }) }, id, false)).body as J).analysis);
        assert.ok(!a.includes("Roxy otomatik") && !/"visible":true/.test(a));
        for (const fmt of ["docx", "pdf"] as const) assert.ok(!(await report(id, "ex1", fmt)).text.includes("Roxy otomatik yorumu"), `${id} ${fmt}`);
      }
    } finally {
      setPerms(U.ex1, ALL);
    }
  });

  // 6. izolasyon
  await t("6) başka uzmanın (aynı tenant) ve başka tenant'ın Bilgi Bankası / notu görünmüyor; başka uzman analizi açamıyor", async () => {
    const a = JSON.stringify(((await getAnalysis(c1, natalId, false)).body as J).analysis);
    assert.ok(!a.includes("UZMAN2 GİZLİ") && !a.includes("TENANT-B GİZLİ"));
    for (const fmt of ["docx", "pdf"] as const) {
      const tx = (await report(natalId, "ex1", fmt)).text;
      assert.ok(!tx.includes("UZMAN2 GİZLİ") && !tx.includes("TENANT-B GİZLİ"), fmt);
      assert.equal((await report(natalId, "ex2", fmt)).status, 404);
      assert.equal((await report(natalId, "exB", fmt)).status, 404);
    }
    assert.equal((await getAnalysis(ctxOf(U.ex2), natalId, false)).status, 404);
  });

  // 7. sinastri bütünlüğü
  await t("7) sinastri snapshot bütünlüğü: teknik + karşı taraf profil snapshot'ı birebir; KB değişimi etkilemiyor", async () => {
    const r = row(synId);
    const before = JSON.stringify([r.technical_snapshot, r.profile_snapshot, r.method_snapshot, r.provider_interp_snapshot]);
    await createKb(c1, { tradition: "western", topicKey: KB_TOPIC, title: "Sonradan eklenen", body: "yeni" });
    const a = ((await getAnalysis(c1, synId, false)).body as J).analysis;
    assert.equal(JSON.stringify([row(synId).technical_snapshot, row(synId).profile_snapshot, row(synId).method_snapshot, row(synId).provider_interp_snapshot]), before);
    assert.equal(a.profile.partner?.label, "Danışan B");
  });

  // 8. sıfır sağlayıcı
  await t("8) eski analizleri açmak / rapor üretmek sağlayıcıyı (Roxy) HİÇ çağırmıyor", () => {
    assert.equal(providerCalls.length, callsAfterSetup);
    assert.equal(roxyFetch, 0);
  });

  // 9. tarih
  await t("9) Word/PDF Türkiye tarihi: 10.10.2026 00:03 (TSİ) kayıt → kapak, Kayıt tarihi ve dosya adı 10.10.2026 / 2026-10-10 (DB UTC değişmez)", async () => {
    const r = row(natalId);
    const utc = "2026-10-09T21:03:55.219Z";
    r.analysis_at = utc;
    for (const fmt of ["docx", "pdf"] as const) {
      const x = await report(natalId, "ex1", fmt);
      assert.match(x.cd, new RegExp(`-2026-10-10\\.${fmt}`), x.cd);
      assert.ok(x.text.includes("Analiz tarihi: 10.10.2026"), `${fmt} kapak`);
      assert.ok(x.text.includes("10.10.2026 00:03 (TSİ)"), `${fmt} kayıt tarihi`);
      assert.ok(!x.text.includes("09.10.2026"), `${fmt}: UTC günü sızdı`);
    }
    assert.equal(r.analysis_at, utc, "DB değeri değişmedi");
  });
  await t("9b) tarih sınırları: gece yarısı (20:59Z aynı gün / 21:00Z ertesi gün), ay sonu, yıl sonu, artık yıl", () => {
    const cases: [string, string, string][] = [
      ["2026-10-09T20:59:59Z", "09.10.2026", "2026-10-09"],
      ["2026-10-09T21:00:00Z", "10.10.2026", "2026-10-10"],
      ["2026-10-31T21:30:00Z", "01.11.2026", "2026-11-01"],
      ["2026-12-31T21:00:00Z", "01.01.2027", "2027-01-01"],
      ["2028-02-28T21:00:00Z", "29.02.2028", "2028-02-29"],
      ["2026-06-30T20:59:00Z", "30.06.2026", "2026-06-30"],
    ];
    for (const [iso, d, k] of cases) {
      assert.equal(instantDateTr(iso), d, iso);
      assert.equal(instantDayKeyTr(iso), k, iso);
    }
    const rep = buildAstroReport({ id: randomUUID(), title: "t", technique: "western.natal", analysisAt: "2026-12-31T21:00:00Z", params: {}, technical: null });
    assert.equal(rep.cover.analysisDate, "01.01.2027");
    assert.match(rep.fileBase, /-2027-01-01$/);
    assert.ok(reportTexts(rep).some((s) => s === "01.01.2027 00:00 (TSİ)"));
    assert.equal(instantDateTr("geçersiz"), "—");
  });

  // Tavan eşlemesi (DB trigger'ı taklidi)
  await t("DB kayıt tavanı (trigger 000600) → servisler 409 RECORD_CAP_REACHED döner (500 değil): profil, KB, not, analiz", async () => {
    store.dbRecordCaps = { astro_birth_profiles: 1, astro_kb_entries: 1, astro_expert_notes: 1, astro_analyses: 1 };
    try {
      const cx = ctxOf(U.exB, TB);
      const r1 = await createAstroProfile(cx, { label: "X1", birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
      assert.equal(r1.status, 201);
      const px = (r1.body as J).profile.id;
      const r2 = await createAstroProfile(cx, { label: "X2", birthDate: "1990-07-15", timeKnown: false, locationId: ISTANBUL.id }, resolveLoc);
      assert.equal(r2.status, 409, JSON.stringify(r2.body));
      assert.equal((r2.body as J).code, "RECORD_CAP_REACHED");
      const k = await createKb(cx, { tradition: "western", topicKey: KB_TOPIC, title: "ikinci", body: "b" });
      assert.equal(k.status, 409, "exB'nin 1 KB'si zaten var");
      assert.equal((await saveExpertNote(cx, { profileId: px, technique: "western.natal", sectionKey: "overall", body: "n1", expectedRevision: null })).status, 201);
      const n2 = await saveExpertNote(cx, { profileId: px, technique: "western.natal", sectionKey: "planet_in_sign:sun:cancer", body: "n2", expectedRevision: null });
      assert.equal(n2.status, 409);
      assert.equal((await runAstrology(cx, { profileId: px, selections: [NATAL_SEL] }, deps, { ownerPreviewHideInterp: false })).status, 200);
      assert.equal((await saveAnalysis(cx, { profileId: px, revision: 1, ...NATAL_SEL, saveRequestId: randomUUID() }, false)).status, 201);
      const a2 = await saveAnalysis(cx, { profileId: px, revision: 1, ...NATAL_SEL, saveRequestId: randomUUID() }, false);
      assert.equal(a2.status, 409);
      assert.equal((a2.body as J).code, "RECORD_CAP_REACHED");
    } finally {
      delete store.dbRecordCaps;
    }
  });

  await t("statik: DB trigger tavanları uygulama tavanlarıyla AYNI; temizlik migration'ı yalnız kb_snapshot'a dokunur", () => {
    const m6 = read("supabase/migrations/20271101000600_astrology_record_caps.sql");
    const cap = (table: string) => Number(new RegExp(`ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.astro_enforce_record_cap\\('(\\d+)'\\)`).exec(m6)?.[1]);
    assert.equal(cap("astro_birth_profiles"), ASTRO_RECORD_CAPS.profiles);
    assert.equal(cap("astro_analyses"), ASTRO_RECORD_CAPS.analyses);
    assert.equal(cap("astro_kb_entries"), ASTRO_RECORD_CAPS.kbEntries);
    assert.equal(cap("astro_expert_notes"), ASTRO_RECORD_CAPS.notes);
    const m7 = read("supabase/migrations/20271101000700_astrology_kb_snapshot_cleanup.sql").replace(/--.*$/gm, "");
    const sets = [...m7.matchAll(/\bSET\s+(\w+)\s*=/g)].map((x) => x[1]);
    assert.deepEqual(sets, ["kb_snapshot"]);
    assert.ok(!/astro_analysis_notes|DELETE\s+FROM/i.test(m7), "temizlik notlara / silmeye dokunmamalı");
  });

  // 10 (kısmen statik): UI etiketleri
  await t("P3: kaydetme özeti ham kimlik (whole_sign / true / roxy) yerine Türkçe etiket gösterir; kayıtlı görünüm 'güncel' Bilgi Bankası der", () => {
    // 2026-10-12: özet toplu kayıt penceresinde; ev sistemi / düğüm Türkçe etiketle (ham kimlik yok).
    const w = read("app/admin/astroloji/page.tsx");
    assert.ok(w.includes("houseSystemLabel(x.view.method.houseSystem, HOUSE_SYSTEM_LABELS)") && w.includes("NODE_TYPE_LABELS[x.view.method.nodeType]"));
    assert.ok(!/düğüm: \{x\.view\.method\.nodeType/.test(w));
    const s = read("app/admin/astroloji/_components/SavedAnalyses.tsx");
    assert.ok(s.includes("Bilgi Bankam (güncel)") && !s.includes("Bilgi Bankam (kayıt anındaki hali)"));
  });

  restore();
  console.log(`\nastrology p2fix9b harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
