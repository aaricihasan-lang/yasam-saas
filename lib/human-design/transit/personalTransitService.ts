// Human Design KİŞİSEL TRANSİT — sunucu servisi (service_role + ZORUNLU tenant filtresi). Yeni tablo / migration YOK.
//
//   • Kaynak: bu tenant'ın HD danışanı + o danışanın KAYITLI, doğrulanmış Roxy BodyGraph analizi (doğum verisi istemciden
//     ALINMAZ). Doğum bilgisi analizden sonra değişmişse, analiz otomatik değilse veya eksikse → hesap YAPILMAZ.
//   • Transit anı Türkiye saatiyle seçilir; sunucuda UTC'ye çevrilir. Roxy'ye natal doğum anı + UTC transit anı gider.
//   • Roxy yanıtı şemaya, yerel doğrulanmış motora (aynı anın 13 aktivasyonu) ve natal kapılardan bağımsız türetilen
//     beklenen kanal / merkez kümesine göre denetlenir; uyuşmazsa GÖSTERİLMEZ.
//   • Ücretli çağrı koruması: aynı danışan analizi + aynı dakika → sunucu önbelleği (Roxy ÇAĞRILMAZ); eşzamanlı aynı
//     istek kilidi; BodyGraph / İlişki ile ORTAK kullanıcı + tenant kotası. Önbellek süreç belleğindedir (kalıcı değil).
//   • Kayıtlı bireysel analiz DEĞİŞMEZ; hiçbir tabloya yazılmaz (kota sayaçları hariç).

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "../api/tenantScope";
import { isUuid } from "../api/deterministicId";
import { hdSafeDbError } from "../api/safeError";
import { ROXY_POLICY, ROXY_PROVIDER_ID, ROXY_RATE_LIMITS, type RoxyPolicy, type RoxyServerConfig } from "../providers/roxy/config";
import type { RoxyCallResult } from "../providers/roxy/client";
import { ROXY_TRANSIT_ADAPTER_VERSION, type RoxyTransitRequest } from "./roxyTransitClient";
import { chartBirthMoment, chartMatchesClient, participantChartFacts } from "../relations/relationService";
import { TransitVerificationError, type ResolvedTransit } from "./resolveTransit";
import { buildPersonalTransitView, checkTransitConsistency, validateRoxyTransit, type PersonalTransitView } from "./personalTransit";
import { resolveTransitMoment, TRANSIT_TIME_ZONE, type TransitMoment } from "./transitMoment";
import { PLANET_LABEL_TR } from "../bodygraph/planetGlyphs";

export type PersonalTransitCtx = { db: SupabaseClient; tenantId: string; userId: string; isDemo: boolean };
export type PersonalTransitDeps = {
  /**
   * Aynı anın DOĞRULANMIŞ genel transiti (yerel motor + gerektiğinde bağımsız denetimli Roxy gezegen konumları).
   * Roxy HD Transit yanıtı bununla karşılaştırılır — eski yerel motorun hassasiyet hatası yüzünden doğru sonuç reddedilmez.
   */
  resolveTransit: (utc: Date) => Promise<ResolvedTransit>;
  config: RoxyServerConfig | null;
  callTransit: (config: RoxyServerConfig, body: RoxyTransitRequest, opts: { lang: string; timeoutMs: number }) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  sleep?: (ms: number) => Promise<void>;
  policy?: RoxyPolicy;
  log?: (msg: string, detail?: unknown) => void;
  now?: () => number;
};

export type PersonalTransitBody =
  | { ok: true; reused: boolean; moment: TransitMoment; client: { id: string; name: string }; chart: { id: string; createdAt: string | null }; view: PersonalTransitView }
  | { ok: false; code: string; error: string; retryAfterSec?: number; offsets?: number[] };
export type PersonalTransitResponse = { status: number; body: PersonalTransitBody };

const fail = (status: number, code: string, error: string, retryAfterSec?: number): PersonalTransitResponse => ({
  status,
  body: { ok: false, code, error, ...(retryAfterSec ? { retryAfterSec } : {}) },
});

const PROVIDER_ERRORS: Record<string, PersonalTransitResponse> = {
  timeout: fail(504, "PROVIDER_TIMEOUT", "Hesaplama servisi zamanında yanıt vermedi. Lütfen birazdan tekrar deneyin."),
  network: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisine şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin."),
  unauthorized: fail(502, "PROVIDER_CONFIG", "Hesaplama servisi yapılandırma hatası. Lütfen yöneticiye bildirin."),
  rate_limited: fail(503, "PROVIDER_BUSY", "Hesaplama servisi şu anda yoğun. Lütfen birkaç dakika sonra tekrar deneyin."),
  bad_request: fail(422, "PROVIDER_REJECTED", "Hesaplama servisi bu doğum / transit bilgisini kabul etmedi. Bilgileri kontrol edin."),
  server_error: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisinde geçici bir hata oluştu. Lütfen birazdan tekrar deneyin."),
  malformed_json: fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden geçersiz yanıt alındı. Sonuç gösterilmedi."),
};

// ── Süreç içi önbellek (aynı analiz + aynı dakika → ücretli çağrı yok) ──────────
export const PERSONAL_TRANSIT_CACHE = { ttlMs: 24 * 60 * 60 * 1000, maxEntries: 500 } as const;
type CacheEntry = { at: number; view: PersonalTransitView };
const cache = new Map<string, CacheEntry>();
function cacheGet(key: string, now: number): PersonalTransitView | null {
  const e = cache.get(key);
  if (!e) return null;
  if (now - e.at > PERSONAL_TRANSIT_CACHE.ttlMs) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, e); // LRU: en sona taşı
  return e.view;
}
function cacheSet(key: string, view: PersonalTransitView, now: number) {
  cache.set(key, { at: now, view });
  while (cache.size > PERSONAL_TRANSIT_CACHE.maxEntries) cache.delete(cache.keys().next().value as string);
}
/** Aynı süreçte eşzamanlı aynı istek tek ücretli çağrıyı paylaşır. */
const pending = new Map<string, Promise<PersonalTransitResponse>>();
/** Sağlayıcı hatasından hemen sonra yeniden deneme, bitmemiş DB kilidine takılmasın (kota yine uygulanır). */
const RECENT_FAILURE_MS = 30_000;
const recentFailures = new Map<string, number>();
/** Yalnız testler için. */
export function __resetPersonalTransitCache() {
  cache.clear();
  pending.clear();
  recentFailures.clear();
}

type ClientRow = { id: string; name: string; birth_date: string | null; birth_time: string | null };
type ChartRow = { id: string; client_id: string | null; source: string | null; provider: string | null; input: unknown; input_hash: string | null; computed_result: unknown; created_at: string | null };

export async function computePersonalTransit(ctx: PersonalTransitCtx, raw: unknown, deps: PersonalTransitDeps): Promise<PersonalTransitResponse> {
  const policy = deps.policy ?? ROXY_POLICY;
  const log = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  if (ctx.isDemo) return fail(403, "DEMO_READONLY", "Demo hesabında kişisel transit hesaplanamaz.");
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  const b = raw as Record<string, unknown>;
  const clientId = typeof b.client_id === "string" ? b.client_id.trim().toLowerCase() : "";
  const chartId = typeof b.chart_id === "string" ? b.chart_id.trim().toLowerCase() : "";
  if (!isUuid(clientId) || !isUuid(chartId)) return fail(400, "INVALID_ID", "Geçersiz danışan veya analiz.");
  // Saat dilimi: verilmezse Türkiye (eski istemciler birebir). Sunucuda IANA doğrulaması; istemci ofseti yalnız iki kez
  // yaşanan saatte ve geçerli iki ofsetten biriyse kabul edilir.
  const tz = typeof b.tz === "string" && b.tz.trim() ? b.tz.trim() : TRANSIT_TIME_ZONE;
  if (b.offset !== undefined && b.offset !== null && (typeof b.offset !== "number" || !Number.isInteger(b.offset))) return fail(400, "INVALID_OFFSET", "Geçersiz UTC ofseti.");
  const m = resolveTransitMoment(typeof b.date === "string" ? b.date.trim() : "", typeof b.time === "string" ? b.time.trim() : "", tz, (b.offset as number | null | undefined) ?? null);
  if (!m.ok) return m.offsetsSeconds ? { status: 400, body: { ok: false, code: m.code, error: m.error, offsets: m.offsetsSeconds } } : fail(400, m.code, m.error);

  // 1) Danışan + kayıtlı analiz (YALNIZ bu tenant)
  const { data: cRow, error: cErr } = await withTenant(ctx.db.from("human_design_clients").select("id, name, birth_date, birth_time"), ctx.tenantId, "transit.client").eq("id", clientId).maybeSingle();
  if (cErr) return fail(500, "DB_ERROR", hdSafeDbError("transit.client", cErr));
  if (!cRow) return fail(404, "CLIENT_NOT_FOUND", "Danışan bulunamadı.");
  const client = cRow as ClientRow;
  const { data: hRow, error: hErr } = await withTenant(
    ctx.db.from("human_design_charts").select("id, client_id, source, provider, input, input_hash, computed_result, created_at"),
    ctx.tenantId,
    "transit.chart",
  ).eq("id", chartId).maybeSingle();
  if (hErr) return fail(500, "DB_ERROR", hdSafeDbError("transit.chart", hErr));
  const chart = hRow as ChartRow | null;
  if (!chart || (chart.client_id ?? "").toLowerCase() !== clientId) return fail(404, "CHART_NOT_FOUND", "Seçilen Human Design analizi bulunamadı veya bu danışana ait değil.");
  if (chart.source !== "computed" || chart.provider !== ROXY_PROVIDER_ID) return fail(422, "CHART_NOT_ELIGIBLE", "Kişisel transit için otomatik hesaplanmış BodyGraph analizi gereklidir.");
  const birth = chartBirthMoment(chart.input);
  const facts = participantChartFacts(chart.computed_result);
  if (!birth || !facts) return fail(422, "CHART_INCOMPLETE", "Kayıtlı analizin doğum / hesap bilgisi eksik. Önce bireysel analizi yeniden oluşturun.");
  if (!chartMatchesClient(birth, client)) return fail(409, "BIRTH_DATA_CHANGED", "Danışanın doğum bilgisi bu analiz hazırlandıktan sonra değişmiş. Önce güncel bilgilerle bireysel analizi oluşturun.");
  if (birth.nodeType !== policy.nodeType) return fail(422, "CHART_POLICY_MISMATCH", "Analiz farklı bir ay düğümü ayarıyla hazırlanmış. Güncel ayarla bireysel analizi yeniden oluşturun.");

  // 2) Transit anı
  const moment = m.moment;
  const utc = new Date(moment.utcIso);
  const key = createHash("sha256")
    .update([ROXY_TRANSIT_ADAPTER_VERSION, policy.nodeType, ctx.tenantId, chart.id, chart.input_hash ?? "", moment.utcIso].join("|"))
    .digest("hex");
  const ok = (view: PersonalTransitView, reused: boolean): PersonalTransitResponse => ({
    status: 200,
    body: { ok: true, reused, moment, client: { id: client.id, name: client.name }, chart: { id: chart.id, createdAt: chart.created_at }, view },
  });
  const hit = cacheGet(key, now());
  if (hit) return ok(hit, true);

  if (!deps.config) return fail(503, "AUTO_CALC_NOT_CONFIGURED", "Kişisel transit hesaplaması şu anda yapılandırılmamış.");
  const config = deps.config;

  // 2b) Doğrulanmış referans transit — TAM değilse ücretli HD çağrısı YAPILMADAN kontrollü hata (doğrulanamayan sonuç gösterilmez).
  let reference: ResolvedTransit;
  try {
    reference = await deps.resolveTransit(utc);
  } catch (e) {
    if (e instanceof TransitVerificationError) {
      log("[hd-transit] reference verification failed", { utc: moment.utcIso, details: e.details });
      return fail(502, "TRANSIT_UNVERIFIED", "Bu an için gezegen konumları bağımsız olarak doğrulanamadı; sonuç gösterilmedi.");
    }
    throw e;
  }
  if (reference.transit.hasUncertainty) {
    // Kalıcı astronomik belirsizlik (hassas konumla bile çizgi sınırı ölçüm payının içinde): yeniden deneme sonucu DEĞİŞTİRMEZ.
    // Ayrı, ekleyici kod; tekrar deneme önerilmez (gereksiz ücretli tekrar teşvik edilmez). Ücretli HD çağrısı YAPILMAZ.
    if (reference.resolution === "roxy-partial") {
      const bodies = reference.transit.activations.filter((a) => !a.certain).map((a) => PLANET_LABEL_TR[a.body]);
      return fail(
        422,
        "TRANSIT_REFERENCE_UNCERTAIN",
        `Bu anda ${bodies.join(", ")} konumu çizgi sınırına hesaplama hassasiyetinden daha yakın; bu an için kesin kişisel transit üretilemez. Yeniden denemek sonucu değiştirmez — bir dakika önceki veya sonraki anı seçin.`,
      );
    }
    // Geçici: hassas doğrulama kaynağına ulaşılamadı (yapılandırma / kota / ağ) — sonra yeniden denenebilir.
    return fail(503, "TRANSIT_REFERENCE_INCOMPLETE", "Bu an için doğrulama kaynağına şu anda ulaşılamadı; doğrulanamayan sonuç gösterilmez. Birkaç dakika sonra tekrar deneyin.");
  }
  const local = reference.transit;

  const inProcess = pending.get(key);
  if (inProcess) {
    const shared = await inProcess;
    return shared.body.ok ? ok(shared.body.view, true) : shared;
  }
  const run = callAndValidate();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }

  async function callAndValidate(): Promise<PersonalTransitResponse> {
  // 3) Eşzamanlı aynı istek kilidi (çoklu sunucu örneği). Az önce bu süreçte başarısız olan anahtar kilide takılmaz.
  const failedAt = recentFailures.get(key);
  const retryAfterFailure = failedAt !== undefined && now() - failedAt < RECENT_FAILURE_MS;
  const claim = retryAfterFailure
    ? { allowed: true, retryAfterSec: 0 }
    : await deps.rateLimit("hd-roxy-transit-inflight", key, ROXY_RATE_LIMITS.inFlight.limit, ROXY_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) {
    for (let i = 0; i < 8; i++) {
      await sleep(1500);
      const again = cacheGet(key, now());
      if (again) return ok(again, true);
    }
    return fail(409, "IN_PROGRESS", "Bu transit şu anda hesaplanıyor. Birkaç saniye sonra tekrar deneyin.", claim.retryAfterSec || 10);
  }
  // 4) Ortak ücretli çağrı kotası (BodyGraph / İlişki ile aynı sayaçlar)
  const userRl = await deps.rateLimit("hd-roxy-user", ctx.userId, ROXY_RATE_LIMITS.perUser.limit, ROXY_RATE_LIMITS.perUser.windowSeconds);
  if (!userRl.allowed) return fail(429, "RATE_LIMITED", "Kısa sürede çok fazla otomatik hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", userRl.retryAfterSec);
  const tenantRl = await deps.rateLimit("hd-roxy-tenant", ctx.tenantId, ROXY_RATE_LIMITS.perTenant.limit, ROXY_RATE_LIMITS.perTenant.windowSeconds);
  if (!tenantRl.allowed) return fail(429, "RATE_LIMITED", "Hesabınızın günlük otomatik hesaplama sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.", tenantRl.retryAfterSec);

  // 5) Roxy → şema → yerel motor + bağımsız beklenen sonuç
  const sent = { date: moment.utcIso.slice(0, 10), time: moment.utcIso.slice(11, 19) };
  const failed = (r: PersonalTransitResponse) => {
    recentFailures.set(key, now());
    return r;
  };
  const call = await deps.callTransit(config, { birthData: birth!, date: sent.date, time: sent.time }, { lang: policy.lang, timeoutMs: policy.timeoutMs });
  if (!call.ok) {
    log("[hd-transit] call failed", { kind: call.kind, status: call.status });
    return failed(PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error);
  }
  const v = validateRoxyTransit(call.raw, sent);
  if (!v.ok) {
    log("[hd-transit] schema mismatch", { errors: v.errors.slice(0, 10) });
    return failed(fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç gösterilmedi."));
  }
  const rep = checkTransitConsistency(v.value, local, facts!.gates);
  if (rep.errors.length) {
    // Teşhis kaydı: yalnız cisim / kapı.çizgi / sınır mesafesi ve UTC an (doğum verisi, anahtar, kişi adı YOK). Önbelleğe ALINMAZ.
    log("[hd-transit] consistency mismatch", { utc: moment.utcIso, mismatches: rep.mismatches, errors: rep.errors.slice(0, 10) });
    return failed(fail(502, "PROVIDER_INCONSISTENT", "Hesaplama servisinin sonucu bağımsız doğrulamayla uyuşmadı. Doğrulanamayan sonuç gösterilmedi."));
  }
  const view = buildPersonalTransitView(v.value, facts!.gates, local);
  recentFailures.delete(key);
  cacheSet(key, view, now());
  return ok(view, false);
  }
}
