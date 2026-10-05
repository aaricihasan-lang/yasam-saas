/**
 * HD FAZ 1 — RoxyAPI otomatik hesaplama harness'i.
 *
 * Çalıştırma:  npx tsx scripts/hd-roxy/harness.ts
 *
 * GERÇEK Roxy API'ye ÇAĞRI YAPMAZ (fixture + mock fetch). Gerçek DB'ye BAĞLANMAZ (fakeDb).
 * Referans: scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json (gerçek Roxy yanıtı)
 *           + uzmanın profesyonel referans haritası (aşağıdaki REF_* sabitleri).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph, type RoxyNormalizeInput } from "../../lib/human-design/providers/roxy/normalize";
import { callRoxyBodygraph } from "../../lib/human-design/providers/roxy/client";
import { readRoxyServerConfig, ROXY_POLICY, ROXY_RATE_LIMITS } from "../../lib/human-design/providers/roxy/config";
import {
  buildExpertKnowledgeCodes,
  toAppAuthorityCode,
  toAppCenterCode,
  toAppChannelCode,
  toAppChartCodes,
  toAppDefinitionCode,
  toAppProfileCode,
  toAppTypeCode,
} from "../../lib/human-design/normalize/hdAppCodes";
import { computeRoxyChart, roxyChartIdFor, roxyInputHash, type RoxyServiceDeps } from "../../lib/human-design/api/roxyChartService";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { resolveHdBirthLocation } from "../../lib/human-design/api/hdBirthLocation";
import {
  deleteManualChart,
  getComputedChart,
  getManualChartByClient,
  listManualChartsWithClients,
  saveComputedChart,
  saveManualChart,
} from "../../lib/human-design/api/chartPersistence";
import { manualChartIdFor } from "../../lib/human-design/api/deterministicId";
import { computeHumanDesignChart } from "../../lib/human-design/engine";
import { computedChartAppCodes, type HdComputedChart } from "../../lib/human-design/chart/computedChart";
import { getStructuredCategoryOptions, buildKnowledgeCodeFromValue, hdDefinitionLabelFromCode } from "../../lib/human-design/codeHelpers";
import { HD_KNOWLEDGE_CATEGORIES } from "../../lib/human-design/constants";
import { buildCodesFromChart } from "../../app/human-design/rapor-olustur/helpers/hdRapor";
import { normalizeChartToCanonicalKeys } from "../../lib/human-design/consultation/normalizeChart";
import { BodyGraph } from "../../app/human-design/harita/components/BodyGraph";
import { HdPlanetColumn } from "../../app/human-design/kayitli-haritalar/components/HdPlanetColumn";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { createFakeDb } from "./fakeDb";
import type { HumanDesignChart } from "../../lib/human-design/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FIXTURE = JSON.parse(readFileSync(join(HERE, "fixtures", "roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : "");
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

// ── Referans (uzmanın profesyonel haritası; 2018-07-20 19:00 Europe/Istanbul, Konya) ──
const REF_P: [string, string][] = [
  ["Sun", "56.2"], ["Earth", "60.2"], ["Moon", "44.1"], ["NorthNode", "31.5"], ["SouthNode", "41.5"],
  ["Mercury", "4.4"], ["Venus", "64.1"], ["Mars", "41.5"], ["Jupiter", "1.1"], ["Saturn", "58.1"],
  ["Uranus", "27.1"], ["Neptune", "63.6"], ["Pluto", "54.6"],
];
const REF_D: [string, string][] = [
  ["Sun", "3.4"], ["Earth", "50.4"], ["Moon", "45.6"], ["NorthNode", "33.4"], ["SouthNode", "19.4"],
  ["Mercury", "17.2"], ["Venus", "23.6"], ["Mars", "54.4"], ["Jupiter", "43.2"], ["Saturn", "58.6"],
  ["Uranus", "3.3"], ["Neptune", "63.5"], ["Pluto", "61.1"],
];
const REF_CHANNELS = ["23-43", "27-50", "3-60", "4-63"];

const NORM_INPUT: RoxyNormalizeInput = {
  date: "2018-07-20",
  time: "19:00:00",
  timezone: "Europe/Istanbul",
  latitude: 37.871399,
  longitude: 32.484699,
  nodeType: "true",
  lang: "tr",
  birthUtcIso: "2018-07-20T16:00:00.000Z",
};

function normalizeFixture(raw: unknown = FIXTURE) {
  const v = validateRoxyBodygraph(raw);
  if (!v.ok) throw new Error("fixture invalid: " + v.errors.join("; "));
  const n = normalizeRoxyBodygraph(v.value, NORM_INPUT);
  if (!n.ok) throw new Error("fixture normalize failed: " + n.errors.join("; "));
  return n;
}

// ── Servis test düzeneği ─────────────────────────────────────────────────────
const T_A = "11111111-1111-4111-8111-111111111111";
const T_B = "22222222-2222-4222-8222-222222222222";
const U_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C_A = "c0000000-0000-4000-8000-00000000000a";
const C_B = "c0000000-0000-4000-8000-00000000000b";
const SECRET = "sk-roxy-TEST-SECRET-DO-NOT-LEAK-123";

function seedDb(extraCharts: Record<string, unknown>[] = [], opts: { missingColumns?: string[] } = {}) {
  return createFakeDb(
    {
      human_design_clients: [
        { id: C_A, tenant_id: T_A, name: "Danışan A", birth_date: "2018-07-20", birth_time: "19:00", birth_place: "Konya" },
        { id: C_B, tenant_id: T_B, name: "Danışan B", birth_date: "1990-01-01", birth_time: "10:00", birth_place: "Ankara" },
      ],
      human_design_charts: extraCharts,
    },
    opts,
  );
}

function makeDeps(over: Partial<RoxyServiceDeps> & { roxyRaw?: unknown; roxyDelayMs?: number } = {}) {
  const calls: unknown[] = [];
  const counters = new Map<string, number>();
  const deps: RoxyServiceDeps = {
    config: { apiKey: SECRET, baseUrl: "https://roxyapi.com/api/v2" },
    callRoxy: async (_cfg, body) => {
      calls.push(body);
      if (over.roxyDelayMs) await new Promise((r) => setTimeout(r, over.roxyDelayMs));
      return { ok: true, raw: clone(over.roxyRaw ?? FIXTURE) };
    },
    rateLimit: async (scope, value, limit) => {
      const k = `${scope}:${value}`;
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return { allowed: n <= limit, retryAfterSec: n <= limit ? 0 : 30 };
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 15))),
    log: () => undefined,
    ...over,
  };
  return { deps, calls, counters };
}

const ctxA = (db: ReturnType<typeof seedDb>["db"], isDemo = false) => ({ db, tenantId: T_A, userId: U_A, isDemo });

async function main(): Promise<void> {
  console.log("HD FAZ 1 — RoxyAPI otomatik hesaplama harness'i (mock; gerçek Roxy/DB YOK)");

  // ── A) Şema doğrulama ──────────────────────────────────────────────────────
  section("A) Roxy yanıt şeması runtime doğrulaması");
  {
    const v = validateRoxyBodygraph(FIXTURE);
    ok("A1 gerçek fixture geçerli", v.ok, v.ok ? undefined : v.errors);
    ok("A2 nesne olmayan yanıt reddedilir", !validateRoxyBodygraph("<html>").ok && !validateRoxyBodygraph(null).ok);
    const noType = clone(FIXTURE);
    delete noType.type;
    ok("A3 type eksik → red", !validateRoxyBodygraph(noType).ok);
    const shortGates = clone(FIXTURE);
    (shortGates.gates as unknown[]).pop();
    ok("A4 25 aktivasyon → red (13+13 zorunlu)", !validateRoxyBodygraph(shortGates).ok);
    const badLine = clone(FIXTURE);
    (badLine.gates as Record<string, unknown>[])[0].line = 7;
    ok("A5 line=7 → red", !validateRoxyBodygraph(badLine).ok);
    const badGate = clone(FIXTURE);
    (badGate.gates as Record<string, unknown>[])[3].gate = 65;
    ok("A6 gate=65 → red", !validateRoxyBodygraph(badGate).ok);
    const eightCenters = clone(FIXTURE);
    (eightCenters.centers as unknown[]).pop();
    ok("A7 8 merkez → red", !validateRoxyBodygraph(eightCenters).ok);
    const noCross = clone(FIXTURE);
    (noCross.incarnationCross as Record<string, unknown>).name = "";
    ok("A8 cross adı boş → red", !validateRoxyBodygraph(noCross).ok);
    const badSide = clone(FIXTURE);
    (badSide.gates as Record<string, unknown>[])[0].side = "conscious";
    ok("A9 bilinmeyen side → red", !validateRoxyBodygraph(badSide).ok);
    const badInstant = clone(FIXTURE);
    badInstant.designInstantUtc = "dün";
    ok("A10 geçersiz designInstantUtc → red", !validateRoxyBodygraph(badInstant).ok);
  }

  // ── B/C/D/E/F/G/H) Normalizasyon ─────────────────────────────────────────
  section("B) Roxy → HdComputedChart normalizasyonu");
  const n = normalizeFixture();
  const chart = n.chart;
  ok("B1 type kodu generator", n.codes.type_code === "generator");
  ok("B2 authority kodu sacral", n.codes.authority_code === "sacral");
  ok("B3 profile kodu 2_4", n.codes.profile_code === "2_4");
  ok("B4 definition kodu split (small/large tahmin YOK)", n.codes.definition_code === "split");
  ok("B5 ham definition korunur ('Split')", chart.definition.kind === "Split");
  ok("B6 meta provider / sözleşme", chart.meta.engine === "roxyapi" && chart.provider?.id === "roxyapi" && chart.provider.nodeType === "true");
  ok("B7 strategy/signature/notSelf korunur", chart.strategy === "Wait to respond" && chart.signature === "Satisfaction" && chart.notSelf === "Frustration");
  ok("B8 timing: design anı Roxy'den", chart.timing.designUtcIso === "2018-04-20T00:33:14.578Z" && chart.timing.birthUtcIso === "2018-07-20T16:00:00.000Z");
  ok("B9 açıklama metinleri sözleşmede YOK", !JSON.stringify(chart).includes("enveloping") && !JSON.stringify(chart).includes("storyteller"));

  section("C) 13 Personality + 13 Design");
  ok("C1 personality 13", chart.activations.filter((a) => a.side === "personality").length === 13);
  ok("C2 design 13", chart.activations.filter((a) => a.side === "design").length === 13);
  const dup = clone(FIXTURE);
  (dup.gates as Record<string, unknown>[])[1].planet = "Sun"; // personality'de iki Sun
  const vd = validateRoxyBodygraph(dup);
  ok("C3 aynı tarafta gezegen tekrarı → red", vd.ok && !normalizeRoxyBodygraph(vd.value, NORM_INPUT).ok);
  const badPlanet = clone(FIXTURE);
  (badPlanet.gates as Record<string, unknown>[])[2].planet = "Chiron";
  const vb = validateRoxyBodygraph(badPlanet);
  ok("C4 bilinmeyen gezegen → red", vb.ok && !normalizeRoxyBodygraph(vb.value, NORM_INPUT).ok);

  section("D) Gate.line doğruluğu (profesyonel referans haritası)");
  for (const [side, ref] of [["personality", REF_P], ["design", REF_D]] as const) {
    for (const [body, gl] of ref) {
      const a = chart.activations.find((x) => x.side === side && x.body === body);
      ok(`D ${side} ${body} ${gl}`, !!a && `${a.gate}.${a.line}` === gl, a);
    }
  }

  section("E) Kanal normalizasyonu");
  ok("E1 kanallar referansla birebir", [...n.codes.channels].sort().join() === [...REF_CHANNELS].sort().join(), n.codes.channels);
  ok("E2 43-23 → 23-43", toAppChannelCode(43, 23) === "23-43" && toAppChannelCode("63-4") === "4-63");
  ok("E3 resmi olmayan kanal → null", toAppChannelCode(1, 2) === null && toAppChannelCode(5, 5) === null);
  const missingCh = clone(FIXTURE);
  (missingCh.channels as unknown[]).pop();
  const vm = validateRoxyBodygraph(missingCh);
  ok("E4 Roxy kanal listesi aktivasyonlarla çelişirse red", vm.ok && !normalizeRoxyBodygraph(vm.value, NORM_INPUT).ok);

  section("F) Merkez normalizasyonu");
  ok("F1 tanımlı merkezler", [...n.codes.active_centers].sort().join() === ["ajna", "head", "root", "sacral", "spleen", "throat"].sort().join(), n.codes.active_centers);
  ok("F2 açık merkezler", [...n.codes.open_centers].sort().join() === ["g_identity", "heart_ego", "solar_plexus"].sort().join(), n.codes.open_centers);
  ok("F3 Roxy id eşlemesi", toAppCenterCode("g") === "g_identity" && toAppCenterCode("solar-plexus") === "solar_plexus" && toAppCenterCode("heart") === "heart_ego");
  ok("F4 Roxy ad eşlemesi", toAppCenterCode("G Center") === "g_identity" && toAppCenterCode("Solar Plexus") === "solar_plexus");
  ok("F5 motor RAW eşlemesi", toAppCenterCode("SolarPlexus") === "solar_plexus" && toAppCenterCode("G") === "g_identity" && toAppCenterCode("Heart") === "heart_ego");
  const flip = clone(FIXTURE);
  (flip.centers as Record<string, unknown>[]).find((c) => c.id === "g")!.defined = true;
  const vf = validateRoxyBodygraph(flip);
  ok("F6 Roxy merkez durumu kanallarla çelişirse red", vf.ok && !normalizeRoxyBodygraph(vf.value, NORM_INPUT).ok);

  section("G) Type / Authority / Profile / Definition eşlemesi");
  const typeCases: [string, string][] = [["Generator", "generator"], ["Pure Generator", "generator"], ["Manifesting Generator", "manifesting_generator"], ["Manifestor", "manifestor"], ["Projector", "projector"], ["Reflector", "reflector"], ["generator", "generator"]];
  for (const [r, c] of typeCases) ok(`G type ${r}`, toAppTypeCode(r) === c);
  const authCases: [string, string][] = [["Emotional", "emotional"], ["Sacral", "sacral"], ["Splenic", "splenic"], ["Ego", "ego_heart"], ["Self-Projected", "self_projected"], ["Mental", "mental_environmental"], ["Lunar", "lunar"], ["ego_heart", "ego_heart"]];
  for (const [r, c] of authCases) ok(`G authority ${r}`, toAppAuthorityCode(r) === c);
  ok("G profile 2/4 → 2_4, 4/1 → 4_1", toAppProfileCode("2/4") === "2_4" && toAppProfileCode("4/1") === "4_1" && toAppProfileCode("2_4") === "2_4");
  ok("G profile geçersiz (2/2) → null", toAppProfileCode("2/2") === null && toAppProfileCode("7/1") === null);
  const defCases: [string, string][] = [["None", "none"], ["Single", "single"], ["Split", "split"], ["Triple Split", "triple_split"], ["Quadruple Split", "quadruple_split"], ["split-small", "split"], ["split-large", "split"], ["quad-split", "quadruple_split"], ["triple-split", "triple_split"]];
  for (const [r, c] of defCases) ok(`G definition ${r}`, toAppDefinitionCode(r) === c);
  ok("G bilinmeyen değerler → null (tahmin yok)", toAppTypeCode("Wizard") === null && toAppAuthorityCode("Gut") === null && toAppDefinitionCode("Split-Medium") === null);
  ok("G 'none' etiketi", hdDefinitionLabelFromCode("none").startsWith("Tanımsız"));
  const unkType = clone(FIXTURE);
  unkType.type = "Wizard";
  const vu = validateRoxyBodygraph(unkType);
  ok("G bilinmeyen Roxy type → normalizasyon reddi", vu.ok && !normalizeRoxyBodygraph(vu.value, NORM_INPUT).ok);
  const badProfile = clone(FIXTURE);
  badProfile.profile = "1/3";
  const vp = validateRoxyBodygraph(badProfile);
  ok("G profil Güneş çizgileriyle çelişirse red", vp.ok && !normalizeRoxyBodygraph(vp.value, NORM_INPUT).ok);

  section("H) Incarnation Cross korunur");
  ok("H1 ad", chart.incarnationCross.name === "Right Angle Cross of Laws 2");
  ok("H2 kapılar", chart.incarnationCross.gates.join() === "56,60,3,50");
  ok("H3 açı + kod + status", chart.incarnationCross.angle === "Right Angle" && chart.incarnationCross.angleCode === "RAX" && chart.incarnationCross.status === "provider");
  const badCross = clone(FIXTURE);
  (badCross.incarnationCross as Record<string, unknown>).gates = [1, 2, 3, 4];
  const vc = validateRoxyBodygraph(badCross);
  ok("H4 cross kapıları Güneş/Dünya ile çelişirse red", vc.ok && !normalizeRoxyBodygraph(vc.value, NORM_INPUT).ok);

  // ── I) Uzman Bilgi Bankası kod eşleştirmesi ──
  section("I) Uzman Bilgi Bankası kod eşleştirmesi");
  const expertCodes = buildExpertKnowledgeCodes(n.codes);
  for (const c of ["tip_generator", "otorite_sacral", "profil_2_4", "tanim_split", "merkez_tanimli_sacral", "merkez_tanimli_head", "merkez_acik_g_identity", "merkez_acik_heart_ego", "merkez_acik_solar_plexus", "kanal_23_43", "kanal_4_63", "kanal_3_60", "kanal_27_50", "kapi_56", "kapi_3"]) {
    ok(`I kod üretildi: ${c}`, expertCodes.includes(c));
  }
  // Uzmanın Bilgi Bankası formunun üretebildiği kod uzayı (yapısal kategoriler).
  const creatable = new Set<string>();
  for (const cat of HD_KNOWLEDGE_CATEGORIES) {
    for (const o of getStructuredCategoryOptions(cat) ?? []) creatable.add(buildKnowledgeCodeFromValue(cat, o.code));
  }
  const notCreatable = expertCodes.filter((c) => !creatable.has(c));
  ok("I tüm üretilen kodlar uzmanın oluşturabileceği kod uzayında", notCreatable.length === 0, notCreatable);
  const manualRow = {
    type_code: "generator", authority_code: "sacral", profile_code: "2_4", definition_code: "split",
    active_centers: n.codes.active_centers, open_centers: n.codes.open_centers, gates: n.codes.gates, channels: n.codes.channels,
  } as unknown as HumanDesignChart;
  ok("I manuel harita ile birebir aynı kod kümesi (buildCodesFromChart paritesi)", [...buildCodesFromChart(manualRow)].sort().join() === [...expertCodes].sort().join());
  // Uçtan uca: fakeDb Bilgi Bankası → listKnowledgeByCodes tenant-scoped eşleşme
  {
    const { listKnowledgeByCodes } = await import("../../lib/human-design/api/knowledgePersistence");
    const kb = createFakeDb({
      human_design_knowledge_records: [
        { id: "k1", tenant_id: T_A, code: "tip_generator", category: "Tipler", title: "Generator", content: "Uzman metni", is_active: true },
        { id: "k2", tenant_id: T_A, code: "kanal_23_43", category: "Kanallar", title: "23-43", content: "Uzman kanal", is_active: true },
        { id: "k3", tenant_id: T_B, code: "otorite_sacral", category: "Otoriteler", title: "B tenant", content: "sızmamalı", is_active: true },
        { id: "k4", tenant_id: T_A, code: "profil_2_4", category: "Profiller", title: "2/4", content: "pasif", is_active: false },
      ],
    });
    const { rows } = await listKnowledgeByCodes(kb.db, T_A, expertCodes);
    ok("I uçtan uca: tenant A eşleşmeleri (tip+kanal)", rows.map((r) => r.id).sort().join() === "k1,k2", rows.map((r) => r.id));
  }
  // Eski motor computed kaydı (RAW) → aynı kod uzayı
  const legacy = computeHumanDesignChart({ date: "2018-07-20", time: "19:00", timezone: "Europe/Istanbul", location: { lat: 0, lon: 0 } });
  const legacyCodes = computedChartAppCodes(legacy as unknown as HdComputedChart);
  ok("I eski motor kaydı (RAW) uygulama kodlarına iner", legacyCodes.type_code === "generator" && legacyCodes.profile_code === "2_4" && legacyCodes.definition_code === "split");
  ok("I eski motor ↔ Roxy aynı harita: aynı uzman kod kümesi", [...buildExpertKnowledgeCodes(legacyCodes)].sort().join() === [...expertCodes].sort().join());
  ok("I canonical (Word) anahtarları Roxy kodlarından üretilir", normalizeChartToCanonicalKeys({ type_code: n.codes.type_code, authority_code: n.codes.authority_code, gates: n.codes.gates, channels: n.codes.channels }).length > 0);
  ok("I manuel kodlar normalizasyondan değişmeden geçer (idempotent)", JSON.stringify(toAppChartCodes(manualRow)) === JSON.stringify(toAppChartCodes(toAppChartCodes(manualRow))));

  // ── DST / konum ──
  section("DST / timezone / konum çözümü");
  const r1 = resolveBirthLocalTime("2018-07-20", "19:00:00", "Europe/Istanbul");
  ok("TZ1 Istanbul 2018 yaz → UTC 16:00", r1.kind === "ok" && r1.utcIso === "2018-07-20T16:00:00.000Z");
  ok("TZ2 Berlin ileri alma boşluğu → gap", resolveBirthLocalTime("2020-03-29", "02:30", "Europe/Berlin").kind === "gap");
  ok("TZ3 Berlin geri alma → ambiguous", resolveBirthLocalTime("2020-10-25", "02:30", "Europe/Berlin").kind === "ambiguous");
  ok("TZ4 TR 2016 ileri alma boşluğu → gap", resolveBirthLocalTime("2016-03-27", "03:30", "Europe/Istanbul").kind === "gap");
  const lmt = resolveBirthLocalTime("1879-03-14", "11:30", "Europe/Berlin");
  ok("TZ5 LMT saniye hassasiyeti (Berlin 1879 +0:53:28)", lmt.kind === "ok" && lmt.offsetSeconds === 3208);
  const kol = resolveBirthLocalTime("1990-05-01", "10:00", "Asia/Kolkata");
  ok("TZ6 yarım-saat tz (Kolkata +5:30)", kol.kind === "ok" && kol.offsetSeconds === 19800);
  ok("TZ7 geçersiz tz/tarih", resolveBirthLocalTime("2018-02-30", "10:00", "Europe/Istanbul").kind === "invalid" && resolveBirthLocalTime("2018-02-10", "10:00", "Mars/Olympus").kind === "invalid");
  const konya = resolveHdBirthLocation("tr-42-konya");
  ok("LOC1 TR il kimliği → Europe/Istanbul + koordinat", !!konya && konya.timezone === "Europe/Istanbul" && Math.abs(konya.latitude - 37.87) < 0.05);
  const berlin = resolveHdBirthLocation("gn-2950159");
  ok("LOC2 global GeoNames kimliği → Europe/Berlin", !!berlin && berlin.timezone === "Europe/Berlin");
  ok("LOC3 serbest metin / bilinmeyen kimlik → null", resolveHdBirthLocation("Konya") === null && resolveHdBirthLocation("tr-99-yok") === null && resolveHdBirthLocation({}) === null);

  // ── J) Tenant negatif ──
  section("J) Tenant izolasyonu (negatif)");
  {
    const f = seedDb();
    const { deps, calls } = makeDeps();
    const r = await computeRoxyChart(ctxA(f.db), { client_id: C_B, location_id: "tr-42-konya" }, deps);
    ok("J1 başka tenant'ın danışanı → 404", r.status === 404 && !r.body.ok);
    ok("J2 Roxy çağrılmadı", calls.length === 0);
    ok("J3 kayıt yazılmadı", f.tables.human_design_charts.length === 0);
    const r2 = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya", tenant_id: T_B }, deps);
    ok("J4 gövdedeki tenant_id YOK SAYILIR (kayıt guard tenant'ına)", r2.body.ok && f.tables.human_design_charts.every((x) => x.tenant_id === T_A));
    const eng = await saveComputedChart(f.db, T_A, U_A, { date: "2018-07-20", time: "19:00", timezone: "Europe/Istanbul", client_id: C_B });
    ok("J5 eski computed yolu: başka tenant danışanı → 404 (P2 kapandı)", !eng.ok && eng.status === 404);
    const g = await getComputedChart(f.db, T_B, roxyChartIdFor(T_A, roxyInputHash({ tenantId: T_A, clientId: C_A, date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: konya!.latitude, longitude: konya!.longitude, nodeType: "true", lang: "tr" })));
    ok("J6 B tenant'ı A'nın hesaplanmış kaydını okuyamaz", g.row === null);
  }

  // ── K) Demo ──
  section("K) Demo hesap Roxy engeli");
  {
    const f = seedDb();
    const { deps, calls } = makeDeps();
    const r = await computeRoxyChart(ctxA(f.db, true), { client_id: C_A, location_id: "tr-42-konya" }, deps);
    ok("K1 demo → 403", r.status === 403);
    ok("K2 Roxy çağrılmadı + kayıt yok", calls.length === 0 && f.tables.human_design_charts.length === 0);
  }

  // ── L) Rate limit ──
  section("L) Rate limit");
  {
    ok("L0 limitler merkezi ve makul", ROXY_RATE_LIMITS.perUser.limit >= 10 && ROXY_RATE_LIMITS.perTenant.limit >= ROXY_RATE_LIMITS.perUser.limit);
    const f = seedDb();
    const { deps, calls } = makeDeps({
      rateLimit: async (scope) => (scope === "hd-roxy-user" ? { allowed: false, retryAfterSec: 1200 } : { allowed: true, retryAfterSec: 0 }),
    });
    const r = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, deps);
    ok("L1 kullanıcı limiti → 429 + Retry-After", r.status === 429 && !r.body.ok && r.body.retryAfterSec === 1200);
    ok("L2 limit aşımında Roxy çağrılmadı", calls.length === 0);
    const f2 = seedDb();
    const t = makeDeps({ rateLimit: async (scope) => ({ allowed: scope !== "hd-roxy-tenant", retryAfterSec: 60 }) });
    const r2 = await computeRoxyChart(ctxA(f2.db), { client_id: C_A, location_id: "tr-42-konya" }, t.deps);
    ok("L3 tenant limiti → 429, Roxy çağrısı yok", r2.status === 429 && t.calls.length === 0);
    // Kayıtlı sonuç limit SAYMAZ
    const f3 = seedDb();
    const m = makeDeps();
    await computeRoxyChart(ctxA(f3.db), { client_id: C_A, location_id: "tr-42-konya" }, m.deps);
    await computeRoxyChart(ctxA(f3.db), { client_id: C_A, location_id: "tr-42-konya" }, m.deps);
    ok("L4 kayıtlı sonuç dönüşü rate limit sayacını artırmaz", (m.counters.get(`hd-roxy-user:${U_A}`) ?? 0) === 1);
  }

  // ── M/N) Idempotency ──
  section("M) Idempotency / çift gönderim");
  {
    const f = seedDb();
    const { deps, calls } = makeDeps({ roxyDelayMs: 60 });
    const body = { client_id: C_A, location_id: "tr-42-konya" };
    const [a, b] = await Promise.all([computeRoxyChart(ctxA(f.db), body, deps), computeRoxyChart(ctxA(f.db), body, deps)]);
    ok("M1 eşzamanlı çift istek: ikisi de başarılı", a.body.ok && b.body.ok, [a, b]);
    ok("M2 Roxy YALNIZ 1 kez çağrıldı", calls.length === 1, calls.length);
    ok("M3 tek kayıt", f.tables.human_design_charts.length === 1);
    ok("M4 aynı id", a.body.ok && b.body.ok && a.body.id === b.body.id);
    // DB seviyesinde: kilit atlanırsa (çoklu instance) PK/UNIQUE yine tek kayıt bırakır
    const f2 = seedDb();
    const noLock = makeDeps({ roxyDelayMs: 30, rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }) });
    const [c, d] = await Promise.all([computeRoxyChart(ctxA(f2.db), body, noLock.deps), computeRoxyChart(ctxA(f2.db), body, noLock.deps)]);
    ok("M5 kilit devre dışıyken bile DB tek kayıt + ikinci istek reused", f2.tables.human_design_charts.length === 1 && c.body.ok && d.body.ok && (c.body.reused || d.body.reused));
    const h1 = roxyInputHash({ tenantId: T_A, clientId: C_A, date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 1, longitude: 2, nodeType: "true", lang: "tr" });
    const h2 = roxyInputHash({ tenantId: T_A, clientId: C_A, date: "2018-07-20", time: "19:01:00", timezone: "Europe/Istanbul", latitude: 1, longitude: 2, nodeType: "true", lang: "tr" });
    const h3 = roxyInputHash({ tenantId: T_B, clientId: C_A, date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 1, longitude: 2, nodeType: "true", lang: "tr" });
    const h4 = roxyInputHash({ tenantId: T_A, clientId: C_A, date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 1, longitude: 2, nodeType: "mean", lang: "tr" });
    ok("M6 farklı saat / tenant / nodeType → farklı anahtar", h1 !== h2 && h1 !== h3 && h1 !== h4);
    ok("M7 tenant'lar arası id çakışmaz", roxyChartIdFor(T_A, h1) !== roxyChartIdFor(T_B, h1));
  }

  section("N) Yeniden açma / tekrar istek → Roxy çağrısı yok");
  {
    const f = seedDb();
    const { deps, calls } = makeDeps();
    const body = { client_id: C_A, location_id: "tr-42-konya" };
    const first = await computeRoxyChart(ctxA(f.db), body, deps);
    const again = await computeRoxyChart(ctxA(f.db), body, deps);
    ok("N1 ilk istek yeni hesap", first.body.ok && first.body.reused === false);
    ok("N2 ikinci istek kayıtlı sonuç (reused)", again.body.ok && again.body.reused === true);
    ok("N3 Roxy toplam 1 kez", calls.length === 1);
    const id = first.body.ok ? first.body.id : "";
    const g = await getComputedChart(f.db, T_A, id);
    ok("N4 detay okuma kayıtlı sonuçtan (Roxy çağrısı yok)", !!g.row && calls.length === 1);
    ok("N5 detay yanıtında provider_raw YOK", !!g.row && !("provider_raw" in g.row));
    const stored = f.tables.human_design_charts[0];
    ok("N6 ham Roxy yanıtı sunucuda ayrı kolonda korunur", JSON.stringify(stored.provider_raw).includes("typeDescription"));
    ok("N7 saklanan computed_result açıklama metni içermez", !JSON.stringify(stored.computed_result).includes("typeDescription"));
    ok("N8 skaler kolonlar uygulama kodları", stored.type_code === "generator" && stored.profile_code === "2_4" && stored.definition_code === "split" && stored.source === "computed" && stored.provider === "roxyapi");
    ok("N9 Roxy'ye giden istek: tz/koordinat sunucudan, nodeType politikadan", JSON.stringify(calls[0]) === JSON.stringify({ date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: konya!.latitude, longitude: konya!.longitude, nodeType: "true" }));
    // Doğum saati değişince yeni hesap
    f.tables.human_design_clients[0].birth_time = "19:30";
    const changed = await computeRoxyChart(ctxA(f.db), body, deps);
    ok("N10 doğum bilgisi değişince yeni hesap + yeni kayıt (eski korunur)", changed.body.ok && changed.body.reused === false && calls.length === 2 && f.tables.human_design_charts.length === 2);
  }

  // ── O) Sağlayıcı hataları ──
  section("O) Sağlayıcı zaman aşımı / ağ / HTTP hataları");
  {
    const cfg = { apiKey: SECRET, baseUrl: "https://roxyapi.com/api/v2" };
    const req = { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true" };
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    let seenBody = "";
    const okFetch = async (u: string, init: RequestInit) => {
      seenUrl = u;
      seenHeaders = init.headers as Record<string, string>;
      seenBody = String(init.body);
      return new Response(JSON.stringify(FIXTURE), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const good = await callRoxyBodygraph(cfg, req, { fetchImpl: okFetch });
    ok("O1 başarılı çağrı", good.ok);
    ok("O2 URL: /human-design/bodygraph?lang=tr", seenUrl === "https://roxyapi.com/api/v2/human-design/bodygraph?lang=tr", seenUrl);
    ok("O3 anahtar yalnız X-API-Key başlığında", seenHeaders["X-API-Key"] === SECRET && !seenUrl.includes(SECRET) && !seenBody.includes(SECRET));
    ok("O4 gövde nodeType=true", JSON.parse(seenBody).nodeType === "true");
    const hang = (_u: string, init: RequestInit) =>
      new Promise<Response>((_r, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const to = await callRoxyBodygraph(cfg, req, { fetchImpl: hang, timeoutMs: 30 });
    ok("O5 zaman aşımı → timeout", !to.ok && to.kind === "timeout");
    const net = await callRoxyBodygraph(cfg, req, { fetchImpl: async () => { throw new TypeError("fetch failed"); } });
    ok("O6 ağ hatası → network", !net.ok && net.kind === "network");
    const st = async (s: number) => (await callRoxyBodygraph(cfg, req, { fetchImpl: async () => new Response(`{"error":"bad key ${SECRET}"}`, { status: s }) }));
    const s401 = await st(401), s429 = await st(429), s500 = await st(503), s400 = await st(400);
    ok("O7 401 → unauthorized", !s401.ok && s401.kind === "unauthorized");
    ok("O8 429 → rate_limited", !s429.ok && s429.kind === "rate_limited");
    ok("O9 5xx → server_error", !s500.ok && s500.kind === "server_error");
    ok("O10 400 → bad_request", !s400.ok && s400.kind === "bad_request");
    ok("O11 sağlayıcı hata gövdesi (anahtar yansıması) dışarı aktarılmaz", !JSON.stringify([s401, s429, s500, s400]).includes(SECRET));
    const mal = await callRoxyBodygraph(cfg, req, { fetchImpl: async () => new Response("<html>oops", { status: 200 }) });
    ok("O12 bozuk JSON → malformed_json", !mal.ok && mal.kind === "malformed_json");

    for (const kind of ["timeout", "network", "unauthorized", "rate_limited", "bad_request", "server_error", "malformed_json"] as const) {
      const f = seedDb();
      const { deps } = makeDeps({ callRoxy: async () => ({ ok: false, kind, status: null }) });
      const r = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, deps);
      const txt = JSON.stringify(r);
      ok(`O servis ${kind}: hata + kayıt YOK + anahtar sızmaz + Türkçe mesaj`, !r.body.ok && f.tables.human_design_charts.length === 0 && !txt.includes(SECRET) && /[ışğüöçİ]/.test(txt));
    }
    const f = seedDb();
    const noCfg = makeDeps({ config: null });
    const rc = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, noCfg.deps);
    ok("O13 ROXY_API_KEY yok → 503, Roxy çağrısı yok", rc.status === 503 && noCfg.calls.length === 0);
    ok("O14 config: key yoksa null; http base reddedilir; https kabul", readRoxyServerConfig({} as NodeJS.ProcessEnv) === null && readRoxyServerConfig({ ROXY_API_KEY: "x", ROXY_API_BASE_URL: "http://evil" } as unknown as NodeJS.ProcessEnv) === null && readRoxyServerConfig({ ROXY_API_KEY: "x" } as unknown as NodeJS.ProcessEnv)?.baseUrl === "https://roxyapi.com/api/v2");
    ok("O15 politika merkezi: nodeType=true, lang=tr, timeout>0", ROXY_POLICY.nodeType === "true" && ROXY_POLICY.lang === "tr" && ROXY_POLICY.timeoutMs > 0);
  }

  // ── P) Bozuk sağlayıcı yanıtı ──
  section("P) Bozuk / tutarsız sağlayıcı yanıtı DB'ye yazılmaz");
  for (const [name, mut] of [
    ["boş nesne", () => ({})],
    ["eksik gates", () => { const x = clone(FIXTURE); delete x.gates; return x; }],
    ["kanal çelişkisi", () => { const x = clone(FIXTURE); (x.channels as unknown[]).pop(); return x; }],
    ["bilinmeyen authority", () => { const x = clone(FIXTURE); x.authority = "Gut Feeling"; return x; }],
  ] as const) {
    const f = seedDb();
    const { deps } = makeDeps({ roxyRaw: (mut as () => unknown)() });
    const r = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, deps);
    ok(`P ${name} → 502, kayıt yok`, r.status === 502 && f.tables.human_design_charts.length === 0);
  }
  {
    const f = seedDb([], { missingColumns: ["provider", "provider_raw", "input_hash"] });
    const { deps, calls } = makeDeps();
    const r = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, deps);
    ok("P migration uygulanmamış → 503, Roxy ÇAĞRILMAZ (ücret yok)", r.status === 503 && calls.length === 0 && f.tables.human_design_charts.length === 0);
  }
  {
    const f = seedDb();
    const { deps, calls } = makeDeps();
    const free = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "Konya" }, deps);
    ok("P serbest metin konum → 422, Roxy çağrısı yok", free.status === 422 && calls.length === 0);
    f.tables.human_design_clients[0].birth_time = null;
    const nt = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, deps);
    ok("P doğum saati yok → 422", nt.status === 422 && !nt.body.ok && nt.body.code === "MISSING_BIRTH_DATA");
    f.tables.human_design_clients[0].birth_time = "02:30";
    f.tables.human_design_clients[0].birth_date = "2020-03-29";
    const gap = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "gn-2950159" }, deps);
    ok("P DST boşluğu → 422 açıklayıcı, Roxy çağrısı yok", gap.status === 422 && !gap.body.ok && gap.body.code === "BIRTH_TIME_NONEXISTENT" && calls.length === 0);
    f.tables.human_design_clients[0].birth_date = "2020-10-25";
    const amb = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "gn-2950159" }, deps);
    ok("P DST çakışması → 422, Roxy çağrısı yok", amb.status === 422 && !amb.body.ok && amb.body.code === "BIRTH_TIME_AMBIGUOUS" && calls.length === 0);
    const bad = await computeRoxyChart(ctxA(f.db), { client_id: "x" }, deps);
    ok("P geçersiz client_id → 400", bad.status === 400);
  }

  // ── Q) Manuel regresyon ──
  section("Q) Manuel harita regresyonu");
  {
    const f = seedDb();
    const s1 = await saveManualChart(f.db, T_A, C_A, { type_code: "generator", gates: [1, 2], channels: [], active_centers: [], open_centers: [] });
    ok("Q1 manuel kayıt oluşturulur (deterministik id)", s1.ok && s1.id === manualChartIdFor(T_A, C_A));
    const { deps } = makeDeps();
    await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, deps);
    const m = await getManualChartByClient(f.db, T_A, C_A);
    ok("Q2 manuel okuma Roxy kaydını görmez (üzerine yazma yok)", !!m.row && m.row.id === manualChartIdFor(T_A, C_A) && (m.row.gates as number[]).join() === "1,2");
    const list = await listManualChartsWithClients(f.db, T_A);
    ok("Q3 manuel liste yalnız manuel satır", list.rows.length === 1 && list.rows[0].source !== "computed");
    const s2 = await saveManualChart(f.db, T_A, C_A, { type_code: "projector" });
    ok("Q4 manuel güncelleme çalışır, Roxy kaydı etkilenmez", s2.ok && f.tables.human_design_charts.find((r) => r.provider === "roxyapi")?.type_code === "generator");
    const cross = await saveManualChart(f.db, T_A, C_B, { type_code: "generator" });
    ok("Q5 manuel: başka tenant danışanı reddi (mevcut davranış)", !cross.ok);
  }

  // ── R) Eski computed regresyonu ──
  section("R) Eski (dahili motor) computed kayıt regresyonu");
  {
    const legacyRow = {
      id: "legacy-1", tenant_id: T_A, source: "computed", client_id: C_A, computed_result: legacy,
      type_code: legacy.type, authority_code: legacy.authority, profile_code: legacy.profile, definition_code: legacy.definition.kind,
    };
    const f = seedDb([legacyRow]);
    const g = await getComputedChart(f.db, T_A, "legacy-1");
    ok("R1 eski kayıt okunur", !!g.row && (g.row.computed_result as { schemaVersion: string }).schemaVersion === "1.0");
    let html = "";
    try {
      html = renderToStaticMarkup(createElement(HdComputedChartView, { result: legacy as unknown as HdComputedChart }));
    } catch (e) {
      html = "ERR " + String(e);
    }
    ok("R2 eski kayıt yeni görünümde render olur", html.includes('data-hd-computed-view="engine"') && (html.match(/<polygon/g) ?? []).length === 9, html.slice(0, 200));
    ok("R3 eski kayıt Türkçe etiketler (RAW → kod)", html.includes("Sacral Otorite") && html.includes("2/4"));
    const { deps, calls } = makeDeps();
    const r = await computeRoxyChart(ctxA(f.db), { client_id: C_A, location_id: "tr-42-konya" }, deps);
    ok("R4 Roxy kaydı eski kaydı bozmaz", r.body.ok && calls.length === 1 && f.tables.human_design_charts.find((x) => x.id === "legacy-1")?.computed_result === legacy);
  }

  // ── S) Manuel uç computed silemez ──
  section("S) Manuel silme ucu hesaplanmış kaydı SİLEMEZ");
  {
    const f = seedDb([
      { id: "comp-1", tenant_id: T_A, source: "computed", client_id: C_A },
      { id: "man-1", tenant_id: T_A, source: "manual", client_id: C_A },
      { id: "leg-1", tenant_id: T_A, source: null, client_id: C_A },
      { id: "man-b", tenant_id: T_B, source: "manual", client_id: C_B },
    ]);
    const d1 = await deleteManualChart(f.db, T_A, "comp-1");
    ok("S1 computed id ile manuel silme → başarısız", !d1.ok);
    ok("S2 computed satır duruyor", f.tables.human_design_charts.some((r) => r.id === "comp-1"));
    const d2 = await deleteManualChart(f.db, T_A, "man-1");
    const d3 = await deleteManualChart(f.db, T_A, "leg-1");
    ok("S3 manuel + legacy(NULL) satır silinir", d2.ok && d3.ok && !f.tables.human_design_charts.some((r) => r.id === "man-1" || r.id === "leg-1"));
    const d4 = await deleteManualChart(f.db, T_A, "man-b");
    ok("S4 başka tenant'ın manuel satırı silinemez", !d4.ok && f.tables.human_design_charts.some((r) => r.id === "man-b"));
  }

  // ── T/U) Render ──
  section("T) BodyGraph render (gerçek Roxy verisi)");
  {
    const html = renderToStaticMarkup(createElement(BodyGraph, { result: chart }));
    const uniq = new Set(chart.activations.map((a) => a.gate)).size;
    ok("T1 9 merkez polygon", (html.match(/<polygon/g) ?? []).length === 9);
    ok("T2 circle sayısı = aktif kapı sayısı", (html.match(/<circle/g) ?? []).length === uniq, { circles: (html.match(/<circle/g) ?? []).length, uniq });
    ok("T3 a11y özeti 6 merkez / 4 kanal", /6 tanımlı merkez/.test(html) && /4 tanımlı kanal/.test(html), html.match(/<desc[^>]*>[^<]*/)?.[0]);
  }
  section("U) Design / Personality sütunları");
  {
    for (const [side, ref] of [["design", REF_D], ["personality", REF_P]] as const) {
      const html = renderToStaticMarkup(createElement(HdPlanetColumn, { activations: chart.activations, side }));
      const items = [...html.matchAll(/data-hd-activation="([^"]+)"/g)].map((m) => m[1]);
      ok(`U ${side}: 13 satır`, items.length === 13, items.length);
      ok(`U ${side}: sıra + gate.line referansla birebir`, ref.every(([b, gl]) => items.includes(`${side}:${b}:${gl}`)), items);
      ok(`U ${side}: ilk satır Sun, ikinci Earth`, items[0]?.startsWith(`${side}:Sun:`) && items[1]?.startsWith(`${side}:Earth:`));
    }
    const view = renderToStaticMarkup(createElement(HdComputedChartView, { result: chart }));
    ok("U görünüm: Design → BodyGraph → Personality DOM sırası (mobilde order ile BodyGraph üstte)", view.indexOf('data-hd-side="design"') < view.indexOf("<svg") && view.indexOf("<svg") < view.indexOf('data-hd-side="personality"'));
    ok("U görünüm: lg'de üç sütun sırası / mobilde BodyGraph order-1", /order-1[^"]*lg:order-2/.test(view));
    ok("U görünüm: Tip/Strateji/Otorite/İmza/Not-Self/Profil/Tanım/Haç", ["Tip", "Strateji", "Otorite", "İmza", "Benlik-dışı", "Profil", "Tanım", "Enkarnasyon Haçı"].every((l) => view.includes(l)));
    ok("U görünüm: Türkçe değerler", view.includes("Yanıt vermek için beklemek") && view.includes("Tatmin") && view.includes("Sacral Otorite") && view.includes("Right Angle Cross of Laws 2"));
    ok("U görünüm: 9 merkez durumu", (view.match(/data-hd-center="/g) ?? []).length === 9 && view.includes('data-hd-center="g_identity:open"') && view.includes('data-hd-center="sacral:defined"'));
    ok("U görünüm: 4 kanal + aktif kapılar", (view.match(/data-hd-channel="/g) ?? []).length === 4 && (view.match(/data-hd-gate="/g) ?? []).length === n.codes.gates.length);
    ok("U görünüm: Roxy açıklama metni YOK", !view.includes("enveloping") && !view.includes("storyteller"));
  }

  // ── Statik güvenlik taraması ──
  section("Statik güvenlik taraması (anahtar / istemci paketi)");
  {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        if (e === "node_modules" || e === ".next" || e === ".git") continue;
        const p = join(d, e);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else if (/\.(tsx?|mjs|js|json)$/.test(e)) files.push(p);
      }
    };
    for (const d of ["app", "lib", "components", "hooks"]) walk(join(ROOT, d));
    const offenders = files.filter((p) => /NEXT_PUBLIC_ROXY/.test(readFileSync(p, "utf8")));
    ok("SEC1 NEXT_PUBLIC_ROXY* yok", offenders.length === 0, offenders);
    const clientImporters = files.filter((p) => {
      const s = readFileSync(p, "utf8");
      return /^\s*["']use client["']/.test(s) && /providers\/roxy\/(client|config)|roxyChartService|hdBirthLocation|location\/server/.test(s);
    });
    ok("SEC2 hiçbir client bileşeni Roxy istemcisi/config/sunucu konumu import etmez", clientImporters.length === 0, clientImporters);
    const literalKeys = files.filter((p) => /X-API-Key["']?\s*:\s*["'][A-Za-z0-9]/.test(readFileSync(p, "utf8")));
    ok("SEC3 kaynakta sabit API anahtarı yok", literalKeys.length === 0, literalKeys);
    const fixtureTxt = readFileSync(join(HERE, "fixtures", "roxy-bodygraph-2018-07-20.json"), "utf8");
    ok("SEC4 fixture anahtar içermez", !/api[_-]?key|x-api-key|sk-/i.test(fixtureTxt));
  }

  console.log(`\n${passed} PASS / ${failed} FAIL`);
  if (failed > 0) {
    console.log("FAIL listesi:\n - " + fails.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
