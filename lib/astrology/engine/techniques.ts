// Astroloji Hesap Motoru — TEKNİK KAYIT DEFTERİ (SAF).
//
// Her teknik, doğum revizyonu (+ gerekiyorsa karşı taraf revizyonu) + yöntem seçeneklerinden 1..n
// "hesap birimi" (sağlayıcı endpoint'i + normalize gövde) üretir. Planlayıcı birimleri tekilleştirir,
// kapsananları budar ve önbellekle karşılaştırır → "X hesap seçildi → Y yeni istek → Z kayıtlı sonuç".
//
// AŞAMA 1: western.natal · AŞAMA 3: transit, forecast, progression, solar_arc, solar/lunar return,
// synastry, composite. Seçenekler parseOptions'ta NORMALİZE edilir (ör. "şimdi" → UTC saat başı) ve
// normalize hali önbellek anahtarına girer → aynı girdi aynı anahtar, farklı tarih/yıl farklı anahtar.

import { ASTRO_PROVIDER_LANG, ROXY_API_VERSION, ROXY_PROVIDER } from "../config";
import {
  buildNatalRequestBody,
  parseNatalOptions,
  projectRoxyNatal,
  ROXY_NATAL_ADAPTER_VERSION,
  ROXY_NATAL_ENDPOINT,
  ROXY_NATAL_PROJECTION_VERSION,
  type NatalMethodOptions,
} from "../providers/roxy/natal";
import { HOUSE_SYSTEMS, NATAL_INTERP_SCHEMA, NATAL_TECHNICAL_SCHEMA, NODE_TYPES, type HouseSystem, type NodeType } from "../model/western";
import {
  COMPOSITE_INTERP_SCHEMA,
  COMPOSITE_TECHNICAL_SCHEMA,
  FORECAST_TECHNICAL_SCHEMA,
  PROGRESSION_INTERP_SCHEMA,
  PROGRESSION_TECHNICAL_SCHEMA,
  RETURN_INTERP_SCHEMA,
  RETURN_TECHNICAL_SCHEMA,
  SOLAR_ARC_INTERP_SCHEMA,
  SOLAR_ARC_TECHNICAL_SCHEMA,
  SYNASTRY_INTERP_SCHEMA,
  SYNASTRY_TECHNICAL_SCHEMA,
  TRANSIT_INTERP_SCHEMA,
  TRANSIT_TECHNICAL_SCHEMA,
  type ForecastTechnical,
} from "../model/westernTiming";
import {
  forecastBody,
  forecastChunks,
  FORECAST_MAX_DAYS,
  lunarReturnBody,
  pairBody,
  solarReturnBody,
  targetDateBody,
  transitBody,
  type BirthPoint,
} from "../providers/roxy/requests";
import {
  mergeForecast,
  projectRoxyComposite,
  projectRoxyForecast,
  projectRoxyProgression,
  projectRoxyReturn,
  projectRoxySolarArc,
  projectRoxySynastry,
  projectRoxyTransit,
  ROXY_COMPOSITE,
  ROXY_FORECAST,
  ROXY_LUNAR_RETURN,
  ROXY_PROGRESSION,
  ROXY_SOLAR_ARC,
  ROXY_SOLAR_RETURN,
  ROXY_SYNASTRY,
  ROXY_TRANSIT,
  type AdapterResult,
} from "../providers/roxy/timing";
import { isValidIanaTimeZone, isValidIsoDate, resolveAstroBirthTime } from "../birth/timeResolution";
import { lunarReturnApproxDate, natalMoonLongitude } from "./lunarReturnDate";
import { calcInputHash } from "./inputHash";

export type TechniqueProjection =
  | {
      ok: true;
      technical: unknown;
      technicalSchema: string;
      interpretation: unknown;
      interpretationSchema: string | null;
      projectionVersion: string;
      unmappedFields: string[];
      droppedValues: string[];
    }
  | { ok: false; errors: string[] };

export const TECHNIQUE_IDS = [
  "western.natal",
  "western.transit",
  "western.forecast",
  "western.progression",
  "western.solar_arc",
  "western.solar_return",
  "western.lunar_return",
  "western.synastry",
  "western.composite",
] as const;
export type TechniqueId = (typeof TECHNIQUE_IDS)[number];

/** Geriye dönük uyum (Aşama 1/2): tek kişilik doğum girdisi. */
export type NatalBirthInput = BirthPoint;

export type UnitContext = {
  birth: BirthPoint;
  birthUtc: string;
  partner: BirthPoint | null;
};

export type CalcUnit = {
  technique: TechniqueId;
  provider: string;
  providerApiVersion: string;
  adapterVersion: string;
  endpoint: string;
  lang: string;
  body: Record<string, unknown>;
  inputHash: string;
  /** Bu birimin yanıtının KAPSADIĞI diğer endpoint'ler (planlayıcı budaması için). */
  covers: string[];
  /** Zamana bağlı mı (hedef tarih anahtarın parçası)? */
  timeDependent: boolean;
  /** Çok parçalı tekniklerde parça sırası (forecast). */
  part: number;
};

export type TechniqueDefinition = {
  id: TechniqueId;
  label: string;
  family: "western" | "vedic" | "kp";
  requiresPartner: boolean;
  /** Doğum saati bilinmeden güvenilir çalışmaz → reddedilir (ör. return). */
  requiresKnownTime: boolean;
  timeDependent: boolean;
  /** `now` yalnız "şimdi" normalizasyonu için (deterministik: UTC saat başı). */
  parseOptions: (raw: unknown, now: Date) => Record<string, unknown> | null;
  units: (ctx: UnitContext, options: Record<string, unknown>) => CalcUnit[];
  project: (unit: CalcUnit, raw: unknown, options: Record<string, unknown>) => TechniqueProjection;
  /** Çok parçalı sonuçları birleştir (yoksa tek parça). */
  combineTechnical?: (parts: unknown[], options: Record<string, unknown>) => unknown;
};

function unit(technique: TechniqueId, meta: { endpoint: string; adapter: string }, body: Record<string, unknown>, extra: Partial<CalcUnit> = {}): CalcUnit {
  const identity = {
    provider: ROXY_PROVIDER,
    providerApiVersion: ROXY_API_VERSION,
    adapterVersion: meta.adapter,
    endpoint: meta.endpoint,
    lang: ASTRO_PROVIDER_LANG,
    body,
  };
  return { technique, ...identity, inputHash: calcInputHash(identity), covers: [], timeDependent: false, part: 0, ...extra };
}

function fromAdapter<T, I>(r: AdapterResult<T, I>, technicalSchema: string, interpretationSchema: string | null, projectionVersion: string): TechniqueProjection {
  if (!r.ok) return r;
  return {
    ok: true,
    technical: r.technical,
    technicalSchema,
    interpretation: r.interpretation,
    interpretationSchema: r.interpretation === null ? null : interpretationSchema,
    projectionVersion,
    unmappedFields: r.unmappedFields,
    droppedValues: r.droppedValues,
  };
}

// ─── Seçenek ayrıştırıcıları (normalize) ─────────────────────────────────────

const o = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
const nodeTypeOf = (v: unknown): NodeType | null => ((v ?? "true") === "true" || v === "mean" ? ((v ?? "true") as NodeType) : null);
const houseOf = (v: unknown): HouseSystem | null => {
  const h = v ?? "placidus";
  return (HOUSE_SYSTEMS as readonly unknown[]).includes(h) ? (h as HouseSystem) : null;
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const yearOk = (y: number) => Number.isInteger(y) && y >= 1600 && y <= 2600;

/** Transit anı → UTC dakika ("YYYY-MM-DDTHH:MM"). "Şimdi" = UTC saat başına yuvarlanır (deterministik). */
export function normalizeTransitMoment(raw: Record<string, unknown>, now: Date): string | null {
  if (raw.now === true) {
    const d = new Date(now);
    d.setUTCMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  }
  if (typeof raw.atUtc === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw.atUtc) && isValidIsoDate(raw.atUtc.slice(0, 10))) return raw.atUtc;
  const date = typeof raw.date === "string" ? raw.date : "";
  const time = typeof raw.time === "string" ? raw.time : "";
  const tz = typeof raw.timezone === "string" ? raw.timezone : "";
  if (!isValidIsoDate(date) || !/^\d{2}:\d{2}$/.test(time) || !isValidIanaTimeZone(tz)) return null;
  // Belirsiz yerel saatlerde ilk yaşanan an (transit için kullanıcı seçimi gerektirmeyecek kadar küçük fark).
  const r = resolveAstroBirthTime(date, time, tz, "earlier");
  return r.kind === "ok" ? r.utcIso.slice(0, 16) : null;
}

// ─── Teknikler ───────────────────────────────────────────────────────────────

const westernNatal: TechniqueDefinition = {
  id: "western.natal",
  label: "Natal",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: false,
  parseOptions: (raw) => parseNatalOptions(raw),
  units: (ctx, options) => [
    unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: ROXY_NATAL_ADAPTER_VERSION }, buildNatalRequestBody(ctx.birth, options as NatalMethodOptions), {
      covers: ["/astrology/planets", "/astrology/houses", "/astrology/aspects", "/astrology/aspect-patterns"],
    }),
  ],
  project: (_u, raw, options) => {
    const p = projectRoxyNatal(raw, options as NatalMethodOptions);
    if (!p.ok) return p;
    return {
      ok: true,
      technical: p.value.technical,
      technicalSchema: NATAL_TECHNICAL_SCHEMA,
      interpretation: p.value.interpretation,
      interpretationSchema: NATAL_INTERP_SCHEMA,
      projectionVersion: ROXY_NATAL_PROJECTION_VERSION,
      unmappedFields: p.value.unmappedFields,
      droppedValues: p.value.droppedValues,
    };
  },
};

const westernTransit: TechniqueDefinition = {
  id: "western.transit",
  label: "Transit (tek an)",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const r = o(raw);
    const atUtc = normalizeTransitMoment(r, now);
    const nodeType = nodeTypeOf(r.nodeType);
    return atUtc && nodeType ? { atUtc, nodeType } : null;
  },
  units: (ctx, opt) => {
    const at = String(opt.atUtc);
    return [unit("western.transit", ROXY_TRANSIT, transitBody(ctx.birth, { date: at.slice(0, 10), time: `${at.slice(11, 16)}:00` }, opt.nodeType as NodeType), { timeDependent: true })];
  },
  project: (_u, raw, opt) => fromAdapter(projectRoxyTransit(raw, { nodeType: opt.nodeType as NodeType, atUtc: `${opt.atUtc}Z` }), TRANSIT_TECHNICAL_SCHEMA, TRANSIT_INTERP_SCHEMA, ROXY_TRANSIT.projection),
};

const westernForecast: TechniqueDefinition = {
  id: "western.forecast",
  label: "Transit takvimi (dönem)",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw) => {
    const r = o(raw);
    const days = Number(r.days ?? 90);
    if (typeof r.startDate !== "string" || !isValidIsoDate(r.startDate) || !Number.isInteger(days) || days < 1 || days > FORECAST_MAX_DAYS) return null;
    return { startDate: r.startDate, days };
  },
  units: (ctx, opt) =>
    forecastChunks(String(opt.startDate), Number(opt.days)).map((c, i) =>
      unit("western.forecast", ROXY_FORECAST, forecastBody(ctx.birth, c.start, c.end), { timeDependent: true, part: i }),
    ),
  project: (_u, raw) => fromAdapter(projectRoxyForecast(raw), FORECAST_TECHNICAL_SCHEMA, null, ROXY_FORECAST.projection),
  combineTechnical: (parts, opt) => {
    const chunks = forecastChunks(String(opt.startDate), Number(opt.days));
    return mergeForecast(parts as ForecastTechnical[], { start: chunks[0].start, end: chunks[chunks.length - 1].end });
  },
};

const targetDateTechnique = (id: "western.progression" | "western.solar_arc", label: string, meta: typeof ROXY_PROGRESSION | typeof ROXY_SOLAR_ARC): TechniqueDefinition => ({
  id,
  label,
  family: "western",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw) => {
    const r = o(raw);
    const nodeType = nodeTypeOf(r.nodeType);
    if (typeof r.targetDate !== "string" || !isValidIsoDate(r.targetDate) || !nodeType) return null;
    return { targetDate: r.targetDate, nodeType };
  },
  units: (ctx, opt) => [unit(id, meta, targetDateBody(ctx.birth, String(opt.targetDate), opt.nodeType as NodeType), { timeDependent: true })],
  project: (_u, raw, opt) =>
    id === "western.progression"
      ? fromAdapter(projectRoxyProgression(raw, { nodeType: opt.nodeType as NodeType, targetDate: String(opt.targetDate) }), PROGRESSION_TECHNICAL_SCHEMA, PROGRESSION_INTERP_SCHEMA, meta.projection)
      : fromAdapter(projectRoxySolarArc(raw, { nodeType: opt.nodeType as NodeType, targetDate: String(opt.targetDate) }), SOLAR_ARC_TECHNICAL_SCHEMA, SOLAR_ARC_INTERP_SCHEMA, meta.projection),
});

const westernSolarReturn: TechniqueDefinition = {
  id: "western.solar_return",
  label: "Solar return",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: true,
  parseOptions: (raw) => {
    const r = o(raw);
    const y = Number(r.returnYear);
    const hs = houseOf(r.houseSystem);
    return yearOk(y) && hs ? { returnYear: y, houseSystem: hs } : null;
  },
  units: (ctx, opt) => [unit("western.solar_return", ROXY_SOLAR_RETURN, solarReturnBody(ctx.birth, Number(opt.returnYear), opt.houseSystem as HouseSystem), { timeDependent: true })],
  project: (_u, raw, opt) =>
    fromAdapter(projectRoxyReturn(raw, "solar", { houseSystem: opt.houseSystem as HouseSystem, returnYear: Number(opt.returnYear), returnDate: null }), RETURN_TECHNICAL_SCHEMA, RETURN_INTERP_SCHEMA, ROXY_SOLAR_RETURN.projection),
};

const westernLunarReturn: TechniqueDefinition = {
  id: "western.lunar_return",
  label: "Lunar return",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: true,
  parseOptions: (raw) => {
    const r = o(raw);
    const hs = houseOf(r.houseSystem);
    if (typeof r.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) || !yearOk(Number(r.month.slice(0, 4))) || !hs) return null;
    return { month: r.month, houseSystem: hs };
  },
  units: (ctx, opt) => {
    const returnDate = lunarReturnApproxDate(natalMoonLongitude(ctx.birthUtc), String(opt.month));
    if (!returnDate) return [];
    return [unit("western.lunar_return", ROXY_LUNAR_RETURN, lunarReturnBody(ctx.birth, returnDate, opt.houseSystem as HouseSystem), { timeDependent: true })];
  },
  project: (u, raw, opt) =>
    fromAdapter(projectRoxyReturn(raw, "lunar", { houseSystem: opt.houseSystem as HouseSystem, returnYear: null, returnDate: String(u.body.returnDate) }), RETURN_TECHNICAL_SCHEMA, RETURN_INTERP_SCHEMA, ROXY_LUNAR_RETURN.projection),
};

const pairTechnique = (id: "western.synastry" | "western.composite", label: string): TechniqueDefinition => ({
  id,
  label,
  family: "western",
  requiresPartner: true,
  requiresKnownTime: false,
  timeDependent: false,
  parseOptions: (raw) => {
    const r = o(raw);
    const hs = houseOf(r.houseSystem);
    const nodeType = nodeTypeOf(r.nodeType);
    if (typeof r.partnerProfileId !== "string" || !UUID_RE.test(r.partnerProfileId) || !hs || !nodeType) return null;
    const rev = r.partnerRevision === undefined || r.partnerRevision === null ? null : Number(r.partnerRevision);
    if (rev !== null && (!Number.isInteger(rev) || rev < 1)) return null;
    return { partnerProfileId: r.partnerProfileId.toLowerCase(), partnerRevision: rev, houseSystem: hs, nodeType };
  },
  units: (ctx, opt) => {
    if (!ctx.partner) return [];
    const meta = id === "western.synastry" ? ROXY_SYNASTRY : ROXY_COMPOSITE;
    return [unit(id, meta, pairBody(ctx.birth, ctx.partner, opt.nodeType as NodeType, opt.houseSystem as HouseSystem))];
  },
  project: (_u, raw, opt) =>
    id === "western.synastry"
      ? fromAdapter(projectRoxySynastry(raw, { houseSystem: opt.houseSystem as HouseSystem, nodeType: opt.nodeType as NodeType }), SYNASTRY_TECHNICAL_SCHEMA, SYNASTRY_INTERP_SCHEMA, ROXY_SYNASTRY.projection)
      : fromAdapter(projectRoxyComposite(raw, { houseSystem: opt.houseSystem as HouseSystem, nodeType: opt.nodeType as NodeType }), COMPOSITE_TECHNICAL_SCHEMA, COMPOSITE_INTERP_SCHEMA, ROXY_COMPOSITE.projection),
});

export const TECHNIQUES: Readonly<Record<TechniqueId, TechniqueDefinition>> = Object.freeze({
  "western.natal": westernNatal,
  "western.transit": westernTransit,
  "western.forecast": westernForecast,
  "western.progression": targetDateTechnique("western.progression", "Secondary progression", ROXY_PROGRESSION),
  "western.solar_arc": targetDateTechnique("western.solar_arc", "Solar arc", ROXY_SOLAR_ARC),
  "western.solar_return": westernSolarReturn,
  "western.lunar_return": westernLunarReturn,
  "western.synastry": pairTechnique("western.synastry", "Sinastri"),
  "western.composite": pairTechnique("western.composite", "Composite"),
});

export function getTechnique(id: unknown): TechniqueDefinition | null {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TECHNIQUES, id) ? TECHNIQUES[id as TechniqueId] : null;
}

export const NODE_TYPE_VALUES = NODE_TYPES;
