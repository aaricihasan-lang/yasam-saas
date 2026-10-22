/**
 * ASTROLOJİ — VEDİK YOGA harness'i (22.10.2026, atlas-roxy-vedik-yoga).
 *
 * KARAR: Sağlayıcının yoga tespit ucu (POST …/yoga/detect) ile D1 doğum haritası yanıtındaki `yogas` alanı AYNI 48 denetim, AYNI
 * öğe şeması ve AYNI doğum girdisidir → MÜKERRER. Yeni teknik / yeni istek YOK; yalnız D1 ekranına ve raporuna kural düzeyinde
 * gösterim (oluşum kuralı, ilgili graha/bhava, nitelik, bağımsız denetim, ekol notu) eklenir. D1 isteği/adaptörü/anahtarı SABİT.
 *
 * Kaynak: GERÇEK D1 yanıtı (fixtures/golden/vedic-d1; sentetik kişi A 1990-07-15 14:30 İstanbul +3, Lahiri) + tespit ucunun
 * OpenAPI şema örneği (fixtures/schema/vedic-yoga-detect.json, "_kaynak": "openapi-schema-example" — gerçek yanıt DEĞİL)
 * + tespit ucunun GERÇEK yanıtı (fixtures/golden/vedic-yoga-detect.json, 23.10.2026, gövde = D1 golden gövdesi birebir;
 * "_kaynak": "gercek-saglayici-yaniti-2026-10-23"). Ürün bu ucu ÇAĞIRMAZ; golden yalnız MÜKERRER kararının gerçek kanıtıdır.
 * Bu harness sağlayıcıya çağrı YAPMAZ.
 *
 *   A) envanter + MÜKERRER kanıtı (48 kimlik, aile sayıları, öğe şeması birebir, şema örneği D1 projeksiyonundan geçer;
 *      GERÇEK tespit yanıtı = D1 yogaları 48/48, metin dışı alanlar özdeş)
 *   B) BAĞIMSIZ kural denetimi (D1 graha konumlarından): Pancha Mahapurusha, Gajakesari, Budha-Aditya, Chandra Mangala,
 *      Sunapha/Anapha/Durdhura, Nabhasa (Sankhya/Asraya/Akriti/Dala), Dhana Malika, Lakshmi; sentetik kaydırmalarla pozitif vakalar
 *   C) sözlük ≠ hesap (yalnız kayıttaki denetimler; Raja vb. gösterilmez) · şema örneği tutarlılık denetimi
 *   D) fail-closed (D1 projeksiyonu ≥5 bozuk yoga vakası) + çözümleyici dayanıklılığı (eski kayıt, eksik alan)
 *   E) saat yok → TIME_REQUIRED (0 istek) · F) plan / önbellek (2. çalıştırma 0 istek) · G) kaydet → aç (0 istek)
 *   H) Word/PDF/rapor işaretleri · I) yetki 404 + yorum kapısı (sağlayıcı oluşum/etki metni sızmaz)
 *   J) D1 isteği/anahtarı/projeksiyonu + mevcut 27 tekniğin hesap birimi özeti SABİT (taban 40f31195)
 *   K) KB: mevcut `yoga` konu türü (mükerrer tür yok) · L) UI bileşeni bağlantısı (statik)
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/vedik-yoga.harness.ts
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { projectRoxyVedicD1, ROXY_VEDIC_D1 } from "@/lib/astrology/providers/roxy/vedic";
import type { VedicD1Technical, VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { VEDIC_YOGA_DETECT_IDS, VEDIC_YOGA_DICTIONARY_NOTE, VEDIC_YOGA_INFO } from "@/lib/astrology/model/vedicYoga";
import { analyzeVedicYogas, checkVedicYogaRule, checkYogaVerdictShape, vedicYogaSummary, vedicYogaTriggers } from "@/lib/astrology/verify/vedicYoga";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { parseAnyTopicKey, topicsForTechnique } from "@/lib/astrology/topics/index";
import { VEDIC_SPECS } from "@/lib/astrology/topics/vedic";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { SYNTH_A, SYNTH_B } from "./golden/phase3-golden-calls";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const ROOT = join(__dirname, "..", "..");
const D1 = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "vedic-d1.json"), "utf8")) as { endpoint: string; query: null; body: Record<string, unknown>; response: J };
const SCHEMA_PATH = join(__dirname, "fixtures", "schema", "vedic-yoga-detect.json");
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as J;
/** Tespit ucunun GERÇEK yanıtı (23.10.2026) — ürün bu ucu çağırmaz; yalnız MÜKERRER kanıtı. */
const DETECT_PATH = join(__dirname, "fixtures", "golden", "vedic-yoga-detect.json");
const DETECT = JSON.parse(readFileSync(DETECT_PATH, "utf8")) as { endpoint: string; query: null; body: Record<string, unknown>; _kaynak: string; response: J };
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;

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
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const USER_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

function roxy(mutate?: (r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-yoga", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      if (endpoint !== D1.endpoint || canon(body) !== canon(D1.body)) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(D1.response);
      mutate?.(r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const run = (ctx: EngineCtx, pid: string, deps: EngineDeps, preview = false) => runAstrology(ctx, { profileId: pid, selections: [SEL] }, deps, { ownerPreviewHideInterp: preview });
const SEL = { technique: "vedic.d1", options: {} };
const ok = (r: J) => {
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.unmappedFields, []);
  assert.deepEqual(r.droppedValues, []);
  return r;
};
const d1 = ok(projectRoxyVedicD1(D1.response, { ayanamsa: "lahiri" })).technical as VedicD1Technical;
/** Sağlayıcının oluşum (description) ve etki (result) metinleri — yalnız yorum katmanında olmalı. */
const PROVIDER_TEXTS: string[] = (D1.response.yogas as J[]).flatMap((y) => [y.description, y.result]).filter((x): x is string => typeof x === "string" && x.length > 20);
const FORBIDDEN = /undefined|NaN|\[object Object\]|Roxy|golden|fixture|vedic-astrology\//;
const BASE_27: string[] = [
  "western.natal", "western.transit", "western.forecast", "western.progression", "western.solar_arc", "western.solar_return", "western.lunar_return",
  "western.synastry", "western.composite", "western.astrocartography", "western.relocation", "western.local_space", "western.fixed_stars", "western.profections",
  "vedic.d1", "vedic.varga", "vedic.dasha", "vedic.drishti", "vedic.ashtakavarga", "vedic.shadbala", "vedic.panchanga", "vedic.transit",
  "kp.chart", "kp.dasha", "kp.ruling", "kp.transit", "kp.horary",
];

/** Sentetik kaydırma: bir grahayı başka rashiye taşı (bütün-burç evi Lagna'dan yeniden sayılır). YALNIZ bağımsız kural testi. */
function moved(base: VedicD1Technical, moves: Partial<Record<VedicGrahaId, { rashi: SignId; deg?: number; retrograde?: boolean }>>): VedicD1Technical {
  const c = structuredClone(base);
  const li = SIGN_IDS.indexOf(c.lagna.rashi);
  for (const g of c.grahas) {
    const m = moves[g.id];
    if (!m) continue;
    const si = SIGN_IDS.indexOf(m.rashi);
    g.rashi = m.rashi;
    g.longitude = si * 30 + (m.deg ?? 15);
    g.degreeInRashi = m.deg ?? 15;
    g.house = ((si - li + 12) % 12) + 1;
    if (m.retrograde !== undefined) g.retrograde = m.retrograde;
  }
  return c;
}
const st = (tech: VedicD1Technical, id: string) => checkVedicYogaRule(tech, id).state;

async function docxText(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
async function pdfText(buf: Uint8Array): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}

async function main() {
  // ═══ A) ENVANTER + MÜKERRER KANITI ══════════════════════════════════════════
  await t("A: D1 kaydı 48 yoga denetimi taşır = tespit ucunun 48'i (12 klasik + 4 servet/yoksunluk + 32 Nabhasa); kimlikler katalogla birebir", () => {
    const ids = d1.yogas.map((y) => y.id);
    assert.equal(ids.length, 48);
    assert.deepEqual(ids, [...VEDIC_YOGA_DETECT_IDS]);
    assert.deepEqual(Object.keys(VEDIC_YOGA_INFO).sort(), [...VEDIC_YOGA_DETECT_IDS].sort());
    const fam: Record<string, number> = {};
    for (const y of d1.yogas) fam[y.family] = (fam[y.family] ?? 0) + 1;
    assert.deepEqual(fam, { classical: 16, akriti: 20, asraya: 3, dala: 2, sankhya: 7 });
    for (const y of d1.yogas) assert.equal(VEDIC_YOGA_INFO[y.id as keyof typeof VEDIC_YOGA_INFO].family, y.family, y.id);
    for (const id of ["dhana", "daridra", "lakshmi", "dhanamalika", "ruchaka", "bhadra", "hamsa", "malavya", "sasa", "gajakesari", "budhaaditya"]) assert.ok((ids as readonly string[]).includes(id), id);
  });

  await t("A: MÜKERRER — tespit ucu öğe şeması = D1 öğe şeması (9 alan, aynı zorunlular); istek alanları D1 gövdesinin alt kümesi; D1 gövdesi = ürün üreticisi", () => {
    assert.equal(SCHEMA._kaynak, "openapi-schema-example");
    assert.deepEqual(SCHEMA.item.properties, SCHEMA.birthChartItem.properties);
    assert.deepEqual([...SCHEMA.item.required].sort(), [...SCHEMA.birthChartItem.required].sort());
    assert.deepEqual(SCHEMA.item.properties, ["description", "evidence", "family", "id", "name", "present", "quality", "result", "suppressedBy"]);
    // D1'in gönderdiği gövde alanlarının tamamı tespit ucunda da tanımlı (aynı kundli girdisi); tespit ucunun ek girdisi yok.
    assert.equal(canon(D1.body), canon(vedicBirthBody(SYNTH_A, "lahiri")));
    for (const k of Object.keys(D1.body)) assert.ok(SCHEMA.request.properties.includes(k), k);
    for (const k of SCHEMA.request.properties) assert.ok(SCHEMA.birthChartRequest.properties.includes(k), `tespit ucunun D1'de olmayan girdisi: ${k}`);
    // Tespit yanıtının ek kökleri: frame (D1'de var), total (türetilir), birthDetails (istek yankısı).
    assert.deepEqual(SCHEMA.response.properties, ["birthDetails", "frame", "total", "yogas"]);
    const total = d1.yogas.filter((y) => y.present).length;
    assert.equal(total, vedicYogaSummary(analyzeVedicYogas(d1)).present);
  });

  await t("A: şema örneği öğesi D1 projeksiyonundan bilinmeyen alan 0 / düşen değer 0 ile geçer (alan alan aynı şema)", () => {
    const r = structuredClone(D1.response);
    r.yogas = [...r.yogas, ...SCHEMA.example.yogas.map((y: J) => ({ ...y, id: "gajakesari" }))];
    const p = ok(projectRoxyVedicD1(r, { ayanamsa: "lahiri" }));
    assert.equal(p.technical.yogas.length, 49);
    // 23.10.2026: golden klasöründeki tespit dosyası artık GERÇEK yanıttır; şema örneği orada değil (kaynak etiketi ayrı).
    assert.ok(existsSync(DETECT_PATH));
    assert.equal(DETECT._kaynak, "gercek-saglayici-yaniti-2026-10-23");
    assert.notEqual(canon(DETECT.response), canon(SCHEMA.example), "şema örneği gerçek golden klasörüne KONMAZ");
  });

  await t("A: GERÇEK tespit yanıtı (23.10.2026) = D1 yogaları — 48/48, sıra aynı; metin dışı tüm alanlar (id, present, evidence, family, quality, suppressedBy) özdeş; total 5 = D1'de oluşan 5 → MÜKERRER gerçek kanıtı", () => {
    assert.equal(DETECT.endpoint, "/vedic-astrology/yoga/detect");
    assert.equal(DETECT.query, null);
    // Gövde = D1 golden gövdesi BİREBİR (aynı kundli girdisi; tespit ucunun ek girdisi yok).
    assert.equal(canon(DETECT.body), canon(D1.body));
    assert.equal(canon(DETECT.body), canon(vedicBirthBody(SYNTH_A, "lahiri")));
    const r = DETECT.response;
    assert.deepEqual(Object.keys(r).sort(), ["birthDetails", "frame", "total", "yogas"]);
    const dy = D1.response.yogas as J[];
    assert.equal(r.yogas.length, 48);
    assert.deepEqual(r.yogas.map((y: J) => y.id), dy.map((y) => y.id));
    assert.deepEqual(r.yogas.map((y: J) => y.id), [...VEDIC_YOGA_DETECT_IDS]);
    const NON_TEXT = ["id", "present", "evidence", "family", "quality", "suppressedBy"] as const;
    let same = 0;
    r.yogas.forEach((y: J, i: number) => {
      for (const k of NON_TEXT) assert.equal(canon(y[k]), canon(dy[i][k]), `${y.id}.${k}`);
      for (const k of Object.keys(y)) assert.ok(SCHEMA.item.properties.includes(k), `şema dışı alan: ${y.id}.${k}`);
      same += 1;
    });
    assert.equal(same, 48);
    const present = r.yogas.filter((y: J) => y.present === true).map((y: J) => y.id);
    assert.deepEqual(present, ["sunapha", "chandramangala", "ruchaka", "daridra", "pasa"]);
    assert.equal(r.total, present.length);
    assert.deepEqual(present, d1.yogas.filter((y) => y.present).map((y) => y.id));
    assert.equal(r.total, vedicYogaSummary(analyzeVedicYogas(d1)).present);
    // Çerçeve: aynı ayanamsa; derece kayan nokta gürültüsü düzeyinde aynı (< 1e-9°). Doğum yankısı = gövdenin ayanamsasız hâli.
    assert.equal(r.frame.ayanamsa, D1.response.frame.ayanamsa);
    assert.ok(Math.abs(r.frame.ayanamsaDegrees - D1.response.frame.ayanamsaDegrees) < 1e-9);
    const birth = Object.fromEntries(Object.entries(DETECT.body).filter(([k]) => k !== "ayanamsa"));
    assert.equal(canon(r.birthDetails), canon(birth));
    // Gerçek tespit yanıtı da D1 projeksiyonundan bilinmeyen alan 0 / düşen değer 0 ile geçer ve aynı teknik yoga listesini verir.
    const merged = structuredClone(D1.response);
    merged.yogas = structuredClone(r.yogas);
    const p = ok(projectRoxyVedicD1(merged, { ayanamsa: "lahiri" }));
    assert.equal(canon(p.technical.yogas), canon(d1.yogas));
  });

  // ═══ B) BAĞIMSIZ KURAL DENETİMİ ═════════════════════════════════════════════
  await t("B: sentetik A (gerçek D1) — Pancha Mahapurusha bağımsız: Ruchaka OLUŞUR (Mars Koç kendi burcu, 7. ev); Bhadra/Hamsa/Malavya/Sasa oluşmaz — sağlayıcıyla 5/5 aynı", () => {
    assert.deepEqual(["ruchaka", "bhadra", "hamsa", "malavya", "sasa"].map((id) => st(d1, id)), ["holds", "fails", "fails", "fails", "fails"]);
    const rows = analyzeVedicYogas(d1);
    for (const id of ["ruchaka", "bhadra", "hamsa", "malavya", "sasa"]) assert.equal(rows.find((r) => r.id === id)!.consistency, "consistent", id);
    const ru = rows.find((r) => r.id === "ruchaka")!;
    assert.deepEqual(ru.triggers, { grahas: ["mars"], houses: [7] });
    assert.equal(vedicYogaTriggers(d1, "dhana"), null, "kural ailesi: ilgili graha uydurulmaz (kanıt metni)");
    assert.deepEqual(vedicYogaTriggers(d1, "lakshmi"), { grahas: ["mercury", "venus"], houses: [9, 10] }, "9. ev lordu Merkür + Lagna lordu Venüs");
    assert.ok(checkVedicYogaRule(d1, "ruchaka").detail.includes("Koç burcunda") && checkVedicYogaRule(d1, "ruchaka").detail.includes("7. evde"));
  });

  await t("B: Gajakesari (Jüpiter Ay'dan 4. = kendra, ama Satürn 7. bakış → oluşmaz), Budha-Aditya (14,0° > 10° → oluşmaz), Chandra Mangala (8,96° → oluşur) — sağlayıcıyla aynı", () => {
    assert.equal(st(d1, "gajakesari"), "fails");
    assert.ok(checkVedicYogaRule(d1, "gajakesari").detail.includes("Satürn"));
    assert.equal(st(d1, "budhaaditya"), "fails");
    assert.equal(st(d1, "chandramangala"), "holds");
    const rows = analyzeVedicYogas(d1);
    for (const id of ["gajakesari", "budhaaditya", "chandramangala"]) assert.equal(rows.find((r) => r.id === id)!.consistency, "consistent", id);
    assert.deepEqual(rows.find((r) => r.id === "chandramangala")!.triggers, { grahas: ["moon", "mars"], houses: [6, 7] });
  });

  await t("B: Chandra yogaları (Sunapha oluşur: Mars Ay'dan 2.; Anapha/Durdhura oluşmaz; Kemadruma oluşmaz) + Nabhasa: 5 rashi → Pasha OLUŞUR, diğer Sankhya/Asraya/Akriti/Dala oluşmaz; Dhana Malika, Lakshmi oluşmaz", () => {
    assert.deepEqual(["sunapha", "anapha", "dhurdhura", "kemadruma"].map((id) => st(d1, id)), ["holds", "fails", "fails", "fails"]);
    assert.equal(st(d1, "pasa"), "holds");
    for (const id of ["gola-2", "yuga", "sula", "kedara", "damni", "vallaki", "rajju", "musala", "nala", "dhanamalika", "lakshmi", "mala", "sarpa"]) assert.equal(st(d1, id), "fails", id);
    const rows = analyzeVedicYogas(d1);
    const bad = rows.filter((r) => r.consistency === "inconsistent");
    assert.deepEqual(bad.map((r) => r.id), [], "sentetik A'da bağımsız denetimle uyuşmazlık");
    const sum = vedicYogaSummary(rows);
    assert.equal(sum.total, 48);
    assert.equal(sum.present, 5);
    assert.ok(sum.consistent >= 40, JSON.stringify(sum));
    assert.equal(sum.notChecked, 2, "yalnız Dhana ve Daridra kural ailesi denetlenmez");
    assert.deepEqual(rows.filter((r) => r.present).map((r) => r.id), ["sunapha", "chandramangala", "ruchaka", "daridra", "pasa"]);
  });

  await t("B: sentetik kaydırmalarla pozitif vakalar — Hamsa (Jüpiter Yengeç 10.), Malavya (Venüs Terazi 1.), Sasa (Satürn Oğlak 4.), Bhadra (Merkür Başak 12. → kendra değil), Budha-Aditya (≤10°), Gajakesari geri hareketli", () => {
    assert.equal(st(moved(d1, { jupiter: { rashi: "cancer" } }), "hamsa"), "holds");
    assert.equal(st(moved(d1, { venus: { rashi: "libra" } }), "malavya"), "holds");
    assert.equal(st(moved(d1, { saturn: { rashi: "capricorn" } }), "sasa"), "holds");
    assert.equal(st(moved(d1, { mercury: { rashi: "virgo" } }), "bhadra"), "fails", "Başak = 12. ev (kendra değil)");
    assert.equal(st(moved(d1, { mercury: { rashi: "gemini", deg: 25 } }), "budhaaditya"), "holds");
    assert.equal(st(moved(d1, { jupiter: { rashi: "sagittarius", retrograde: true } }), "gajakesari"), "fails", "Ay'dan 10. ama geri hareketli");
    assert.equal(st(moved(d1, { saturn: { rashi: "aries" }, jupiter: { rashi: "sagittarius" } }), "gajakesari"), "uncertain", "kendra, geri değil, Mars/Satürn etkisi yok → ekol");
    // Nabhasa: yedi görünür graha tek rashide → Gola; 1. ve 7. evde (ikisi dolu) → Sakata (Nabhasa).
    const all = (r: SignId) => Object.fromEntries((["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as VedicGrahaId[]).map((g) => [g, { rashi: r }]));
    assert.equal(st(moved(d1, all("leo")), "gola-2"), "holds");
    assert.equal(st(moved(d1, all("leo")), "musala"), "holds");
    const sak = moved(d1, { ...all("libra"), moon: { rashi: "aries" }, mars: { rashi: "aries" } });
    assert.equal(st(sak, "sakata-2"), "holds");
    assert.equal(st(sak, "yuga"), "holds");
    assert.equal(st(sak, "rajju"), "holds");
    assert.equal(st(sak, "kamala"), "uncertain", "yalnız 1 ve 7 dolu → dört kendra koşulu ekole bağlı değil ama dördü dolu değil → belirsiz");
  });

  await t("B: uyuşmazlık yakalanır — sağlayıcı kararı ters çevrilirse (Ruchaka yok, Hamsa var) bağımsız denetim 'Uyuşmazlık' verir", () => {
    const c = structuredClone(d1);
    c.yogas.find((y) => y.id === "ruchaka")!.present = false;
    c.yogas.find((y) => y.id === "hamsa")!.present = true;
    const rows = analyzeVedicYogas(c);
    assert.deepEqual(rows.filter((r) => r.consistency === "inconsistent").map((r) => r.id), ["ruchaka", "hamsa"]);
    // Bastırılmış (kural sağlandı) Nabhasa: Pasha bastırıldı sayılırsa kural yine "sağlandı" → uyumlu.
    const s = structuredClone(d1);
    const p = s.yogas.find((y) => y.id === "pasa")!;
    p.present = false;
    p.suppressedBy = "akriti";
    const pr = analyzeVedicYogas(s).find((r) => r.id === "pasa")!;
    assert.equal(pr.status, "suppressed");
    assert.equal(pr.consistency, "consistent");
  });

  // ═══ C) SÖZLÜK ≠ HESAP + ŞEMA ÖRNEĞİ TUTARLILIĞI ════════════════════════════
  await t("C: yalnız kayıttaki (hesaplanmış) denetimler satır olur; sözlük başlıkları (Raja vb.) hesap gibi gösterilmez; katalog dışı kimlik 'denetlenmedi'", () => {
    assert.equal(SCHEMA.dictionaryIdCount, 301);
    for (const id of ["raja", "raja-2", "parijatha", "adhi", "amala", "saraswathi", "dhana-2", "daridra-2"]) assert.ok(!(id in VEDIC_YOGA_INFO), id);
    assert.ok(VEDIC_YOGA_DICTIONARY_NOTE.includes("Raja Yoga") && VEDIC_YOGA_DICTIONARY_NOTE.includes("48"));
    const c = structuredClone(d1);
    c.yogas = c.yogas.slice(0, 3);
    assert.deepEqual(analyzeVedicYogas(c).map((r) => r.id), ["gajakesari", "sunapha", "anapha"], "kayıtta olmayan yoga uydurulmaz");
    c.yogas.push({ id: "raja", name: "Raja Yoga", family: "classical", quality: "positive", present: true, evidence: null, suppressedBy: null });
    const raja = analyzeVedicYogas(c).find((r) => r.id === "raja")!;
    assert.equal(raja.known, false);
    assert.equal(raja.formation, null);
    assert.equal(raja.consistency, "not_checked");
  });

  await t("C: şema örneği tutarlılık denetimi — örnek öğe kendi içinde çelişkili (Gajakesari 'akriti' ailesi; present=true iken suppressedBy; aile kendini bastırıyor) → gerçek yanıt yerine KULLANILAMAZ; 48 gerçek öğe temiz", () => {
    const issues = checkYogaVerdictShape(SCHEMA.example.yogas[0]);
    assert.ok(issues.length >= 3, JSON.stringify(issues));
    assert.ok(issues.some((x) => x.includes("aile")));
    assert.ok(issues.some((x) => x.includes("present")));
    for (const y of D1.response.yogas as J[]) assert.deepEqual(checkYogaVerdictShape(y), [], y.id);
    assert.ok(checkYogaVerdictShape({ ...D1.response.yogas[45], present: false, suppressedBy: "akriti" }).length === 0, "Sankhya'yı Akriti bastırabilir");
    assert.ok(checkYogaVerdictShape({ ...D1.response.yogas[16], present: false, suppressedBy: "sankhya" }).length > 0, "Sankhya Akriti'yi bastıramaz");
    assert.ok(checkYogaVerdictShape({ ...D1.response.yogas[0], quality: "Great" }).length > 0);
  });

  // ═══ D) FAIL-CLOSED + DAYANIKLILIK ══════════════════════════════════════════
  await t("D: D1 projeksiyonu bozuk yoga öğelerini düşürür/raporlar, kök bozulursa reddeder (≥6 vaka); çözümleyici eski/eksik kayıtta çökmez", () => {
    const m = (f: (r: J) => void) => {
      const r = structuredClone(D1.response);
      f(r);
      return projectRoxyVedicD1(r, { ayanamsa: "lahiri" }) as J;
    };
    const a = m((r) => (r.yogas[0].present = "yes"));
    assert.ok(a.ok && a.droppedValues.includes("yogas[]") && a.technical.yogas.length === 47);
    const b = m((r) => (r.yogas[1].id = "Bad Id!"));
    assert.ok(b.ok && b.droppedValues.includes("yogas[]"));
    const c = m((r) => (r.yogas[45].suppressedBy = "royal"));
    assert.ok(c.ok && c.droppedValues.includes("yogas[].suppressedBy"));
    const d = m((r) => (r.yogas[2].newField = 1));
    assert.ok(d.ok && d.unmappedFields.includes("yogas[].newField"));
    assert.equal(m((r) => (r.frame.ayanamsa = "raman")).ok, false);
    assert.equal(m((r) => delete r.meta).ok, false);
    assert.equal(projectRoxyVedicD1(null, { ayanamsa: "lahiri" }).ok, false);
    // Çözümleyici: eski kayıt (suppressedBy yok), graha listesi bozuk, nitelik yok.
    const old = structuredClone(d1);
    for (const y of old.yogas) delete y.suppressedBy;
    const ro = analyzeVedicYogas(old);
    assert.equal(ro.length, 48);
    assert.ok(ro.every((r) => r.consistency !== "inconsistent"));
    const broken = { ...structuredClone(d1), grahas: [] } as VedicD1Technical;
    assert.ok(analyzeVedicYogas(broken).every((r) => r.check.state === "not_checked" && r.triggers === null));
    assert.deepEqual(analyzeVedicYogas({ ...structuredClone(d1), yogas: undefined } as unknown as VedicD1Technical), []);
    const nq = structuredClone(d1);
    nq.yogas[0].quality = null;
    assert.equal(analyzeVedicYogas(nq)[0].quality, null);
  });

  // ═══ E) SAAT YOK ════════════════════════════════════════════════════════════
  await t("E: doğum saati bilinmiyor → D1 (yogalar dahil) TIME_REQUIRED, 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const rx = roxy();
    const u = (await run(ctx, pu, rx.deps)).body as J;
    assert.equal(rx.calls.length, 0);
    assert.equal(u.results[0].code, "TIME_REQUIRED", JSON.stringify(u).slice(0, 300));
    assert.equal(getTechnique("vedic.d1")!.requiresKnownTime, true);
  });

  // ═══ F/G) PLAN / ÖNBELLEK / KAYIT ═══════════════════════════════════════════
  let savedId = "";
  let savedStore: FakeStore | null = null;
  let savedPa = "";
  await t("F: plan 1 yeni istek (yalnız D1; ayrı yoga isteği YOK) → çalıştır 1 istek → tekrar 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const p0 = (await planAstrology(ctx, { profileId: pa, selections: [SEL] })).body as J;
    assert.equal(p0.plan.newRequestCount, 1, JSON.stringify(p0.plan));
    const rx = roxy();
    const r1 = (await run(ctx, pa, rx.deps)).body as J;
    assert.ok(r1.results[0].ok, JSON.stringify(r1).slice(0, 300));
    assert.deepEqual(rx.calls.map((c) => c.endpoint), ["/vedic-astrology/birth-chart"]);
    await run(ctx, pa, rx.deps);
    assert.equal(rx.calls.length, 1, "önbellek");
    assert.equal(((await planAstrology(ctx, { profileId: pa, selections: [SEL] })).body as J).plan.newRequestCount, 0);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SEL, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    savedId = (sv.body as J).analysisId;
    savedStore = store;
    savedPa = pa;
  });

  await t("G: arşivden açma 0 istek; kayıtlı teknik veriden yoga tablosu aynı (48 satır, 5 oluşan)", async () => {
    const ctx = ctxOf(savedStore!);
    const rx = roxy();
    const a = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    assert.equal(rx.calls.length, 0);
    const rows = analyzeVedicYogas(a.technical);
    assert.equal(rows.length, 48);
    assert.equal(canon(rows), canon(analyzeVedicYogas(d1)));
  });

  // ═══ H) RAPOR ═══════════════════════════════════════════════════════════════
  const MARK = ["Yoga denetim tablosu", "Oluşum kuralı", "İlgili graha · bhava", "Bağımsız denetim", "Ruchaka", "Pasha", "Oluşuyor", "Bastırılan", "Raja Yoga", "Uyumlu", "Ekol notları"];
  await t("H: rapor modeli — yoga denetim tablosu (48), oluşum kuralı, ilgili graha/bhava, bağımsız denetim, sözlük notu; yasak değer yok", async () => {
    const a = ((await getAnalysis(ctxOf(savedStore!), savedId, false)).body as J).analysis;
    const s = reportTexts(buildAstroReport(a)).join("\n");
    for (const m of MARK.filter((x) => x !== "Bastırılan")) assert.ok(s.includes(m), `"${m}" yok`);
    assert.ok(!FORBIDDEN.test(s), `yasak değer ${s.match(FORBIDDEN)?.[0]}`);
    assert.ok(s.includes("Mars") && s.includes("7."));
  });

  await t("H: Word + PDF üretilir; yoga işaretleri ikisinde de; yasak değer yok", async () => {
    const ctx = ctxOf(savedStore!);
    const dx = await buildAnalysisReport(ctx, savedId, "docx", false);
    const px = await buildAnalysisReport(ctx, savedId, "pdf", false);
    assert.ok(dx.ok && px.ok);
    if (!dx.ok || !px.ok) return;
    const d = await docxText(dx.bytes);
    const p = await pdfText(px.bytes);
    for (const m of ["Yoga denetim tablosu", "Oluşum kuralı", "Bağımsız denetim", "Ruchaka", "Pasha", "Raja Yoga"]) {
      assert.ok(d.includes(m), `docx: ${m}`);
      assert.ok(p.includes(m), `pdf: ${m}`);
    }
    assert.ok(!FORBIDDEN.test(d) && !FORBIDDEN.test(p), "yasak değer");
  });

  // ═══ I) YETKİ + YORUM KAPISI ════════════════════════════════════════════════
  await t("I: başka tenant / başka uzman → 404; yoga tablosu ve raporu sağlayıcı oluşum/etki metnini İÇERMEZ (yorum kapalı / önizleme)", async () => {
    const store = savedStore!;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), savedId, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), savedId, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), savedPa, roxy().deps)).status, 404);
    assert.ok(PROVIDER_TEXTS.length >= 40);
    const rowsJson = JSON.stringify(analyzeVedicYogas(d1));
    for (const x of PROVIDER_TEXTS) assert.ok(!rowsJson.includes(x), `yoga tablosunda sağlayıcı metni: ${x.slice(0, 40)}`);
    const tech = JSON.stringify(d1);
    for (const x of PROVIDER_TEXTS) assert.ok(!tech.includes(x), "teknik katmanda sağlayıcı metni");
    const rx = roxy();
    const vis = JSON.stringify((await run(ctxOf(store), savedPa, rx.deps)).body);
    const hid = JSON.stringify((await run(ctxOf(store, { entitlements: NO_INTERP }), savedPa, rx.deps)).body);
    const pre = JSON.stringify((await run(ctxOf(store), savedPa, rx.deps, true)).body);
    assert.ok(PROVIDER_TEXTS.some((x) => vis.includes(x)), "yetkili yorum katmanında görmeli");
    for (const b of [hid, pre]) assert.ok(!PROVIDER_TEXTS.some((x) => b.includes(x)), "yorum sızdı");
    const repHid = reportTexts(buildAstroReport(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), savedId, false)).body as J).analysis)).join("\n");
    assert.ok(!PROVIDER_TEXTS.some((x) => repHid.includes(x)), "raporda yorum sızdı");
    assert.ok(repHid.includes("Yoga denetim tablosu"), "teknik tablo yorum yetkisinden bağımsız");
  });

  // ═══ J) SABİT HASH ══════════════════════════════════════════════════════════
  await t("J: D1 isteği/adaptörü/anahtarı SABİT (taban 40f31195: 5 seçenek özeti 3ff2238c…); D1 projeksiyonu birebir (teknik e6cadacf…, yorum c72f7bcf…)", () => {
    assert.deepEqual(ROXY_VEDIC_D1, { endpoint: "/vedic-astrology/birth-chart", adapter: "astro-roxy-vedic-d1-1", projection: "vedic-d1-proj-2" });
    const def = getTechnique("vedic.d1")!;
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc } as never;
    const rows = ["lahiri", "raman", "kp-newcomb", "kp-old", undefined].map((ay) => {
      const o = def.parseOptions(ay ? { ayanamsa: ay } : {}, new Date("2026-10-22T10:00:00Z"))!;
      return def.units(ctx, o).map((u) => `${ay} → ${u.endpoint} · ${u.adapterVersion} · ${u.inputHash} · ${JSON.stringify(u.body ?? null)}`);
    });
    assert.equal(createHash("sha256").update(JSON.stringify(rows)).digest("hex"), "3ff2238cac10ade141ce1937ddf6a36695ed0d8dd4bfed5217a554a36619ae7b");
    const p = projectRoxyVedicD1(D1.response, { ayanamsa: "lahiri" }) as J;
    assert.equal(createHash("sha256").update(JSON.stringify(p.technical)).digest("hex"), "e6cadacf31ad618fe6effd2663d755dc73ec982e7a208dbd8374d1492124fe18");
    assert.equal(createHash("sha256").update(JSON.stringify(p.interpretation)).digest("hex"), "c72f7bcfb744cadea107c151e4c7a1c1c7c872e7398e26dd0c6f186f0a0759ec");
    assert.ok(!(TECHNIQUE_IDS as readonly string[]).includes("vedic.yoga"), "ayrı yoga tekniği açılmadı (mükerrer)");
  });

  await t("J: mevcut 27 tekniğin hesap birimi özeti (uç · adaptör · inputHash, 148 birim) taban ile AYNI", () => {
    const NOW = new Date("2026-10-22T10:00:00Z");
    const CANDIDATES: Record<string, unknown>[] = [
      {}, { atUtc: "2026-10-07T09:00" }, { targetDate: "2026-10-07" }, { year: 2026 }, { month: "2026-10", sequence: 1 }, { age: 36 },
      { startDate: "2026-10-01", endDate: "2026-12-29" }, { horaryNumber: 100, atUtc: "2026-10-07T09:00" }, { partnerProfileId: "11111111-1111-4111-8111-111111111111" },
      { targetLocationId: "tr-06-ankara" },
    ];
    const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B, places: { target: { latitude: 51.5, longitude: -0.12, timezone: "Europe/London" }, reference: { latitude: 51.5, longitude: -0.12 } } } as never;
    const rows = BASE_27.map((id) => {
      const def = getTechnique(id)!;
      const out: string[] = [];
      for (const raw of CANDIDATES) {
        const o = def.parseOptions(raw, NOW);
        if (!o) continue;
        for (const u of def.units(ctx, o)) out.push(`${JSON.stringify(raw)} → ${u.endpoint} · ${u.adapterVersion} · ${u.inputHash}`);
      }
      return [id, out];
    });
    assert.equal(rows.reduce((n, r) => n + (r[1] as string[]).length, 0), 148);
    assert.equal(createHash("sha256").update(JSON.stringify(rows)).digest("hex"), "9c3799775de9245e7b5dad9452e3b352a46e467c617834945dc14d297f964567");
  });

  // ═══ K) KB ══════════════════════════════════════════════════════════════════
  await t("K: KB — mevcut `yoga` konu türü kullanılır (yeni tür yok); yalnız OLUŞAN yogalar konu olur; anahtar DB biçiminde", () => {
    assert.ok("yoga" in VEDIC_SPECS);
    assert.equal(Object.keys(VEDIC_SPECS).filter((k) => k.includes("yoga")).sort().join(","), "panchanga_nitya_yoga,yoga");
    const keys = topicsForTechnique("vedic.d1", d1).map((x) => x.key).filter((k) => k.startsWith("yoga:"));
    assert.deepEqual(keys.sort(), ["yoga:chandramangala", "yoga:daridra", "yoga:pasa", "yoga:ruchaka", "yoga:sunapha"]);
    for (const k of keys) {
      assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$/);
      assert.equal(parseAnyTopicKey("vedic", k)?.context, "vedic_d1");
    }
  });

  // ═══ L) UI (statik) ═════════════════════════════════════════════════════════
  await t("L: D1 paneli yoga denetim tablosunu gösterir (yalnız ekleme); bileşende sağlayıcı adı/ham uç yok; 390 uyumu için kart düzeni", () => {
    const panels = readFileSync(join(ROOT, "app", "admin", "astroloji", "_components", "VedicPanels.tsx"), "utf8");
    assert.ok(panels.includes('import { VedicYogaTable } from "./VedicYogaTable"'));
    assert.ok(panels.includes("<VedicYogaTable t={t} />"));
    const comp = readFileSync(join(ROOT, "app", "admin", "astroloji", "_components", "VedicYogaTable.tsx"), "utf8");
    for (const m of ["astro-vedic-yoga-table", "data-yoga-id", "data-yoga-status", "astro-vedic-yoga-filter", "VEDIC_YOGA_DICTIONARY_NOTE", "analyzeVedicYogas"]) assert.ok(comp.includes(m), m);
    assert.ok(!/roxy|golden|fixture|\/vedic-astrology\//i.test(comp.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
    assert.ok(comp.includes("min-w-0") && comp.includes("break-words"));
  });

  console.log(`\nvedik-yoga: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
