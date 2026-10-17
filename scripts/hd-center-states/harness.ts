/**
 * HD-UZMAN-01 — Tanımlı / Tanımsız / Açık merkez sınıflandırması harness'i (SAF; gerçek DB / ağ YOK).
 *
 *   A) Merkez doğruluğu — 9 merkez × 3 durum, kanıt kuralları, eksik/bozuk/çelişkili veri → "Doğrulanamadı"
 *   B) Şema — yeni yanıtta eksik centers[].gates RED; kayıtlı eski yanıt açılmaya devam eder
 *   C) Bilgi Bankası — 27 seçenek, kayıt/düzenleme/yeniden açma, mükerrer kod, eski acik_* kayıtları,
 *      kesin kayıt önceliği, Tanımsız↔Açık çapraz eşleşme yok, tenant izolasyonu
 *   D) Yüzey tutarlılığı — harita kartı = Bilgi Bankası = Sistem Yorumu = Word snapshot
 *   E) Roxy kredisi — görüntüleme/eşleştirme/Word hazırlığında 0 sağlayıcı çağrısı
 *
 * Çalıştır: npx tsx scripts/hd-center-states/harness.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ── E) Roxy kredisi: global fetch sayacı (her şeyden ÖNCE) ──
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  fetchCalls++;
  void args;
  throw new Error("harness: ağ çağrısı YASAK");
}) as typeof fetch;

import {

  classifyComputedChartCenters,
  classifyChartRowCenters,
  centerStateMap,
  completeActivationGates,
  hdGateCenterCode,
  HD_CENTER_CODES,
  HD_CENTER_STATE_LABEL,
  HD_CENTER_STATE_EN,
  type HdCenterState,
} from "../../lib/human-design/chart/centerStates";
import { nonDefinedCenterLabels } from "../../lib/human-design/chart/centerStateLabels";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph, type RoxyNormalizeInput } from "../../lib/human-design/providers/roxy/normalize";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { extractSystemReading } from "../../lib/human-design/providers/roxy/systemReading";
import { CHANNELS, getActiveGates, getDefinedCenters, getDefinedChannels, GATE_CENTER } from "../../lib/human-design/engine/channels";
import { computeHumanDesignChart } from "../../lib/human-design/engine";
import type { HdComputedChart } from "../../lib/human-design/chart/computedChart";
import { computedChartAppCodes } from "../../lib/human-design/chart/computedChart";
import {
  buildKnowledgeCodeFromValue,
  deriveStructuredValue,
  getStructuredCategoryOptions,
  getStructuredCategoryOptionsForEdit,

} from "../../lib/human-design/codeHelpers";
import { buildExpertKnowledgeCodes, centerKnowledgeCodes, APP_CENTER_TO_ENGINE_CENTER } from "../../lib/human-design/normalize/hdAppCodes";
import { dedupeCenterKnowledge, hdKnowledgeDisplayTitle, isLegacyCenterKnowledgeCode, HD_LEGACY_CENTER_NOTE } from "../../lib/human-design/knowledge/centerKnowledge";
import { sortHdKnowledgeRecords } from "../../lib/human-design/knowledge/hdKnowledgeSort";
import { insertKnowledge, listKnowledgeByCodes, listKnowledgeForReport, updateKnowledge } from "../../lib/human-design/api/knowledgePersistence";
import { buildReportSnapshotV2 } from "../../lib/human-design/reporting/reportSnapshotV2";
import { buildCodesFromChart } from "../../app/human-design/rapor-olustur/helpers/hdRapor";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { HdSystemReadingView } from "../../app/human-design/kayitli-haritalar/components/HdSystemReadingPanel";
import { isHdCanonicalKey } from "../../lib/human-design/knowledge-system/canonicalKeys";
import { createFakeDb } from "../hd-roxy/fakeDb";
import type { HdCenterCode, HumanDesignChart } from "../../lib/human-design/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const FIXTURE = JSON.parse(read("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json")) as Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ FAIL: ${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n[${t}]`);

const PLANETS = ["Sun", "Earth", "Moon", "NorthNode", "SouthNode", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
type Act = { body: string; side: "personality" | "design"; gate: number; line: number };
/** 26 aktivasyon; verilen kapılar sırayla dağıtılır, kalanlar ilk kapıyı tekrarlar. */
function acts(gates: number[]): Act[] {
  const out: Act[] = [];
  let i = 0;
  for (const side of ["personality", "design"] as const) {
    for (const body of PLANETS) out.push({ body, side, gate: gates[i++ % gates.length], line: 1 });
  }
  return out;
}
const ENGINE_TO_APP = Object.fromEntries(Object.entries(APP_CENTER_TO_ENGINE_CENTER).map(([a, e]) => [e, a])) as Record<string, HdCenterCode>;
/** Bağımsız beklenen değer (testin kendi hesabı; sınıflandırıcıyı kullanmaz). */
function expected(gates: number[]): Record<HdCenterCode, HdCenterState> {
  const active = [...new Set(gates)];
  const definedEng = new Set<string>();
  for (const ch of CHANNELS) if (active.includes(ch.gateA) && active.includes(ch.gateB)) { definedEng.add(ch.centerA); definedEng.add(ch.centerB); }
  const out = {} as Record<HdCenterCode, HdCenterState>;
  for (const code of HD_CENTER_CODES) {
    const eng = APP_CENTER_TO_ENGINE_CENTER[code];
    const inCenter = active.filter((g) => GATE_CENTER[g] === eng);
    out[code] = definedEng.has(eng) ? "defined" : inCenter.length > 0 ? "undefined" : "open";
  }
  return out;
}
/** Kayıtlı computed_result benzeri nesne (Roxy appCodes biçimi). */
function computedFrom(gates: number[], over: Partial<Record<string, unknown>> = {}): HdComputedChart {
  const a = acts(gates);
  const active = getActiveGates(a);
  const chans = getDefinedChannels(active);
  const def = getDefinedCenters(chans);
  const defApp = def.map((c) => ENGINE_TO_APP[c]);
  return {
    activations: a,
    centers: { defined: def, open: Object.values(APP_CENTER_TO_ENGINE_CENTER).filter((c) => !def.includes(c as never)) },
    channels: chans.map((c) => ({ id: c.id, name: c.name, gates: [c.gateA, c.gateB], centers: [c.centerA, c.centerB] })),
    appCodes: {
      type_code: null, authority_code: null, profile_code: null, definition_code: null,
      active_centers: defApp,
      open_centers: HD_CENTER_CODES.filter((c) => !defApp.includes(c)),
      gates: active,
      channels: chans.map((c) => c.id),
    },
    ...over,
  } as unknown as HdComputedChart;
}

const NORM_INPUT: RoxyNormalizeInput = {
  date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784,
  nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z",
};

async function main() {
  // ─────────────────────────────────────────────────────────────────────────
  section("A1 — Gerçek Roxy fixture (2018-07-20)");
  const v = validateRoxyBodygraph(FIXTURE);
  ok("A1.0 fixture ingest doğrulamasından geçer", v.ok);
  const n = v.ok ? normalizeRoxyBodygraph(v.value, NORM_INPUT) : null;
  ok("A1.1 fixture normalize edilir (merkez kapıları aktivasyonlarla birebir)", !!n && n.ok, n && !n.ok ? n.errors : undefined);
  if (!n || !n.ok) throw new Error("fixture normalize edilemedi");
  const fx = centerStateMap(classifyComputedChartCenters(n.chart));
  ok("A1.2 Baş Tanımlı", fx.head === "defined");
  ok("A1.3 G / Kimlik Tanımsız (aktif kapı 1)", fx.g_identity === "undefined" && classifyComputedChartCenters(n.chart).states.g_identity.gates?.join() === "1");
  ok("A1.4 Kalp / Ego Açık (aktif kapı yok)", fx.heart_ego === "open");
  ok("A1.5 Solar Pleksus Açık (aktif kapı yok)", fx.solar_plexus === "open");
  ok("A1.6 diğer 5 merkez Tanımlı (Ajna, Boğaz, Sakral, Dalak, Kök)", ["ajna", "throat", "sacral", "spleen", "root"].every((c) => fx[c as HdCenterCode] === "defined"));
  // Roxy'nin kendi centers[].gates'i ile birebir
  for (const c of FIXTURE.centers as Array<Record<string, unknown>>) {
    const code = ({ g: "g_identity", heart: "heart_ego", "solar-plexus": "solar_plexus" } as Record<string, string>)[c.id as string] ?? (c.id as string);
    const st = classifyComputedChartCenters(n.chart).states[code as HdCenterCode];
    ok(`A1.7 ${c.id}: Roxy gates [${(c.gates as number[]).join(",")}] = aktivasyonlardan [${st.gates?.join(",")}]`, (c.gates as number[]).slice().sort((a, b) => a - b).join() === st.gates!.join());
  }
  ok("A1.8 sağlayıcı çapraz denetimiyle aynı sonuç", JSON.stringify(centerStateMap(classifyComputedChartCenters(n.chart, FIXTURE.centers))) === JSON.stringify(fx));

  // ─────────────────────────────────────────────────────────────────────────
  section("A2 — 9 merkez × 3 durum (deterministik geniş tarama, bağımsız beklenen değer)");
  const coverage = new Map<string, number>();
  let mismatches = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 3000; t++) {
    const k = 1 + Math.floor(rnd() * 26);
    const gates = Array.from({ length: k }, () => 1 + Math.floor(rnd() * 64));
    const got = centerStateMap(classifyComputedChartCenters(computedFrom(gates)));
    const exp = expected(gates);
    for (const c of HD_CENTER_CODES) {
      coverage.set(`${c}:${got[c]}`, (coverage.get(`${c}:${got[c]}`) ?? 0) + 1);
      if (got[c] !== exp[c]) mismatches++;
    }
  }
  ok("A2.1 3000 rastgele harita × 9 merkez: sınıflandırıcı = bağımsız hesap (0 uyuşmazlık)", mismatches === 0, mismatches);
  for (const c of HD_CENTER_CODES) {
    ok(`A2.2 ${c}: Tanımlı / Tanımsız / Açık durumlarının üçü de üretildi`, ["defined", "undefined", "open"].every((s) => (coverage.get(`${c}:${s}`) ?? 0) > 0), ["defined", "undefined", "open"].map((s) => coverage.get(`${c}:${s}`) ?? 0));
  }
  ok("A2.3 tam ve tutarlı veride hiç 'Doğrulanamadı' yok", ![...coverage.keys()].some((k) => k.endsWith(":unverified")));

  section("A3 — Açık kural örnekleri");
  // 64 Baş → Baş: Tanımsız, tek kapı; 64+61+63 → Baş Tanımsız, çok kapı; 64-47 kanalı → Baş+Ajna Tanımlı
  const one = classifyComputedChartCenters(computedFrom([64])).states;
  ok("A3.1 defined=false + tek kapı → Tanımsız", one.head.state === "undefined" && one.head.gates?.join() === "64");
  const many = classifyComputedChartCenters(computedFrom([64, 61, 63])).states;
  ok("A3.2 defined=false + birden fazla kapı → Tanımsız", many.head.state === "undefined" && many.head.gates?.join() === "61,63,64");
  ok("A3.3 defined=false + sıfır kapı → Açık", one.ajna.state === "open" && one.ajna.gates?.length === 0);
  const def = classifyComputedChartCenters(computedFrom([64, 47])).states;
  ok("A3.4 defined=true → Tanımlı (64-47 kanalı: Baş + Ajna)", def.head.state === "defined" && def.ajna.state === "defined" && def.throat.state === "open");
  ok("A3.5 etiketler: Tanımlı / Tanımsız / Açık (\"Tamamen Açık\" YOK) + İngilizce karşılıklar", HD_CENTER_STATE_LABEL.defined === "Tanımlı" && HD_CENTER_STATE_LABEL.undefined === "Tanımsız" && HD_CENTER_STATE_LABEL.open === "Açık" && HD_CENTER_STATE_EN.open === "Completely Open" && HD_CENTER_STATE_EN.undefined === "Undefined" && HD_CENTER_STATE_EN.defined === "Defined" && !Object.values(HD_CENTER_STATE_LABEL).some((l) => /Tamamen/.test(l)));
  ok("A3.6 64 kapının tamamı tek merkeze bağlı (engine topolojisi)", Array.from({ length: 64 }, (_, i) => hdGateCenterCode(i + 1)).every((c) => c !== null));

  // ─────────────────────────────────────────────────────────────────────────
  section("A4 — Eksik / bozuk / çelişkili veri → Doğrulanamadı (ASLA kendiliğinden Açık)");
  const base = computedFrom([64, 47, 1]);
  const neverOpen = (m: Record<HdCenterCode, HdCenterState>) => !Object.values(m).includes("open");
  const allUnv = (m: Record<HdCenterCode, HdCenterState>) => Object.values(m).every((s) => s === "unverified");
  const pc = (mut: (c: Array<Record<string, unknown>>) => void) => {
    const centers = clone(FIXTURE.centers) as Array<Record<string, unknown>>;
    mut(centers);
    return centerStateMap(classifyComputedChartCenters(n.chart, centers));
  };
  const gOnly = (m: Record<HdCenterCode, HdCenterState>) => m.g_identity;
  ok("A4.1 sağlayıcı gates alanı HİÇ yok → aktivasyon kanıtı (eski kayıt açılır)", JSON.stringify(pc((cs) => cs.forEach((c) => delete c.gates))) === JSON.stringify(fx));
  ok("A4.2 gates: null → o merkez Doğrulanamadı (boş liste sayılmaz)", pc((cs) => { cs.find((c) => c.id === "heart")!.gates = null; }).heart_ego === "unverified");
  ok("A4.3 gates dizi değil → Doğrulanamadı", pc((cs) => { cs.find((c) => c.id === "heart")!.gates = "21"; }).heart_ego === "unverified");
  ok("A4.4 geçersiz kapı numarası (65 / 0 / 1.5 / '1') → Doğrulanamadı", [65, 0, 1.5, "1"].every((bad) => gOnly(pc((cs) => { cs.find((c) => c.id === "g")!.gates = [bad]; })) === "unverified"));
  ok("A4.5 başka merkezin kapısı (G'de 64) → Doğrulanamadı", gOnly(pc((cs) => { cs.find((c) => c.id === "g")!.gates = [64]; })) === "unverified");
  ok("A4.6 sağlayıcı kapıları aktivasyonla uyuşmaz (Kalp'te 21 iddiası) → Doğrulanamadı, Açık DEĞİL", pc((cs) => { cs.find((c) => c.id === "heart")!.gates = [21]; }).heart_ego === "unverified");
  ok("A4.7 sağlayıcı defined uyuşmaz → Doğrulanamadı", pc((cs) => { cs.find((c) => c.id === "heart")!.defined = true; }).heart_ego === "unverified");
  ok("A4.8 eksik merkez (8 merkez) → tümü Doğrulanamadı", allUnv(pc((cs) => { cs.pop(); })));
  ok("A4.9 bozuk merkez kimliği → tümü Doğrulanamadı", allUnv(pc((cs) => { cs[0].id = "xyz"; })));
  ok("A4.10 mükerrer merkez kimliği → tümü Doğrulanamadı", allUnv(pc((cs) => { cs[1].id = cs[0].id; })));
  // Kayıtlı listeler ↔ aktivasyon
  const mut = (f: (c: Record<string, unknown>) => void) => {
    const c = clone(base) as unknown as Record<string, unknown>;
    f(c);
    return centerStateMap(classifyComputedChartCenters(c));
  };
  ok("A4.11 aktif kapı listesi uyuşmaz (gezegensel aktivasyon uyuşmazlığı) → Doğrulanamadı", allUnv(mut((c) => { (c.appCodes as Record<string, unknown>).gates = [64, 47]; })));
  ok("A4.12 tanımlı kanal listesi uyuşmaz → Doğrulanamadı", allUnv(mut((c) => { (c.appCodes as Record<string, unknown>).channels = []; })));
  ok("A4.13 tanımlı merkez listesi uyuşmaz → Doğrulanamadı", allUnv(mut((c) => { (c.appCodes as Record<string, unknown>).active_centers = ["head"]; })));
  ok("A4.14 açık listede merkez eksik → Doğrulanamadı", allUnv(mut((c) => { (c.appCodes as Record<string, unknown>).open_centers = ["throat"]; })));
  ok("A4.15 bozuk merkez kodu kayıtta → Doğrulanamadı", allUnv(mut((c) => { (c.appCodes as Record<string, unknown>).open_centers = ["nope"]; })));
  // Kısmi aktivasyon → beyan kuralı: Açık YOK
  const partial = mut((c) => { (c.activations as unknown[]).pop(); });
  ok("A4.16 25 aktivasyon (kısmi kayıt) → kanıtlanamayan merkezde Açık ÜRETİLMEZ", neverOpen(partial) && partial.head === "defined" && partial.g_identity === "undefined" && partial.throat === "unverified");
  const dupPlanet = mut((c) => { (c.activations as Act[])[1].body = "Sun"; });
  ok("A4.17 aynı tarafta mükerrer gezegen → tam aktivasyon kabul edilmez, Açık yok", neverOpen(dupPlanet));
  const badLine = mut((c) => { (c.activations as Act[])[0].line = 7; });
  ok("A4.18 geçersiz çizgi (7) → tam aktivasyon kabul edilmez, Açık yok", neverOpen(badLine));
  ok("A4.19 aktivasyonlar null → Açık yok", neverOpen(mut((c) => { c.activations = null; })));
  ok("A4.20 computed_result yok → tümü Doğrulanamadı", allUnv(centerStateMap(classifyComputedChartCenters(null))));
  ok("A4.21 completeActivationGates: 26 geçerli → set, 25 → null", completeActivationGates(acts([1])) !== null && completeActivationGates(acts([1]).slice(1)) === null);

  // ─────────────────────────────────────────────────────────────────────────
  section("A5 — Eski kayıt türleri");
  // Eski (appCodes'suz) Roxy benzeri kayıt: centers.defined/open + activations
  const noApp = clone(n.chart) as unknown as Record<string, unknown>;
  delete noApp.appCodes;
  ok("A5.1 kısmi/eski Roxy kaydı (appCodes yok) → aynı üçlü durum", JSON.stringify(centerStateMap(classifyComputedChartCenters(noApp))) === JSON.stringify(fx));
  const legacy = computeHumanDesignChart({ date: "2018-07-20", time: "19:00", timezone: "Europe/Istanbul", location: { lat: 0, lon: 0 } });
  ok("A5.2 eski dahili motor kaydı → kendi 26 aktivasyonundan aynı üçlü durum", JSON.stringify(centerStateMap(classifyComputedChartCenters(legacy))) === JSON.stringify(fx));
  // Manuel kayıt (beyan): G kapı 1 beyanlı → Tanımsız; Kalp kapısız → Doğrulanamadı (Açık değil)
  const manual = { source: "manual", active_centers: ["head", "ajna", "throat", "sacral", "spleen", "root"], open_centers: ["g_identity", "heart_ego", "solar_plexus"], gates: [1, 3, 4, 17, 19, 23, 27, 31, 33, 41, 43, 44, 45, 50, 54, 56, 58, 60, 61, 63, 64], channels: [] };
  const ms = centerStateMap(classifyChartRowCenters(manual));
  ok("A5.3 manuel: tanımlı beyan → Tanımlı", ms.head === "defined" && ms.sacral === "defined");
  ok("A5.4 manuel: tanımlı olmayan + beyanlı kapı → Tanımsız", ms.g_identity === "undefined");
  ok("A5.5 manuel: tanımlı olmayan + kapı yok → Doğrulanamadı (kapı listesi eksiksizliği kanıtlanamaz)", ms.heart_ego === "unverified" && ms.solar_plexus === "unverified");
  ok("A5.6 manuel: merkez hem tanımlı hem açık → Doğrulanamadı", centerStateMap(classifyChartRowCenters({ ...manual, open_centers: [...manual.open_centers, "head"] })).head === "unverified");
  ok("A5.7 manuel: merkez kayıtta yok → Doğrulanamadı", centerStateMap(classifyChartRowCenters({ ...manual, open_centers: ["g_identity"] })).heart_ego === "unverified");
  ok("A5.8 manuel: beyanlı kapılar kanal tamamlarsa açık işaretli merkez Doğrulanamadı (çelişki)", centerStateMap(classifyChartRowCenters({ source: "manual", active_centers: [], open_centers: [...HD_CENTER_CODES], gates: [64, 47] })).head === "unverified");
  ok("A5.9 manuel: bozuk kapı listesi → Tanımsız/Açık kanıtı yok", centerStateMap(classifyChartRowCenters({ ...manual, gates: ["x"] })).g_identity === "unverified");
  ok("A5.10 manuel etiketler: 'G … — Tanımsız', 'Kalp … — Doğrulanamadı'", JSON.stringify(nonDefinedCenterLabels(manual)) === JSON.stringify(["G / Kimlik Merkezi (G Center) — Tanımsız", "Kalp / Ego Merkezi (Heart) — Doğrulanamadı", "Solar Pleksus Merkezi (Solar Plexus) — Doğrulanamadı"]));
  ok("A5.11 hesaplanmış satır (computed_result) → computed kanıtı", JSON.stringify(centerStateMap(classifyChartRowCenters({ source: "computed", computed_result: n.chart, active_centers: n.codes.active_centers, open_centers: n.codes.open_centers }))) === JSON.stringify(fx));

  // ─────────────────────────────────────────────────────────────────────────
  section("B — Şema: yeni yanıt katı, kayıtlı eski yanıt açılır");
  const noGates = clone(FIXTURE);
  (noGates.centers as Array<Record<string, unknown>>).forEach((c) => delete c.gates);
  ok("B1 ingest: centers[].gates eksik → RED (sessizce [] kabul edilmez)", !validateRoxyBodygraph(noGates).ok);
  const nullGates = clone(FIXTURE);
  (nullGates.centers as Array<Record<string, unknown>>)[3].gates = null;
  ok("B2 ingest: gates: null → RED", !validateRoxyBodygraph(nullGates).ok);
  ok("B3 stored: gates eksik eski kayıt doğrulanır (açılmaz hale gelmez), kapılar null taşınır", (() => { const r = validateRoxyBodygraph(noGates, { mode: "stored" }); return r.ok && r.value.centers.every((c) => c.gates === null); })());
  ok("B4 stored: gates dizi değil ('x') → yine RED", (() => { const b = clone(FIXTURE); (b.centers as Array<Record<string, unknown>>)[0].gates = "x"; return !validateRoxyBodygraph(b, { mode: "stored" }).ok; })());
  ok("B5 eski (gates'siz) kayıt BodyGraph render yükü üretir", buildRoxyRenderPayload(noGates) !== null);
  const mism = clone(FIXTURE);
  (mism.centers as Array<Record<string, unknown>>).find((c) => c.id === "heart")!.gates = [21];
  const vm = validateRoxyBodygraph(mism);
  ok("B6 normalize: merkez kapıları aktivasyonla uyuşmazsa yanıt REDDEDİLİR (DB'ye yazılmaz)", vm.ok && !normalizeRoxyBodygraph(vm.value, NORM_INPUT).ok);
  const srOld = extractSystemReading(noGates);
  ok("B7 Sistem Yorumu (gates'siz eski kayıt): kapı satırı yok, durum aktivasyonlardan (G Tanımsız, Kalp Açık)", !!srOld && srOld.centers.every((c) => c.gates === undefined) && srOld.centers.find((c) => c.id === "g")?.state === "undefined" && srOld.centers.find((c) => c.id === "heart")?.state === "open");
  const srNull = clone(FIXTURE);
  (srNull.centers as Array<Record<string, unknown>>).find((c) => c.id === "heart")!.gates = null;
  const srN = extractSystemReading(srNull);
  ok("B8 Sistem Yorumu: gates null → 'aktif kapı yok' UYDURULMAZ, durum Doğrulanamadı", !!srN && srN.centers.find((c) => c.id === "heart")?.gates === undefined && srN.centers.find((c) => c.id === "heart")?.state === "unverified");
  const htmlN = renderToStaticMarkup(createElement(HdSystemReadingView, { data: srN! }));
  ok("B9 Sistem Yorumu görünümü: Doğrulanamadı etiketi, 'Tamamen' yok", htmlN.includes("Doğrulanamadı") && !htmlN.includes("Tamamen"));

  // ─────────────────────────────────────────────────────────────────────────
  section("C — Bilgi Bankası: 27 seçenek + eski acik_* kayıtları");
  const opts = getStructuredCategoryOptions("Merkezler")!;
  ok("C1 Merkezler: 9 × 3 = 27 kesin seçenek", opts.length === 27);
  ok("C2 her merkez için Tanımlı / Tanımsız / Açık etiketleri", HD_CENTER_CODES.every((c) => ["tanimli", "tanimsiz", "tam_acik"].every((f) => opts.some((o) => o.code === `${f}_${c}`))) && opts.filter((o) => o.label.startsWith("Tanımlı — ")).length === 9 && opts.filter((o) => o.label.startsWith("Tanımsız — ")).length === 9 && opts.filter((o) => o.label.startsWith("Açık — ")).length === 9);
  ok("C3 kullanıcı etiketlerinde 'Tamamen Açık' YOK", !opts.some((o) => /Tamamen/.test(o.label)));
  ok("C4 eski genel acik_* yeni kayıtta sunulmaz", !opts.some((o) => /^acik_/.test(o.code)));
  ok("C5 örnek: 'Tanımlı/Tanımsız/Açık — Baş Merkezi (Head)'", ["Tanımlı — Baş Merkezi (Head)", "Tanımsız — Baş Merkezi (Head)", "Açık — Baş Merkezi (Head)"].every((l) => opts.some((o) => o.label === l)));
  ok("C6 yeni teknik kodlar eski kodlarla ÇAKIŞMAZ", new Set(opts.map((o) => buildKnowledgeCodeFromValue("Merkezler", o.code))).size === 27 && !opts.some((o) => buildKnowledgeCodeFromValue("Merkezler", o.code).startsWith("merkez_acik_")));
  ok("C7 yeniden açma: kesin kodlar düzenleyicide seçili görünür (round-trip)", opts.every((o) => deriveStructuredValue("Merkezler", buildKnowledgeCodeFromValue("Merkezler", o.code)) === o.code));
  ok("C8 eski acik_* kayıt düzenleyicide kaybolmaz (yapısal değer korunur)", deriveStructuredValue("Merkezler", "merkez_acik_head") === "acik_head");
  const editOpts = getStructuredCategoryOptionsForEdit("Merkezler", "acik_head")!;
  ok("C9 eski kaydı düzenleme: yalnız KENDİ eski seçeneği + 27 kesin seçenek (bilinçli taşıma mümkün)", editOpts.length === 28 && editOpts.some((o) => o.code === "acik_head" && o.label.startsWith("Eski genel kayıt")) && !editOpts.some((o) => o.code === "acik_ajna"));
  ok("C10 kesin kaydı düzenleme: eski seçenek eklenmez", getStructuredCategoryOptionsForEdit("Merkezler", "tanimsiz_head")!.length === 27);
  ok("C11 merkez kodları canonical admin anahtarı DEĞİL (admin/uzman ayrımı değişmez)", !isHdCanonicalKey("merkez_tanimsiz_head") && !isHdCanonicalKey("merkez_tam_acik_head"));
  // Sıralama
  const sorted = sortHdKnowledgeRecords([
    { id: "4", category: "Merkezler", code: "merkez_acik_head", title: "Açık — Baş Merkezi (Head)" },
    { id: "3", category: "Merkezler", code: "merkez_tam_acik_head", title: "Açık — Baş Merkezi (Head)" },
    { id: "2", category: "Merkezler", code: "merkez_tanimsiz_head", title: "Tanımsız — Baş Merkezi (Head)" },
    { id: "1", category: "Merkezler", code: "merkez_tanimli_head", title: "Tanımlı — Baş Merkezi (Head)" },
    { id: "5", category: "Merkezler", code: "merkez_tanimli_ajna", title: "Tanımlı — Ajna" },
  ]);
  ok("C12 sıralama: merkez başına Tanımlı → Tanımsız → Açık → eski genel", sorted.map((r) => r.id).join() === "1,2,3,4,5");
  ok("C13 eski genel kaydın otomatik başlığı kesin Açık gibi GÖSTERİLMEZ (DB başlığı değişmez)", hdKnowledgeDisplayTitle("merkez_acik_head", "Açık — Baş Merkezi (Head)") === "Tanımlı Değil (Tanımsız/Açık genel) — Baş Merkezi (Head)" && hdKnowledgeDisplayTitle("merkez_tam_acik_head", "Açık — Baş Merkezi (Head)") === "Açık — Baş Merkezi (Head)" && hdKnowledgeDisplayTitle("merkez_acik_head", "Uzmanın kendi başlığı") === "Uzmanın kendi başlığı");
  ok("C14 eski genel kayıt notu", isLegacyCenterKnowledgeCode("merkez_acik_g_identity") && !isLegacyCenterKnowledgeCode("merkez_tam_acik_g_identity") && HD_LEGACY_CENTER_NOTE.includes("Eski genel kayıt"));

  section("C — Eşleştirme kodları");
  const codesFx = buildExpertKnowledgeCodes(n.codes, fx);
  ok("C15 Tanımsız G → merkez_tanimsiz_g_identity (+ eski genel), ASLA tam_acik", codesFx.includes("merkez_tanimsiz_g_identity") && codesFx.includes("merkez_acik_g_identity") && !codesFx.includes("merkez_tam_acik_g_identity"));
  ok("C16 Açık Kalp → merkez_tam_acik_heart_ego (+ eski genel), ASLA tanimsiz", codesFx.includes("merkez_tam_acik_heart_ego") && !codesFx.includes("merkez_tanimsiz_heart_ego"));
  ok("C17 Tanımlı merkez yalnız tanimli_", codesFx.includes("merkez_tanimli_head") && !codesFx.some((c) => /^merkez_(tanimsiz|tam_acik|acik)_head$/.test(c)));
  const unv = centerKnowledgeCodes([], ["heart_ego"], { heart_ego: "unverified" });
  ok("C18 Doğrulanamadı → yalnız eski genel kod (kesin Tanımsız/Açık yorumu getirilmez)", JSON.stringify(unv) === JSON.stringify(["merkez_acik_heart_ego"]));
  ok("C19 durum verilmezse eski davranış (geri uyum)", JSON.stringify(centerKnowledgeCodes(["head"], ["ajna"])) === JSON.stringify(["merkez_tanimli_head", "merkez_acik_ajna"]));
  const manualRow = { type_code: "generator", authority_code: "sacral", profile_code: "2_4", definition_code: "split", ...manual } as unknown as HumanDesignChart;
  const mc = buildCodesFromChart(manualRow);
  ok("C20 manuel rapor kodları: G Tanımsız kesin; Kalp/SP yalnız eski genel (Açık tahmin yok)", mc.includes("merkez_tanimsiz_g_identity") && mc.includes("merkez_acik_heart_ego") && !mc.some((c) => c.startsWith("merkez_tam_acik_")));
  // Aynı isimli farklı danışanlar: kodlar yalnız haritanın kendi verisinden
  const sameName1 = { ...manualRow, client_name: "Ayşe Yılmaz" } as unknown as HumanDesignChart;
  const sameName2 = { ...manualRow, client_name: "Ayşe Yılmaz", gates: [21] , open_centers: [...HD_CENTER_CODES], active_centers: [] } as unknown as HumanDesignChart;
  ok("C21 aynı isimli iki danışan karışmaz (kodlar yalnız kendi haritasından)", buildCodesFromChart(sameName1).includes("merkez_tanimsiz_g_identity") && !buildCodesFromChart(sameName2).includes("merkez_tanimsiz_g_identity") && buildCodesFromChart(sameName2).includes("merkez_tanimsiz_heart_ego"));

  section("C — Kalıcılık (sahte DB, tenant-scoped)");
  const T_A = "11111111-1111-4111-8111-111111111111";
  const T_B = "22222222-2222-4222-8222-222222222222";
  const U_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const legacyRows = [
    { id: "L1", tenant_id: T_A, user_id: U_A, category: "Merkezler", code: "merkez_acik_g_identity", title: "Açık — G / Kimlik Merkezi (G Center)", content: "ESKİ genel G yorumu", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "L2", tenant_id: T_A, user_id: U_A, category: "Merkezler", code: "merkez_acik_heart_ego", title: "Açık — Kalp / Ego Merkezi (Heart)", content: "ESKİ genel Kalp yorumu", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "B1", tenant_id: T_B, user_id: "b", category: "Merkezler", code: "merkez_tanimsiz_g_identity", title: "Tanımsız — G", content: "B tenant — sızmamalı", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
  ];
  const kb = createFakeDb({ human_design_knowledge_records: legacyRows });
  const before = JSON.stringify(kb.tables.human_design_knowledge_records.filter((r) => String(r.id).startsWith("L")));
  // Yalnız eski kayıtlar varken: eski genel kayıtlar döner (kaybolmaz)
  const r0 = await listKnowledgeByCodes(kb.db, T_A, codesFx);
  ok("C22 kesin kayıt yokken eski genel kayıtlar eşleşir (kaybolmaz)", r0.rows.map((r) => r.id).sort().join() === "L1,L2", r0.rows.map((r) => r.id));
  ok("C23 tenant izolasyonu: B tenant'ın Tanımsız kaydı A'ya SIZMAZ", !r0.rows.some((r) => r.id === "B1"));
  // Yeni kesin kayıt oluşturma
  const ins = await insertKnowledge(kb.db, T_A, U_A, { category: "Merkezler", title: "Tanımsız — G / Kimlik Merkezi (G Center)", code: "merkez_tanimsiz_g_identity", content: "Kesin Tanımsız G yorumu", is_active: true });
  ok("C24 yeni kayıt: merkez_tanimsiz_g_identity oluşturulur (eski kodla çakışmaz, migration gerekmez)", !!ins.id && !ins.error, ins);
  const dup = await insertKnowledge(kb.db, T_A, U_A, { category: "Merkezler", title: "x", code: "merkez_tanimsiz_g_identity", content: "y", is_active: true });
  ok("C25 mükerrer kod koruması (aynı tenant, aynı kesin kod) → red + mevcut id", !dup.id && dup.existingId === ins.id);
  const insB = await insertKnowledge(kb.db, T_B, "b", { category: "Merkezler", title: "x", code: "merkez_tam_acik_heart_ego", content: "B açık", is_active: true });
  ok("C26 başka tenant aynı kodu bağımsız oluşturabilir", !!insB.id);
  const r1 = await listKnowledgeByCodes(kb.db, T_A, codesFx);
  ok("C27 kesin Tanımsız kayıt varken o merkezin eski genel kaydı ELENİR (mükerrer/çelişkili yorum yok)", r1.rows.some((r) => r.id === ins.id) && !r1.rows.some((r) => r.id === "L1") && r1.rows.some((r) => r.id === "L2"), r1.rows.map((r) => r.id));
  ok("C28 B tenant'ın tam_acik kaydı A'ya sızmaz", !r1.rows.some((r) => r.id === insB.id));
  const r1w = await listKnowledgeForReport(kb.db, T_A, codesFx);
  ok("C29 Word okuması da aynı kural (kesin kayıt önce, eski genel elenir)", r1w.rows.map((r) => r.id).sort().join() === [ins.id, "L2"].sort().join());
  // Açık merkez, Tanımsız yorumuyla eşleşmemeli: G Açık olan bir haritada tanimsiz_g dönmez
  const openG = centerStateMap(classifyComputedChartCenters(computedFrom([64])));
  const codesOpenG = buildExpertKnowledgeCodes(computedChartAppCodes(computedFrom([64])), openG);
  const r2 = await listKnowledgeByCodes(kb.db, T_A, codesOpenG);
  ok("C30 Açık G merkezi Tanımsız G yorumuyla EŞLEŞMEZ (eski genel kayıt döner)", openG.g_identity === "open" && !r2.rows.some((r) => r.id === ins.id) && r2.rows.some((r) => r.id === "L1"));
  // Düzenleme (yeniden açma) + eski kaydın bilinçli taşınması
  const upd = await updateKnowledge(kb.db, T_A, ins.id!, { content: "Kesin Tanımsız G yorumu — düzenlendi" });
  ok("C31 kesin kayıt düzenlenir", upd.ok, upd);
  const after = JSON.stringify(kb.tables.human_design_knowledge_records.filter((r) => String(r.id).startsWith("L")));
  ok("C32 eski acik_* kayıtların kodu / içeriği / sahipliği DEĞİŞMEDİ (sessiz dönüşüm yok)", before === after);
  const move = await updateKnowledge(kb.db, T_A, "L2", { code: "merkez_tam_acik_heart_ego", title: "Açık — Kalp / Ego Merkezi (Heart)" });
  ok("C33 uzman eski kaydı BİLİNÇLİ olarak kesin Açık'a taşıyabilir (tek kayıt, zorla/toplu değil)", move.ok && kb.tables.human_design_knowledge_records.find((r) => r.id === "L2")?.code === "merkez_tam_acik_heart_ego" && kb.tables.human_design_knowledge_records.find((r) => r.id === "L1")?.code === "merkez_acik_g_identity");
  ok("C34 dedupe saf: kesin kayıt yoksa eski genel korunur", dedupeCenterKnowledge([{ code: "merkez_acik_head" }, { code: "merkez_tanimsiz_ajna" }]).length === 2);

  // ─────────────────────────────────────────────────────────────────────────
  section("D — Yüzey tutarlılığı (harita kartı = Bilgi Bankası = Sistem Yorumu = Word)");
  const view = renderToStaticMarkup(createElement(HdComputedChartView, { result: n.chart, roxyRender: buildRoxyRenderPayload(FIXTURE) }));
  const cardStates = Object.fromEntries([...view.matchAll(/data-hd-center="([a-z_]+):([a-z]+)"/g)].map((m) => [m[1], m[2]]));
  ok("D1 Merkezler kartı: 9 merkez, durumlar sınıflandırıcıyla aynı", Object.keys(cardStates).length === 9 && JSON.stringify(cardStates) === JSON.stringify(fx));
  ok("D2 kart etiketleri: 6 Tanımlı + 1 Tanımsız + 2 Açık; 'Tamamen' yok", (view.match(/data-hd-center-state="defined"/g) ?? []).length === 6 && (view.match(/data-hd-center-state="undefined"[^>]*>Tanımsız</g) ?? []).length === 1 && (view.match(/data-hd-center-state="open"[^>]*>Açık</g) ?? []).length === 2 && !view.includes("Tamamen"));
  ok("D3 Motor / Farkındalık işaretleri korunur (4 + 3)", (view.match(/data-hd-center-motor/g) ?? []).length === 4 && (view.match(/data-hd-center-awareness/g) ?? []).length === 3);
  const sr = extractSystemReading(FIXTURE)!;
  ok("D4 Sistem Yorumu durumları = kart", sr.centers.every((c) => {
    const code = ({ g: "g_identity", heart: "heart_ego", "solar-plexus": "solar_plexus" } as Record<string, string>)[c.id] ?? c.id;
    return c.state === fx[code as HdCenterCode];
  }));
  const snap = buildReportSnapshotV2({
    generatedAt: "2026-10-17T00:00:00.000Z", chartId: "c", source: "computed", provider: "roxyapi",
    client: { name: "Test", birthDate: null, birthTime: null, birthPlace: null, timezone: null },
    codes: n.codes, computed: n.chart, requested: "expert", systemReadingPermitted: false, systemReading: null,
    expertRecords: [{ category: "Merkezler", code: "merkez_acik_heart_ego", title: "Açık — Kalp / Ego Merkezi (Heart)", content: "eski", is_active: true }],
    bodygraph: { status: "missing" }, chartImage: null,
    centerStates: centerStateMap(classifyChartRowCenters({ source: "computed", computed_result: n.chart })),
  });
  ok("D5 Word snapshot durumları = kart", snap.centers.every((c) => c.state === fx[c.code as HdCenterCode]) && snap.centers.length === 9);
  ok("D6 Word: eski genel kaydın başlığı kesin Açık gibi donmaz", snap.commentary.expert.entries[0]?.title === "Tanımlı Değil (Tanımsız/Açık genel) — Kalp / Ego Merkezi (Heart)" && snap.commentary.expert.entries[0]?.code === "merkez_acik_heart_ego");
  const oldSnap = buildReportSnapshotV2({
    generatedAt: "2026-10-17T00:00:00.000Z", chartId: "c", source: "computed", provider: "roxyapi",
    client: { name: "Test", birthDate: null, birthTime: null, birthPlace: null, timezone: null },
    codes: n.codes, computed: n.chart, requested: "expert", systemReadingPermitted: false, systemReading: null,
    expertRecords: [], bodygraph: { status: "missing" }, chartImage: null,
  });
  ok("D7 durum verilmeyen (eski yol) snapshot'ta state alanı YOK → eski Word çıktısı birebir", oldSnap.centers.every((c) => !("state" in c)));
  const svc = read("lib/human-design/reporting/reportSnapshotV2Service.ts");
  const km = read("app/api/hd/reports/professional/knowledge-match/route.ts");
  ok("D8 Word servisi + 'eşleşen açıklama sayısı' ucu AYNI sınıflandırma + kod üreticisi", /classifyChartRowCenters\(chart\)/.test(svc) && /buildExpertKnowledgeCodes\(codes, centerStates\)/.test(svc) && /classifyChartRowCenters\(row\)/.test(km));
  const modal = read("app/human-design/kayitli-haritalar/components/HdComputedChartModal.tsx");
  ok("D9 harita penceresindeki Bilgi Bankası paneli aynı kanıtı kullanır", (modal.match(/centerStates=\{centerStateMap\(classifyComputedChartCenters\(result\)\)\}/g) ?? []).length === 2);
  ok("D10 BodyGraph çizimi / renklendirme dosyaları değişmedi (yalnız etiket)", !/centerStates/.test(read("app/human-design/kayitli-haritalar/components/HdRoxyBodygraph.tsx")) && !/centerStates/.test(read("app/human-design/harita/components/BodyGraph.tsx")));

  // ─────────────────────────────────────────────────────────────────────────
  section("E — Roxy kredisi: 0 sağlayıcı çağrısı");
  ok("E1 yukarıdaki tüm görüntüleme / merkez detayı / eşleştirme / Sistem Yorumu / Word hazırlığı: fetch çağrısı 0", fetchCalls === 0, fetchCalls);
  const pure = ["lib/human-design/chart/centerStates.ts", "lib/human-design/chart/centerStateLabels.ts", "lib/human-design/knowledge/centerKnowledge.ts"];
  ok("E2 yeni modüller ağ / Roxy istemcisi / DB içermez", pure.every((p) => !/fetch\(|callRoxy|providers\/roxy\/client|supabase/i.test(read(p))));
  // Owner onaylı uçlar yalnız: bodygraph (BodyGraph) + connection / penta (İlişki ve Grup Analizleri). Başka uç YOK.
  ok("E3 Roxy uçları yalnız owner onaylı liste (bodygraph, connection, penta)", JSON.stringify([...read("lib/human-design/providers/roxy/config.ts").matchAll(/"(\/human-design\/[a-z-]+)"/g)].map((m) => m[1]).sort()) === JSON.stringify(["/human-design/bodygraph", "/human-design/connection", "/human-design/penta"]));

  globalThis.fetch = realFetch;
  console.log(`\nHD-UZMAN-01 MERKEZ DURUMLARI: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
