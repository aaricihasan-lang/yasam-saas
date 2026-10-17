/**
 * TRANSİT-02 harness'i (2026-10-17) — Vedik Gochara rapor tamamlama.
 *
 *   A) Türkçe teknik özet: 9 graha, kayıtlı sayılarla birebir (ev / drishti / kaksha / bindu), değerlendirme sözcüğü
 *      ve sağlayıcının İngilizce anlatısı YOK.
 *   B) Rapor modeli: ev şeridi figürü (12 kutu, 1. kutu Janma Rashi, her graha Janma Rashi'den evinde), Türkçe
 *      başlıklar, Lahiri ayanamsa etiketi, terimler; Batı açı sözlüğü teknik tabloda yok.
 *   C) Figür: SVG (12 kutu + 9 graha adı) ve PNG üretilir; bozuk veri → "çizilemedi" notu (yanlış harita YOK).
 *   D) Uçtan uca (sahte Roxy = golden): Word + PDF içerikleri; yorum yetkisi kapalıyken İngilizce anlatı YOK,
 *      açıkken "yalnız İngilizce" notuyla AYNEN; eski Gochara kaydı (snapshot) yeni rapor koduyla üretilir; 0 ek istek.
 *   E) Ayanamsa: Gochara yalnız Lahiri (başka ayanamsa → istek üretmez, açık neden).
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/transit02.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { buildAstroReport, type ReportBlock } from "@/lib/astrology/report/model";
import { renderFigurePng, renderFigureSvg } from "@/lib/astrology/report/figurePng";
import { gocharaSummary, GOCHARA_TERMS } from "@/lib/astrology/gocharaSummary";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import type { VedicTransitTechnical } from "@/lib/astrology/model/vedic";
import { GRAHA_LABELS } from "@/lib/astrology/topics/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const GOLD = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "vedic-transit.json"), "utf8"));
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
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

const TR = getTechnique("vedic.transit")!;
const BIRTH = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 } as never;
const UCTX = { birth: BIRTH, birthUtc: "1990-07-15T11:30:00Z", partner: null } as never;
const OPT = { ayanamsa: "lahiri", atUtc: "2026-10-07T09:00" };

const EVAL_WORDS = /\b(iyi|kötü|olumlu|olumsuz|şanslı|şanssız|uğurlu|uğursuz|tehlike|felaket|kazanç|kayıp yaşar|başarı getirir)\b/i;

async function docxText(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
}
async function pdfText(buf: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return String(text).replace(/\s+/g, " ");
}

async function main() {
  const unit = TR.units(UCTX, OPT)[0];
  await t("hazırlık: ürün gövdesi = golden gövdesi (gerçek sağlayıcı yanıtı bu gövdeye ait)", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(unit.body)), GOLD.body);
  });
  const proj = TR.project(unit, GOLD.response, OPT) as J;
  assert.ok(proj.ok, JSON.stringify(proj.errors));
  const tech = proj.technical as VedicTransitTechnical;
  const providerTexts = (GOLD.response.keyTransits as J[]).map((k) => String(k.description ?? "")).filter((x) => x.length > 20);

  // ═══ A) Türkçe teknik özet ════════════════════════════════════════════════════
  await t("A1 Türkçe teknik özet: 9 graha, önce yavaş grahalar; her cümle kayıtlı sayılarla birebir", () => {
    const sm = gocharaSummary(tech);
    assert.equal(sm.length, 9);
    assert.deepEqual(sm.slice(0, tech.slow.length).map((x) => x.id), tech.slow);
    for (const x of sm) {
      const tr = tech.transits.find((y) => y.id === x.id)!;
      assert.ok(x.text.includes(`Janma Rashi'den ${tr.houseFromMoon}. ev`), `${x.id}: Ay'dan ev`);
      assert.ok(x.text.includes(`Lagna'dan ${tr.natalHouse}. bhava`), `${x.id}: Lagna'dan bhava`);
      assert.ok(x.text.includes(`kaksha ${tr.kaksha.number}/8`), `${x.id}: kaksha`);
      for (const d of tr.drishti) assert.ok(x.text.includes(GRAHA_LABELS[d.to]), `${x.id}: drishti ${d.to}`);
      if (tr.kaksha.bindu !== null) assert.ok(x.text.includes(`${tr.kaksha.binduCount}/8 bindu`), `${x.id}: bindu sayısı`);
      assert.ok(x.text.includes(GRAHA_LABELS[x.id]));
    }
  });
  await t("A2 özet YORUM içermez: değerlendirme sözcüğü yok, sağlayıcının İngilizce anlatısı yok", () => {
    const all = gocharaSummary(tech).map((x) => x.text).join(" ");
    assert.ok(!EVAL_WORDS.test(all), all.match(EVAL_WORDS)?.[0]);
    assert.ok(providerTexts.length > 0, "golden'da anlatı olmalı (sızıntı testinin önkoşulu)");
    for (const p of providerTexts) assert.ok(!all.includes(p.slice(0, 40)), "sağlayıcı anlatısı özete sızdı");
    assert.ok(!/\b(the|is|transit of|house from)\b/i.test(all), "İngilizce sözcük");
  });

  // ═══ B) Rapor modeli ══════════════════════════════════════════════════════════
  const rep = buildAstroReport({ technique: "vedic.transit", params: OPT, technical: tech, method: {}, profile: { label: "Sentetik A" }, interpretation: { visible: false, reason: "not_entitled" } } as never);
  const txt = JSON.stringify(rep.blocks);
  await t("B1 ev şeridi figürü: 12 kutu, 1. kutu Janma Rashi, her graha Janma Rashi'den evinde (eksiksiz)", () => {
    const fig = rep.blocks.find((x): x is Extract<ReportBlock, { kind: "chart" }> => x.kind === "chart" && "figure" in x);
    assert.ok(fig && "figure" in fig && fig.figure.type === "gocharaStrip");
    if (!fig || !("figure" in fig) || fig.figure.type !== "gocharaStrip") return;
    const cells = fig.figure.cells;
    assert.equal(cells.length, 12);
    assert.equal(cells[0].rashi, tech.janmaRashi);
    for (let i = 0; i < 12; i++) assert.equal(cells[i].rashi, SIGN_IDS[(SIGN_IDS.indexOf(tech.janmaRashi) + i) % 12]);
    const placed = cells.flatMap((c) => c.grahas.map((g) => `${g.id}@${c.house}`)).sort();
    assert.deepEqual(placed, tech.transits.map((x) => `${x.id}@${x.houseFromMoon}`).sort());
    assert.deepEqual(cells.flatMap((c) => c.grahas.filter((g) => g.slow).map((g) => g.id)).sort(), [...tech.slow].sort());
  });
  await t("B2 Türkçe başlıklar + Lahiri ayanamsa etiketi + terimler; yasak değer yok", () => {
    for (const needle of ["Gochara ev şeridi", "Türkçe teknik özet", "Janma Rashi'den ev", "Lagna'dan bhava", "Natal grahaya drishti", "Lahiri (Chitrapaksha)", "bu teknikte sabit", "Terimler", "Natal grahalar (Gochara referansı)", ...GOCHARA_TERMS.map(([k]) => k)]) assert.ok(txt.includes(needle), `"${needle}" yok`);
    for (const bad of ["undefined", "NaN", "[object Object]", "null"]) assert.ok(!txt.includes(`"${bad}"`) && !txt.includes(` ${bad} `), bad);
  });
  await t("B3 Batı transit açıları Gochara tablosuna KARIŞMAZ (aspectsToNatal projekte edilmez)", () => {
    const table = rep.blocks.find((x) => x.kind === "table" && x.table.columns[0] === "Transit graha");
    assert.ok(table && table.kind === "table");
    if (!table || table.kind !== "table") return;
    const cells = JSON.stringify(table.table.rows);
    for (const w of ["Kare", "Üçgen", "Sekstil", "Karşıt", "trine", "square", "sextile"]) assert.ok(!cells.includes(w), w);
    assert.ok(!("aspectsToNatal" in (tech.transits[0] as object)));
  });

  // ═══ C) Figür çizimi ═════════════════════════════════════════════════════════
  await t("C1 SVG: 12 kutu + 9 graha adı; PNG geniş (yatay) ve boş değil", async () => {
    const fig = rep.blocks.find((x) => x.kind === "chart" && "figure" in x) as Extract<ReportBlock, { kind: "chart" }> & { figure: J };
    const svg = await renderFigureSvg(fig.figure);
    assert.equal((svg.match(/data-gochara-house=/g) ?? []).length, 12);
    for (const x of tech.transits) assert.ok(svg.includes(`>${GRAHA_LABELS[x.id].split(" ")[0]}<`), `${x.id} adı yok`);
    const png = await renderFigurePng(fig.figure, 1200);
    assert.ok(!("error" in png), "error" in png ? png.error : "");
    if (!("error" in png)) {
      assert.ok(png.width === 1200 && png.height > 150 && png.height < 700, `${png.width}×${png.height}`);
      assert.ok(png.png.length > 5000);
    }
  });
  await t("C2 bozuk veri (Janma Rashi yok) → figür yerine açık 'çizilemedi' notu (yanlış harita YOK)", () => {
    const bad = buildAstroReport({ technique: "vedic.transit", params: OPT, technical: { ...tech, janmaRashi: "x" }, method: {}, profile: { label: "X" } } as never);
    assert.ok(!bad.blocks.some((x) => x.kind === "chart"));
    assert.ok(JSON.stringify(bad.blocks).includes("çizilemedi"));
  });

  // ═══ D) Uçtan uca ════════════════════════════════════════════════════════════
  const store = createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
  const ctx = ctxOf(store);
  const pr = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
  const pid = (pr.body as J).profile.id;
  const calls: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint) => {
      calls.push(endpoint);
      return endpoint === GOLD.endpoint ? { ok: true, raw: structuredClone(GOLD.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    now: () => new Date("2026-10-07T09:41:00Z"),
  };
  let id = "";
  await t("D1 Gochara çalıştır + kaydet (1 istek) → Word + PDF: ev şeridi görseli, Türkçe özet, Lahiri, terimler", async () => {
    const r = await runAstrology(ctx, { profileId: pid, selections: [{ technique: "vedic.transit", options: OPT }] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    assert.deepEqual(calls, [GOLD.endpoint]);
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, technique: "vedic.transit", options: OPT, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    id = (sv.body as J).analysisId;
    const dx = await buildAnalysisReport(ctx, id, "docx", false);
    const px = await buildAnalysisReport(ctx, id, "pdf", false);
    assert.ok(dx.ok && px.ok && dx.hasChart && px.hasChart, "ev şeridi görseli");
    if (!dx.ok || !px.ok) return;
    if (process.env.SAMPLES_DIR) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(process.env.SAMPLES_DIR, "ornek-gochara.docx"), dx.bytes);
      writeFileSync(join(process.env.SAMPLES_DIR, "ornek-gochara.pdf"), px.bytes);
    }
    const zip = await JSZip.loadAsync(dx.bytes);
    assert.ok(Object.keys(zip.files).some((f) => f.startsWith("word/media/")), "Word'de görsel yok");
    const d = await docxText(dx.bytes);
    const p = await pdfText(px.bytes);
    const firstLine = gocharaSummary(tech)[0].text.slice(0, 30);
    for (const [label, s] of [["docx", d], ["pdf", p]] as const) {
      for (const needle of ["Gochara ev şeridi", "Türkçe teknik özet", "Lahiri (Chitrapaksha)", "Terimler", "Janma Rashi"]) assert.ok(s.includes(needle), `${label}: "${needle}" yok`);
      assert.ok(s.replace(/\s+/g, " ").includes(firstLine.replace(/\s+/g, " ")), `${label}: özet satırı yok`);
      for (const bad of ["undefined", "NaN", "[object Object]"]) assert.ok(!s.includes(bad), `${label}: ${bad}`);
    }
    assert.deepEqual(calls, [GOLD.endpoint], "rapor üretimi sağlayıcı çağırdı");
  });
  await t("D2 yorum yetkisi AÇIK: İngilizce anlatı 'yalnız İngilizce' notuyla AYNEN; KAPALI: anlatı Word/PDF'te YOK", async () => {
    const on = await buildAnalysisReport(ctx, id, "docx", false);
    const off = await buildAnalysisReport(ctxOf(store, { entitlements: NO_INTERP }), id, "docx", false);
    assert.ok(on.ok && off.ok);
    if (!on.ok || !off.ok) return;
    const a = await docxText(on.bytes);
    const b = await docxText(off.bytes);
    const sample = providerTexts[0].slice(0, 40).replace(/&/g, "&").replace(/'/g, "'");
    assert.ok(a.includes("yalnız İngilizce"), "İngilizce notu yok");
    assert.ok(a.includes(sample.split(" ").slice(0, 4).join(" ")), "yetkili raporda anlatı yok");
    for (const ptxt of providerTexts) assert.ok(!b.includes(ptxt.slice(0, 40)), "yetkisiz raporda anlatı sızdı");
    const offPdf = await buildAnalysisReport(ctxOf(store, { entitlements: NO_INTERP }), id, "pdf", false);
    assert.ok(offPdf.ok);
    if (offPdf.ok) {
      const bp = await pdfText(offPdf.bytes);
      for (const ptxt of providerTexts) assert.ok(!bp.includes(ptxt.slice(0, 30)), "yetkisiz PDF'te anlatı sızdı");
    }
  });

  // ═══ E) Ayanamsa ═════════════════════════════════════════════════════════════
  await t("E1 Gochara yalnız Lahiri: Raman seçilirse istek birimi YOK + açık neden", () => {
    const o = TR.parseOptions({ ayanamsa: "raman", atUtc: "2026-10-07T09:00" }, new Date())!;
    assert.equal(TR.units(UCTX, o).length, 0);
    assert.ok(/Lahiri/.test(TR.noUnitsReason!(UCTX, o) ?? ""));
    assert.equal(tech.frame.ayanamsa, "lahiri");
    assert.equal(tech.zodiac, "sidereal");
  });

  console.log(`\nastrology transit02 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
