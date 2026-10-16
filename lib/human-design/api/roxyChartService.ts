// HD — RoxyAPI otomatik hesaplama ORKESTRASYONU (server-only).
//
// Akış (sıra, maliyet ve güvenlik için bilinçli):
//   1) demo hesap → RED (ücretli çağrı yok)
//   2) gövde doğrulama (yalnız client_id + location_id [+ acknowledged_duplicate_keys] kabul edilir)
//   3) danışan TENANT doğrulaması (withTenant) — başka tenant'ın danışanı → 404
//   4) doğum tarihi + KESİN doğum saati zorunlu (danışan kaydından; istemciden alınmaz)
//   5) konum kimliği → IANA tz + enlem/boylam (sunucuda, lib/location)
//   6) DST boşluk/çakışma → anlaşılır doğrulama hatası (tahmin YOK)
//   7) idempotency anahtarı (tenant+danışan+girdi+politika+sürüm) → deterministik satır id
//   8) aynı girdi daha önce hesaplandıysa KAYITLI sonuç döner — Roxy ÇAĞRILMAZ
//  8b) başka HD profilinde aynı kişi + aynı girdi → 409 POSSIBLE_DUPLICATE_CHART (bilinçli onay ister;
//      kontrol hatası → 503, ücretli çağrı YOK)
//  10a) profilden bağımsız kişi+girdi kilidi (farklı profillerde eşzamanlı aynı kişi → tek ücretli çağrı)
//   9) yapılandırma (ROXY_API_KEY) yoksa 503 — manuel HD etkilenmez
//  10) eşzamanlı aynı girdi kilidi (çift tık/retry/çoklu instance) → bekle/kayıtlıyı döndür
//  11) kullanıcı + tenant rate limit (yalnız gerçek çağrılar)
//  12) Roxy çağrısı → runtime şema doğrulama → normalizasyon → iç tutarlılık
//  13) TEK INSERT (yarım/bozuk sonuç yazılmaz); eşzamanlı ikinci INSERT PK ile reddedilir (23505)

import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { deterministicUuid, isUniqueViolation, isUuid } from "./deterministicId";
import { hdSafeDbError } from "./safeError";
import { birthLocalTimeIssue, isValidIanaTimeZone, resolveBirthLocalTime, toHms } from "./birthTimeResolution";
import { resolveHdBirthLocation, type HdBirthLocation } from "./hdBirthLocation";
import {
  ROXY_ADAPTER_VERSION,
  ROXY_BODYGRAPH_ENDPOINT,
  ROXY_POLICY,
  ROXY_PROVIDER_ID,
  ROXY_RATE_LIMITS,
  type RoxyPolicy,
  type RoxyServerConfig,
} from "../providers/roxy/config";
import type { RoxyBodygraphRequest, RoxyCallResult } from "../providers/roxy/client";
import { validateRoxyBodygraph } from "../providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../providers/roxy/normalize";
import { checkDesignInstantConsistency } from "../providers/roxy/timeConsistency";
import { findCrossProfileRoxyDuplicates } from "./hdDuplicates";
import { hdDuplicatesAcknowledged, normalizeHdPersonName, readHdAckKeys, type HdDuplicateCandidate } from "./hdIdentity";

const TABLE = "human_design_charts";
export const ROXY_CONTRACT_VERSION = "roxy-1";
export const ROXY_ENGINE_VERSION = `${ROXY_PROVIDER_ID}:${ROXY_ADAPTER_VERSION}`;

export type RoxyServiceDeps = {
  config: RoxyServerConfig | null;
  callRoxy: (config: RoxyServerConfig, body: RoxyBodygraphRequest, opts: { lang: string; timeoutMs: number }) => Promise<RoxyCallResult>;
  /** hitDbRateLimit sarmalayıcısı (bucket ham değer değil; çağıran HMAC'ler). */
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  sleep?: (ms: number) => Promise<void>;
  policy?: RoxyPolicy;
  log?: (msg: string, detail?: unknown) => void;
  /** GUV-07: harita kimliği/hash anahtarı (test enjeksiyonu). Verilmezse env'den okunur. */
  chartIdSecret?: string | null;
};

export type RoxyServiceCtx = {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  isDemo: boolean;
};

export type RoxyServiceResponse = {
  status: number;
  body:
    | { ok: true; id: string; reused: boolean }
    | { ok: false; code: string; error: string; retryAfterSec?: number; candidates?: HdDuplicateCandidate[] };
};

const fail = (status: number, code: string, error: string, extra: { retryAfterSec?: number; candidates?: HdDuplicateCandidate[] } = {}): RoxyServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});

/** PostgREST/Postgres "kolon yok" → migration henüz uygulanmamış. */
function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(err.message ?? "");
}

const MIGRATION_PENDING = fail(
  503,
  "AUTO_CALC_UNAVAILABLE",
  "Otomatik hesaplama henüz etkin değil. Manuel harita kaydını kullanmaya devam edebilirsiniz.",
);

export type RoxyInputIdentity = {
  tenantId: string;
  clientId: string;
  date: string;
  time: string; // HH:mm:ss
  timezone: string;
  latitude: number;
  longitude: number;
  nodeType: string;
  lang: string;
};

/** Idempotency anahtarı: girdi + sağlayıcı politikası + adaptör sürümü (sabit sıralı). */
export function roxyInputHash(i: RoxyInputIdentity): string {
  const canonical = JSON.stringify([
    ROXY_PROVIDER_ID,
    ROXY_BODYGRAPH_ENDPOINT,
    ROXY_ADAPTER_VERSION,
    i.tenantId,
    i.clientId,
    i.date,
    i.time,
    i.timezone,
    i.latitude.toFixed(6),
    i.longitude.toFixed(6),
    i.nodeType,
    i.lang,
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function roxyChartIdFor(tenantId: string, inputHash: string): string {
  return deterministicUuid("roxy-chart", tenantId, inputHash);
}

/**
 * HD-28 (GUV-07): ANAHTARLI girdi hash'i. Tuzsuz SHA-256 + deterministik id, kimlik sızarsa doğum
 * verisinin çevrimdışı tahmin edilip doğrulanmasına izin veriyordu. Yeni kayıtlar sunucu sırrıyla
 * (HMAC, alan ayrımlı) türetilir; id/hash tek başına doğum verisi hakkında bilgi vermez.
 * Eski (tuzsuz) kayıtlar SİLİNMEZ/DEĞİŞMEZ ve yeniden kullanılmaya devam eder (findEquivalentChart).
 */
export function roxyKeyedInputHash(i: RoxyInputIdentity, secret: string): string {
  return createHmac("sha256", `hd-chart-id:v1:${secret}`).update(roxyInputHash(i), "utf8").digest("hex");
}

export function roxyKeyedChartIdFor(tenantId: string, keyedHash: string): string {
  return deterministicUuid("roxy-chart-k1", tenantId, keyedHash);
}

/** Anahtar: özel HD_CHART_ID_SECRET, yoksa sunucu service_role anahtarı (yalnız server env). */
export function readChartIdSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = (env.HD_CHART_ID_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return s ? s : null;
}

type ClientRow = { id: string; name: string; birth_date: string | null; birth_time: string | null };

async function findExisting(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ found: boolean; error: RoxyServiceResponse | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("id, provider, input_hash"), tenantId, "roxy.findExisting")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return { found: false, error: MIGRATION_PENDING };
    return { found: false, error: fail(500, "DB_ERROR", hdSafeDbError("roxy.findExisting", error)) };
  }
  return { found: !!data, error: null };
}

/**
 * Aynı danışan + AYNI hesap girdisiyle (tarih, saat, tz, koordinat, düğüm, dil, adaptör sürümü)
 * daha önce kaydedilmiş Roxy haritası var mı? Hash'ten BAĞIMSIZ (kayıtlı girdi alanları) →
 * eski tuzsuz-kimlikli kayıtlar ve ileride sır değişse bile yeniden kullanılır; mükerrer ücretli
 * çağrı yapılmaz.
 */
async function findEquivalentChart(
  db: SupabaseClient,
  tenantId: string,
  i: RoxyInputIdentity,
): Promise<{ id: string | null; error: RoxyServiceResponse | null }> {
  const { data, error } = await withTenant(
    db.from(TABLE).select("id, input, engine_version, created_at"),
    tenantId,
    "roxy.findEquivalent",
  )
    .eq("client_id", i.clientId)
    .eq("provider", ROXY_PROVIDER_ID)
    .eq("birth_date", i.date)
    .eq("birth_time", i.time)
    .eq("timezone", i.timezone)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    if (isMissingColumn(error)) return { id: null, error: MIGRATION_PENDING };
    return { id: null, error: fail(500, "DB_ERROR", hdSafeDbError("roxy.findEquivalent", error)) };
  }
  const same = (a: unknown, b: number) => typeof a === "number" && a.toFixed(6) === b.toFixed(6);
  for (const r of (data ?? []) as { id: string; input: Record<string, unknown> | null; engine_version: string | null }[]) {
    const inp = r.input ?? {};
    if (
      r.engine_version === ROXY_ENGINE_VERSION &&
      same(inp.latitude, i.latitude) &&
      same(inp.longitude, i.longitude) &&
      inp.nodeType === i.nodeType &&
      inp.lang === i.lang
    ) {
      return { id: r.id, error: null };
    }
  }
  return { id: null, error: null };
}

/** Danışanda kalıcı, SUNUCUNUN çözüp yazdığı yapılandırılmış doğum yeri (tenant-scoped). */
async function locationFromClient(ctx: RoxyServiceCtx, clientId: string): Promise<HdBirthLocation | null> {
  const { data, error } = await withTenant(
    ctx.db.from("human_design_clients").select("id, birth_location_id, birth_location_label, birth_timezone, birth_latitude, birth_longitude"),
    ctx.tenantId,
    "roxy.clientLocation",
  )
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) return null; // migration yoksa / kayıt yoksa → konum seçimi istenir (422)
  const r = data as { birth_location_id: string | null; birth_location_label: string | null; birth_timezone: string | null; birth_latitude: number | null; birth_longitude: number | null };
  if (!r.birth_location_id || !r.birth_timezone || !isValidIanaTimeZone(r.birth_timezone)) return null;
  if (typeof r.birth_latitude !== "number" || typeof r.birth_longitude !== "number") return null;
  return { id: r.birth_location_id, label: r.birth_location_label ?? r.birth_location_id, timezone: r.birth_timezone, latitude: r.birth_latitude, longitude: r.birth_longitude };
}

/** Aynı tenant + AYNI danışanın Roxy kaydındaki doğum yeri (tz/koordinat sunucuda saklanmıştı). */
async function locationFromPreviousChart(
  ctx: RoxyServiceCtx,
  clientId: string,
  chartId: string,
): Promise<{ location: HdBirthLocation | null } | { error: RoxyServiceResponse }> {
  if (!isUuid(chartId)) return { location: null };
  const { data, error } = await withTenant(
    ctx.db.from(TABLE).select("id, client_id, provider, location_id, birth_place, timezone, input"),
    ctx.tenantId,
    "roxy.prevLocation",
  )
    .eq("id", chartId)
    .eq("client_id", clientId)
    .eq("provider", ROXY_PROVIDER_ID)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return { error: MIGRATION_PENDING };
    return { error: fail(500, "DB_ERROR", hdSafeDbError("roxy.prevLocation", error)) };
  }
  const row = data as { location_id: string | null; birth_place: string | null; timezone: string | null; input: { latitude?: unknown; longitude?: unknown } | null } | null;
  const lat = row?.input?.latitude;
  const lon = row?.input?.longitude;
  if (!row || !row.timezone || !isValidIanaTimeZone(row.timezone) || typeof lat !== "number" || typeof lon !== "number") {
    return { location: null };
  }
  return {
    location: {
      id: row.location_id ?? `chart-${chartId.slice(0, 8)}`,
      label: row.birth_place ?? row.timezone,
      timezone: row.timezone,
      latitude: lat,
      longitude: lon,
    },
  };
}

const PROVIDER_ERRORS: Record<string, RoxyServiceResponse> = {
  timeout: fail(504, "PROVIDER_TIMEOUT", "Hesaplama servisi zamanında yanıt vermedi. Lütfen birazdan tekrar deneyin."),
  network: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisine şu anda ulaşılamıyor. Manuel harita kaydı kullanılabilir."),
  unauthorized: fail(502, "PROVIDER_CONFIG", "Hesaplama servisi yapılandırma hatası. Lütfen yöneticiye bildirin."),
  rate_limited: fail(503, "PROVIDER_BUSY", "Hesaplama servisi şu anda yoğun. Lütfen birkaç dakika sonra tekrar deneyin."),
  bad_request: fail(422, "PROVIDER_REJECTED", "Hesaplama servisi bu doğum bilgisini kabul etmedi. Doğum tarihi, saati ve yerini kontrol edin."),
  server_error: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisinde geçici bir hata oluştu. Lütfen birazdan tekrar deneyin."),
  malformed_json: fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden geçersiz yanıt alındı. Sonuç kaydedilmedi."),
};

export async function computeRoxyChart(
  ctx: RoxyServiceCtx,
  rawBody: unknown,
  deps: RoxyServiceDeps,
): Promise<RoxyServiceResponse> {
  const policy = deps.policy ?? ROXY_POLICY;
  const log = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // 1) Demo/vitrin hesap ücretli hesap yapamaz.
  if (ctx.isDemo) {
    return fail(403, "DEMO_READONLY", "Demo hesabında otomatik hesaplama yapılamaz.");
  }

  // 2) Gövde — yalnız kimlikler; doğum verisi/tz/koordinat istemciden ALINMAZ.
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  }
  const body = rawBody as Record<string, unknown>;
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  if (!isUuid(clientId)) return fail(400, "INVALID_CLIENT", "Geçerli bir danışan seçilmedi.");

  // 3) Danışan tenant'a ait mi? (service_role → RLS backstop değil; withTenant zorunlu)
  const { data: cli, error: cErr } = await withTenant(
    ctx.db.from("human_design_clients").select("id, name, birth_date, birth_time"),
    ctx.tenantId,
    "roxy.client",
  )
    .eq("id", clientId)
    .maybeSingle();
  if (cErr) return fail(500, "DB_ERROR", hdSafeDbError("roxy.client", cErr));
  const client = cli as ClientRow | null;
  if (!client) return fail(404, "CLIENT_NOT_FOUND", "Danışan bulunamadı veya bu hesaba ait değil.");

  // 4) Doğum tarihi + kesin saat (danışan kaydından).
  const date = (client.birth_date ?? "").slice(0, 10);
  const hms = client.birth_time ? toHms(client.birth_time) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !hms) {
    return fail(
      422,
      "MISSING_BIRTH_DATA",
      "Otomatik hesaplama için danışanın doğum tarihi ve kesin doğum saati kayıtlı olmalıdır. Önce danışan bilgilerini güncelleyip kaydedin.",
    );
  }
  const year = Number(date.slice(0, 4));
  if (year < 1800 || year > 2100) return fail(422, "BIRTH_DATE_RANGE", "Doğum tarihi 1800–2100 aralığında olmalıdır.");

  // 5) Konum → IANA tz + koordinat (sunucuda). "chart:<id>" = aynı danışanın önceki Roxy
  //    hesabındaki konum (sunucunun daha önce çözüp sakladığı değer; istemci verisi değil).
  const rawLoc = body.location_id;
  let location: HdBirthLocation | null;
  if (rawLoc === "client") {
    location = await locationFromClient(ctx, clientId);
  } else if (typeof rawLoc === "string" && rawLoc.startsWith("chart:")) {
    const r = await locationFromPreviousChart(ctx, clientId, rawLoc.slice("chart:".length));
    if ("error" in r) return r.error;
    location = r.location;
  } else {
    location = resolveHdBirthLocation(rawLoc);
  }
  if (!location) {
    return fail(422, "LOCATION_REQUIRED", "Doğum yeri listeden seçilmelidir. Saat dilimi bilinmeden hesaplama yapılmaz.");
  }

  // 6) DST — sessiz tahmin yok (HD-14 owner kararı: boşluk ve çakışma güvenli ret).
  const t = resolveBirthLocalTime(date, hms, location.timezone);
  if (t.kind === "gap" || t.kind === "ambiguous") {
    const issue = birthLocalTimeIssue(date, hms, location.timezone);
    return fail(
      422,
      t.kind === "gap" ? "BIRTH_TIME_NONEXISTENT" : "BIRTH_TIME_AMBIGUOUS",
      issue?.message ?? "Doğum saati yaz/kış saati geçişine denk geliyor; otomatik hesap yapılmadı.",
    );
  }
  if (t.kind === "invalid") return fail(422, "INVALID_BIRTH_DATA", "Doğum tarihi/saati geçersiz.");

  // 7) Idempotency.
  const identity: RoxyInputIdentity = {
    tenantId: ctx.tenantId,
    clientId,
    date,
    time: hms,
    timezone: location.timezone,
    latitude: location.latitude,
    longitude: location.longitude,
    nodeType: policy.nodeType,
    lang: policy.lang,
  };
  // GUV-07: yeni kayıtların kimliği/hash'i sunucu sırrıyla anahtarlanır (sır yoksa eski biçim).
  const idSecret = deps.chartIdSecret !== undefined ? deps.chartIdSecret : readChartIdSecret();
  const inputHash = idSecret ? roxyKeyedInputHash(identity, idSecret) : roxyInputHash(identity);
  const id = idSecret ? roxyKeyedChartIdFor(ctx.tenantId, inputHash) : roxyChartIdFor(ctx.tenantId, inputHash);

  // 8) Kayıtlı sonuç → Roxy ÇAĞRILMAZ (önce kimlikle, sonra kayıtlı girdi alanlarıyla).
  const existing = await findExisting(ctx.db, ctx.tenantId, id);
  if (existing.error) return existing.error;
  if (existing.found) return { status: 200, body: { ok: true, id, reused: true } };
  const equivalent = await findEquivalentChart(ctx.db, ctx.tenantId, identity);
  if (equivalent.error) return equivalent.error;
  if (equivalent.id) return { status: 200, body: { ok: true, id: equivalent.id, reused: true } };

  // 8b) ÜCRETLİ çağrıdan ÖNCE sunucu kontrolü: aynı tenant'ta BAŞKA HD profili altında aynı kişi +
  //     birebir aynı hesap girdisi. Otomatik bağlama/yeniden kullanım YOK → kullanıcıya sorulur.
  //     Onay YALNIZ gösterilen analizleri kapsar (yeni çıkan aday tekrar sorulur); aynı profil
  //     idempotency'si (adım 8) ve kilit/limitler (10–11) onaydan bağımsız çalışmaya devam eder.
  //     Kontrol HATASI "mükerrer yok" sayılmaz → ücretli çağrı yapılmaz (fail-closed).
  const dup = await findCrossProfileRoxyDuplicates(
    ctx.db,
    ctx.tenantId,
    { clientId, name: client.name, date, time: hms, timezone: location.timezone, latitude: location.latitude, longitude: location.longitude, nodeType: policy.nodeType, lang: policy.lang },
    ROXY_PROVIDER_ID,
  );
  if (dup.error) {
    log("[hd-roxy] mükerrer kontrolü başarısız; ücretli çağrı yapılmadı", dup.error);
    return fail(503, "DUPLICATE_CHECK_FAILED", "Önceki analizler kontrol edilemedi; ücretli hesaplama yapılmadı. Lütfen birkaç saniye sonra tekrar deneyin.");
  }
  const ack = readHdAckKeys(body.acknowledged_duplicate_keys);
  if (!hdDuplicatesAcknowledged(dup.candidates, ack)) {
    return fail(
      409,
      "POSSIBLE_DUPLICATE_CHART",
      "Bu bilgilerle daha önce hazırlanmış bir Human Design analizi bulundu. Yeni hesaplama yapmak Roxy API hakkınızı kullanabilir. Önce mevcut analizi inceleyebilirsiniz.",
      { candidates: dup.candidates },
    );
  }

  // 9) Yapılandırma.
  if (!deps.config) {
    return fail(503, "AUTO_CALC_NOT_CONFIGURED", "Otomatik hesaplama şu anda yapılandırılmamış. Manuel harita kaydını kullanabilirsiniz.");
  }

  // 10a) Profilden BAĞIMSIZ kişi + girdi kilidi (profil kilidinden ÖNCE: uyarı alan istek profil
  //      kilidini almadan döner → hemen ardından gelen bilinçli onaylı istek bekletilmez): iki FARKLI HD profilinde aynı kişi (normalize ad) +
  //      birebir aynı hesap girdisiyle EŞZAMANLI istek → yalnız biri ücretli çağrıya gider. Kilidi
  //      alamayan istek bekler ve oluşan analizi aday olarak yeniden değerlendirir: onaylanmamış aday →
  //      409 uyarı; gösterilen adayların hepsi bilinçli onaylı (farklı kişi) → devam; belirsiz → IN_PROGRESS.
  //      Anahtar tenant'ı içerir (kiracılar karışmaz); otomatik birleştirme/sahiplenme YOK.
  const identityKey = JSON.stringify([
    ctx.tenantId,
    normalizeHdPersonName(client.name),
    date,
    hms,
    location.timezone,
    location.latitude.toFixed(6),
    location.longitude.toFixed(6),
    policy.nodeType,
    policy.lang,
  ]);
  const idClaim = await deps.rateLimit("hd-roxy-identity-inflight", identityKey, ROXY_RATE_LIMITS.inFlight.limit, ROXY_RATE_LIMITS.inFlight.windowSeconds);
  if (!idClaim.allowed) {
    let cleared = false;
    for (let i = 0; i < 9 && !cleared; i++) {
      if (i > 0) await sleep(1500);
      const own = await findExisting(ctx.db, ctx.tenantId, id);
      if (own.error) return own.error;
      if (own.found) return { status: 200, body: { ok: true, id, reused: true } };
      const again = await findCrossProfileRoxyDuplicates(
        ctx.db,
        ctx.tenantId,
        { clientId, name: client.name, date, time: hms, timezone: location.timezone, latitude: location.latitude, longitude: location.longitude, nodeType: policy.nodeType, lang: policy.lang },
        ROXY_PROVIDER_ID,
      );
      if (again.error) {
        log("[hd-roxy] eşzamanlı mükerrer kontrolü başarısız; ücretli çağrı yapılmadı", again.error);
        return fail(503, "DUPLICATE_CHECK_FAILED", "Önceki analizler kontrol edilemedi; ücretli hesaplama yapılmadı. Lütfen birkaç saniye sonra tekrar deneyin.");
      }
      if (again.candidates.length > 0) {
        if (!hdDuplicatesAcknowledged(again.candidates, ack)) {
          return fail(
            409,
            "POSSIBLE_DUPLICATE_CHART",
            "Bu bilgilerle daha önce hazırlanmış bir Human Design analizi bulundu. Yeni hesaplama yapmak Roxy API hakkınızı kullanabilir. Önce mevcut analizi inceleyebilirsiniz.",
            { candidates: again.candidates },
          );
        }
        cleared = true; // gösterilen tüm adaylar bilinçli "farklı kişi" onaylı
      }
    }
    if (!cleared) {
      return fail(409, "IN_PROGRESS", "Aynı kişi için bir hesaplama şu anda sürüyor. Birkaç saniye sonra tekrar deneyin.", {
        retryAfterSec: idClaim.retryAfterSec || 10,
      });
    }
  }

  // 10) Aynı girdi için eşzamanlı çağrı kilidi.
  const claim = await deps.rateLimit("hd-roxy-inflight", inputHash, ROXY_RATE_LIMITS.inFlight.limit, ROXY_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) {
    for (let i = 0; i < 8; i++) {
      await sleep(1500);
      const again = await findExisting(ctx.db, ctx.tenantId, id);
      if (again.error) return again.error;
      if (again.found) return { status: 200, body: { ok: true, id, reused: true } };
    }
    return fail(409, "IN_PROGRESS", "Bu hesaplama şu anda sürüyor. Birkaç saniye sonra tekrar deneyin.", {
      retryAfterSec: claim.retryAfterSec || 10,
    });
  }

  // 11) Ücretli çağrı limitleri.
  const userRl = await deps.rateLimit("hd-roxy-user", ctx.userId, ROXY_RATE_LIMITS.perUser.limit, ROXY_RATE_LIMITS.perUser.windowSeconds);
  if (!userRl.allowed) {
    return fail(429, "RATE_LIMITED", "Kısa sürede çok fazla otomatik hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", {
      retryAfterSec: userRl.retryAfterSec,
    });
  }
  const tenantRl = await deps.rateLimit("hd-roxy-tenant", ctx.tenantId, ROXY_RATE_LIMITS.perTenant.limit, ROXY_RATE_LIMITS.perTenant.windowSeconds);
  if (!tenantRl.allowed) {
    return fail(429, "RATE_LIMITED", "Hesabınızın günlük otomatik hesaplama sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.", {
      retryAfterSec: tenantRl.retryAfterSec,
    });
  }

  // 12) Roxy → doğrulama → normalizasyon.
  const request: RoxyBodygraphRequest = {
    date,
    time: hms,
    timezone: location.timezone,
    latitude: location.latitude,
    longitude: location.longitude,
    nodeType: policy.nodeType,
  };
  const call = await deps.callRoxy(deps.config, request, { lang: policy.lang, timeoutMs: policy.timeoutMs });
  if (!call.ok) {
    log("[hd-roxy] provider call failed", { kind: call.kind, status: call.status });
    return PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error;
  }
  const v = validateRoxyBodygraph(call.raw);
  if (!v.ok) {
    log("[hd-roxy] schema mismatch", { errors: v.errors.slice(0, 10) });
    return fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç kaydedilmedi.");
  }
  const n = normalizeRoxyBodygraph(v.value, {
    date,
    time: hms,
    timezone: location.timezone,
    latitude: location.latitude,
    longitude: location.longitude,
    nodeType: policy.nodeType,
    lang: policy.lang,
    birthUtcIso: t.utcIso,
  });
  if (!n.ok) {
    log("[hd-roxy] normalization failed", { errors: n.errors.slice(0, 10) });
    return fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama sonucu doğrulanamadı (tutarsız veri). Sonuç kaydedilmedi.");
  }

  // 12b) HD-15 — Roxy'nin kullandığı doğum anı ↔ sunucunun çözdüğü an (Design anı üzerinden,
  //      bağımsız efemerisle). Anlamlı uyuşmazlıkta yanlış harita KAYDEDİLMEZ. Kendi hesabımız
  //      yapılamazsa (unverifiable) kayıt engellenmez, yalnız loglanır. Doğum verisi loglanmaz.
  const tc = checkDesignInstantConsistency(t.utcIso, v.value.designInstantUtc);
  if (tc.status === "mismatch") {
    log("[hd-roxy] birth instant mismatch", { deltaMinutes: tc.deltaMinutes });
    return fail(
      502,
      "PROVIDER_TIME_MISMATCH",
      "Hesaplama servisinin kullandığı doğum anı, doğum yeri ve saat dilimine göre beklenen anla uyuşmuyor. Yanlış sonuç kaydedilmedi; lütfen yöneticiye bildirin.",
    );
  }
  if (tc.status === "unverifiable") log("[hd-roxy] birth instant unverifiable", { reason: tc.reason });

  // 13) Tek INSERT — tam sonuç ya da hiç.
  const payload = tenantInsertPayload(ctx.tenantId, {
    id,
    user_id: ctx.userId,
    client_id: clientId,
    client_name: client.name,
    source: "computed",
    provider: ROXY_PROVIDER_ID,
    birth_date: date,
    birth_time: hms,
    birth_place: location.label,
    timezone: location.timezone,
    location_id: location.id,
    input: {
      date,
      time: hms,
      timezone: location.timezone,
      latitude: location.latitude,
      longitude: location.longitude,
      nodeType: policy.nodeType,
      lang: policy.lang,
    },
    computed_result: n.chart,
    provider_raw: call.raw,
    input_hash: inputHash,
    engine_version: ROXY_ENGINE_VERSION,
    contract_version: ROXY_CONTRACT_VERSION,
    type_code: n.codes.type_code,
    authority_code: n.codes.authority_code,
    profile_code: n.codes.profile_code,
    definition_code: n.codes.definition_code,
    active_centers: n.codes.active_centers,
    open_centers: n.codes.open_centers,
    gates: n.codes.gates,
    channels: n.codes.channels,
  });
  const { error: insErr } = await ctx.db.from(TABLE).insert(payload).select("id").single();
  if (insErr) {
    if (isUniqueViolation(insErr)) return { status: 200, body: { ok: true, id, reused: true } };
    if (isMissingColumn(insErr)) return MIGRATION_PENDING;
    return fail(500, "DB_INSERT_FAILED", hdSafeDbError("roxy.insert", insErr));
  }
  return { status: 200, body: { ok: true, id, reused: false } };
}
