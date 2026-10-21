/**
 * ATLAS P2 AŞAMA 2 (2026-10-21) — Vimshottari / KP dasha derinliği harness'i: Sookshma (4.) · Prana (5.) düzeyleri, "Güncel dönem
 * zinciri" (/dasha/current; Vedik + KP significator), kayıt (tek düzey + zincir) ve rapor (Word / PDF) — eksik `nominalStart` dahil.
 *
 * Gerçek Roxy / gerçek DB YOK: golden fixture'lar (sentetik kişi A, 4 gerçek yanıt) + sahte sağlayıcı. Bağımsız doğrulama: Vimshottari
 * aritmetiği (alt dönem = üst dönemin GERÇEK uzunluğu × yönetici yılı / 120; yıl = 365,25 gün — 360 günlük yıl reddedilir) ve
 * scripts/astrology/syntheticDasha.ts modeli (golden'ları birebir üretmek zorunda).
 *
 * Modüller AD ALANI ile içe aktarılır: yeni dışa aktarımlar yoksa (eski kod) testler çökmeden FAIL verir → "önce-başarısız" kanıtı
 * aynı dosyayla alınır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/dasha-depth.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import * as SD from "./syntheticDasha";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import * as V from "@/lib/astrology/providers/roxy/vedic";
import * as RQ from "@/lib/astrology/providers/roxy/requests";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { describeOptions } from "@/app/admin/astroloji/_lib/techniques";
import * as UIL from "@/app/admin/astroloji/_lib/techniques";
import * as VP from "@/app/admin/astroloji/_components/VedicPanels";
import { topicsFromVedicDasha } from "@/lib/astrology/topics/vedic";
import { NAKSHATRA_LORDS, VIMSHOTTARI_YEARS, type VedicGrahaId } from "@/lib/astrology/model/vedic";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const Vx = V as J;
const RQx = RQ as J;
const SDx = SD as J;

const DIR = join(__dirname, "fixtures", "golden");
const has = (n: string) => existsSync(join(DIR, `${n}.json`));
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const DM = load("vedic-dasha-major");
const KDM = load("kp-dasha-major");
const DSA = load("vedic-dasha-sub-md-ad");
const SOOK = has("vedic-dasha-sub-md-ad-pd") ? load("vedic-dasha-sub-md-ad-pd") : null;
const PRANA = has("vedic-dasha-sub-md-ad-pd-sd") ? load("vedic-dasha-sub-md-ad-pd-sd") : null;
const KCUR = has("kp-dasha-current") ? load("kp-dasha-current") : null;
const VCUR = has("vedic-dasha-current") ? load("vedic-dasha-current") : null;
const AT_UTC = "2026-11-01T09:00";
const AT_LOCAL = "2026-11-01T12:00:00";
const BIRTH_LOCAL = "1990-07-15T14:30:00";

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

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL });
async function profile(ctx: EngineCtx): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as J)[k])}`).join(",")}}`;
/** Sahte sağlayıcı: gövde + uç golden'la BİREBİR eşleşirse golden; değilse doğrulanmış sentetik model (yalnız golden kişisi). */
function roxy() {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const all = [DM, KDM, DSA, SOOK, PRANA, KCUR, VCUR].filter(Boolean);
  const deps: EngineDeps = {
    config: { apiKey: "k-test-dd", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const g = all.find((x: J) => x.endpoint === endpoint && canon(x.body) === canon(body));
      if (g) return { ok: true, raw: structuredClone(g.response), attempts: 1 };
      const kp = body.significators === true;
      const major = kp ? KDM.response : DM.response;
      const m = /^\/vedic-astrology\/dasha\/sub\/(.+)$/.exec(endpoint);
      if (m) {
        const segs = m[1].split("/");
        const r = segs.length <= 2 ? SD.syntheticSubResponse(major, segs[0], segs[1] ?? null) : SDx.syntheticDeepResponse?.(major, segs);
        if (r) return { ok: true, raw: r, attempts: 1 };
      }
      if (endpoint === "/vedic-astrology/dasha/current" && SDx.syntheticCurrentResponse) return { ok: true, raw: SDx.syntheticCurrentResponse(major, String(body.datetime)), attempts: 1 };
      return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => {},
  };
  return { calls, deps };
}
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: false });
const ms = (s: string) => Date.parse(`${s}Z`);
const YEAR = 365.25 * 864e5;
const tamper = (raw: J, f: (r: J) => void) => {
  const r = structuredClone(raw);
  f(r);
  return r;
};
const deepProj = (raw: J, path: VedicGrahaId[], kp = false) =>
  fn(Vx, "projectRoxyVedicDasha")(raw, { ayanamsa: kp ? "kp-newcomb" : "lahiri", mahadasha: path[0], antardasha: path[1], pratyantardasha: path[2] ?? null, sookshma: path[3] ?? null, birthLocal: BIRTH_LOCAL, utcOffsetHours: 3, kp });
const curProj = (raw: J, o: Partial<{ ayanamsa: string; atLocal: string; kp: boolean }> = {}) =>
  fn(Vx, "projectRoxyVedicDashaCurrent")(raw, { ayanamsa: o.ayanamsa ?? "kp-newcomb", birthLocal: BIRTH_LOCAL, atUtc: AT_UTC, atLocal: o.atLocal ?? AT_LOCAL, utcOffsetHours: 3, kp: o.kp ?? true });

async function pdfText(buf: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return text as string;
}
async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
const FONT_B64 = readFileSync(join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");

async function main() {
  // ── Golden: ürün gövdesi / uç = fixture ────────────────────────────────────────────────────────────
  await t("golden: 4 yeni fixture mevcut; uç/gövde ürünün kendi üreticileriyle birebir; anahtar/kişi izi yok", () => {
    const lahiri = RQ.vedicBirthBody(SYNTH_A, "lahiri");
    const S = need(SOOK, "Sookshma golden");
    const P = need(PRANA, "Prana golden");
    const C = need(KCUR, "KP current golden");
    assert.equal(S.endpoint, (V.dashaEndpoint as J)("moon", "rahu", "ketu"));
    assert.equal(P.endpoint, (V.dashaEndpoint as J)("moon", "rahu", "ketu", "moon"));
    assert.deepEqual(S.body, lahiri);
    assert.deepEqual(P.body, lahiri);
    assert.deepEqual(C.body, fn(RQx, "vedicDashaCurrentBody")(SYNTH_A, "kp-newcomb", AT_UTC, { nodeType: "mean" }));
    assert.equal(C.body.datetime, AT_LOCAL, "datetime doğum ofsetinde yerel olmalı (belge: istek timezone'unda yorumlanır)");
    for (const f of [S, P, C]) assert.ok(!/apiKey|x-api-key|Ali Örnek|Ayşe/i.test(JSON.stringify(f)), "anahtar/kişi izi");
  });

  await t("dashaEndpoint: ilk üç düzeyin yolları DEĞİŞMEDİ (önbellek anahtarı korunur); 4.–5. düzey yalnız beyaz liste adlarıyla", () => {
    assert.equal(V.dashaEndpoint(null, null), "/vedic-astrology/dasha/major");
    assert.equal(V.dashaEndpoint("moon", null), "/vedic-astrology/dasha/sub/Moon");
    assert.equal(V.dashaEndpoint("moon", "rahu"), "/vedic-astrology/dasha/sub/Moon/Rahu");
    assert.equal(DSA.endpoint, V.dashaEndpoint("moon", "rahu"));
    assert.equal((V.dashaEndpoint as J)("moon", "rahu", "ketu", "moon"), "/vedic-astrology/dasha/sub/Moon/Rahu/Ketu/Moon");
    assert.equal((V.dashaEndpoint as J)("moon", "rahu", null, "moon"), "/vedic-astrology/dasha/sub/Moon/Rahu", "pd yokken sd yok sayılır (zincir parseOptions'ta reddedilir)");
  });

  // ── Sookshma / Prana projeksiyonu + bağımsız aritmetik ─────────────────────────────────────────────
  await t("Sookshma golden: düzey sookshma, 9 dönem Ketu'dan döngü, üst dönem Ketu PD, eşlenmemiş alan 0, ilk/son sınır üst dönemle aynı", () => {
    const r = deepProj(need(SOOK, "Sookshma golden").response, ["moon", "rahu", "ketu"]);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const x = r.technical;
    assert.equal(x.level, "sookshma");
    assert.deepEqual(x.path, { mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu" });
    assert.deepEqual(x.periods.map((p: J) => p.lord), ["ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury"]);
    assert.equal(x.parent.lord, "ketu");
    assert.equal(x.periods[0].start, x.parent.start);
    assert.equal(x.periods[8].end, x.parent.end);
    assert.deepEqual(r.unmappedFields, []);
    assert.ok(r.interpretation.periods.length === 9 && r.interpretation.parent, "sağlayıcı anlatısı yorum katmanında");
  });

  await t("Prana golden: düzey prana, Moon SD içinde 9 prana, yol 4 düzey; seçilen an (12:00) Venus pranasında", () => {
    const r = deepProj(need(PRANA, "Prana golden").response, ["moon", "rahu", "ketu", "moon"]);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const x = r.technical;
    assert.equal(x.level, "prana");
    assert.equal(x.path.sookshma, "moon");
    assert.deepEqual(x.periods.map((p: J) => p.lord), ["moon", "mars", "rahu", "jupiter", "saturn", "mercury", "ketu", "venus", "sun"]);
    const cur = x.periods.find((p: J) => p.start <= AT_LOCAL && AT_LOCAL < p.end);
    assert.equal(cur.lord, "venus");
    assert.deepEqual(r.unmappedFields, []);
  });

  await t("BAĞIMSIZ Vimshottari aritmetiği (Sookshma + Prana): sınır = başlangıç + gerçek uzunluk × kümülatif yıl/120 (±1 dk); süre = gün/365,25; 360 günlük yıl REDDEDİLİR; toplam = üst dönem", () => {
    for (const [fx, key, pkey, own] of [
      [need(SOOK, "S"), "sookshmaDashas", "pratyantardashaPeriod", "ketu"],
      [need(PRANA, "P"), "pranaDashas", "sookshmaPeriod", "moon"],
    ] as const) {
      const par = fx.response[pkey];
      const t0 = ms(par.startDate);
      const len = ms(par.endDate) - t0;
      const i0 = NAKSHATRA_LORDS.indexOf(own as VedicGrahaId);
      let acc = 0;
      let sum = 0;
      let err365 = 0;
      let err360 = 0;
      fx.response[key].forEach((p: J, i: number) => {
        const lord = NAKSHATRA_LORDS[(i0 + i) % 9];
        assert.equal(p.planet.toLowerCase(), lord, `${key}[${i}] sıra`);
        acc += VIMSHOTTARI_YEARS[lord];
        assert.ok(Math.abs(ms(p.endDate) - (t0 + (len * acc) / 120)) <= 60_000, `${key}[${i}] bitiş oransal değil`);
        const days = (len * VIMSHOTTARI_YEARS[lord]) / 120 / 864e5;
        err365 = Math.max(err365, Math.abs(p.durationYears - days / 365.25));
        err360 = Math.max(err360, Math.abs(p.durationYears - days / 360));
        sum += p.durationYears;
      });
      assert.ok(err365 < 2e-6, `${key}: 365,25 gün yıl kuralı tutmuyor (${err365})`);
      assert.ok(err360 > 1e-5, `${key}: 360 gün yıl ile ayırt edilemiyor`);
      assert.ok(Math.abs(sum - par.durationYears) < 4e-6, `${key}: toplam süre üst dönem değil`);
      assert.ok(Math.abs(par.durationYears - len / YEAR) < 4e-6, `${key}: üst dönem süresi gün/365,25 değil`);
    }
    // Mahadasha sınırları takvim yıldönümüdür (Ketu 1991-07-06 → 1998-07-06 = 2557 gün; 7×365,25 = 2556,75) — süre alanı kanonik 7.
    const md = DM.response.mahadashas[1];
    assert.equal((ms(md.endDate) - ms(md.startDate)) / 864e5, 2557);
    assert.equal(md.durationYears, 7);
  });

  await t("sentetik model (syntheticDasha) Sookshma + Prana golden'larını BİREBİR üretir (tarihler aynı, süre ≤1e-6 y)", () => {
    for (const [fx, path, key] of [
      [need(SOOK, "S"), ["Moon", "Rahu", "Ketu"], "sookshmaDashas"],
      [need(PRANA, "P"), ["Moon", "Rahu", "Ketu", "Moon"], "pranaDashas"],
    ] as const) {
      const s = fn(SDx, "syntheticDeepResponse")(DM.response, path);
      assert.deepEqual(s[key].map((p: J) => [p.planet, p.startDate, p.endDate]), fx.response[key].map((p: J) => [p.planet, p.startDate, p.endDate]));
      s[key].forEach((p: J, i: number) => assert.ok(Math.abs(p.durationYears - fx.response[key][i].durationYears) < 1e-6));
      // Model yanıtı ürün projeksiyonundan da geçer (sahte arka uç için).
      assert.equal(deepProj(s, path.map((x) => x.toLowerCase()) as VedicGrahaId[]).ok, true);
    }
  });

  await t("fail-closed (Sookshma/Prana): sınır 2 dk kayması · sıra bozulması · üst yönetici çelişkisi · eksik dönem · istenmeyen yol · nominalStart beklenmedik → RED", () => {
    const S = need(SOOK, "S").response;
    const P = need(PRANA, "P").response;
    const path: VedicGrahaId[] = ["moon", "rahu", "ketu"];
    const bad: [string, J, VedicGrahaId[]][] = [
      ["sınır kayması", tamper(S, (r) => { r.sookshmaDashas[3].endDate = "2026-11-01T23:21:00"; r.sookshmaDashas[4].startDate = "2026-11-01T23:21:00"; }), path],
      ["sıra", tamper(S, (r) => { const a = r.sookshmaDashas[1]; r.sookshmaDashas[1] = r.sookshmaDashas[2]; r.sookshmaDashas[2] = a; }), path],
      ["üst yönetici", tamper(S, (r) => { r.sookshmaDashas[0].antardashaLord = "Venus"; }), path],
      ["eksik dönem", tamper(S, (r) => { r.sookshmaDashas.pop(); }), path],
      ["istenmeyen yol", S, ["moon", "rahu", "venus"]],
      ["nominalStart", tamper(S, (r) => { r.sookshmaDashas[4].nominalStartDate = "2026-10-01T00:00:00"; }), path],
      ["prana süre", tamper(P, (r) => { r.pranaDashas[2].durationYears *= 1.2; }), ["moon", "rahu", "ketu", "moon"]],
      ["prana ayanamsa", tamper(P, (r) => { r.ayanamsaType = "raman"; }), ["moon", "rahu", "ketu", "moon"]],
    ];
    for (const [n, raw, p] of bad) assert.equal(deepProj(raw, p).ok, false, `${n} kabul edildi`);
  });

  // ── Güncel dönem zinciri ───────────────────────────────────────────────────────────────────────────
  await t("KP güncel zincir golden: 5 halka Moon/Rahu/Venus/Moon/Saturn, iç içe, an her halkada; kalan gün; ortak evler = significator kesişimi; KP çerçevesi", () => {
    const r = curProj(need(KCUR, "KP current").response);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const c = r.technical;
    assert.deepEqual(c.chain.map((x: J) => [x.level, x.lord]), [["mahadasha", "moon"], ["antardasha", "rahu"], ["pratyantardasha", "venus"], ["sookshma", "moon"], ["prana", "saturn"]]);
    assert.deepEqual(c.chain.map((x: J) => x.remainingDays), [2760, 173, 68, 4, 1]);
    assert.deepEqual(c.commonHouses, { allLevels: [], dashaBhuktiAntara: [6] });
    assert.equal(c.frame.ayanamsa, "kp-newcomb");
    assert.deepEqual(c.at, { utc: AT_UTC, local: AT_LOCAL, utcOffsetHours: 3 });
    assert.ok(c.chain.every((x: J) => x.kp && x.kp.house >= 1), "KP significator katmanı");
    assert.deepEqual(r.unmappedFields, []);
  });

  await t("KP güncel zincir: sentetik model zincir tarihlerini golden'la BİREBİR üretir (bağımsız: kp-dasha-major + Vimshottari oranı)", () => {
    const ch = fn(SDx, "syntheticCurrentChain")(KDM.response, AT_LOCAL);
    const g = need(KCUR, "KP current").response;
    assert.deepEqual(
      ch.map((p: J) => [p.planet, p.startDate, p.endDate]),
      ["mahadasha", "antardasha", "pratyantardasha", "sookshmaDasha", "pranaDasha"].map((k) => [g[k].planet, g[k].startDate, g[k].endDate]),
    );
    // Lahiri zinciri (aynı an) Sookshma/Prana golden'larıyla tutarlı: SD Moon, PR Venus.
    const lc = SDx.syntheticCurrentChain(DM.response, AT_LOCAL);
    assert.deepEqual(lc.map((p: J) => p.planet), ["Moon", "Rahu", "Ketu", "Moon", "Venus"]);
    assert.equal(lc[3].startDate, PRANA!.response.sookshmaPeriod.startDate);
    assert.equal(lc[4].endDate, PRANA!.response.pranaDashas[7].endDate);
  });

  await t("güncel zincir fail-closed: an dışarıda · ortak ev yanlış · halka üst dönem dışında · ayanamsa karışması (KP yanıtı Vedik/Lahiri olarak) → RED", () => {
    const g = need(KCUR, "KP current").response;
    assert.equal(curProj(g, { atLocal: "2026-11-05T12:00:00" }).ok, false, "an dışarıda");
    assert.equal(curProj(tamper(g, (r) => (r.commonHouses.dashaBhuktiAntara = [6, 9]))).ok, false, "ortak ev");
    assert.equal(curProj(tamper(g, (r) => (r.pranaDasha.endDate = "2026-11-05T16:42:00"))).ok, false, "üst dönem dışında");
    assert.equal(curProj(g, { ayanamsa: "lahiri" }).ok, false, "KP yanıtı Lahiri diye kabul edildi");
    assert.equal(curProj(tamper(g, (r) => (r.antardasha.mahadashaLord = "Sun"))).ok, false, "üst yönetici");
    // Vedik (significator'sız) projeksiyonda KP alanları bilinmeyen alandır: KP katmanı taşınmaz, eşlenmemiş alan olarak raporlanır.
    const v = curProj(g, { kp: false });
    assert.ok(v.ok && v.technical.chain.every((x: J) => !x.kp) && !("commonHouses" in v.technical), "Vedik projeksiyona KP katmanı sızdı");
    assert.ok(v.unmappedFields.some((f: string) => f.includes("significators")), "significators eşlenmemiş alan olarak raporlanmadı");
  });

  await t("Vedik güncel zincir (Lahiri) golden: Moon/Rahu/Ketu/Moon/Venus; Sookshma + Prana golden'larıyla AYNI dönemler (datetime = doğum ofsetinde yerel kuralı doğrulandı); KP alanı yok; kalan gün ⌈⌉", () => {
    const g = need(VCUR, "Vedik current golden");
    assert.deepEqual(g.body, fn(RQx, "vedicDashaCurrentBody")(SYNTH_A, "lahiri", AT_UTC, null));
    const r = curProj(g.response, { ayanamsa: "lahiri", kp: false });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const c = r.technical.chain;
    assert.deepEqual(c.map((x: J) => x.lord), ["moon", "rahu", "ketu", "moon", "venus"]);
    assert.ok(c.every((x: J) => !x.kp));
    assert.ok(!("commonHouses" in r.technical));
    assert.deepEqual([c[3].start, c[3].end], [PRANA!.response.sookshmaPeriod.startDate, PRANA!.response.sookshmaPeriod.endDate]);
    assert.deepEqual([c[4].start, c[4].end], [PRANA!.response.pranaDashas[7].startDate, PRANA!.response.pranaDashas[7].endDate]);
    assert.deepEqual([c[2].start, c[2].end], [SOOK!.response.pratyantardashaPeriod.startDate, SOOK!.response.pratyantardashaPeriod.endDate]);
    assert.deepEqual(c.map((x: J) => x.remainingDays), [2805, 218, 21, 1, 1]);
    assert.deepEqual(r.unmappedFields, []);
    // Model yanıtı (sahte arka uç) da birebir aynı tarihleri ve kalan günleri üretir.
    const m = fn(SDx, "syntheticCurrentResponse")(DM.response, AT_LOCAL);
    for (const k of ["mahadasha", "antardasha", "pratyantardasha", "sookshmaDasha", "pranaDasha"]) assert.deepEqual([m[k].startDate, m[k].endDate], [g.response[k].startDate, g.response[k].endDate], k);
    for (const k of ["remainingInMahadasha", "remainingInPrana"]) assert.equal(m[k].totalDays, g.response[k].totalDays, k);
  });

  // ── Teknik seçenekleri / birimler ─────────────────────────────────────────────────────────────────
  await t("seçenekler: eski seçimlerin normalize seçenekleri ve not bağlamı BİREBİR aynı (yeni anahtar yok); eksik zincir reddedilir; chainNow = gerçek UTC dakika", () => {
    const vd = getTechnique("vedic.dasha")!;
    const kd = getTechnique("kp.dasha")!;
    const now = new Date("2026-10-21T10:37:45Z");
    assert.deepEqual(vd.parseOptions({ ayanamsa: "lahiri", mahadasha: "moon", antardasha: null }, now), { ayanamsa: "lahiri", mahadasha: "moon", antardasha: null });
    assert.deepEqual(kd.parseOptions({ ayanamsa: "kp-newcomb", nodeType: "mean" }, now), { ayanamsa: "kp-newcomb", nodeType: "mean", mahadasha: null, antardasha: null });
    assert.equal(vd.noteContext!({ ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu" }), "ayanamsa:lahiri|mahadasha:moon|antardasha:rahu");
    assert.deepEqual(vd.parseOptions({ ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu", sookshma: "moon" }, now), { ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu", sookshma: "moon" });
    assert.equal(vd.parseOptions({ ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu", sookshma: "moon" }, now), null, "pd'siz sd");
    assert.equal(vd.parseOptions({ ayanamsa: "lahiri", mahadasha: "moon", antardasha: null, pratyantardasha: "ketu" }, now), null, "ad'siz pd");
    assert.deepEqual(vd.parseOptions({ ayanamsa: "lahiri", chainNow: true }, now), { ayanamsa: "lahiri", mahadasha: null, antardasha: null, chainAtUtc: "2026-10-21T10:37" });
    assert.equal(vd.parseOptions({ ayanamsa: "lahiri", chainAtUtc: "2026-13-01T00:00" }, now), null);
    assert.equal(vd.noteContext!({ ayanamsa: "lahiri", mahadasha: null, antardasha: null, chainAtUtc: AT_UTC }), "ayanamsa:lahiri", "zincir anı not bağlamına girmez");
  });

  await t("birimler: zincir yoksa TEK birim (eski gövde/uç); zincir varsa ikinci birim /dasha/current (zamana bağlı, parça 1); Vedik zincir significator'sız Vedik ayanamsa, KP zincir KP ayanamsa + significators", () => {
    const vd = getTechnique("vedic.dasha")!;
    const kd = getTechnique("kp.dasha")!;
    const ctx = { birth: SYNTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null };
    const u0 = vd.units(ctx, { ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu" });
    assert.equal(u0.length, 1);
    assert.equal(u0[0].endpoint, DSA.endpoint);
    assert.deepEqual(u0[0].body, DSA.body);
    const u1 = vd.units(ctx, { ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu", sookshma: "moon", chainAtUtc: AT_UTC });
    assert.equal(u1.length, 2);
    assert.equal(u1[0].endpoint, PRANA?.endpoint ?? "?");
    assert.equal(u1[1].endpoint, "/vedic-astrology/dasha/current");
    assert.equal(u1[1].timeDependent, true);
    assert.equal(u1[1].part, 1);
    assert.equal(u1[1].body.ayanamsa, "lahiri");
    assert.ok(!("significators" in u1[1].body));
    assert.equal(u1[0].inputHash === u0[0].inputHash, false);
    const k1 = kd.units(ctx, { ayanamsa: "kp-newcomb", nodeType: "mean", mahadasha: null, antardasha: null, chainAtUtc: AT_UTC });
    assert.deepEqual(k1[1].body, KCUR?.body ?? "?");
    assert.equal(k1[0].endpoint, "/vedic-astrology/dasha/major");
    assert.equal(kd.primaryPart, 0);
  });

  // ── Uçtan uca: çalıştır → kaydet → aç → rapor (Word / PDF) ─────────────────────────────────────────
  const store = seed();
  const ctx = ctxOf(store);
  const pid = await profile(ctx);
  const rx = roxy();
  const saved: Record<string, string> = {};
  const SEL = {
    vedicPrana: { technique: "vedic.dasha", options: { ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu", sookshma: "moon", chainAtUtc: AT_UTC } },
    vedicMajorChain: { technique: "vedic.dasha", options: { ayanamsa: "lahiri", mahadasha: null, antardasha: null, chainAtUtc: AT_UTC } },
    kpMajorChain: { technique: "kp.dasha", options: { ayanamsa: "kp-newcomb", nodeType: "mean", mahadasha: null, antardasha: null, chainAtUtc: AT_UTC } },
    vedicMajor: { technique: "vedic.dasha", options: { ayanamsa: "lahiri", mahadasha: null, antardasha: null } },
  };

  await t("çalıştır: Prana + zincir (Vedik) ve KP major + zincir → görünümde düzey listesi + current; ikinci çalıştırma 0 sağlayıcı isteği", async () => {
    for (const [k, s] of Object.entries(SEL)) {
      const r = await run(ctx, pid, [s], rx.deps);
      assert.equal(r.status, 200, `${k}: ${JSON.stringify(r.body).slice(0, 300)}`);
      const it = (r.body as J).results[0];
      assert.equal(it.ok, true, `${k}: ${JSON.stringify(it).slice(0, 300)}`);
      if (k !== "vedicMajor") assert.equal(it.view.technical.current?.chain?.length, 5, `${k}: zincir yok`);
      else assert.equal(it.view.technical.current, undefined);
    }
    const n = rx.calls.length;
    await run(ctx, pid, Object.values(SEL), rx.deps);
    assert.equal(rx.calls.length, n, "önbellek: yeni istek yapıldı");
  });

  await t("kaydet → aç: kayıt TEK DÜZEY (periods = yalnız seçili düzey) + o anki 5 halka; açmak 0 istek; seçenek özetinde düzey + zincir anı", async () => {
    for (const [k, s] of Object.entries(SEL)) {
      const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...s, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, `${k}: ${JSON.stringify(sv.body).slice(0, 300)}`);
      saved[k] = (sv.body as J).analysisId;
    }
    const n = rx.calls.length;
    const a = ((await getAnalysis(ctx, saved.vedicPrana, false)).body as J).analysis;
    assert.equal(rx.calls.length, n);
    assert.equal(a.technical.level, "prana");
    assert.equal(a.technical.periods.length, 9);
    assert.equal(a.technical.current.chain.length, 5);
    assert.ok(!("antardashas" in a.technical) && !a.technical.children, "alt düzey listeleri kayda girmez");
    const d = describeOptions("vedic.dasha", a.params ?? a.technique_params ?? SEL.vedicPrana.options);
    assert.match(d, /Prana · Ay \/ Rahu \/ Ketu \/ Ay|Prana ·/);
    assert.match(d, /güncel dönem zinciri: 01\.11\.2026 09:00 UTC/);
  });

  const report = async (id: string) => buildAstroReport(((await getAnalysis(ctx, id, false)).body as J).analysis as ReportAnalysisInput);
  await t("rapor modeli: 'Güncel dönem zinciri' tablosu (5 düzey, başlangıç-bitiş, kalan; KP'de ev + ortak evler); Prana süreleri saat/dakika", async () => {
    const v = reportTexts(await report(saved.vedicPrana)).join("\n");
    for (const m of ["Güncel dönem zinciri", "Prana", "Sookshma", "Pratyantardasha", "01.11.2026 12:00", "Kalan (gün)"]) assert.ok(v.includes(m), `Vedik rapor: "${m}" yok`);
    assert.ok(/\d+ sa \d+ dk|\d+ dk/.test(v), "Prana süresi saat/dakika değil");
    const k = reportTexts(await report(saved.kpMajorChain)).join("\n");
    for (const m of ["Güncel dönem zinciri", "Ortak evler (Maha · Antar · Pratyantar)", "Significator evleri"]) assert.ok(k.includes(m), `KP rapor: "${m}" yok`);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(v + k), "boş/ham değer");
  });

  await t("rapor: eksik `nominalStart` artık görünür — doğumla kesilen Mercury MD 'Teorik başlangıç 06.07.1974 14:30'", async () => {
    const v = reportTexts(await report(saved.vedicMajor)).join("\n");
    assert.ok(v.includes("Teorik başlangıç"), "Teorik başlangıç sütunu yok");
    assert.ok(v.includes("06.07.1974 14:30"), "nominalStart değeri yok");
  });

  await t("Word + PDF: zincir tablosu ve teorik başlangıç iki çıktıda da var", async () => {
    for (const id of [saved.vedicPrana, saved.vedicMajor]) {
      const r = await report(id);
      const docx = await docxText(await renderAstroReportDocx(r, null, symbolFontBuffers()));
      const pdf = (await pdfText(Buffer.from(buildAstroReportPdf(r, null, FONT_B64, symbolFontsBase64())))).replace(/\s+/g, " ");
      const want = id === saved.vedicPrana ? ["Güncel dönem zinciri", "Prana"] : ["Teorik başlangıç", "06.07.1974"];
      for (const m of want) {
        assert.ok(docx.includes(m), `Word: "${m}" yok`);
        assert.ok(pdf.includes(m), `PDF: "${m}" yok`);
      }
    }
  });

  await t("geri uyum: zincirsiz eski kayıt teknik verisi raporda zincir bölümü üretmez; eski 3 düzeyli kayıtlar aynı başlıkları alır", () => {
    const tech = deepProj(DSA.response, ["moon", "rahu"]).technical;
    const r = reportTexts(buildAstroReport({ id: "x", title: "x", technique: "vedic.dasha", analysisAt: "2026-10-21T00:00:00Z", technical: tech, params: { ayanamsa: "lahiri", mahadasha: "moon", antardasha: "rahu" } })).join("\n");
    assert.ok(!r.includes("Güncel dönem zinciri"));
    assert.ok(r.includes("Pratyantardasha"));
  });

  // ── UI saf yardımcıları ─────────────────────────────────────────────────────────────────────────────
  await t("UI: alt düzey yolu 5 düzeye kadar (Prana'da alt düzey yok); seçici gövdesi eski seçimde değişmez; Sookshma/Prana için KB konusu üst düzeye YANLIŞ atanmaz", () => {
    const child = fn(VP as J, "dashaChildPath");
    assert.deepEqual(child({ level: "pratyantardasha", path: { mahadasha: "moon", antardasha: "rahu" } }, "ketu"), { mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu" });
    assert.deepEqual(child({ level: "sookshma", path: { mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu" } }, "moon"), { mahadasha: "moon", antardasha: "rahu", pratyantardasha: "ketu", sookshma: "moon" });
    assert.equal(child({ level: "prana", path: {} }, "moon"), null);
    assert.deepEqual(fn(UIL as J, "dashaPathOptions")("moon", "rahu", "", ""), { mahadasha: "moon", antardasha: "rahu" });
    assert.deepEqual(fn(UIL as J, "dashaPathOptions")("moon", "", "ketu", "moon"), { mahadasha: "moon", antardasha: null });
    assert.deepEqual(fn(UIL as J, "dashaChainOptions")({ dashaChainMode: "off" }), {});
    assert.deepEqual(fn(UIL as J, "dashaChainOptions")({ dashaChainMode: "custom", dashaChainDate: "2026-11-01", dashaChainTime: "12:00", dashaChainTz: "Europe/Istanbul" }), { chainAtUtc: AT_UTC });
    const tp = deepProj(need(SOOK, "S").response, ["moon", "rahu", "ketu"]).technical;
    assert.deepEqual(topicsFromVedicDasha(tp), []);
    assert.ok(!VP.dashaTopicKey(tp, "moon").startsWith("dasha_pratyantardasha"));
  });

  await t("statik: kullanıcıya görünen yeni metinlerde sağlayıcı adı / 'golden' / 'fixture' yok", () => {
    for (const f of ["app/admin/astroloji/_components/VedicPanels.tsx", "app/admin/astroloji/_components/TechniqueSelector.tsx", "lib/astrology/report/model.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      const strings = [...src.matchAll(/"([^"\n]*(?:zincir|Sookshma|Prana)[^"\n]*)"/g)].map((m) => m[1]);
      for (const s of strings) assert.ok(!/roxy|golden|fixture/i.test(s), `${f}: ${s}`);
    }
  });

  console.log(`\ndasha-depth: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
