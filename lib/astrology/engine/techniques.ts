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
  FORECAST_INTERP_SCHEMA,
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
  type ForecastInterpretation,
  type ForecastTechnical,
  type TransitTechnical,
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
  mergeForecastInterpretation,
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
import { lunarReturnsInMonth, natalMoonLongitude } from "./lunarReturnDate";
import {
  ACG_INTERP_SCHEMA,
  ACG_TECHNICAL_SCHEMA,
  LOCAL_SPACE_INTERP_SCHEMA,
  LOCAL_SPACE_TECHNICAL_SCHEMA,
  RELOCATION_INTERP_SCHEMA,
  RELOCATION_TECHNICAL_SCHEMA,
  type RelocationTechnical,
} from "../model/westernLocation";
import type { NatalTechnical } from "../model/western";
import { astrocartographyBody, LOCATION_EXTRA_BODIES, localSpaceBody, relocationBody, type GeoPoint } from "../providers/roxy/requests";
import { projectRoxyAstrocartography, projectRoxyLocalSpace, projectRoxyRelocation, ROXY_ACG, ROXY_LOCAL_SPACE, ROXY_RELOCATION } from "../providers/roxy/location";
import {
  dashaEndpoint,
  mapGraha,
  projectRoxyVedicAshtakavarga,
  projectRoxyVedicD1,
  projectRoxyVedicDasha,
  projectRoxyVedicDrishti,
  projectRoxyVedicPanchanga,
  projectRoxyVedicShadbala,
  projectRoxyVedicTransit,
  projectRoxyVedicVarga,
  ROXY_VEDIC_TRANSIT,
  ROXY_VEDIC_ASHTAKAVARGA,
  ROXY_VEDIC_D1,
  ROXY_VEDIC_DASHA,
  ROXY_VEDIC_DRISHTI,
  ROXY_VEDIC_PANCHANGA,
  ROXY_VEDIC_SHADBALA,
  ROXY_VEDIC_VARGA,
} from "../providers/roxy/vedic";
import { kpChartBody, kpHoraryBody, kpPlanetsAtBody, kpRulingBody, KP_AYANAMSAS, vedicBirthBody, vedicTransitBody, VEDIC_AYANAMSAS, type KpAyanamsa, type KpNodeType, type VedicAyanamsa } from "../providers/roxy/requests";
import { projectRoxyKpChart, projectRoxyKpHorary, projectRoxyKpPlanetsAt, projectRoxyKpRuling, ROXY_KP_CHART, ROXY_KP_HORARY, ROXY_KP_PLANETS_AT, ROXY_KP_RULING } from "../providers/roxy/kp";
import { KP_CHART_INTERP_SCHEMA, KP_CHART_TECHNICAL_SCHEMA, KP_EXTRA_INTERP_SCHEMA, KP_HORARY_TECHNICAL_SCHEMA, KP_RULING_TECHNICAL_SCHEMA, KP_TRANSIT_TECHNICAL_SCHEMA } from "../model/kp";
import { KP_DASHA_TECHNICAL_SCHEMA } from "../model/vedic";
import {
  VEDIC_ASHTAKAVARGA_TECHNICAL_SCHEMA,
  VEDIC_DRISHTI_TECHNICAL_SCHEMA,
  VEDIC_PANCHANGA_INTERP_SCHEMA,
  VEDIC_PANCHANGA_TECHNICAL_SCHEMA,
  VEDIC_SHADBALA_INTERP_SCHEMA,
  VEDIC_SHADBALA_TECHNICAL_SCHEMA,
  VEDIC_TRANSIT_INTERP_SCHEMA,
  VEDIC_TRANSIT_TECHNICAL_SCHEMA,
} from "../model/vedic";
import { VEDIC_D1_INTERP_SCHEMA, VEDIC_D1_TECHNICAL_SCHEMA, VEDIC_DASHA_INTERP_SCHEMA, VEDIC_DASHA_TECHNICAL_SCHEMA, VEDIC_VARGA_DIVISIONS, type VedicGrahaId, VEDIC_VARGA_INTERP_SCHEMA, VEDIC_VARGA_TECHNICAL_SCHEMA, type VedicVargaDivision } from "../model/vedic";
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
  "western.astrocartography",
  "western.relocation",
  "western.local_space",
  "vedic.d1",
  "vedic.varga",
  "vedic.dasha",
  "vedic.drishti",
  "vedic.ashtakavarga",
  "vedic.shadbala",
  "vedic.panchanga",
  "vedic.transit",
  "kp.chart",
  "kp.dasha",
  "kp.ruling",
  "kp.transit",
  "kp.horary",
] as const;
export type TechniqueId = (typeof TECHNIQUE_IDS)[number];

/** Geriye dönük uyum (Aşama 1/2): tek kişilik doğum girdisi. */
export type NatalBirthInput = BirthPoint;

export type UnitContext = {
  birth: BirthPoint;
  birthUtc: string;
  partner: BirthPoint | null;
  /**
   * Aşama 4 konum teknikleri: sunucuda konum kimliğinden çözülen hedef (relocation) / referans
   * (local space) noktaları. Doğum ANI ctx.birth'ten gelir ve DEĞİŞMEZ.
   */
  places?: { target?: GeoPoint | null; reference?: GeoPoint | null };
};

export type CalcUnit = {
  technique: TechniqueId;
  provider: string;
  providerApiVersion: string;
  adapterVersion: string;
  endpoint: string;
  lang: string;
  body: Record<string, unknown>;
  /** Sorgu parametreleri (ör. include) — doluysa anahtara girer. */
  query?: Record<string, string>;
  inputHash: string;
  /** Bu birimin yanıtının KAPSADIĞI diğer endpoint'ler (planlayıcı budaması için). */
  covers: string[];
  /** Zamana bağlı mı (hedef tarih anahtarın parçası)? */
  timeDependent: boolean;
  /** Çok parçalı tekniklerde parça sırası (forecast). */
  part: number;
  /**
   * Yanıt denetimi için beklenen değerler (ör. lunar return'ün beklenen dönüş anı). Önbellek anahtarına
   * GİRMEZ (anahtar yalnız gövdeden türer); projeksiyon sağlayıcı yanıtını bununla doğrular.
   */
  expect?: Record<string, string>;
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
  /** Çok parçalı tekniğin sağlayıcı yorumlarını birleştir (yoksa yorum yalnız tek parçalı sonuçta gösterilir). */
  combineInterpretation?: (parts: Record<string, unknown>[]) => Record<string, unknown>;
  /**
   * YALNIZ-ÖNBELLEK bağlam birimleri: plana GİRMEZ (istek sayısına, onaya, kayıt zorunluluğuna etkisi yok), ASLA
   * sağlayıcıya gönderilmez; yalnız önbellekte varsa `attachContext`e verilir (ör. transit çift halkası için aynı doğum
   * verisinin natal sonucu). Sıra önceliktir: ilk bulunan kullanılır.
   */
  contextUnits?: (ctx: UnitContext, options: Record<string, unknown>) => CalcUnit[];
  /** Bağlam birimlerinin teknik katmanlarını (bulunamayan = null) birleşik teknik veriye ekler. Saf. */
  attachContext?: (technical: unknown, context: (unknown | null)[], options: Record<string, unknown>) => unknown;
  /** Plan önizlemesine teknik özel bilgi (ör. ayın lunar return'leri). Doğum verisi/gövde İÇERMEZ. */
  planInfo?: (ctx: UnitContext, options: Record<string, unknown>) => Record<string, unknown> | null;
  /**
   * Çok birimli tekniklerde ZORUNLU birim (ör. relocation = 0; natal karşılaştırma birimi isteğe bağlı).
   * Bu birim başarısızsa seçim başarısız sayılır; sağlayıcı yorumu yalnız bu birimden gösterilir.
   */
  primaryPart?: number;
  /** units() boş döndüğünde açık neden (ör. ayda 2. dönüş yok). */
  noUnitsReason?: (ctx: UnitContext, options: Record<string, unknown>) => string | null;
  /**
   * Aşama 5: danışan notu bağlamı (kanonik, "k:v|k:v"; ör. "ayanamsa:lahiri"). Tanımlıysa notlar bu
   * bağlama göre ayrılır (Lahiri notu Raman notuna karışmaz). Sunucu metni parseOptions ile yeniden
   * türetip doğrular; istemcinin uuid'ine güvenilmez.
   */
  noteContext?: (options: Record<string, unknown>) => string;
  /**
   * 5.1A: not bağlamı metninin seçeneklere çevrilmesi parseOptions'tan farklıysa (ör. Gochara: bağlam yalnız
   * ayanamsa; transit anı not bağlamına GİRMEZ ama parseOptions için zorunludur).
   */
  parseNoteContextOptions?: (raw: Record<string, string>) => Record<string, unknown> | null;
};

/** Not bağlamı metnini seçenek nesnesine çevirir (doğrulama parseOptions + yeniden kanonikleştirme ile). */
export function parseNoteContext(def: TechniqueDefinition, raw: unknown): Record<string, unknown> | null {
  if (!def.noteContext || typeof raw !== "string" || raw.length === 0 || raw.length > 200) return null;
  const obj: Record<string, string> = {};
  for (const part of raw.split("|")) {
    const i = part.indexOf(":");
    if (i <= 0) return null;
    const k = part.slice(0, i);
    if (!/^[a-z][a-zA-Z0-9]{0,30}$/.test(k) || k in obj) return null;
    obj[k] = part.slice(i + 1);
  }
  const opts = def.parseNoteContextOptions ? def.parseNoteContextOptions(obj) : def.parseOptions(obj, new Date(0));
  return opts && def.noteContext(opts) === raw ? opts : null;
}

function unit(technique: TechniqueId, meta: { endpoint: string; adapter: string }, body: Record<string, unknown>, extra: Partial<CalcUnit> = {}): CalcUnit {
  const identity = {
    provider: ROXY_PROVIDER,
    providerApiVersion: ROXY_API_VERSION,
    adapterVersion: meta.adapter,
    endpoint: meta.endpoint,
    lang: ASTRO_PROVIDER_LANG,
    body,
    ...(extra.query ? { query: extra.query } : {}),
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
  // Çift halka natal çerçevesi: AYNI doğum verisi + AYNI düğüm türüyle önbellekteki natal (ev sistemi önceliği
  // Placidus → Tam burç → Eşit → Koch). Gövde doğum verisinden kurulduğu için başka revizyonun natali eşleşemez.
  contextUnits: (ctx, opt) =>
    TRANSIT_FRAME_HOUSE_SYSTEMS.map((hs) =>
      unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: ROXY_NATAL_ADAPTER_VERSION }, buildNatalRequestBody(ctx.birth, { houseSystem: hs, nodeType: opt.nodeType as NodeType })),
    ),
  attachContext: (technical, context, opt) => {
    const t = technical as TransitTechnical;
    const natal = context.find((c): c is NatalTechnical => !!c && (c as { schema?: string }).schema === NATAL_TECHNICAL_SCHEMA) ?? null;
    if (!natal || !natal.angles || natal.houses.length !== 12 || natal.nodeType !== opt.nodeType) return { ...t, natalFrame: null };
    return {
      ...t,
      natalFrame: {
        houseSystem: natal.houseSystem,
        nodeType: natal.nodeType,
        bodies: natal.bodies.map((b) => ({ id: b.id, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, latitude: b.latitude, speed: b.speed, retrograde: b.retrograde, house: b.house })),
        houses: natal.houses,
        angles: natal.angles,
      },
    };
  },
};
const TRANSIT_FRAME_HOUSE_SYSTEMS: HouseSystem[] = ["placidus", "whole-sign", "equal", "koch"];

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
  project: (_u, raw) => fromAdapter(projectRoxyForecast(raw), FORECAST_TECHNICAL_SCHEMA, FORECAST_INTERP_SCHEMA, ROXY_FORECAST.projection),
  combineTechnical: (parts, opt) => {
    const chunks = forecastChunks(String(opt.startDate), Number(opt.days));
    return mergeForecast(parts as ForecastTechnical[], { start: chunks[0].start, end: chunks[chunks.length - 1].end });
  },
  // 90 günlük parçaların yorumları da birleşir (yalnız HER parçanın yorumu varsa; eksik parça → katman gösterilmez).
  combineInterpretation: (parts) => mergeForecastInterpretation(parts as ForecastInterpretation[]),
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

/** Dönüş konumu seçeneği: yok/null/"" → doğum yeri (null); geçerli kimlik → kimlik; geçersiz → undefined (ret). */
function returnLocationOf(r: Record<string, unknown>): string | null | undefined {
  const v = r.returnLocationId;
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && /^[A-Za-z0-9_-]{2,64}$/.test(v) ? v : undefined;
}
/** Gövdedeki gözlem konumu (sağlayıcı yankısı bununla doğrulanır). */
const bodyLocation = (u: CalcUnit) => ({ latitude: Number(u.body.latitude), longitude: Number(u.body.longitude) });

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
    const loc = returnLocationOf(r);
    return yearOk(y) && hs && loc !== undefined ? { returnYear: y, houseSystem: hs, returnLocationId: loc } : null;
  },
  // Dönüş konumu (Aşama 4.1): sunucuda çözülen ctx.places.target; yoksa doğum yeri (gövde Aşama 3 ile aynı).
  units: (ctx, opt) => [
    unit("western.solar_return", ROXY_SOLAR_RETURN, solarReturnBody(ctx.birth, Number(opt.returnYear), opt.houseSystem as HouseSystem, ctx.places?.target ?? null), { timeDependent: true }),
  ],
  project: (u, raw, opt) =>
    fromAdapter(
      projectRoxyReturn(raw, "solar", { houseSystem: opt.houseSystem as HouseSystem, returnYear: Number(opt.returnYear), returnDate: null, expectedLocation: bodyLocation(u) }),
      RETURN_TECHNICAL_SCHEMA,
      RETURN_INTERP_SCHEMA,
      ROXY_SOLAR_RETURN.projection,
    ),
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
    // Ay içindeki dönüş sırası (1 | 2). Verilmezse 1 → Aşama 3 kayıtlarıyla AYNI istek gövdesi/anahtar.
    const seq = r.sequence === undefined || r.sequence === null ? 1 : Number(r.sequence);
    if (seq !== 1 && seq !== 2) return null;
    const loc = returnLocationOf(r);
    if (loc === undefined) return null;
    return { month: r.month, sequence: seq, houseSystem: hs, returnLocationId: loc };
  },
  units: (ctx, opt) => {
    const pick = lunarReturnsInMonth(natalMoonLongitude(ctx.birthUtc), String(opt.month)).find((c) => c.sequence === Number(opt.sequence ?? 1));
    if (!pick) return [];
    return [
      unit("western.lunar_return", ROXY_LUNAR_RETURN, lunarReturnBody(ctx.birth, pick.requestDate, opt.houseSystem as HouseSystem, ctx.places?.target ?? null), {
        timeDependent: true,
        expect: { returnUtc: pick.approxUtc, sequence: String(pick.sequence) },
      }),
    ];
  },
  planInfo: (ctx, opt) => ({
    lunarReturns: lunarReturnsInMonth(natalMoonLongitude(ctx.birthUtc), String(opt.month)).map((c) => ({ sequence: c.sequence, approxUtc: c.approxUtc })),
  }),
  noUnitsReason: (ctx, opt) => {
    const n = lunarReturnsInMonth(natalMoonLongitude(ctx.birthUtc), String(opt.month)).length;
    return `bu ayda ${n} lunar return var; ${String(opt.sequence ?? 1)}. dönüş yok.`;
  },
  project: (u, raw, opt) =>
    fromAdapter(
      projectRoxyReturn(raw, "lunar", {
        houseSystem: opt.houseSystem as HouseSystem,
        returnYear: null,
        returnDate: String(u.body.returnDate),
        sequence: u.expect?.sequence ? Number(u.expect.sequence) : null,
        expectedUtc: u.expect?.returnUtc ?? null,
        expectedLocation: bodyLocation(u),
      }),
      RETURN_TECHNICAL_SCHEMA,
      RETURN_INTERP_SCHEMA,
      ROXY_LUNAR_RETURN.projection,
    ),
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

// ─── Aşama 4: konum teknikleri (doğum saati ZORUNLU) ─────────────────────────
// Saat bilinmiyorsa: ACG hatları saat başına ~15° boylam kayar; relocated açılar/evler ve local space
// azimutları tamamen saate bağlıdır → güvenilir hiçbir kısım kalmaz → TIME_REQUIRED (istek YOK).

const LOCATION_ID_RE = /^[A-Za-z0-9_\-]{2,64}$/;
const locId = (v: unknown): string | null => (typeof v === "string" && LOCATION_ID_RE.test(v) ? v : null);

const westernAstrocartography: TechniqueDefinition = {
  id: "western.astrocartography",
  label: "Astrocartography",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  // Seçenek yok: çizgiler yalnız doğum ANINA bağlıdır; ek gövdeler (düğüm/Kiron/Lilith) hep istenir
  // (tek önbellek varyantı) ve arayüzde filtrelenir.
  parseOptions: () => ({}),
  units: (ctx) => [unit("western.astrocartography", ROXY_ACG, astrocartographyBody(ctx.birth), { query: { include: LOCATION_EXTRA_BODIES } })],
  project: (_u, raw) => fromAdapter(projectRoxyAstrocartography(raw), ACG_TECHNICAL_SCHEMA, ACG_INTERP_SCHEMA, ROXY_ACG.projection),
};

const westernRelocation: TechniqueDefinition = {
  id: "western.relocation",
  label: "Relocation",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const r = o(raw);
    const hs = houseOf(r.houseSystem);
    const id = locId(r.targetLocationId);
    return id && hs ? { targetLocationId: id, houseSystem: hs } : null;
  },
  // [0] relocation (zorunlu) · [1] natal karşılaştırma (aynı doğum anı, DOĞUM YERİ; çoğu zaman önbellekte).
  units: (ctx, opt) => {
    const target = ctx.places?.target;
    if (!target) return [];
    const hs = opt.houseSystem as HouseSystem;
    return [
      unit("western.relocation", ROXY_RELOCATION, relocationBody(ctx.birth, target, hs)),
      unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: ROXY_NATAL_ADAPTER_VERSION }, buildNatalRequestBody(ctx.birth, { houseSystem: hs, nodeType: "true" }), { part: 1 }),
    ];
  },
  primaryPart: 0,
  noUnitsReason: () => "hedef konum çözülemedi.",
  project: (u, raw, opt) => {
    if (u.technique === "western.natal") return westernNatal.project(u, raw, { houseSystem: opt.houseSystem, nodeType: "true" });
    return fromAdapter(
      projectRoxyRelocation(raw, { houseSystem: opt.houseSystem as HouseSystem, target: { latitude: Number(u.body.relocationLatitude), longitude: Number(u.body.relocationLongitude) } }),
      RELOCATION_TECHNICAL_SCHEMA,
      RELOCATION_INTERP_SCHEMA,
      ROXY_RELOCATION.projection,
    );
  },
  combineTechnical: (parts) => {
    const rel = parts.find((x) => (x as { schema?: string })?.schema === RELOCATION_TECHNICAL_SCHEMA) as RelocationTechnical | undefined;
    if (!rel) return null;
    const natal = parts.find((x) => (x as { schema?: string })?.schema === NATAL_TECHNICAL_SCHEMA) as NatalTechnical | undefined;
    return {
      ...rel,
      natal: natal ? { angles: natal.angles, houses: natal.houses, bodyHouses: natal.bodies.map((b) => ({ id: b.id, house: b.house })) } : null,
    };
  },
};

const westernLocalSpace: TechniqueDefinition = {
  id: "western.local_space",
  label: "Local Space",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const r = o(raw);
    if (r.referenceLocationId === undefined || r.referenceLocationId === null || r.referenceLocationId === "") return { referenceLocationId: null };
    const id = locId(r.referenceLocationId);
    return id ? { referenceLocationId: id } : null;
  },
  units: (ctx) => {
    const ref = ctx.places?.reference ?? { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude };
    return [unit("western.local_space", ROXY_LOCAL_SPACE, localSpaceBody(ctx.birth, ref), { query: { include: LOCATION_EXTRA_BODIES } })];
  },
  project: (u, raw) =>
    fromAdapter(
      projectRoxyLocalSpace(raw, { reference: { latitude: Number(u.body.latitude), longitude: Number(u.body.longitude) } }),
      LOCAL_SPACE_TECHNICAL_SCHEMA,
      LOCAL_SPACE_INTERP_SCHEMA,
      ROXY_LOCAL_SPACE.projection,
    ),
};

// ─── Aşama 5: Vedik / Jyotish (hesap motoru Roxy; doğum saati ZORUNLU) ──────────
// Roxy belgesi: saat Lagna, ev, pada ve varga için kritik; Dasha tarihleri Ay boylamından → saat bilinmezse
// güvenilir kısım kalmaz → TIME_REQUIRED. Ayanamsa gövdenin (önbellek anahtarının) parçasıdır.

/** Ayanamsa seçeneği: yoksa "lahiri" (Roxy belgelenmiş varsayılanı); bilinmeyen değer → ret. */
export function ayanamsaOf(v: unknown): VedicAyanamsa | null {
  if (v === undefined || v === null || v === "") return "lahiri";
  return typeof v === "string" && (VEDIC_AYANAMSAS as readonly string[]).includes(v) ? (v as VedicAyanamsa) : null;
}

const vedicD1: TechniqueDefinition = {
  id: "vedic.d1",
  label: "Vedik D1 (Rashi)",
  family: "vedic",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const ay = ayanamsaOf(o(raw).ayanamsa);
    return ay ? { ayanamsa: ay } : null;
  },
  units: (ctx, opt) => [unit("vedic.d1", ROXY_VEDIC_D1, vedicBirthBody(ctx.birth, opt.ayanamsa as VedicAyanamsa))],
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}`,
  project: (_u, raw, opt) => fromAdapter(projectRoxyVedicD1(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa }), VEDIC_D1_TECHNICAL_SCHEMA, VEDIC_D1_INTERP_SCHEMA, ROXY_VEDIC_D1.projection),
};

/** Varga bölümü: yoksa 9 (Navamsa); yalnız Roxy'nin belgelenmiş bölümleri; 1 (D1) ayrı tekniktir. */
export function vargaDivisionOf(v: unknown): VedicVargaDivision | null {
  if (v === undefined || v === null || v === "") return 9;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : NaN;
  return (VEDIC_VARGA_DIVISIONS as readonly number[]).includes(n) ? (n as VedicVargaDivision) : null;
}

const vedicVarga: TechniqueDefinition = {
  id: "vedic.varga",
  label: "Vedik Varga (D9 Navamsa / Dn)",
  family: "vedic",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const ay = ayanamsaOf(o(raw).ayanamsa);
    const division = vargaDivisionOf(o(raw).division);
    return ay && division ? { ayanamsa: ay, division } : null;
  },
  units: (ctx, opt) => [unit("vedic.varga", ROXY_VEDIC_VARGA, { ...vedicBirthBody(ctx.birth, opt.ayanamsa as VedicAyanamsa), division: opt.division })],
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|division:${String(opt.division)}`,
  project: (_u, raw, opt) =>
    fromAdapter(
      projectRoxyVedicVarga(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa, division: opt.division as VedicVargaDivision }),
      VEDIC_VARGA_TECHNICAL_SCHEMA,
      VEDIC_VARGA_INTERP_SCHEMA,
      ROXY_VEDIC_VARGA.projection,
    ),
};

/** Dasha yolu seçeneği: yok/boş → null; yalnız 9 graha kimliği (küçük harf). */
function dashaLordOf(v: unknown): VedicGrahaId | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && v === v.toLowerCase() ? (mapGraha(v) ?? undefined) : undefined;
}

const vedicDasha: TechniqueDefinition = {
  id: "vedic.dasha",
  label: "Vimshottari Dasha",
  family: "vedic",
  requiresPartner: false,
  // Ay ~13°/gün: saat bilinmeden nakshatra/bakiye (tüm tarihler) güvenilmez.
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const ay = ayanamsaOf(o(raw).ayanamsa);
    const md = dashaLordOf(o(raw).mahadasha);
    const ad = dashaLordOf(o(raw).antardasha);
    if (!ay || md === undefined || ad === undefined || (ad && !md)) return null;
    return { ayanamsa: ay, mahadasha: md, antardasha: ad };
  },
  units: (ctx, opt) => {
    const md = (opt.mahadasha as VedicGrahaId | null) ?? null;
    const ad = (opt.antardasha as VedicGrahaId | null) ?? null;
    return [unit("vedic.dasha", { endpoint: dashaEndpoint(md, ad), adapter: ROXY_VEDIC_DASHA.adapter }, vedicBirthBody(ctx.birth, opt.ayanamsa as VedicAyanamsa))];
  },
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}${opt.mahadasha ? `|mahadasha:${String(opt.mahadasha)}` : ""}${opt.antardasha ? `|antardasha:${String(opt.antardasha)}` : ""}`,
  project: (u, raw, opt) => {
    const b = u.body as { date: string; time: string; timezone: number };
    return fromAdapter(
      projectRoxyVedicDasha(raw, {
        ayanamsa: opt.ayanamsa as VedicAyanamsa,
        mahadasha: (opt.mahadasha as VedicGrahaId | null) ?? null,
        antardasha: (opt.antardasha as VedicGrahaId | null) ?? null,
        birthLocal: `${b.date}T${/^\d{2}:\d{2}$/.test(b.time) ? `${b.time}:00` : b.time}`,
        utcOffsetHours: b.timezone,
      }),
      VEDIC_DASHA_TECHNICAL_SCHEMA,
      VEDIC_DASHA_INTERP_SCHEMA,
      ROXY_VEDIC_DASHA.projection,
    );
  },
};

/** Doğum gövdesi (ayanamsasız) — Roxy /aspects ve /panchang Lahiri sabit; ayanamsa alanı göndermez. */
function lahiriFixedBody(ctx: UnitContext): Record<string, unknown> {
  const b = vedicBirthBody(ctx.birth, "lahiri");
  return { date: b.date, time: b.time, latitude: b.latitude, longitude: b.longitude, timezone: b.timezone };
}
const LAHIRI_ONLY = "Roxy bu hesabı yalnız Lahiri ayanamsa ile yapar (uç ayanamsa almaz); Lahiri seçin.";

/** Ayanamsa seçenekli basit Vedik doğum tekniği (tek birim). */
function vedicBirthTechnique(
  id: TechniqueId,
  label: string,
  meta: { endpoint: string; adapter: string; projection: string },
  project: (raw: unknown, ay: VedicAyanamsa) => AdapterResult<unknown, unknown>,
  schemas: { technical: string; interp: string | null },
): TechniqueDefinition {
  return {
    id,
    label,
    family: "vedic",
    requiresPartner: false,
    requiresKnownTime: true,
    timeDependent: false,
    parseOptions: (raw) => {
      const ay = ayanamsaOf(o(raw).ayanamsa);
      return ay ? { ayanamsa: ay } : null;
    },
    units: (ctx, opt) => [unit(id, meta, vedicBirthBody(ctx.birth, opt.ayanamsa as VedicAyanamsa))],
    noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}`,
    project: (_u, raw, opt) => fromAdapter(project(raw, opt.ayanamsa as VedicAyanamsa), schemas.technical, schemas.interp, meta.projection),
  };
}

/** Lahiri-sabit Vedik doğum tekniği: başka ayanamsa → birim YOK (sağlayıcı çağrılmaz) + açık neden. */
function lahiriOnlyTechnique(
  id: TechniqueId,
  label: string,
  meta: { endpoint: string; adapter: string; projection: string },
  body: (ctx: UnitContext) => Record<string, unknown>,
  project: (raw: unknown, u: CalcUnit) => AdapterResult<unknown, unknown>,
  schemas: { technical: string; interp: string | null },
): TechniqueDefinition {
  return {
    id,
    label,
    family: "vedic",
    requiresPartner: false,
    requiresKnownTime: true,
    timeDependent: false,
    parseOptions: (raw) => {
      const ay = ayanamsaOf(o(raw).ayanamsa);
      return ay ? { ayanamsa: ay } : null;
    },
    units: (ctx, opt) => (opt.ayanamsa === "lahiri" ? [unit(id, meta, body(ctx))] : []),
    noUnitsReason: () => LAHIRI_ONLY,
    noteContext: () => "ayanamsa:lahiri",
    project: (u, raw) => fromAdapter(project(raw, u), schemas.technical, schemas.interp, meta.projection),
  };
}

const vedicDrishti = lahiriOnlyTechnique(
  "vedic.drishti",
  "Graha Drishti (Vedik bakışlar)",
  ROXY_VEDIC_DRISHTI,
  (ctx) => ({ ...lahiriFixedBody(ctx), coordinateSystem: "sidereal" }),
  (raw, u) => {
    const b = u.body as { date: string; time: string };
    return projectRoxyVedicDrishti(raw, { birthLocal: `${b.date}T${/^\d{2}:\d{2}$/.test(b.time) ? `${b.time}:00` : b.time}` });
  },
  { technical: VEDIC_DRISHTI_TECHNICAL_SCHEMA, interp: null },
);
const vedicPanchanga = lahiriOnlyTechnique(
  "vedic.panchanga",
  "Janma Panchanga",
  ROXY_VEDIC_PANCHANGA,
  lahiriFixedBody,
  (raw) => projectRoxyVedicPanchanga(raw),
  { technical: VEDIC_PANCHANGA_TECHNICAL_SCHEMA, interp: VEDIC_PANCHANGA_INTERP_SCHEMA },
);
// 5.1A Gochara: Roxy /vedic-astrology/transit — ayanamsa ALMAZ (sidereal = Lahiri sabit) → yalnız Lahiri;
// başka ayanamsa seçiliyse birim YOK (tropikal/başka çerçeve sonucu Vedik diye etiketlenmez). Transit anı
// Batı transitle aynı normalizasyon (UTC dakika; "şimdi" = UTC saat başı) ama AYRI teknik/önbellek/konu.
const vedicTransit: TechniqueDefinition = {
  id: "vedic.transit",
  label: "Gochara (Vedik transit)",
  family: "vedic",
  requiresPartner: false,
  // natalHouse Lagna'ya, houseFromMoon natal Ay rashisine bağlı → saat bilinmeden güvenilmez.
  requiresKnownTime: true,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const r = o(raw);
    const ay = ayanamsaOf(r.ayanamsa);
    const atUtc = normalizeTransitMoment(r, now);
    return ay && atUtc ? { ayanamsa: ay, atUtc } : null;
  },
  units: (ctx, opt) => (opt.ayanamsa === "lahiri" ? [unit("vedic.transit", ROXY_VEDIC_TRANSIT, vedicTransitBody(ctx.birth, String(opt.atUtc)), { timeDependent: true })] : []),
  noUnitsReason: () => LAHIRI_ONLY,
  // Not bağlamı yalnız ayanamsa (an değil): aynı danışanın Gochara notları tarih tarih bölünmez.
  noteContext: () => "ayanamsa:lahiri",
  parseNoteContextOptions: (raw) => (Object.keys(raw).join() === "ayanamsa" && raw.ayanamsa === "lahiri" ? { ayanamsa: "lahiri" } : null),
  project: (u, raw, opt) => {
    const b = u.body as { birthDate: string; birthTime: string; transitDate: string; transitTime: string; timezone: number };
    return fromAdapter(
      projectRoxyVedicTransit(raw, {
        birthLocal: `${b.birthDate}T${/^\d{2}:\d{2}$/.test(b.birthTime) ? `${b.birthTime}:00` : b.birthTime}`,
        transitLocal: `${b.transitDate}T${b.transitTime}`,
        atUtc: String(opt.atUtc),
        utcOffsetHours: b.timezone,
      }),
      VEDIC_TRANSIT_TECHNICAL_SCHEMA,
      VEDIC_TRANSIT_INTERP_SCHEMA,
      ROXY_VEDIC_TRANSIT.projection,
    );
  },
};

// ─── Aşama 6: KP (Krishnamurti Paddhati) — hesap motoru Roxy; Vedik D1'den AYRI teknik (Placidus cusp + sub-lord) ───
/** KP ayanamsa: yoksa kp-newcomb (Roxy KP varsayılanı); yalnız KP çerçeveleri (Lahiri/Raman ile KP haritası üretilmez). */
export function kpAyanamsaOf(v: unknown): KpAyanamsa | null {
  if (v === undefined || v === null || v === "") return "kp-newcomb";
  return typeof v === "string" && (KP_AYANAMSAS as readonly string[]).includes(v) ? (v as KpAyanamsa) : null;
}
/** KP düğüm: yoksa mean (KP geleneği + Roxy varsayılanı). */
export function kpNodeOf(v: unknown): KpNodeType | null {
  if (v === undefined || v === null || v === "") return "mean";
  return v === "mean" || v === "true" ? v : null;
}

const kpChart: TechniqueDefinition = {
  id: "kp.chart",
  label: "KP doğum haritası (Placidus + sub-lord)",
  family: "kp",
  requiresPartner: false,
  // Cusp sub-lord'u ~4 dakikada değişir; saat bilinmeden KP haritası anlamsız → TIME_REQUIRED.
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const ay = kpAyanamsaOf(o(raw).ayanamsa);
    const nt = kpNodeOf(o(raw).nodeType);
    return ay && nt ? { ayanamsa: ay, nodeType: nt } : null;
  },
  units: (ctx, opt) => [unit("kp.chart", ROXY_KP_CHART, kpChartBody(ctx.birth, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType))],
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|nodeType:${String(opt.nodeType)}`,
  project: (u, raw, opt) => {
    const b = u.body as { date: string; time: string; latitude: number; longitude: number; timezone: number };
    return fromAdapter(
      projectRoxyKpChart(raw, { ayanamsa: opt.ayanamsa as KpAyanamsa, nodeType: opt.nodeType as KpNodeType, birth: b }),
      KP_CHART_TECHNICAL_SCHEMA,
      KP_CHART_INTERP_SCHEMA,
      ROXY_KP_CHART.projection,
    );
  },
};

// 6E: KP dasha = Roxy Vimshottari (KP ayanamsa) + dönem lordlarının KP significator katmanı (significators:true). Tarihler klasik
// Vimshottari ile aynı motor; bu bir "KP olay tahmini" DEĞİLDİR (Roxy'de olay zamanlama ucu yok). Alt düzeyler tembel (vedic.dasha gibi).
const kpDasha: TechniqueDefinition = {
  id: "kp.dasha",
  label: "KP dasha (Vimshottari + significator)",
  family: "kp",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const ay = kpAyanamsaOf(o(raw).ayanamsa);
    const nt = kpNodeOf(o(raw).nodeType);
    const md = dashaLordOf(o(raw).mahadasha);
    const ad = dashaLordOf(o(raw).antardasha);
    if (!ay || !nt || md === undefined || ad === undefined || (ad && !md)) return null;
    return { ayanamsa: ay, nodeType: nt, mahadasha: md, antardasha: ad };
  },
  units: (ctx, opt) => {
    const md = (opt.mahadasha as VedicGrahaId | null) ?? null;
    const ad = (opt.antardasha as VedicGrahaId | null) ?? null;
    const body = { ...vedicBirthBody(ctx.birth, opt.ayanamsa as KpAyanamsa), significators: true, nodeType: opt.nodeType };
    return [unit("kp.dasha", { endpoint: dashaEndpoint(md, ad), adapter: "astro-roxy-kp-dasha-1" }, body)];
  },
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|nodeType:${String(opt.nodeType)}${opt.mahadasha ? `|mahadasha:${String(opt.mahadasha)}` : ""}${opt.antardasha ? `|antardasha:${String(opt.antardasha)}` : ""}`,
  project: (u, raw, opt) => {
    const b = u.body as { date: string; time: string; timezone: number };
    const r = projectRoxyVedicDasha(raw, {
      ayanamsa: opt.ayanamsa as KpAyanamsa,
      mahadasha: (opt.mahadasha as VedicGrahaId | null) ?? null,
      antardasha: (opt.antardasha as VedicGrahaId | null) ?? null,
      birthLocal: `${b.date}T${/^\d{2}:\d{2}$/.test(b.time) ? `${b.time}:00` : b.time}`,
      utcOffsetHours: b.timezone,
      kp: true,
    });
    if (!r.ok) return r;
    return fromAdapter({ ...r, technical: { ...r.technical, schema: KP_DASHA_TECHNICAL_SCHEMA } }, KP_DASHA_TECHNICAL_SCHEMA, VEDIC_DASHA_INTERP_SCHEMA, "kp-dasha-proj-1");
  },
};

// ─── 6F: Ruling Planets · KP transit (efemeris) · Horary ───────────────────────
const kpPlaceOf = (v: unknown): string | null | undefined => (v === undefined || v === null || v === "" ? null : locId(v) ?? undefined);

const kpRuling: TechniqueDefinition = {
  id: "kp.ruling",
  label: "KP ruling planets",
  family: "kp",
  requiresPartner: false,
  // Ruling planet'lerin natal significator'ları doğum haritasından (Placidus) → saat gerekir.
  requiresKnownTime: true,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const r = o(raw);
    const atUtc = normalizeTransitMoment(r, now);
    const nt = kpNodeOf(r.nodeType);
    const place = kpPlaceOf(r.placeLocationId);
    return atUtc && nt && place !== undefined ? { atUtc, nodeType: nt, placeLocationId: place } : null;
  },
  units: (ctx, opt) => [unit("kp.ruling", ROXY_KP_RULING, kpRulingBody(ctx.birth, String(opt.atUtc), opt.nodeType as KpNodeType, ctx.places?.target ?? null), { timeDependent: true })],
  noteContext: (opt) => `nodeType:${String(opt.nodeType)}`,
  parseNoteContextOptions: (raw) => (Object.keys(raw).join() === "nodeType" && (raw.nodeType === "mean" || raw.nodeType === "true") ? { nodeType: raw.nodeType } : null),
  project: (u, raw, opt) => {
    const b = u.body as { latitude: number; longitude: number; timezone: number; datetime: string; birthDate?: string };
    return fromAdapter(
      projectRoxyKpRuling(raw, { atUtc: String(opt.atUtc), local: b.datetime, utcOffsetHours: b.timezone, place: { latitude: b.latitude, longitude: b.longitude }, withBirth: typeof b.birthDate === "string" }),
      KP_RULING_TECHNICAL_SCHEMA,
      KP_EXTRA_INTERP_SCHEMA,
      ROXY_KP_RULING.projection,
    );
  },
};

const kpTransit: TechniqueDefinition = {
  id: "kp.transit",
  label: "KP transit (KP efemerisi, tek an)",
  family: "kp",
  requiresPartner: false,
  // Gökyüzü konumları doğum verisine bağlı değil (Roxy natal ev/transit analizi vermez — KISMİ).
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const r = o(raw);
    const atUtc = normalizeTransitMoment(r, now);
    const ay = kpAyanamsaOf(r.ayanamsa);
    const nt = kpNodeOf(r.nodeType);
    return atUtc && ay && nt ? { atUtc, ayanamsa: ay, nodeType: nt } : null;
  },
  units: (ctx, opt) => [unit("kp.transit", ROXY_KP_PLANETS_AT, kpPlanetsAtBody(String(opt.atUtc), { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude }, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType), { timeDependent: true })],
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|nodeType:${String(opt.nodeType)}`,
  parseNoteContextOptions: (raw) => {
    const ay = kpAyanamsaOf(raw.ayanamsa);
    const nt = kpNodeOf(raw.nodeType);
    return Object.keys(raw).sort().join() === "ayanamsa,nodeType" && ay && nt ? { ayanamsa: ay, nodeType: nt } : null;
  },
  project: (_u, raw, opt) => fromAdapter(projectRoxyKpPlanetsAt(raw, { atUtc: String(opt.atUtc), ayanamsa: opt.ayanamsa as KpAyanamsa, nodeType: opt.nodeType as KpNodeType }), KP_TRANSIT_TECHNICAL_SCHEMA, null, ROXY_KP_PLANETS_AT.projection),
};

const kpHorary: TechniqueDefinition = {
  id: "kp.horary",
  label: "KP horary (1–249)",
  family: "kp",
  requiresPartner: false,
  // Horary DOĞUM VERİSİ KULLANMAZ: sayı + soru anı + değerlendirme yeri (varsayılan: profil doğum yeri; seçilebilir).
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const r = o(raw);
    const n = typeof r.horaryNumber === "number" ? r.horaryNumber : typeof r.horaryNumber === "string" && /^\d{1,3}$/.test(r.horaryNumber) ? Number(r.horaryNumber) : NaN;
    const atUtc = normalizeTransitMoment(r, now);
    const ay = kpAyanamsaOf(r.ayanamsa);
    const nt = kpNodeOf(r.nodeType);
    const place = kpPlaceOf(r.placeLocationId);
    if (!Number.isInteger(n) || n < 1 || n > 249 || !atUtc || !ay || !nt || place === undefined) return null;
    return { horaryNumber: n, atUtc, ayanamsa: ay, nodeType: nt, placeLocationId: place };
  },
  units: (ctx, opt) => {
    const place = ctx.places?.target ?? { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude };
    return [unit("kp.horary", ROXY_KP_HORARY, kpHoraryBody(Number(opt.horaryNumber), String(opt.atUtc), place, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType), { timeDependent: true })];
  },
  // Not bağlamı = sayı (aynı sayının farklı anları aynı soru dosyasında toplanır).
  noteContext: (opt) => `horary:${String(opt.horaryNumber)}`,
  parseNoteContextOptions: (raw) => (Object.keys(raw).join() === "horary" && /^(?:[1-9]\d?|1\d\d|2[0-4]\d)$/.test(raw.horary) && Number(raw.horary) <= 249 ? { horaryNumber: Number(raw.horary) } : null),
  project: (u, raw, opt) => {
    const b = u.body as { latitude: number; longitude: number };
    return fromAdapter(
      projectRoxyKpHorary(raw, { horaryNumber: Number(opt.horaryNumber), atUtc: String(opt.atUtc), ayanamsa: opt.ayanamsa as KpAyanamsa, nodeType: opt.nodeType as KpNodeType, place: { latitude: b.latitude, longitude: b.longitude } }),
      KP_HORARY_TECHNICAL_SCHEMA,
      KP_EXTRA_INTERP_SCHEMA,
      ROXY_KP_HORARY.projection,
    );
  },
};

const vedicAshtakavarga = vedicBirthTechnique("vedic.ashtakavarga", "Ashtakavarga", ROXY_VEDIC_ASHTAKAVARGA, (raw, ay) => projectRoxyVedicAshtakavarga(raw, { ayanamsa: ay }), {
  technical: VEDIC_ASHTAKAVARGA_TECHNICAL_SCHEMA,
  interp: null,
});
const vedicShadbala = vedicBirthTechnique("vedic.shadbala", "Shadbala", ROXY_VEDIC_SHADBALA, (raw, ay) => projectRoxyVedicShadbala(raw, { ayanamsa: ay }), {
  technical: VEDIC_SHADBALA_TECHNICAL_SCHEMA,
  interp: VEDIC_SHADBALA_INTERP_SCHEMA,
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
  "western.astrocartography": westernAstrocartography,
  "western.relocation": westernRelocation,
  "western.local_space": westernLocalSpace,
  "vedic.d1": vedicD1,
  "vedic.varga": vedicVarga,
  "vedic.dasha": vedicDasha,
  "vedic.drishti": vedicDrishti,
  "vedic.ashtakavarga": vedicAshtakavarga,
  "vedic.shadbala": vedicShadbala,
  "vedic.panchanga": vedicPanchanga,
  "vedic.transit": vedicTransit,
  "kp.chart": kpChart,
  "kp.dasha": kpDasha,
  "kp.ruling": kpRuling,
  "kp.transit": kpTransit,
  "kp.horary": kpHorary,
});

export function getTechnique(id: unknown): TechniqueDefinition | null {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TECHNIQUES, id) ? TECHNIQUES[id as TechniqueId] : null;
}

export const NODE_TYPE_VALUES = NODE_TYPES;
