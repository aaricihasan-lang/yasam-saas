/**
 * ASTROLOJİ 2026-10-16 harness'i — (A) MÜKERRER DOĞUM PROFİLİ hatırlatması · (B) LOCAL SPACE merkez ↔ yorum tutarlılığı.
 *
 *   A) Kesin eşleşme kuralları (ad soyad · tarih · saat:dakika + doğruluk · konum kimliği/aynı yer · tz · UTC an),
 *      409 DUPLICATE_PROFILE (yazma YOK) · "Farklı kişi olarak devam et" (açık onay) · çift tıklama · çoklu eşleşme ·
 *      başka uzman / başka tenant görünmez · düzenleme kendini saymaz · 0 sağlayıcı isteği · eski kayıtlar aynen.
 *   B) Hesap merkezi = sağlayıcıya giden + yanıtın yansıttığı nokta; yorumdaki "doğum yerinizden" kalıbı seçilen
 *      merkezde "seçilen merkezden (<ad>)" + ayrı teknik not; doğum yerinde metin AYNEN. Ekran (SSR) + Word + PDF.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/dupls.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { appendAstroRevision, createAstroProfile, getAstroProfileDetail } from "@/lib/astrology/profiles/service";
import { nameKeys, personNameKey, sameBirthIdentity, type BirthIdentity } from "@/lib/astrology/profiles/duplicateMatch";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import { localSpaceCenter, localSpaceCenterNote, localSpaceText } from "@/lib/astrology/localSpaceCenter";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import ProviderInterpretationPanel from "@/app/admin/astroloji/_components/ProviderInterpretationPanel";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

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

const ROOT = join(__dirname, "..", "..");
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const EXPERT2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c"; // aynı tenant, BAŞKA uzman
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"; // başka tenant
const CLIENT_H = "48484848-4848-4848-8848-484848484848";
const FULL = resolveAstrologyEntitlements({ isOwner: true });

// Gerçek veri setinden (Çumra / Karesi) + aynı yerin eşdeğer yazılışları (sentetik kimlik, AYNI koordinat).
const CUMRA = resolveAstroLocation("trd-42-cumra")!;
const KARESI = resolveAstroLocation("trd-10-karesi")!;
const CUMRA_ALIAS: ResolvedLocation = { ...CUMRA, id: "legacy-cumra-1", label: "CUMRA, Konya" };
const CUMRA_NEAR: ResolvedLocation = { ...CUMRA, id: "legacy-cumra-near", label: "Çumra, Konya", latitude: CUMRA.latitude + 0.01 }; // ~1 km: yakınlık ≠ eşleşme
const KONYA_PROXY: ResolvedLocation = { ...CUMRA, id: "legacy-proxy", label: "Konya Merkez" }; // aynı koordinat, farklı yer adı
const LOCS = [CUMRA, KARESI, CUMRA_ALIAS, CUMRA_NEAR, KONYA_PROXY];
const resolveLoc = (id: unknown) => LOCS.find((l) => l.id === id) ?? null;

const seed = (): FakeStore =>
  createStore({
    clients: [
      { id: CLIENT_H, tenant_id: TENANT_A, ad: "Hasan", soyad: "ARICI" },
      { id: "c2c2c2c2-0000-4000-8000-0000000000c2", tenant_id: TENANT_B, ad: "Hasan", soyad: "Arıcı" },
    ],
  });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });
const HASAN = { label: "hasan arıcı", birthDate: "1987-02-14", birthTime: "21:00", timeKnown: true, timeAccuracy: "exact_record", locationId: CUMRA.id };
const create = (ctx: EngineCtx, over: Record<string, unknown> = {}) => createAstroProfile(ctx, { ...HASAN, ...over }, resolveLoc);
const idOf = (r: { body: unknown }) => (r.body as J).profile.id as string;
const dupsOf = (r: { body: unknown }) => ((r.body as J).duplicates ?? []) as J[];
const count = (store: FakeStore, table: string) => (store.tables[table] ?? []).length;

const LS_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "local-space.json"), "utf8"));
function roxy() {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-dup", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      if (endpoint !== "/astrology/local-space") return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(LS_GOLDEN.response);
      // Sağlayıcı gönderilen tek konumu "doğum yeri" sayar ve yansıtır (gerçek davranış; golden'da da aynı).
      r.birthDetails = { ...r.birthDetails, latitude: body.latitude, longitude: body.longitude };
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  };
  return { calls, deps };
}

async function docxText(buf: Buffer): Promise<string> {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
async function pdfText(buf: Uint8Array): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}

async function main() {
  // ═══ A) MÜKERRER PROFİL ═══════════════════════════════════════════════════════════════════════
  const base = (): BirthIdentity => ({ birthDate: "1987-02-14", birthTime: "21:00:00", timeKnown: true, timeAccuracy: "exact_record", locationId: CUMRA.id, locationLabel: CUMRA.label, latitude: CUMRA.latitude, longitude: CUMRA.longitude, timezone: "Europe/Istanbul", birthUtc: "1987-02-14T19:00:00.000Z" });

  await t("6) Türkçe normalize: 'HASAN ARICI', ' hasan  arıcı ', 'Hasan Arıcı — natal' aynı anahtar; 'Hasan' / 'Hasan Arıcıoğlu' farklı", () => {
    for (const v of ["HASAN ARICI", " hasan  arıcı ", "Hasan Arıcı — natal", "hAsAn ArIcI - transit", "Hasan ARİCİ"]) assert.equal(personNameKey(v), "hasan arici", v);
    assert.notEqual(personNameKey("Hasan"), "hasan arici");
    assert.notEqual(personNameKey("Hasan Arıcıoğlu"), "hasan arici");
    assert.deepEqual(nameKeys("", "  ", null), []);
  });

  await t("saf kural: tarih / saat:dakika / doğruluk / bilinmeyen saat / tz / UTC an / konum kimliği / aynı yer yazılışı / yakınlık / vekil", () => {
    const b = base();
    assert.equal(sameBirthIdentity(b, { ...b }), true);
    assert.equal(sameBirthIdentity(b, { ...b, birthTime: "21:00:40" }), true, "saniye farkı aynı dakika");
    assert.equal(sameBirthIdentity(b, { ...b, birthDate: "1987-02-15" }), false);
    assert.equal(sameBirthIdentity(b, { ...b, birthTime: "21:01:00", birthUtc: "1987-02-14T19:01:00.000Z" }), false);
    assert.equal(sameBirthIdentity(b, { ...b, timeAccuracy: "approximate" }), false, "yaklaşık ≠ resmî kayıt");
    assert.equal(sameBirthIdentity(b, { ...b, timeKnown: false, birthTime: null, timeAccuracy: "unknown", birthUtc: "1987-02-14T10:00:00.000Z" }), false, "bilinmeyen ≠ kesin");
    const u = { ...b, timeKnown: false, birthTime: null, timeAccuracy: "unknown", birthUtc: "1987-02-14T10:00:00.000Z" };
    assert.equal(sameBirthIdentity(u, { ...u }), true, "ikisi de bilinmiyor");
    assert.equal(sameBirthIdentity(b, { ...b, timezone: "Europe/Athens" }), false);
    assert.equal(sameBirthIdentity(b, { ...b, birthUtc: "1987-02-14T18:00:00.000Z" }), false, "farklı ofset/DST seçimi = farklı an");
    assert.equal(sameBirthIdentity(b, { ...b, locationId: CUMRA_ALIAS.id, locationLabel: CUMRA_ALIAS.label }), true, "eşdeğer yazılış + aynı koordinat");
    assert.equal(sameBirthIdentity(b, { ...b, locationId: "", locationLabel: "Çumra, Konya, Türkiye" }), true, "eski kayıt (kimliksiz) aynı yer");
    assert.equal(sameBirthIdentity(b, { ...b, locationId: CUMRA_NEAR.id, latitude: CUMRA_NEAR.latitude }), false, "yakınlık eşleşme değil");
    assert.equal(sameBirthIdentity(b, { ...b, locationId: KONYA_PROXY.id, locationLabel: KONYA_PROXY.label }), false, "aynı koordinat farklı yer adı (vekil)");
    assert.equal(sameBirthIdentity(b, { ...b, locationId: KARESI.id, locationLabel: KARESI.label, latitude: KARESI.latitude, longitude: KARESI.longitude }), false);
  });

  await t("1) + 16) tamamen aynı ad/tarih/saat/konum → 409 DUPLICATE_PROFILE; profil YAZILMAZ; uyarıda ad/tarih/saat/yer/analiz sayısı; 0 sağlayıcı isteği", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const rx = roxy();
    const p1 = idOf(await create(ctx));
    const nProf = count(store, "astro_birth_profiles");
    const nRev = count(store, "astro_birth_profile_revisions");
    const r = await create(ctx, { label: "HASAN ARICI" });
    assert.equal(r.status, 409);
    assert.equal((r.body as J).code, "DUPLICATE_PROFILE");
    assert.equal((r.body as J).error, "Bu doğum bilgileriyle kayıtlı bir danışan bulundu.");
    const d = dupsOf(r);
    assert.equal(d.length, 1);
    assert.deepEqual([d[0].profileId, d[0].label, d[0].birthDate, d[0].birthTime.slice(0, 5), d[0].timeKnown, d[0].locationLabel, d[0].analysisCount, d[0].archived], [p1, "hasan arıcı", "1987-02-14", "21:00", true, CUMRA.label, 0, false]);
    assert.equal(count(store, "astro_birth_profiles"), nProf, "profil yazılmamalı");
    assert.equal(count(store, "astro_birth_profile_revisions"), nRev);
    assert.equal(rx.calls.length, 0);
    // Yanıtta başka alan / sağlık / iletişim verisi yok (yalnız ayırt edici temel alanlar).
    assert.deepEqual(Object.keys(d[0]).sort(), ["analysisCount", "archived", "birthDate", "birthTime", "clientName", "label", "locationLabel", "partnerAnalysisCount", "profileId", "timeAccuracy", "timeKnown"]);
  });

  await t("2)–5) aynı ad + farklı tarih / farklı saat / farklı konum; farklı ad + aynı tarih/saat/yer → YENİ KİŞİ (201)", async () => {
    const ctx = ctxOf(seed());
    await create(ctx);
    for (const over of [{ birthDate: "1987-02-15" }, { birthTime: "21:30" }, { locationId: KARESI.id }, { locationId: CUMRA_NEAR.id }, { locationId: KONYA_PROXY.id }, { label: "Ayşe Arıcı" }, { label: "Hasan" }]) {
      const r = await create(ctx, over);
      assert.equal(r.status, 201, JSON.stringify(over));
    }
  });

  await t("7) aynı konumun eşdeğer yazılışı (farklı kimlik, aynı yer adı + koordinat) → uyarı", async () => {
    const ctx = ctxOf(seed());
    await create(ctx);
    const r = await create(ctx, { locationId: CUMRA_ALIAS.id });
    assert.equal(r.status, 409);
  });

  await t("8) bilinmeyen / yaklaşık saat: bilinmeyen ↔ kesin YENİ; yaklaşık ↔ kesin YENİ; bilinmeyen ↔ bilinmeyen uyarı", async () => {
    const ctx = ctxOf(seed());
    await create(ctx);
    assert.equal((await create(ctx, { timeKnown: false, birthTime: undefined, timeAccuracy: "unknown" })).status, 201);
    assert.equal((await create(ctx, { timeAccuracy: "approximate" })).status, 201);
    const again = await create(ctx, { timeKnown: false, birthTime: undefined, timeAccuracy: "unknown" });
    assert.equal(again.status, 409);
    assert.equal(dupsOf(again)[0].birthTime, null);
  });

  await t("eşleştirilmiş Danışan Yolculuğu adı da aday ad: profil adı farklı ('Natal çalışma') ama danışan Hasan ARICI → uyarı", async () => {
    const ctx = ctxOf(seed());
    await create(ctx);
    const r = await create(ctx, { label: "Natal çalışma", clientId: CLIENT_H });
    assert.equal(r.status, 409);
    const r2 = await create(ctx, { label: "Natal çalışma" });
    assert.equal(r2.status, 201, "ad eşleşmesi yoksa yalnız doğum verisiyle uyarı YOK");
  });

  await t("10) + 15) farklı kişi olarak devam: açık onayla 201; ayrı profil, revizyon, analiz/not karışmaz; aynı onayla tekrar (çift tıklama) → yeniden 409", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const p1 = idOf(await create(ctx));
    const first = await create(ctx);
    const ack = dupsOf(first).map((d) => d.profileId);
    const ok = await create(ctx, { confirmDifferentPerson: ack });
    assert.equal(ok.status, 201);
    const p2 = idOf(ok);
    assert.notEqual(p1, p2);
    const d1 = ((await getAstroProfileDetail(ctx, p1)).body as J).profile;
    const d2 = ((await getAstroProfileDetail(ctx, p2)).body as J).profile;
    assert.deepEqual([d1.revisions.length, d2.revisions.length], [1, 1]);
    // Çift tıklama: aynı (eski) onay listesiyle ikinci istek → artık p2 de eşleşir ve onaylanmamıştır → 409, yazma yok.
    const n = count(store, "astro_birth_profiles");
    const dbl = await create(ctx, { confirmDifferentPerson: ack });
    assert.equal(dbl.status, 409);
    assert.equal(count(store, "astro_birth_profiles"), n);
    assert.deepEqual(dupsOf(dbl).map((d) => d.profileId).sort(), [p1, p2].sort());
    // Sahte / geçersiz onay kimlikleri işe yaramaz.
    assert.equal((await create(ctx, { confirmDifferentPerson: ["x", 5, null, randomUUID()] })).status, 409);
  });

  await t("12) birden fazla tam eşleşme (etkin + arşivli) → hepsi listelenir, arşiv rozeti ve gerçek analiz sayıları", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const p1 = idOf(await create(ctx));
    const p2 = idOf(await create(ctx, { confirmDifferentPerson: [p1] }));
    const row = (store.tables.astro_birth_profiles as J[]).find((x) => x.id === p2)!;
    row.archived_at = new Date().toISOString();
    // Sentetik kayıtlı analiz sayıları: p1 = 2, p2 = 15 (owner ekran örneği).
    for (const [pid, n] of [[p1, 2], [p2, 15]] as const)
      for (let i = 0; i < n; i += 1) (store.tables.astro_analyses ??= []).push({ id: randomUUID(), tenant_id: TENANT_A, owner_user_id: OWNER, profile_id: pid, analysis_at: new Date().toISOString() });
    const r = await create(ctx);
    assert.equal(r.status, 409);
    const d = dupsOf(r);
    assert.equal(d.length, 2);
    const by = new Map(d.map((x) => [x.profileId, x]));
    assert.deepEqual([by.get(p1).analysisCount, by.get(p1).archived, by.get(p2).analysisCount, by.get(p2).archived], [2, false, 15, true]);
  });

  await t("ortak analiz: profil başka profilin sinastri/kompozit kaydında 2. kişiyse ayrı sayı (sahiplik o kayıtta kalır)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const p1 = idOf(await create(ctx));
    const other = idOf(await create(ctx, { label: "Ayşe Deneme", birthDate: "1990-01-01" }));
    (store.tables.astro_analyses ??= []).push({ id: randomUUID(), tenant_id: TENANT_A, owner_user_id: OWNER, profile_id: other, partner_profile_id: p1, analysis_at: new Date().toISOString() });
    const d = dupsOf(await create(ctx));
    assert.deepEqual([d[0].profileId, d[0].analysisCount, d[0].partnerAnalysisCount], [p1, 0, 1]);
  });

  await t("13) başka uzman (aynı tenant) ve başka tenant: kayıtlar ASLA eşleşmez/görünmez; kendi alanlarında serbestçe oluşturur", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const p1 = idOf(await create(ctx));
    const e2 = ctxOf(store, { userId: EXPERT2 });
    const rb = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    const r2 = await create(e2);
    const r3 = await create(rb);
    assert.deepEqual([r2.status, r3.status], [201, 201]);
    assert.ok(!JSON.stringify([r2.body, r3.body]).includes(p1));
    // Sahibin tekrar denemesi yalnız KENDİ p1'ini görür.
    assert.deepEqual(dupsOf(await create(ctx)).map((d) => d.profileId), [p1]);
    // Başka tenant uzmanının "onay" diye p1 kimliğini göndermesi hiçbir şeyi açığa çıkarmaz.
    const r4 = await create(rb, { confirmDifferentPerson: [p1] });
    assert.equal(r4.status, 409);
    assert.ok(!JSON.stringify(r4.body).includes(p1));
  });

  await t("2.4) düzenleme: kendi profilini mükerrer saymaz; başka profille tam eşleşme oluşturacaksa 409 (revizyon YAZILMAZ); onayla kaydeder", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const p1 = idOf(await create(ctx));
    const p2 = idOf(await create(ctx, { birthTime: "22:00" }));
    const same = await appendAstroRevision(ctx, p1, { expectedRevision: 1, ...HASAN, changeNote: "aynı veri" }, resolveLoc);
    assert.equal(same.status, 200, JSON.stringify(same.body));
    const nRev = count(store, "astro_birth_profile_revisions");
    const clash = await appendAstroRevision(ctx, p2, { expectedRevision: 1, ...HASAN }, resolveLoc);
    assert.equal(clash.status, 409);
    assert.deepEqual(dupsOf(clash).map((d) => d.profileId), [p1]);
    assert.equal(count(store, "astro_birth_profile_revisions"), nRev);
    const ok = await appendAstroRevision(ctx, p2, { expectedRevision: 1, ...HASAN, confirmDifferentPerson: [p1] }, resolveLoc);
    assert.equal(ok.status, 200);
  });

  await t("17) eski mükerrer kayıtlar KORUNUR: denetim hiçbir profili/revizyonu/analizi/eşleştirmeyi değiştirmez, silmez, taşımaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const p1 = idOf(await create(ctx, { clientId: CLIENT_H }));
    const p2 = idOf(await create(ctx, { confirmDifferentPerson: [p1] }));
    (store.tables.astro_analyses ??= []).push({ id: randomUUID(), tenant_id: TENANT_A, owner_user_id: OWNER, profile_id: p2, analysis_at: "2026-10-01T10:00:00Z" });
    const snap = JSON.stringify([store.tables.astro_birth_profiles, store.tables.astro_birth_profile_revisions, store.tables.astro_analyses, store.tables.clients]);
    for (let i = 0; i < 3; i += 1) assert.equal((await create(ctx)).status, 409);
    assert.equal((await appendAstroRevision(ctx, p2, { expectedRevision: 1, ...HASAN, birthTime: "21:00" }, resolveLoc)).status, 409);
    assert.equal(JSON.stringify([store.tables.astro_birth_profiles, store.tables.astro_birth_profile_revisions, store.tables.astro_analyses, store.tables.clients]), snap);
    assert.ok(!store.log.some((l: J) => ["update", "delete"].includes(l.op) && ["astro_birth_profiles", "astro_analyses", "clients"].includes(l.table)));
  });

  await t("UI kaynak: 3 seçenek + çift tıklama kilidi + mevcut danışana geçiş (Danışan Dosyası) + iptal çıkış onayı sormadan kapatır", () => {
    const form = readFileSync(join(ROOT, "app/admin/astroloji/_components/ProfileForm.tsx"), "utf8");
    const dlg = readFileSync(join(ROOT, "app/admin/astroloji/_components/DuplicateProfileDialog.tsx"), "utf8");
    const page = readFileSync(join(ROOT, "app/admin/astroloji/page.tsx"), "utf8");
    for (const s of ["Mevcut danışana geç", "Farklı kişi olarak devam et", "İptal et", "Bu doğum bilgileriyle kayıtlı", "createPortal"]) assert.ok(dlg.includes(s), s);
    assert.match(form, /if \(inFlight\.current\) return;/);
    assert.match(form, /confirmDifferentPerson/);
    assert.equal((page.match(/onOpenExisting=\{\(id\) => \{\s*setFormDirty\(false\);\s*setForm\(null\);\s*openClientFile\(id\);/g) ?? []).length, 4);
    assert.equal((page.match(/onDiscard=\{\(\) => setForm\(null\)\}/g) ?? []).length, 4);
  });

  // ═══ B) LOCAL SPACE MERKEZ ↔ YORUM ═════════════════════════════════════════════════════════════
  const store = seed();
  const ctx = ctxOf(store);
  const pid = idOf(await create(ctx));
  const rx = roxy();
  const sels = [
    { technique: "western.local_space", options: { referenceLocationId: KARESI.id } },
    { technique: "western.local_space", options: { referenceLocationId: null } },
  ];
  const run = await runAstrology(ctx, { profileId: pid, selections: sels }, rx.deps, { ownerPreviewHideInterp: false });
  const ids: string[] = [];
  for (const s of sels) {
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...s, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    ids.push((sv.body as J).analysisId);
  }
  const full = async (id: string) => ((await getAnalysis(ctx, id, false)).body as J).analysis as ReportAnalysisInput & J;
  const [kar, birth] = [await full(ids[0]), await full(ids[1])];

  await t("18a) hesap merkezi: sağlayıcıya Karesi koordinatı gider, yanıt aynı noktayı yansıtır; teknik reference = Karesi; doğum yeri seçimi = Çumra", () => {
    assert.equal(run.status, 200, JSON.stringify(run.body).slice(0, 300));
    const ls = rx.calls.filter((c) => c.endpoint === "/astrology/local-space");
    assert.equal(ls.length, 2);
    assert.deepEqual([ls[0].body.latitude, ls[0].body.longitude], [KARESI.latitude, KARESI.longitude]);
    assert.deepEqual([ls[1].body.latitude, ls[1].body.longitude], [CUMRA.latitude, CUMRA.longitude]);
    assert.deepEqual([kar.technical.reference.latitude, kar.technical.reference.longitude], [KARESI.latitude, KARESI.longitude]);
    assert.equal(kar.params.reference.label, KARESI.label);
    assert.deepEqual([birth.technical.reference.latitude, birth.technical.reference.longitude], [CUMRA.latitude, CUMRA.longitude]);
  });

  await t("18b) snapshot DEĞİŞMEZ: kayıtlı yorum metni sağlayıcı kalıbını aynen taşır ('doğum yerinizden')", () => {
    assert.ok(kar.interpretation.visible);
    assert.ok(kar.interpretation.content.bodies.every((b: J) => b.text.includes("doğum yerinizden")));
  });

  const bc = { lat: CUMRA.latitude, lon: CUMRA.longitude };
  await t("18c) saf: seçilen merkez → 'seçilen merkezden (Karesi, Balıkesir, Türkiye)' + ayrı not; doğum yeri → metin AYNEN, not YOK; yön sözcüğü korunur", () => {
    const c = localSpaceCenter(kar.technical, kar.params, bc)!;
    assert.deepEqual([c.isBirthPlace, c.label], [false, KARESI.label]);
    const sun = kar.interpretation.content.bodies.find((b: J) => b.id === "sun").text as string;
    const fixed = localSpaceText(sun, c);
    assert.equal(fixed, sun.replace("doğum yerinizden", `seçilen merkezden (${KARESI.label})`));
    assert.ok(fixed.includes("güneybatı yönünü gösterir"));
    assert.equal(localSpaceText("Doğum yerinizden kuzey.", c), `Seçilen merkezden (${KARESI.label}) kuzey.`);
    assert.match(localSpaceCenterNote(c)!, /Hesaplama merkezi: Karesi, Balıkesir, Türkiye \(39,6492° K, 27,8861° D\) — doğum yeri değil/);
    const cb = localSpaceCenter(birth.technical, birth.params, bc)!;
    assert.equal(cb.isBirthPlace, true);
    assert.equal(localSpaceText(sun, cb), sun);
    assert.equal(localSpaceCenterNote(cb), null);
    // Doğum yeri bilinmiyorsa: açık referans seçimi → seçilen merkez; seçim yoksa doğum yeri sayılır.
    assert.equal(localSpaceCenter(kar.technical, kar.params, null)!.isBirthPlace, false);
    assert.equal(localSpaceCenter(birth.technical, { referenceLocationId: null }, null)!.isBirthPlace, true);
    assert.equal(localSpaceCenter({}, kar.params, bc), null);
  });

  await t("18d) ekran (SSR): yorum panelinde not + 'seçilen merkezden'; doğum yeri analizinde metin aynen", () => {
    const html = renderToStaticMarkup(createElement(ProviderInterpretationPanel, { interpretation: kar.interpretation, localSpace: localSpaceCenter(kar.technical, kar.params, bc) }));
    assert.ok(html.includes('data-testid="astro-ls-center-note"'));
    assert.ok(html.includes("seçilen merkezden (Karesi, Balıkesir, Türkiye)"));
    assert.ok(!/(?<!“)doğum yerinizden(?!”)/.test(html), "metinde düzeltilmemiş kalıp");
    const hb = renderToStaticMarkup(createElement(ProviderInterpretationPanel, { interpretation: birth.interpretation, localSpace: localSpaceCenter(birth.technical, birth.params, bc) }));
    assert.ok(!hb.includes("astro-ls-center-note"));
    assert.ok(hb.includes("doğum yerinizden"));
  });

  await t("19) Word + PDF: Karesi raporunda merkez + not + düzeltilmiş cümleler; doğum yeri raporunda kalıp aynen; teknik tablo/azimut aynı", async () => {
    const fontB64 = readFileSync(join(ROOT, "public", "fonts", "Geist-Regular.ttf")).toString("base64");
    for (const [a, selected] of [[kar, true], [birth, false]] as const) {
      const r = buildAstroReport(a);
      const txt = reportTexts(r).join("\n");
      const dx = await docxText(await renderAstroReportDocx(r, null, symbolFontBuffers()));
      const px = await pdfText(buildAstroReportPdf(r, null, fontB64, symbolFontsBase64()));
      for (const [name, s] of [["model", txt], ["docx", dx], ["pdf", px]] as const) {
        const flat = s.replace(/\s+/g, " ");
        if (selected) {
          assert.ok(flat.includes("Merkez Karesi, Balıkesir, Türkiye") || flat.includes("Karesi, Balıkesir, Türkiye ("), `${name}: merkez`);
          assert.ok(flat.includes("Hesaplama merkezi: Karesi, Balıkesir, Türkiye"), `${name}: not`);
          assert.ok(flat.includes("Güneş hattınız, seçilen merkezden (Karesi, Balıkesir, Türkiye) güneybatı yönünü gösterir"), `${name}: güneş cümlesi`);
          assert.ok(!/(?<!“)doğum yerinizden(?!”)/.test(flat), `${name}: düzeltilmemiş kalıp`);
        } else {
          assert.ok(flat.includes("Güneş hattınız, doğum yerinizden güneybatı yönünü gösterir"), `${name}: doğum yeri metni aynen`);
          assert.ok(!flat.includes("Hesaplama merkezi:"), `${name}: doğum yerinde not olmamalı`);
        }
        assert.ok(flat.includes("227,0°"), `${name}: azimut tablosu`);
      }
    }
  });

  console.log(`\nastrology dupls (mükerrer profil + local space merkez) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
