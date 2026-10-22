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
  roxyNatalAdapterVersion,
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
  type ProgressionTechnical,
  type SolarArcTechnical,
  type TransitNatalFrame,
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
  roxyCompositeMeta,
  ROXY_FORECAST,
  ROXY_LUNAR_RETURN,
  returnAdapterMeta,
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
import { projectRoxyKpChart, projectRoxyKpHorary, projectRoxyKpPlanetsAt, projectRoxyKpPlanetsRange, projectRoxyKpRasiChanges, projectRoxyKpRuling, projectRoxyKpSublordChanges, ROXY_KP_CHART, ROXY_KP_HORARY, ROXY_KP_PLANETS_AT, ROXY_KP_PLANETS_RANGE, ROXY_KP_RASI, ROXY_KP_RULING, ROXY_KP_SUBLORD } from "../providers/roxy/kp";
import { addDays, kpChangesBody, kpPlanetsRangeBody, KP_TIMING_PLANET_NAME } from "../providers/roxy/requests";
import { KP_TIMING_KINDS, KP_TIMING_PLANETS, KP_TIMING_TECHNICAL_SCHEMA, type KpTimingKind, type KpTimingPart, type KpTimingPlanet, type KpTimingTechnical } from "../model/kp";
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
import { projectRoxyVedicDashaCurrent, projectRoxyVedicPanchangaDetail, ROXY_VEDIC_DASHA_CURRENT, ROXY_VEDIC_PANCHANGA_DETAIL } from "../providers/roxy/vedic";
import { vedicDashaCurrentBody, vedicPanchangDetailedBody } from "../providers/roxy/requests";
import { VEDIC_DASHA_CURRENT_SCHEMA, VEDIC_PANCHANGA_DETAIL_SCHEMA, type VedicDashaCurrent, type VedicDashaTechnical, type VedicPanchangaDetail, type VedicPanchangaTechnical } from "../model/vedic";
import { calendarExactFor } from "../transitDetail";
import { fixedStarsBody } from "../providers/roxy/requests";
import { projectRoxyFixedStars, ROXY_FIXED_STARS } from "../providers/roxy/fixedStars";
import { FIXED_STAR_ORB_QUERY, FIXED_STARS_INTERP_SCHEMA, FIXED_STARS_TECHNICAL_SCHEMA, fixedStarOrbOf, FIXED_STAR_ORB_OPTIONS } from "../model/westernFixedStars";
import { profectionsBody, projectRoxyProfections, ROXY_PROFECTIONS } from "../providers/roxy/profections";
import { projectRoxyVedicChoghadiya, projectRoxyVedicHora, ROXY_VEDIC_CHOGHADIYA, ROXY_VEDIC_HORA } from "../providers/roxy/panchangaHours";
import { VEDIC_CHOGHADIYA_SCHEMA, VEDIC_HORA_SCHEMA, type PanchangaHours, type VedicChoghadiyaTechnical, type VedicHoraTechnical } from "../model/panchangaHours";
import { projectRoxyKpRulingInterval, ROXY_KP_RULING_INTERVAL } from "../providers/roxy/kpRulingInterval";
import { kpRulingIntervalBody } from "../providers/roxy/kpRulingIntervalBody";
import { KP_RULING_INTERVAL_TECHNICAL_SCHEMA } from "../model/kpRulingInterval";
import { parseKpRulingIntervalOptions } from "./kpRulingIntervalOptions";
import { PROFECTIONS_INTERP_SCHEMA, PROFECTIONS_TECHNICAL_SCHEMA, profectionAgeOf } from "../model/westernProfections";
// 22.10.2026 Vedik harita: Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala (ayrı satırlar: paralel eklemelerle çakışmasın).
import { CHARA_KARAKA_SCHEMES, charaKarakaBody, projectRoxyVedicArudha, projectRoxyVedicBhavaBala, projectRoxyVedicBhavChalit, projectRoxyVedicCharaKaraka, ROXY_VEDIC_ARUDHA, ROXY_VEDIC_BHAVA_BALA, ROXY_VEDIC_BHAV_CHALIT, ROXY_VEDIC_CHARA_KARAKA, type CharaKarakaScheme } from "../providers/roxy/vedicHarita";
import { VEDIC_ARUDHA_INTERP_SCHEMA, VEDIC_ARUDHA_TECHNICAL_SCHEMA, VEDIC_BHAVA_BALA_INTERP_SCHEMA, VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA, VEDIC_BHAV_CHALIT_INTERP_SCHEMA, VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA, VEDIC_CHARA_KARAKA_INTERP_SCHEMA, VEDIC_CHARA_KARAKA_TECHNICAL_SCHEMA } from "../model/vedicHarita";
// 2026-10-22 — Ek noktalar (asteroitler / Hermetik lotlar / Lilith ortalama + gerçek).
import { extraExpectOf, extraSectionBody, projectRoxyExtraSection, ROXY_EXTRA_POINTS, sectionOfEndpoint } from "../providers/roxy/extraPoints";
import { EXTRA_POINTS_INTERP_SCHEMA, EXTRA_POINTS_PART_SCHEMA, EXTRA_SECTIONS, extraSectionsOf, type ExtraSection, type ExtraPointsTechnical } from "../model/westernExtraPoints";
import { attachExtraNatal, combineExtraInterpretation, combineExtraPoints } from "./extraPoints";
// 2026-10-22 — Gezegen dönüşleri (ayrı satırlar: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { planetaryReturnBody, projectRoxyPlanetaryReturn, ROXY_PLANETARY_RETURN } from "../providers/roxy/planetaryReturn";
import { natalPlanetLongitude, planetaryReturnCluster, planetaryReturnNeighbors } from "./planetaryReturnDate";
import { isPlanetaryReturnPlanet, PLANETARY_RETURN_INTERP_SCHEMA, PLANETARY_RETURN_TECHNICAL_SCHEMA, type PlanetaryReturnPlanet } from "../model/westernPlanetaryReturn";
import { vedicGunMilan, vedicSadeSati } from "./vedicMatchTechniques";
// 2026-10-22 — Deklinasyon paralelleri (aylık gökyüzü takvimi; ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { westernDeclinationParallels } from "./declinationParallels";

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
  "western.fixed_stars",
  "western.profections",
  "western.extra_points",
  "western.planetary_return",
  "vedic.d1",
  "vedic.varga",
  "vedic.dasha",
  "vedic.drishti",
  "vedic.ashtakavarga",
  "vedic.shadbala",
  "vedic.panchanga",
  "vedic.transit",
  "vedic.bhav_chalit",
  "vedic.chara_karaka",
  "vedic.arudha",
  "vedic.bhava_bala",
  "kp.chart",
  "kp.dasha",
  "kp.ruling",
  "kp.transit",
  "kp.horary",
  // 2026-10-22: KP Ruling Planets zaman aralığı taraması — kp.ruling'den AYRI teknik (anın haritası significator'ları; doğum verisi yok).
  "kp.ruling_interval",
  // 2026-10-22 Atlas yeni teknikler (yalnız ek): Vedik eşleştirme (Gun Milan + Manglik) ve Sade Sati.
  "vedic.gun_milan",
  "vedic.sade_sati",
  // 2026-10-22: Deklinasyon paralelleri (aylık; doğum verisi kullanılmaz) — western.forecast'tan AYRI teknik.
  "western.declination_parallels",
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

/**
 * HORARY-P1 (2026-10-18): yalnız KP horary'nin soru anı. "Şimdi" = sunucunun isteği işlediği GERÇEK UTC dakika (saniye ve
 * milisaniye atılır; dakika SIFIRLANMAZ — zaman Lagna'sı ve ruling planets dakikaya duyarlıdır). Saat istemciden alınmaz.
 * Diğer biçimler (kayıtlı atUtc, tarih + saat + IANA) ortak normalizeTransitMoment ile aynen; transit tekniklerinin
 * "şimdi = UTC saat başı" davranışı DEĞİŞMEZ.
 */
export function normalizeQuestionMoment(raw: Record<string, unknown>, now: Date): string | null {
  if (raw.now === true) {
    const d = new Date(now);
    if (!Number.isFinite(d.getTime())) return null;
    d.setUTCSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  }
  return normalizeTransitMoment(raw, now);
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
    unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: roxyNatalAdapterVersion((options as NatalMethodOptions).houseSystem) }, buildNatalRequestBody(ctx.birth, options as NatalMethodOptions), {
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
    if (!atUtc || !nodeType || !yearOk(Number(atUtc.slice(0, 4)))) return null;
    // TRANSİT-01: GÖSTERİM saat dilimi (yalnız ekran/rapor) ve kaynak takvim penceresi (yalnız-önbellek kesinleşme
    // eşleşmesi). İkisi de istek gövdesine GİRMEZ → önbellek anahtarı değişmez; verilmedikleri sürece normalize
    // seçenek nesnesi eskisiyle BİREBİR aynıdır ({ atUtc, nodeType }).
    const out: Record<string, unknown> = { atUtc, nodeType };
    const tz = r.displayTz ?? (r.now === true ? undefined : r.timezone);
    if (tz !== undefined) {
      if (typeof tz !== "string" || !isValidIanaTimeZone(tz)) return null;
      out.displayTz = tz;
    }
    if (r.calendar !== undefined) {
      const c = parseCalendarWindow(r.calendar);
      if (!c) return null;
      out.calendar = c;
    }
    return out;
  },
  units: (ctx, opt) => {
    const at = String(opt.atUtc);
    return [unit("western.transit", ROXY_TRANSIT, transitBody(ctx.birth, { date: at.slice(0, 10), time: `${at.slice(11, 16)}:00` }, opt.nodeType as NodeType), { timeDependent: true })];
  },
  project: (_u, raw, opt) => fromAdapter(projectRoxyTransit(raw, { nodeType: opt.nodeType as NodeType, atUtc: `${opt.atUtc}Z` }), TRANSIT_TECHNICAL_SCHEMA, TRANSIT_INTERP_SCHEMA, ROXY_TRANSIT.projection),
  // Çift halka natal çerçevesi: AYNI doğum verisi + AYNI düğüm türüyle önbellekteki natal (ev sistemi önceliği
  // Placidus → Tam burç → Eşit → Koch). Gövde doğum verisinden kurulduğu için başka revizyonun natali eşleşemez.
  // TRANSİT-01: takvim günü bağlantısı varsa ARDINDAN o takvimin parçaları (aynı gövdeler → aynı önbellek anahtarları).
  contextUnits: (ctx, opt) => [
    ...TRANSIT_FRAME_HOUSE_SYSTEMS.map((hs) =>
      unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: roxyNatalAdapterVersion(hs) }, buildNatalRequestBody(ctx.birth, { houseSystem: hs, nodeType: opt.nodeType as NodeType })),
    ),
    ...(isCalendarWindow(opt.calendar) ? westernForecast.units(ctx, opt.calendar) : []),
  ],
  attachContext: (technical, context, opt) => {
    const t = technical as TransitTechnical;
    const natalCtx = context.slice(0, TRANSIT_FRAME_HOUSE_SYSTEMS.length);
    // Takvim bağlantısı: yalnız seçenekte varsa alan eklenir (yoksa teknik katman eskisiyle aynı biçimde kalır).
    const cal = isCalendarWindow(opt.calendar)
      ? (() => {
          const chunks = forecastChunks(opt.calendar.startDate, opt.calendar.days);
          const parts = context.slice(TRANSIT_FRAME_HOUSE_SYSTEMS.length).map((c) => (c && (c as { schema?: string }).schema === FORECAST_TECHNICAL_SCHEMA ? (c as ForecastTechnical) : null));
          return { calendarExact: calendarExactFor(t, parts, { start: chunks[0].start, end: chunks[chunks.length - 1].end }) };
        })()
      : {};
    const natal = natalCtx.find((c): c is NatalTechnical => !!c && (c as { schema?: string }).schema === NATAL_TECHNICAL_SCHEMA) ?? null;
    if (!natal || !natal.angles || natal.houses.length !== 12 || natal.nodeType !== opt.nodeType) return { ...t, natalFrame: null, ...cal };
    return {
      ...t,
      ...cal,
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

/** Takvim penceresi (forecast seçeneği ile AYNI kural): başlangıç günü + 1..366 gün; yıl 1600–2600. */
type CalendarWindow = { startDate: string; days: number };
function parseCalendarWindow(raw: unknown): CalendarWindow | null {
  const r = o(raw);
  const days = Number(r.days ?? 90);
  if (typeof r.startDate !== "string" || !isValidIsoDate(r.startDate) || !yearOk(Number(r.startDate.slice(0, 4))) || !Number.isInteger(days) || days < 1 || days > FORECAST_MAX_DAYS) return null;
  return { startDate: r.startDate, days };
}
const isCalendarWindow = (v: unknown): v is CalendarWindow => parseCalendarWindow(v) !== null;

const westernForecast: TechniqueDefinition = {
  id: "western.forecast",
  label: "Transit takvimi (dönem)",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw) => {
    const r = o(raw);
    const w = parseCalendarWindow(r);
    if (!w) return null;
    // TRANSİT-01: yalnız GÖSTERİM saat dilimi (gün gruplaması / yerel saat); gövdeye girmez → önbellek anahtarı aynı.
    if (r.displayTz === undefined) return w;
    return typeof r.displayTz === "string" && isValidIanaTimeZone(r.displayTz) ? { ...w, displayTz: r.displayTz } : null;
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
  // AŞAMA 2.1/2.2 (2026-10-21): çift halka natal çerçevesi — transit deseniyle AYNI (YALNIZ önbellek; plana / istek sayısına
  // girmez, sağlayıcıya natal GÖNDERİLMEZ). Aynı doğum verisi (= aynı revizyon) + aynı düğüm türü; ev sistemi önceliği
  // Placidus → Tam burç → Eşit → Koch. İstek gövdesi / adaptör / projeksiyon sürümü DEĞİŞMEZ → önbellek anahtarı aynı.
  contextUnits: (ctx, opt) => natalFrameUnits(ctx, opt.nodeType as NodeType),
  attachContext: (technical, context, opt) => {
    const frame = natalFrameFrom(context, opt.nodeType as NodeType);
    if (id === "western.progression") return { ...(technical as ProgressionTechnical), natalFrame: frame };
    const t = technical as SolarArcTechnical;
    // Ek güvenlik: Solar Arc yanıtı natal boylamları kendisi taşır; önbellekteki natal bunlarla uyuşmazsa (farklı doğum
    // verisi / hesap ayarı) çerçeve EKLENMEZ — yanlış iç halka çizilmez.
    return { ...t, natalFrame: frame && solarArcFrameConsistent(t, frame) ? frame : null };
  },
});

/** Natal çerçeve bağlam birimleri (yalnız önbellek sorgusu; transit ile aynı gövde kuralı). */
function natalFrameUnits(ctx: UnitContext, nodeType: NodeType): CalcUnit[] {
  return TRANSIT_FRAME_HOUSE_SYSTEMS.map((hs) => unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: roxyNatalAdapterVersion(hs) }, buildNatalRequestBody(ctx.birth, { houseSystem: hs, nodeType })));
}

/** Önbellekten gelen natal teknik katmanlardan ilk uyumlu olanın çerçevesi (transit attachContext ile aynı ölçüt). */
export function natalFrameFrom(context: (unknown | null)[], nodeType: NodeType): TransitNatalFrame | null {
  const natal = context.find((c): c is NatalTechnical => !!c && (c as { schema?: string }).schema === NATAL_TECHNICAL_SCHEMA) ?? null;
  if (!natal || !natal.angles || natal.houses.length !== 12 || natal.nodeType !== nodeType) return null;
  return {
    houseSystem: natal.houseSystem,
    nodeType: natal.nodeType,
    bodies: natal.bodies.map((b) => ({ id: b.id, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, latitude: b.latitude, speed: b.speed, retrograde: b.retrograde, house: b.house })),
    houses: natal.houses,
    angles: natal.angles,
  };
}

/** Solar Arc natal boylamları ↔ önbellekteki natal: her ortak nokta ≤ 0,05° (aynı doğum anı ise birebir). */
function solarArcFrameConsistent(t: SolarArcTechnical, f: TransitNatalFrame): boolean {
  const natal = new Map<string, number>([...f.bodies.map((b) => [b.id, b.longitude] as [string, number]), ["ascendant", f.angles.ascendant.longitude], ["midheaven", f.angles.midheaven.longitude]]);
  let shared = 0;
  for (const d of t.directed) {
    const n = natal.get(d.id);
    if (n === undefined) continue;
    shared += 1;
    const diff = Math.abs((((d.natalLongitude - n) % 360) + 540) % 360 - 180);
    if (diff > 0.05) return false;
  }
  return shared > 0;
}

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
    unit("western.solar_return", returnAdapterMeta(ROXY_SOLAR_RETURN, opt.houseSystem as HouseSystem), solarReturnBody(ctx.birth, Number(opt.returnYear), opt.houseSystem as HouseSystem, ctx.places?.target ?? null), { timeDependent: true }),
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
      unit("western.lunar_return", returnAdapterMeta(ROXY_LUNAR_RETURN, opt.houseSystem as HouseSystem), lunarReturnBody(ctx.birth, pick.requestDate, opt.houseSystem as HouseSystem, ctx.places?.target ?? null), {
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

// ─── 2026-10-22: GEZEGEN DÖNÜŞÜ (Satürn / Jüpiter / Mars / Venüs / Merkür) ────────────────────────────────────────────────
// Solar/Lunar Return deseni: saat zorunlu, dönüş konumu (returnLocationId; sunucuda çözülür), ev sistemi. Hedef tarihe en yakın
// dönüş KÜMESİNİN kavuşumları planInfo ile listelenir; uzman kavuşumu seçer (retro döngüsünde 2–3). Seçilen kavuşumun UTC günü
// sağlayıcıya gider → aynı kavuşum = aynı gövde = aynı önbellek anahtarı (hedef tarih farklı olsa da).
// 22.10 akşam (performans): seçim saf ve deterministiktir (gezegen + doğum anı + hedef tarih + kavuşum); plan / units /
// planInfo / noUnitsReason aynı istekte 3–4 kez çağırır → küçük sınırlı önbellek (sonuç aynı, yalnız tekrar tarama önlenir).
const PR_PICK_CACHE = new Map<string, ReturnType<typeof planetaryReturnPickUncached>>();
const PR_NB_CACHE = new Map<string, { previous: string | null; next: string | null }>();
function planetaryReturnPick(ctx: UnitContext, opt: Record<string, unknown>) {
  const key = `${String(opt.planet)}|${ctx.birthUtc}|${String(opt.approxDate)}|${String(opt.crossing ?? 1)}`;
  const hit = PR_PICK_CACHE.get(key);
  if (hit) return hit;
  const v = planetaryReturnPickUncached(ctx, opt);
  if (PR_PICK_CACHE.size >= 64) PR_PICK_CACHE.delete(PR_PICK_CACHE.keys().next().value!);
  PR_PICK_CACHE.set(key, v);
  return v;
}
function planetaryReturnPickUncached(ctx: UnitContext, opt: Record<string, unknown>) {
  const planet = opt.planet as PlanetaryReturnPlanet;
  const natal = natalPlanetLongitude(planet, ctx.birthUtc);
  const cluster = planetaryReturnCluster(planet, natal, String(opt.approxDate));
  const pick = cluster.find((c) => c.crossing === Number(opt.crossing ?? 1)) ?? null;
  const beforeBirth = !!pick && Date.parse(`${pick.approxUtc}:00Z`) <= Date.parse(ctx.birthUtc);
  return { planet, natal, cluster, pick: beforeBirth ? null : pick, beforeBirth };
}

const westernPlanetaryReturn: TechniqueDefinition = {
  id: "western.planetary_return",
  label: "Gezegen dönüşü",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: true,
  parseOptions: (raw) => {
    const r = o(raw);
    const hs = houseOf(r.houseSystem);
    if (!isPlanetaryReturnPlanet(r.planet) || !hs) return null;
    if (typeof r.approxDate !== "string" || !isValidIsoDate(r.approxDate) || !yearOk(Number(r.approxDate.slice(0, 4)))) return null;
    const crossing = r.crossing === undefined || r.crossing === null ? 1 : Number(r.crossing);
    if (crossing !== 1 && crossing !== 2 && crossing !== 3) return null;
    const loc = returnLocationOf(r);
    if (loc === undefined) return null;
    return { planet: r.planet, approxDate: r.approxDate, crossing, houseSystem: hs, returnLocationId: loc };
  },
  units: (ctx, opt) => {
    const { planet, natal, pick } = planetaryReturnPick(ctx, opt);
    if (!pick) return [];
    return [
      unit("western.planetary_return", ROXY_PLANETARY_RETURN, planetaryReturnBody(ctx.birth, planet, pick.requestDate, opt.houseSystem as HouseSystem, ctx.places?.target ?? null), {
        timeDependent: true,
        expect: { returnUtc: pick.approxUtc, crossing: String(pick.crossing), of: String(pick.of), motion: pick.motion, toleranceMinutes: String(pick.toleranceMinutes), natalLongitude: String(natal) },
      }),
    ];
  },
  planInfo: (ctx, opt) => {
    const p = planetaryReturnPick(ctx, opt);
    // "Önceki / sonraki dönüş" kısayolu: komşu kümelerin ilk kavuşum günü (yalnız tarih; doğumdan önceki ya da aralık dışı → null).
    const nbKey = `${p.planet}|${ctx.birthUtc}|${String(opt.approxDate)}`;
    const nb = PR_NB_CACHE.get(nbKey) ?? planetaryReturnNeighbors(p.planet, p.natal, String(opt.approxDate), p.cluster);
    if (!PR_NB_CACHE.has(nbKey)) {
      if (PR_NB_CACHE.size >= 64) PR_NB_CACHE.delete(PR_NB_CACHE.keys().next().value!);
      PR_NB_CACHE.set(nbKey, nb);
    }
    const inRange = (d: string | null) => (d && yearOk(Number(d.slice(0, 4))) && Date.parse(`${d}T23:59:59Z`) > Date.parse(ctx.birthUtc) ? d : null);
    return {
      planetaryReturns: p.cluster.map((c) => ({ crossing: c.crossing, of: c.of, approxUtc: c.approxUtc, motion: c.motion })),
      planetaryReturnNeighbors: { previous: inRange(nb.previous), next: inRange(nb.next) },
    };
  },
  noUnitsReason: (ctx, opt) => {
    const p = planetaryReturnPick(ctx, opt);
    if (p.cluster.length === 0) return "hedef tarihe yakın bir dönüş bulunamadı.";
    if (p.beforeBirth) return "seçilen kavuşum doğumdan önce; daha ileri bir hedef tarih seçin.";
    return `bu dönüş kümesinde ${p.cluster.length} kavuşum var; ${String(opt.crossing ?? 1)}. kavuşum yok.`;
  },
  noteContext: (opt) => `gezegen:${String(opt.planet)}`,
  parseNoteContextOptions: (raw) => (isPlanetaryReturnPlanet(raw.gezegen) ? { planet: raw.gezegen } : null),
  project: (u, raw, opt) => {
    const e = u.expect;
    if (!e || !e.returnUtc || !e.crossing || !e.of || !e.toleranceMinutes || !e.natalLongitude || (e.motion !== "direct" && e.motion !== "retrograde")) return { ok: false, errors: ["seçilen kavuşum bilgisi yok"] };
    return fromAdapter(
      projectRoxyPlanetaryReturn(raw, {
        planet: opt.planet as PlanetaryReturnPlanet,
        houseSystem: opt.houseSystem as HouseSystem,
        birthDate: String(u.body.birthDate),
        approximateDate: String(u.body.approximateDate),
        crossing: Number(e.crossing),
        of: Number(e.of),
        motion: e.motion,
        expectedUtc: e.returnUtc,
        toleranceMinutes: Number(e.toleranceMinutes),
        location: bodyLocation(u),
        natalLongitude: Number(e.natalLongitude),
      }),
      PLANETARY_RETURN_TECHNICAL_SCHEMA,
      PLANETARY_RETURN_INTERP_SCHEMA,
      ROXY_PLANETARY_RETURN.projection,
    );
  },
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
    const meta = id === "western.synastry" ? ROXY_SYNASTRY : roxyCompositeMeta(opt.houseSystem as HouseSystem);
    return [unit(id, meta, pairBody(ctx.birth, ctx.partner, opt.nodeType as NodeType, opt.houseSystem as HouseSystem))];
  },
  project: (_u, raw, opt) =>
    id === "western.synastry"
      ? fromAdapter(projectRoxySynastry(raw, { houseSystem: opt.houseSystem as HouseSystem, nodeType: opt.nodeType as NodeType }), SYNASTRY_TECHNICAL_SCHEMA, SYNASTRY_INTERP_SCHEMA, ROXY_SYNASTRY.projection)
      : fromAdapter(projectRoxyComposite(raw, { houseSystem: opt.houseSystem as HouseSystem, nodeType: opt.nodeType as NodeType }), COMPOSITE_TECHNICAL_SCHEMA, COMPOSITE_INTERP_SCHEMA, roxyCompositeMeta(opt.houseSystem as HouseSystem).projection),
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
      unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: roxyNatalAdapterVersion(hs) }, buildNatalRequestBody(ctx.birth, { houseSystem: hs, nodeType: "true" }), { part: 1 }),
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

// ─── Yıllık profeksiyonlar (2026-10-20) ──────────────────────────────────────
// Temel ASC profeksiyonu, BÜTÜN-BURÇ (owner kararı; FAZ 0 gerçek doğrulama 15/15). Seçenek yalnız tamamlanmış yaş;
// hedef tarih = o yaşın ilk günü (doğum günü; 29 Şubat → artık olmayan yılda 1 Mart) → aynı profeksiyon yılı HER ZAMAN aynı
// gövde = aynı önbellek anahtarı (farklı gün seçimi yeni istek üretmez). Ev sistemi bu teknikte sabit "whole-sign"tir
// (natal tercih değişmez). Sağlayıcının kısa açıklaması ayrı yorum katmanında ("Sistem Yorumu", 2026-10-20). Uzman notları yaşa göre
// ayrılır (noteContext).
const westernProfections: TechniqueDefinition = {
  id: "western.profections",
  label: "Yıllık Profeksiyonlar",
  family: "western",
  requiresPartner: false,
  // Profeksiyon Yükselen burçtan sayılır; Yükselen doğum saatine bağlıdır.
  requiresKnownTime: true,
  timeDependent: true,
  parseOptions: (raw) => {
    const age = profectionAgeOf(o(raw).age);
    return age === null ? null : { age };
  },
  units: (ctx, opt) => {
    const body = profectionsBody(ctx.birth, Number(opt.age));
    return body ? [unit("western.profections", ROXY_PROFECTIONS, body, { timeDependent: true })] : [];
  },
  noUnitsReason: () => "Seçilen profeksiyon yılı için geçerli bir hedef tarih oluşturulamadı.",
  project: (u, raw, opt) =>
    fromAdapter(
      projectRoxyProfections(raw, {
        date: String(u.body.date),
        time: String(u.body.time),
        latitude: Number(u.body.latitude),
        longitude: Number(u.body.longitude),
        timezone: Number(u.body.timezone),
        targetDate: String(u.body.targetDate),
        age: Number(opt.age),
      }),
      PROFECTIONS_TECHNICAL_SCHEMA,
      PROFECTIONS_INTERP_SCHEMA,
      ROXY_PROFECTIONS.projection,
    ),
  // "Kendi Yorumum" her profeksiyon yılı için ayrı (36 yaş notu 37 yaşta görünmez). Bağlam sunucuda yeniden türetilir.
  noteContext: (opt) => `yas:${Number(opt.age)}`,
  parseNoteContextOptions: (raw) => {
    const age = profectionAgeOf(raw.yas);
    return age === null ? null : { age };
  },
};

// ─── Sabit yıldızlar (2026-10-14) ────────────────────────────────────────────
// Ekliptik boylam kavuşumu (paran DEĞİL). Sağlayıcıdan HER ZAMAN orb=3 (Roxy üst sınırı) istenir; uzmanın orbu
// (0,5–3°) yalnız gösterim/rapor filtresidir → seçenekte durur ama gövdeye/sorguya GİRMEZ → orb değişince önbellek
// anahtarı aynı kalır (0 yeni istek). Saat bilinmiyorsa ASC/MC/Ay temasları görünümde maskelenir.
const westernFixedStars: TechniqueDefinition = {
  id: "western.fixed_stars",
  label: "Sabit yıldızlar",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: false,
  parseOptions: (raw) => {
    const r = o(raw);
    const nodeType = nodeTypeOf(r.nodeType);
    if (!nodeType) return null;
    if (r.orb !== undefined && r.orb !== null && !(FIXED_STAR_ORB_OPTIONS as readonly number[]).includes(Number(r.orb))) return null;
    if (r.reportCatalog !== undefined && typeof r.reportCatalog !== "boolean") return null;
    // orb ve reportCatalog yalnız gösterim/rapor tercihidir: gövdeye ve sorguya GİRMEZ → önbellek anahtarı değişmez.
    return { nodeType, orb: fixedStarOrbOf(r.orb), reportCatalog: r.reportCatalog === true };
  },
  units: (ctx, opt) => [unit("western.fixed_stars", ROXY_FIXED_STARS, fixedStarsBody(ctx.birth, opt.nodeType as NodeType), { query: { orb: String(FIXED_STAR_ORB_QUERY) } })],
  project: (u, raw, opt) =>
    fromAdapter(
      projectRoxyFixedStars(raw, {
        date: String(u.body.date),
        time: String(u.body.time),
        latitude: Number(u.body.latitude),
        longitude: Number(u.body.longitude),
        timezone: Number(u.body.timezone),
        nodeType: opt.nodeType as NodeType,
        orbQueried: FIXED_STAR_ORB_QUERY,
      }),
      FIXED_STARS_TECHNICAL_SCHEMA,
      FIXED_STARS_INTERP_SCHEMA,
      ROXY_FIXED_STARS.projection,
    ),
};

// ─── Ek noktalar (2026-10-22) ────────────────────────────────────────────────
// Tek teknik, üç İSTEĞE BAĞLI bölüm (asteroitler / Hermetik lotlar / Lilith ortalama + gerçek); her bölüm AYRI uç = ayrı hesap
// birimi → yalnız seçilen bölüm istek açar ve her bölüm kendi önbellek satırında durur. Natal tekniği, natal gövdesi ve natal
// önbellek anahtarı DEĞİŞMEZ (natal yalnız ortalama Lilith taşır). Natal çark kalabalıklaştırılmaz: noktalar bu tekniğin
// ekranında; aynı doğum verisi + aynı ev sistemiyle natal ÖNBELLEKTE varsa (progresyon/transit contextUnits deseni; plana ve
// istek sayısına girmez) natal çark + ek noktalar katmanı ve tutarlılık denetimi eklenir.
// Saat bilinmiyorsa: lotlar (tamamen Yükselen'e bağlı) İSTENMEZ; asteroit ve Lilith konumları istenir, evleri görünümde maskelenir.
// Kutup dairesi ötesinde (|enlem| > 66,5°) Placidus/Koch ev bölmesi tanımsız (sağlayıcı sessizce Whole Sign'a geçer, yanıt
// reddedilir ama ücretlenir) → bu ev sistemleriyle asteroit/Lilith istenmez; lotlar (sect Placidus ile) hiç istenmez.
const EXTRA_POLAR_LATITUDE = 66.5;
function extraSkipReason(ctx: UnitContext, opt: Record<string, unknown>, s: ExtraSection): string | null {
  const polar = Math.abs(ctx.birth.latitude) > EXTRA_POLAR_LATITUDE;
  if (s === "lots") {
    if (ctx.birth.birthTime === null) return "Hermetik lotlar Yükselen'e bağlıdır; doğum saati bilinmeden hesaplanmaz.";
    if (polar) return "Hermetik lotların gündüz/gece ayrımı kutup dairesi ötesindeki doğum yerinde güvenilir belirlenemez; lotlar hesaplanmaz.";
    return null;
  }
  if (polar && (opt.houseSystem === "placidus" || opt.houseSystem === "koch")) return "Seçilen ev sistemi bu enlemde tanımsızdır; Whole Sign veya Equal ev sistemini seçin.";
  return null;
}
const EXTRA_SECTION_LABEL: Record<ExtraSection, string> = { asteroids: "Asteroitler", lots: "Hermetik lotlar", lilith: "Kara Ay Lilith (ortalama + gerçek)" };

const westernExtraPoints: TechniqueDefinition = {
  id: "western.extra_points",
  label: "Ek noktalar",
  family: "western",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: false,
  parseOptions: (raw) => {
    const r = o(raw);
    const sections = extraSectionsOf(r.sections);
    const houseSystem = houseOf(r.houseSystem);
    return sections && houseSystem ? { sections, houseSystem } : null;
  },
  units: (ctx, opt) =>
    (opt.sections as ExtraSection[])
      .filter((s) => extraSkipReason(ctx, opt, s) === null)
      .map((s) => unit("western.extra_points", ROXY_EXTRA_POINTS[s], extraSectionBody(s, ctx.birth, opt.houseSystem as HouseSystem), { part: EXTRA_SECTIONS.indexOf(s) })),
  noUnitsReason: (ctx, opt) =>
    (opt.sections as ExtraSection[])
      .map((s) => extraSkipReason(ctx, opt, s))
      .filter((x): x is string => !!x)
      .join(" ") || "hesap birimi oluşturulamadı.",
  planInfo: (ctx, opt) => {
    const skipped = (opt.sections as ExtraSection[]).map((s) => ({ section: s, label: EXTRA_SECTION_LABEL[s], reason: extraSkipReason(ctx, opt, s) })).filter((x) => x.reason !== null);
    return skipped.length ? { skippedSections: skipped } : null;
  },
  project: (u, raw) => {
    const s = sectionOfEndpoint(u.endpoint);
    if (!s) return { ok: false, errors: ["bilinmeyen ek nokta ucu"] };
    return fromAdapter(projectRoxyExtraSection(s, raw, extraExpectOf(u.body, s)), EXTRA_POINTS_PART_SCHEMA, EXTRA_POINTS_INTERP_SCHEMA, ROXY_EXTRA_POINTS[s].projection);
  },
  combineTechnical: (parts, opt) => combineExtraPoints(parts, { sections: opt.sections as ExtraSection[], houseSystem: opt.houseSystem as HouseSystem }),
  combineInterpretation: (parts) => combineExtraInterpretation(parts),
  // Natal çerçeve: AYNI doğum verisi + AYNI ev sistemi (asteroit/Lilith evleri bu sistemle) — önce gerçek, sonra ortalama düğüm
  // (düğüm türü ek noktaları etkilemez). YALNIZ önbellek: plana / istek sayısına / onaya girmez, sağlayıcıya natal gönderilmez.
  contextUnits: (ctx, opt) =>
    (["true", "mean"] as NodeType[]).map((nodeType) =>
      unit("western.natal", { endpoint: ROXY_NATAL_ENDPOINT, adapter: roxyNatalAdapterVersion(opt.houseSystem as HouseSystem) }, buildNatalRequestBody(ctx.birth, { houseSystem: opt.houseSystem as HouseSystem, nodeType })),
    ),
  attachContext: (technical, context) => attachExtraNatal(technical as ExtraPointsTechnical, context),
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

/**
 * 2026-10-21 — dasha düzey yolu (Maha → Antar → Pratyantar → Sookshma). Yeni anahtarlar (pratyantardasha, sookshma) YALNIZ doluysa
 * seçeneğe girer → eski seçimlerin normalize seçenekleri ve not bağlamları birebir aynı kalır. Eksik zincir (ör. sookshma var,
 * pratyantardasha yok) reddedilir.
 */
function dashaPathOf(r: Record<string, unknown>): Record<string, VedicGrahaId | null> | null {
  const md = dashaLordOf(r.mahadasha);
  const ad = dashaLordOf(r.antardasha);
  const pd = dashaLordOf(r.pratyantardasha);
  const sd = dashaLordOf(r.sookshma);
  if (md === undefined || ad === undefined || pd === undefined || sd === undefined) return null;
  if ((ad && !md) || (pd && !ad) || (sd && !pd)) return null;
  return { mahadasha: md, antardasha: ad, ...(pd ? { pratyantardasha: pd } : {}), ...(sd ? { sookshma: sd } : {}) };
}
/**
 * 2026-10-21 — "Güncel dönem zinciri" seçeneği: `chainAtUtc` (UTC dakika) veya `chainNow: true` (sunucunun GERÇEK UTC dakikası;
 * KP horary ile aynı — zincirin en ince düzeyi dakikalara duyarlı). Yoksa seçenek YOK (eski davranış, ek birim yok).
 */
function dashaChainOf(r: Record<string, unknown>, now: Date): { chainAtUtc?: string } | null {
  if (r.chainNow === true) {
    const at = normalizeQuestionMoment({ now: true }, now);
    return at ? { chainAtUtc: at } : null;
  }
  if (r.chainAtUtc === undefined || r.chainAtUtc === null || r.chainAtUtc === "") return {};
  return typeof r.chainAtUtc === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.chainAtUtc) && isValidIsoDate(r.chainAtUtc.slice(0, 10)) ? { chainAtUtc: r.chainAtUtc } : null;
}
const dashaPathNote = (opt: Record<string, unknown>) =>
  `${opt.mahadasha ? `|mahadasha:${String(opt.mahadasha)}` : ""}${opt.antardasha ? `|antardasha:${String(opt.antardasha)}` : ""}${opt.pratyantardasha ? `|pratyantardasha:${String(opt.pratyantardasha)}` : ""}${opt.sookshma ? `|sookshma:${String(opt.sookshma)}` : ""}`;
const dashaEndpointOf = (opt: Record<string, unknown>) =>
  dashaEndpoint((opt.mahadasha as VedicGrahaId | null) ?? null, (opt.antardasha as VedicGrahaId | null) ?? null, (opt.pratyantardasha as VedicGrahaId | null) ?? null, (opt.sookshma as VedicGrahaId | null) ?? null);
const birthLocalOf = (b: { date: string; time: string }) => `${b.date}T${/^\d{2}:\d{2}$/.test(b.time) ? `${b.time}:00` : b.time}`;
/** Zincir birimi (parça 1, zamana bağlı): doğum gövdesi + datetime (doğum ofsetinde yerel). */
function dashaChainUnit(technique: TechniqueId, ctx: UnitContext, opt: Record<string, unknown>, kp: { nodeType: KpNodeType } | null): CalcUnit {
  return unit(technique, ROXY_VEDIC_DASHA_CURRENT, vedicDashaCurrentBody(ctx.birth, opt.ayanamsa as VedicAyanamsa, String(opt.chainAtUtc), kp), { timeDependent: true, part: 1 });
}
function projectDashaChain(u: CalcUnit, raw: unknown, opt: Record<string, unknown>, kp: boolean): TechniqueProjection {
  const b = u.body as { date: string; time: string; timezone: number; datetime: string };
  return fromAdapter(
    projectRoxyVedicDashaCurrent(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa, birthLocal: birthLocalOf(b), atUtc: String(opt.chainAtUtc), atLocal: b.datetime, utcOffsetHours: b.timezone, kp }),
    VEDIC_DASHA_CURRENT_SCHEMA,
    null,
    ROXY_VEDIC_DASHA_CURRENT.projection,
  );
}
/** Düzey listesi (parça 0) + varsa zincir (parça 1) → tek teknik veri; zincir yalnız o anki halkaları taşır (kayıt tek düzey). */
export function combineDasha(parts: unknown[]): unknown {
  const level = parts.find((x) => (x as { schema?: string })?.schema !== VEDIC_DASHA_CURRENT_SCHEMA) as VedicDashaTechnical | undefined;
  if (!level) return null;
  const cur = parts.find((x) => (x as { schema?: string })?.schema === VEDIC_DASHA_CURRENT_SCHEMA) as VedicDashaCurrent | undefined;
  return cur ? { ...level, current: cur } : level;
}

const vedicDasha: TechniqueDefinition = {
  id: "vedic.dasha",
  label: "Vimshottari Dasha",
  family: "vedic",
  requiresPartner: false,
  // Ay ~13°/gün: saat bilinmeden nakshatra/bakiye (tüm tarihler) güvenilmez.
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw, now) => {
    const ay = ayanamsaOf(o(raw).ayanamsa);
    const path = dashaPathOf(o(raw));
    const chain = dashaChainOf(o(raw), now);
    if (!ay || !path || !chain) return null;
    return { ayanamsa: ay, ...path, ...chain };
  },
  units: (ctx, opt) => [
    unit("vedic.dasha", { endpoint: dashaEndpointOf(opt), adapter: ROXY_VEDIC_DASHA.adapter }, vedicBirthBody(ctx.birth, opt.ayanamsa as VedicAyanamsa)),
    ...(opt.chainAtUtc ? [dashaChainUnit("vedic.dasha", ctx, opt, null)] : []),
  ],
  // Zincir birimi isteğe bağlı: düzey listesi zorunlu parçadır (sağlayıcı yorumu da yalnız ondan).
  primaryPart: 0,
  combineTechnical: (parts) => combineDasha(parts),
  // Not bağlamı düzey yolundan; zincir anı not bağlamına GİRMEZ.
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}${dashaPathNote(opt)}`,
  project: (u, raw, opt) => {
    if (u.endpoint === ROXY_VEDIC_DASHA_CURRENT.endpoint) return projectDashaChain(u, raw, opt, false);
    const b = u.body as { date: string; time: string; timezone: number };
    return fromAdapter(
      projectRoxyVedicDasha(raw, {
        ayanamsa: opt.ayanamsa as VedicAyanamsa,
        mahadasha: (opt.mahadasha as VedicGrahaId | null) ?? null,
        antardasha: (opt.antardasha as VedicGrahaId | null) ?? null,
        pratyantardasha: (opt.pratyantardasha as VedicGrahaId | null) ?? null,
        sookshma: (opt.sookshma as VedicGrahaId | null) ?? null,
        birthLocal: birthLocalOf(b),
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
const LAHIRI_ONLY = "Bu hesap yalnız Lahiri ayanamsa ile yapılabilir (başka ayanamsa desteklenmez); Lahiri seçin.";

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
/**
 * 2026-10-21 — Janma Panchanga + "Ayrıntılı Panchanga" SEÇENEĞİ. Seçenek yoksa davranış birebir eski (tek birim, aynı gövde/anahtar,
 * normalize seçenek yalnız {ayanamsa}). `detail: true` → ikinci birim /panchang/detailed: GÜN (detailDate; boşsa doğum günü) +
 * KONUM (placeLocationId; boşsa doğum yeri) — konum/ofset sunucuda çözülür (service.ts), kutup dairesi ötesinde istek YOK.
 */
export function panchangaDetailOf(r: Record<string, unknown>): { detail?: true; detailDate?: string | null; placeLocationId?: string | null } | null {
  if (r.detail === undefined || r.detail === null || r.detail === false) return {};
  if (r.detail !== true) return null;
  const d = r.detailDate;
  const date = d === undefined || d === null || d === "" ? null : typeof d === "string" && isValidIsoDate(d) && d >= "1600-01-01" && d <= "2600-12-31" ? d : undefined;
  const place = kpPlaceOf(r.placeLocationId);
  if (date === undefined || place === undefined) return null;
  return { detail: true, detailDate: date, placeLocationId: place };
}
/**
 * 2026-10-22 — "Gezegen saatleri (Hora) + Choghadiya" SEÇENEĞİ (`hours: true`): Ayrıntılı Panchanga ile AYNI gün (detailDate) + konum
 * (placeLocationId) alanlarını kullanır; tek başına veya Ayrıntılı Panchanga ile birlikte seçilebilir. `hours` yoksa sonuç
 * panchangaDetailOf ile BİREBİR aynıdır (eski seçenek nesnesi, eski gövde/anahtar).
 */
export function panchangaDayOptionsOf(r: Record<string, unknown>): Record<string, unknown> | null {
  const h = r.hours;
  if (h === undefined || h === null || h === false) return panchangaDetailOf(r);
  if (h !== true) return null;
  const detailOff = r.detail === undefined || r.detail === null || r.detail === false;
  const det = panchangaDetailOf(detailOff ? { ...r, detail: true } : r);
  if (!det) return null;
  return detailOff ? { detailDate: det.detailDate, placeLocationId: det.placeLocationId, hours: true } : { ...det, hours: true };
}
function combinePanchangaHours(parts: unknown[], date: string): PanchangaHours {
  const hora = (parts.find((x) => (x as { schema?: string })?.schema === VEDIC_HORA_SCHEMA) as VedicHoraTechnical | undefined) ?? null;
  const choghadiya = (parts.find((x) => (x as { schema?: string })?.schema === VEDIC_CHOGHADIYA_SCHEMA) as VedicChoghadiyaTechnical | undefined) ?? null;
  return { date: hora?.date ?? choghadiya?.date ?? date, hora, choghadiya, missing: [...(hora ? [] : ["hora" as const]), ...(choghadiya ? [] : ["choghadiya" as const])] };
}
const vedicPanchanga: TechniqueDefinition = {
  id: "vedic.panchanga",
  label: "Janma Panchanga",
  family: "vedic",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const ay = ayanamsaOf(o(raw).ayanamsa);
    const det = panchangaDayOptionsOf(o(raw));
    return ay && det ? { ayanamsa: ay, ...det } : null;
  },
  units: (ctx, opt) => {
    if (opt.ayanamsa !== "lahiri") return [];
    const base = unit("vedic.panchanga", ROXY_VEDIC_PANCHANGA, lahiriFixedBody(ctx));
    if ((opt.detail !== true && opt.hours !== true) || typeof opt.detailDate !== "string" || typeof opt.detailOffsetHours !== "number") return [base];
    const place = ctx.places?.target ?? { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude };
    const out = [base];
    if (opt.detail === true) out.push(unit("vedic.panchanga", ROXY_VEDIC_PANCHANGA_DETAIL, vedicPanchangDetailedBody(opt.detailDate, place, opt.detailOffsetHours), { timeDependent: true, part: 1 }));
    // 2026-10-22: Hora + Choghadiya seçeneği — aynı gün/konum gövdesi, AYRI uçlar (ayrı önbellek anahtarı); parça 2 ve 3.
    if (opt.hours === true) {
      out.push(unit("vedic.panchanga", ROXY_VEDIC_HORA, vedicPanchangDetailedBody(opt.detailDate, place, opt.detailOffsetHours), { timeDependent: true, part: 2 }));
      out.push(unit("vedic.panchanga", ROXY_VEDIC_CHOGHADIYA, vedicPanchangDetailedBody(opt.detailDate, place, opt.detailOffsetHours), { timeDependent: true, part: 3 }));
    }
    return out;
  },
  noUnitsReason: () => LAHIRI_ONLY,
  noteContext: () => "ayanamsa:lahiri",
  parseNoteContextOptions: (raw) => (Object.keys(raw).join() === "ayanamsa" && raw.ayanamsa === "lahiri" ? { ayanamsa: "lahiri" } : null),
  primaryPart: 0,
  combineTechnical: (parts, opt) => {
    const base = parts.find((x) => (x as { schema?: string })?.schema === VEDIC_PANCHANGA_TECHNICAL_SCHEMA) as VedicPanchangaTechnical | undefined;
    if (!base) return null;
    const det = parts.find((x) => (x as { schema?: string })?.schema === VEDIC_PANCHANGA_DETAIL_SCHEMA) as VedicPanchangaDetail | undefined;
    const withDetail = det ? { ...base, detail: det } : base;
    return opt?.hours === true ? { ...withDetail, hours: combinePanchangaHours(parts, String(opt.detailDate ?? "")) } : withDetail;
  },
  project: (u, raw, opt) => {
    if (u.endpoint === ROXY_VEDIC_HORA.endpoint || u.endpoint === ROXY_VEDIC_CHOGHADIYA.endpoint) {
      const b = u.body as { date: string; latitude: number; longitude: number; timezone: number };
      const label = (opt.place as { label?: unknown } | undefined)?.label;
      const ho = { date: b.date, latitude: b.latitude, longitude: b.longitude, utcOffsetHours: b.timezone, label: typeof label === "string" ? label.slice(0, 120) : null };
      return u.endpoint === ROXY_VEDIC_HORA.endpoint
        ? fromAdapter(projectRoxyVedicHora(raw, ho), VEDIC_HORA_SCHEMA, null, ROXY_VEDIC_HORA.projection)
        : fromAdapter(projectRoxyVedicChoghadiya(raw, ho), VEDIC_CHOGHADIYA_SCHEMA, null, ROXY_VEDIC_CHOGHADIYA.projection);
    }
    if (u.endpoint === ROXY_VEDIC_PANCHANGA_DETAIL.endpoint) {
      const b = u.body as { date: string; latitude: number; longitude: number; timezone: number };
      const label = (opt.place as { label?: unknown } | undefined)?.label;
      return fromAdapter(
        projectRoxyVedicPanchangaDetail(raw, { date: b.date, latitude: b.latitude, longitude: b.longitude, utcOffsetHours: b.timezone, label: typeof label === "string" ? label.slice(0, 120) : null }),
        VEDIC_PANCHANGA_DETAIL_SCHEMA,
        null,
        ROXY_VEDIC_PANCHANGA_DETAIL.projection,
      );
    }
    return fromAdapter(projectRoxyVedicPanchanga(raw), VEDIC_PANCHANGA_TECHNICAL_SCHEMA, VEDIC_PANCHANGA_INTERP_SCHEMA, ROXY_VEDIC_PANCHANGA.projection);
  },
};
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
  parseOptions: (raw, now) => {
    const ay = kpAyanamsaOf(o(raw).ayanamsa);
    const nt = kpNodeOf(o(raw).nodeType);
    const path = dashaPathOf(o(raw));
    const chain = dashaChainOf(o(raw), now);
    if (!ay || !nt || !path || !chain) return null;
    return { ayanamsa: ay, nodeType: nt, ...path, ...chain };
  },
  units: (ctx, opt) => {
    const body = { ...vedicBirthBody(ctx.birth, opt.ayanamsa as KpAyanamsa), significators: true, nodeType: opt.nodeType };
    return [
      unit("kp.dasha", { endpoint: dashaEndpointOf(opt), adapter: "astro-roxy-kp-dasha-1" }, body),
      // KP zinciri: KP ayanamsa + significators — Vedik zincirle aynı birim DEĞİL (ayanamsa alanları karışmaz).
      ...(opt.chainAtUtc ? [dashaChainUnit("kp.dasha", ctx, opt, { nodeType: opt.nodeType as KpNodeType })] : []),
    ];
  },
  primaryPart: 0,
  combineTechnical: (parts) => combineDasha(parts),
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|nodeType:${String(opt.nodeType)}${dashaPathNote(opt)}`,
  project: (u, raw, opt) => {
    if (u.endpoint === ROXY_VEDIC_DASHA_CURRENT.endpoint) return projectDashaChain(u, raw, opt, true);
    const b = u.body as { date: string; time: string; timezone: number };
    const r = projectRoxyVedicDasha(raw, {
      ayanamsa: opt.ayanamsa as KpAyanamsa,
      mahadasha: (opt.mahadasha as VedicGrahaId | null) ?? null,
      antardasha: (opt.antardasha as VedicGrahaId | null) ?? null,
      pratyantardasha: (opt.pratyantardasha as VedicGrahaId | null) ?? null,
      sookshma: (opt.sookshma as VedicGrahaId | null) ?? null,
      birthLocal: birthLocalOf(b),
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
  label: "KP transit (tek an / zaman aralığı)",
  family: "kp",
  requiresPartner: false,
  // Gökyüzü konumları doğum verisine bağlı değil (Roxy natal ev/transit analizi vermez — KISMİ).
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const r = o(raw);
    const ay = kpAyanamsaOf(r.ayanamsa);
    const nt = kpNodeOf(r.nodeType);
    // TRANSİT-03: zaman aralığı kipi (`range` varsa). Tek-an kipinin seçenek nesnesi ve istek gövdesi BİREBİR eskisi.
    if (r.range !== undefined) {
      const range = parseKpRange(r.range);
      if (!range || !ay || !nt) return null;
      const out: Record<string, unknown> = { ayanamsa: ay, nodeType: nt, range };
      if (r.displayTz !== undefined) {
        if (typeof r.displayTz !== "string" || !isValidIanaTimeZone(r.displayTz)) return null;
        out.displayTz = r.displayTz;
      }
      return out;
    }
    const atUtc = normalizeTransitMoment(r, now);
    return atUtc && ay && nt ? { atUtc, ayanamsa: ay, nodeType: nt } : null;
  },
  units: (ctx, opt) => {
    const place = { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude };
    if (!isKpRange(opt.range)) return [unit("kp.transit", ROXY_KP_PLANETS_AT, kpPlanetsAtBody(String(opt.atUtc), place, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType), { timeDependent: true })];
    // Parça sırası sabit: önce sub-lord (gezegen sırasıyla), sonra rasi, en son konum tablosu.
    const g = opt.range;
    const end = addDays(g.startDate, g.days - 1);
    const out: CalcUnit[] = [];
    let part = 0;
    if (g.kinds.includes("sublord")) for (const p of g.planets) out.push(unit("kp.transit", ROXY_KP_SUBLORD, kpChangesBody(p, g.startDate, end, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType), { timeDependent: true, part: part++ }));
    if (g.kinds.includes("rasi")) for (const p of g.planets) out.push(unit("kp.transit", ROXY_KP_RASI, kpChangesBody(p, g.startDate, end, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType), { timeDependent: true, part: part++ }));
    if (g.kinds.includes("positions")) out.push(unit("kp.transit", ROXY_KP_PLANETS_RANGE, kpPlanetsRangeBody(g.startDate, g.days, g.intervalMinutes!, place, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType), { timeDependent: true, part: part++ }));
    return out;
  },
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|nodeType:${String(opt.nodeType)}`,
  parseNoteContextOptions: (raw) => {
    const ay = kpAyanamsaOf(raw.ayanamsa);
    const nt = kpNodeOf(raw.nodeType);
    return Object.keys(raw).sort().join() === "ayanamsa,nodeType" && ay && nt ? { ayanamsa: ay, nodeType: nt } : null;
  },
  project: (u, raw, opt) => {
    if (!isKpRange(opt.range)) return fromAdapter(projectRoxyKpPlanetsAt(raw, { atUtc: String(opt.atUtc), ayanamsa: opt.ayanamsa as KpAyanamsa, nodeType: opt.nodeType as KpNodeType }), KP_TRANSIT_TECHNICAL_SCHEMA, null, ROXY_KP_PLANETS_AT.projection);
    const b = u.body as Record<string, unknown>;
    const planet = Object.entries(KP_TIMING_PLANET_NAME).find(([, n]) => n === b.planet)?.[0] as KpTimingPlanet | undefined;
    const r =
      u.endpoint === ROXY_KP_SUBLORD.endpoint && planet
        ? projectRoxyKpSublordChanges(raw, { planet, startDate: String(b.startDate), endDate: String(b.endDate) })
        : u.endpoint === ROXY_KP_RASI.endpoint && planet
          ? projectRoxyKpRasiChanges(raw, { planet, startDate: String(b.startDate), endDate: String(b.endDate) })
          : u.endpoint === ROXY_KP_PLANETS_RANGE.endpoint
            ? projectRoxyKpPlanetsRange(raw, { startUtc: String(b.startDatetime), endUtc: String(b.endDatetime), intervalMinutes: Number(b.intervalMinutes), ayanamsa: opt.ayanamsa as KpAyanamsa })
            : { ok: false as const, errors: ["bilinmeyen KP zaman aralığı birimi"] };
    if (!r.ok) return r;
    return { ok: true, technical: { schema: KP_TIMING_PART_SCHEMA, ...r.part }, technicalSchema: KP_TIMING_PART_SCHEMA, interpretation: null, interpretationSchema: null, projectionVersion: ROXY_KP_SUBLORD.projection, unmappedFields: r.unmappedFields, droppedValues: [] };
  },
  // Tek-an kipinde tek parça (eski davranış); zaman aralığında parçalar birleşir, eksik parça AÇIKÇA listelenir.
  combineTechnical: (parts, opt) => (isKpRange(opt.range) ? combineKpTiming(parts, opt.range, opt) : parts[0]),
};

/** TRANSİT-03: KP zaman aralığı seçenekleri. Gezegen/tür kanonik sırada (aynı seçim = aynı anahtar). */
export const KP_TIMING_MAX_DAYS = 92;
export const KP_POSITIONS_MAX_DAYS = 7;
export const KP_POSITIONS_INTERVALS = [60, 180, 360, 720, 1440] as const;
export const KP_TIMING_PART_SCHEMA = "astro.kp.transit_timing.part.v1" as const;
type KpRange = { startDate: string; days: number; planets: KpTimingPlanet[]; kinds: KpTimingKind[]; intervalMinutes?: number };
function parseKpRange(raw: unknown): KpRange | null {
  const r = o(raw);
  const days = Number(r.days);
  if (typeof r.startDate !== "string" || !isValidIsoDate(r.startDate) || !yearOk(Number(r.startDate.slice(0, 4))) || !Number.isInteger(days) || days < 1 || days > KP_TIMING_MAX_DAYS) return null;
  if (!Array.isArray(r.kinds) || !Array.isArray(r.planets)) return null;
  const kinds = KP_TIMING_KINDS.filter((k) => (r.kinds as unknown[]).includes(k));
  // Bilinmeyen veya tekrarlı tür / gezegen → RED (sessiz ayıklama yok).
  if (kinds.length === 0 || kinds.length !== (r.kinds as unknown[]).length) return null;
  const planets = KP_TIMING_PLANETS.filter((p) => (r.planets as unknown[]).includes(p));
  if (planets.length !== (r.planets as unknown[]).length) return null;
  const needsPlanets = kinds.includes("sublord") || kinds.includes("rasi");
  if (needsPlanets && planets.length === 0) return null;
  const out: KpRange = { startDate: r.startDate, days, planets: needsPlanets ? planets : [], kinds };
  if (kinds.includes("positions")) {
    const iv = Number(r.intervalMinutes);
    if (!(KP_POSITIONS_INTERVALS as readonly number[]).includes(iv) || days > KP_POSITIONS_MAX_DAYS) return null;
    out.intervalMinutes = iv;
  } else if (r.intervalMinutes !== undefined) return null;
  return out;
}
const isKpRange = (v: unknown): v is KpRange => parseKpRange(v) !== null;

function combineKpTiming(parts: unknown[], g: KpRange, opt: Record<string, unknown>): KpTimingTechnical {
  const ps = parts.filter((p): p is KpTimingPart & { schema: string } => !!p && (p as { schema?: string }).schema === KP_TIMING_PART_SCHEMA);
  const sub = g.kinds.includes("sublord") ? g.planets.map((p) => ({ planet: p, part: ps.find((x) => x.kind === "sublord" && x.planet === p) })) : [];
  const ras = g.kinds.includes("rasi") ? g.planets.map((p) => ({ planet: p, part: ps.find((x) => x.kind === "rasi" && x.planet === p) })) : [];
  const pos = g.kinds.includes("positions") ? (ps.find((x) => x.kind === "positions") as Extract<KpTimingPart, { kind: "positions" }> | undefined) : undefined;
  const missing = [
    ...sub.filter((x) => !x.part).map((x) => `sublord:${x.planet}`),
    ...ras.filter((x) => !x.part).map((x) => `rasi:${x.planet}`),
    ...(g.kinds.includes("positions") && !pos ? ["positions"] : []),
  ];
  return {
    schema: KP_TIMING_TECHNICAL_SCHEMA,
    frame: { ayanamsa: opt.ayanamsa as KpAyanamsa, ayanamsaDegrees: pos ? pos.ayanamsaDegrees : null },
    nodeType: opt.nodeType as KpNodeType,
    window: { startDate: g.startDate, endDate: addDays(g.startDate, g.days - 1) },
    planets: g.planets,
    kinds: g.kinds,
    sublord: sub.filter((x) => x.part).map((x) => ({ planet: x.planet, changes: (x.part as Extract<KpTimingPart, { kind: "sublord" }>).changes })),
    rasi: ras.filter((x) => x.part).map((x) => ({ planet: x.planet, changes: (x.part as Extract<KpTimingPart, { kind: "rasi" }>).changes })),
    positions: pos ? { intervalMinutes: pos.intervalMinutes, rows: pos.rows } : null,
    missing,
  };
}

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
    const atUtc = normalizeQuestionMoment(r, now);
    const ay = kpAyanamsaOf(r.ayanamsa);
    const nt = kpNodeOf(r.nodeType);
    const place = kpPlaceOf(r.placeLocationId);
    if (!Number.isInteger(n) || n < 1 || n > 249 || !atUtc || !ay || !nt || place === undefined) return null;
    const out: Record<string, unknown> = { horaryNumber: n, atUtc, ayanamsa: ay, nodeType: nt, placeLocationId: place };
    // HORARY-KP-01: soru anının GÖSTERİM saat dilimi (yalnız ekran/rapor; TRANSİT-01 ile aynı desen). İstek gövdesine GİRMEZ →
    // önbellek anahtarı değişmez; verilmediği sürece seçenek nesnesi eskisiyle BİREBİR aynıdır.
    const tz = r.displayTz ?? (r.now === true ? undefined : r.timezone);
    if (tz !== undefined) {
      if (typeof tz !== "string" || !isValidIanaTimeZone(tz)) return null;
      out.displayTz = tz;
    }
    return out;
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

/**
 * 2026-10-22 — KP Ruling Planets ZAMAN ARALIĞI TARAMASI (`kp.ruling_interval`). kp.ruling'in seçeneği DEĞİL, ayrı teknik: yöntem farklı
 * (significator'lar her anın gözlem yeri haritasından; kp.ruling = tek an + natal), doğum verisi/saati gerekmez, ayrı birim/önbellek/
 * projeksiyon/not bağlamı. Gözlem yeri ve ofset SUNUCUDA çözülür (service.ts; kutup dairesi ötesi ve pencere içi ofset değişimi → istek yok).
 */
const kpRulingInterval: TechniqueDefinition = {
  id: "kp.ruling_interval",
  label: "KP ruling planets zaman taraması",
  family: "kp",
  requiresPartner: false,
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const r = o(raw);
    const v = parseKpRulingIntervalOptions(r, { atUtc: normalizeTransitMoment(r, now), ayanamsa: kpAyanamsaOf(r.ayanamsa), nodeType: kpNodeOf(r.nodeType), place: kpPlaceOf(r.placeLocationId) });
    return v ? { ...v } : null;
  },
  units: (ctx, opt) => {
    if (typeof opt.offsetHours !== "number") return [];
    const place = ctx.places?.target ?? { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude };
    return [unit("kp.ruling_interval", ROXY_KP_RULING_INTERVAL, kpRulingIntervalBody(String(opt.atUtc), Number(opt.durationMinutes), Number(opt.intervalMinutes), place, opt.offsetHours, opt.ayanamsa as KpAyanamsa, opt.nodeType as KpNodeType), { timeDependent: true })];
  },
  noUnitsReason: () => "Gözlem yerinin saat dilimi çözülemedi.",
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|nodeType:${String(opt.nodeType)}`,
  parseNoteContextOptions: (raw) => {
    const ay = kpAyanamsaOf(raw.ayanamsa);
    const nt = kpNodeOf(raw.nodeType);
    return Object.keys(raw).sort().join() === "ayanamsa,nodeType" && ay && nt ? { ayanamsa: ay, nodeType: nt } : null;
  },
  project: (u, raw, opt) => {
    const b = u.body as { startDatetime: string; endDatetime: string; intervalMinutes: number; latitude: number; longitude: number; timezone: number };
    const label = (opt.place as { label?: unknown } | undefined)?.label;
    return fromAdapter(
      projectRoxyKpRulingInterval(raw, {
        startLocal: b.startDatetime,
        endLocal: b.endDatetime,
        intervalMinutes: b.intervalMinutes,
        utcOffsetHours: b.timezone,
        place: { latitude: b.latitude, longitude: b.longitude, label: typeof label === "string" ? label.slice(0, 120) : null },
        ayanamsa: opt.ayanamsa as KpAyanamsa,
        nodeType: opt.nodeType as KpNodeType,
        startUtc: String(opt.atUtc),
        durationMinutes: Number(opt.durationMinutes),
      }),
      KP_RULING_INTERVAL_TECHNICAL_SCHEMA,
      KP_EXTRA_INTERP_SCHEMA,
      ROXY_KP_RULING_INTERVAL.projection,
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

// ─── 22.10.2026 Vedik harita (dört ayrı teknik; mevcut Vedik tekniklerin gövde/anahtar/sürümleri DEĞİŞMEDİ) ───────────
const vedicBhavChalit = vedicBirthTechnique("vedic.bhav_chalit", "Bhav Chalit", ROXY_VEDIC_BHAV_CHALIT, (raw, ay) => projectRoxyVedicBhavChalit(raw, { ayanamsa: ay }), {
  technical: VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA,
  interp: VEDIC_BHAV_CHALIT_INTERP_SCHEMA,
});
const vedicArudha = vedicBirthTechnique("vedic.arudha", "Arudha Padalar", ROXY_VEDIC_ARUDHA, (raw, ay) => projectRoxyVedicArudha(raw, { ayanamsa: ay }), {
  technical: VEDIC_ARUDHA_TECHNICAL_SCHEMA,
  interp: VEDIC_ARUDHA_INTERP_SCHEMA,
});
const vedicBhavaBala = vedicBirthTechnique("vedic.bhava_bala", "Bhava Bala", ROXY_VEDIC_BHAVA_BALA, (raw, ay) => projectRoxyVedicBhavaBala(raw, { ayanamsa: ay }), {
  technical: VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA,
  interp: VEDIC_BHAVA_BALA_INTERP_SCHEMA,
});
/** Chara Karaka: ayanamsa + karaka şeması (8'li Rahu dahil varsayılan / 7'li). Şema gövdenin ve not bağlamının parçasıdır. */
const charaSchemeOf = (v: unknown): CharaKarakaScheme | null => {
  const x = v ?? "eight";
  return (CHARA_KARAKA_SCHEMES as readonly unknown[]).includes(x) ? (x as CharaKarakaScheme) : null;
};
const vedicCharaKaraka: TechniqueDefinition = {
  id: "vedic.chara_karaka",
  label: "Chara Karakalar",
  family: "vedic",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const r = o(raw);
    const ay = ayanamsaOf(r.ayanamsa);
    const scheme = charaSchemeOf(r.scheme);
    return ay && scheme ? { ayanamsa: ay, scheme } : null;
  },
  units: (ctx, opt) => [unit("vedic.chara_karaka", ROXY_VEDIC_CHARA_KARAKA, charaKarakaBody(ctx.birth, opt.ayanamsa as VedicAyanamsa, opt.scheme as CharaKarakaScheme))],
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}|scheme:${String(opt.scheme)}`,
  project: (_u, raw, opt) =>
    fromAdapter(
      projectRoxyVedicCharaKaraka(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa, scheme: opt.scheme as CharaKarakaScheme }),
      VEDIC_CHARA_KARAKA_TECHNICAL_SCHEMA,
      VEDIC_CHARA_KARAKA_INTERP_SCHEMA,
      ROXY_VEDIC_CHARA_KARAKA.projection,
    ),
};

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
  "western.fixed_stars": westernFixedStars,
  "western.profections": westernProfections,
  "western.extra_points": westernExtraPoints,
  "western.planetary_return": westernPlanetaryReturn,
  "vedic.d1": vedicD1,
  "vedic.varga": vedicVarga,
  "vedic.dasha": vedicDasha,
  "vedic.drishti": vedicDrishti,
  "vedic.ashtakavarga": vedicAshtakavarga,
  "vedic.shadbala": vedicShadbala,
  "vedic.panchanga": vedicPanchanga,
  "vedic.transit": vedicTransit,
  "vedic.bhav_chalit": vedicBhavChalit,
  "vedic.chara_karaka": vedicCharaKaraka,
  "vedic.arudha": vedicArudha,
  "vedic.bhava_bala": vedicBhavaBala,
  "kp.chart": kpChart,
  "kp.dasha": kpDasha,
  "kp.ruling": kpRuling,
  "kp.transit": kpTransit,
  "kp.horary": kpHorary,
  "kp.ruling_interval": kpRulingInterval,
  "vedic.gun_milan": vedicGunMilan,
  "vedic.sade_sati": vedicSadeSati,
  "western.declination_parallels": westernDeclinationParallels,
});

export function getTechnique(id: unknown): TechniqueDefinition | null {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TECHNIQUES, id) ? TECHNIQUES[id as TechniqueId] : null;
}

export const NODE_TYPE_VALUES = NODE_TYPES;
