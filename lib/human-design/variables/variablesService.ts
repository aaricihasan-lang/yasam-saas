// Human Design Variables (Dört Ok / PHS) — SUNUCU servisi (service_role + ZORUNLU tenant filtresi).
//
//   • Kaynak: bu tenant'ın KAYITLI, otomatik (Roxy) bireysel analizi. Doğum verisi istemciden ALINMAZ; analizin sunucuda
//     doğrulanmış girdisi (chart.input) kullanılır ve Roxy'ye natal BodyGraph çağrısıyla BİREBİR aynı alanlar gider.
//   • Doğum anı sunucunun IANA çözücüsüyle yeniden çözülür; hiç yaşanmamış / iki kez yaşanmış yerel saat REDDEDİLİR
//     (Roxy bunları sessizce ileri kaydırır / ilk geçişi seçer — sözleşme metni).
//   • Bağlı danışanın doğum bilgisi analizden sonra değiştiyse hesap YAPILMAZ (409).
//   • Yanıt: sözleşme + yapısal tutarlılık (variablesContract) + mühürlü yerel motorla bağımsız Color/Tone bant denetimi
//     (localVariablesCheck). Herhangi bir ihlal → gösterilmez, önbelleğe girmez (fail-closed).
//   • Ücretli çağrı koruması: KALICI depo (human_design_chart_variables — sunucu yeniden başlasa / başka örnek yanıtlasa da
//     aynı analiz + aynı doğum anı + aynı adapter için yeni çağrı YOK), süreç içi önbellek (ön katman), süreç içi istek
//     birleştirme, DB eşzamanlılık kilidi (kilidi bekleyen örnek kalıcı depoyu yoklar; kilidi alan örnek depoyu YENİDEN
//     denetler), BodyGraph / İlişki ile ORTAK kullanıcı + tenant kotası.
//   • Kalıcı kayıt okunurken sağlayıcı yanıtıyla AYNI denetimlerden geçer (sözleşme + yerel çapraz denetim + tarihsel ofset);
//     bozuk kayıt kullanılmaz (yeniden hesaplanıp üzerine yazılır). Depo okunamıyorsa ücretli çağrı YAPILMAZ (fail-closed).
//     Tablo henüz yoksa (migration uygulanmamış) bugünkü davranış: süreç içi önbellek + kilit + kota.
//   • Yalnız Variables deposuna ve kota sayaçlarına yazılır; kayıtlı natal analiz (computed_result dahil) DEĞİŞMEZ.

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
import { applyHistoricalOffsetCaution, crossCheckVariables, localVariableBands, type LocalArrowBand } from "./localVariablesCheck";
import { readStoredVariables, writeStoredVariables, type VariablesStoreKey } from "./variablesStore";

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
/** Test yardımcısı: süreç içi hata kaydı sayısı (ayıklama denetimi). */
export const __variablesFailureCount = () => recentFailures.size;
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
  const utcOffsetSeconds = r.offsetSeconds;

  const key = createHash("sha256")
    .update([ROXY_VARIABLES_ADAPTER_VERSION, policy.nodeType, policy.lang, ctx.tenantId, chart.id, chart.input_hash ?? "", r.utcIso].join("|"))
    .digest("hex");
  const ok = (data: VariablesDto, reused: boolean): VariablesResponse => ({ status: 200, body: { ok: true, reused, chart: { id: chart.id }, data } });
  const hit = cacheGet(key, now());
  if (hit) return ok(hit, true);

  // Bağımsız yerel bantlar: hem sağlayıcı yanıtı hem kalıcı kayıt AYNI denetimden geçer (tek hesap).
  let bandsMemo: LocalArrowBand[] | null = null;
  const bandsFor = () => (bandsMemo ??= (deps.localBands ?? localVariableBands)(birthUtc));
  const unverified = () => fail(502, "PROVIDER_UNVERIFIED", "Sonuç bağımsız olarak doğrulanamadı; doğrulanamayan sonuç gösterilmedi.");
  /** Sözleşme + yerel çapraz denetim + tarihsel ofset kesinlik düşürmesi (sağlayıcı yanıtı ve kalıcı kayıt için ORTAK). */
  const verify = (raw: unknown): { ok: true; data: VariablesDto } | { ok: false; stage: "contract" | "local" | "cross"; detail?: Record<string, unknown> } => {
    const v = validateRoxyVariables(raw);
    if (!v.ok) return { ok: false, stage: "contract", detail: { errors: v.errors.slice(0, 10) } };
    let bands: LocalArrowBand[];
    try {
      bands = bandsFor();
    } catch {
      return { ok: false, stage: "local" };
    }
    const x = crossCheckVariables(v.value, bands);
    // Teşhis: yalnız ok anahtarı + değerler (doğum verisi, kişi adı, anahtar YOK).
    if (!x.ok) return { ok: false, stage: "cross", detail: { mismatches: x.mismatches } };
    // Tarihsel saniyeli ofset: sağlayıcının ölçülmüş saniye kesmesine karşı yalnız kesinlik düşürülür
    return { ok: true, data: applyHistoricalOffsetCaution(v.value, bands, utcOffsetSeconds) };
  };

  // ── Kalıcı depo (tenant + analiz + anahtar). Okunamazsa ücretli çağrı YOK; tablo yoksa bugünkü davranış. ──
  const storeKey: VariablesStoreKey = {
    tenantId: ctx.tenantId,
    chartId: chart.id.toLowerCase(),
    cacheKey: key,
    nodeType: policy.nodeType,
    lang: policy.lang,
    chartInputHash: chart.input_hash ?? null,
    utcOffsetSeconds,
  };
  let persist = true;
  let stale = false;
  type Lookup = { kind: "hit"; res: VariablesResponse } | { kind: "stop"; res: VariablesResponse } | { kind: "none" };
  const lookupStore = async (): Promise<Lookup> => {
    if (!persist) return { kind: "none" };
    const s = await readStoredVariables(ctx.db, storeKey);
    if (s.kind === "missing_table") {
      persist = false;
      noteStoreMissing(log);
      return { kind: "none" };
    }
    if (s.kind === "error") return { kind: "stop", res: fail(500, "DB_ERROR", hdSafeDbError("variables.store.read", s.error)) };
    if (s.kind === "miss") return { kind: "none" };
    if (s.kind === "corrupt") {
      stale = true;
      log("[hd-variables] stored result rejected", { reason: s.reason });
      return { kind: "none" };
    }
    const vr = verify(s.raw);
    if (!vr.ok) {
      if (vr.stage === "local") return { kind: "stop", res: unverified() };
      stale = true;
      log("[hd-variables] stored result rejected", { reason: vr.stage, ...vr.detail });
      return { kind: "none" };
    }
    cacheSet(key, vr.data, now());
    return { kind: "hit", res: ok(vr.data, true) };
  };

  const stored = await lookupStore();
  if (stored.kind !== "none") return stored.res;
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
      // Kilit başka örnekte: sonucu süreç belleğinde VE kalıcı depoda bekle (başka örneğin yazdığı kayıt burada görünür).
      for (let i = 0; i < 8; i++) {
        await sleep(1500);
        const again = cacheGet(key, now());
        if (again) return ok(again, true);
        const s = await lookupStore();
        if (s.kind !== "none") return s.res;
      }
      return fail(409, "IN_PROGRESS", "Bu analiz şu anda hesaplanıyor. Birkaç saniye sonra tekrar deneyin.", claim.retryAfterSec || 10);
    }
    // Kilit alındı: ilk okumayla kilit arasında başka örnek bitirmiş olabilir → depo YENİDEN denetlenir.
    const recheck = await lookupStore();
    if (recheck.kind !== "none") return recheck.res;
    // 5) Ortak ücretli çağrı kotası (BodyGraph / İlişki ile aynı sayaçlar)
    const userRl = await deps.rateLimit("hd-roxy-user", ctx.userId, ROXY_RATE_LIMITS.perUser.limit, ROXY_RATE_LIMITS.perUser.windowSeconds);
    if (!userRl.allowed) return fail(429, "RATE_LIMITED", "Kısa sürede çok fazla otomatik hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", userRl.retryAfterSec);
    const tenantRl = await deps.rateLimit("hd-roxy-tenant", ctx.tenantId, ROXY_RATE_LIMITS.perTenant.limit, ROXY_RATE_LIMITS.perTenant.windowSeconds);
    if (!tenantRl.allowed) return fail(429, "RATE_LIMITED", "Hesabınızın günlük otomatik hesaplama sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.", tenantRl.retryAfterSec);

    const failed = (x: VariablesResponse) => {
      const t = now();
      // Süresi geçen kayıtlar ayıklanır + üst sınır (çok sayıda farklı analizin hatasıyla bellek büyümesin)
      for (const [k, at] of recentFailures) if (t - at >= RECENT_FAILURE_MS) recentFailures.delete(k);
      recentFailures.set(key, t);
      while (recentFailures.size > VARIABLES_CACHE.maxEntries) recentFailures.delete(recentFailures.keys().next().value as string);
      return x;
    };
    // 6) Roxy — natal analizle BİREBİR aynı doğum alanları (ad / iletişim / not YOK)
    const body: RoxyVariablesRequest = { date: birth!.date, time: birth!.time, timezone: birth!.timezone, latitude: birth!.latitude, longitude: birth!.longitude, nodeType: policy.nodeType }; // nodeType yukarıda politikaya eşitliği denetlendi
    const call = await deps.callVariables(config, body, { lang: policy.lang, timeoutMs: policy.timeoutMs });
    if (!call.ok) {
      log("[hd-variables] call failed", { kind: call.kind, status: call.status });
      return failed(PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error);
    }
    // 7) Sözleşme + bağımsız yerel çapraz denetim (mühürlü motor yalnız çağrılır) + tarihsel ofset
    const vr = verify(call.raw);
    if (!vr.ok) {
      if (vr.stage === "contract") {
        log("[hd-variables] contract mismatch", vr.detail);
        return failed(fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç gösterilmedi."));
      }
      if (vr.stage === "local") {
        log("[hd-variables] local check unavailable", {});
        return failed(unverified());
      }
      log("[hd-variables] cross-check mismatch", vr.detail);
      return failed(fail(502, "PROVIDER_INCONSISTENT", "Hesaplama servisinin sonucu bağımsız doğrulamayla uyuşmadı. Doğrulanamayan sonuç gösterilmedi."));
    }
    const data = vr.data;
    // 8) Kalıcı kayıt — YALNIZ denetimden geçmiş yanıt. Yazılamazsa sonuç yine gösterilir (çağrı zaten yapıldı), loglanır.
    if (persist) {
      const w = await writeStoredVariables(ctx.db, storeKey, call.raw, ctx.userId, { replace: stale, nowIso: new Date(now()).toISOString() });
      if (w.kind === "missing_table") noteStoreMissing(log);
      else if (w.kind === "error") log("[hd-variables] store write failed", { error: hdSafeDbError("variables.store.write", w.error) });
    }
    recentFailures.delete(key);
    cacheSet(key, data, now());
    return ok(data, false);
  }
}

let storeMissingNoted = false;
/** Migration henüz uygulanmamış: süreç başına BİR kez uyarı (bugünkü davranışla devam edilir). */
function noteStoreMissing(log: (msg: string, detail?: unknown) => void) {
  if (storeMissingNoted) return;
  storeMissingNoted = true;
  log("[hd-variables] persistent store table missing — falling back to in-process cache", {});
}
