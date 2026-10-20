// Human Design Variables (Dört Ok / PHS) — SUNUCU servisi (service_role + ZORUNLU tenant filtresi). Yeni tablo / migration YOK.
//
//   • Kaynak: bu tenant'ın KAYITLI, otomatik (Roxy) bireysel analizi. Doğum verisi istemciden ALINMAZ; analizin sunucuda
//     doğrulanmış girdisi (chart.input) kullanılır ve Roxy'ye natal BodyGraph çağrısıyla BİREBİR aynı alanlar gider.
//   • Doğum anı sunucunun IANA çözücüsüyle yeniden çözülür; hiç yaşanmamış / iki kez yaşanmış yerel saat REDDEDİLİR
//     (Roxy bunları sessizce ileri kaydırır / ilk geçişi seçer — sözleşme metni).
//   • Bağlı danışanın doğum bilgisi analizden sonra değiştiyse hesap YAPILMAZ (409).
//   • Yanıt: sözleşme + yapısal tutarlılık (variablesContract) + mühürlü yerel motorla bağımsız Color/Tone bant denetimi
//     (localVariablesCheck). Herhangi bir ihlal → gösterilmez, önbelleğe girmez (fail-closed).
//   • Ücretli çağrı koruması: süreç içi önbellek (kalıcı DEĞİL — çoklu örnek / yeniden başlatmada yeniden hesap olabilir),
//     süreç içi istek birleştirme, DB eşzamanlılık kilidi, BodyGraph / İlişki ile ORTAK kullanıcı + tenant kotası.
//   • Hiçbir tabloya yazılmaz (kota sayaçları hariç); kayıtlı natal analiz DEĞİŞMEZ.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "../api/tenantScope";
import { isUuid } from "../api/deterministicId";
import { hdSafeDbError } from "../api/safeError";
import { resolveBirthLocalTime } from "../api/birthTimeResolution";
import { ROXY_POLICY, ROXY_PROVIDER_ID, ROXY_RATE_LIMITS, type RoxyPolicy, type RoxyServerConfig } from "../providers/roxy/config";
import type { RoxyCallResult } from "../providers/roxy/client";
import { chartBirthMoment, chartMatchesClient } from "../relations/relationService";
import { ROXY_VARIABLES_ADAPTER_VERSION, type RoxyVariablesRequest } from "./roxyVariablesClient";
import { validateRoxyVariables, type VariablesDto } from "./variablesContract";
import { crossCheckVariables, localVariableBands, type LocalArrowBand } from "./localVariablesCheck";

export type VariablesCtx = { db: SupabaseClient; tenantId: string; userId: string; isDemo: boolean };
export type VariablesDeps = {
  config: RoxyServerConfig | null;
  callVariables: (config: RoxyServerConfig, body: RoxyVariablesRequest, opts: { lang: string; timeoutMs: number }) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  /** Bağımsız yerel bant hesabı (varsayılan: mühürlü motor). Testlerde enjekte edilebilir. */
  localBands?: (birthUtc: Date) => LocalArrowBand[];
  sleep?: (ms: number) => Promise<void>;
  policy?: RoxyPolicy;
  log?: (msg: string, detail?: unknown) => void;
  now?: () => number;
};

export type VariablesBody =
  | { ok: true; reused: boolean; chart: { id: string }; data: VariablesDto }
  | { ok: false; code: string; error: string; retryAfterSec?: number };
export type VariablesResponse = { status: number; body: VariablesBody };

const fail = (status: number, code: string, error: string, retryAfterSec?: number): VariablesResponse => ({
  status,
  body: { ok: false, code, error, ...(retryAfterSec ? { retryAfterSec } : {}) },
});

const PROVIDER_ERRORS: Record<string, VariablesResponse> = {
  timeout: fail(504, "PROVIDER_TIMEOUT", "Hesaplama servisi zamanında yanıt vermedi. Lütfen birazdan tekrar deneyin."),
  network: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisine şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin."),
  unauthorized: fail(502, "PROVIDER_CONFIG", "Hesaplama servisi yapılandırma hatası. Lütfen yöneticiye bildirin."),
  rate_limited: fail(503, "PROVIDER_BUSY", "Hesaplama servisi şu anda yoğun. Lütfen birkaç dakika sonra tekrar deneyin."),
  bad_request: fail(422, "PROVIDER_REJECTED", "Hesaplama servisi bu doğum bilgisini kabul etmedi. Kayıtlı analizi kontrol edin."),
  server_error: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisinde geçici bir hata oluştu. Lütfen birazdan tekrar deneyin."),
  malformed_json: fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden geçersiz yanıt alındı. Sonuç gösterilmedi."),
};

// ── Süreç içi önbellek (aynı analiz + aynı doğum anı → ücretli çağrı yok). KALICI DEĞİL. ──
export const VARIABLES_CACHE = { ttlMs: 30 * 24 * 60 * 60 * 1000, maxEntries: 500 } as const;
const cache = new Map<string, { at: number; data: VariablesDto }>();
const pending = new Map<string, Promise<VariablesResponse>>();
const recentFailures = new Map<string, number>();
const RECENT_FAILURE_MS = 30_000;
export function __resetVariablesCache() {
  cache.clear();
  pending.clear();
  recentFailures.clear();
}
function cacheGet(key: string, now: number): VariablesDto | null {
  const e = cache.get(key);
  if (!e) return null;
  if (now - e.at > VARIABLES_CACHE.ttlMs) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, e);
  return e.data;
}
function cacheSet(key: string, data: VariablesDto, now: number) {
  cache.set(key, { at: now, data });
  while (cache.size > VARIABLES_CACHE.maxEntries) cache.delete(cache.keys().next().value as string);
}

type ChartRow = { id: string; client_id: string | null; source: string | null; provider: string | null; input: unknown; input_hash: string | null };

export async function computeChartVariables(ctx: VariablesCtx, raw: unknown, deps: VariablesDeps): Promise<VariablesResponse> {
  const policy = deps.policy ?? ROXY_POLICY;
  const log = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  if (ctx.isDemo) return fail(403, "DEMO_READONLY", "Demo hesabında Dört Ok analizi hesaplanamaz.");
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  const chartId = typeof (raw as Record<string, unknown>).chart_id === "string" ? ((raw as Record<string, unknown>).chart_id as string).trim().toLowerCase() : "";
  if (!isUuid(chartId)) return fail(400, "INVALID_ID", "Geçersiz analiz kimliği.");

  // 1) Kayıtlı analiz (YALNIZ bu tenant; başka tenant = bulunamadı, varlık sızmaz)
  const { data: hRow, error: hErr } = await withTenant(
    ctx.db.from("human_design_charts").select("id, client_id, source, provider, input, input_hash"),
    ctx.tenantId,
    "variables.chart",
  ).eq("id", chartId).maybeSingle();
  if (hErr) return fail(500, "DB_ERROR", hdSafeDbError("variables.chart", hErr));
  const chart = hRow as ChartRow | null;
  if (!chart) return fail(404, "CHART_NOT_FOUND", "Human Design analizi bulunamadı.");
  if (chart.source !== "computed" || chart.provider !== ROXY_PROVIDER_ID) return fail(422, "CHART_NOT_ELIGIBLE", "Dört Ok analizi için otomatik hesaplanmış BodyGraph analizi gereklidir.");
  const birth = chartBirthMoment(chart.input);
  if (!birth) return fail(422, "CHART_INCOMPLETE", "Kayıtlı analizin doğum bilgisi eksik. Önce bireysel analizi yeniden oluşturun.");
  if (birth.nodeType !== policy.nodeType) return fail(422, "CHART_POLICY_MISMATCH", "Analiz farklı bir ay düğümü ayarıyla hazırlanmış. Güncel ayarla bireysel analizi yeniden oluşturun.");

  // 2) Bağlı danışanın GÜNCEL doğum bilgisi analizle aynı mı (eski veriden sessiz hesap yok)
  if (chart.client_id) {
    const { data: cRow, error: cErr } = await withTenant(ctx.db.from("human_design_clients").select("id, birth_date, birth_time"), ctx.tenantId, "variables.client")
      .eq("id", chart.client_id)
      .maybeSingle();
    if (cErr) return fail(500, "DB_ERROR", hdSafeDbError("variables.client", cErr));
    if (cRow && !chartMatchesClient(birth, cRow as { birth_date: string | null; birth_time: string | null })) {
      return fail(409, "BIRTH_DATA_CHANGED", "Danışanın doğum bilgisi bu analiz hazırlandıktan sonra değişmiş. Önce güncel bilgilerle bireysel analizi oluşturun.");
    }
  }

  // 3) Doğum anı (sunucu IANA çözümü) — belirsiz an REDDEDİLİR
  const r = resolveBirthLocalTime(birth.date, birth.time, birth.timezone);
  if (r.kind === "gap") return fail(422, "BIRTH_TIME_GAP", "Kayıtlı doğum saati o saat diliminde yaz saati geçişi nedeniyle hiç yaşanmamış görünüyor; Dört Ok hesaplanmadı.");
  if (r.kind === "ambiguous") return fail(422, "BIRTH_TIME_AMBIGUOUS", "Kayıtlı doğum saati o gün iki kez yaşanmış (yaz saati geçişi); hangi anın kastedildiği kesin olmadığından Dört Ok hesaplanmadı.");
  if (r.kind !== "ok") return fail(422, "CHART_INCOMPLETE", "Kayıtlı analizin doğum anı çözülemedi.");
  const birthUtc = new Date(r.utcIso);

  const key = createHash("sha256")
    .update([ROXY_VARIABLES_ADAPTER_VERSION, policy.nodeType, policy.lang, ctx.tenantId, chart.id, chart.input_hash ?? "", r.utcIso].join("|"))
    .digest("hex");
  const ok = (data: VariablesDto, reused: boolean): VariablesResponse => ({ status: 200, body: { ok: true, reused, chart: { id: chart.id }, data } });
  const hit = cacheGet(key, now());
  if (hit) return ok(hit, true);
  if (!deps.config) return fail(503, "NOT_CONFIGURED", "Dört Ok hesaplaması şu anda yapılandırılmamış.");
  const config = deps.config;

  const inProcess = pending.get(key);
  if (inProcess) {
    const shared = await inProcess;
    return shared.body.ok ? ok(shared.body.data, true) : shared;
  }
  const run = callAndValidate();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }

  async function callAndValidate(): Promise<VariablesResponse> {
    // 4) Eşzamanlı aynı istek kilidi (çoklu sunucu örneği). Az önce bu süreçte başarısız olan anahtar kilide takılmaz.
    const failedAt = recentFailures.get(key);
    const claim = failedAt !== undefined && now() - failedAt < RECENT_FAILURE_MS
      ? { allowed: true, retryAfterSec: 0 }
      : await deps.rateLimit("hd-roxy-variables-inflight", key, ROXY_RATE_LIMITS.inFlight.limit, ROXY_RATE_LIMITS.inFlight.windowSeconds);
    if (!claim.allowed) {
      for (let i = 0; i < 8; i++) {
        await sleep(1500);
        const again = cacheGet(key, now());
        if (again) return ok(again, true);
      }
      return fail(409, "IN_PROGRESS", "Bu analiz şu anda hesaplanıyor. Birkaç saniye sonra tekrar deneyin.", claim.retryAfterSec || 10);
    }
    // 5) Ortak ücretli çağrı kotası (BodyGraph / İlişki ile aynı sayaçlar)
    const userRl = await deps.rateLimit("hd-roxy-user", ctx.userId, ROXY_RATE_LIMITS.perUser.limit, ROXY_RATE_LIMITS.perUser.windowSeconds);
    if (!userRl.allowed) return fail(429, "RATE_LIMITED", "Kısa sürede çok fazla otomatik hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", userRl.retryAfterSec);
    const tenantRl = await deps.rateLimit("hd-roxy-tenant", ctx.tenantId, ROXY_RATE_LIMITS.perTenant.limit, ROXY_RATE_LIMITS.perTenant.windowSeconds);
    if (!tenantRl.allowed) return fail(429, "RATE_LIMITED", "Hesabınızın günlük otomatik hesaplama sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.", tenantRl.retryAfterSec);

    const failed = (x: VariablesResponse) => {
      recentFailures.set(key, now());
      return x;
    };
    // 6) Roxy — natal analizle BİREBİR aynı doğum alanları (ad / iletişim / not YOK)
    const body: RoxyVariablesRequest = { date: birth!.date, time: birth!.time, timezone: birth!.timezone, latitude: birth!.latitude, longitude: birth!.longitude, nodeType: policy.nodeType }; // nodeType yukarıda politikaya eşitliği denetlendi
    const call = await deps.callVariables(config, body, { lang: policy.lang, timeoutMs: policy.timeoutMs });
    if (!call.ok) {
      log("[hd-variables] call failed", { kind: call.kind, status: call.status });
      return failed(PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error);
    }
    const v = validateRoxyVariables(call.raw);
    if (!v.ok) {
      log("[hd-variables] contract mismatch", { errors: v.errors.slice(0, 10) });
      return failed(fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç gösterilmedi."));
    }
    // 7) Bağımsız yerel çapraz denetim (mühürlü motor yalnız çağrılır)
    let bands: LocalArrowBand[];
    try {
      bands = (deps.localBands ?? localVariableBands)(birthUtc);
    } catch {
      log("[hd-variables] local check unavailable", {});
      return failed(fail(502, "PROVIDER_UNVERIFIED", "Sonuç bağımsız olarak doğrulanamadı; doğrulanamayan sonuç gösterilmedi."));
    }
    const x = crossCheckVariables(v.value, bands);
    if (!x.ok) {
      // Teşhis: yalnız ok anahtarı + değerler (doğum verisi, kişi adı, anahtar YOK).
      log("[hd-variables] cross-check mismatch", { mismatches: x.mismatches });
      return failed(fail(502, "PROVIDER_INCONSISTENT", "Hesaplama servisinin sonucu bağımsız doğrulamayla uyuşmadı. Doğrulanamayan sonuç gösterilmedi."));
    }
    recentFailures.delete(key);
    cacheSet(key, v.value, now());
    return ok(v.value, false);
  }
}
