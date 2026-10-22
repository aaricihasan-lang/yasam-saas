// Astroloji Hesap Motoru — ORKESTRASYON (YALNIZ SUNUCU).
//
// Akış (maliyet + güvenlik için bilinçli sıra):
//   1) profil + revizyon TENANT doğrulaması (owner'ın kendi tenant'ı; istemci tenant vermez)
//   2) seçim doğrulama + NORMALİZE (ör. "şimdi" → UTC saat başı) → karşı taraf (synastry/composite)
//      aynı tenant'tan yüklenir; saat gerektiren teknik saat bilinmiyorsa ENGELLENİR (istek yok)
//   3) plan (kapsama budaması + tekilleştirme) → önbellek (tenant_id, input_hash)
//   4) eşik üstü yeni istek → açık onay (confirmNewRequests === plan.newRequestCount)
//   5) eksik birimler: yapılandırma → eşzamanlılık kilidi → kullanıcı/tenant limitleri → sağlayıcı →
//      beyaz liste projeksiyon → TEK INSERT (teknik) + ayrı INSERT (yorum). KISMİ BAŞARI desteklenir.
//   6) görünüm: teknik her zaman; yorum yalnız görünürlük "visible" ise ayrı tablodan
//
// Loglar: yalnız hata türü/durum/teknik + input_hash'in ilk 8 hanesi. Anahtar, doğum verisi,
// koordinat, danışan adı LOGLANMAZ.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ASTRO_RATE_LIMITS, ASTRO_ROXY_WORST_CALL_MS, ASTRO_RUN_BUDGET_MS, ASTRO_UNIT_DB_MARGIN_MS, type RoxyServerConfig } from "../config";
import { quotaCheck } from "../../security/testQuotaExemption";
import { resolveInterpretationVisibility, type AstrologyEntitlements } from "../access/entitlements";
import type { RoxyCallResult } from "../providers/roxy/client";
import type { BirthPoint } from "../providers/roxy/requests";
import { buildPlan, parseSelections, publicPlanSummary, type ExecutionPlan, type PlannedSelection, type PlannedUnit, type Selection } from "./planner";
import { getTechnique, type TechniqueId } from "./techniques";
import { resultIdFor } from "./inputHash";
import {
  findResultsByHashes,
  getInterpretation,
  getProfile,
  getResultById,
  getRevision,
  insertInterpretation,
  insertResult,
  isSchemaMissing,
  isRetryableDbError,
  isUniqueViolation,
  isUuid,
  logAstroDbError,
  touchUnmappedFields,
  type ResultRow,
  type RevisionRow,
} from "../persistence/repo";
import { publicRevision } from "../view/natalView";
import { STALE_TIMEZONE_BLOCK_CODE, staleTimezoneBlockText, staleTimezoneOffset } from "../legacyMethod";
import { buildTechniqueView, type TechniqueView } from "../view/techniqueView";
import { normalizeTime, resolveAstroBirthTime } from "../birth/timeResolution";
import { resolveAstroLocation } from "../birth/location";
import { KP_SPLIT_SUB_PROVIDER_ERROR } from "../providers/roxy/kp";
import type { PlaceRef } from "../model/westernLocation";
import { kpIntervalOffset } from "./kpRulingIntervalOptions";

assertServerOnly("lib/astrology/engine/service");

export type EngineCtx = {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  entitlements: AstrologyEntitlements;
};

export type EngineDeps = {
  config: RoxyServerConfig | null;
  callProvider: (config: RoxyServerConfig, endpoint: string, body: Record<string, unknown>, opts: { lang: string; query?: Record<string, string> }) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string, detail?: Record<string, unknown>) => void;
  /** Test/deterministik "şimdi". */
  now?: () => Date;
  /** 9A-P2-02: süre bütçesi için monoton saat (ms). Test sahte saat verebilir. */
  clock?: () => number;
};

export type ServiceResponse = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): ServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});

export const ASTRO_NOT_READY = fail(503, "ASTRO_NOT_READY", "Astroloji veri yapısı bu ortamda henüz hazır değil.");

const PROVIDER_ERRORS: Record<string, { status: number; code: string; error: string }> = {
  timeout: { status: 504, code: "PROVIDER_TIMEOUT", error: "Hesaplama servisi zamanında yanıt vermedi. Lütfen birazdan tekrar deneyin." },
  network: { status: 502, code: "PROVIDER_UNAVAILABLE", error: "Hesaplama servisine şu anda ulaşılamıyor." },
  unauthorized: { status: 502, code: "PROVIDER_CONFIG", error: "Hesaplama servisi yapılandırma hatası (anahtar/plan)." },
  rate_limited: { status: 503, code: "PROVIDER_BUSY", error: "Hesaplama servisi istek sınırına ulaştı. Birkaç dakika sonra tekrar deneyin." },
  saturated: { status: 503, code: "PROVIDER_BUSY", error: "Hesaplama servisi şu anda yoğun. Birkaç dakika sonra tekrar deneyin." },
  bad_request: { status: 422, code: "PROVIDER_REJECTED", error: "Hesaplama servisi bu doğum bilgisini kabul etmedi. Tarih, saat ve yeri kontrol edin." },
  server_error: { status: 502, code: "PROVIDER_UNAVAILABLE", error: "Hesaplama servisinde geçici bir hata oluştu." },
  malformed_json: { status: 502, code: "PROVIDER_INVALID_RESPONSE", error: "Hesaplama servisinden geçersiz yanıt alındı. Sonuç kaydedilmedi." },
};

/** Yerel sahte sağlayıcı mı? (production'da her zaman false — yalnız geliştirme ortamında yerel adres). */
export function isLocalFakeProvider(config: EngineDeps["config"]): boolean {
  if (process.env.NODE_ENV === "production" || !config) return false;
  try {
    const h = new URL(config.baseUrl).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1";
  } catch {
    return false;
  }
}

/** Kutup dairesi (yaklaşık): bu enlemin ötesinde Placidus/Koch ev bölmesi tanımsız olur. */
export const POLAR_HOUSE_LATITUDE = 66.5;
/** Placidus/Koch ev bölmesi bu enlemde tanımsız mı (Roxy sessizce sistem değiştirir → yanıt reddedilir ama ÜCRETLENİR). */
export function polarHouseBlock(houseSystem: unknown, latitude: number, label: string, where: string): { code: "HOUSE_SYSTEM_POLAR"; error: string } | null {
  if (houseSystem !== "placidus" && houseSystem !== "koch") return null;
  if (!(Math.abs(latitude) > POLAR_HOUSE_LATITUDE)) return null;
  return { code: "HOUSE_SYSTEM_POLAR", error: `${label}: seçilen ev sistemi ${where} (enlem ${latitude.toFixed(1)}°) tanımsızdır. Whole Sign veya Equal ev sistemini seçin.` };
}

export function revisionToBirth(r: RevisionRow): BirthPoint {
  return {
    birthDate: r.birth_date,
    birthTime: r.time_known && r.birth_time ? normalizeTime(r.birth_time.slice(0, 8)) : null,
    utcOffsetSeconds: r.utc_offset_seconds,
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

/** Doğum verisi KULLANMAYAN teknikler (soru anı / gökyüzü anı): revizyon ofseti sonucu etkilemez → ofset engeline girmez. */
const BIRTH_INDEPENDENT_TECHNIQUES = new Set(["kp.horary", "kp.transit"]);

/** Seçimlerin bağlamı: karşı taraf yüklenir (aynı tenant), saat kuralı uygulanır. */
export type SelectionContext = PlannedSelection & { partnerRevision: RevisionRow | null };

export async function resolveSelectionContexts(
  ctx: EngineCtx,
  revision: RevisionRow,
  selections: Selection[],
): Promise<{ ok: true; v: SelectionContext[] } | { ok: false; r: ServiceResponse }> {
  const partnerCache = new Map<string, RevisionRow | null>();
  const out: SelectionContext[] = [];
  const birth = revisionToBirth(revision);
  // Owner kararı (2026-10-21): saklı ofseti güncel tarihsel saat dilimi kuralıyla kesin çelişen revizyonla YENİ hesap yok.
  const selfStale = staleTimezoneOffset(publicRevision(revision));
  for (const s of selections) {
    const def = getTechnique(s.technique)!;
    const base = { birth, birthUtc: revision.birth_utc, partner: null as BirthPoint | null };
    if (selfStale && !BIRTH_INDEPENDENT_TECHNIQUES.has(def.id)) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: STALE_TIMEZONE_BLOCK_CODE, error: staleTimezoneBlockText(def.label, "danışanın", revision.revision, selfStale) } });
      continue;
    }
    if (def.requiresKnownTime && !revision.time_known) {
      const why: Record<string, string> = {
        "western.solar_return": "dönüş anı ve haritası doğum saatine bağlıdır",
        "western.lunar_return": "dönüş anı ve haritası doğum saatine bağlıdır",
        "western.astrocartography": "hatlar saat başına ~15° boylam kayar",
        "western.relocation": "taşınmış Yükselen/MC ve evler doğum saatine bağlıdır",
        "western.local_space": "ufuk yönleri (azimut) doğum saatine bağlıdır",
        "western.profections": "profeksiyon Yükselen burçtan sayılır; Yükselen doğum saatine bağlıdır",
        "kp.chart": "KP cusp sub-lordu yaklaşık 4 dakikada değişir",
        "kp.dasha": "dönem tarihleri ve significatorlar Ay boylamına ve Placidus cusplarına bağlıdır",
        "kp.ruling": "ruling planet significatorları doğum haritasının cusplarından okunur",
        "vedic.bhav_chalit": "bhava madhyaları Yükselen ve MC'den bölünür; Yükselen yaklaşık 4 dakikada 1° ilerler",
        "vedic.chara_karaka": "karaka sırası burç içi derecelere bağlıdır; Ay gün içinde ~13° yol alır",
        "vedic.arudha": "pada sayımı Lagna rashisinden başlar; Lagna doğum saatine bağlıdır",
        "vedic.bhava_bala": "bhava madhyaları ve Dig/Drishti Bala Yükselen ile MC'ye bağlıdır",
      };
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "TIME_REQUIRED", error: `${def.label} doğum saati bilinmeden güvenilir hesaplanamaz (${why[def.id] ?? "sonuç doğum saatine bağlıdır"}).` } });
      continue;
    }
    // 2026-10-11 canlı doğrulama: kutup dairesi ötesinde (|enlem| > 66.5°) Placidus/Koch ev bölmesi tanımsızdır; Roxy
    // bu durumda sessizce başka bir sisteme geçiyor (yanıt reddedilir ama istek ÜCRETLENİR). Sağlayıcıya gitmeden durdur.
    const hs = (s.options as { houseSystem?: unknown } | null)?.houseSystem;
    const placidusLike = (def.id === "western.natal" && (hs === "placidus" || hs === "koch")) || def.id === "kp.chart" || def.id === "kp.dasha" || def.id === "kp.ruling";
    if (placidusLike && Math.abs(birth.latitude) > POLAR_HOUSE_LATITUDE) {
      const msg = def.id.startsWith("kp.")
        ? `${def.label} yalnız Placidus evleriyle hesaplanır; doğum yeri kutup dairesi ötesinde (enlem ${birth.latitude.toFixed(1)}°) olduğundan bu bölme tanımsızdır.`
        : `${def.label}: seçilen ev sistemi bu enlemde (${birth.latitude.toFixed(1)}°) tanımsızdır. Whole Sign veya Equal ev sistemini seçin.`;
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "HOUSE_SYSTEM_POLAR", error: msg } });
      continue;
    }
    if (def.id === "western.solar_return" || def.id === "western.lunar_return") {
      // Aşama 4.1 — dönüş konumu: kimlik SUNUCUDA çözülür; yoksa doğum yeri (gövde değişmez → eski anahtar).
      // Doğum ANI ve ofseti değişmez; hedefin saat dilimi yalnız gösterim için normalize seçeneğe yazılır.
      const id = s.options.returnLocationId as string | null;
      const loc = id ? resolveAstroLocation(id) : null;
      if (id && !loc) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "LOCATION_NOT_FOUND", error: "Seçilen dönüş konumu bulunamadı veya saat dilimi/koordinatı doğrulanamadı." } });
        continue;
      }
      const place: PlaceRef = loc
        ? { locationId: loc.id, label: loc.label, latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone }
        : { locationId: null, label: revision.location_label, latitude: revision.latitude, longitude: revision.longitude, timezone: revision.timezone };
      // 2026-10-12: kutup bloğu dönüş haritasına da uygulanır (evler DÖNÜŞ KONUMUNDA kurulur).
      const polarR = polarHouseBlock(hs, place.latitude, def.label, loc ? "dönüş konumunda" : "doğum yerinde");
      if (polarR) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: polarR });
        continue;
      }
      out.push({
        ...s,
        options: { ...s.options, returnLocation: place },
        ctx: loc ? { ...base, places: { target: { latitude: loc.latitude, longitude: loc.longitude } } } : base,
        partnerRevision: null,
        blocked: null,
      });
      continue;
    }
    if (def.id === "western.relocation" || def.id === "western.local_space") {
      // Konum kimliği SUNUCUDA çözülür (Yaşam konum altyapısı; dış API yok). Çözülmezse ENGEL (istek yok).
      // Normalize seçeneğe çözülen yer yazılır (snapshot/görünüm netliği); hesap anahtarı gövdeden türer.
      const isTarget = def.id === "western.relocation";
      const id = (isTarget ? s.options.targetLocationId : s.options.referenceLocationId) as string | null;
      const loc = id ? resolveAstroLocation(id) : null;
      if (id && !loc) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "LOCATION_NOT_FOUND", error: "Seçilen konum bulunamadı veya saat dilimi/koordinatı doğrulanamadı." } });
        continue;
      }
      const place: PlaceRef = loc
        ? { locationId: loc.id, label: loc.label, latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone }
        : { locationId: revision.location_id, label: revision.location_label, latitude: revision.latitude, longitude: revision.longitude, timezone: revision.timezone };
      const geo = { latitude: place.latitude, longitude: place.longitude };
      // 2026-10-12: taşınmış harita evleri HEDEF konumda kurulur → kutup bloğu hedefe uygulanır (Local Space ev kullanmaz).
      const polarL = isTarget ? polarHouseBlock(hs, place.latitude, def.label, "hedef konumda") : null;
      if (polarL) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: polarL });
        continue;
      }
      out.push({
        ...s,
        options: { ...s.options, [isTarget ? "target" : "reference"]: place },
        ctx: { ...base, places: isTarget ? { target: geo } : { reference: geo } },
        partnerRevision: null,
        blocked: null,
      });
      continue;
    }
    if (def.id === "vedic.panchanga" && (s.options.detail === true || s.options.hours === true)) {
      // 2026-10-22: "Hora + Choghadiya" seçeneği de AYNI gün + konum çözümünü kullanır (aşağıdaki kurallar birebir).
      // 2026-10-21 — Ayrıntılı Panchanga: GÜN + KONUM. Konum kimliği SUNUCUDA çözülür (yoksa doğum yeri); gün boşsa doğum günü.
      // Ofset = o gün o yerde geçerli ofset (IANA, yerel öğle). Kutup dairesi ötesinde gün doğumu/batımı bazı günlerde yok →
      // sağlayıcıya GİTMEDEN dur (fail-closed; ücretli istek yok).
      const id = s.options.placeLocationId as string | null;
      const loc = id ? resolveAstroLocation(id) : null;
      if (id && !loc) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "LOCATION_NOT_FOUND", error: "Seçilen konum bulunamadı veya saat dilimi/koordinatı doğrulanamadı." } });
        continue;
      }
      const place: PlaceRef = loc
        ? { locationId: loc.id, label: loc.label, latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone }
        : { locationId: revision.location_id, label: revision.location_label, latitude: revision.latitude, longitude: revision.longitude, timezone: revision.timezone };
      if (Math.abs(place.latitude) > POLAR_HOUSE_LATITUDE) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "PANCHANGA_POLAR", error: `${s.options.detail === true ? "Ayrıntılı Panchanga" : "Gezegen saatleri (hora) ve Choghadiya"} gün doğumu ve batımına dayanır; seçilen yer kutup dairesi ötesinde (enlem ${place.latitude.toFixed(1)}°) olduğundan bazı günlerde bu pencereler tanımsızdır. Daha güneyde bir yer seçin.` } });
        continue;
      }
      const date = typeof s.options.detailDate === "string" ? s.options.detailDate : revision.birth_date;
      const noon = place.timezone ? resolveAstroBirthTime(date, "12:00", place.timezone, "earlier") : null;
      const offsetHours = noon && noon.kind === "ok" ? Math.round((noon.offsetSeconds / 3600) * 1e6) / 1e6 : !loc && date === revision.birth_date ? Math.round((revision.utc_offset_seconds / 3600) * 1e6) / 1e6 : null;
      if (offsetHours === null) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "TIMEZONE_UNRESOLVED", error: "Seçilen gün için bu yerin saat dilimi çözülemedi." } });
        continue;
      }
      out.push({
        ...s,
        options: { ...s.options, detailDate: date, detailOffsetHours: offsetHours, place },
        ctx: loc ? { ...base, places: { target: { latitude: loc.latitude, longitude: loc.longitude } } } : base,
        partnerRevision: null,
        blocked: null,
      });
      continue;
    }
    if (def.id === "kp.ruling_interval") {
      // 2026-10-22 — KP ruling planets zaman taraması: gözlem yeri kp.ruling ile AYNI desen (kimlik sunucuda; yoksa doğum yeri). Her an
      // Placidus prashna haritası → kutup dairesi ötesinde istek YOK. Sağlayıcı tek ofset kullanır → ofset pencere başlangıcında o yerin
      // ofseti; pencere içinde (yaz/kış saati) değişiyorsa istek YOK (yanlış yerel saat gösterilmez).
      const id = s.options.placeLocationId as string | null;
      const loc = id ? resolveAstroLocation(id) : null;
      if (id && !loc) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "LOCATION_NOT_FOUND", error: "Seçilen konum bulunamadı veya saat dilimi/koordinatı doğrulanamadı." } });
        continue;
      }
      const place: PlaceRef = loc
        ? { locationId: loc.id, label: loc.label, latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone }
        : { locationId: revision.location_id, label: revision.location_label, latitude: revision.latitude, longitude: revision.longitude, timezone: revision.timezone };
      if (Math.abs(place.latitude) > POLAR_HOUSE_LATITUDE) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "HOUSE_SYSTEM_POLAR", error: `${def.label} her an için Placidus evleriyle hesaplanır; gözlem yeri kutup dairesi ötesinde (enlem ${place.latitude.toFixed(1)}°) olduğundan bu bölme tanımsızdır. Daha güneyde bir gözlem yeri seçin.` } });
        continue;
      }
      const off = kpIntervalOffset(place.timezone ?? null, String(s.options.atUtc), Number(s.options.durationMinutes));
      if (off.kind === "changes") {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "KP_INTERVAL_OFFSET_CHANGE", error: "Seçilen aralıkta gözlem yerinin saat ofseti değişiyor (yaz/kış saati geçişi). Tarama tek ofsetle yapıldığından aralığı geçişin bir tarafında kalacak şekilde seçin." } });
        continue;
      }
      if (off.kind === "unresolved") {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "TIMEZONE_UNRESOLVED", error: "Seçilen an için gözlem yerinin saat dilimi çözülemedi." } });
        continue;
      }
      out.push({ ...s, options: { ...s.options, place, offsetHours: off.hours }, ctx: loc ? { ...base, places: { target: { latitude: loc.latitude, longitude: loc.longitude } } } : base, partnerRevision: null, blocked: null });
      continue;
    }
    if (def.id === "kp.horary" || def.id === "kp.ruling") {
      // Aşama 6F — değerlendirme / gözlem yeri: kimlik SUNUCUDA çözülür; yoksa profil doğum yeri. Çözülemezse ENGEL (istek yok).
      const id = s.options.placeLocationId as string | null;
      const loc = id ? resolveAstroLocation(id) : null;
      if (id && !loc) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "LOCATION_NOT_FOUND", error: "Seçilen konum bulunamadı veya saat dilimi/koordinatı doğrulanamadı." } });
        continue;
      }
      const place: PlaceRef = loc
        ? { locationId: loc.id, label: loc.label, latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone }
        : { locationId: revision.location_id, label: revision.location_label, latitude: revision.latitude, longitude: revision.longitude, timezone: revision.timezone };
      // ATL-P3-05 (2026-10-20): KP Horary / Ruling cusp'ları (yalnız Placidus) DEĞERLENDİRME yerinde kurulur — yer kutup dairesi
      // ötesindeyse bölme tanımsız; sağlayıcı 400 döner ve kullanıcı "doğum bilgisi" hatası sanır. Sağlayıcıya gitmeden durdur.
      if (Math.abs(place.latitude) > POLAR_HOUSE_LATITUDE) {
        out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "HOUSE_SYSTEM_POLAR", error: `${def.label} yalnız Placidus evleriyle hesaplanır; değerlendirme yeri kutup dairesi ötesinde (enlem ${place.latitude.toFixed(1)}°) olduğundan bu bölme tanımsızdır. Daha güneyde bir değerlendirme yeri seçin.` } });
        continue;
      }
      out.push({ ...s, options: { ...s.options, place }, ctx: loc ? { ...base, places: { target: { latitude: loc.latitude, longitude: loc.longitude } } } : base, partnerRevision: null, blocked: null });
      continue;
    }
    if (!def.requiresPartner) {
      out.push({ ...s, ctx: base, partnerRevision: null, blocked: null });
      continue;
    }
    const pid = String(s.options.partnerProfileId);
    if (pid === revision.profile_id) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "PARTNER_SAME_PROFILE", error: "Karşı taraf, analiz edilen profilden farklı olmalıdır." } });
      continue;
    }
    const key = `${pid}|${s.options.partnerRevision ?? "current"}`;
    if (!partnerCache.has(key)) {
      const pp = await getProfile(ctx.db, ctx.tenantId, ctx.userId, pid);
      if (pp.error) {
        if (isSchemaMissing(pp.error)) return { ok: false, r: ASTRO_NOT_READY };
        logAstroDbError("engine.partner", pp.error);
        return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
      }
      let row: RevisionRow | null = null;
      if (pp.row) {
        const want = s.options.partnerRevision === null || s.options.partnerRevision === undefined ? pp.row.current_revision : Number(s.options.partnerRevision);
        const rv = await getRevision(ctx.db, ctx.tenantId, ctx.userId, pid, want);
        if (rv.error) {
          logAstroDbError("engine.partnerRevision", rv.error);
          return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
        }
        row = rv.row;
      }
      partnerCache.set(key, row);
    }
    const prow = partnerCache.get(key) ?? null;
    if (!prow) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "PARTNER_NOT_FOUND", error: "Karşı taraf doğum profili bulunamadı." } });
      continue;
    }
    // Owner kararı (2026-10-21): iki kişili analizde karşı tarafın revizyonu da AYRICA denetlenir.
    const partnerStale = staleTimezoneOffset(publicRevision(prow));
    if (partnerStale) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: STALE_TIMEZONE_BLOCK_CODE, error: staleTimezoneBlockText(def.label, "karşı tarafın", prow.revision, partnerStale) } });
      continue;
    }
    // 2026-10-12: sinastri/composite evleri iki kişinin doğum yerinde kurulur → biri kutup dairesi ötesindeyse blok.
    const polarP = polarHouseBlock(hs, birth.latitude, def.label, "1. kişinin doğum yerinde") ?? polarHouseBlock(hs, prow.latitude, def.label, "karşı tarafın doğum yerinde");
    if (polarP) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: polarP });
      continue;
    }
    // Normalize: karşı tarafın KULLANILAN revizyonu seçeneğe yazılır (anahtar + snapshot tutarlılığı).
    const options = { ...s.options, partnerRevision: prow.revision };
    out.push({ ...s, options, ctx: { ...base, partner: revisionToBirth(prow) }, partnerRevision: prow, blocked: null });
  }
  return { ok: true, v: out };
}

type Loaded = {
  revision: RevisionRow;
  selections: SelectionContext[];
  plan: ExecutionPlan;
  cachedRows: Map<string, ResultRow>;
  /** Seçim başına YALNIZ-ÖNBELLEK bağlam birimlerinin hash'leri (plana girmez; bkz. TechniqueDefinition.contextUnits). */
  contextHashes: string[][];
};

export async function loadProfileRevision(
  ctx: EngineCtx,
  profileIdRaw: unknown,
  revisionRaw: unknown,
): Promise<{ ok: true; revision: RevisionRow; label: string; clientId: string | null } | { ok: false; r: ServiceResponse }> {
  const profileId = typeof profileIdRaw === "string" ? profileIdRaw.trim() : "";
  if (!isUuid(profileId)) return { ok: false, r: fail(400, "INVALID_PROFILE", "Geçerli bir doğum profili seçilmedi.") };
  const p = await getProfile(ctx.db, ctx.tenantId, ctx.userId, profileId);
  if (p.error) {
    if (isSchemaMissing(p.error)) return { ok: false, r: ASTRO_NOT_READY };
    logAstroDbError("engine.profile", p.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  if (!p.row) return { ok: false, r: fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.") };
  let revNo = p.row.current_revision;
  if (revisionRaw !== undefined && revisionRaw !== null) {
    const n = typeof revisionRaw === "number" ? revisionRaw : Number(revisionRaw);
    if (!Number.isInteger(n) || n < 1) return { ok: false, r: fail(400, "INVALID_REVISION", "Geçersiz revizyon.") };
    revNo = n;
  }
  const rv = await getRevision(ctx.db, ctx.tenantId, ctx.userId, profileId, revNo);
  if (rv.error) {
    logAstroDbError("engine.revision", rv.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  if (!rv.row) return { ok: false, r: fail(404, "REVISION_NOT_FOUND", "Doğum profili revizyonu bulunamadı.") };
  return { ok: true, revision: rv.row, label: p.row.label, clientId: p.row.client_id };
}

/** Bir seçim listesini planla (önbellek dahil). Analiz servisi de kullanır. */
export async function planSelections(
  ctx: EngineCtx,
  revision: RevisionRow,
  rawSelections: unknown,
  now: Date,
): Promise<{ ok: true; v: Omit<Loaded, "revision"> } | { ok: false; r: ServiceResponse }> {
  const sel = parseSelections(rawSelections, now);
  if (!sel.ok) return { ok: false, r: fail(400, sel.code, sel.error) };
  const sc = await resolveSelectionContexts(ctx, revision, sel.selections);
  if (!sc.ok) return sc;
  const draft = buildPlan(sc.v, () => false);
  // Bağlam birimleri yalnız ÖNBELLEK sorgusuna eklenir — planda / istek sayısında / onayda YOKTUR.
  const contextHashes = sc.v.map((s) => {
    const def = getTechnique(s.technique);
    return !s.blocked && s.ctx && def?.contextUnits ? def.contextUnits(s.ctx, s.options).map((u) => u.inputHash) : [];
  });
  const cached = await findResultsByHashes(ctx.db, ctx.tenantId, ctx.userId, [...new Set([...draft.units.map((u) => u.inputHash), ...contextHashes.flat()])]);
  if (cached.error) {
    if (isSchemaMissing(cached.error)) return { ok: false, r: ASTRO_NOT_READY };
    logAstroDbError("engine.cache", cached.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  const cachedRows = new Map(cached.rows.map((r) => [r.input_hash, r]));
  const plan = buildPlan(sc.v, (h) => cachedRows.has(h));
  return { ok: true, v: { selections: sc.v, plan, cachedRows, contextHashes } };
}

async function loadAndPlan(ctx: EngineCtx, rawBody: unknown, now: Date): Promise<{ ok: true; v: Loaded } | { ok: false; r: ServiceResponse }> {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return { ok: false, r: fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.") };
  }
  const body = rawBody as Record<string, unknown>;
  const pr = await loadProfileRevision(ctx, body.profileId, body.revision);
  if (!pr.ok) return pr;
  const p = await planSelections(ctx, pr.revision, body.selections, now);
  if (!p.ok) return p;
  return { ok: true, v: { revision: pr.revision, ...p.v } };
}

/** POST plan — sağlayıcı ÇAĞRILMAZ; yalnız X/Y/Z özeti (+ normalize seçenekler). */
export async function planAstrology(ctx: EngineCtx, rawBody: unknown, now: Date = new Date()): Promise<ServiceResponse> {
  const l = await loadAndPlan(ctx, rawBody, now);
  if (!l.ok) return l.r;
  return { status: 200, body: { ok: true, plan: publicPlanSummary(l.v.plan, l.v.selections), revision: l.v.revision.revision } };
}

/** GA-P2-05: ücretli yanıt sonrası geçici yazım hatasında yeniden deneme (toplam ≤ 3 deneme, bekleme 400 ms × deneme). */
const DB_WRITE_RETRIES = 2;
const DB_WRITE_RETRY_MS = 400;

type UnitOutcome =
  | { ok: true; row: ResultRow; reused: boolean; providerAttempts: number }
  | { ok: false; status: number; code: string; error: string; providerAttempts: number; retryAfterSec?: number };

async function executeUnit(
  ctx: EngineCtx,
  deps: EngineDeps,
  unit: PlannedUnit,
  selection: SelectionContext,
  revision: RevisionRow,
): Promise<UnitOutcome> {
  const log = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tag = { technique: unit.technique, hash: unit.inputHash.slice(0, 8) };
  // Birimi, ona sahip SEÇİMİN tekniği projekte eder (çok birimli tekniklerde — relocation'ın natal
  // karşılaştırma birimi — doğru seçenekler yalnız seçimin tanımında bilinir).
  const def = getTechnique(selection.technique) ?? getTechnique(unit.technique);
  if (!def) return { ok: false, status: 400, code: "UNKNOWN_TECHNIQUE", error: "Bilinmeyen hesaplama türü.", providerAttempts: 0 };

  const reload = async (): Promise<ResultRow | null> => {
    const r = await findResultsByHashes(ctx.db, ctx.tenantId, ctx.userId, [unit.inputHash]);
    return r.rows.find((x) => x.input_hash === unit.inputHash) ?? null;
  };

  if (!deps.config) {
    return { ok: false, status: 503, code: "PROVIDER_NOT_CONFIGURED", error: "Hesaplama sağlayıcısı bu ortamda yapılandırılmamış. Kayıtlı sonuçlar görüntülenebilir.", providerAttempts: 0 };
  }

  const claim = await deps.rateLimit("astro-roxy-inflight", `${ctx.tenantId}:${ctx.userId}:${unit.inputHash}`, ASTRO_RATE_LIMITS.inFlight.limit, ASTRO_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) {
    const waitStart = Date.now();
    for (let i = 0; i < 10; i++) {
      await sleep(1500);
      const again = await reload();
      if (again) return { ok: true, row: again, reused: true, providerAttempts: 0 };
    }
    // FINAL: kilit bir İŞLEM durumu değil, çift ücretli isteği önleyen pencere (önceki istek sürüyor ya da başarısız
    // olmuş olabilir — ayırt edilemez). Kalan süre GERÇEK pencere süresinden hesaplanır (eskiden sabit 10 sn); kilit
    // erken KALDIRILMAZ, sağlayıcı çağrılmaz.
    const remaining = Math.max(1, (claim.retryAfterSec > 0 ? claim.retryAfterSec : ASTRO_RATE_LIMITS.inFlight.windowSeconds) - Math.round((Date.now() - waitStart) / 1000));
    return {
      ok: false,
      status: 409,
      code: "IN_PROGRESS",
      error: `Bu hesaplama için kısa süre önce bir sağlayıcı isteği başlatıldı; hâlâ sürüyor olabilir ya da başarısız olmuş olabilir. Çift ücretli istek gönderilmedi. Yaklaşık ${remaining} sn sonra yeniden deneyebilirsiniz.`,
      providerAttempts: 0,
      retryAfterSec: remaining,
    };
  }

  // 9A-P2-02: kilit ALINDIKTAN SONRA önbellek yeniden okunur — planlamadan beri başka bir istek (çift tık, ikinci sekme,
  // başka instance) aynı hesabı tamamlayıp kaydettiyse sağlayıcı ikinci kez ÇAĞRILMAZ.
  const fresh = await reload();
  if (fresh) return { ok: true, row: fresh, reused: true, providerAttempts: 0 };

  // Geçici test kotası muafiyeti (yetkili test hesabı + ≤8 saat): ücretli HACİM kotaları atlanır; inflight kilidi yukarıda AYNEN.
  const userRl = await quotaCheck("astro-roxy-user", ctx.userId, () => deps.rateLimit("astro-roxy-user", ctx.userId, ASTRO_RATE_LIMITS.perUser.limit, ASTRO_RATE_LIMITS.perUser.windowSeconds), { tenantId: ctx.tenantId });
  if (!userRl.allowed) {
    return { ok: false, status: 429, code: "RATE_LIMITED", error: "Kısa sürede çok fazla yeni hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", providerAttempts: 0, retryAfterSec: userRl.retryAfterSec };
  }
  const tenantRl = await quotaCheck("astro-roxy-tenant", ctx.userId, () => deps.rateLimit("astro-roxy-tenant", ctx.tenantId, ASTRO_RATE_LIMITS.perTenant.limit, ASTRO_RATE_LIMITS.perTenant.windowSeconds), { tenantId: ctx.tenantId });
  if (!tenantRl.allowed) {
    return { ok: false, status: 429, code: "RATE_LIMITED", error: "Günlük yeni hesaplama sınırına ulaşıldı.", providerAttempts: 0, retryAfterSec: tenantRl.retryAfterSec };
  }

  const call = await deps.callProvider(deps.config, unit.endpoint, unit.body, unit.query ? { lang: unit.lang, query: unit.query } : { lang: unit.lang });
  if (!call.ok) {
    log("[astro] provider call failed", { ...tag, kind: call.kind, status: call.status, attempts: call.attempts });
    // FINAL: YALNIZ yerel geliştirme — sağlayıcı adresi yerel makine ve ortam production DEĞİLSE, sahte Roxy'nin "golden
    // fixture yok" (501) yanıtı gerçek servis hatası gibi gösterilmez. Production'da bu dal hiç çalışmaz.
    if (call.status === 501 && isLocalFakeProvider(deps.config)) {
      return { ok: false, status: 502, code: "LOCAL_FIXTURE_MISSING", error: "Bu danışan ve teknik için yerel test verisi bulunmuyor. Gerçek hesaplama yapılmadı.", providerAttempts: call.attempts };
    }
    const e = PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error;
    return { ok: false, ...e, providerAttempts: call.attempts };
  }

  const proj = def.project(unit, call.raw, selection.options);
  if (!proj.ok) {
    log("[astro] provider schema mismatch", { ...tag, errors: proj.errors.slice(0, 10) });
    // ATL-P2-03 (2026-10-20): KP'de bilinen servis tutarsızlığı (bölünmüş alt bölüm numarası) — sonuç yine gösterilmez/kaydedilmez,
    // ancak kullanıcı genel "beklenmeyen yanıt" yerine nedeni ve ne yapacağını görür.
    const kpSplit = proj.errors.some((e) => e.includes(KP_SPLIT_SUB_PROVIDER_ERROR));
    const error = kpSplit
      ? "Seçilen an veya aralıkta bir gezegen burç sınırında ikiye bölünen KP alt bölümünde; hesaplama servisi bu bölümün KP numarasını tutarsız bildirdiği için sonuç gösterilmedi ve kaydedilmedi. Birkaç saat farklı bir an veya farklı bir aralık seçin."
      : "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç kaydedilmedi.";
    return { ok: false, status: 502, code: "PROVIDER_INVALID_RESPONSE", error, providerAttempts: call.attempts };
  }
  if (proj.unmappedFields.length > 0 || proj.droppedValues.length > 0) {
    log("[astro] provider fields not mapped", { ...tag, unmapped: proj.unmappedFields.slice(0, 20), dropped: proj.droppedValues.slice(0, 20) });
    await touchUnmappedFields(ctx.db, unit.provider, unit.endpoint, [...proj.unmappedFields, ...proj.droppedValues.map((d) => `dropped:${d}`)]);
  }

  const id = resultIdFor(ctx.tenantId, unit.inputHash, ctx.userId);
  const partner = selection.partnerRevision;
  // GA-P2-05 (2026-10-20): sağlayıcı yanıtı ÜCRETLİ alındı — geçici DB/ağ hatasında yazım en çok 2 kez yeniden denenir
  // (kimlik deterministik + UNIQUE: ilk deneme aslında yazıldıysa 23505 → yeniden okunur). Deterministik hata denenmez.
  const writeResult = () => insertResult(ctx.db, ctx.tenantId, ctx.userId, {
    id,
    profileId: revision.profile_id,
    profileRevision: revision.revision,
    partnerProfileId: partner?.profile_id ?? null,
    partnerProfileRevision: partner?.revision ?? null,
    technique: unit.technique,
    provider: unit.provider,
    providerApiVersion: unit.providerApiVersion,
    adapterVersion: unit.adapterVersion,
    endpoint: unit.endpoint,
    input: unit.query ? { ...unit.body, lang: unit.lang, query: unit.query } : { ...unit.body, lang: unit.lang },
    inputHash: unit.inputHash,
    raw: call.raw,
    technical: proj.technical,
    technicalSchema: proj.technicalSchema,
    projectionVersion: proj.projectionVersion,
    unmappedFields: [...proj.unmappedFields, ...proj.droppedValues.map((d) => `dropped:${d}`)],
  });
  let ins = await writeResult();
  for (let attempt = 1; ins.error && isRetryableDbError(ins.error) && attempt <= DB_WRITE_RETRIES; attempt++) {
    log("[astro] result write retry", { ...tag, attempt, code: ins.error.code ?? "unknown" });
    await sleep(DB_WRITE_RETRY_MS * attempt);
    ins = await writeResult();
  }
  if (ins.error) {
    if (isUniqueViolation(ins.error)) {
      const again = await reload();
      if (again) return { ok: true, row: again, reused: true, providerAttempts: call.attempts };
    }
    if (isSchemaMissing(ins.error)) {
      return { ok: false, status: 503, code: "ASTRO_NOT_READY", error: "Astroloji veri yapısı bu ortamda henüz hazır değil.", providerAttempts: call.attempts };
    }
    logAstroDbError("engine.insertResult", ins.error);
    return { ok: false, status: 500, code: "DB_INSERT_FAILED", error: "Hesap sonucu kaydedilemedi.", providerAttempts: call.attempts };
  }

  // GA-P2-05: sonuç önbelleğe yazıldı → yorum burada yazılamazsa bir daha üretilmez (sonraki çalıştırmalar önbellekten gelir).
  // Geçici hatada yorum yazımı da yeniden denenir; 23505 = zaten yazılmış (başarı).
  const writeInterp = () => insertInterpretation(ctx.db, ctx.tenantId, ctx.userId, id, unit.provider, unit.lang, proj.interpretationSchema, proj.projectionVersion, proj.interpretation);
  let interpIns = await writeInterp();
  for (let attempt = 1; interpIns.error && !isUniqueViolation(interpIns.error) && isRetryableDbError(interpIns.error) && attempt <= DB_WRITE_RETRIES; attempt++) {
    log("[astro] interpretation write retry", { ...tag, attempt, code: interpIns.error.code ?? "unknown" });
    await sleep(DB_WRITE_RETRY_MS * attempt);
    interpIns = await writeInterp();
  }
  if (interpIns.error && !isUniqueViolation(interpIns.error)) logAstroDbError("engine.insertInterpretation", interpIns.error);

  const row: ResultRow = {
    id,
    profile_id: revision.profile_id,
    profile_revision: revision.revision,
    partner_profile_id: partner?.profile_id ?? null,
    partner_profile_revision: partner?.revision ?? null,
    technique: unit.technique,
    provider: unit.provider,
    provider_api_version: unit.providerApiVersion,
    adapter_version: unit.adapterVersion,
    endpoint: unit.endpoint,
    input_hash: unit.inputHash,
    technical: proj.technical as Record<string, unknown>,
    technical_schema: proj.technicalSchema,
    projection_version: proj.projectionVersion,
    unmapped_fields: proj.unmappedFields,
    created_at: new Date().toISOString(),
  };
  return { ok: true, row, reused: false, providerAttempts: call.attempts };
}

/** Bir seçimin (1..n parça) satırlarından görünüm. Yorum tablosu YALNIZ görünür olacaksa okunur. */
export async function buildSelectionView(
  ctx: EngineCtx,
  technique: TechniqueId,
  rows: ResultRow[],
  options: Record<string, unknown>,
  timeKnowledge: { primary: boolean; partner: boolean | null },
  ownerPreviewHideInterp: boolean,
  missingParts = 0,
  /** YALNIZ-ÖNBELLEK bağlam satırları (contextUnits sırasıyla; bulunamayan null). */
  contextRows: (ResultRow | null)[] = [],
): Promise<TechniqueView> {
  const def = getTechnique(technique)!;
  const visibility = resolveInterpretationVisibility(ctx.entitlements, ownerPreviewHideInterp);
  let interps: ({ provider: string; lang: string; content: Record<string, unknown> } | null)[] | null = null;
  // Zorunlu birimli tekniklerde (relocation) sağlayıcı yorumu YALNIZ o birimden (natal karşılaştırma
  // biriminin yorumu bu tekniğin yorumu değildir).
  const interpRows = def.primaryPart !== undefined ? rows.filter((r) => r.technique === def.id).slice(0, 1) : rows;
  if (visibility.visible) {
    interps = [];
    for (const r of interpRows) {
      const it = await getInterpretation(ctx.db, ctx.tenantId, ctx.userId, r.id, r.projection_version);
      if (it.error) logAstroDbError("view.interpretation", it.error);
      interps.push(it.row);
    }
  }
  const base = def.combineTechnical ? def.combineTechnical(rows.map((r) => r.technical), options) : rows[0].technical;
  const combined = def.attachContext ? def.attachContext(base, contextRows.map((r) => r?.technical ?? null), options) : base;
  return buildTechniqueView({ technique, rows, combined, options, timeKnowledge, visibility, interpretations: interps, missingParts, combineInterpretation: def.combineInterpretation });
}

/** Geriye dönük uyum: tek satırlık sonuç görünümü (natal vb.). */
export async function buildResultView(
  ctx: EngineCtx,
  row: ResultRow,
  revision: Pick<RevisionRow, "time_known">,
  ownerPreviewHideInterp: boolean,
  partnerTimeKnown: boolean | null = null,
): Promise<TechniqueView> {
  const technique = (getTechnique(row.technique)?.id ?? "western.natal") as TechniqueId;
  return buildSelectionView(ctx, technique, [row], {}, { primary: revision.time_known === true, partner: partnerTimeKnown }, ownerPreviewHideInterp);
}

/**
 * GET result — kayıtlı sonucu görüntüle (sağlayıcı ÇAĞRILMAZ). Saat-bilinmiyor maskesi, isteyen
 * profil revizyonuna göre uygulanır (verilmezse sonucu üreten revizyon). Karşı taraf varsa onun da.
 */
export async function getAstrologyResult(
  ctx: EngineCtx,
  resultId: string,
  q: { profileId: string | null; revision: string | null; ownerPreviewHideInterp: boolean },
): Promise<ServiceResponse> {
  if (!isUuid(resultId)) return fail(404, "RESULT_NOT_FOUND", "Hesap sonucu bulunamadı.");
  const r = await getResultById(ctx.db, ctx.tenantId, ctx.userId, resultId);
  if (r.error) {
    if (isSchemaMissing(r.error)) return ASTRO_NOT_READY;
    logAstroDbError("result.get", r.error);
    return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
  }
  if (!r.row) return fail(404, "RESULT_NOT_FOUND", "Hesap sonucu bulunamadı.");

  let profileId = r.row.profile_id;
  let revNo = r.row.profile_revision;
  if (q.profileId !== null || q.revision !== null) {
    const n = Number(q.revision);
    if (!isUuid(q.profileId) || !Number.isInteger(n) || n < 1) return fail(400, "INVALID_REVISION", "Geçersiz profil/revizyon.");
    profileId = q.profileId;
    revNo = n;
  }
  const rv = await getRevision(ctx.db, ctx.tenantId, ctx.userId, profileId, revNo);
  if (rv.error) {
    logAstroDbError("result.revision", rv.error);
    return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
  }
  if (!rv.row) return fail(404, "REVISION_NOT_FOUND", "Doğum profili revizyonu bulunamadı.");
  let partnerTimeKnown: boolean | null = null;
  if (r.row.partner_profile_id && r.row.partner_profile_revision) {
    const pr = await getRevision(ctx.db, ctx.tenantId, ctx.userId, r.row.partner_profile_id, r.row.partner_profile_revision);
    partnerTimeKnown = pr.row ? pr.row.time_known : false;
  }
  const view = await buildResultView(ctx, r.row, rv.row, q.ownerPreviewHideInterp, partnerTimeKnown);
  return { status: 200, body: { ok: true, revision: publicRevision(rv.row), view } };
}

/** POST run — plan + eksik birimleri çalıştır + görünümler (kısmi başarı). */
export async function runAstrology(
  ctx: EngineCtx,
  rawBody: unknown,
  deps: EngineDeps,
  opts: { ownerPreviewHideInterp: boolean },
): Promise<ServiceResponse> {
  if (!ctx.entitlements.engine) return fail(403, "ENGINE_NOT_ENTITLED", "Hesap Motoru yetkisi yok.");
  const now = deps.now ? deps.now() : new Date();
  const l = await loadAndPlan(ctx, rawBody, now);
  if (!l.ok) return l.r;
  const { plan, selections, revision, cachedRows } = l.v;

  if (plan.requiresConfirmation) {
    const confirm = (rawBody as Record<string, unknown>).confirmNewRequests;
    if (confirm !== plan.newRequestCount) {
      return fail(409, "CONFIRMATION_REQUIRED", `Bu işlem ${plan.newRequestCount} yeni sağlayıcı isteği oluşturacak. Onaylayarak tekrar gönderin.`, {
        plan: publicPlanSummary(plan, selections),
      });
    }
  }

  const outcomes = new Map<string, UnitOutcome>();
  let providerAttempts = 0;
  // 9A-P2-02: çalıştırma süre bütçesi — yeni sağlayıcı çağrısı ancak en kötü süresiyle bütçeye sığıyorsa başlatılır.
  const clock = deps.clock ?? (() => Date.now());
  const startedAt = clock();
  for (const unit of plan.units) {
    if (unit.cached) {
      outcomes.set(unit.inputHash, { ok: true, row: cachedRows.get(unit.inputHash)!, reused: true, providerAttempts: 0 });
      continue;
    }
    if (clock() - startedAt + ASTRO_ROXY_WORST_CALL_MS + ASTRO_UNIT_DB_MARGIN_MS > ASTRO_RUN_BUDGET_MS) {
      outcomes.set(unit.inputHash, {
        ok: false,
        status: 503,
        code: "RUN_TIME_BUDGET",
        error: "Süre sınırı nedeniyle bu hesap başlatılmadı (tamamlananlar kaydedildi). Tekrar çalıştırın; kayıtlı sonuçlar yeniden hesaplanmaz.",
        providerAttempts: 0,
        retryAfterSec: 1,
      });
      continue;
    }
    const o = await executeUnit(ctx, deps, unit, selections[unit.selectionIndexes[0]], revision);
    providerAttempts += o.providerAttempts;
    outcomes.set(unit.inputHash, o);
  }

  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < selections.length; i++) {
    const s = selections[i];
    const block = plan.blocks[i];
    if (block) {
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: block.code, error: block.error });
      continue;
    }
    const hashes = plan.selectionUnits[i];
    const outs = hashes.map((h) => outcomes.get(h)!);
    const okRows = outs.filter((o): o is Extract<UnitOutcome, { ok: true }> => o.ok).map((o) => o.row);
    const primaryDef = getTechnique(s.technique);
    const primaryFailed = primaryDef?.primaryPart !== undefined && !outs[primaryDef.primaryPart]?.ok;
    if (okRows.length === 0 || primaryFailed) {
      const f = (primaryFailed ? outs[primaryDef!.primaryPart!] : outs.find((o) => !o.ok)) as Extract<UnitOutcome, { ok: false }> | undefined;
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: f?.code ?? "FAILED", error: f?.error ?? "Hesaplanamadı.", retryAfterSec: f?.retryAfterSec });
      continue;
    }
    // Bağlam: önbellek ya da AYNI çalıştırmada yeni hesaplanan birim (ör. natal + transit birlikte seçildiyse).
    const contextRows = (l.v.contextHashes[i] ?? []).map((h) => {
      const o = outcomes.get(h);
      return cachedRows.get(h) ?? (o && o.ok ? o.row : null);
    });
    const view = await buildSelectionView(
      ctx,
      s.technique,
      okRows,
      s.options,
      { primary: revision.time_known === true, partner: s.partnerRevision ? s.partnerRevision.time_known === true : null },
      opts.ownerPreviewHideInterp,
      outs.length - okRows.length,
      contextRows,
    );
    results.push({ selectionIndex: i, technique: s.technique, ok: true, partial: okRows.length < outs.length, reused: outs.every((o) => o.ok && o.reused), view });
  }

  const executedNew = [...outcomes.values()].filter((o) => o.ok && !o.reused).length;
  const fromCache = [...outcomes.values()].filter((o) => o.ok && o.reused).length;
  const anyOk = results.some((r) => r.ok === true);
  const firstFailure = [...outcomes.values()].find((o): o is Extract<UnitOutcome, { ok: false }> => !o.ok);
  const firstBlock = plan.blocks.find(Boolean) ?? null;
  const status = anyOk ? 200 : firstFailure?.status ?? (firstBlock ? 422 : 500);

  return {
    status,
    body: {
      ok: anyOk,
      ...(anyOk ? {} : firstFailure ? { code: firstFailure.code, error: firstFailure.error } : firstBlock ? { code: firstBlock.code, error: firstBlock.error } : {}),
      plan: publicPlanSummary(plan, selections),
      executed: { newResults: executedNew, cachedResults: fromCache, providerAttempts },
      revision: publicRevision(revision),
      results,
    },
  };
}

/**
 * POST view — YALNIZ ÖNBELLEKTEN görünüm (sağlayıcı bağımlılığı ALMAZ → yapısal olarak 0 istek).
 * Önizleme anahtarı değişince / sayfa yeniden açılınca seçimlerin kayıtlı sonuçlarını göstermek için.
 * Hiç parçası kayıtlı olmayan seçim → NOT_COMPUTED; eksik parça → missingParts ile kısmi görünüm.
 */
export async function viewCachedSelections(ctx: EngineCtx, rawBody: unknown, opts: { ownerPreviewHideInterp: boolean }): Promise<ServiceResponse> {
  const l = await loadAndPlan(ctx, rawBody, new Date());
  if (!l.ok) return l.r;
  const { plan, selections, revision, cachedRows } = l.v;
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < selections.length; i++) {
    const s = selections[i];
    const block = plan.blocks[i];
    if (block) {
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: block.code, error: block.error });
      continue;
    }
    const hashes = plan.selectionUnits[i];
    const rows = hashes.map((h) => cachedRows.get(h)).filter((r): r is ResultRow => !!r);
    const pdef = getTechnique(s.technique);
    const primaryMissing = pdef?.primaryPart !== undefined && !cachedRows.has(hashes[pdef.primaryPart]);
    if (rows.length === 0 || primaryMissing) {
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: "NOT_COMPUTED", error: "Bu seçim için kayıtlı sonuç yok." });
      continue;
    }
    const view = await buildSelectionView(
      ctx,
      s.technique,
      rows,
      s.options,
      { primary: revision.time_known === true, partner: s.partnerRevision ? s.partnerRevision.time_known === true : null },
      opts.ownerPreviewHideInterp,
      hashes.length - rows.length,
      (l.v.contextHashes[i] ?? []).map((h) => cachedRows.get(h) ?? null),
    );
    results.push({ selectionIndex: i, technique: s.technique, ok: true, partial: rows.length < hashes.length, reused: true, view });
  }
  return { status: 200, body: { ok: true, revision: publicRevision(revision), results } };
}
