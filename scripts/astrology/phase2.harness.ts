/**
 * ASTROLOJİ AŞAMA 2 harness'i — Bilgi Bankası · kanonik konu · eşleşme · danışana özel uzman yorumu ·
 * "Analizi Kaydet" (değişmez snapshot) · Roxy yorum yetkisi · cache (0 istek) · eşlenmemiş alan denetimi.
 * Gerçek Roxy / gerçek DB YOK (golden yanıt fixture'ı ile).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase2.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile, appendAstroRevision } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { createKb, deleteKb, getKbEntry, listKb, updateKb } from "@/lib/astrology/kb/service";
import { getAnalysis, getWorkspace, listAnalyses, previewAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { classifyUnmappedAudit, listUnmappedAudit } from "@/lib/astrology/audit/unmapped";
import { parseTopicKey, parseWesternTopicKey, topicsFromNatal } from "@/lib/astrology/topics/western";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import type { NatalTechnical } from "@/lib/astrology/model/western";

const GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const OTHER_USER_SAME_TENANT = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const CLIENT_ALI = "11111111-1111-4111-8111-111111111111";
const CLIENT_AYSE = "22222222-2222-4222-8222-222222222222";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const SEL = [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }];

const goldenTech = (() => {
  const p = projectRoxyNatal(GOLDEN, { houseSystem: "placidus", nodeType: "true" });
  if (!p.ok) throw new Error("golden projeksiyon başarısız");
  return p.value.technical;
})();
const saturn = goldenTech.bodies.find((b) => b.id === "saturn")!;
const SAT_KEY = `planet_in_house:saturn:${saturn.house}`;
const SAT_OTHER = `planet_in_house:saturn:${saturn.house === 1 ? 2 : 1}`;
const goldenNarr = [GOLDEN.planets[0].interpretation.summary, GOLDEN.aspects[0].aspectInterpretation.summary, GOLDEN.aspectsInterpretation.summary] as string[];

function seed(): FakeStore {
  return createStore({
    clients: [
      { id: CLIENT_ALI, tenant_id: TENANT_A, ad: "Ali", soyad: "Örnek" },
      { id: CLIENT_AYSE, tenant_id: TENANT_A, ad: "Ayşe", soyad: "Deneme" },
    ],
  });
}
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

function roxy(raw: unknown = GOLDEN) {
  const calls: unknown[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, _e, body) => {
      calls.push(body);
      const r = structuredClone(raw) as Record<string, unknown>;
      if (raw === FIXTURE) {
        r.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
        r.houseSystem = body.houseSystem;
      }
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}

async function profile(ctx: EngineCtx, clientId: string | null = CLIENT_ALI, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Ali — natal", clientId, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as { profile: { id: string } }).profile.id;
}

async function computed(ctx: EngineCtx, pid: string, deps: EngineDeps, revision?: number): Promise<string> {
  const r = await runAstrology(ctx, { profileId: pid, revision, selections: SEL }, deps, { ownerPreviewHideInterp: false });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  return ((r.body as { results: { view: { id: string } }[] }).results[0]).view.id;
}

async function kb(ctx: EngineCtx, topicKey: string, body: string, extra: Record<string, unknown> = {}): Promise<{ id: string; revision: number }> {
  const r = await createKb(ctx, { tradition: "western", topicKey, title: `Not ${topicKey}`, body, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const e = (r.body as { entry: { id: string; revision: number } }).entry;
  return { id: e.id, revision: e.revision };
}

async function main() {
  // ─── Taksonomi ─────────────────────────────────────────────────────────────
  await t("konu: golden haritadan kanonik konular (gezegen-burç/ev, ASC/MC, açı, kalıp)", () => {
    const topics = topicsFromNatal(goldenTech);
    const keys = new Set(topics.map((x) => x.key));
    assert.ok(keys.has(SAT_KEY), SAT_KEY);
    assert.ok(keys.has(`planet_in_sign:saturn:${saturn.sign}`));
    assert.ok(keys.has(`angle_in_sign:ascendant:${goldenTech.angles!.ascendant.sign}`));
    assert.equal(topics.filter((x) => x.kind === "planet_in_sign").length, 14);
    assert.equal(topics.filter((x) => x.kind === "planet_in_house").length, 14);
    assert.equal(topics.filter((x) => x.kind === "aspect").length, goldenTech.aspects.length);
    assert.equal(topics.filter((x) => x.kind === "pattern").length, new Set(goldenTech.patterns.map((p) => p.kind)).size);
    for (const x of topics) assert.ok(parseTopicKey("western", x.key), `üretilen anahtar geçersiz: ${x.key}`);
    assert.ok(topics.find((x) => x.key === SAT_KEY)!.label.includes("Satürn"));
  });
  await t("konu: doğrulama — bilinmeyen kimlik / ev 13 / ters açı sırası / serbest metin / vedic(şimdilik) reddedilir", () => {
    assert.ok(parseWesternTopicKey("aspect:sun:square:saturn"));
    assert.equal(parseWesternTopicKey("aspect:saturn:square:sun"), null, "kanonik olmayan sıra");
    assert.equal(parseWesternTopicKey("planet_in_house:saturn:13"), null);
    assert.equal(parseWesternTopicKey("planet_in_house:eris:7"), null);
    assert.equal(parseWesternTopicKey("Satürn 7. ev"), null);
    assert.equal(parseWesternTopicKey("aspect:sun:square:sun"), null);
    assert.equal(parseTopicKey("vedic", "planet_in_house:saturn:7"), null);
  });
  await t("konu: provider-bağımsız — sıra/yön değişse aynı konu kümesi; saat bilinmiyorsa ev/açı noktası konusu yok", () => {
    const shuffled: NatalTechnical = {
      ...goldenTech,
      bodies: [...goldenTech.bodies].reverse(),
      aspects: goldenTech.aspects.map((a) => ({ ...a, a: a.b, b: a.a })).reverse(),
      patterns: [...goldenTech.patterns].reverse(),
    };
    const k1 = topicsFromNatal(goldenTech).map((x) => x.key).sort();
    const k2 = topicsFromNatal(shuffled).map((x) => x.key).sort();
    assert.deepEqual(k2, k1);
    const masked: NatalTechnical = { ...goldenTech, bodies: goldenTech.bodies.map((b) => ({ ...b, house: null })), houses: [], angles: null, points: { partOfFortune: null, vertex: null } };
    const km = topicsFromNatal(masked);
    assert.ok(!km.some((x) => x.kind === "planet_in_house" || x.kind === "angle_in_sign"));
  });

  // ─── Bilgi Bankası CRUD ────────────────────────────────────────────────────
  await t("KB: ekle / geçersiz konu reddi / ara (Türkçe) / tür + etiket filtresi", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    await kb(ctx, SAT_KEY, "Satürn 7. ev genel çalışma notum", { tags: ["Satürn", "ilişki"], sourceNote: "Hocam X" });
    await kb(ctx, "pattern:t_square", "T-kare notum", { tags: ["kalıp"] });
    const bad = await createKb(ctx, { tradition: "western", topicKey: "Satürn 7. ev", title: "x", body: "y" });
    assert.equal(bad.status, 400);
    const s = await listKb(ctx, { search: "SATURN" });
    assert.equal((s.body as { entries: unknown[] }).entries.length, 1, "Türkçe/aksan duyarsız arama");
    assert.equal((await listKb(ctx, { kind: "pattern" })).body.entries instanceof Array ? ((await listKb(ctx, { kind: "pattern" })).body as { entries: unknown[] }).entries.length : -1, 1);
    assert.equal(((await listKb(ctx, { tag: "ilişki" })).body as { entries: unknown[] }).entries.length, 1);
    assert.equal(((await listKb(ctx, {})).body as { total: number }).total, 2);
    assert.deepEqual(((await listKb(ctx, {})).body as { tags: string[] }).tags, ["ilişki", "kalıp", "satürn"]);
  });
  await t("KB: düzenle (iyimser kilit) / bayat → 409 / sil bayat → 409 / sil → 200 / tekrar → 404", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const e = await kb(ctx, SAT_KEY, "A");
    const u = await updateKb(ctx, e.id, { expectedRevision: 1, tradition: "western", topicKey: SAT_KEY, title: "T", body: "B" });
    assert.equal(u.status, 200);
    assert.equal((u.body as { entry: { revision: number } }).entry.revision, 2);
    assert.equal((await updateKb(ctx, e.id, { expectedRevision: 1, tradition: "western", topicKey: SAT_KEY, title: "T", body: "C" })).status, 409);
    assert.equal((await deleteKb(ctx, e.id, 1)).status, 409);
    assert.equal((await deleteKb(ctx, e.id, 2)).status, 200);
    assert.equal((await deleteKb(ctx, e.id, 2)).status, 404);
  });
  await t("KB: tenant + uzman izolasyonu — başka tenant / aynı tenant başka uzman göremez, düzenleyemez, silemez", async () => {
    const store = seed();
    const own = ctxOf(store);
    const e = await kb(own, SAT_KEY, "Benim notum");
    for (const other of [ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), ctxOf(store, { userId: OTHER_USER_SAME_TENANT })]) {
      assert.equal((await getKbEntry(other, e.id)).status, 404);
      assert.equal((await updateKb(other, e.id, { expectedRevision: 1, tradition: "western", topicKey: SAT_KEY, title: "x", body: "hack" })).status, 404);
      assert.equal((await deleteKb(other, e.id, 1)).status, 404);
      assert.equal(((await listKb(other, {})).body as { total: number }).total, 0);
    }
    assert.equal(store.tables.astro_kb_entries.length, 1);
    assert.equal(store.tables.astro_kb_entries[0].body, "Benim notum");
  });

  // ─── Eşleşme ───────────────────────────────────────────────────────────────
  await t("eşleşme: harita konusuyla eşleşen KB gelir, ilgisiz gelmez; Roxy yorumu okunmaz/dönmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rid = await computed(ctx, pid, roxy().deps);
    await kb(ctx, SAT_KEY, "Satürn genel notum");
    await kb(ctx, SAT_OTHER, "İlgisiz ev notu");
    await kb(ctx, "planet_in_sign:sun:aries", "İlgisiz burç notu");
    const before = store.log.length;
    const w = await getWorkspace(ctx, { profileId: pid, revision: 1, resultId: rid });
    assert.equal(w.status, 200, JSON.stringify(w.body).slice(0, 200));
    const body = w.body as { kbMatches: { topicKey: string; body: string }[]; topics: { key: string }[] };
    assert.deepEqual(body.kbMatches.map((x) => x.topicKey), [SAT_KEY]);
    const json = JSON.stringify(w.body);
    for (const s of goldenNarr) assert.ok(!json.includes(s), "çalışma alanında Roxy anlatısı");
    assert.ok(!store.log.slice(before).some((l) => l.table === "astro_provider_interpretations"), "çalışma alanı yorum tablosunu okudu");
  });
  await t("eşleşme: sonuç başka profilin revizyonuna aitse → 409 (yanlış danışana veri karışmaz)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pA = await profile(ctx);
    const rA = await computed(ctx, pA, roxy().deps);
    const pB = await profile(ctx, CLIENT_AYSE, { birthDate: "1991-03-02" });
    assert.equal((await getWorkspace(ctx, { profileId: pB, revision: 1, resultId: rA })).status, 409);
    assert.equal((await previewAnalysis(ctx, { profileId: pB, revision: 1, resultId: rA }, false)).status, 409);
  });

  // ─── Danışana özel uzman yorumu ────────────────────────────────────────────
  await t("not: kaydet / güncelle (kilit) / bayat → 409; Bilgi Bankası DEĞİŞMEZ; başka profile/tenant'a sızmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pA = await profile(ctx);
    const pB = await profile(ctx, CLIENT_AYSE, { birthDate: "1991-03-02" });
    await kb(ctx, SAT_KEY, "Genel KB notu");
    const kbBefore = JSON.stringify(store.tables.astro_kb_entries);
    const n1 = await saveExpertNote(ctx, { profileId: pA, sectionKey: "overall", body: "Ali için yorum v1", expectedRevision: null });
    assert.equal(n1.status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pA, sectionKey: SAT_KEY, body: "Ali'nin Satürn'ü…", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pA, sectionKey: "overall", body: "v2", expectedRevision: 1 })).status, 200);
    assert.equal((await saveExpertNote(ctx, { profileId: pA, sectionKey: "overall", body: "v3", expectedRevision: 1 })).status, 409);
    assert.equal((await saveExpertNote(ctx, { profileId: pA, sectionKey: "Serbest metin", body: "x", expectedRevision: null })).status, 400);
    assert.equal(JSON.stringify(store.tables.astro_kb_entries), kbBefore, "danışan notu KB'yi değiştirdi");
    const rB = await computed(ctx, pB, roxy(FIXTURE).deps);
    const wB = await getWorkspace(ctx, { profileId: pB, revision: 1, resultId: rB });
    assert.equal((wB.body as { notes: unknown[] }).notes.length, 0, "Ali'nin notu Ayşe'ye sızdı");
    assert.equal((await saveExpertNote(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), { profileId: pA, sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });

  // ─── Analizi Kaydet + snapshot ─────────────────────────────────────────────
  await t("kaydet: özet → kayıt; A..G katmanları doğru ve AYRI; idempotent; 0 sağlayıcı isteği", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy();
    const rid = await computed(ctx, pid, rx.deps);
    await kb(ctx, SAT_KEY, "KB notu A", { sourceNote: "Kitap Y" });
    await kb(ctx, SAT_OTHER, "ilgisiz");
    await saveExpertNote(ctx, { profileId: pid, sectionKey: "overall", body: "Ali yorumu v1", expectedRevision: null });
    const calls0 = rx.calls.length;
    const pv = await previewAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: true }, false);
    assert.equal(pv.status, 200);
    const sm = (pv.body as { summary: Record<string, unknown> }).summary;
    assert.equal(sm.kbMatchCount, 1);
    assert.equal(sm.noteCount, 1);
    assert.equal(sm.providerInterpIncluded, true);
    assert.equal(sm.client, "Ali Örnek");
    assert.equal((store.tables.astro_analyses ?? []).length, 0, "özet kayıt oluşturdu");
    const req = randomUUID();
    const s1 = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: true, saveRequestId: req }, false);
    assert.equal(s1.status, 201, JSON.stringify(s1.body));
    const s2 = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: true, saveRequestId: req }, false);
    assert.equal(s2.status, 200);
    assert.equal((s2.body as { reused: boolean }).reused, true);
    assert.equal(store.tables.astro_analyses.length, 1, "çift kayıt");
    const row = store.tables.astro_analyses[0];
    assert.equal((row.profile_snapshot as { revision: { revision: number; birthTime: string } }).revision.revision, 1);
    assert.equal((row.profile_snapshot as { client: { name: string } }).client.name, "Ali Örnek");
    assert.equal(row.client_id, CLIENT_ALI, "yolculuk için danışan kimliği");
    assert.equal(row.event_kind, "astrology.analysis.saved");
    assert.deepEqual((row.method_snapshot as Record<string, unknown>).houseSystem, "placidus");
    assert.deepEqual(row.technical_snapshot, JSON.parse(JSON.stringify(goldenTech)));
    assert.ok(JSON.stringify(row.provider_interp_snapshot).includes(goldenNarr[0]), "D katmanı");
    assert.ok(!JSON.stringify(row.technical_snapshot).includes(goldenNarr[0]), "C'de yorum");
    // 9B-P2-01 (owner kararı): genel Bilgi Bankası analize KOPYALANMAZ (F katmanı açılışta güncel kayıtlardan).
    assert.deepEqual(row.kb_snapshot, [], "F katmanı kopyalanmamalı");
    const opened = ((await getAnalysis(ctx, row.id as string, false)).body as { analysis: { knowledgeBank: { topicKey: string; body: string; sourceNote: string }[] } }).analysis;
    assert.deepEqual(opened.knowledgeBank.map((x) => [x.topicKey, x.body, x.sourceNote]), [[SAT_KEY, "KB notu A", "Kitap Y"]]);
    assert.ok(!JSON.stringify(opened.knowledgeBank).includes(goldenNarr[0]), "F'de yorum");
    assert.deepEqual(store.tables.astro_analysis_notes.map((n) => [n.section_key, n.body]), [["overall", "Ali yorumu v1"]]);
    const v = row.versions_snapshot as Record<string, unknown>;
    assert.equal(v.provider, "roxy");
    assert.equal(v.projectionVersion, "natal-proj-2");
    assert.equal(v.adapterVersion, "astro-roxy-natal-1");
    assert.equal(v.snapshotSchema, "astro.analysis.v2");
    assert.equal(rx.calls.length, calls0, "kaydetme sağlayıcıyı çağırdı");
  });

  await t("değişmez: not değişir + profil revize edilir → eski analiz AYNEN (teknik, not, revizyon); Bilgi Bankası (9B-P2-01) eski ve yeni analizde GÜNCEL", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy();
    const rid = await computed(ctx, pid, rx.deps);
    const e = await kb(ctx, SAT_KEY, "A");
    await saveExpertNote(ctx, { profileId: pid, sectionKey: "overall", body: "çalışma notu v1", expectedRevision: null });
    const s = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    const aid = (s.body as { analysisId: string }).analysisId;
    await updateKb(ctx, e.id, { expectedRevision: 1, tradition: "western", topicKey: SAT_KEY, title: "Yeni", body: "B" });
    await saveExpertNote(ctx, { profileId: pid, sectionKey: "overall", body: "çalışma notu v2", expectedRevision: 1 });
    await appendAstroRevision(ctx, pid, { expectedRevision: 1, birthDate: "1990-07-15", birthTime: "14:45", timeKnown: true, timeAccuracy: "rectified", locationId: ISTANBUL.id }, resolveLoc);
    const g = await getAnalysis(ctx, aid, false);
    const a = (g.body as { analysis: { knowledgeBank: { body: string }[]; notes: { body: string }[]; profile: { revision: { revision: number; birthTime: string } } } }).analysis;
    assert.equal(a.knowledgeBank[0].body, "B", "Bilgi Bankası güncel kayıtlardan (owner kararı 9B)");
    assert.equal(a.notes[0].body, "çalışma notu v1");
    assert.equal(a.profile.revision.revision, 1);
    assert.equal(a.profile.revision.birthTime.slice(0, 5), "14:30");
    // Yeni analiz (aynı rev-1 sonucu): güncel KB (B) + güncel not (v2).
    const s2 = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    const g2 = await getAnalysis(ctx, (s2.body as { analysisId: string }).analysisId, false);
    const a2 = (g2.body as { analysis: { knowledgeBank: { body: string }[]; notes: { body: string }[] } }).analysis;
    assert.equal(a2.knowledgeBank[0].body, "B");
    assert.equal(a2.notes[0].body, "çalışma notu v2");
    // Eski analizin notu hâlâ v1 (danışana özel not kayıt anındaki hâliyle korunur).
    assert.equal(((await getAnalysis(ctx, aid, false)).body as { analysis: { notes: { body: string }[] } }).analysis.notes[0].body, "çalışma notu v1");
  });

  await t("Roxy yetkisi: kayıtta yorum var → açarken owner görür; önizleme/yetkisiz → içerik YOK; KB+not her durumda var", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rid = await computed(ctx, pid, roxy().deps);
    await kb(ctx, SAT_KEY, "KB notu");
    await saveExpertNote(ctx, { profileId: pid, sectionKey: "overall", body: "yorumum", expectedRevision: null });
    const aid = ((await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: true, saveRequestId: randomUUID() }, false)).body as { analysisId: string }).analysisId;
    const open = async (c: EngineCtx, preview: boolean) => JSON.stringify((await getAnalysis(c, aid, preview)).body);
    const visible = await open(ctx, false);
    assert.ok(visible.includes(goldenNarr[0]));
    for (const [label, json] of [["önizleme", await open(ctx, true)], ["yetkisiz", await open(ctxOf(store, { entitlements: NO_INTERP }), false)]] as const) {
      for (const s of goldenNarr) assert.ok(!json.includes(s), `${label}: Roxy anlatısı sızdı`);
      assert.ok(json.includes("KB notu") && json.includes("yorumum"), `${label}: uzman verisi kayboldu`);
      assert.ok(json.includes(goldenTech.bodies[0].longitude.toString()), `${label}: teknik veri eksik`);
    }
    // Yorumu dahil etmek: önizleme/yetkisizken → 403; dahil değilse snapshot null.
    assert.equal((await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: true, saveRequestId: randomUUID() }, true)).status, 403);
    assert.equal((await saveAnalysis(ctxOf(store, { entitlements: NO_INTERP }), { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: true, saveRequestId: randomUUID() }, false)).status, 403);
    const s3 = await saveAnalysis(ctxOf(store, { entitlements: NO_INTERP }), { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    assert.equal(s3.status, 201);
    const row = store.tables.astro_analyses.find((x) => x.id === (s3.body as { analysisId: string }).analysisId)!;
    assert.equal(row.provider_interp_snapshot, null);
    assert.ok(!JSON.stringify(row).includes(goldenNarr[0]), "dahil değilken yorum kaydedildi");
  });

  await t("cache: kayıtlı analizi AÇ / LİSTELE = 0 sağlayıcı isteği; sonuç satırı silinse bile analiz açılır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy();
    const rid = await computed(ctx, pid, rx.deps);
    const aid = ((await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: false, saveRequestId: randomUUID() }, false)).body as { analysisId: string }).analysisId;
    const n0 = rx.calls.length;
    const before = store.log.length;
    for (let i = 0; i < 3; i++) assert.equal((await getAnalysis(ctx, aid, false)).status, 200);
    assert.equal(((await listAnalyses(ctx, pid)).body as { analyses: unknown[] }).analyses.length, 1);
    assert.equal(rx.calls.length, n0, "kayıtlı analiz açılışı sağlayıcıyı çağırdı");
    assert.ok(!store.log.slice(before).some((l) => l.table === "astro_provider_results"), "açılış hesap sonucu tablosuna gitti");
    store.tables.astro_provider_results = [];
    assert.equal((await getAnalysis(ctx, aid, false)).status, 200, "snapshot kendi içinde tam olmalı");
  });

  await t("izolasyon: başka tenant analizi açamaz/listeleyemez; aynı tenant başka uzman göremez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rid = await computed(ctx, pid, roxy().deps);
    const aid = ((await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, includeProviderInterp: false, saveRequestId: randomUUID() }, false)).body as { analysisId: string }).analysisId;
    for (const other of [ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), ctxOf(store, { userId: OTHER_USER_SAME_TENANT })]) {
      assert.equal((await getAnalysis(other, aid, false)).status, 404);
      // Aşama 7B: başka uzmanın profiliyle liste artık boş 200 değil, tek tip 404 (varlık sızmaz).
      assert.equal((await listAnalyses(other, pid)).status, 404);
    }
    assert.equal((await saveAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), { profileId: pid, revision: 1, resultId: rid, saveRequestId: randomUUID() }, false)).status, 404);
  });

  await t("atomik: geçersiz not bölümü → analiz satırı da YAZILMAZ", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rid = await computed(ctx, pid, roxy().deps);
    store.tables.astro_expert_notes ??= [];
    store.tables.astro_expert_notes.push({ id: randomUUID(), tenant_id: TENANT_A, owner_user_id: OWNER, profile_id: pid, technique: "western.natal", context_key: "", section_key: "BOZUK BÖLÜM", body: "x", revision: 1 });
    const r = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, saveRequestId: randomUUID() }, false);
    assert.equal(r.status, 500);
    assert.equal((store.tables.astro_analyses ?? []).length, 0);
    assert.equal((store.tables.astro_analysis_notes ?? []).length, 0);
  });

  await t("saat bilinmiyor: analiz teknik snapshot'ı maskeli, ev konusu/eşleşmesi yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx, null, { timeKnown: false, birthTime: null, timeAccuracy: "unknown" });
    const rid = await computed(ctx, pid, roxy(FIXTURE).deps);
    await kb(ctx, "planet_in_house:saturn:3", "ev notu");
    const pv = await previewAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid }, false);
    assert.equal((pv.body as { summary: { kbMatchCount: number; timeUnknownMasked: boolean } }).summary.kbMatchCount, 0);
    const aid = ((await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: rid, saveRequestId: randomUUID() }, false)).body as { analysisId: string }).analysisId;
    const a = ((await getAnalysis(ctx, aid, false)).body as { analysis: { technical: NatalTechnical; topics: { kind: string }[] } }).analysis;
    assert.equal(a.technical.houses.length, 0);
    assert.ok(!a.topics.some((x) => x.kind === "planet_in_house"));
  });

  // ─── Eşlenmemiş alan denetimi ──────────────────────────────────────────────
  await t("denetim: bilinmeyen alan YOLU kaydedilir (değer YOK), sayaç artar; sınıflandırma kaydı; fail-closed korunur", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    await computed(ctx, pid, roxy(FIXTURE).deps);
    const rows = store.tables.astro_unmapped_fields ?? [];
    const paths = rows.map((r) => r.field_path).sort();
    assert.ok(paths.includes("aiReading") && paths.includes("planets[].traitProfile"), paths.join(","));
    assert.ok(paths.some((p) => String(p).startsWith("dropped:")));
    assert.ok(!JSON.stringify(rows).includes("[RXU-"), "alan DEĞERİ kaydedildi");
    const l = await listUnmappedAudit(ctx);
    const f = (l.body as { fields: { id: string; fieldPath: string }[] }).fields.find((x) => x.fieldPath === "aiReading")!;
    assert.equal((await classifyUnmappedAudit(ctx, { id: f.id, classification: "interpretation" })).status, 200);
    assert.equal((await classifyUnmappedAudit(ctx, { id: f.id, classification: "bilinmiyor" })).status, 400);
    // Sınıflandırma adaptörü DEĞİŞTİRMEZ: alan hâlâ hiçbir katmanda yok.
    const pid2 = await profile(ctx, null, { birthDate: "1980-01-01" });
    const r2 = await runAstrology(ctx, { profileId: pid2, selections: SEL }, roxy(FIXTURE).deps, { ownerPreviewHideInterp: false });
    assert.ok(!JSON.stringify(r2.body).includes("[RXU-"));
    assert.ok((store.tables.astro_unmapped_fields.find((r) => r.field_path === "aiReading")!.seen_count as number) >= 2);
  });

  console.log(`\nastrology phase2 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase2 harness çöktü:", e);
  process.exit(1);
});
