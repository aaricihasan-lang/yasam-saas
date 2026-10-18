/**
 * TRANSİT-03 harness'i (2026-10-17) — KP Transit ZAMAN ARALIĞI (Sub-Lord / Rasi geçişleri, KP konum tablosu).
 *
 * ÖNEMLİ: Bu üç sağlayıcı ucu için GERÇEK golden yanıt henüz YOK (ücretli çağrı owner onayı bekliyor). Uçtan uca testler
 * SENTETİK yanıtla (scripts/astrology/syntheticKpTiming.ts — bağımsız astronomi + bağımsız KP tablosu; gerçek golden KP
 * konumlarına ≤0,01° sabitlenmiş) yapılır. Bu, sağlayıcının doğruluğunu DEĞİL, bizim boru hattımızı kanıtlar.
 *
 *   A) Seçenekler + maliyet: tek-an kipi BİREBİR eski (gövde = golden); aralık kanonik; sınırlar; birim (istek) sayısı.
 *   B) Adaptörler fail-closed: yankı, sayım, komşuluk, KP tablosu, zincir, pencere, sıra, satır sınırı, biçim.
 *   C) Sentetik üretici doğrulaması (golden KP konumları; geçiş anlarında KP no / burç değişimi).
 *   D) Uçtan uca: plan → çalıştır → birleşik teknik; kısmi hata AÇIKÇA listelenir; kaydet → yeniden aç 0 istek;
 *      Word + PDF tabloları; harita/"çizilemedi" yok; yorum yok notu.
 *   E) Boyut: 92 gün Ay Sub-Lord ≈ 830 satır; teknik katman < 1 MB; 2001 satır → reddedilir (kırpılmaz).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/transit03.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { kpNewcombApprox, siderealLon, syntheticPlanetsInterval, syntheticRasiChanges, syntheticSublordChanges } from "./syntheticKpTiming";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, KP_POSITIONS_INTERVALS as S_IV, KP_POSITIONS_MAX_DAYS as S_PMAX, KP_TIMING_MAX_DAYS as S_MAX } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { buildAstroReport, kpTimingModeLabel } from "@/lib/astrology/report/model";
import { KP_LEGEND, KP_TRANSIT_LEGEND, kpLegendFor } from "@/app/admin/astroloji/_lib/kpChart";
import { KP_TIMING_MAX_ROWS, projectRoxyKpPlanetsRange, projectRoxyKpRasiChanges, projectRoxyKpSublordChanges } from "@/lib/astrology/providers/roxy/kp";
import { kpTable } from "@/lib/astrology/verify/kpSub";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import type { KpTimingPlanet, KpTimingTechnical } from "@/lib/astrology/model/kp";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { KP_POSITIONS_INTERVALS as C_IV, KP_POSITIONS_MAX_DAYS as C_PMAX, KP_TIMING_MAX_DAYS as C_MAX, describeOptions, kpRangeRequestCount, kpRangeOptions, defaultParams, buildSelections, kpRangeIssue, missingReason } from "@/app/admin/astroloji/_lib/techniques";

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

const KPG = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "kp-planets-at.json"), "utf8"));
const TR = getTechnique("kp.transit")!;
const NOW = new Date("2026-10-07T09:41:00Z");
const BIRTH = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 } as never;
const UCTX = { birth: BIRTH, birthUtc: "1990-07-15T11:30:00Z", partner: null } as never;
const RANGE = { startDate: "2026-10-07", days: 3, planets: ["moon", "sun"], kinds: ["rasi", "sublord"] };
const base = { ayanamsa: "kp-newcomb", nodeType: "mean" };

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const ctxOf = (store: FakeStore): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL });

async function docxText(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
async function pdfInfo(buf: Uint8Array): Promise<{ text: string; pages: number }> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text: String(text).replace(/\s+/g, " "), pages: totalPages };
}

/**
 * Bağımsız sınır denetimi (hızdan bağımsız): sağlayıcı anı dakikaya KESER → gerçek an [m, m+60 sn). Bu aralıkta gezegenin
 * sidereal boylamı (astronomy-engine − KP-Newcomb) ilgili sınırı (yeni sub'ın / burcun başlangıcı; geri harekette bitişi)
 * ±0,01° toleransla kapsamalı. Tolerans: ayanamsa yaklaşımı + efemeris farkı (golden konumlarda ≤0,0052° ölçüldü).
 */
function boundaryHit(planet: string, kind: "sub" | "rasi", c: J): boolean {
  const m = Date.parse(`${c.datetime}Z`);
  const l0 = siderealLon(planet, m);
  const l1 = siderealLon(planet, m + 60_000);
  const rel = (x: number) => ((x - l0 + 540) % 360) - 180;
  const fwd = rel(l1) >= 0;
  let b: number;
  if (kind === "sub") {
    const row = kpTable()[Number(c.toKp) - 1];
    b = fwd ? row.start : row.end;
  } else {
    const to = SIGN_IDS.indexOf(String(c.toSign).toLowerCase() as never);
    b = fwd ? to * 30 : ((to + 1) * 30) % 360;
  }
  const lo = Math.min(0, rel(l1)) - 0.01;
  const hi = Math.max(0, rel(l1)) + 0.01;
  return rel(b) >= lo && rel(b) <= hi;
}

async function main() {
  // ═══ A) Seçenekler + maliyet ══════════════════════════════════════════════════
  await t("A1 tek-an kipi BİREBİR eski: seçenek nesnesi + istek gövdesi = golden kp-planets-at", () => {
    const o = TR.parseOptions({ atUtc: "2026-10-07T09:00", ...base }, NOW)!;
    assert.deepEqual(o, { atUtc: "2026-10-07T09:00", ayanamsa: "kp-newcomb", nodeType: "mean" });
    const u = TR.units(UCTX, o);
    assert.equal(u.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(u[0].body)), KPG.body);
  });
  await t("A2 aralık: kanonik (gezegen/tür sırası farklı → aynı seçenek + aynı önbellek anahtarları); idempotent", () => {
    const a = TR.parseOptions({ range: RANGE, ...base }, NOW)!;
    const b = TR.parseOptions({ range: { ...RANGE, planets: ["sun", "moon"], kinds: ["sublord", "rasi"] }, ...base }, NOW)!;
    assert.deepEqual(a, b);
    assert.deepEqual((a.range as J).planets, ["sun", "moon"]);
    assert.deepEqual((a.range as J).kinds, ["sublord", "rasi"]);
    assert.deepEqual(TR.parseOptions(a, NOW), a);
    assert.deepEqual(TR.units(UCTX, a).map((u) => u.inputHash), TR.units(UCTX, b).map((u) => u.inputHash));
  });
  await t("A3 sınırlar: >92 gün, konum tablosu >7 gün, izinsiz aralık (15 dk), Rahu, bilinmeyen tür, tekrar, boş gezegen → RED", () => {
    const bad = [
      { ...RANGE, days: 93 },
      { ...RANGE, days: 0 },
      { ...RANGE, kinds: ["positions"], intervalMinutes: 360, days: 8 },
      { ...RANGE, kinds: ["positions"], intervalMinutes: 15, days: 1 },
      { ...RANGE, kinds: ["positions"], days: 1 },
      { ...RANGE, planets: ["rahu"] },
      { ...RANGE, kinds: ["sublord", "aspects"] },
      { ...RANGE, kinds: ["sublord", "sublord"] },
      { ...RANGE, planets: [] },
      { ...RANGE, startDate: "2700-01-01" },
      { ...RANGE, intervalMinutes: 60 },
    ];
    for (const r of bad) assert.equal(TR.parseOptions({ range: r, ...base }, NOW), null, JSON.stringify(r));
    assert.equal(TR.parseOptions({ range: RANGE, ayanamsa: "lahiri", nodeType: "mean" }, NOW), null, "KP dışı ayanamsa");
    assert.equal(TR.parseOptions({ range: RANGE, ...base, displayTz: "Mars/X" }, NOW), null);
  });
  await t("A4 maliyet: birim sayısı = gezegen × tür + konum tablosu (istemci tahmini ile aynı); gövdeler UTC, bitiş = başlangıç + gün − 1", () => {
    const o = TR.parseOptions({ range: { startDate: "2026-10-07", days: 7, planets: ["sun", "moon", "mars"], kinds: ["sublord", "rasi", "positions"], intervalMinutes: 360 }, ...base }, NOW)!;
    const u = TR.units(UCTX, o);
    assert.equal(u.length, 3 * 2 + 1);
    const p = { ...defaultParams(NOW), kpRangePlanets: ["sun", "moon", "mars"], kpRangeKinds: ["sublord", "rasi", "positions"] };
    assert.equal(kpRangeRequestCount(p), 7);
    for (const x of u.filter((y) => y.endpoint !== "/vedic-astrology/kp/planets-interval")) {
      assert.equal(x.body.timezone, 0);
      assert.equal(x.body.startDate, "2026-10-07");
      assert.equal(x.body.endDate, "2026-10-13");
    }
    const pos = u.find((y) => y.endpoint === "/vedic-astrology/kp/planets-interval")!;
    assert.equal(pos.body.startDatetime, "2026-10-07T00:00:00");
    assert.equal(pos.body.endDatetime, "2026-10-13T18:00:00");
    assert.equal(pos.body.timezone, 0);
    assert.notEqual(pos.inputHash, TR.units(UCTX, TR.parseOptions({ atUtc: "2026-10-07T00:00", ...base }, NOW)!)[0].inputHash, "tek-an anahtarıyla çakışmaz");
  });
  await t("A5 istemci ↔ sunucu sınırları aynı; istemci seçimi sunucuda geçerli; seçenek etiketi", () => {
    assert.equal(C_MAX, S_MAX);
    assert.equal(C_PMAX, S_PMAX);
    assert.deepEqual([...C_IV], [...S_IV]);
    const p = defaultParams(NOW);
    assert.ok(TR.parseOptions({ range: kpRangeOptions(p), ...base, displayTz: p.kpRangeTz }, NOW));
    assert.match(describeOptions("kp.transit", { range: RANGE, ...base }), /^aralık 07\.10\.2026 \+ 3 gün · Rasi \+ Sub-Lord · Ay, Güneş · KP-Newcomb$/);
    assert.match(describeOptions("kp.transit", { atUtc: "2026-10-07T09:00", ...base }), /07\.10\.2026 09:00 UTC · KP-Newcomb/);
  });
  await t("A6 TRANSİT-01 tarih kuralı aralık kipinde de: yarım/geçersiz başlangıç veya geçersiz ayar plana GİRMEZ; geçerli seçim sunucuda geçerli", () => {
    const method = { houseSystem: "placidus", nodeType: "mean" } as never;
    const sel = (p: ReturnType<typeof defaultParams>) => buildSelections({ "kp.transit": true }, p, method);
    const ok0 = { ...defaultParams(NOW), kpTransitMode: "range" as const, kpRangeStart: "2026-10-07" };
    assert.equal(kpRangeIssue(ok0), null);
    assert.equal(sel(ok0).length, 1);
    assert.ok(TR.parseOptions({ ...sel(ok0)[0].options }, NOW), "istemcinin kurduğu seçim sunucuda geçerli");
    // Yıl rakam rakam yazılırken tarayıcının ürettiği ara değerler + boş + geçersiz gün + 1600–2600 dışı.
    for (const d of ["", "0002-10-07", "0020-10-07", "0202-10-07", "2026-02-30", "1500-01-01", "2700-01-01"]) {
      const p = { ...ok0, kpRangeStart: d };
      assert.match(missingReason("kp.transit", p) ?? "", /başlangıç tarihini tamamlayın/, d);
      assert.equal(sel(p).length, 0, `plana girmemeli: "${d}"`);
      assert.equal(TR.parseOptions({ range: kpRangeOptions(p), ...base }, NOW), null, `sunucu da reddediyor: "${d}"`);
    }
    // Sunucunun reddettiği diğer ayarlar istemcide de kapı (plan/istek yok).
    for (const [p, why] of [
      [{ ...ok0, kpRangeKinds: [] }, /türü seçin/],
      [{ ...ok0, kpRangePlanets: [] }, /gezegeni seçin/],
      [{ ...ok0, kpRangeKinds: ["positions"], kpRangeDays: 30 }, /en çok 7 gün/],
      [{ ...ok0, kpRangeDays: 93 }, /en çok 92 gün/],
    ] as const) {
      assert.match(missingReason("kp.transit", p as never) ?? "", why);
      assert.equal(sel(p as never).length, 0);
      assert.equal(TR.parseOptions({ range: kpRangeOptions(p as never), ...base }, NOW), null);
    }
    // Aralık kipinde gizli tek-an tarihi yarımsa aralık ENGELLENMEZ; tek-an kipinde eski kural aynen.
    const hidden = { ...ok0, kpMomentMode: "custom" as const, kpDate: "0002-10-07" };
    assert.equal(sel(hidden).length, 1);
    assert.match(missingReason("kp.transit", { ...hidden, kpTransitMode: "moment" }) ?? "", /KP tarihini/);
    // Konum tablosu tam 7 gün ve 92 gün Sub-Lord sınırda kabul.
    assert.equal(kpRangeIssue({ ...ok0, kpRangeKinds: ["positions"], kpRangeDays: 7 }), null);
    assert.equal(kpRangeIssue({ ...ok0, kpRangeDays: 92 }), null);
  });

  // ═══ B) Adaptörler fail-closed ════════════════════════════════════════════════
  const ex = { planet: "moon" as const, startDate: "2026-10-07", endDate: "2026-10-08" };
  const sub = syntheticSublordChanges({ planet: "Moon", startDate: ex.startDate, endDate: ex.endDate });
  const ras = syntheticRasiChanges({ planet: "Moon", startDate: "2026-10-01", endDate: "2026-10-31" });
  await t("B1 geçerli sentetik sub-lord + rasi yanıtı kabul edilir; Ay ≈ 9 sub-lord/gün, ≈ 2,3 günde bir rasi", () => {
    const r = projectRoxyKpSublordChanges(sub, ex);
    assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
    if (r.ok) assert.ok(r.part.changes.length >= 14 && r.part.changes.length <= 22, String(r.part.changes.length));
    const q = projectRoxyKpRasiChanges(ras, { planet: "moon", startDate: "2026-10-01", endDate: "2026-10-31" });
    assert.ok(q.ok, q.ok ? "" : q.errors.join("; "));
    if (q.ok) assert.ok(q.part.changes.length >= 12 && q.part.changes.length <= 15, String(q.part.changes.length));
  });
  const mutate = (fn: (r: J) => void, src: J = sub) => {
    const r = structuredClone(src);
    fn(r);
    return r;
  };
  await t("B2 sub-lord REDDİ: yanlış gezegen yankısı, sayım, KP komşuluğu, KP tablosu (sub/yıldız), zincir, pencere, sıra, biçim, satır sınırı", () => {
    const cases: [string, J][] = [
      ["gezegen", mutate((r) => (r.planet = "Sun"))],
      ["sayım", mutate((r) => (r.totalChanges += 1))],
      ["komşuluk", mutate((r) => (r.changes[0].toKp = (r.changes[0].fromKp % 249) + 3))],
      ["tablo sub", mutate((r) => (r.changes[1].toSublord = r.changes[1].toSublord === "Venus" ? "Mars" : "Venus"))],
      ["tablo yıldız", mutate((r) => (r.changes[1].toNakshatraLord = r.changes[1].toNakshatraLord === "Ketu" ? "Rahu" : "Ketu"))],
      ["zincir", mutate((r) => r.changes.splice(2, 1) && (r.totalChanges -= 1))],
      ["pencere", mutate((r) => (r.changes[r.changes.length - 1].datetime = "2026-10-09T01:00:00") && (r.changes[r.changes.length - 1].date = "2026-10-09") && (r.changes[r.changes.length - 1].time = "01:00"))],
      ["sıra", mutate((r) => ([r.changes[3].datetime, r.changes[4].datetime] = [r.changes[4].datetime, r.changes[3].datetime]))],
      ["biçim", mutate((r) => (r.changes[0].datetime = "07/10/2026 03:00"))],
      ["date↔datetime", mutate((r) => (r.changes[0].date = "2026-10-01"))],
    ];
    for (const [name, raw] of cases) {
      const r = projectRoxyKpSublordChanges(raw, ex);
      assert.equal(r.ok, false, `${name} kabul edildi`);
    }
    const huge = mutate((r) => {
      r.changes = Array.from({ length: KP_TIMING_MAX_ROWS + 1 }, () => r.changes[0]);
      r.totalChanges = r.changes.length;
    });
    const h = projectRoxyKpSublordChanges(huge, ex);
    assert.ok(!h.ok && h.errors.some((e) => /satır sınırı/.test(e)), "satır sınırı mesajı");
  });
  await t("B2b sağlayıcı kusuru (nakshatra başında 'aynı KP + aynı sub, yeni yıldız'): YALNIZ sonraki kayıt + KP tablosu tutarlıysa düzeltilir ve İŞARETLENİR; tutarsızsa RED", () => {
    // 2026-10-07 Ay: 92→93 Ketu→Venüs nakshatra geçişi (sentetik). Gerçek kusuru taklit et: toKp/toSublord eski değerde.
    const i = (sub.changes as J[]).findIndex((c) => c.fromNakshatraLord !== c.toNakshatraLord);
    assert.ok(i > 0 && i < sub.changes.length - 1, "örnek nakshatra geçişi");
    const bug = mutate((r) => {
      r.changes[i].toKp = r.changes[i].fromKp;
      r.changes[i].toSublord = r.changes[i].fromSublord;
    });
    const ok = projectRoxyKpSublordChanges(bug, ex);
    assert.ok(ok.ok, ok.ok ? "" : ok.errors.join("; "));
    if (ok.ok) {
      const c = ok.part.changes[i];
      assert.deepEqual(c.corrected, { providerToKp: sub.changes[i].fromKp, providerToSub: String(sub.changes[i].fromSublord).toLowerCase() });
      assert.equal(c.toKp, sub.changes[i].toKp);
      assert.equal(ok.part.changes.filter((x) => x.corrected).length, 1, "yalnız kusurlu satır işaretli");
    }
    const bug2 = mutate((r) => {
      r.changes[i].toKp = r.changes[i].fromKp;
      r.changes[i].toSublord = r.changes[i].fromSublord;
      r.changes[i + 1].fromKp = (r.changes[i + 1].fromKp % 249) + 1;
    });
    assert.equal(projectRoxyKpSublordChanges(bug2, ex).ok, false, "sonraki kayıt tutmuyorsa düzeltilmez");
  });
  await t("B2c düzeltme koruması: iki kanıttan biri eksik / tutarsızsa düzeltme YAPILMAZ ve sonuç RED (son satır, sonraki sub, yanlış yıldız, aynı yıldız)", () => {
    const i = (sub.changes as J[]).findIndex((c) => c.fromNakshatraLord !== c.toNakshatraLord);
    const stale = (r: J, k: number) => {
      r.changes[k].toKp = r.changes[k].fromKp;
      r.changes[k].toSublord = r.changes[k].fromSublord;
    };
    // a) Kusurlu satır aralığın SON satırı → sonraki kayıt (kanıt 2) yok → RED.
    const last = mutate((r) => {
      r.changes = r.changes.slice(0, i + 1);
      r.totalChanges = r.changes.length;
      stale(r, i);
    });
    assert.equal(projectRoxyKpSublordChanges(last, ex).ok, false, "son satır: tek kanıtla düzeltilmez");
    // b) Sonraki kaydın KP numarası doğru, sub'ı farklı → RED.
    const subX = mutate((r) => {
      stale(r, i);
      r.changes[i + 1].fromSublord = r.changes[i + 1].fromSublord === "Sun" ? "Moon" : "Sun";
    });
    assert.equal(projectRoxyKpSublordChanges(subX, ex).ok, false, "sonraki kayıt sub uyuşmazlığı");
    // c) Yeni yıldız lordu, komşu KP numarasının yıldızı değil (tablo kanıtı tutmuyor) → RED.
    const starX = mutate((r) => {
      stale(r, i);
      r.changes[i].toNakshatraLord = r.changes[i].toNakshatraLord === "Mars" ? "Rahu" : "Mars";
    });
    assert.equal(projectRoxyKpSublordChanges(starX, ex).ok, false, "yıldız tablo kanıtı tutmuyor");
    // d) Nakshatra içi (yıldız aynı) satırda aynı KP + aynı sub → kusur kalıbı değil, düzeltilmez → RED.
    const j = (sub.changes as J[]).findIndex((c, k) => k > 0 && k < sub.changes.length - 1 && c.fromNakshatraLord === c.toNakshatraLord);
    const inStar = mutate((r) => stale(r, j));
    assert.equal(projectRoxyKpSublordChanges(inStar, ex).ok, false, "yıldız değişmeyen satır düzeltilmez");
  });
  await t("B3 rasi REDDİ: komşu olmayan burç, yanlış burç yöneticisi, zincir", () => {
    const exR = { planet: "moon" as const, startDate: "2026-10-01", endDate: "2026-10-31" };
    for (const [name, raw] of [
      ["komşu değil", mutate((r) => (r.changes[0].toSign = "Pisces") && (r.changes[0].toSignLord = "Jupiter"), ras)],
      ["yönetici", mutate((r) => (r.changes[0].toSignLord = "Sun"), ras)],
      ["zincir", mutate((r) => r.changes.splice(1, 1) && (r.totalChanges -= 1), ras)],
    ] as [string, J][])
      assert.equal(projectRoxyKpRasiChanges(raw, exR).ok, false, name);
  });
  await t("B4 konum aralığı: geçerli kabul; nokta sayısı / an / KP lordu / ayanamsa yankısı bozuksa RED", () => {
    const body = { startDatetime: "2026-10-07T00:00:00", endDatetime: "2026-10-07T18:00:00", intervalMinutes: 360, ayanamsa: "kp-newcomb" };
    const syn = syntheticPlanetsInterval(body);
    const exP = { startUtc: body.startDatetime, endUtc: body.endDatetime, intervalMinutes: 360, ayanamsa: "kp-newcomb" as const };
    const ok = projectRoxyKpPlanetsRange(syn, exP);
    assert.ok(ok.ok, ok.ok ? "" : ok.errors.join("; "));
    if (ok.ok) assert.equal(ok.part.rows.length, 4);
    const m2 = (fn: (r: J) => void) => {
      const r = structuredClone(syn) as J;
      fn(r);
      return projectRoxyKpPlanetsRange(r, exP).ok;
    };
    assert.equal(m2((r) => r.intervals.pop()), false);
    assert.equal(m2((r) => (r.intervals[1].datetime = "2026-10-07T07:00:00")), false);
    assert.equal(m2((r) => (r.intervals[0].planets.Moon.sublord = r.intervals[0].planets.Moon.sublord === "Venus" ? "Mars" : "Venus")), false);
    assert.equal(m2((r) => (r.ayanamsa = "lahiri")), false);
  });

  // ═══ C) Sentetik üretici doğrulaması ═══════════════════════════════════════════
  await t("C1 sentetik konumlar gerçek golden KP konumlarıyla ≤0,01° ve KP numaraları birebir (9 graha)", () => {
    const s = syntheticPlanetsInterval({ startDatetime: "2026-10-07T09:00:00", endDatetime: "2026-10-07T09:00:00", intervalMinutes: 60, ayanamsa: "kp-newcomb" });
    for (const [n, p] of Object.entries(KPG.response.intervals[0].planets as Record<string, J>)) {
      const q = (s.intervals[0].planets as Record<string, J>)[n];
      assert.ok(Math.abs(q.longitude - p.longitude) <= 0.01, `${n} ${q.longitude} vs ${p.longitude}`);
      assert.equal(q.kpNumber, p.kpNumber, n);
    }
    assert.ok(Math.abs(kpNewcombApprox(Date.parse("2026-10-07T09:00:00Z")) - KPG.response.ayanamsaValue) < 1e-9);
  });
  await t("C2 sentetik geçiş anları: raporlanan dakikada gezegen yıldız/sub sınırını (veya burç sınırını) kesiyor (bağımsız tablo)", () => {
    for (const c of sub.changes as J[]) assert.ok(boundaryHit("moon", "sub", c), `${c.datetime} ${c.fromKp}→${c.toKp}`);
    for (const c of ras.changes as J[]) assert.ok(boundaryHit("moon", "rasi", c), `${c.datetime} ${c.fromSign}→${c.toSign}`);
  });

  // ═══ D) Uçtan uca ══════════════════════════════════════════════════════════════
  const store = createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
  const ctx = ctxOf(store);
  const pr = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
  const pid = (pr.body as J).profile.id;
  const calls: string[] = [];
  let failRasiSun = false;
  const deps: EngineDeps = {
    config: { apiKey: "k-test", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push(`${endpoint}:${String(body.planet ?? "")}`);
      if (failRasiSun && endpoint.endsWith("rasi-changes") && body.planet === "Sun") return { ok: false, kind: "server_error", status: 500, attempts: 1 };
      if (endpoint.endsWith("sublord-changes")) return { ok: true, raw: syntheticSublordChanges(body as J), attempts: 1 };
      if (endpoint.endsWith("rasi-changes")) return { ok: true, raw: syntheticRasiChanges(body as J), attempts: 1 };
      if (endpoint.endsWith("planets-interval")) return { ok: true, raw: syntheticPlanetsInterval(body as J), attempts: 1 };
      return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    now: () => NOW,
  };
  const SEL = { technique: "kp.transit", options: { range: { startDate: "2026-10-07", days: 3, planets: ["sun", "moon"], kinds: ["sublord", "rasi", "positions"], intervalMinutes: 360 }, ...base, displayTz: "Europe/Istanbul" } };
  let savedId = "";
  await t("D1 plan ücretsiz: 5 yeni istek (2 gezegen × 2 tür + konum); onay eşiği altında", async () => {
    const r = await planAstrology(ctx, { profileId: pid, selections: [SEL] });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    assert.equal((r.body as J).plan.newRequestCount, 5);
    assert.equal(calls.length, 0);
  });
  await t("D2 kısmi hata: Güneş rasi 500 → diğer 4 parça kaydedilir, eksik parça ADIYLA listelenir (sessiz düşürme yok)", async () => {
    failRasiSun = true;
    const r = await runAstrology(ctx, { profileId: pid, selections: [SEL] }, deps, { ownerPreviewHideInterp: false });
    failRasiSun = false;
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const it = (r.body as J).results[0];
    assert.ok(it.ok && it.partial);
    const tech = it.view.technical as KpTimingTechnical;
    assert.deepEqual(tech.missing, ["rasi:sun"]);
    assert.ok(it.view.warnings.some((w: string) => /KP zaman aralığı parçası hesaplanamadı/.test(w)));
  });
  await t("D2b kısmi sonuç KAYDEDİLEMEZ: eksik parça varken kayıt 409 RESULT_NOT_COMPUTED, kayıt yok, sağlayıcı isteği yok", async () => {
    const before = calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...SEL, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 409, JSON.stringify(sv.body).slice(0, 200));
    assert.equal((sv.body as J).error?.code ?? (sv.body as J).code, "RESULT_NOT_COMPUTED");
    assert.equal(calls.length, before, "kayıt denemesi sağlayıcıya gitmez");
    assert.equal(store.tables.astro_analyses?.length ?? 0, 0, "eksik sonuç analiz olarak yazılmadı");
  });
  await t("D3 yeniden çalıştır: yalnız eksik parça istenir (1 istek); birleşik teknik tam", async () => {
    const before = calls.length;
    const r = await runAstrology(ctx, { profileId: pid, selections: [SEL] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(calls.length - before, 1);
    const tech = (r.body as J).results[0].view.technical as KpTimingTechnical;
    assert.deepEqual(tech.missing, []);
    assert.equal(tech.sublord.length, 2);
    assert.equal(tech.rasi.length, 2);
    assert.equal(tech.positions!.rows.length, 12);
    assert.ok(tech.frame.ayanamsaDegrees !== null);
  });
  await t("D4 kaydet → yeniden aç 0 istek, teknik birebir; seçenekte gösterim saat dilimi", async () => {
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...SEL, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    savedId = (sv.body as J).analysisId;
    const before = calls.length;
    const a = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    const b = ((await getAnalysis(ctx, savedId, false)).body as J).analysis;
    assert.equal(JSON.stringify(a.technical), JSON.stringify(b.technical));
    assert.equal(a.params.displayTz, "Europe/Istanbul");
    assert.equal(calls.length, before);
  });
  await t("D5 Word + PDF: Sub-Lord / Rasi / konum tabloları, yerel saat + UTC, harita/'çizilemedi' YOK, 'otomatik yorum bulunmuyor' notu", async () => {
    const dx = await buildAnalysisReport(ctx, savedId, "docx", false);
    const px = await buildAnalysisReport(ctx, savedId, "pdf", false);
    assert.ok(dx.ok && px.ok);
    if (!dx.ok || !px.ok) return;
    assert.equal(dx.hasChart, false);
    const d = await docxText(dx.bytes);
    const p = await pdfInfo(px.bytes);
    const a = ((await getAnalysis(ctx, savedId, false)).body as J).analysis as J;
    const first = (a.technical as KpTimingTechnical).sublord[0].changes[0];
    for (const [label, txt] of [["docx", d], ["pdf", p.text]] as const) {
      for (const needle of ["Sub-Lord değişimleri", "Rasi (burç) geçişleri", "KP konum tablosu", "Europe/Istanbul", "UTC günleri", "Zaman aralığı", "otomatik yorum bulunmuyor", String(first.toKp)]) assert.ok(txt.includes(needle), `${label}: "${needle}" yok`);
      for (const bad of ["çizilemedi", "undefined", "NaN", "[object Object]"]) assert.ok(!txt.includes(bad), `${label}: ${bad}`);
    }
    const rep = buildAstroReport(a);
    for (const b of rep.blocks) if (b.kind === "table") for (const row of b.table.rows) assert.equal(row.length, b.table.columns.length, "satır/sütun uyumsuz");
  });

  // ═══ U) KP UX düzeltmeleri (2026-10-18; yalnız sunum — hesap / anlar / veri aynı) ═══════════════════════════
  await t("U1 KP-UX-06 harita açıklaması: ekran ile Word/PDF AYNI kaynak; cusp'sız (KP transit tek an) Placidus/cusp anlatmaz, cusp'lı harita aynen", () => {
    assert.equal(kpLegendFor(0), KP_TRANSIT_LEGEND);
    assert.equal(kpLegendFor(12), KP_LEGEND);
    assert.ok(!KP_TRANSIT_LEGEND.includes("Placidus") && !KP_TRANSIT_LEGEND.includes("Çerçeveli etiket"), "transit açıklaması cusp anlatmamalı");
    assert.ok(KP_TRANSIT_LEGEND.includes("ev başlangıcı (cusp) çizilmez"));
    assert.ok(KP_LEGEND.includes("Çerçeveli etiket = Placidus ev başlangıcı (cusp)"), "KP doğum / horary açıklaması korunmalı");
    // report8 harness'ın Word/PDF'te aradığı ifadelerle aynı (rapor metni değişmedi).
    assert.match(KP_TRANSIT_LEGEND, /^Burç kutuları sabit \(Güney Hindistan\)\. Gri etiket = graha/);
  });
  await t("U2 KP-UX-02 rapor 'Kip' satırı gerçekten seçilen içerikten: yalnız konum tablosu → 'geçişleri' YOK; Sub-Lord + Rasi → eski başlık aynen", async () => {
    assert.equal(kpTimingModeLabel(["sublord", "rasi"]), "Zaman aralığı (Sub-Lord / Rasi geçişleri)");
    assert.equal(kpTimingModeLabel(["positions"]), "Zaman aralığı (KP konum tablosu)");
    assert.equal(kpTimingModeLabel(["sublord"]), "Zaman aralığı (Sub-Lord geçişleri)");
    assert.equal(kpTimingModeLabel(["rasi", "positions"]), "Zaman aralığı (Rasi geçişleri + KP konum tablosu)");
    assert.equal(kpTimingModeLabel(["sublord", "rasi", "positions"]), "Zaman aralığı (Sub-Lord / Rasi geçişleri + KP konum tablosu)");
    assert.equal(kpTimingModeLabel([]), "Zaman aralığı", "türü olmayan eski/eksik kayıt güvenli");
    const POS = { technique: "kp.transit", options: { range: { startDate: "2026-10-07", days: 7, planets: [], kinds: ["positions"], intervalMinutes: 360 }, ...base, displayTz: "Europe/Istanbul" } };
    const r = await runAstrology(ctx, { profileId: pid, selections: [POS] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...POS, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis as J;
    const kv = buildAstroReport(a).blocks.flatMap((b) => (b.kind === "kv" ? b.rows : []));
    assert.deepEqual(kv.find(([k]) => k === "Kip"), ["Kip", "Zaman aralığı (KP konum tablosu)"]);
    assert.equal(a.technical.positions.rows.length, 28, "7 gün × 6 saat = 28 an (veri aynı)");
  });
  await t("U3 KP-UX-03 Word/PDF UTC sütunu TAM tarih + saat; yerel tarih ≠ UTC tarihi olan satır doğru gün; anlar değişmedi", async () => {
    const a = ((await getAnalysis(ctx, savedId, false)).body as J).analysis as J;
    const tables = buildAstroReport(a).blocks.filter((b) => b.kind === "table" && /^UTC/.test(b.table.columns[b.table.columns.length - 1])) as Extract<ReturnType<typeof buildAstroReport>["blocks"][number], { kind: "table" }>[];
    assert.equal(tables.length, 2, "Sub-Lord + Rasi tablolarında UTC sütunu");
    let crossDay = 0;
    for (const tb of tables) {
      assert.equal(tb.table.columns[tb.table.columns.length - 1], "UTC (tarih ve saat)");
      for (const row of tb.table.rows) {
        const utc = String(row[row.length - 1]);
        assert.match(utc, /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} UTC$/, utc);
        if (String(row[0]).slice(0, 10) !== utc.slice(0, 10)) crossDay++;
      }
    }
    assert.ok(crossDay > 0, "İstanbul'da 21:00–23:59 UTC olayı yerelde ertesi gün (senaryo kapsandı)");
    // Kanonik an aynı: tablodaki UTC metni, kaydın atUtc değerinin birebir biçimi.
    const ch = (a.technical as KpTimingTechnical).sublord.flatMap((x) => x.changes).sort((p, q) => p.atUtc.localeCompare(q.atUtc));
    const sub = tables[0].table.rows;
    assert.equal(sub.length, ch.length);
    ch.forEach((c, i) => assert.equal(sub[i][sub[i].length - 1], `${c.atUtc.slice(8, 10)}.${c.atUtc.slice(5, 7)}.${c.atUtc.slice(0, 4)} ${c.atUtc.slice(11, 16)} UTC`));
    // Word ve PDF aynı tam UTC metnini taşır.
    const dx = await buildAnalysisReport(ctx, savedId, "docx", false);
    const px = await buildAnalysisReport(ctx, savedId, "pdf", false);
    assert.ok(dx.ok && px.ok);
    if (!dx.ok || !px.ok) return;
    const d = await docxText(dx.bytes);
    const p = (await pdfInfo(px.bytes)).text;
    const sample = String(sub[sub.length - 1][sub[0].length - 1]);
    assert.ok(d.includes(sample) && p.includes(sample), `Word/PDF'te '${sample}' yok`);
    assert.ok(d.includes("UTC (tarih ve saat)") && p.includes("UTC (tarih ve saat)"));
  });

  // ═══ E) Boyut ═════════════════════════════════════════════════════════════════
  await t("E1 92 gün Ay Sub-Lord: satır < sınır, teknik katman < 1 MB; tek-an seçimleri etkilenmez", () => {
    const big = syntheticSublordChanges({ planet: "Moon", startDate: "2026-10-01", endDate: "2026-12-31" });
    const r = projectRoxyKpSublordChanges(big, { planet: "moon", startDate: "2026-10-01", endDate: "2026-12-31" });
    assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
    if (!r.ok) return;
    assert.ok(r.part.changes.length > 700 && r.part.changes.length < KP_TIMING_MAX_ROWS, String(r.part.changes.length));
    const bytes = Buffer.byteLength(JSON.stringify(r.part));
    assert.ok(bytes < 1_000_000, `${bytes} bayt`);
    console.log(`     (92 gün Ay: ${r.part.changes.length} geçiş, ${Math.round(bytes / 1024)} KB)`);
  });

  // ═══ G) GERÇEK golden (owner onaylı ≤10 çağrı) — varsa doğrula, yoksa AÇIKÇA ATLA ═════════════════════════
  const G = (n: string) => {
    const p = join(__dirname, "fixtures", "golden", `${n}.json`);
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  };
  const REAL: { name: string; kind: "sublord" | "rasi" | "positions"; planet?: KpTimingPlanet; required: boolean }[] = [
    { name: "kp-sublord-moon", kind: "sublord", planet: "moon", required: true },
    { name: "kp-rasi-moon", kind: "rasi", planet: "moon", required: true },
    { name: "kp-planets-range", kind: "positions", required: true },
    { name: "kp-sublord-venus-retro", kind: "sublord", planet: "venus", required: false },
    { name: "kp-rasi-mercury-92d", kind: "rasi", planet: "mercury", required: false },
    { name: "kp-planets-7d-kpold", kind: "positions", required: false },
    { name: "kp-sublord-moon-92d", kind: "sublord", planet: "moon", required: false },
    { name: "kp-rasi-mercury-retro-2027", kind: "rasi", planet: "mercury", required: false },
    { name: "kp-planets-kpold-1950", kind: "positions", required: false },
  ];
  const gb = G("kp-rasi-moon-berlin-dst");
  const gu = G("kp-rasi-moon");
  if (gb && gu)
    await t("G DST (gerçek): sağlayıcı IANA bölgede aralık başının ofsetini (+2) 25.10.2026 saat geri alımından SONRA da uygular → yerel saat 1 sa kayar; ürünün UTC + an-başına çeviri tasarımı doğru (GMT+1)", () => {
      let after = 0;
      for (const c of gb.response.changes as J[]) {
        const x = (gu.response.changes as J[]).find((y) => y.toSign === c.toSign && y.date >= "2026-10-19");
        assert.ok(x, `UTC eşleşmesi yok: ${c.datetime}`);
        assert.equal((Date.parse(`${c.datetime}Z`) - Date.parse(`${x.datetime}Z`)) / 3600e3, 2, "sağlayıcı tek ofset (+2)");
        const real = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" }).formatToParts(new Date(`${x.datetime}Z`)).find((p) => p.type === "timeZoneName")!.value;
        if (x.datetime >= "2026-10-25T01:00") {
          after += 1;
          assert.equal(real, "GMT+1", "geri alımdan sonra gerçek ofset +1");
        }
      }
      assert.ok(after >= 3, `geri alım sonrası örnek: ${after}`);
    });
  const g92 = G("kp-sublord-moon-92d");
  if (g92)
    await t("G uçtan uca (GERÇEK 92 gün Ay): ürün gövdesi = gerçek gövde; çalıştır → kaydet → Word + PDF; düzeltilen satırlar '*' + açıklama; boyut < 1 MB", async () => {
      const store2 = createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
      const c2 = ctxOf(store2);
      const p2 = await createAstroProfile(c2, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
      const pid2 = (p2.body as J).profile.id;
      const sel = { technique: "kp.transit", options: { range: { startDate: "2026-10-01", days: 92, planets: ["moon"], kinds: ["sublord"] }, ...base, displayTz: "Europe/Istanbul" } };
      const sent: J[] = [];
      const d2: EngineDeps = {
        ...deps,
        callProvider: async (_c, endpoint, body) => {
          sent.push(body);
          return endpoint === g92.endpoint && JSON.stringify(body) === JSON.stringify(g92.body) ? { ok: true, raw: structuredClone(g92.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        },
      };
      const r = await runAstrology(c2, { profileId: pid2, selections: [sel] }, d2, { ownerPreviewHideInterp: false });
      assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0], g92.body, "ürün gövdesi gerçek golden gövdesiyle birebir");
      const tech = (r.body as J).results[0].view.technical as KpTimingTechnical;
      assert.equal(tech.sublord[0].changes.length, 824);
      assert.equal(tech.sublord[0].changes.filter((c) => c.corrected).length, 7);
      assert.ok(Buffer.byteLength(JSON.stringify(tech)) < 1_000_000);
      const sv = await saveAnalysis(c2, { profileId: pid2, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, JSON.stringify(sv.body).slice(0, 200));
      const id = (sv.body as J).analysisId;
      const dx = await buildAnalysisReport(c2, id, "docx", false);
      const px = await buildAnalysisReport(c2, id, "pdf", false);
      assert.ok(dx.ok && px.ok);
      if (!dx.ok || !px.ok) return;
      const d = await docxText(dx.bytes);
      const p = await pdfInfo(px.bytes);
      for (const [label, txt] of [["docx", d], ["pdf", p.text]] as const) {
        assert.ok(txt.includes("Sub-Lord değişimleri (824)"), `${label}: başlık`);
        assert.ok(txt.includes("Sağlayıcı bu geçişte yeni KP numarasını"), `${label}: düzeltme açıklaması`);
        assert.ok(!txt.includes("undefined") && !txt.includes("NaN"));
      }
      console.log(`     (gerçek 92 gün raporu: PDF ${p.pages} sayfa, ${Math.round(px.bytes.length / 1024)} KB; Word ${Math.round(dx.bytes.length / 1024)} KB)`);
      assert.equal(sent.length, 1, "kayıt + rapor sağlayıcı çağırmadı");
    });
  if (g92)
    await t("G düzeltme koruması (GERÇEK 92 gün): 7 kusurlu satırın HER BİRİ için sağlayıcının sonraki kaydı bozulursa düzeltme yapılmaz, sonuç RED; kusurlu satır sonda kalırsa RED", () => {
      const ex92 = { planet: "moon" as const, startDate: String(g92.body.startDate), endDate: String(g92.body.endDate) };
      const raw = g92.response as J;
      const bad = (raw.changes as J[]).map((c, k) => (c.fromKp === c.toKp ? k : -1)).filter((k) => k >= 0);
      assert.equal(bad.length, 7, "gerçek yanıtta 7 kusurlu satır");
      for (const k of bad) {
        assert.ok(k < raw.changes.length - 1, "gerçek kusurlu satırların hepsinin sonraki kaydı var");
        const m = structuredClone(raw) as J;
        m.changes[k + 1].fromKp = (m.changes[k + 1].fromKp % 249) + 1;
        assert.equal(projectRoxyKpSublordChanges(m, ex92).ok, false, `satır ${k}: sonraki kayıt bozuk → RED`);
        const cut = structuredClone(raw) as J;
        cut.changes = cut.changes.slice(0, k + 1);
        cut.totalChanges = cut.changes.length;
        assert.equal(projectRoxyKpSublordChanges(cut, ex92).ok, false, `satır ${k}: son satır → RED`);
      }
    });
  const gm = G("kp-rasi-mercury-retro-2027");
  if (gm)
    await t("G Merkür retro burç geri dönüşü (GERÇEK, 2027): Oğlak→Kova, retro Kova→Oğlak, ileri Oğlak→Kova; dönüş anında hareket bağımsız astronomiyle GERİ", () => {
      const r = projectRoxyKpRasiChanges(gm.response, { planet: "mercury", startDate: String(gm.body.startDate), endDate: String(gm.body.endDate) });
      assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
      if (!r.ok) return;
      assert.deepEqual(r.part.changes.map((c) => `${c.fromRashi}>${c.toRashi}`), ["capricorn>aquarius", "aquarius>capricorn", "capricorn>aquarius"]);
      const speed = (iso: string) => {
        const ms = Date.parse(`${iso}Z`);
        return ((siderealLon("mercury", ms + 3600e3) - siderealLon("mercury", ms - 3600e3) + 540) % 360) - 180;
      };
      const sp = r.part.changes.map((c) => speed(String(c.atUtc).slice(0, 19)));
      assert.ok(sp[0] > 0 && sp[1] < 0 && sp[2] > 0, `hız işaretleri ${sp.map((x) => x.toFixed(4)).join(", ")}`);
      // Bağımsız ikinci referans: Swiss Ephemeris 2.10.03 (Moshier, SE_SIDM_KRISHNAMURTI, kendi ayanamsası; Roxy değeri KULLANILMADI),
      // 17.10.2026 çevrimdışı hesap: 2027-01-27T20:32:02, 2027-02-24T01:51:20, 2027-03-11T20:22:02 UTC.
      const SE = ["2027-01-27T20:32:02", "2027-02-24T01:51:20", "2027-03-11T20:22:02"];
      r.part.changes.forEach((c, k) => assert.ok(Math.abs(Date.parse(String(c.atUtc).slice(0, 19) + "Z") - Date.parse(`${SE[k]}Z`)) <= 120e3, `SE farkı ${k}`));
    });
  const ko26 = G("kp-planets-7d-kpold");
  const ko50 = G("kp-planets-kpold-1950");
  if (ko26 && ko50)
    await t("G KP-Old ayanamsa tarih bağımlılığı (GERÇEK 1950 + 2026): değer zamanla presesyon hızında artar; bağımsız Swiss Ephemeris Krishnamurti ile ≤0,002°", () => {
      const a26 = Number(ko26.response.ayanamsaValue);
      const a50 = Number(ko50.response.ayanamsaValue);
      const yrs = (Date.parse("2026-10-07T00:00:00Z") - Date.parse("1950-01-01T00:00:00Z")) / (365.25 * 86_400_000);
      const rate = ((a26 - a50) / yrs) * 3600;
      assert.ok(rate > 50.0 && rate < 50.8, `yıllık artış ${rate.toFixed(3)}″ (presesyon ≈50,3″)`);
      // Bağımsız kaynak: Swiss Ephemeris 2.10.03 SE_SIDM_KRISHNAMURTI (J1900 22,363889°, Newcomb presesyonu; nütasyonlu),
      // 17.10.2026 çevrimdışı hesap. Sağlayıcı formülü bununla BİREBİR değil (fark −0,0012° / −0,0002°) → açık risk notu.
      const SE = { y2026: 24.136515, y1950: 23.060955 };
      assert.ok(Math.abs(a26 - SE.y2026) <= 0.002 && Math.abs(a50 - SE.y1950) <= 0.002, `SE farkı ${(a26 - SE.y2026).toFixed(4)} / ${(a50 - SE.y1950).toFixed(4)}`);
      console.log(`     (KP-Old: 1950 ${a50} · 2026 ${a26} · yıllık ${rate.toFixed(2)}″ · SE Krishnamurti farkı ${(a50 - SE.y1950).toFixed(4)}° / ${(a26 - SE.y2026).toFixed(4)}°)`);
    });
  let skip = 0;
  for (const g of REAL) {
    const f = G(g.name);
    if (!f) {
      if (g.required) {
        skip += 1;
        console.log(`SKIP G ${g.name}: gerçek sağlayıcı golden'ı yok — bu uç GERÇEK yanıtla doğrulanmadı.`);
      }
      continue;
    }
    if (g.kind === "positions") {
      await t(`G ${g.name}: gerçek konum aralığı adaptörden geçer; her graha bağımsız astronomiyle (tropikal − yanıttaki ayanamsa) ≤0,01°, KP lordları bağımsız tabloyla`, () => {
        const ay = f.body.ayanamsa as "kp-newcomb" | "kp-old";
        const r = projectRoxyKpPlanetsRange(f.response, { startUtc: String(f.body.startDatetime), endUtc: String(f.body.endDatetime), intervalMinutes: Number(f.body.intervalMinutes), ayanamsa: ay });
        assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
        if (!r.ok) return;
        const ayDeg = Number(f.response.ayanamsaValue);
        let worst = 0;
        for (const row of r.part.rows) {
          const ms = Date.parse(row.atUtc);
          for (const b of row.bodies) {
            const trop = siderealLon(b.id, ms) + kpNewcombApprox(ms);
            const d = Math.abs(((b.longitude - (trop - ayDeg) + 540) % 360) - 180);
            worst = Math.max(worst, d);
            assert.ok(d <= 0.01, `${b.id} @ ${row.atUtc}: ${d.toFixed(4)}°`);
          }
        }
        console.log(`     (${g.name}: ${r.part.rows.length} an × 9 graha, en büyük sapma ${worst.toFixed(4)}°, ayanamsa ${ay} ${ayDeg})`);
      });
      continue;
    }
    await t(`G ${g.name}: gerçek ${g.kind === "sublord" ? "sub-lord" : "rasi"} yanıtı adaptörden geçer; her geçişte raporlanan dakikada gezegen sınırı bağımsız astronomiyle kesiyor; sentetik referansla aynı geçiş dizisi`, () => {
      const ex = { planet: g.planet!, startDate: String(f.body.startDate), endDate: String(f.body.endDate) };
      const r = g.kind === "sublord" ? projectRoxyKpSublordChanges(f.response, ex) : projectRoxyKpRasiChanges(f.response, ex);
      assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
      if (!r.ok) return;
      // Adaptör çıktısı (sağlayıcı kusuru düzeltilmiş ve işaretli) bağımsız referansla karşılaştırılır.
      const rows = (r.part.changes as J[]).map((c) => ({ ...c, datetime: String(c.atUtc).slice(0, 19), toSign: c.toRashi }));
      for (const c of rows) assert.ok(boundaryHit(g.planet!, g.kind === "sublord" ? "sub" : "rasi", c), `${c.datetime}: sınır bu dakikada kesilmiyor`);
      const syn = (g.kind === "sublord" ? syntheticSublordChanges(f.body as J) : syntheticRasiChanges(f.body as J)).changes as J[];
      const realSeq = rows.map((c) => (g.kind === "sublord" ? `${c.fromKp}>${c.toKp}` : `${c.fromRashi}>${c.toRashi}`));
      const synSeq = syn.map((c) => (g.kind === "sublord" ? `${c.fromKp}>${c.toKp}` : `${String(c.fromSign).toLowerCase()}>${String(c.toSign).toLowerCase()}`));
      assert.deepEqual(realSeq, synSeq, "geçiş dizisi");
      const dts = rows.map((c, i) => Math.abs(Date.parse(`${c.datetime}Z`) - Date.parse(`${syn[i].datetime}Z`)) / 1000);
      const fixedN = rows.filter((c) => c.corrected).length;
      console.log(`     (${g.name}: ${realSeq.length} geçiş · sentetik referansla en büyük zaman farkı ${Math.max(0, ...dts)} sn${fixedN ? ` · sağlayıcı kusuru düzeltilen ${fixedN} satır (işaretli)` : ""})`);
    });
  }

  console.log(`\nastrology transit03 harness: ${pass} PASS / ${fail} FAIL${skip ? ` / ${skip} SKIP (gerçek golden yok)` : ""}`);
  if (fail > 0) process.exit(1);
}

void main();
