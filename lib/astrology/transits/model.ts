// Gökyüzü Atlası — İleri Transit: girdi/çıktı modeli + doğrulama + konum kaynağı (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Konum kaynağı (03.11.2026 DE440 AŞAMA 2): varsayılan NASA/JPL DE440 (lib/astrology/positions/de440 — Profesyonel Efemeris ile
// AYNI görünür konum: ışık zamanı, bükülme, göreli sapma; IAU 2006 + 2000A_R06; gerçek ekliptik ve ekinoks). Bayrak
// ATLAS_TRANSIT_ENGINE=legacy (lib/astrology/positions/flags.ts) → eski kaynak astronomy-engine 2.1.19 (MIT; geosantrik görünür boylam,
// gerçek ekliptik ve ekinoks — Lilly olay çizelgesiyle AYNI tanım); eski motorun çıktısı ve sınırları DEĞİŞMEDİ. Tarama ve kök bulma
// algoritmaları (scan.ts, segments.ts) iki motorda aynıdır. AŞAMA 2 (ortak zaman standardı, PR #647): zaman artık Lilly'nin `MakeTime(Date)` yolundan (UTC + Espenak–Meeus ΔT; 2026'da
// +5,9 s, 2050'de +21,5 s, 2100'de +107 s sistematik kayma) DEĞİL, ortak katmandan (`scalesFromUtc` + `ephemerisTime`) kurulur.
// Lilly dosyaları DEĞİŞMEZ; yalnız `Body` tipi oradan alınır. Sağlayıcı (Roxy) çağrısı YOKTUR: tarama tamamen yereldir.
//
// Doğruluk sınıfı (kanıt: docs/astrology/pro/ileri-transit.md ve harness'ler): DE440'a karşı boylam hatası üst sınırı
// gövde başına ölçülü sınır (positionErrorArcsec) kabul edilir; her olayın zaman belirsizliği bu sınırdan türetilir ve olayla döner.

import * as Astronomy from "astronomy-engine";
import type { Body } from "../horary/western/timeline";
import { apparentPosition } from "../positions/de440/apparent";
import { de440 } from "../positions/de440/source";
import { transitPositionEngine, type PositionEngine } from "../positions/flags";
import { ephemerisTime, isTimeScalesError, scalesFromUtc, TIME_ERA_BOUNDARIES, type DeltaTClass, type TimeAssumption, type TimeScales } from "../time";

const AE: Readonly<Record<Body, Astronomy.Body>> = {
  sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn, uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune, pluto: Astronomy.Body.Pluto,
};
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Taranan an (UTC ms) → ortak katman ölçekleri. 1961 öncesi an UT kabul edilir (sonuçta `timeScale.assumptions` ile işaretli). */
function scalesAt(ms: number): TimeScales {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(s)) throw new RangeError(`transit: ${s.error}`);
  return s;
}
const LON_CACHE = new Map<string, number>();
const LON_CACHE_MAX = 400_000;
export { transitPositionEngine, type PositionEngine };
/** Geosantrik görünür ekliptik boylam (derece, gerçek ekinoks) — TT ortak katmandan. `eng` verilmezse bayraktan (DE440 varsayılan).
 *  DE440 dosyası yoksa De440UnavailableError fırlatır (eski motora SESSİZ düşüş YOK). Önbellek anahtarı motoru içerir. */
export function lonAt(b: Body, ms: number, eng: PositionEngine = transitPositionEngine()): number {
  const k = `${eng}|${b}|${ms}`;
  const hit = LON_CACHE.get(k);
  if (hit !== undefined) return hit;
  const t = ephemerisTime(scalesAt(ms));
  const v = eng === "de440" ? apparentPosition(de440(), b, 2451545.0 + t.tt).lon : Astronomy.Ecliptic(Astronomy.GeoVector(AE[b], t, true)).elon;
  if (LON_CACHE.size >= LON_CACHE_MAX) LON_CACHE.clear();
  LON_CACHE.set(k, v);
  return v;
}
/** Hız (°/gün, TT): ±1 sa merkezi fark; payda GERÇEK geçen TT (artık saniye anında UTC ekseni 1 s eksik sayar). */
export function speedAt(b: Body, ms: number, eng: PositionEngine = transitPositionEngine()): number {
  const d = ((((lonAt(b, ms + HOUR_MS, eng) - lonAt(b, ms - HOUR_MS, eng) + 180) % 360) + 360) % 360) - 180;
  return (d / (scalesAt(ms + HOUR_MS).ttMs - scalesAt(ms - HOUR_MS).ttMs)) * DAY_MS;
}
/** Tarama aralığının zaman ölçeği özeti: uçlar + aralıktaki dönem sınırları; varsayımlar ve ΔT sınıfları birleşimi. */
export function timeScaleSummary(t0: number, t1: number): { policy: "lib/astrology/time"; assumptions: TimeAssumption[]; deltaTClasses: DeltaTClass[] } {
  const probes = [t0, t1, ...Object.values(TIME_ERA_BOUNDARIES).filter((x) => x > t0 && x < t1)];
  const a = new Set<TimeAssumption>();
  const c = new Set<DeltaTClass>();
  for (const ms of probes) {
    const s = scalesAt(ms);
    s.assumptions.forEach((x) => a.add(x));
    c.add(s.deltaTClass);
  }
  return { policy: "lib/astrology/time", assumptions: [...a].sort(), deltaTClasses: [...c].sort() };
}
export type TransitBody = Body;
export const TRANSIT_BODIES: readonly TransitBody[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

/**
 * GÖVDE BAŞINA konum hatası üst sınırı (yay saniyesi). AŞAMA 2 YENİDEN ÖLÇÜM (kanit/zaman/konum-hata-once-sonra.json): WT-04 ile AYNI
 * 3.000 rastgele an (1900–2100), referans JPL DE440 (skyfield; görünür, gerçek ekliptik) DÜZELTİLMİŞ zamanla (de440_ref_v2: eski araç
 * `ts.utc(1970,…,saniye)` artık saniyeleri saydığı için 1972 sonrası anları 22–27 s erken kuruyordu → Ay'da ≈15″ sahte hata).
 * Kural (değişmedi): sınır ≈ ölçülen en büyük farkın 1,5 katı. Ölçülen en büyük (ortak zaman katmanıyla):
 *   Güneş 2,10 · Ay 5,72 (1900–1950) / 2,94 (1950–2050) / 3,25 (2050–2101) · Merkür 11,54 · Venüs 20,32 · Mars 12,87 · Jüpiter 10,10 ·
 *   Satürn 12,84 · Uranüs 12,09 · Neptün 18,89 · Plüton 8,52.
 * Yalnız ölçümün desteklediği iki gövdede sınır küçüldü: Güneş 12 → 4, Ay 47/150 → 9 (tüm tarama aralığı 1900–2100). Diğer gövdelerde
 * yeni ölçüm eskisiyle aynı (fark modelden; zaman ölçeğinden değil) → sınırlar DEĞİŞMEDİ. Tarama aralığı dışı (ölçüm yok): Ay 150 korunur.
 * NOT: Lilly olay çizelgesinin genel 20″ varsayımı (timeline.ts) Venüs için bu ölçümde de aşılıyor (20,32″) — o dosya kapsam dışı.
 */
const POS_ERR: Readonly<Record<Body, number>> = { sun: 4, moon: 9, mercury: 25, venus: 32, mars: 20, jupiter: 16, saturn: 20, uranus: 19, neptune: 29, pluto: 13 };
const MOON_ERR_OUTSIDE_MEASURED = 150;
/** DE440 motoru: verilen TT anında konum hatası üst sınırı (″) — Profesyonel Efemeris DE440_LIMITS ile aynı ölçü (1800–2100 bandı;
 *  Swiss Ephemeris SWIEPH / JPL Horizons / skyfield bağımsız sağlaması, docs/astrology/pro/de440-konum-motoru.md §4; tarama aralığı
 *  1900–2099). ΔT belirsizliği bu sınıra DAHİL DEĞİL (olay anına ayrı terim olarak eklenir; scan.ts). */
const POS_ERR_DE440: Readonly<Record<Body, number>> = { sun: 0.1, moon: 0.1, mercury: 0.1, venus: 0.1, mars: 0.1, jupiter: 0.1, saturn: 0.1, uranus: 0.1, neptune: 0.1, pluto: 0.1 };
export function positionErrorArcsec(b: Body, ms: number, eng: PositionEngine = transitPositionEngine()): number {
  if (eng === "de440") return POS_ERR_DE440[b];
  if (b === "moon") {
    const y = new Date(ms).getUTCFullYear();
    if (y < 1900 || y > 2100) return MOON_ERR_OUTSIDE_MEASURED;
  }
  return POS_ERR[b];
}
/** Hız hatası üst sınırı (″/gün; °/gün TT), Güneş'e 3°'den yakın örnekler hariç (DE440 tarafındaki ışık sapması tanım farkı) ölçülenin
 *  ~1,5 katı. AŞAMA 2 ölçümü: Ay 2,40 (önce 3,69) → sınır 7,5 → 3,6; diğerleri yeni ölçümde aynı → değişmedi. */
/** DE440 hız hatası üst sınırı (″/gün): Profesyonel Efemeris DE440_LIMITS hız sınırı (Ay 0,5; diğerleri 0,1). */
export const SPEED_ERR_DE440_ARCSEC_PER_DAY: Readonly<Record<Body, number>> = { sun: 0.1, moon: 0.5, mercury: 0.1, venus: 0.1, mars: 0.1, jupiter: 0.1, saturn: 0.1, uranus: 0.1, neptune: 0.1, pluto: 0.1 };
export const speedErrArcsecPerDay = (b: Body, eng: PositionEngine = transitPositionEngine()) => (eng === "de440" ? SPEED_ERR_DE440_ARCSEC_PER_DAY[b] : SPEED_ERR_ARCSEC_PER_DAY[b]);
export const SPEED_ERR_ARCSEC_PER_DAY: Readonly<Record<Body, number>> = { sun: 0.35, moon: 3.6, mercury: 3.5, venus: 1.9, mars: 0.6, jupiter: 0.2, saturn: 0.2, uranus: 0.2, neptune: 0.15, pluto: 0.12 };

/**
 * |λ″| üst sınırı (derece/gün²). 1800–2200 aralığında astronomy-engine ile ölçülen en büyük değerin ~2 katı
 * (ölçüm: kanit/wt04/araclar/ivme.ts — Ay 0,5149; Merkür 0,1986; Venüs 0,0424; Mars 0,0152; Jüpiter 0,0035; Satürn 0,0019;
 * Uranüs 0,00096; Neptün 0,00060; Plüton 0,00062; Güneş 0,00066). Harness bu sınırların yoğun örneklemle aşılmadığını sınar.
 */
export const ACCEL_BOUND: Readonly<Record<TransitBody, number>> = {
  sun: 0.002, moon: 1.1, mercury: 0.4, venus: 0.09, mars: 0.035, jupiter: 0.008, saturn: 0.005, uranus: 0.002, neptune: 0.0015, pluto: 0.0015,
};

/**
 * DE440 motoru |λ″| üst sınırı (derece/gün²) — YALNIZ Güneş'e < NEAR_SUN_DEG + 1° parçalarda kullanılır (scan.ts `turnsPiecewise`).
 * DE440 görünür konumu Güneş/Jüpiter/Satürn ışık bükülmesini içerir; gezegen Güneş DİSKİNİN arkasından geçerken bükülme ışının içinde
 * kalan kütleyle (n = 3 politrop; positions/de440/apparent.ts) hesaplanır ve kısa süreli eğrilik eski sınırları aşar. 04.11.2026 ölçümü
 * (1900–2100, Güneş'e < 0,35° anlar 0,001 gün adım): Merkür 0,785 · Venüs 0,026 · Mars 0,029 · Jüpiter 0,271 · Satürn 0,274 ·
 * Uranüs 0,892 · Neptün 0,379 · Plüton 0,203 (Güneş ve Ay kavuşum dışı: eski sınır). Kural: ~2 katı; eski sınırdan küçük olamaz.
 */
/** Güneş'ten ≥ 3° uzakta DE440 ivmesi eski sınırların içindedir (ölçü, 1900–2100, ¼ gün adım: en büyük oran 0,50 — Merkür) →
 *  tarama Güneş yakını parçalarda ACCEL_BOUND_DE440, diğer parçalarda ACCEL_BOUND kullanır (scan.ts `turnsPiecewise`). */
export const NEAR_SUN_DEG = 3;
/** Güneş DİSKİ katmanı: gerçek uzama < 0,6° (disk yarıçapı ≈ 0,27° + pay) → ACCEL_BOUND_DE440. 0,6–3° (limb katmanı): disk dışı nokta-kütle
 *  bükülmesinin |λ″| katkısı ≤ 2·δ·θ′²/θ² (δ ≤ 1,75″·ρ☉/θ) ≈ 0,011 °/gün² (θ′ ≤ 3°/gün) → eski sınır + ACCEL_LIMB_EXTRA. */
export const DISK_ZONE_DEG = 0.6;
export const ACCEL_LIMB_EXTRA = 0.02;
export const ACCEL_BOUND_DE440: Readonly<Record<TransitBody, number>> = {
  sun: 0.002, moon: 1.1, mercury: 1.6, venus: 0.09, mars: 0.06, jupiter: 0.6, saturn: 0.6, uranus: 1.8, neptune: 0.8, pluto: 0.5,
};
export const accelBoundOf = (b: TransitBody, eng: PositionEngine = transitPositionEngine()) => (eng === "de440" ? ACCEL_BOUND_DE440[b] : ACCEL_BOUND[b]);

/** Ölçülen hız aralığı (°/gün, 1800–2200, kanit/wt04/araclar/ivme.ts) ±%10 pay. Göreli hareketin hiç yön değiştiremeyeceği
 *  çiftleri (ör. Ay–herhangi, Güneş–Mars) belirlemek için: aralıklar örtüşmüyorsa göreli hız sıfır olamaz. */
export const SPEED_RANGE: Readonly<Record<Body, [number, number]>> = {
  sun: [0.94, 1.03], moon: [11.6, 15.6], mercury: [-1.53, 2.42], venus: [-0.7, 1.39], mars: [-0.45, 0.88],
  jupiter: [-0.15, 0.27], saturn: [-0.092, 0.144], uranus: [-0.049, 0.07], neptune: [-0.032, 0.042], pluto: [-0.032, 0.045],
};
export function relativeMotionCanReverse(a: Body, b: Body | null): boolean {
  const [a0, a1] = SPEED_RANGE[a];
  const [b0, b1] = b ? SPEED_RANGE[b] : [0, 0];
  return a0 - b1 < 0 && a1 - b0 > 0;
}

export const ASPECTS = {
  conjunction: 0,
  semi_sextile: 30,
  semi_square: 45,
  sextile: 60,
  square: 90,
  trine: 120,
  sesquiquadrate: 135,
  quincunx: 150,
  opposition: 180,
} as const;
export type AspectId = keyof typeof ASPECTS;
export const MAJOR_ASPECTS: readonly AspectId[] = ["conjunction", "sextile", "square", "trine", "opposition"];

/**
 * VARSAYILAN ORB — OWNER/EĞİTMEN KARARI BEKLİYOR. Profesyonel transit uygulamasında yaygın dar orb: 1° (tüm açılar).
 * Değer sabit bir "doğru" iddiası taşımaz; her istekte açıkça gönderilebilir ve yanıtta kullanılan orb geri döner.
 */
export const DEFAULT_ORB_DEG = 1;
export const MAX_ORB_DEG = 15;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
/** Ay dahil edildiğinde tarama süresi üst sınırı (gün) ve genel üst sınır. Performans testi: harness T-PERF. */
export const MAX_RANGE_DAYS_WITH_MOON = 400;
export const MAX_RANGE_DAYS = 366 * 30;
export const MAX_NATAL_POINTS = 24;

export type NatalPointInput = { id: string; lon: number };

export type ScanRequest = {
  startUtcMs: number;
  endUtcMs: number;
  /** Transit gövdeleri (transit→natal ve istasyon/burç girişi için). */
  bodies: readonly TransitBody[];
  /** Natal noktalar (boylam, derece). Boş → transit→natal taraması yapılmaz. */
  natalPoints?: readonly NatalPointInput[];
  aspects: readonly AspectId[];
  /** Açı başına orb (derece); verilmeyen açı `defaultOrb` kullanır. */
  orbs?: Partial<Record<AspectId, number>>;
  defaultOrb?: number;
  include: { natal: boolean; mundane: boolean; stations: boolean; ingresses: boolean };
  /** Transit–transit için gövdeler (verilmezse `bodies`). */
  mundaneBodies?: readonly TransitBody[];
};

export type ValidationError = { code: "invalid_range" | "range_too_long" | "out_of_years" | "invalid_body" | "invalid_aspect" | "invalid_orb" | "invalid_natal" | "nothing_selected"; detail: string };

export function validateScanRequest(r: ScanRequest): ValidationError | null {
  if (!Number.isFinite(r.startUtcMs) || !Number.isFinite(r.endUtcMs) || r.endUtcMs <= r.startUtcMs) return { code: "invalid_range", detail: "başlangıç < bitiş olmalı" };
  const y0 = new Date(r.startUtcMs).getUTCFullYear();
  const y1 = new Date(r.endUtcMs).getUTCFullYear();
  if (y0 < MIN_YEAR || y1 > MAX_YEAR) return { code: "out_of_years", detail: `desteklenen yıllar ${MIN_YEAR}–${MAX_YEAR}` };
  const days = (r.endUtcMs - r.startUtcMs) / 86_400_000;
  const all = [...r.bodies, ...(r.mundaneBodies ?? [])];
  if (all.some((b) => !TRANSIT_BODIES.includes(b))) return { code: "invalid_body", detail: "bilinmeyen gövde" };
  if (days > MAX_RANGE_DAYS) return { code: "range_too_long", detail: `en fazla ${MAX_RANGE_DAYS} gün` };
  if (all.includes("moon") && days > MAX_RANGE_DAYS_WITH_MOON) return { code: "range_too_long", detail: `Ay dahilken en fazla ${MAX_RANGE_DAYS_WITH_MOON} gün` };
  if (r.aspects.some((a) => !(a in ASPECTS))) return { code: "invalid_aspect", detail: "bilinmeyen açı" };
  const orbs = [r.defaultOrb ?? DEFAULT_ORB_DEG, ...Object.values(r.orbs ?? {})];
  if (orbs.some((o) => typeof o !== "number" || !Number.isFinite(o) || o <= 0 || o > MAX_ORB_DEG)) return { code: "invalid_orb", detail: `orb 0 < orb ≤ ${MAX_ORB_DEG}` };
  const np = r.natalPoints ?? [];
  if (np.length > MAX_NATAL_POINTS || np.some((p) => !p || typeof p.id !== "string" || !/^[a-z0-9_-]{1,32}$/i.test(p.id) || !Number.isFinite(p.lon))) return { code: "invalid_natal", detail: "natal nokta biçimi" };
  if (new Set(np.map((p) => p.id)).size !== np.length) return { code: "invalid_natal", detail: "natal nokta kimliği tekrar ediyor" };
  const { natal, mundane, stations, ingresses } = r.include;
  if (!(natal && np.length && r.aspects.length) && !(mundane && r.aspects.length) && !stations && !ingresses) return { code: "nothing_selected", detail: "en az bir olay türü" };
  return null;
}

// ─── Çıktı ──────────────────────────────────────────────────────────────────────────────────────────────────
export type ContactKind = "transit_natal" | "transit_transit";
export type Pass = {
  ms: number;
  atUtc: string;
  /** PENCERE içi geçiş sırası (1'den) ve penceredeki toplam geçiş (orb kesintisiz içindeyken). */
  pass: number;
  of: number;
  /**
   * GERİ HAREKET DÖNGÜSÜ (aile) numarası — orb'dan BAĞIMSIZ: ardışık iki kesinleşme arasında göreli hareketin TAM BİR KEZ yön
   * değiştirdiği (bir istasyon) geçişler aynı ailedir (ör. ileri–geri–ileri = 1/3, 2/3, 3/3). Hiç ya da ≥2 dönüş → yeni aile.
   * Aralık sınırı aileyi kesebilir: `cycleClippedByRange` true ise aralık dışında aynı aileye ait geçiş olabilir.
   */
  cycleId: string;
  cyclePass: number;
  cycleOf: number;
  cycleClippedByRange: boolean;
  /** Transit gövdenin (a) geri hareketi; transit–transit için b'nin de. */
  aRetrograde: boolean;
  bRetrograde: boolean | null;
  uncertaintySec: number;
};
export type ContactWindow = {
  id: string;
  kind: ContactKind;
  a: TransitBody;
  /** Transit–transit: gövde; transit→natal: natal nokta kimliği. */
  b: string;
  aspect: AspectId;
  /** Hedef ayrım d = λa − λb (mod 360). 90 ve 270 ayrı ailelerdir (sağ/sol kare). */
  target: number;
  orb: number;
  /** Orb'a giriş; null = aralık başında zaten orb içindeydi (startsBeforeRange). */
  enterMs: number | null;
  enterUtc: string | null;
  enterUncertaintySec: number | null;
  exitMs: number | null;
  exitUtc: string | null;
  exitUncertaintySec: number | null;
  startsBeforeRange: boolean;
  endsAfterRange: boolean;
  passes: Pass[];
  /** single = 1 kesinleşme; multiple = ≥2 (geri hareket döngüsü); tangential = orb'a girip kesinleşmeden çıkış. */
  classification: "single" | "multiple" | "tangential" | "none_in_range";
  /** Penceredeki en yakın yaklaşma (tangential için anlamlı). */
  closest: { ms: number; atUtc: string; separationDeg: number };
  /**
   * Pencere içinde KESİNLEŞMEDEN geri dönülen yerel en yakın yaklaşmalar (göreli hareketin döndüğü an, |d − hedef| yerel
   * minimum ve > 0). Teğetsel pencerede `closest` budur; çoklu pencerede de olabilir (ör. geniş orb). Olay türü "closest_approach".
   */
  nearApproaches: { ms: number; atUtc: string; separationDeg: number; uncertain: boolean }[];
  flags: {
    /** En yakın yaklaşma kesin açıya efemeris hatasından daha yakın ama kesinleşme yok (ya da tersi) → geçiş sayısı belirsiz. */
    passCountUncertain: boolean;
    /** Pencere orb sınırına efemeris hatası kadar yakın bir uç değerle bölünüyor/oluşuyor → giriş/çıkış sayısı belirsiz. */
    windowUncertain: boolean;
  };
};
export type EventType = "orb_enter" | "exact" | "orb_exit" | "closest_approach" | "station" | "ingress";
export type TransitEvent = {
  type: EventType;
  ms: number;
  atUtc: string;
  uncertaintySec: number;
  windowId?: string;
  body: TransitBody;
  /** Açılar için karşı taraf; burç girişi için hedef burç; istasyon için null. */
  other: string | null;
  aspect?: AspectId;
  /** exact: geri hareket döngüsü (aile) içindeki sıra / toplam (Pass.cyclePass / cycleOf). */
  pass?: number;
  of?: number;
  cycleId?: string;
  station?: "retrograde" | "direct";
  fromSign?: string;
  toSign?: string;
  retrograde?: boolean;
  lon?: number;
  /** closest_approach: en yakın yaklaşmadaki açı hatası (derece). */
  separationDeg?: number;
};
export type ScanResult = {
  schema: "astro.pro.transit-scan.v1";
  /** Konum kaynağı: eski kayıtlarda "astronomy-engine@2.1.19"; DE440 motorunda "jpl-de440" (+ engineVersion, deltaTUncertaintySecMax). */
  source: { ephemeris: TransitEphemerisId; positionErrorArcsec: Partial<Record<TransitBody, number>>; providerCalls: 0; engineVersion?: string; deltaTUncertaintySecMax?: number };
  /** AŞAMA 2: kullanılan zaman politikası ve aralıktaki varsayımlar (ör. dut1_assumed_zero, future_delta_t_predicted). */
  timeScale: ReturnType<typeof timeScaleSummary>;
  range: { startUtc: string; endUtc: string };
  orbsUsed: Partial<Record<AspectId, number>>;
  windows: ContactWindow[];
  events: TransitEvent[];
  /** Hiçbir pencereye ait olmayan, orb sınırına efemeris hatasından yakın uç değerler: burada fazladan bir pencere OLABİLİR. */
  nearMisses: { pair: string; aspect: AspectId; target: number; ms: number; atUtc: string; separationDeg: number }[];
  stats: { evaluations: number; ms: number };
};

export const iso = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

/** Transit konum kaynağı kimliği (kayıtlı snapshot `scan.source.ephemeris`). */
export type TransitEphemerisId = "astronomy-engine@2.1.19" | "jpl-de440";
export const TRANSIT_ENGINE_VERSION_DE440 = "transit-scan-2-de440" as const;
