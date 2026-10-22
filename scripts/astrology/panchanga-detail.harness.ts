/**
 * ATLAS P2 AŞAMA 2 (2026-10-21) — Panchanga tamamlama harness'i:
 *   B.1 temel (/panchang/basic) yanıtındaki devata / element / sembol / karana türü ekran + kayıt + Word/PDF'te (0 istek).
 *   B.2 "Ayrıntılı Panchanga" seçeneği (/panchang/detailed): gün + konum; kutup dairesi ötesinde istek YOK (fail-closed).
 * Bağımsız doğrulama: astronomy-engine gün doğumu/batımı + Ay doğuşu/batışı (±2 dk); Rahu Kaal / Yamaganda / Gulika = gündüzün 1/8
 * dilimleri (klasik haftanın günü sırası); Abhijit = 15 gündüz muhurtasının 8.si; Vijaya 11.si; Brahma = gün doğumundan 96 → 48 dk önce.
 * Gerçek Roxy / gerçek DB YOK. Modüller ad alanıyla içe aktarılır (eski kodda testler çökmeden FAIL verir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/panchanga-detail.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import * as V from "@/lib/astrology/providers/roxy/vedic";
import * as RQ from "@/lib/astrology/providers/roxy/requests";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { describeOptions } from "@/app/admin/astroloji/_lib/techniques";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const Vx = V as J;
const RQx = RQ as J;
const DIR = join(__dirname, "fixtures", "golden");
const has = (n: string) => existsSync(join(DIR, `${n}.json`));
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const FP = load("vedic-panchang");
const PD = has("vedic-panchang-detailed") ? load("vedic-panchang-detailed") : null;
const DATE = "2026-11-01";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message.split("\n")[0].slice(0, 400)}`);
  }
}
const need = <T>(v: T | null | undefined, what: string): T => {
  assert.ok(v !== null && v !== undefined, `${what} yok`);
  return v as T;
};
const fn = (o: J, k: string) => {
  assert.equal(typeof o?.[k], "function", `${k} dışa aktarılmamış (eski kod)`);
  return o[k];
};
const proj = (raw: J, o: Partial<{ date: string; latitude: number; longitude: number; utcOffsetHours: number }> = {}) =>
  fn(Vx, "projectRoxyVedicPanchangaDetail")(raw, { date: o.date ?? DATE, latitude: o.latitude ?? 41.0082, longitude: o.longitude ?? 28.9784, utcOffsetHours: o.utcOffsetHours ?? 3, label: "İstanbul, Türkiye" });
const tamper = (raw: J, f: (r: J) => void) => {
  const r = structuredClone(raw);
  f(r);
  return r;
};
const ms = (s: string) => Date.parse(`${s}Z`);

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });
async function profile(ctx: EngineCtx): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as J)[k])}`).join(",")}}`;
function roxy() {
  const calls: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-pd", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push(endpoint);
      const g = [FP, PD].filter(Boolean).find((x: J) => x.endpoint === endpoint && canon(x.body) === canon(body));
      return g ? { ok: true, raw: structuredClone(g.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => {},
  };
  return { calls, deps };
}
async function pdfText(buf: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}
async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
const FONT_B64 = readFileSync(join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");

async function main() {
  // ── B.1 temel yanıt alanları ───────────────────────────────────────────────────────────────────────
  await t("B.1 temel projeksiyon: devata / element / sembol / yönetici zaten teknik katmanda (yeni istek / yeni projeksiyon sürümü gerekmez); vara temel yanıtta YOK", () => {
    const r = V.projectRoxyVedicPanchanga(FP.response) as J;
    assert.equal(r.ok, true);
    assert.equal(r.technical.tithi.deity, "Vasus");
    assert.equal(r.technical.tithi.element, "Akasha");
    assert.equal(r.technical.nakshatra.deity, "Pushan");
    assert.equal(r.technical.nakshatra.symbol, "Balık");
    assert.ok(!("vara" in FP.response), "temel yanıtta vara yok (ayrıntılı uçta var)");
    assert.equal(V.ROXY_VEDIC_PANCHANGA.projection, "vedic-panchanga-proj-1", "temel projeksiyon sürümü değişmedi (eski kayıtlar aynı)");
  });

  await t("B.1 rapor: Tithi devatası · Tithi elementi (Türkçe) · Nakshatra devatası · Nakshatra sembolü · karana türü raporda", () => {
    const tech = (V.projectRoxyVedicPanchanga(FP.response) as J).technical;
    const txt = reportTexts(buildAstroReport({ id: "x", title: "x", technique: "vedic.panchanga", analysisAt: "2026-10-21T00:00:00Z", technical: tech, params: { ayanamsa: "lahiri" } })).join("\n");
    for (const m of ["Tithi devatası", "Vasus", "Tithi elementi", "Akasha (eter)", "Nakshatra devatası", "Pushan", "Nakshatra sembolü", "Balık", "hareketli (chara)"]) assert.ok(txt.includes(m), `"${m}" yok`);
    assert.ok(!txt.includes("Ayrıntılı Panchanga"), "seçenek yokken ayrıntı bölümü üretildi");
  });

  // ── B.2 ayrıntılı panchanga ────────────────────────────────────────────────────────────────────────
  await t("golden: ayrıntılı fixture = ürün gövdesi (gün + konum + ofset; ayanamsa yok); anahtar/kişi izi yok", () => {
    const g = need(PD, "ayrıntılı golden");
    assert.equal(g.endpoint, "/vedic-astrology/panchang/detailed");
    assert.deepEqual(g.body, fn(RQx, "vedicPanchangDetailedBody")(DATE, { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude }, 3));
    assert.ok(!("ayanamsa" in g.body) && !("time" in g.body));
    assert.ok(!/apiKey|x-api-key|Ali Örnek/i.test(JSON.stringify(g)));
  });

  await t("projeksiyon: vara Pazar/Güneş, gün doğumu 07:35 / batımı 18:00, pencereler; gezegen saati (hora) projekte EDİLMEZ (eşlenmemiş alan olarak raporlanır)", () => {
    const r = proj(need(PD, "golden").response);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const d = r.technical;
    assert.deepEqual(d.vara, { id: "sunday", lord: "sun" });
    assert.equal(d.sunrise, "2026-11-01T07:35:00");
    assert.equal(d.sunset, "2026-11-01T18:00:00");
    assert.deepEqual(d.rahuKaal, { start: "2026-11-01T16:42:00", end: "2026-11-01T18:00:00" });
    assert.equal(d.moonRashi, "cancer");
    assert.equal(d.sunRashi, "libra");
    assert.deepEqual(d.atSunrise, { tithi: 22, paksha: "krishna", nakshatra: 8, nakshatraPada: 1, nityaYoga: 22, karana: 1 });
    assert.ok(r.unmappedFields.includes("hora"), "hora bilinçli olarak dışarıda");
    assert.ok(!JSON.stringify(d).includes("hora"));
  });

  await t("BAĞIMSIZ astronomi (astronomy-engine): gün doğumu/batımı ve Ay doğuşu/batışı ±2 dk", () => {
    const d = proj(need(PD, "golden").response).technical;
    const ob = new Astronomy.Observer(41.0082, 28.9784, 0);
    const start = new Date(Date.UTC(2026, 9, 31, 21, 0));
    const at = (b: Astronomy.Body, dir: 1 | -1) => Astronomy.SearchRiseSet(b, ob, dir, start, 1.5)!.date.getTime() + 3 * 3600e3;
    const chk = (prov: string, ref: number, n: string) => assert.ok(Math.abs(ms(prov) - ref) <= 120_000, `${n}: sağlayıcı ${prov}, bağımsız ${new Date(ref).toISOString()}`);
    chk(d.sunrise, at(Astronomy.Body.Sun, 1), "gün doğumu");
    chk(d.sunset, at(Astronomy.Body.Sun, -1), "gün batımı");
    chk(d.moonrise, at(Astronomy.Body.Moon, 1), "Ay doğuşu");
    chk(d.moonset, at(Astronomy.Body.Moon, -1), "Ay batışı");
  });

  await t("BAĞIMSIZ klasik aritmetik: Rahu Kaal (Pazar 8.) · Yamaganda (5.) · Gulika (7.) = gündüz/8; Abhijit 8./15; Vijaya 11./15; Brahma −96→−48 dk (±2 dk)", () => {
    const d = proj(need(PD, "golden").response).technical;
    const t0 = ms(d.sunrise);
    const day = ms(d.sunset) - t0;
    const near = (w: J, a: number, b: number, n: string) => assert.ok(Math.abs(ms(w.start) - a) <= 120_000 && Math.abs(ms(w.end) - b) <= 120_000, `${n}: ${w.start}–${w.end}`);
    near(d.rahuKaal, t0 + (7 * day) / 8, t0 + day, "Rahu Kaal");
    near(d.yamaganda, t0 + (4 * day) / 8, t0 + (5 * day) / 8, "Yamaganda");
    near(d.gulika, t0 + (6 * day) / 8, t0 + (7 * day) / 8, "Gulika");
    near(d.abhijit, t0 + (7 * day) / 15, t0 + (8 * day) / 15, "Abhijit");
    near(d.vijaya, t0 + (10 * day) / 15, t0 + (11 * day) / 15, "Vijaya");
    near(d.brahma, t0 - 96 * 60_000, t0 - 48 * 60_000, "Brahma");
    // Haftanın 7 günü sıra tablosu klasik (Pazar → Cumartesi): Rahu 8,2,7,5,6,4,3 · Yamaganda 5,4,3,2,1,7,6 · Gulika 7,6,5,4,3,2,1
    assert.deepEqual([...(Vx.RAHU_KAAL_PART ?? [])], [8, 2, 7, 5, 6, 4, 3]);
    assert.deepEqual([...(Vx.YAMAGANDA_PART ?? [])], [5, 4, 3, 2, 1, 7, 6]);
    assert.deepEqual([...(Vx.GULIKA_PART ?? [])], [7, 6, 5, 4, 3, 2, 1]);
  });

  await t("fail-closed: gün doğumu yok (kutup) · vara çelişkisi · Rahu Kaal 10 dk kayması · istenmeyen gün · istenmeyen konum/ofset · Brahma kuralı dışı → RED", () => {
    const g = need(PD, "golden").response;
    const polar = proj(tamper(g, (r) => ((r.sunrise = null), (r.sunset = null))));
    assert.equal(polar.ok, false);
    assert.match(polar.errors[0], /kutup/);
    assert.equal(proj(tamper(g, (r) => (r.vara.name = "Monday"))).ok, false, "vara");
    assert.equal(proj(tamper(g, (r) => (r.vara.lord = "Moon"))).ok, false, "vara lord");
    assert.equal(proj(tamper(g, (r) => (r.rahuKaal.start = "2026-11-01T16:52:00"))).ok, false, "rahu kaal");
    assert.equal(proj(g, { date: "2026-11-02" }).ok, false, "gün");
    assert.equal(proj(g, { utcOffsetHours: 2 }).ok, false, "ofset");
    assert.equal(proj(g, { latitude: 39.9 }).ok, false, "konum");
    assert.equal(proj(tamper(g, (r) => (r.brahmaMuhurta.start = "2026-11-01T05:40:00"))).ok, false, "brahma");
  });

  // ── Teknik / servis ────────────────────────────────────────────────────────────────────────────────
  await t("teknik: seçenek yokken normalize seçenek {ayanamsa} ve TEK birim (gövde = temel golden; önbellek anahtarı aynı); seçenekle 2 birim; Lahiri dışı → birim yok", () => {
    const def = getTechnique("vedic.panchanga")!;
    const now = new Date();
    assert.deepEqual(def.parseOptions({ ayanamsa: "lahiri" }, now), { ayanamsa: "lahiri" });
    const ctx = { birth: SYNTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null };
    const u = def.units(ctx, { ayanamsa: "lahiri" });
    assert.equal(u.length, 1);
    assert.deepEqual(u[0].body, FP.body);
    assert.equal(u[0].endpoint, FP.endpoint);
    const o = def.parseOptions({ ayanamsa: "lahiri", detail: true, detailDate: DATE }, now)!;
    assert.deepEqual(o, { ayanamsa: "lahiri", detail: true, detailDate: DATE, placeLocationId: null });
    const u2 = def.units(ctx, { ...o, detailOffsetHours: 3 });
    assert.equal(u2.length, 2);
    assert.deepEqual(u2[1].body, need(PD, "golden").body);
    assert.equal(u2[1].timeDependent, true);
    assert.equal(def.units(ctx, { ayanamsa: "raman", detail: true, detailDate: DATE, detailOffsetHours: 3 }).length, 0);
    assert.equal(def.parseOptions({ ayanamsa: "lahiri", detail: true, detailDate: "2026-02-30" }, now), null);
    assert.equal(def.parseOptions({ ayanamsa: "lahiri", detail: "evet" }, now), null);
    assert.equal(def.noteContext!(o), "ayanamsa:lahiri");
  });

  await t("servis: kutup dairesi ötesi yer (Tromsø) → PANCHANGA_POLAR engeli, ücretli istek 0; doğum yeri İstanbul → 2 birim (biri önbellekte değil)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const plan = (await planAstrology(ctx, { profileId: pid, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detail: true, detailDate: DATE, placeLocationId: "gn-3133895" } }] })).body as J;
    assert.equal(plan.plan.selections[0].blocked?.code, "PANCHANGA_POLAR", JSON.stringify(plan.plan.selections[0]));
    assert.equal(plan.plan.newRequestCount, 0);
    const ok = (await planAstrology(ctx, { profileId: pid, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detail: true, detailDate: DATE } }] })).body as J;
    assert.equal(ok.plan.selections[0].blocked ?? null, null);
    assert.equal(ok.plan.newRequestCount, 2);
  });

  await t("uçtan uca: çalıştır → kaydet → aç (0 istek) → rapor Word + PDF: Ayrıntılı Panchanga bölümü (vara, gün doğumu/batımı, Rahu Kaal, Abhijit, Brahma); seçenek özeti", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy();
    const sel = { technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detail: true, detailDate: DATE, placeLocationId: null } };
    const r = await runAstrology(ctx, { profileId: pid, selections: [sel] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const it = (r.body as J).results[0];
    assert.equal(it.ok, true, JSON.stringify(it).slice(0, 300));
    assert.equal(it.view.technical.detail.vara.id, "sunday");
    assert.equal(it.view.options.detailOffsetHours, 3);
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...sel, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "açmak istek yaptı");
    assert.equal(a.technical.detail.sunrise, "2026-11-01T07:35:00");
    const rep = buildAstroReport(a as ReportAnalysisInput);
    const txt = reportTexts(rep).join("\n");
    for (const m of ["Ayrıntılı Panchanga (seçilen gün)", "Pazar (Ravivara)", "Rahu Kaal", "Abhijit muhurta", "Brahma muhurta", "07:35", "16:42", "Tithi devatası"]) assert.ok(txt.includes(m), `rapor: "${m}" yok`);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(txt));
    const docx = await docxText(await renderAstroReportDocx(rep, null, symbolFontBuffers()));
    const pdf = await pdfText(Buffer.from(buildAstroReportPdf(rep, null, FONT_B64, symbolFontsBase64())));
    for (const m of ["Ayrıntılı Panchanga", "Rahu Kaal", "Tithi devatası"]) {
      assert.ok(docx.includes(m), `Word: "${m}" yok`);
      assert.ok(pdf.includes(m), `PDF: "${m}" yok`);
    }
    assert.match(describeOptions("vedic.panchanga", a.params ?? sel.options), /ayrıntılı: 01\.11\.2026/);
    // Yorum yetkisi yokken: ayrıntılı bölüm (teknik) görünür; karakteristik metinleri (yorum) yok.
    const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis;
    assert.ok(!JSON.stringify(hidden).includes("Revati bireyleri"), "yetkisizde yorum metni");
    assert.ok(hidden.technical.detail, "teknik ayrıntı yetkisizde de görünür");
  });

  await t("statik: yeni kullanıcı metinlerinde sağlayıcı adı / 'golden' / 'fixture' yok", () => {
    for (const f of ["app/admin/astroloji/_components/VedicExtraPanels.tsx", "app/admin/astroloji/_components/TechniqueSelector.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(/"([^"\n]*(?:Panchanga|Rahu Kaal|muhurta)[^"\n]*)"/g)) assert.ok(!/roxy|golden|fixture/i.test(m[1]), `${f}: ${m[1]}`);
    }
  });

  console.log(`\npanchanga-detail: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
