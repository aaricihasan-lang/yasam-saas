// HD — RoxyAPI otomatik hesaplama ORKESTRASYONU (server-only).
//
// Akış (sıra, maliyet ve güvenlik için bilinçli):
//   1) demo hesap → RED (ücretli çağrı yok)
//   2) gövde doğrulama (yalnız client_id + location_id kabul edilir)
//   3) danışan TENANT doğrulaması (withTenant) — başka tenant'ın danışanı → 404
//   4) doğum tarihi + KESİN doğum saati zorunlu (danışan kaydından; istemciden alınmaz)
//   5) konum kimliği → IANA tz + enlem/boylam (sunucuda, lib/location)
//   6) DST boşluk/çakışma → anlaşılır doğrulama hatası (tahmin YOK)
//   7) idempotency anahtarı (tenant+danışan+girdi+politika+sürüm) → deterministik satır id
//   8) aynı girdi daha önce hesaplandıysa KAYITLI sonuç döner — Roxy ÇAĞRILMAZ
//   9) yapılandırma (ROXY_API_KEY) yoksa 503 — manuel HD etkilenmez
//  10) eşzamanlı aynı girdi kilidi (çift tık/retry/çoklu instance) → bekle/kayıtlıyı döndür
//  11) kullanıcı + tenant rate limit (yalnız gerçek çağrılar)
//  12) Roxy çağrısı → runtime şema doğrulama → normalizasyon → iç tutarlılık
//  13) TEK INSERT (yarım/bozuk sonuç yazılmaz); eşzamanlı ikinci INSERT PK ile reddedilir (23505)

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { deterministicUuid, isUniqueViolation, isUuid } from "./deterministicId";
import { hdSafeDbError } from "./safeError";
import { isValidIanaTimeZone, resolveBirthLocalTime, toHms } from "./birthTimeResolution";
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
    | { ok: false; code: string; error: string; retryAfterSec?: number };
};

const fail = (status: number, code: string, error: string, extra: { retryAfterSec?: number } = {}): RoxyServiceResponse => ({
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
  if (typeof rawLoc === "string" && rawLoc.startsWith("chart:")) {
    const r = await locationFromPreviousChart(ctx, clientId, rawLoc.slice("chart:".length));
    if ("error" in r) return r.error;
    location = r.location;
  } else {
    location = resolveHdBirthLocation(rawLoc);
  }
  if (!location) {
    return fail(422, "LOCATION_REQUIRED", "Doğum yeri listeden seçilmelidir. Saat dilimi bilinmeden hesaplama yapılmaz.");
  }

  // 6) DST — sessiz tahmin yok.
  const t = resolveBirthLocalTime(date, hms, location.timezone);
  if (t.kind === "gap") {
    return fail(
      422,
      "BIRTH_TIME_NONEXISTENT",
      `${date} ${hms.slice(0, 5)} saati ${location.timezone} saat diliminde yaz saati geçişi nedeniyle hiç yaşanmamıştır. Lütfen doğum saatini kontrol edin.`,
    );
  }
  if (t.kind === "ambiguous") {
    return fail(
      422,
      "BIRTH_TIME_AMBIGUOUS",
      `${date} ${hms.slice(0, 5)} saati ${location.timezone} saat diliminde yaz saatinden kışa geçişte iki kez yaşanmıştır; hangi anın kastedildiği belirsiz olduğundan otomatik hesap yapılmadı.`,
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
  const inputHash = roxyInputHash(identity);
  const id = roxyChartIdFor(ctx.tenantId, inputHash);

  // 8) Kayıtlı sonuç → Roxy ÇAĞRILMAZ.
  const existing = await findExisting(ctx.db, ctx.tenantId, id);
  if (existing.error) return existing.error;
  if (existing.found) return { status: 200, body: { ok: true, id, reused: true } };

  // 9) Yapılandırma.
  if (!deps.config) {
    return fail(503, "AUTO_CALC_NOT_CONFIGURED", "Otomatik hesaplama şu anda yapılandırılmamış. Manuel harita kaydını kullanabilirsiniz.");
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
