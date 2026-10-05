// RoxyAPI → Yaşam Sistemi normalizasyonu (SAF, deterministik).
//
// Doğrulanmış Roxy yanıtını (schema.ts) mevcut `HdComputedChart` sözleşmesine çevirir.
// Değer eşlemesi YALNIZ merkezi `normalize/hdAppCodes.ts` üzerinden yapılır.
//
// HESAP YOK: Yaşam Sistemi motoru (astronomi) burada KULLANILMAZ. Yalnız BodyGraph'ın da
// kullandığı sabit 36-kanal/9-merkez TOPOLOJİ tablosu (engine/channels — saf veri) ile
// Roxy'nin kendi içindeki tutarlılığı denetlenir: BodyGraph aktivasyonlardan kanal/merkez
// türetir; Roxy'nin bildirdiği kanal/merkezler bununla örtüşmezse ekranda çelişkili bir
// harita gösterilmemesi için sonuç REDDEDİLİR (fail-closed, DB'ye yazılmaz).

import { getActiveGates, getDefinedCenters, getDefinedChannels, CENTERS, type CenterName } from "../../engine/channels";
import type { PlanetName } from "../../engine/types";
import type { HdComputedChart } from "../../chart/computedChart";
import {
  APP_CENTER_TO_ENGINE_CENTER,
  toAppAuthorityCode,
  toAppCenterCode,
  toAppChannelCode,
  toAppDefinitionCode,
  toAppProfileCode,
  toAppTypeCode,
  type HdAppChartCodes,
} from "../../normalize/hdAppCodes";
import type { HdCenterCode, HdChannelCode } from "../../types";
import { ROXY_ADAPTER_VERSION, ROXY_BODYGRAPH_ENDPOINT, ROXY_PROVIDER_ID } from "./config";
import type { RoxyBodygraph } from "./schema";

/** Roxy gezegen adı → uygulama PlanetName (BodyGraph/glif sözlüğü). */
const ROXY_PLANET: Readonly<Record<string, PlanetName>> = {
  sun: "Sun",
  earth: "Earth",
  moon: "Moon",
  northnode: "NorthNode",
  southnode: "SouthNode",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
};
const ALL_PLANETS = new Set<PlanetName>(Object.values(ROXY_PLANET));

export function toPlanetName(raw: string): PlanetName | null {
  return ROXY_PLANET[raw.trim().toLowerCase().replace(/[\s_\-]+/g, "")] ?? null;
}

/** Normalizasyon girdisi: sunucunun doğruladığı doğum bilgisi (Roxy'ye gönderilenle aynı). */
export type RoxyNormalizeInput = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timezone: string; // IANA
  latitude: number;
  longitude: number;
  nodeType: string;
  lang: string;
  /** Sunucunun IANA ile çözdüğü doğum anı (UTC ISO). */
  birthUtcIso: string;
};

export type RoxyNormalizeResult =
  | { ok: true; chart: HdComputedChart; codes: HdAppChartCodes }
  | { ok: false; errors: string[] };

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export function normalizeRoxyBodygraph(r: RoxyBodygraph, input: RoxyNormalizeInput): RoxyNormalizeResult {
  const errors: string[] = [];

  // ── Kimlik alanları → uygulama kodları ──
  const type_code = toAppTypeCode(r.type);
  const authority_code = toAppAuthorityCode(r.authority);
  const profile_code = toAppProfileCode(r.profile);
  const definition_code = toAppDefinitionCode(r.definition);
  if (!type_code) errors.push(`bilinmeyen type: ${r.type}`);
  if (!authority_code) errors.push(`bilinmeyen authority: ${r.authority}`);
  if (!profile_code) errors.push(`bilinmeyen profile: ${r.profile}`);
  if (!definition_code) errors.push(`bilinmeyen definition: ${r.definition}`);

  // ── Aktivasyonlar (13 + 13, her tarafta her gezegen tam bir kez) ──
  const activations: HdComputedChart["activations"] = [];
  for (const side of ["personality", "design"] as const) {
    const seen = new Set<PlanetName>();
    for (const a of r.activations.filter((x) => x.side === side)) {
      const body = toPlanetName(a.planet);
      if (!body) {
        errors.push(`bilinmeyen gezegen: ${a.planet}`);
        continue;
      }
      if (seen.has(body)) {
        errors.push(`${side}: ${a.planet} birden fazla kez`);
        continue;
      }
      seen.add(body);
      activations.push({ body, side, gate: a.gate, line: a.line });
    }
    if (seen.size !== ALL_PLANETS.size) errors.push(`${side}: 13 gezegenin tamamı bekleniyor (gelen ${seen.size})`);
  }

  // ── Merkezler ──
  const defined: HdCenterCode[] = [];
  const open: HdCenterCode[] = [];
  const centerSeen = new Set<HdCenterCode>();
  for (const c of r.centers) {
    const code = toAppCenterCode(c.id) ?? toAppCenterCode(c.name);
    if (!code) {
      errors.push(`bilinmeyen merkez: ${c.id}`);
      continue;
    }
    if (centerSeen.has(code)) {
      errors.push(`merkez tekrarı: ${c.id}`);
      continue;
    }
    centerSeen.add(code);
    (c.defined ? defined : open).push(code);
  }
  if (centerSeen.size !== 9) errors.push("9 farklı merkez bekleniyor");

  // ── Kanallar ──
  const channelCodes: HdChannelCode[] = [];
  for (const ch of r.channels) {
    const code = toAppChannelCode(ch.gateA, ch.gateB);
    if (!code) {
      errors.push(`resmi 36 kanal dışında: ${ch.gateA}-${ch.gateB}`);
      continue;
    }
    if (!channelCodes.includes(code)) channelCodes.push(code);
  }

  if (errors.length > 0) return { ok: false, errors };

  // ── İç tutarlılık (BodyGraph topolojisi ile) ──
  const activeGates = getActiveGates(activations);
  const derivedChannels = getDefinedChannels(activeGates);
  const derivedCenters = getDefinedCenters(derivedChannels);
  if (!sameSet(derivedChannels.map((c) => c.id), channelCodes)) {
    errors.push(
      `kanal tutarsızlığı: Roxy [${channelCodes.join(",")}] ≠ aktivasyonlardan [${derivedChannels.map((c) => c.id).join(",")}]`,
    );
  }
  const definedEngineNames = defined.map((c) => APP_CENTER_TO_ENGINE_CENTER[c]);
  if (!sameSet(derivedCenters, definedEngineNames)) {
    errors.push(`merkez tutarsızlığı: Roxy [${definedEngineNames.join(",")}] ≠ kanallardan [${derivedCenters.join(",")}]`);
  }
  const pick = (side: "personality" | "design", body: PlanetName) =>
    activations.find((a) => a.side === side && a.body === body);
  const pSun = pick("personality", "Sun");
  const pEarth = pick("personality", "Earth");
  const dSun = pick("design", "Sun");
  const dEarth = pick("design", "Earth");
  if (pSun && pEarth && dSun && dEarth) {
    const crossGates = [pSun.gate, pEarth.gate, dSun.gate, dEarth.gate];
    if (crossGates.join(",") !== r.incarnationCross.gates.join(",")) {
      errors.push(`cross kapıları tutarsız: Roxy [${r.incarnationCross.gates.join(",")}] ≠ Güneş/Dünya [${crossGates.join(",")}]`);
    }
    if (profile_code && profile_code !== `${pSun.line}_${dSun.line}`) {
      errors.push(`profil tutarsız: Roxy ${r.profile} ≠ Güneş çizgileri ${pSun.line}/${dSun.line}`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // ── Sözleşme ──
  const orderIdx = (c: CenterName) => CENTERS.indexOf(c);
  const definedCenters = (definedEngineNames as CenterName[]).sort((a, b) => orderIdx(a) - orderIdx(b));
  const openCenters = CENTERS.filter((c) => !definedCenters.includes(c));
  const roxyNameByCode = new Map(r.channels.map((ch) => [toAppChannelCode(ch.gateA, ch.gateB), ch.name] as const));

  const birthMs = Date.parse(input.birthUtcIso);
  const designMs = Date.parse(r.designInstantUtc);

  const codes: HdAppChartCodes = {
    type_code: type_code!,
    authority_code: authority_code!,
    profile_code: profile_code!,
    definition_code: definition_code!,
    active_centers: CENTERS.filter((c) => definedCenters.includes(c)).map(
      (c) => (Object.keys(APP_CENTER_TO_ENGINE_CENTER) as HdCenterCode[]).find((k) => APP_CENTER_TO_ENGINE_CENTER[k] === c)!,
    ),
    open_centers: openCenters.map(
      (c) => (Object.keys(APP_CENTER_TO_ENGINE_CENTER) as HdCenterCode[]).find((k) => APP_CENTER_TO_ENGINE_CENTER[k] === c)!,
    ),
    gates: [...new Set(activations.map((a) => a.gate))].sort((a, b) => a - b),
    channels: derivedChannels.map((c) => c.id as HdChannelCode),
  };

  const chart: HdComputedChart = {
    schemaVersion: "1.0",
    meta: {
      engine: ROXY_PROVIDER_ID,
      nodeType: input.nodeType,
      calibrationStatus: "provider",
      disclaimer: "Bu harita RoxyAPI tarafından hesaplanmıştır; Yaşam Sistemi yalnız doğrular ve normalize eder.",
    },
    input: {
      date: input.date,
      time: input.time,
      timezone: input.timezone,
      location: { lat: input.latitude, lon: input.longitude },
    },
    timing: {
      birthUtcIso: input.birthUtcIso,
      designUtcIso: new Date(designMs).toISOString(),
      daysBeforeBirth: Math.round(((birthMs - designMs) / 86_400_000) * 1000) / 1000,
    },
    activations,
    type: r.type,
    authority: r.authority,
    profile: r.profile,
    definition: { kind: r.definition, definedCenters },
    centers: { defined: definedCenters, open: openCenters },
    channels: derivedChannels.map((c) => ({
      id: c.id,
      name: roxyNameByCode.get(c.id as HdChannelCode) ?? c.name,
      gates: [c.gateA, c.gateB] as [number, number],
      centers: [c.centerA, c.centerB] as [CenterName, CenterName],
    })),
    incarnationCross: {
      gates: r.incarnationCross.gates,
      angle: r.incarnationCross.angle,
      ...(r.incarnationCross.angleCode ? { angleCode: r.incarnationCross.angleCode } : {}),
      name: r.incarnationCross.name,
      status: "provider",
    },
    validation: {
      overall: "not-yet-validated",
      reasons: ["Sağlayıcı (RoxyAPI) hesabı — Yaşam Sistemi dahili golden doğrulaması bu sonuca uygulanmaz."],
    },
    warnings: [],
    strategy: r.strategy,
    signature: r.signature,
    notSelf: r.notSelf,
    provider: {
      id: ROXY_PROVIDER_ID,
      endpoint: ROXY_BODYGRAPH_ENDPOINT,
      nodeType: input.nodeType,
      lang: input.lang,
      adapterVersion: ROXY_ADAPTER_VERSION,
      designInstantUtc: r.designInstantUtc,
    },
    appCodes: codes,
  };
  return { ok: true, chart, codes };
}
