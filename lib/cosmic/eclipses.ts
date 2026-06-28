/**
 * lib/cosmic/eclipses.ts
 * FAZ 3A — Production TUTULMA (Eclipse) motoru.
 *
 * Güneş (global + Türkiye şehir-yerel) ve Ay tutulmaları, 2026–2050.
 * UI'da HENÜZ KULLANILMAZ (FAZ 3A Adım 3'te bağlanacak). FAZ 2C aspect motorlarına
 * (aspects.ts / exactAspects.ts / aspectMotion.ts) DOKUNMAZ.
 *
 * ── Bağımsız doğrulama ────────────────────────────────────────────────────────
 *   scripts/cosmic-validation/eclipses/ (Swiss Ephemeris/pyswisseph) ile 2026–2050:
 *   56/56 global güneş + 57/57 ay; peak ≤22 sn; şehir görünürlüğü (alt>0) ≤24 sn.
 *
 * ── DOĞRULUK SÖZLEŞMESİ (bozma) ──────────────────────────────────────────────
 *   • obscuration = Güneş/Ay diskinin ÖRTÜLEN ALAN oranı (AE). Bu "magnitude" DEĞİLDİR.
 *     magnitude (çap oranı) AE'de YOK → yalnız katalogdan gelirse `magnitude` dolar; aksi null.
 *   • Hybrid: AE hibrit sınıflandırmaz → yalnız doğrulanmış KATALOG eşleşmesiyle gösterilir.
 *   • Saros: AE/SWE-çıktısı vermez → yalnız katalogdan; şu an katalog boş → null.
 *   • Görünürlük: peak anında ufuk yüksekliği (altitude) > 0 ise görünür. Her ŞEHİR ayrı;
 *     "Türkiye genelinde görülür" gibi GENELLEME YAPILMAZ.
 *
 * Deterministik: sabit pencere (2026–2050), çekirdek listeler new Date() KULLANMAZ → SSR↔client tutarlı.
 */

import * as AE from "astronomy-engine";

// ─── Tipler ─────────────────────────────────────────────────────────────────────

export type EclipseGroup = "solar" | "lunar";
export type EclipseType = "total" | "partial" | "annular" | "penumbral" | "hybrid";
export type EclipseValidation = "engine-verified" | "catalog-verified";
export type EclipseConfidence = "high" | "medium";

export type SolarCityVisibility = {
  city: string; lat: number; lon: number;
  visible: boolean;
  visibilityStatus: string;            // "Ankara'dan görülür" / "ufuk yakını" / "görünmez"
  localType: EclipseType | null;       // o şehirden DENEYIMLENEN tür (genelde partial)
  partialBeginTR: string | null;
  peakTR: string | null;
  partialEndTR: string | null;
  totalBeginTR: string | null;
  totalEndTR: string | null;
  altitudeAtPeak: number | null;       // derece; <0 ise görünmez
  obscuration: number | null;          // örtülme oranı (ALAN) — magnitude DEĞİL
};

export type SolarEclipse = {
  id: string;
  kind: "solar";
  eclipseType: EclipseType;
  peakUTC: string;                     // ISO Z
  peakTR: string;                      // ISO +03:00
  dateTR: string;                      // "14 Kasım 2031"
  obscuration: number | null;          // örtülme oranı (ALAN). magnitude DEĞİL. (partial'da null)
  centerLat: number | null;
  centerLon: number | null;
  distanceKm: number | null;
  saros: number | null;                // yalnız katalog (şu an null)
  magnitude: number | null;            // yalnız katalog (şu an null)
  source: string;
  validationStatus: EclipseValidation;
  confidence: EclipseConfidence;
  notes: string[];
};

export type LunarCityVisibility = {
  city: string; lat: number; lon: number;
  moonAltitudeAtPeak: number;          // derece
  visible: boolean;
  visibilityStatus: string;
};

export type LunarEclipse = {
  id: string;
  kind: "lunar";
  eclipseType: EclipseType;            // total | partial | penumbral
  peakUTC: string;
  peakTR: string;
  dateTR: string;
  obscuration: number | null;          // umbral örtülme oranı (AE). magnitude DEĞİL.
  penumbralBeginTR: string | null;
  partialBeginTR: string | null;
  totalBeginTR: string | null;
  totalEndTR: string | null;
  partialEndTR: string | null;
  penumbralEndTR: string | null;
  durPenumMin: number | null;
  durPartialMin: number | null;
  durTotalMin: number | null;
  saros: number | null;                // yalnız katalog (şu an null)
  magnitude: number | null;            // yalnız katalog (şu an null)
  source: string;
  validationStatus: EclipseValidation;
  confidence: EclipseConfidence;
  notes: string[];
};

export type AnyEclipse = SolarEclipse | LunarEclipse;

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const FROM_YEAR = 2026;
const TO_YEAR = 2050;
const DAY_MS = 86_400_000;
const TR_OFFSET_MS = 3 * 3_600_000;    // UTC+3 sabit (2016'dan beri DST yok; retro.ts ile aynı)

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

/** Başlangıç Türkiye şehir seti (her biri AYRI değerlendirilir). */
export const TR_CITIES: ReadonlyArray<{ name: string; lat: number; lon: number; elev: number }> = [
  { name: "Ankara",     lat: 39.9334, lon: 32.8597, elev: 938 },
  { name: "İstanbul",   lat: 41.0082, lon: 28.9784, elev: 40 },
  { name: "İzmir",      lat: 38.4237, lon: 27.1428, elev: 25 },
  { name: "Erzurum",    lat: 39.9043, lon: 41.2679, elev: 1890 },
  { name: "Antalya",    lat: 36.8969, lon: 30.7133, elev: 30 },
  { name: "Diyarbakır", lat: 37.9144, lon: 40.2306, elev: 675 },
  { name: "Trabzon",    lat: 41.0027, lon: 39.7168, elev: 39 },
  { name: "Van",        lat: 38.4942, lon: 43.3800, elev: 1727 },
];

const ENGINE_SOURCE = "astronomy-engine (harness-doğrulanmış: scripts/cosmic-validation/eclipses, peak ≤22sn)";
const CATALOG_SOURCE = "Swiss Ephemeris harness (DE431/Espenak-uyumlu) — scripts/cosmic-validation/eclipses";

// ─── Katalog (küçük, kontrollü, harness-doğrulanmış) ────────────────────────────
// Yalnız AE'nin sınıflandıramadığı/sınır olayları + (ileride) Saros/magnitude.
// Anahtar = peak UTC tarihi (YYYY-MM-DD). Saros/magnitude şu an BİLEREK boş.

type EclipseCatalogEntry = {
  date: string;
  kind: EclipseGroup;
  typeOverride?: EclipseType;
  saros?: number;
  magnitude?: number;
  source: string;
  note?: string;
};

const ECLIPSE_CATALOG: ReadonlyArray<EclipseCatalogEntry> = [
  // Hibritler — AE bunları "total" sınıflar; SWE ECL_ANNULAR_TOTAL ile doğrulandı.
  { date: "2031-11-14", kind: "solar", typeOverride: "hybrid", source: CATALOG_SOURCE, note: "Hibrit (halkalı-tam); harness ECL_ANNULAR_TOTAL ile doğrulandı." },
  { date: "2049-11-25", kind: "solar", typeOverride: "hybrid", source: CATALOG_SOURCE, note: "Hibrit (halkalı-tam); harness ile doğrulandı." },
  { date: "2050-05-20", kind: "solar", typeOverride: "hybrid", source: CATALOG_SOURCE, note: "Hibrit (halkalı-tam); harness ile doğrulandı." },
  // Uç-enlem sınır olayları — AE "partial" sınıflar; harness merkezi tür verir. Türkiye'yi ETKİLEMEZ.
  { date: "2043-04-09", kind: "solar", typeOverride: "total",   source: CATALOG_SOURCE, note: "Uç enlem (~61°N) merkezi tutulma; Türkiye merkezi görünürlüğünü etkilemez." },
  { date: "2043-10-03", kind: "solar", typeOverride: "annular", source: CATALOG_SOURCE, note: "Uç enlem (~61°S) halkalı; Türkiye'yi etkilemez." },
  // Ay penumbral/partial sınırı — AE "partial", harness (DE431) "penumbral". Kıl payı sınır.
  { date: "2042-09-29", kind: "lunar", typeOverride: "penumbral", source: CATALOG_SOURCE, note: "Penumbral/partial sınırı; harness (DE431) penumbral verir." },
];

function catalogFor(kind: EclipseGroup, utcDate: string): EclipseCatalogEntry | null {
  return ECLIPSE_CATALOG.find(c => c.kind === kind && c.date === utcDate) ?? null;
}

// ─── Tarih yardımcıları ─────────────────────────────────────────────────────────

function utcDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
const isoZ = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");
/** Türkiye yerel saatini +03:00 ofsetli ISO olarak verir (yanıltıcı Z değil). */
function isoTR(d: Date): string {
  const t = new Date(d.getTime() + TR_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+03:00`;
}
function dateStrTR(d: Date): string {
  const t = new Date(d.getTime() + TR_OFFSET_MS);
  return `${t.getUTCDate()} ${MONTHS_TR[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
const trOrNull = (d: Date | null | undefined): string | null => (d ? isoTR(d) : null);
const round = (x: number, n = 4): number => Math.round(x * 10 ** n) / 10 ** n;

// ─── Çekirdek üretim (singleton) ────────────────────────────────────────────────

function buildSolarEclipses(): SolarEclipse[] {
  const out: SolarEclipse[] = [];
  const endMs = Date.UTC(TO_YEAR + 1, 0, 1);
  let e = AE.SearchGlobalSolarEclipse(new Date(Date.UTC(FROM_YEAR, 0, 1)));
  while (e.peak.date.getTime() < endMs && out.length < 400) {
    const peak = e.peak.date;
    const ds = utcDateStr(peak);
    const cat = catalogFor("solar", ds);
    const aeType = e.kind as EclipseType;        // total | annular | partial (AE)
    const eclipseType = cat?.typeOverride ?? aeType;
    const notes: string[] = [];
    if (cat?.note) notes.push(cat.note);
    // partial global'de obscuration tanımsız (AE undefined döner)
    const obsc = (typeof e.obscuration === "number") ? round(e.obscuration) : null;

    out.push({
      id: `solar-${ds}`,
      kind: "solar",
      eclipseType,
      peakUTC: isoZ(peak),
      peakTR: isoTR(peak),
      dateTR: dateStrTR(peak),
      obscuration: obsc,
      centerLat: (typeof e.latitude === "number") ? round(e.latitude, 4) : null,
      centerLon: (typeof e.longitude === "number") ? round(e.longitude, 4) : null,
      distanceKm: (typeof e.distance === "number") ? round(e.distance, 1) : null,
      saros: cat?.saros ?? null,
      magnitude: cat?.magnitude ?? null,          // AE magnitude vermez; yalnız katalog
      source: cat ? `${ENGINE_SOURCE} + ${cat.source}` : ENGINE_SOURCE,
      validationStatus: cat?.typeOverride ? "catalog-verified" : "engine-verified",
      confidence: "high",
      notes,
    });
    e = AE.NextGlobalSolarEclipse(e.peak);
  }
  return out;
}

function buildLunarEclipses(): LunarEclipse[] {
  const out: LunarEclipse[] = [];
  const endMs = Date.UTC(TO_YEAR + 1, 0, 1);
  let e = AE.SearchLunarEclipse(new Date(Date.UTC(FROM_YEAR, 0, 1)));
  while (e.peak.date.getTime() < endMs && out.length < 400) {
    const peak = e.peak.date;
    const ds = utcDateStr(peak);
    const cat = catalogFor("lunar", ds);
    const eclipseType = (cat?.typeOverride ?? (e.kind as EclipseType));
    const minMs = (m: number) => m * 60_000;
    const sd = (v: number) => (v && v > 0 ? v : 0);
    const penB = sd(e.sd_penum)   ? new Date(peak.getTime() - minMs(e.sd_penum))   : null;
    const penE = sd(e.sd_penum)   ? new Date(peak.getTime() + minMs(e.sd_penum))   : null;
    const parB = sd(e.sd_partial) ? new Date(peak.getTime() - minMs(e.sd_partial)) : null;
    const parE = sd(e.sd_partial) ? new Date(peak.getTime() + minMs(e.sd_partial)) : null;
    const totB = sd(e.sd_total)   ? new Date(peak.getTime() - minMs(e.sd_total))   : null;
    const totE = sd(e.sd_total)   ? new Date(peak.getTime() + minMs(e.sd_total))   : null;
    const notes: string[] = [];
    if (cat?.note) notes.push(cat.note);

    out.push({
      id: `lunar-${ds}`,
      kind: "lunar",
      eclipseType,
      peakUTC: isoZ(peak),
      peakTR: isoTR(peak),
      dateTR: dateStrTR(peak),
      obscuration: (typeof e.obscuration === "number") ? round(e.obscuration) : null,
      penumbralBeginTR: trOrNull(penB),
      partialBeginTR: trOrNull(parB),
      totalBeginTR: trOrNull(totB),
      totalEndTR: trOrNull(totE),
      partialEndTR: trOrNull(parE),
      penumbralEndTR: trOrNull(penE),
      durPenumMin: sd(e.sd_penum)   ? round(2 * e.sd_penum, 1)   : null,
      durPartialMin: sd(e.sd_partial) ? round(2 * e.sd_partial, 1) : null,
      durTotalMin: sd(e.sd_total)   ? round(2 * e.sd_total, 1)   : null,
      saros: cat?.saros ?? null,
      magnitude: cat?.magnitude ?? null,
      source: cat ? `${ENGINE_SOURCE} + ${cat.source}` : ENGINE_SOURCE,
      validationStatus: cat?.typeOverride ? "catalog-verified" : "engine-verified",
      confidence: "high",
      notes,
    });
    e = AE.NextLunarEclipse(e.peak);
  }
  return out;
}

// Modül yüklemesinde bir kez (ES modülü singleton). Şehir görünürlüğü AYRI/lazy (aşağıda).
const SOLAR_ECLIPSES: SolarEclipse[] = buildSolarEclipses();
const LUNAR_ECLIPSES: LunarEclipse[] = buildLunarEclipses();
const SOLAR_BY_ID = new Map(SOLAR_ECLIPSES.map(e => [e.id, e]));
const LUNAR_BY_ID = new Map(LUNAR_ECLIPSES.map(e => [e.id, e]));

// ─── Şehir görünürlüğü (lazy + memoize — pahalı yerel arama yalnız istenince) ────

const solarCityCache = new Map<string, SolarCityVisibility[]>();
const lunarCityCache = new Map<string, LunarCityVisibility[]>();

/** Bir güneş tutulmasının her Türkiye şehrinden görünürlüğü. Şehir bazlı; genelleme YOK. */
export function getSolarCityVisibility(id: string): SolarCityVisibility[] {
  const cached = solarCityCache.get(id);
  if (cached) return cached;
  const ecl = SOLAR_BY_ID.get(id);
  if (!ecl) return [];
  const peakMs = Date.parse(ecl.peakUTC);

  const result = TR_CITIES.map(city => {
    const obs = new AE.Observer(city.lat, city.lon, city.elev);
    let local: AE.LocalSolarEclipseInfo | null = null;
    try { local = AE.SearchLocalSolarEclipse(new Date(peakMs - 2 * DAY_MS), obs); } catch { local = null; }
    // Bu tutulma mı? (yerel max global peak'e ~1 günden yakın)
    if (!local || Math.abs(local.peak.time.date.getTime() - peakMs) > DAY_MS) {
      return {
        city: city.name, lat: city.lat, lon: city.lon,
        visible: false, visibilityStatus: `${city.name}'dan görünmez`,
        localType: null, partialBeginTR: null, peakTR: null, partialEndTR: null,
        totalBeginTR: null, totalEndTR: null, altitudeAtPeak: null, obscuration: null,
      } satisfies SolarCityVisibility;
    }
    const peakAlt = local.peak.altitude;
    const contactUp = peakAlt > 0
      || (local.partial_begin?.altitude ?? -90) > 0
      || (local.partial_end?.altitude ?? -90) > 0;
    let visible: boolean, status: string;
    if (peakAlt > 0) { visible = true; status = `${city.name}'dan görülür`; }
    else if (contactUp) { visible = true; status = `${city.name}'dan ufuk yakını (kısmi)`; }
    else { visible = false; status = `${city.name}'dan görünmez (ufuk altı)`; }

    return {
      city: city.name, lat: city.lat, lon: city.lon,
      visible, visibilityStatus: status,
      localType: local.kind as EclipseType,
      partialBeginTR: trOrNull(local.partial_begin?.time.date),
      peakTR: isoTR(local.peak.time.date),
      partialEndTR: trOrNull(local.partial_end?.time.date),
      totalBeginTR: trOrNull(local.total_begin?.time.date),
      totalEndTR: trOrNull(local.total_end?.time.date),
      altitudeAtPeak: round(peakAlt, 2),
      obscuration: round(local.obscuration, 4),
    } satisfies SolarCityVisibility;
  });

  solarCityCache.set(id, result);
  return result;
}

/** Bir ay tutulmasının her Türkiye şehrinden görünürlüğü (Ay ufuk yüksekliği). */
export function getLunarCityVisibility(id: string): LunarCityVisibility[] {
  const cached = lunarCityCache.get(id);
  if (cached) return cached;
  const ecl = LUNAR_BY_ID.get(id);
  if (!ecl) return [];
  const peak = new Date(Date.parse(ecl.peakUTC));

  const result = TR_CITIES.map(city => {
    const obs = new AE.Observer(city.lat, city.lon, city.elev);
    let alt = -90;
    try {
      const eq = AE.Equator(AE.Body.Moon, peak, obs, true, true);
      alt = AE.Horizon(peak, obs, eq.ra, eq.dec, "normal").altitude;
    } catch { alt = -90; }
    const visible = alt > 0;
    return {
      city: city.name, lat: city.lat, lon: city.lon,
      moonAltitudeAtPeak: round(alt, 2),
      visible,
      visibilityStatus: visible ? `${city.name}'dan görülür (Ay ufuk üstü)` : `${city.name}'dan görünmez (Ay ufuk altı)`,
    } satisfies LunarCityVisibility;
  });

  lunarCityCache.set(id, result);
  return result;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export function getSolarEclipses(): SolarEclipse[] { return SOLAR_ECLIPSES; }
export function getLunarEclipses(): LunarEclipse[] { return LUNAR_ECLIPSES; }

/** Tüm tutulmalar, peak'e göre kronolojik. */
export function getAllEclipses(): AnyEclipse[] {
  return [...SOLAR_ECLIPSES, ...LUNAR_ECLIPSES].sort((a, b) => Date.parse(a.peakUTC) - Date.parse(b.peakUTC));
}

/** Verilen tarihten sonraki ilk `count` tutulma. */
export function getUpcomingEclipses(from: Date, count = 6): AnyEclipse[] {
  const t = from.getTime();
  return getAllEclipses().filter(e => Date.parse(e.peakUTC) >= t).slice(0, count);
}
