// Gökyüzü Atlası — NATAL 8 EV SİSTEMİ: "sağlayıcı konum + yerel ev" türetme katmanı (SAF; ÜRÜNE BAĞLI DEĞİL — Aşama 1).
//
// Owner kararı (31.10.2026, 12-PR643-NATAL-ENTEGRASYON-PLANI): Natal'da sağlayıcının 4 sistemi (Placidus, Tam Burç, Eşit Ev,
// Koch) AYNEN kalır; #643'ün 4 klasik sistemi (Regiomontanus, Campanus, Porphyry, Alcabitius) eklenir → 8 sistem.
//
// Yöntem (plan §2.2):
//   • Girdi, sağlayıcının PLACIDUS Natal teknik katmanıdır (aynı istek gövdesi → aynı önbellek satırı; yeni ücretli çağrı yok).
//   • Gezegen boylamları, ASC/MC, açılar, desenler, asalet, özet ve Şans Noktası/Vertex BOYLAMLARI sağlayıcıdan aynen alınır.
//   • Çerçeve: RAMC = sağlayıcı MC'sinden (ramcFromMc), ε = gerçek eğiklik (astronomy-engine, doğum anı), φ = sağlayıcı yankısı.
//     Böylece yerel cusp'lar sağlayıcının ASC/MC'siyle AYNI geometride kurulur (UT1/UTC farkı devreye girmez).
//   • Ara cusp'lar #643 motorundan (computeHousesFromFrame). Cusp 1/7 = sağlayıcı ASC/DSC, 10/4 = sağlayıcı MC/IC (birebir).
//   • Bütünlük kapısı: motorun bu çerçevede bulduğu ASC/MC sağlayıcınınkinden > 1″ saparsa sonuç VERİLMEZ (açık hata).
//   • Gezegenlerin, Şans Noktası'nın ve Vertex'in ev numaraları seçilen sisteme göre YENİDEN hesaplanır; sağlayıcının
//     (Placidus'a göre verdiği) ev numaraları HİÇBİR alanda taşınmaz.
//   • Sağlayıcının gezegen yorumları ev numarası içerir ("Dokuzuncu Ev evindeki … Güneş") → yerel sistemde gizlenir.
//
// Mevcut 4 sistemde bu katman girdi nesnesini DEĞİŞTİRMEDEN (aynı referans) döndürür. Sessiz sistem değişimi YOK.

import { HOUSE_SYSTEMS, NATAL_TECHNICAL_SCHEMA, SIGN_IDS, type BodyId, type EclipticPoint, type HouseSystem, type NatalHouse, type NatalInterpretation, type NatalTechnical } from "../../model/western";
import { n360, ramcFromMc, skyFrameAt } from "../../horary/western/houses";
import { DEFAULT_CUSP_TOLERANCE_DEG, PRO_HOUSE_SYSTEMS, PRO_HOUSES_ENGINE_VERSION, computeHousesFromFrame, placeBodies, type ProHouseSystem } from "./engine";

/** Natal ev sistemleri: önce sağlayıcının mevcut 4 sistemi (sıra korunur), sonra 4 klasik sistem. `HOUSE_SYSTEMS` DEĞİŞMEZ. */
export const NATAL_HOUSE_SYSTEMS = [...HOUSE_SYSTEMS, ...PRO_HOUSE_SYSTEMS] as const;
export type NatalHouseSystem = HouseSystem | ProHouseSystem;

export const LOCAL_NATAL_HOUSES_VERSION = "natal-local-houses-1" as const;
/** Yerel sistemlerin dayandığı sağlayıcı yanıtı: Placidus (sect geometrik ufukla birebir; aynı önbellek anahtarı). */
export const LOCAL_NATAL_BASE_HOUSE_SYSTEM = "placidus" as const;
/** ASC/MC bütünlük kapısı (yay saniyesi). Ölçülen: Roxy çerçevesinde ≤ 0,5″ (#643 R1/R3). */
export const LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC = 1;
/** Ürünün kutup engeli (engine/service.ts POLAR_HOUSE_LATITUDE ile AYNI değer; statik testle eşitlenir). */
export const NATAL_POLAR_HOUSE_LATITUDE = 66.5;
/** Yüksek enlem uyarısı (owner K-A, 31.10.2026): |enlem| > 60°. Yalnız uyarı; hesap değişmez. */
export const NATAL_HIGH_LATITUDE_WARN = 60;

export const isProviderNatalHouseSystem = (x: unknown): x is HouseSystem => typeof x === "string" && (HOUSE_SYSTEMS as readonly string[]).includes(x);
export const isLocalNatalHouseSystem = (x: unknown): x is ProHouseSystem => typeof x === "string" && (PRO_HOUSE_SYSTEMS as readonly string[]).includes(x);
export const isNatalHouseSystem = (x: unknown): x is NatalHouseSystem => isProviderNatalHouseSystem(x) || isLocalNatalHouseSystem(x);

/** Natal seçenek doğrulaması (8 sistem). Mevcut parseNatalOptions (4 sistem) DEĞİŞMEZ; Aşama 2'de bu kullanılacak. */
export function parseNatalHouseSystem(raw: unknown, fallback: NatalHouseSystem = LOCAL_NATAL_BASE_HOUSE_SYSTEM): NatalHouseSystem | null {
  const v = raw === undefined ? fallback : raw;
  return isNatalHouseSystem(v) ? v : null;
}

/** Sağlayıcıya gönderilecek ev sistemi: yerel sistemlerde Placidus tabanı, sağlayıcı sistemlerinde kendisi. */
export function providerHouseSystemFor(system: NatalHouseSystem): HouseSystem {
  return isLocalNatalHouseSystem(system) ? LOCAL_NATAL_BASE_HOUSE_SYSTEM : system;
}

// ─── Enlem kuralları (kutup engeli + yüksek enlem uyarısı) ─────────────────────────────────────────

export type NatalLatitudeCheck = {
  /** Hesap engelli mi (sağlayıcıya da gidilmez). */
  blocked: { code: "HOUSE_SYSTEM_POLAR"; error: string } | null;
  warnings: "high_latitude"[];
};

/** Kutupta tanımsız sistemler: Placidus, Koch (mevcut kural) + 4 klasik sistem (doğrulanmamış bölge, owner K-A). */
export function natalHouseSystemUndefinedAtPolar(system: NatalHouseSystem): boolean {
  return system === "placidus" || system === "koch" || isLocalNatalHouseSystem(system);
}

export function checkNatalHouseLatitude(system: NatalHouseSystem, latitude: number): NatalLatitudeCheck {
  const lat = Math.abs(latitude);
  if (!Number.isFinite(lat)) return { blocked: { code: "HOUSE_SYSTEM_POLAR", error: "Doğum yeri enlemi geçersiz." }, warnings: [] };
  if (lat > NATAL_POLAR_HOUSE_LATITUDE && natalHouseSystemUndefinedAtPolar(system)) {
    return {
      blocked: { code: "HOUSE_SYSTEM_POLAR", error: `Natal: seçilen ev sistemi bu enlemde (${latitude.toFixed(1)}°) tanımsızdır. Whole Sign veya Equal ev sistemini seçin.` },
      warnings: [],
    };
  }
  return { blocked: null, warnings: lat > NATAL_HIGH_LATITUDE_WARN ? ["high_latitude"] : [] };
}

// ─── Türetme ────────────────────────────────────────────────────────────────────────────────────

export type LocalNatalPointId = BodyId | "part_of_fortune" | "vertex";

export type LocalNatalHouseSource = {
  kind: "local";
  /** Katman sürümü (bu dosya) ve ev motoru sürümü (#643). */
  layer: typeof LOCAL_NATAL_HOUSES_VERSION;
  engine: typeof PRO_HOUSES_ENGINE_VERSION;
  /** Gezegen konumları ve açıların geldiği sağlayıcı sistemi. */
  base: { houseSystem: typeof LOCAL_NATAL_BASE_HOUSE_SYSTEM };
  /** Çerçeve: sağlayıcı MC'sinden RAMC + gerçek eğiklik. */
  frame: { method: "provider_mc"; ramcDeg: number; obliquityDeg: number; latitudeDeg: number };
  /** Bütünlük kapısında ölçülen sapmalar (yay saniyesi). */
  angleCheck: { ascArcsec: number; mcArcsec: number; toleranceArcsec: number };
  warnings: ("high_latitude" | "near_polar_limit")[];
  /** Ev sınırına `toleranceDeg`'den yakın noktalar (konum/zaman belirsizliği evi değiştirebilir). */
  nearCusp: { id: LocalNatalPointId; house: number; toCuspDeg: number }[];
  nearCuspToleranceDeg: number;
};

export type LocalNatalTechnical = Omit<NatalTechnical, "houseSystem"> & { houseSystem: ProHouseSystem; houseSource: LocalNatalHouseSource };

export type LocalNatalErrorCode =
  | "unknown_system"
  | "invalid_technical"
  | "base_not_placidus"
  | "angles_missing"
  | "invalid_echo"
  | "polar_latitude"
  | "frame_error"
  | "angle_mismatch";
export type LocalNatalError = { ok: false; code: LocalNatalErrorCode; error: string; detail?: Record<string, number | string> };
export type LocalNatalResult = { ok: true; technical: LocalNatalTechnical } | LocalNatalError;

const fail = (code: LocalNatalErrorCode, error: string, detail?: Record<string, number | string>): LocalNatalError => ({ ok: false, code, error, ...(detail ? { detail } : {}) });
const s180 = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

function point(lon: number): EclipticPoint {
  const l = n360(lon);
  const i = Math.min(11, Math.floor(l / 30));
  return { longitude: l, sign: SIGN_IDS[i], degreeInSign: l - i * 30 };
}

/** Yankıdaki yerel saat + ofset → UTC (ms). Sağlayıcı yankısı biçimi: YYYY-MM-DD, HH:MM[:SS], ondalık saat ofseti. */
export function echoUtcMs(echo: NatalTechnical["echo"]): number | null {
  if (!echo || !/^\d{4}-\d{2}-\d{2}$/.test(echo.date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(echo.time) || !Number.isFinite(echo.utcOffsetHours)) return null;
  const t = echo.time.length === 5 ? `${echo.time}:00` : echo.time;
  const local = Date.parse(`${echo.date}T${t}Z`);
  return Number.isFinite(local) ? local - echo.utcOffsetHours * 3_600_000 : null;
}

/**
 * Sağlayıcının Placidus Natal teknik katmanından seçilen KLASİK sistemin Natal teknik katmanını türetir. Saf ve deterministik.
 * Saat bilinmiyor maskesi (view/natalView.maskTimeDependent) bu katmandan SONRA aynen uygulanır.
 */
export function deriveLocalNatalHouses(technical: NatalTechnical, system: ProHouseSystem, opts: { nearCuspToleranceDeg?: number } = {}): LocalNatalResult {
  if (!isLocalNatalHouseSystem(system)) return fail("unknown_system", "Bilinmeyen yerel ev sistemi.");
  if (!technical || technical.schema !== NATAL_TECHNICAL_SCHEMA || !Array.isArray(technical.bodies)) return fail("invalid_technical", "Natal teknik veri geçersiz.");
  if (technical.houseSystem !== LOCAL_NATAL_BASE_HOUSE_SYSTEM) return fail("base_not_placidus", "Klasik ev sistemleri yalnız sağlayıcının Placidus Natal sonucundan türetilir.", { base: String(technical.houseSystem) });
  const asc = technical.angles?.ascendant.longitude;
  const mc = technical.angles?.midheaven.longitude;
  if (!Number.isFinite(asc) || !Number.isFinite(mc) || technical.houses?.length !== 12) return fail("angles_missing", "Yükselen/MC veya ev başlangıçları yok (doğum saati bilinmiyor olabilir).");
  const utcMs = echoUtcMs(technical.echo);
  const lat = technical.echo?.latitude;
  const lon = technical.echo?.longitude;
  if (utcMs === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail("invalid_echo", "Doğum anı/yeri yankısı geçersiz.");

  const latCheck = checkNatalHouseLatitude(system, lat);
  if (latCheck.blocked) return fail("polar_latitude", latCheck.blocked.error, { latitude: lat });

  const sky = skyFrameAt(utcMs, lat, lon);
  if ("error" in sky) return fail("frame_error", "Gök çerçevesi hesaplanamadı.", { detail: sky.detail });
  const eps = sky.obliquity;
  const ramc = ramcFromMc(mc as number, eps);
  const res = computeHousesFromFrame(system, { ramc, obliquity: eps, latitude: lat });
  if (!res.ok) return fail(res.error === "polar_latitude" ? "polar_latitude" : "frame_error", res.detail);

  const ascArcsec = Math.abs(s180(res.cusps[0], asc as number)) * 3600;
  const mcArcsec = Math.abs(s180(res.cusps[9], mc as number)) * 3600;
  if (!(ascArcsec <= LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC) || !(mcArcsec <= LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC)) {
    return fail("angle_mismatch", `Yerel ev hesabı sağlayıcının Yükselen/MC değeriyle uyuşmadı (ASC ${ascArcsec.toFixed(2)}″, MC ${mcArcsec.toFixed(2)}″ > ${LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC}″). Sonuç gösterilmedi.`, { ascArcsec, mcArcsec });
  }

  // Açılar sağlayıcıdan birebir; ara cusp'lar motordan.
  const cusps = res.cusps.slice();
  cusps[0] = n360(asc as number);
  cusps[6] = n360((asc as number) + 180);
  cusps[9] = n360(mc as number);
  cusps[3] = n360((mc as number) + 180);
  const houses: NatalHouse[] = cusps.map((c, i) => ({ number: i + 1, ...point(c) }));

  const tol = opts.nearCuspToleranceDeg ?? DEFAULT_CUSP_TOLERANCE_DEG;
  const pts: { id: LocalNatalPointId; lon: number }[] = technical.bodies.map((b) => ({ id: b.id, lon: b.longitude }));
  const pof = technical.points?.partOfFortune ?? null;
  const vx = technical.points?.vertex ?? null;
  if (pof) pts.push({ id: "part_of_fortune", lon: pof.longitude });
  if (vx) pts.push({ id: "vertex", lon: vx.longitude });
  const placed = new Map(placeBodies(cusps, pts, tol).map((p) => [p.id, p]));
  const houseOfId = (id: LocalNatalPointId) => placed.get(id)!.house;

  const nearCusp = [...placed.values()]
    .filter((p) => p.nearCusp)
    .map((p) => ({ id: p.id as LocalNatalPointId, house: p.house, toCuspDeg: Math.min(p.fromCusp, p.toNextCusp) }));

  const warnings: LocalNatalHouseSource["warnings"] = [...latCheck.warnings];
  if (res.warnings.includes("near_polar_limit")) warnings.push("near_polar_limit");

  const out: LocalNatalTechnical = {
    ...technical,
    houseSystem: system,
    houses,
    bodies: technical.bodies.map((b) => ({ ...b, house: houseOfId(b.id) })),
    points: {
      partOfFortune: pof ? { ...pof, house: houseOfId("part_of_fortune") } : null,
      vertex: vx ? { ...vx, house: houseOfId("vertex") } : null,
    },
    houseSource: {
      kind: "local",
      layer: LOCAL_NATAL_HOUSES_VERSION,
      engine: PRO_HOUSES_ENGINE_VERSION,
      base: { houseSystem: LOCAL_NATAL_BASE_HOUSE_SYSTEM },
      frame: { method: "provider_mc", ramcDeg: n360(ramc), obliquityDeg: eps, latitudeDeg: lat },
      angleCheck: { ascArcsec, mcArcsec, toleranceArcsec: LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC },
      warnings,
      nearCusp,
      nearCuspToleranceDeg: tol,
    },
  };
  return { ok: true, technical: out };
}

/**
 * Tek giriş: sağlayıcı sistemlerinde girdi AYNEN (aynı referans) döner — mevcut 4 sistemin davranışı ve çıktısı değişmez.
 * Klasik sistemlerde deriveLocalNatalHouses.
 */
export function resolveNatalHouses(technical: NatalTechnical, system: NatalHouseSystem): { ok: true; technical: NatalTechnical | LocalNatalTechnical } | LocalNatalError {
  if (isProviderNatalHouseSystem(system)) return { ok: true, technical };
  if (isLocalNatalHouseSystem(system)) return deriveLocalNatalHouses(technical, system);
  return fail("unknown_system", "Bilinmeyen ev sistemi.");
}

// ─── Sağlayıcı yorumu ────────────────────────────────────────────────────────────────────────────

/**
 * Ev numarası/ev yerleşimi atfı (Türkçe ve İngilizce). Sağlayıcı yorumu biçimi: "Dokuzuncu Ev evindeki …", "dokuzuncu ev ile ilgili".
 * Yalnız TESPİT içindir (testler ve denetim); maskeleme bu ifadeye güvenmez — gezegen yorumları koşulsuz çıkarılır.
 */
export const HOUSE_REFERENCE_RE =
  /(birinci|ikinci|üçüncü|dördüncü|beşinci|altıncı|yedinci|sekizinci|dokuzuncu|onuncu|on\s*birinci|on\s*ikinci)\s+ev|\b\d{1,2}\s*\.\s*ev|\bev(?:inde|indeki|de|deki|i|ine|in)?\b\s*\d{1,2}\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d{1,2}(st|nd|rd|th))\s+house\b|\bhouse\s+\d{1,2}\b/i;

export function textHasHouseReference(s: string | null | undefined): boolean {
  return typeof s === "string" && HOUSE_REFERENCE_RE.test(s.toLocaleLowerCase("tr-TR"));
}

/** Yorumun hangi bölümlerinde ev atfı var (denetim). */
export function natalInterpretationHouseRefs(i: NatalInterpretation): { bodies: number; aspects: number; patterns: number; overall: number } {
  return {
    bodies: i.bodies.filter((b) => textHasHouseReference(b.summary) || textHasHouseReference(b.detailed)).length,
    aspects: i.aspects.filter((a) => textHasHouseReference(a.summary)).length,
    patterns: i.patterns.filter((p) => textHasHouseReference(p.text)).length,
    overall: textHasHouseReference(i.overall?.aspectSummary) ? 1 : 0,
  };
}

/**
 * Yerel ev sistemlerinde sağlayıcı yorumu: gezegen yorumları ÇIKARILIR (sağlayıcının Placidus ev numaralarını içerir).
 * Açı, desen ve genel açı özeti korunur (ev atfı içermediği testle doğrulandı). Saat bilinmiyor maskesiyle aynı kural.
 */
export function maskNatalInterpretationForLocalHouses(i: NatalInterpretation): NatalInterpretation {
  return { ...i, bodies: [] };
}
