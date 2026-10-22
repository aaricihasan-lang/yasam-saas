/**
 * ASTROLOJİ AŞAMA 2.1 (Sekonder Progresyon) + 2.2 (Solar Arc) harness'i — 2026-10-21.
 *
 *   • Natal bağlam birimi YALNIZ önbellek: natal önbellekteyse natalFrame eklenir ve 0 yeni istek; yoksa çerçeve yok;
 *     farklı revizyon / düğüm türü / saat bilinmiyor → çerçeve yok. Sağlayıcıya natal GÖNDERİLMEZ, istek gövdesi aynı.
 *   • Açı hesabı bağımsız aritmetikle (örnek boylamlar + golden ham yanıt), orb sınırı (1°), yaklaşan/ayrılan.
 *   • Solar Arc natal tutarlılık kapısı (uyuşmayan natal → çerçeve yok).
 *   • Kayıt + arşivden açma 0 sağlayıcı isteği; eski kayıt (natalFrame alanı yok) değişmeden açılır.
 *   • Rapor: çift halka figürü (outer + crossAspects), konum + açı tabloları, yöntem/orb satırı; Word + PDF üretimi.
 *   • Ekran: çift halka (dış halka) + tablolar + "Transit" etiketi YOK (renderToStaticMarkup).
 *   • Yorum yetkisi kapalıyken yorum yok (görünüm, kayıt, rapor).
 * Gerçek sağlayıcı / gerçek DB YOK (golden yanıtlar, sahte Supabase).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/progression-solararc.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { appendAstroRevision, createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { buildWheelSvg } from "@/lib/astrology/report/wheelSvg";
import { renderWheelPng } from "@/lib/astrology/report/chartPng";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { COMBINED_REPORT_MAX_BYTES } from "@/lib/astrology/report/service";
import { aspectMotion, directionAspects, DIRECTION_ASPECT_ORB, progressedToNatalAspects, solarArcAspectsWithMotion } from "@/lib/astrology/directionAspects";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { TechniqueTechnical, wheelForTechnique, directedWheelGap, DirectedWheelCaption } from "@/app/admin/astroloji/_components/TimingPanels";
import NatalWheel from "@/app/admin/astroloji/_components/NatalWheel";
import type { ProgressionTechnical, SolarArcTechnical } from "@/lib/astrology/model/westernTiming";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const ROOT = join(__dirname, "..", "..");
const DIR = join(__dirname, "fixtures", "golden");
const PROG = JSON.parse(readFileSync(join(DIR, "progression.json"), "utf8"));
const SA = JSON.parse(readFileSync(join(DIR, "solar-arc.json"), "utf8"));
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const BY_ENDPOINT: Record<string, J> = { "/astrology/natal-chart": NATAL, [PROG.endpoint]: PROG.response, [SA.endpoint]: SA.response };

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
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };

const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

type Call = { endpoint: string; body: Record<string, unknown> };
function roxy() {
  const calls: Call[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const base = BY_ENDPOINT[endpoint];
      if (!base) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      return { ok: true, raw: structuredClone(base), attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    now: () => new Date("2026-10-07T09:41:00Z"),
  };
  return { calls, deps };
}

async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const NATAL_SEL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const PROG_SEL = { technique: "western.progression", options: { targetDate: "2026-10-07", nodeType: "true" } };
const SA_SEL = { technique: "western.solar_arc", options: { targetDate: "2026-10-07", nodeType: "true" } };
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, extra: Record<string, unknown> = {}) => runAstrology(ctx, { profileId: pid, selections, ...extra }, deps, { ownerPreviewHideInterp: false });
const techOf = (r: J, i = 0) => (r.body as J).results[i].view.technical;

// ─── Bağımsız aritmetik (yardımcı modülü KULLANMAZ) ──────────────────────────
const ID: Record<string, string> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus", Neptune: "neptune", Pluto: "pluto", "North Node": "north_node", "South Node": "south_node", Chiron: "chiron", "Black Moon Lilith": "lilith", Ascendant: "ascendant", Midheaven: "midheaven" };
const EX: [string, number][] = [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]];
const sep = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
function brute(moving: { id: string; lon: number; v: number }[], natal: { id: string; lon: number }[], skipAxis: boolean) {
  const out: string[] = [];
  for (const m of moving)
    for (const n of natal) {
      if (m.id === n.id) continue;
      if (skipAxis && ((m.id === "north_node" && n.id === "south_node") || (m.id === "south_node" && n.id === "north_node"))) continue;
      for (const [type, ex] of EX) {
        const orb = Math.abs(sep(m.lon, n.lon) - ex);
        if (orb > 1 + 1e-9) continue;
        // Yaklaşan/ayrılan: 0,01 gün sonra (hız × dt) orb küçülüyor mu?
        const later = Math.abs(sep(m.lon + m.v * 0.01, n.lon) - ex);
        const motion = m.v === 0 ? "null" : later < orb ? "applying" : "separating";
        out.push(`${m.id}|${type}|${n.id}|${(Math.round(orb * 1e4) / 1e4).toFixed(4)}|${motion}`);
      }
    }
  return out.sort();
}
const key = (a: { moving?: string; directed?: string; natal: string; type: string; orb: number; motion: string | null }) => `${a.moving ?? a.directed}|${a.type}|${a.natal}|${a.orb.toFixed(4)}|${a.motion ?? "null"}`;

async function main() {
  // ═══ 1) Bağlam birimi: yalnız önbellek ═════════════════════════════════════
  await t("C1 natal önbellekte YOKKEN: plan 1 istek, sağlayıcıya yalnız ilgili uç gider (natal yok), natalFrame null — progresyon + Solar Arc", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    for (const sel of [PROG_SEL, SA_SEL]) {
      const rx = roxy();
      const pl = await planAstrology(ctx, { profileId: pa, selections: [sel] });
      assert.equal((pl.body as J).plan.newRequestCount, 1, `${sel.technique}: natal plana girmemeli`);
      const r = await run(ctx, pa, [sel], rx.deps);
      assert.deepEqual(rx.calls.map((c) => c.endpoint), [sel.technique === "western.progression" ? "/astrology/progressions" : "/astrology/solar-arc"]);
      assert.equal(techOf(r).natalFrame, null);
    }
  });

  await t("C2 natal önbellekteyse natalFrame eklenir: plan 1 (yalnız teknik), yeniden açış 0 istek; çerçeve natal sonuçla birebir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const nat = await run(ctx, pa, [NATAL_SEL], rx.deps);
    const natalView = techOf(nat);
    for (const sel of [PROG_SEL, SA_SEL]) {
      const pl = await planAstrology(ctx, { profileId: pa, selections: [sel] });
      assert.equal((pl.body as J).plan.newRequestCount, 1);
      const before = rx.calls.length;
      const r = await run(ctx, pa, [sel], rx.deps);
      assert.equal(rx.calls.length, before + 1, "yalnız tekniğin kendi isteği");
      assert.ok(!rx.calls.slice(before).some((c) => c.endpoint === "/astrology/natal-chart"), "natal sağlayıcıya gönderilmemeli");
      const fr = techOf(r).natalFrame;
      assert.ok(fr && fr.houses.length === 12 && fr.houseSystem === "placidus" && fr.nodeType === "true", sel.technique);
      assert.deepEqual(fr.angles, natalView.angles);
      assert.deepEqual(fr.bodies.map((b: J) => [b.id, b.longitude]), natalView.bodies.map((b: J) => [b.id, b.longitude]));
      const n = rx.calls.length;
      const again = await run(ctx, pa, [sel], rx.deps);
      assert.equal(rx.calls.length, n, "yeniden açmak sağlayıcı çağırmamalı");
      assert.deepEqual(techOf(again).natalFrame, fr);
    }
  });

  await t("C3 istek gövdesi / önbellek anahtarı DEĞİŞMEDİ: units() gövdesi golden gövdesiyle birebir, bağlam birimleri natal gövdesi (plana girmez)", () => {
    const birth = SYNTH_A;
    for (const [id, g] of [["western.progression", PROG], ["western.solar_arc", SA]] as const) {
      const def = getTechnique(id)!;
      const opts = def.parseOptions({ targetDate: "2026-10-07", nodeType: "true" }, new Date())!;
      assert.deepEqual(opts, { targetDate: "2026-10-07", nodeType: "true" }, "seçenek nesnesi aynı");
      const u = def.units({ birth, birthUtc: birth.utc, partner: null }, opts);
      assert.equal(u.length, 1);
      assert.equal(u[0].adapterVersion, id === "western.progression" ? "astro-roxy-progression-1" : "astro-roxy-solar-arc-1", "adaptör sürümü değişmemeli");
      assert.deepEqual(JSON.parse(JSON.stringify(u[0].body)), g.body, `${id} gövde farklı`);
      const cu = def.contextUnits!({ birth, birthUtc: birth.utc, partner: null }, opts);
      assert.deepEqual(cu.map((x) => x.endpoint), ["/astrology/natal-chart", "/astrology/natal-chart", "/astrology/natal-chart", "/astrology/natal-chart"]);
      assert.deepEqual(cu.map((x) => x.body.houseSystem), ["placidus", "whole-sign", "equal", "koch"]);
    }
  });

  await t("C4 yanlış birleştirme yok: farklı düğüm türü / farklı revizyon / saat bilinmiyor → natalFrame YOK", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [NATAL_SEL], rx.deps);
    for (const sel of [PROG_SEL, SA_SEL]) {
      const mean = await run(ctx, pa, [{ technique: sel.technique, options: { ...sel.options, nodeType: "mean" } }], rx.deps);
      assert.equal(techOf(mean).natalFrame, null, `${sel.technique}: düğüm türü farklı`);
    }
    const rev = await appendAstroRevision(ctx, pa, { expectedRevision: 1, birthDate: "1990-07-15", birthTime: "14:45", timeKnown: true, timeAccuracy: "rectified", locationId: ISTANBUL.id }, resolveLoc);
    assert.ok(rev.status === 200 || rev.status === 201, JSON.stringify(rev.body));
    for (const sel of [PROG_SEL, SA_SEL]) {
      const r2 = await run(ctx, pa, [sel], rx.deps, { revision: 2 });
      assert.equal(techOf(r2).natalFrame, null, `${sel.technique}: başka revizyonun natali birleştirildi`);
      const r1 = await run(ctx, pa, [sel], rx.deps, { revision: 1 });
      assert.ok(techOf(r1).natalFrame, `${sel.technique}: rev 1 natali rev 1'de kullanılmalı`);
    }
    const pu = await profile(ctx, { label: "Saatsiz", birthTime: null, timeKnown: false, timeAccuracy: "unknown" });
    await run(ctx, pu, [NATAL_SEL], rx.deps);
    for (const sel of [PROG_SEL, SA_SEL]) {
      const ru = await run(ctx, pu, [sel], rx.deps);
      assert.equal(techOf(ru).natalFrame, null, `${sel.technique}: saat bilinmiyor`);
      assert.equal((ru.body as J).results[0].view.timeUnknownMasked, true);
    }
  });

  await t("C5 maske: saat bilinmiyorsa natalFrame kaldırılır (çerçeveli teknik veri verilse bile)", () => {
    const frame = { houseSystem: "placidus", nodeType: "true", bodies: [], houses: [], angles: { ascendant: { longitude: 1, sign: "aries", degreeInSign: 1 }, midheaven: { longitude: 2, sign: "aries", degreeInSign: 2 } } };
    const p = { schema: "astro.western.progression.v1", bodies: [], angles: null, natalFrame: frame } as J;
    assert.equal((maskTechnical("western.progression", p, { primary: false, partner: null }).technical as J).natalFrame, null);
    const s = { schema: "astro.western.solar_arc.v1", directed: [], aspects: [], natalFrame: frame } as J;
    assert.equal((maskTechnical("western.solar_arc", s, { primary: false, partner: null }).technical as J).natalFrame, null);
    // Eski (alan yok) teknik veri maskede alan KAZANMAZ.
    const old = { schema: "astro.western.solar_arc.v1", directed: [], aspects: [] } as J;
    assert.ok(!("natalFrame" in (maskTechnical("western.solar_arc", old, { primary: false, partner: null }).technical as J)));
  });

  await t("C6 Solar Arc tutarlılık kapısı: önbellekteki natal, yanıtın natal boylamlarıyla uyuşmazsa çerçeve EKLENMEZ", () => {
    const def = getTechnique("western.solar_arc")!;
    const opts = { targetDate: "2026-10-07", nodeType: "true" };
    const u = def.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, opts)[0];
    const p = def.project(u, SA.response, opts);
    assert.ok(p.ok);
    const nd = getTechnique("western.natal")!;
    const nu = nd.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, { houseSystem: "placidus", nodeType: "true" })[0];
    const np = nd.project(nu, NATAL, { houseSystem: "placidus", nodeType: "true" });
    assert.ok(np.ok);
    const ok = def.attachContext!(p.ok && p.technical, [np.ok && np.technical, null, null, null], opts) as J;
    assert.ok(ok.natalFrame, "uyumlu natal → çerçeve");
    const bad = structuredClone(np.ok && (np.technical as J));
    bad.bodies[0].longitude += 0.5;
    const no = def.attachContext!(p.ok && p.technical, [bad, null, null, null], opts) as J;
    assert.equal(no.natalFrame, null, "uyuşmayan natal → çerçeve yok");
    // İlk aday yoksa sıradaki ev sistemi (whole-sign) kullanılır.
    const ws = def.attachContext!(p.ok && p.technical, [null, { ...(np.ok && (np.technical as J)), houseSystem: "whole-sign" }, null, null], opts) as J;
    assert.equal(ws.natalFrame.houseSystem, "whole-sign");
  });

  // ═══ 2) Açı hesabı ════════════════════════════════════════════════════════
  await t("A1 açı aritmetiği örnek boylamlarla: kare 0,5° yaklaşan; karşıt 0,75° ayrılan; 360° sarma; retro yönü; orb sınırı 1° dahil / 1,0001° hariç", () => {
    const r = directionAspects(
      [
        { id: "mars", longitude: 10, dir: 1 },
        { id: "venus", longitude: 359.5, dir: 1 },
        { id: "mercury", longitude: 200, dir: -1 },
      ],
      [
        { id: "sun", longitude: 100.5 },
        { id: "moon", longitude: 0.25 },
        { id: "saturn", longitude: 20.75 },
        { id: "jupiter", longitude: 141 },
        { id: "pluto", longitude: 261.0001 },
      ],
      { skipNodeAxis: true },
    );
    const k = (m: string, n: string) => r.find((x) => x.moving === m && x.natal === n);
    // mars 10 → sun 100.5: ayrım 90.5 → kare orb 0.5; mars ileri giderse ayrım 90'a iner → yaklaşan.
    assert.deepEqual([k("mars", "sun")?.type, k("mars", "sun")?.orb, k("mars", "sun")?.motion], ["square", 0.5, "applying"]);
    // venus 359.5 ↔ moon 0.25 (sarma): ayrım 0.75 → kavuşum yaklaşan.
    assert.deepEqual([k("venus", "moon")?.type, k("venus", "moon")?.orb, k("venus", "moon")?.motion], ["conjunction", 0.75, "applying"]);
    // mercury 200 ↔ saturn 20.75: ayrım 179.25 → karşıt 0.75; retro (geri) → ayrım küçülür → ayrılan.
    assert.deepEqual([k("mercury", "saturn")?.type, k("mercury", "saturn")?.orb, k("mercury", "saturn")?.motion], ["opposition", 0.75, "separating"]);
    // mercury 200 ↔ jupiter 141: ayrım 59 → altmışlık orb tam 1 (dahil).
    assert.equal(k("mercury", "jupiter")?.orb, 1);
    // mercury 200 ↔ pluto 261.0001: ayrım 61.0001 → orb 1.0001 (hariç).
    assert.equal(k("mercury", "pluto"), undefined);
    assert.equal(DIRECTION_ASPECT_ORB, 1);
    // Kendi natal konumu ve düğüm ekseni listelenmez.
    const self = directionAspects([{ id: "sun", longitude: 50, dir: 1 }, { id: "north_node", longitude: 10, dir: -1 }], [{ id: "sun", longitude: 50.2 }, { id: "south_node", longitude: 190.1 }], { skipNodeAxis: true });
    assert.deepEqual(self, []);
    assert.equal(aspectMotion(10, 100.5, "square", 0), null, "hız 0 → bilinmiyor");
  });

  await t("A2 golden progresyon → natal açıları BAĞIMSIZ kaba kuvvetle (ham yanıtlardan) birebir; ilerletilmiş ASC/MC dahil", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = await run(ctx, pa, [NATAL_SEL, PROG_SEL], rx.deps);
    const tech = techOf(r, 1) as ProgressionTechnical;
    const got = progressedToNatalAspects(tech)!.map((a) => key(a)).sort();
    const moving = [
      ...(PROG.response.planets as J[]).map((p) => ({ id: ID[p.name], lon: p.longitude, v: p.speed })),
      { id: "ascendant", lon: PROG.response.ascendant.longitude, v: 1 },
      { id: "midheaven", lon: PROG.response.midheaven.longitude, v: 1 },
    ];
    const natal = [...(NATAL.planets as J[]).map((p) => ({ id: ID[p.name], lon: p.longitude })), { id: "ascendant", lon: NATAL.ascendant.longitude }, { id: "midheaven", lon: NATAL.midheaven.longitude }];
    const want = brute(moving, natal, true);
    assert.ok(want.length > 0, "golden örnekte en az bir açı beklenir");
    assert.deepEqual(got, want);
    console.log(`     progresyon → natal açılar (${got.length}): ${got.join(", ")}`);
  });

  await t("A3 golden Solar Arc → natal açıları: kayıtlı adaptör değerleri aynen + bağımsız kaba kuvvetle birebir (yön hep ileri)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = await run(ctx, pa, [SA_SEL], rx.deps);
    const tech = techOf(r) as SolarArcTechnical;
    const got = solarArcAspectsWithMotion(tech).map((a) => key(a)).sort();
    const dirs = (SA.response.directed as J[]).map((d) => ({ id: ID[d.name], lon: d.directedLongitude, v: 1, natal: d.natalLongitude }));
    const want = brute(dirs, dirs.map((d) => ({ id: d.id, lon: d.natal })), false);
    assert.deepEqual(got, want);
    // Değerler değişmedi: yardımcı yalnız yön ekler.
    assert.deepEqual(solarArcAspectsWithMotion(tech).map((a) => [a.directed, a.type, a.natal, a.orb]), [...tech.aspects].sort((a, b) => a.orb - b.orb).map((a) => [a.directed, a.type, a.natal, a.orb]));
    // Yöntem: yay = ilerletilmiş Güneş − natal Güneş (golden: iki uçtan bağımsız).
    const progSun = (PROG.response.planets as J[]).find((p) => p.name === "Sun").longitude;
    const natSun = (NATAL.planets as J[]).find((p) => p.name === "Sun").longitude;
    assert.ok(Math.abs(tech.arc - (progSun - natSun)) < 1e-6, "Solar Arc = ilerletilmiş Güneş − natal Güneş");
    for (const d of tech.directed) assert.ok(Math.abs(((d.directedLongitude - d.natalLongitude - tech.arc + 540) % 360) - 180) < 1e-6, `${d.id}: aynı yay`);
    console.log(`     Solar Arc → natal açılar (${got.length}): ${got.join(", ")}`);
  });

  // ═══ 3) Kayıt / arşiv ═════════════════════════════════════════════════════
  await t("K1 kayıt + arşivden açma: natalFrame snapshot'ta, açılış 0 sağlayıcı isteği, kaynak 'snapshot', teknik veri canlı görünümle aynı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = await run(ctx, pa, [NATAL_SEL, PROG_SEL, SA_SEL], rx.deps);
    for (const [i, sel] of [[1, PROG_SEL], [2, SA_SEL]] as const) {
      const live = techOf(r, i);
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, JSON.stringify(sv.body));
      const n = rx.calls.length;
      const a = await getAnalysis(ctx, (sv.body as J).analysisId, false);
      assert.equal(rx.calls.length, n, "arşivden açmak sağlayıcı çağırmamalı");
      const an = (a.body as J).analysis;
      assert.equal(an.natalFrameSource, "snapshot");
      assert.deepEqual(an.technical, live);
      const row = (store.tables.astro_analyses as J[]).find((x) => x.id === (sv.body as J).analysisId);
      assert.ok(row.technical_snapshot.natalFrame, "snapshot'a natalFrame yazılmalı");
    }
  });

  await t("K2 eski kayıt uyumluluğu: natalFrame alanı olmayan snapshot DEĞİŞMEDEN açılır; natal önbellekteyse yalnız yanıtta çerçeve (kaynak 'cache'), yoksa çift halka yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [PROG_SEL, SA_SEL], rx.deps);
    const ids: string[] = [];
    for (const sel of [PROG_SEL, SA_SEL]) {
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201);
      const row = (store.tables.astro_analyses as J[]).find((x) => x.id === (sv.body as J).analysisId);
      delete row.technical_snapshot.natalFrame; // AŞAMA 2 öncesi kayıt biçimi
      ids.push(row.id);
    }
    const frozen = JSON.stringify((store.tables.astro_analyses as J[]).map((x) => x.technical_snapshot));
    // (a) natal önbellekte yok → çerçeve yok; rapor: progresyon tek halka, Solar Arc görselsiz + açık not.
    for (const [i, id] of ids.entries()) {
      const a = (await getAnalysis(ctx, id, false)).body as J;
      assert.equal(a.analysis.natalFrameSource, undefined);
      assert.ok(!a.analysis.technical.natalFrame);
      const rep = buildAstroReport(a.analysis as ReportAnalysisInput);
      const ch = rep.blocks.find((b) => b.kind === "chart") as J;
      if (i === 0) assert.ok(ch && !ch.chart.outer, "eski progresyon: tek halka");
      else {
        assert.equal(ch, undefined, "eski Solar Arc: çark yok");
        assert.ok(reportTexts(rep).some((x) => x.includes("çift halka bu kayıtta çizilmedi")));
      }
      const tech = a.analysis.technique as string;
      assert.ok(directedWheelGap(tech, a.analysis.technical, false), "ekranda açık neden");
    }
    // (b) sonradan natal hesaplanırsa → yalnız yanıtta çerçeve; kayıt DEĞİŞMEZ; 0 istek.
    await run(ctx, pa, [NATAL_SEL], rx.deps);
    const n = rx.calls.length;
    for (const id of ids) {
      const a = (await getAnalysis(ctx, id, false)).body as J;
      assert.equal(a.analysis.natalFrameSource, "cache");
      assert.ok(a.analysis.technical.natalFrame);
    }
    assert.equal(rx.calls.length, n);
    assert.equal(JSON.stringify((store.tables.astro_analyses as J[]).map((x) => x.technical_snapshot)), frozen, "kayıtlı snapshot değişmemeli");
  });

  // ═══ 4) Rapor (Word/PDF) ══════════════════════════════════════════════════
  const store = seed();
  const ctx = ctxOf(store);
  const pa = await profile(ctx);
  const rx = roxy();
  await run(ctx, pa, [NATAL_SEL, PROG_SEL, SA_SEL], rx.deps);
  const savedId: Record<string, string> = {};
  for (const sel of [PROG_SEL, SA_SEL]) {
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
    savedId[sel.technique] = (sv.body as J).analysisId;
  }
  const full = async (tech: string) => ((await getAnalysis(ctx, savedId[tech], false)).body as J).analysis as ReportAnalysisInput & J;

  for (const tech of ["western.progression", "western.solar_arc"]) {
    await t(`R1 ${tech}: çift halka figürü (outer + halkalar arası açılar), konum + açı tabloları, yöntem/orb satırı; "Transit" etiketi yok`, async () => {
      const a = await full(tech);
      const rep = buildAstroReport(a);
      const ch = rep.blocks.find((b) => b.kind === "chart") as J;
      assert.ok(ch && ch.chart.outer && ch.chart.outer.bodies.length >= 10, "dış halka");
      assert.equal(ch.chart.houses.length, 12, "iç halka natal evleri");
      assert.deepEqual(ch.chart.angles.ascendant.longitude, a.technical.natalFrame.angles.ascendant.longitude, "iç halka = natal");
      const cross = ch.chart.crossAspects as J[];
      const expected =
        tech === "western.progression"
          ? progressedToNatalAspects(a.technical)!.filter((x) => !["ascendant", "midheaven"].includes(x.moving) && !["ascendant", "midheaven"].includes(x.natal)).length
          : solarArcAspectsWithMotion(a.technical).filter((x) => !["ascendant", "midheaven"].includes(x.directed) && !["ascendant", "midheaven"].includes(x.natal)).length;
      assert.equal(cross.length, expected, "halkalar arası açı sayısı");
      const svg = buildWheelSvg(ch.chart);
      assert.equal((svg.match(/data-cross="1"/g) ?? []).length, expected);
      const all = reportTexts(rep).join("\n");
      assert.ok(all.includes("orb ≤ 1°"), "orb kuralı yazılı");
      assert.ok(all.includes(tech === "western.progression" ? "İlerletilmiş → natal açılar" : "Solar Arc → natal açılar"));
      assert.ok(all.includes(tech === "western.progression" ? "ikincil ilerletme" : "ilerletilmiş Güneş − natal Güneş"), "yöntem satırı");
      assert.ok(all.includes("Yaklaşan") || all.includes("Ayrılan"), "yaklaşan/ayrılan bilgisi");
      if (tech === "western.solar_arc") assert.ok(!/transit/i.test(all), "Solar Arc raporunda Transit etiketi olmamalı");
      assert.ok(!/roxy/i.test(all), "sağlayıcı adı yok");
      const tables = rep.blocks.filter((b) => b.kind === "table") as J[];
      for (const b of tables) for (const row of b.table.rows) assert.equal(row.length, b.table.columns.length, "satır/sütun");
      const aspectTable = tables.find((b) => b.table.columns.includes("Durum") && b.table.columns.includes("Natal"));
      assert.ok(aspectTable && aspectTable.table.rows.length > 0, "açı tablosu");
      // Word + PDF: aynı PNG gömülü; boyut toplu rapor sınırının çok altında.
      const png = renderWheelPng(ch.chart)!;
      assert.ok(png && png.width === png.height);
      const docx = await renderAstroReportDocx(rep, png.png, symbolFontBuffers());
      const zip = await JSZip.loadAsync(docx);
      assert.equal(Object.keys(zip.files).filter((x) => x.startsWith("word/media/") && !x.endsWith("/")).length, 1, "Word'de 1 görsel");
      const xml = await zip.file("word/document.xml")!.async("string");
      assert.ok(xml.includes("orb ≤ 1°"));
      const fontB64 = readFileSync(join(ROOT, "public", "fonts", "Geist-Regular.ttf")).toString("base64");
      const pdf = buildAstroReportPdf(rep, png, fontB64, symbolFontsBase64());
      assert.ok(pdf.byteLength > 10_000);
      assert.ok(docx.byteLength < COMBINED_REPORT_MAX_BYTES / 4 && pdf.byteLength < COMBINED_REPORT_MAX_BYTES / 4, `boyut: docx ${docx.byteLength} pdf ${pdf.byteLength}`);
      console.log(`     ${tech}: docx ${docx.byteLength} B · pdf ${pdf.byteLength} B · png ${png.png.byteLength} B (toplu sınır ${COMBINED_REPORT_MAX_BYTES} B)`);
    });
  }

  // ═══ 5) Ekran (statik işaretleme) ═════════════════════════════════════════
  await t("U1 ekran: natal çerçeveli progresyon/Solar Arc → çift halka (dış halka), Solar Arc çarkında/künyesinde 'Transit' YOK; tablolar + yöntem + orb kuralı", async () => {
    for (const tech of ["western.progression", "western.solar_arc"]) {
      const a = await full(tech);
      const w = wheelForTechnique(tech, a.technical)!;
      assert.ok(w && w.wheel.outer && w.wheel.outer.bodies.length >= 10, `${tech}: çift halka`);
      const svg = renderToStaticMarkup(createElement(NatalWheel, { technical: w.wheel, label: w.label }));
      assert.ok(svg.includes('data-outer-ring="1"'));
      assert.equal((svg.match(/data-outer-body=/g) ?? []).length, w.wheel.outer!.bodies.length);
      assert.equal((svg.match(/data-cross="1"/g) ?? []).length, w.wheel.outer!.crossAspects.length);
      const cap = renderToStaticMarkup(createElement(DirectedWheelCaption, { technique: tech, technical: a.technical, natalName: "Sentetik A" }));
      const html = renderToStaticMarkup(createElement(TechniqueTechnical, { technique: tech, technical: a.technical, timeUnknownMasked: false, warnings: [], names: ["Sentetik A", "2. kişi"], hideWheel: true }));
      if (tech === "western.solar_arc") {
        assert.ok(w.label.includes("Solar Arc") && !/transit/i.test(w.label + svg + cap + html), "Solar Arc'ta Transit etiketi olmamalı");
        assert.ok(svg.includes("Solar Arc "), "dış halka glif ipucu 'Solar Arc'");
        for (const id of ["astro-solar-arc-positions", "astro-solar-arc-aspects", "astro-solar-arc-method", "astro-solar-arc-orb-rule", "astro-solar-arc-period"]) assert.ok(html.includes(id), id);
      } else {
        for (const id of ["astro-progression-positions", "astro-progression-aspects", "astro-progression-method", "astro-progression-orb-rule", "astro-progression-period"]) assert.ok(html.includes(id), id);
        assert.ok(svg.includes("İlerletilmiş "));
      }
      assert.ok(html.includes("orb ≤ 1°") && (html.includes("Yaklaşan") || html.includes("Ayrılan")));
      assert.ok(!/roxy/i.test(html + cap + svg));
      assert.equal(directedWheelGap(tech, a.technical, false), null, "çerçeve varken boşluk notu yok");
    }
  });

  await t("U2 ekran: çerçevesiz progresyon tek halka + açık neden; çerçevesiz Solar Arc çark YOK + açık neden; dış halka yokken natal çark işaretlemesi eskisiyle aynı", async () => {
    const p = (await full("western.progression")).technical as J;
    const s = (await full("western.solar_arc")).technical as J;
    const pn = { ...p, natalFrame: null };
    const sn = { ...s, natalFrame: null };
    const w = wheelForTechnique("western.progression", pn)!;
    assert.ok(w && !w.wheel.outer, "tek halka");
    assert.equal(wheelForTechnique("western.solar_arc", sn), null);
    assert.match(directedWheelGap("western.progression", pn, false)!, /uyumlu Natal/);
    assert.match(directedWheelGap("western.solar_arc", sn, false)!, /uyumlu Natal/);
    assert.match(directedWheelGap("western.solar_arc", sn, true)!, /Doğum saati bilinmediği/);
    const html = renderToStaticMarkup(createElement(TechniqueTechnical, { technique: "western.progression", technical: pn, timeUnknownMasked: false, warnings: [], names: ["A", "B"] }));
    assert.ok(html.includes("astro-progression-no-frame"), "natal karşılaştırma yok nedeni");
    // Dış halka yokken çizim: viewBox ve öğeler eski biçimde (0 0 604 604, dış halka işareti yok).
    const plain = renderToStaticMarkup(createElement(NatalWheel, { technical: w.wheel, label: w.label }));
    assert.ok(plain.includes('viewBox="0 0 604 604"') && !plain.includes("data-outer-ring"));
  });

  // ═══ 6) Yorum yetkisi ═════════════════════════════════════════════════════
  await t("Y1 yorum yetkisi kapalıyken: görünümde, kayıtlı analizde ve raporda yorum YOK; açıkken var", async () => {
    const st = seed();
    const on = ctxOf(st);
    const off = ctxOf(st, { entitlements: NO_INTERP });
    const pid = await profile(on);
    const r = roxy();
    for (const sel of [PROG_SEL, SA_SEL]) {
      const vOn = await run(on, pid, [sel], r.deps);
      assert.equal((vOn.body as J).results[0].view.interpretation.visible, true, `${sel.technique}: yetkiliyken yorum görünür`);
      const vOff = await run(off, pid, [sel], r.deps);
      const view = (vOff.body as J).results[0].view;
      assert.equal(view.interpretation.visible, false);
      assert.ok(!JSON.stringify(view).includes((sel === PROG_SEL ? PROG : SA).response.summary.slice(0, 40)), "yorum metni sızmamalı");
      const sv = await saveAnalysis(off, { profileId: pid, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
      const a = (await getAnalysis(off, (sv.body as J).analysisId, false)).body as J;
      assert.equal(a.analysis.interpretation.visible, false);
      const rep = buildAstroReport(a.analysis);
      assert.equal(rep.hasInterpretation, false);
      assert.ok(!reportTexts(rep).join("\n").includes((sel === PROG_SEL ? PROG : SA).response.summary.slice(0, 40)));
    }
  });

  console.log(`\nastrology progression-solararc harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("progression-solararc harness çöktü:", e);
  process.exit(1);
});
