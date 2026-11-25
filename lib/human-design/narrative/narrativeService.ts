// HD ANLATI — dil başına Roxy anlatısı: OKUMA (asla sağlayıcı çağırmaz) + AÇIK ÜRETİM (bayrak arkasında). YALNIZ SUNUCU.
//
// Değişmezler (scripts/hd-i18n/narrative.harness.ts kilitler):
//   • Bayrak KAPALI (varsayılan) → okuma "disabled", üretim 404 FEATURE_DISABLED; hiçbir DB/sağlayıcı erişimi yok.
//   • human_design_charts'a hiçbir yazım yok (yalnız SELECT); harita kimliği / input_hash / computed_result değişmez.
//   • Aynı (tenant, harita, dil, sürüm) için kayıt varsa üretim 0 ücretli çağrıyla "reused" döner.
//   • Sağlayıcının yeni dil yanıtı kayıtlı haritanın kanonik özetiyle aynı değilse kaydedilmez (fail-closed).
//   • Hata yanıtları yalnız dil-bağımsız KOD taşır (metin istemcide katalogdan — lib/i18n/apiError sözleşmesi).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "../api/tenantScope";
import { isUuid } from "../api/deterministicId";
import { checkChartBirthUtc, storedBirthUtcIso, toRoxyUtcMoment } from "../api/hdBirthUtc";
import { ROXY_POLICY, ROXY_PROVIDER_ID, ROXY_RATE_LIMITS, type RoxyPolicy, type RoxyServerConfig } from "../providers/roxy/config";
import type { RoxyBodygraphRequest, RoxyCallResult } from "../providers/roxy/client";
import { validateRoxyBodygraph } from "../providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../providers/roxy/normalize";
import { chartBirthMoment } from "../relations/relationService";
import type { HdComputedChart } from "../chart/computedChart";
import { HD_NARRATIVE_MAX_RAW_BYTES, HD_NARRATIVE_SOURCE_LANG, isHdNarrativeLang } from "./narrativeConfig";
import { compareCanonical, hdCanonicalSha, hdNarrativeCacheKey } from "./narrativeConsistency";
import { insertStoredNarrative, narrativeStoreAvailable, readStoredNarrative, type HdNarrativeStoreKey } from "./narrativeStore";

const CHARTS = "human_design_charts";

export type HdNarrativeCtx = { db: SupabaseClient; tenantId: string; userId: string; isDemo: boolean };

export type HdNarrativeDeps = {
  /** isHdNarrativeI18nEnabled() — route sunucu ortamından verir. */
  enabled: boolean;
  config: RoxyServerConfig | null;
  callRoxy: (config: RoxyServerConfig, body: RoxyBodygraphRequest, opts: { lang: string; timeoutMs: number }) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  policy?: RoxyPolicy;
  log?: (msg: string, detail?: unknown) => void;
};

export type HdNarrativeResponse = {
  status: number;
  body: { ok: true; chartId: string; lang: string; reused: boolean } | { ok: false; code: string; retryAfterSec?: number };
};

const fail = (status: number, code: string, retryAfterSec?: number): HdNarrativeResponse => ({
  status,
  body: retryAfterSec ? { ok: false, code, retryAfterSec } : { ok: false, code },
});

const PROVIDER_FAIL: Record<string, HdNarrativeResponse> = {
  timeout: fail(504, "PROVIDER_TIMEOUT"),
  network: fail(502, "PROVIDER_UNAVAILABLE"),
  unauthorized: fail(502, "PROVIDER_CONFIG"),
  rate_limited: fail(503, "PROVIDER_BUSY"),
  bad_request: fail(422, "PROVIDER_REJECTED"),
  server_error: fail(502, "PROVIDER_UNAVAILABLE"),
  malformed_json: fail(502, "PROVIDER_INVALID_RESPONSE"),
};

type ChartRow = { id: string; source: string | null; provider: string | null; input: unknown; input_hash: string | null; computed_result: unknown };

type ChartContext = {
  chart: ChartRow;
  stored: HdComputedChart;
  birth: NonNullable<ReturnType<typeof chartBirthMoment>>;
  birthUtcIso: string;
  storeKey: HdNarrativeStoreKey;
};

/** Kayıtlı harita (YALNIZ bu tenant; yalnız SELECT) → anlatı anahtarı. Uygun değilse kod. */
async function loadChartContext(
  db: SupabaseClient,
  tenantId: string,
  chartId: string,
  lang: string,
  policy: RoxyPolicy,
): Promise<{ ok: true; c: ChartContext } | { ok: false; res: HdNarrativeResponse }> {
  const { data, error } = await withTenant(db.from(CHARTS).select("id, source, provider, input, input_hash, computed_result"), tenantId, "narrative.chart")
    .eq("id", chartId)
    .maybeSingle();
  if (error) return { ok: false, res: fail(500, "DB_ERROR") };
  const chart = data as ChartRow | null;
  if (!chart) return { ok: false, res: fail(404, "CHART_NOT_FOUND") };
  if (chart.source !== "computed" || chart.provider !== ROXY_PROVIDER_ID || typeof chart.computed_result !== "object" || chart.computed_result === null) {
    return { ok: false, res: fail(422, "CHART_NOT_ELIGIBLE") };
  }
  const birth = chartBirthMoment(chart.input);
  const birthUtcIso = storedBirthUtcIso(chart.computed_result);
  if (!birth || !birthUtcIso) return { ok: false, res: fail(422, "CHART_INCOMPLETE") };
  if (birth.nodeType !== policy.nodeType) return { ok: false, res: fail(422, "CHART_POLICY_MISMATCH") };
  const stored = chart.computed_result as HdComputedChart;
  const id = chart.id.toLowerCase();
  const storeKey: HdNarrativeStoreKey = {
    tenantId,
    chartId: id,
    cacheKey: hdNarrativeCacheKey({ tenantId, chartId: id, chartInputHash: chart.input_hash ?? null, nodeType: birth.nodeType, lang, birthUtcIso }),
    lang,
    nodeType: birth.nodeType,
    chartInputHash: chart.input_hash ?? null,
    canonicalSha: hdCanonicalSha(stored),
  };
  return { ok: true, c: { chart, stored, birth, birthUtcIso, storeKey } };
}

/** Sağlayıcı yanıtı (yeni ya da kayıtlı) → sözleşme + normalizasyon + kayıtlı haritayla kanonik eşitlik. */
function verifyNarrativeRaw(raw: unknown, c: ChartContext, lang: string, mode: "ingest" | "stored"): { ok: true } | { ok: false; stage: string; fields?: string[] } {
  const v = validateRoxyBodygraph(raw, { mode });
  if (!v.ok) return { ok: false, stage: "contract" };
  const n = normalizeRoxyBodygraph(v.value, {
    date: c.birth.date,
    time: c.birth.time,
    timezone: c.birth.timezone,
    latitude: c.birth.latitude,
    longitude: c.birth.longitude,
    nodeType: c.birth.nodeType,
    lang,
    birthUtcIso: c.birthUtcIso,
  });
  if (!n.ok) return { ok: false, stage: "normalize" };
  const cmp = compareCanonical(c.stored, n.chart);
  return cmp.ok ? { ok: true } : { ok: false, stage: "canonical", fields: cmp.fields };
}

export type HdNarrativeReadResult =
  | { kind: "hit"; lang: string; raw: unknown }
  | { kind: "none"; reason: "disabled" | "source_lang" | "unsupported_lang" | "invalid_id" | "chart" | "missing_table" | "miss" | "rejected" | "error" };

/**
 * GÖSTERİM için okuma: kayıtlı ve doğrulanmış anlatı varsa ham yanıt (yalnız sunucu içinde; istemciye whitelist DTO gider).
 * Sağlayıcı bağımlılığı İMZADA YOK → bu yol yapısal olarak ücretli çağrı yapamaz.
 */
export async function readChartNarrative(
  db: SupabaseClient,
  tenantId: string,
  chartId: string,
  lang: string,
  opts: { enabled: boolean; policy?: RoxyPolicy; log?: (msg: string, detail?: unknown) => void },
): Promise<HdNarrativeReadResult> {
  if (!opts.enabled) return { kind: "none", reason: "disabled" };
  if (lang === HD_NARRATIVE_SOURCE_LANG) return { kind: "none", reason: "source_lang" };
  if (!isHdNarrativeLang(lang)) return { kind: "none", reason: "unsupported_lang" };
  if (!isUuid(chartId)) return { kind: "none", reason: "invalid_id" };
  const loaded = await loadChartContext(db, tenantId, chartId.toLowerCase(), lang, opts.policy ?? ROXY_POLICY);
  if (!loaded.ok) return { kind: "none", reason: "chart" };
  const s = await readStoredNarrative(db, loaded.c.storeKey);
  if (s.kind === "missing_table") return { kind: "none", reason: "missing_table" };
  if (s.kind === "error") return { kind: "none", reason: "error" };
  if (s.kind === "miss") return { kind: "none", reason: "miss" };
  if (s.kind === "corrupt") {
    opts.log?.("[hd-narrative] stored narrative rejected", { reason: s.reason });
    return { kind: "none", reason: "rejected" };
  }
  const vr = verifyNarrativeRaw(s.raw, loaded.c, lang, "stored");
  if (!vr.ok) {
    opts.log?.("[hd-narrative] stored narrative failed verification", { stage: vr.stage, fields: vr.fields });
    return { kind: "none", reason: "rejected" };
  }
  return { kind: "hit", lang, raw: s.raw };
}

/**
 * AÇIK ÜRETİM (kullanıcının açık isteği; otomatik tetiklenmez): TR dışı dil için 1 ücretli bodygraph çağrısı, yalnız anlatı
 * olarak ayrı tabloya. Kayıt varsa 0 çağrı. Harita satırı DEĞİŞMEZ.
 */
export async function generateChartNarrative(ctx: HdNarrativeCtx, deps: HdNarrativeDeps, chartIdRaw: unknown, langRaw: unknown): Promise<HdNarrativeResponse> {
  if (!deps.enabled) return fail(404, "FEATURE_DISABLED");
  if (ctx.isDemo) return fail(403, "DEMO_READONLY");
  if (langRaw === HD_NARRATIVE_SOURCE_LANG) return fail(400, "NARRATIVE_SOURCE_LANG");
  if (!isHdNarrativeLang(langRaw)) return fail(400, "NARRATIVE_UNSUPPORTED_LANG");
  const lang = langRaw;
  if (!isUuid(chartIdRaw)) return fail(400, "INVALID_ID");
  const policy = deps.policy ?? ROXY_POLICY;
  const log = deps.log ?? (() => undefined);

  const loaded = await loadChartContext(ctx.db, ctx.tenantId, (chartIdRaw as string).toLowerCase(), lang, policy);
  if (!loaded.ok) return loaded.res;
  const c = loaded.c;
  const ok = (reused: boolean): HdNarrativeResponse => ({ status: 200, body: { ok: true, chartId: c.storeKey.chartId, lang, reused } });

  type Look = { kind: "hit" } | { kind: "stop"; res: HdNarrativeResponse } | { kind: "none" };
  const lookup = async (): Promise<Look> => {
    const s = await readStoredNarrative(ctx.db, c.storeKey);
    if (s.kind === "missing_table") return { kind: "stop", res: fail(503, "NARRATIVE_STORE_MISSING") };
    if (s.kind === "error") return { kind: "stop", res: fail(500, "DB_ERROR") };
    if (s.kind === "miss") return { kind: "none" };
    if (s.kind === "corrupt") {
      log("[hd-narrative] stored narrative rejected", { reason: s.reason });
      return { kind: "stop", res: fail(409, "NARRATIVE_STORED_INVALID") };
    }
    const vr = verifyNarrativeRaw(s.raw, c, lang, "stored");
    if (!vr.ok) {
      log("[hd-narrative] stored narrative failed verification", { stage: vr.stage, fields: vr.fields });
      return { kind: "stop", res: fail(409, "NARRATIVE_STORED_INVALID") };
    }
    return { kind: "hit" };
  };

  // 1) Kayıt varsa → 0 ücretli çağrı.
  const first = await lookup();
  if (first.kind === "hit") return ok(true);
  if (first.kind === "stop") return first.res;

  // 2) Tablo hazır mı (tablo yokken çağrı yapılıp sonuç atılmaz) — lookup missing_table'ı zaten yakalar; bu ek emniyet.
  const avail = await narrativeStoreAvailable(ctx.db, ctx.tenantId);
  if (avail === "missing_table") return fail(503, "NARRATIVE_STORE_MISSING");
  if (avail === "error") return fail(500, "DB_ERROR");

  // 3) Kayıtlı doğum anı güncel IANA çözümüyle aynı olmalı (bayat haritadan yeni sağlayıcı yanıtı alınmaz).
  const bu = checkChartBirthUtc(c.birth, c.chart.computed_result);
  if (bu.status !== "current") return fail(409, bu.status === "stale" ? "CHART_TIME_STALE" : "CHART_TIME_UNRESOLVED");
  if (!deps.config) return fail(503, "NOT_CONFIGURED");

  // 4) Eşzamanlılık kilidi (anahtar dil içerir) → kilitten sonra depo yeniden denetlenir.
  const claim = await deps.rateLimit("hd-roxy-narrative-inflight", c.storeKey.cacheKey, ROXY_RATE_LIMITS.inFlight.limit, ROXY_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) return fail(409, "IN_PROGRESS", claim.retryAfterSec || 10);
  const again = await lookup();
  if (again.kind === "hit") return ok(true);
  if (again.kind === "stop") return again.res;

  // 5) Ortak ücretli çağrı kotası (BodyGraph / Dört Ok / İlişki ile AYNI sayaçlar).
  const userRl = await deps.rateLimit("hd-roxy-user", ctx.userId, ROXY_RATE_LIMITS.perUser.limit, ROXY_RATE_LIMITS.perUser.windowSeconds);
  if (!userRl.allowed) return fail(429, "RATE_LIMITED", userRl.retryAfterSec);
  const tenantRl = await deps.rateLimit("hd-roxy-tenant", ctx.tenantId, ROXY_RATE_LIMITS.perTenant.limit, ROXY_RATE_LIMITS.perTenant.windowSeconds);
  if (!tenantRl.allowed) return fail(429, "RATE_LIMITED", tenantRl.retryAfterSec);

  // 6) Tek ücretli çağrı — kayıtlı haritanın AYNI UTC anı + koordinat + düğüm; yalnız dil farklı.
  const body = toRoxyUtcMoment<RoxyBodygraphRequest>(
    { date: c.birth.date, time: c.birth.time, timezone: c.birth.timezone, latitude: c.birth.latitude, longitude: c.birth.longitude, nodeType: c.birth.nodeType },
    c.birthUtcIso,
  );
  if (!body) return fail(422, "CHART_INCOMPLETE");
  const call = await deps.callRoxy(deps.config, body, { lang, timeoutMs: policy.timeoutMs });
  if (!call.ok) {
    log("[hd-narrative] provider call failed", { kind: call.kind, status: call.status });
    return PROVIDER_FAIL[call.kind] ?? PROVIDER_FAIL.server_error;
  }

  // 7) Kanonik eşitlik (fail-closed) + boyut.
  const vr = verifyNarrativeRaw(call.raw, c, lang, "ingest");
  if (!vr.ok) {
    log("[hd-narrative] provider narrative rejected", { stage: vr.stage, fields: vr.fields });
    return fail(502, vr.stage === "canonical" ? "NARRATIVE_CANONICAL_MISMATCH" : "PROVIDER_INVALID_RESPONSE");
  }
  if (JSON.stringify(call.raw).length > HD_NARRATIVE_MAX_RAW_BYTES) return fail(502, "NARRATIVE_TOO_LARGE");

  // 8) Yalnız anlatı tablosuna EKLEME (harita satırına yazım YOK).
  const w = await insertStoredNarrative(ctx.db, c.storeKey, call.raw, ctx.userId);
  if (w.kind === "saved") return ok(false);
  if (w.kind === "exists") return ok(true);
  if (w.kind === "missing_table") return fail(503, "NARRATIVE_STORE_MISSING");
  return fail(500, "DB_ERROR");
}
