/**
 * Klasik Numeroloji — hesap ORKESTRASYONU (YALNIZ SUNUCU).
 *
 * Akış (sıra maliyet ve güvenlik için bilinçli):
 *   0) 30.10.2026 owner kararı: HESAP ile KAYIT AYRI. computeClassicResult kalıcı analiz kaydı OLUŞTURMAZ;
 *      kayıt yalnız açık "Kaydet" (persistClassicAnalysis) / "Kaydı Güncelle" (replaceClassicAnalysis) ile —
 *      ikisi de taslağı YALNIZ önbellekten yeniden kurar (0 sağlayıcı çağrısı) ve sonuç özetini doğrular.
 *   1) demo → 403 (ücretli çağrı yok)          2) sağlayıcı-çağrı bayrağı kapalı → 503 (yalnız yeni hesap)
 *   3) danışan bağı (yalnız Kaydet / Güncelle): clients izni + danışan bu tenant'ta (değilse 404)
 *   4) analiz düzeyi single-flight (aynı kullanıcı + aynı kanonik istek eşzamanlı → tek hesap)
 *   5) MİMARİ §4 çağrı planı (en az çağrı) → her çağrı için:
 *        önbellek (tenant) → isabet: 0 çağrı
 *        ıska: çağrı düzeyi single-flight → keşif kapısı (kalan kota bilinmiyorsa süreç başına tek çağrı) →
 *              kota tabanı → instance-arası kilit → kullanıcı/tenant limiti → sağlayıcı → normalize →
 *              önbelleğe yaz (expires_at = şimdi + TTL) → defter
 *        Sırsız ortamda (NODE_ENV≠test) önbellek KAPALI: okuma/yazma yok; tek-uçuş/kilit anahtarı süreç içi rastgele sırla.
 *   6) bağımsız doğrulama (oracle) → sonuç birleştirme; bir çağrı bile düştüyse status "partial" (hangileri kayıtlı)
 *   7) tümü düştüyse Türkçe hata; aksi hâlde sonuç + resultHash döner (kayıt YOK)
 * Kayıtlı analiz açma / sekme geçişi: repository okuması (0 çağrı).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIC_PROVIDER_SPEC_VERSION, type ClassicEndpointId } from "../endpoints";
import { canonicalJson, isoBeforeBirth, type ClassicAnalysisRequest } from "../input";
import { deriveDualFromChartChaldean, DUAL_DERIVATION } from "./derive";
import { cacheGet, cachePut, cacheUsable, classicCacheKey, CLASSIC_CACHE_TTL_DEFAULT_DAYS } from "./cache";
import { classicFail, type ClassicErrorCode, type ClassicServiceResponse } from "./errors";
import type { NormalizeFn, VerifyFn } from "./types";
import { CLASSIC_PROVIDER_LANG, type ClassicCallOptions, type ClassicProviderConfig, type ClassicProviderResult } from "./providerClient";
import { CLASSIC_DISCOVERY_WAIT_MS, CLASSIC_RATE_LIMITS, ProviderQuotaState, SingleFlight, type RateLimitFn } from "./quota";
import { clientBelongsToTenant, getCatalogEntry, insertAnalysis, replaceAnalysisContent, type ClassicAnalysisRow } from "./repository";

assertServerOnly("lib/numeroloji-klasik/server/service");

export const CLASSIC_ADAPTER_VERSION = "numk-adapter-1";
export const CLASSIC_METHODOLOGY_VERSION = "numk-method-1";
const MAX_PARALLEL_CALLS = 3;

export type ClassicServiceCtx = {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  isDemo: boolean;
  /** Danışan Yönetimi (clients) izni — danışan bağı için zorunlu. */
  canLinkClients: boolean;
};

export type ClassicServiceDeps = {
  providerCallsEnabled: boolean;
  config: ClassicProviderConfig | null;
  callProvider: (
    config: ClassicProviderConfig,
    id: ClassicEndpointId,
    payload: Record<string, unknown> | null,
    opts: ClassicCallOptions & { pathParam?: string | null },
  ) => Promise<ClassicProviderResult>;
  normalize: NormalizeFn;
  verify: VerifyFn;
  rateLimit: RateLimitFn;
  quotaState: ProviderQuotaState;
  quotaFloor: number;
  /** NK-006: başlık kalanından düşülen pay (hesap sayacı farkı; varsayılan 0). */
  quotaHeaderGap?: number;
  cacheSecret: string | null;
  /** true → önbellek okuma/yazma YOK (sır yok ve NODE_ENV≠test; deps.ts kurar). */
  cacheDisabled?: boolean;
  /** Önbellek satır ömrü (gün; varsayılan 90). */
  cacheTtlDays?: number;
  /** Keşif modunda sıra bekleme üst sınırı (ms; varsayılan 5000). */
  discoveryWaitMs?: number;
  now?: () => Date;
  log?: (msg: string, detail?: unknown) => void;
  /** Normalize harita sonucundan Life Path (EN uğurlu ilişkiler katalog okuması için). Verilmezse sezgisel okuyucu. */
  lifePathOf?: (chartNormalized: unknown) => number | null;
};

const LIFE_PATHS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);
/** model.ts ChartResult: core.lifePath.value (ayrıca { lifePath: n } / coreNumbers.lifePath.number toleransı). */
export function defaultLifePathOf(v: unknown): number | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const pick = (x: unknown): number | null => {
    if (typeof x === "number") return x;
    if (x && typeof x === "object") {
      const o2 = x as { value?: unknown; number?: unknown };
      if (typeof o2.value === "number") return o2.value;
      if (typeof o2.number === "number") return o2.number;
    }
    return null;
  };
  const core = (o.coreNumbers ?? o.core) as Record<string, unknown> | undefined;
  const n = pick(o.lifePath) ?? (core ? pick(core.lifePath) : null);
  return n !== null && LIFE_PATHS.has(n) ? n : null;
}

export type PlannedCall = { label: string; endpointId: ClassicEndpointId; payload: Record<string, unknown> };

/** Europe/Istanbul takvim günü (YYYY-MM-DD) — tarih bağımlı uçların varsayılan referansı. */
export function istanbulToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Günün Sayısı (/daily) tohumu. Sağlayıcının günlük sayısı tohum + tarih karmasından türeyen SEMBOLİK bir sayıdır
 * (canlı doğrulama 29.10.2026: aynı tohum + tarih → birebir aynı yanıt; doğum verisinden HESAPLANMAZ).
 * Sağlayıcıya ad / doğum tarihi GİTMEZ: tohum = HMAC(sır, alan etiketi | katlanmamış kanonik ad | doğum) → opak
 * 20 hex. Aynı kişi aynı gün aynı sayıyı alır; tohumdan ad/doğum geri çıkarılamaz. Sır yoksa tohum gönderilmez
 * (sağlayıcının o güne ait ORTAK sayısı) ve sonuç bu durumu `seedMode` ile taşır.
 */
export const CLASSIC_DAILY_SEED_LABEL = "numk-daily-seed:v1:";
export function classicDailySeed(secret: string | null, fullName: string, birth: { year: number; month: number; day: number }): string | null {
  if (!secret) return null;
  const subject = canonicalJson({ fullName: fullName.normalize("NFC").toLocaleUpperCase("tr-TR"), birth });
  return `nk${createHmac("sha256", `${CLASSIC_DAILY_SEED_LABEL}${secret}`).update(subject).digest("hex").slice(0, 20)}`;
}

/** MİMARİ §4 çağrı planı (saf). `dailySeed`: classicDailySeed çıktısı (null → tohumsuz ortak günlük sayı). */
export function planClassicCalls(req: ClassicAnalysisRequest, referenceDate: string, opts: { dailySeed?: string | null } = {}): PlannedCall[] {
  if (req.kind === "person") {
    const { fullName, birth, targetDate } = req.input;
    // Canlı doğrulama (29.10.2026): /chart'a currentYear GÖNDERİLMEZ (NK-001: kişisel ayı bozuyor); bunun yerine
    // Europe/Istanbul yerel günü targetDate olarak gider (kanonik girdi → önbellek anahtarına dahil).
    // /personal-day'e de HER ZAMAN yerel gün gider (verilmezse sağlayıcı UTC gününü kullanıyor).
    const ref = targetDate ?? referenceDate;
    const want = new Set(req.techniques);
    // "İki Sistem" /dual ÇAĞRILMAZ: chart (core.expression) + chaldean (destiny) üzerinden yerelde türetilir.
    if (want.has("dual")) {
      want.add("core");
      want.add("chaldean");
    }
    const out: PlannedCall[] = [];
    if (want.has("core")) out.push({ label: "chart", endpointId: "chart", payload: { fullName, year: birth.year, month: birth.month, day: birth.day, targetDate: ref } });
    if (want.has("bridge")) out.push({ label: "bridge", endpointId: "bridge", payload: { fullName, year: birth.year, month: birth.month, day: birth.day } });
    if (want.has("personal_day")) out.push({ label: "personal_day", endpointId: "personal_day", payload: { month: birth.month, day: birth.day, targetDate: ref } });
    // Günün Sayısı: Kişisel Gün'den AYRI teknik (tohum tabanlı sembolik; Kişisel Gün değerleriyle karıştırılmaz).
    if (want.has("daily")) out.push({ label: "daily", endpointId: "daily", payload: opts.dailySeed ? { seed: opts.dailySeed, date: ref } : { date: ref } });
    if (want.has("chaldean")) out.push({ label: "chaldean", endpointId: "chaldean", payload: { name: fullName } });
    return out;
  }
  if (req.kind === "relationship") {
    const p = (x: { fullName: string; birth: { year: number; month: number; day: number } }) => ({ fullName: x.fullName, year: x.birth.year, month: x.birth.month, day: x.birth.day });
    return [{ label: "compatibility", endpointId: "compatibility", payload: { person1: p(req.input.person1), person2: p(req.input.person2) } }];
  }
  if (req.kind === "business") return [{ label: "business_name", endpointId: "business_name", payload: { name: req.input.name } }];
  return req.input.candidates.map((name, i) => ({ label: `dual#${i + 1}`, endpointId: "dual" as const, payload: { name } }));
}

type CallOutcome =
  | { ok: true; label: string; endpointId: ClassicEndpointId; data: unknown; cacheHit: boolean; http: number | null; attempts: number }
  | { ok: false; label: string; endpointId: ClassicEndpointId; outcome: string; cacheHit: false; http: number | null; attempts: number; retryAfterSec?: number };

type CallCore = CallOutcome extends infer U ? (U extends CallOutcome ? Omit<U, "label"> : never) : never;
const callFlight = new SingleFlight<CallCore>();
const analysisFlight = new SingleFlight<ClassicServiceResponse>();

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function ledger(
  ctx: ClassicServiceCtx,
  row: { endpointId: ClassicEndpointId; http: number | null; outcome: string; cacheHit: boolean; quotaRemaining: number | null; quotaResetAt: number | null },
): Promise<void> {
  try {
    await ctx.db.from("numerology_classic_provider_calls").insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      endpoint_id: row.endpointId,
      http: row.http,
      outcome: row.outcome.slice(0, 40),
      cache_hit: row.cacheHit,
      quota_remaining: row.quotaRemaining,
      quota_reset_at: row.quotaResetAt !== null ? new Date(row.quotaResetAt).toISOString() : null,
    });
  } catch {
    // defter en iyi çaba; hesap akışını bozmaz
  }
}

/** Önbellek kapalıyken (sırsız) tek-uçuş/kilit anahtarı için süreç içi rastgele sır — düz özet DB'ye gitmez. */
const EPHEMERAL_FLIGHT_SECRET = randomBytes(32).toString("hex");

async function resolveCall(ctx: ClassicServiceCtx, call: PlannedCall, deps: ClassicServiceDeps, cacheOnly = false): Promise<CallOutcome> {
  const now = deps.now ?? (() => new Date());
  const cacheOn = !deps.cacheDisabled && cacheUsable(deps.cacheSecret);
  // Kaydet / taslak raporu: YALNIZ önbellek (sağlayıcı çağrısı YOK; ıska → not_cached, defter satırı yazılmaz).
  if (cacheOnly && !cacheOn) return { ok: false, label: call.label, endpointId: call.endpointId, outcome: "not_cached", cacheHit: false, http: null, attempts: 0 };
  const ttlDays = deps.cacheTtlDays ?? CLASSIC_CACHE_TTL_DEFAULT_DAYS;
  const key = classicCacheKey(
    { tenantId: ctx.tenantId, endpointId: call.endpointId, input: call.payload, lang: CLASSIC_PROVIDER_LANG, specVersion: CLASSIC_PROVIDER_SPEC_VERSION, adapterVersion: CLASSIC_ADAPTER_VERSION },
    cacheOn ? deps.cacheSecret : EPHEMERAL_FLIGHT_SECRET,
  );
  const hit = cacheOn ? await cacheGet(ctx.db, ctx.tenantId, key, now(), ttlDays) : null;
  if (hit) {
    if (!cacheOnly) await ledger(ctx, { endpointId: call.endpointId, http: null, outcome: "cache_hit", cacheHit: true, quotaRemaining: null, quotaResetAt: null });
    return { ok: true, label: call.label, endpointId: call.endpointId, data: hit.normalized, cacheHit: true, http: null, attempts: 0 };
  }
  if (cacheOnly) return { ok: false, label: call.label, endpointId: call.endpointId, outcome: "not_cached", cacheHit: false, http: null, attempts: 0 };
  const r = await callFlight.run(`${ctx.tenantId}|${key}`, async (): Promise<CallCore> => {
    const fail = (outcome: string, http: number | null = null, attempts = 0, retryAfterSec?: number): CallCore => ({
      ok: false, endpointId: call.endpointId, outcome, cacheHit: false, http, attempts, ...(retryAfterSec ? { retryAfterSec } : {}),
    });
    if (!deps.config) return fail("not_configured");
    await deps.quotaState.loadOnce(ctx.db, now().getTime());
    // Keşif kapısı: kalan kota bilinmiyor/bayatsa süreç başına tek çağrı; sıra 5 sn'de gelmezse CLASSIC_BUSY.
    const release = await deps.quotaState.acquireDiscovery(() => now().getTime(), deps.discoveryWaitMs ?? CLASSIC_DISCOVERY_WAIT_MS);
    if (!release) return fail("classic_busy", null, 0, 5);
    try {
      return await guardedProviderCall(ctx, call, deps, key, cacheOn, ttlDays, fail);
    } finally {
      release();
    }
  });
  return { ...r, label: call.label } as CallOutcome;
}

async function guardedProviderCall(
  ctx: ClassicServiceCtx,
  call: PlannedCall,
  deps: ClassicServiceDeps,
  key: string,
  cacheOn: boolean,
  ttlDays: number,
  fail: (outcome: string, http?: number | null, attempts?: number, retryAfterSec?: number) => CallCore,
): Promise<CallCore> {
  const now = deps.now ?? (() => new Date());
  if (!deps.config) return fail("not_configured");
  const known = deps.quotaState.known(now().getTime());
  if (known !== null && known - (deps.quotaHeaderGap ?? 0) < deps.quotaFloor) return fail("quota_floor");
  const lock = await deps.rateLimit("numk-inflight", key, CLASSIC_RATE_LIMITS.inFlight.limit, CLASSIC_RATE_LIMITS.inFlight.windowSeconds);
  if (!lock.allowed) return fail("in_flight", null, 0, lock.retryAfterSec);
  const u = await deps.rateLimit("numk-user", ctx.userId, CLASSIC_RATE_LIMITS.perUser.limit, CLASSIC_RATE_LIMITS.perUser.windowSeconds);
  if (!u.allowed) return fail("rate_limited_user", null, 0, u.retryAfterSec);
  const t = await deps.rateLimit("numk-tenant", ctx.tenantId, CLASSIC_RATE_LIMITS.perTenant.limit, CLASSIC_RATE_LIMITS.perTenant.windowSeconds);
  if (!t.allowed) return fail("rate_limited_tenant", null, 0, t.retryAfterSec);

  const res = await deps.callProvider(deps.config, call.endpointId, call.payload, { lang: CLASSIC_PROVIDER_LANG });
  deps.quotaState.observe(res.rate, now().getTime());
  if (res.ok && res.rate.remaining === null) deps.quotaState.noteMissingHeader(deps.log);
  // Yeniden denemelerden sonra hâlâ 429 → fail-closed soğuma (sonraki çağrılar QUOTA_PROTECTED).
  if (!res.ok && res.kind === "rate_limited") deps.quotaState.markExhausted(now().getTime());
  if (!res.ok) {
    await ledger(ctx, { endpointId: call.endpointId, http: res.http, outcome: res.kind, cacheHit: false, quotaRemaining: res.rate.remaining, quotaResetAt: res.rate.resetAt });
    return fail(res.kind, res.http, res.attempts);
  }
  let n: ReturnType<NormalizeFn>;
  try {
    n = deps.normalize(call.endpointId, res.raw);
  } catch {
    n = { ok: false, reason: "normalize_threw" };
  }
  await ledger(ctx, { endpointId: call.endpointId, http: res.http, outcome: n.ok ? "ok" : "normalize_failed", cacheHit: false, quotaRemaining: res.rate.remaining, quotaResetAt: res.rate.resetAt });
  if (!n.ok) {
    deps.log?.("[numeroloji-klasik] normalize reddi", { endpoint: call.endpointId, reason: String(n.reason).slice(0, 120) });
    return fail("normalize_failed", res.http, res.attempts);
  }
  if (cacheOn) {
    const stored = await cachePut(ctx.db, {
      tenantId: ctx.tenantId, cacheKey: key, endpointId: call.endpointId, lang: CLASSIC_PROVIDER_LANG,
      specVersion: CLASSIC_PROVIDER_SPEC_VERSION, adapterVersion: CLASSIC_ADAPTER_VERSION, normalized: n.data,
      now: now(), ttlDays,
    });
    if (!stored) deps.log?.("[numeroloji-klasik] önbellek yazılamadı", { endpoint: call.endpointId });
  }
  return { ok: true, endpointId: call.endpointId, data: n.data, cacheHit: false, http: res.http, attempts: res.attempts };
}

/** Tümü düştüğünde baskın nedeni uzman mesajına çevirir. */
function dominantError(fails: Extract<CallOutcome, { ok: false }>[]): { code: ClassicErrorCode; retryAfterSec?: number } {
  const has = (o: string) => fails.find((f) => f.outcome === o);
  if (fails.length && fails.every((f) => f.outcome === "not_cached")) return { code: "DRAFT_STALE" };
  if (has("not_configured")) return { code: "NOT_CONFIGURED" };
  if (has("quota_floor")) return { code: "QUOTA_PROTECTED" };
  const rl = has("rate_limited_user") ?? has("rate_limited_tenant") ?? has("rate_limited");
  if (rl) return { code: "RATE_LIMITED", retryAfterSec: rl.retryAfterSec ?? 60 };
  const inf = has("in_flight");
  if (inf) return { code: "IN_PROGRESS", retryAfterSec: inf.retryAfterSec ?? 5 };
  const busy = has("classic_busy");
  if (busy) return { code: "CLASSIC_BUSY", retryAfterSec: busy.retryAfterSec ?? 5 };
  if (has("timeout")) return { code: "PROVIDER_TIMEOUT" };
  return { code: "PROVIDER_ERROR" };
}

export type ClassicAnalysisView = {
  id: string;
  kind: string;
  title: string;
  clientId: string | null;
  input: unknown;
  techniques: string[];
  status: "complete" | "partial";
  result: unknown;
  verification: unknown;
  meta: { referenceDate: string | null; failed: string[]; fetchedAt: string | null; methodologyVersion: string };
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

/** Uzmana dönen görünüm: provider_meta'nın teknik ayrıntısı (uç adları, sağlayıcı) DIŞARI verilmez. */
export function toAnalysisView(row: ClassicAnalysisRow): ClassicAnalysisView {
  const pm = (row.provider_meta ?? {}) as { reference_date?: unknown; failed?: unknown; fetched_at?: unknown };
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    clientId: row.client_id,
    input: row.input,
    techniques: row.techniques ?? [],
    status: row.status,
    result: row.result,
    verification: row.verification,
    meta: {
      referenceDate: typeof pm.reference_date === "string" ? pm.reference_date : null,
      failed: Array.isArray(pm.failed) ? pm.failed.filter((x): x is string => typeof x === "string") : [],
      fetchedAt: typeof pm.fetched_at === "string" ? pm.fetched_at : null,
      methodologyVersion: row.methodology_version,
    },
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Hesaplama sonucu (KAYITSIZ). 30.10.2026 owner kararı: "Hesapla" kalıcı analiz kaydı OLUŞTURMAZ; kayıt yalnız
 * uzmanın açık "Kaydet" işlemiyle (persistClassicAnalysis) oluşur. Sağlayıcı önbelleği teknik ara katmandır —
 * önbellekteki yanıt kayıtlı analiz değildir.
 */
export type ClassicComputed = {
  result: Record<string, unknown>;
  verification: Record<string, unknown>;
  providerMeta: Record<string, unknown>;
  status: "complete" | "partial";
  /** Hesapta kullanılan Europe/Istanbul günü (hedef tarih verilmediyse tarih bağımlı uçların referansı). */
  referenceDate: string;
  /** SHA-256(kanonik {tür, teknikler, girdi, referans gün, sonuç}) — Kaydet anında "görülen sonuç = kaydedilen sonuç". */
  resultHash: string;
  fetchedAt: string;
};

export type ClassicComputeOpts = {
  /** Kaydet / taslak raporu: hesap anındaki referans gün (verilmezse bugün, Europe/Istanbul). */
  referenceDate?: string;
  /** true → YALNIZ önbellek; sağlayıcı çağrısı YOK (Kaydet / taslak raporu / taslak taşları). */
  cacheOnly?: boolean;
};

/** Sonuç bütünlük özeti (başlık ve danışan bağı HARİÇ — bunlar Kaydet anında değişebilir). */
export function classicResultHash(req: ClassicAnalysisRequest, referenceDate: string, result: unknown): string {
  return createHash("sha256")
    .update(canonicalJson({ v: 1, kind: req.kind, techniques: req.techniques, input: req.input, referenceDate, result }), "utf8")
    .digest("hex");
}

/** Hesap (kayıt YOK). Tüm türler için tek giriş. */
export async function computeClassicResult(
  ctx: ClassicServiceCtx,
  req: ClassicAnalysisRequest,
  deps: ClassicServiceDeps,
  opts: ClassicComputeOpts = {},
): Promise<ClassicServiceResponse<{ computed: ClassicComputed }>> {
  if (ctx.isDemo) return classicFail("DEMO_READONLY");
  const cacheOnly = opts.cacheOnly === true;
  // Bayrak kapalıyken (G1 geri dönüş) yeni hesap yok; önbellekten yeniden kurulum (Kaydet) sağlayıcıya gitmez → serbest.
  if (!cacheOnly && !deps.providerCallsEnabled) return classicFail("PROVIDER_CALLS_DISABLED");
  const now = deps.now ?? (() => new Date());
  const referenceDate = opts.referenceDate ?? istanbulToday(now());
  // Sağlayıcı doğumdan önceki hedef tarihi 400 ile reddeder (ve kotadan düşer) → yerelde engellenir.
  if (req.kind === "person" && isoBeforeBirth(req.input.targetDate ?? referenceDate, req.input.birth)) {
    return { status: 400, body: { ok: false, code: "TARGET_BEFORE_BIRTH", error: "Hedef tarih doğum tarihinden önce olamaz.", field: "input.targetDate" } };
  }
  // Başlık / danışan sonucu değiştirmez → tek-uçuş anahtarına girmez (aynı kişi aynı anda iki başlıkla = tek hesap).
  const flightKey = `${ctx.tenantId}|${ctx.userId}|${referenceDate}|${cacheOnly ? "c" : "p"}|${canonicalJson({ kind: req.kind, techniques: req.techniques, input: req.input })}`;
  return analysisFlight.run(flightKey, () => doCompute(ctx, req, deps, referenceDate, cacheOnly)) as Promise<ClassicServiceResponse<{ computed: ClassicComputed }>>;
}

async function doCompute(
  ctx: ClassicServiceCtx,
  req: ClassicAnalysisRequest,
  deps: ClassicServiceDeps,
  referenceDate: string,
  cacheOnly: boolean,
): Promise<ClassicServiceResponse<{ computed: ClassicComputed }>> {
  const now = deps.now ?? (() => new Date());
  const dailySeed = req.kind === "person" && req.techniques.includes("daily") ? classicDailySeed(deps.cacheSecret, req.input.fullName, req.input.birth) : null;
  const plan = planClassicCalls(req, referenceDate, { dailySeed });
  const outcomes = await mapLimit(plan, MAX_PARALLEL_CALLS, (c) => resolveCall(ctx, c, deps, cacheOnly));
  const oks = outcomes.filter((o): o is Extract<CallOutcome, { ok: true }> => o.ok);
  const fails = outcomes.filter((o): o is Extract<CallOutcome, { ok: false }> => !o.ok);
  if (oks.length === 0) {
    const d = dominantError(fails);
    return classicFail(d.code, d.retryAfterSec ? { retryAfterSec: d.retryAfterSec } : {});
  }

  const result: Record<string, unknown> = {};
  const verification: Record<string, unknown> = {};
  for (const o of oks) {
    // verifyWithOracle normalize sonucun doğrulama durumları eklenmiş KOPYASINI döner (girdi = sağlayıcı gövdesi).
    // Sonuç bu doğrulanmış kopyadır; `verification` sütunu üst düzey özetin bir kopyasını tutar (denetim/sorgu kolaylığı).
    const payload = plan.find((p) => p.label === o.label)?.payload ?? null;
    let verified: unknown = o.data;
    try {
      verified = deps.verify(o.endpointId, payload, o.data) ?? o.data;
      const top = verified && typeof verified === "object" ? (verified as { verification?: unknown }).verification : undefined;
      verification[o.label] = top ?? { status: "unverified" };
    } catch {
      verification[o.label] = { status: "error" };
    }
    // Günün Sayısı: tohum modu kayda eklenir (kişiye özel tohum mu, günün ortak sayısı mı) — sağlayıcı tohum metni saklanmaz.
    if (o.label === "daily" && verified && typeof verified === "object") {
      verified = { ...(verified as Record<string, unknown>), seed: null, seedMode: dailySeed ? "person" : "common" };
    }
    result[o.label] = verified;
  }
  // İki Sistem (dual): chart + chaldean'dan yerel türetme + bağımsız doğrulama (ek çağrı YOK).
  const derived: Record<string, string> = {};
  const failedLabels = fails.map((f) => f.label);
  if (req.kind === "person" && req.techniques.includes("dual")) {
    const d = deriveDualFromChartChaldean(result.chart, result.chaldean);
    if (d) {
      let dv: unknown = d;
      try {
        dv = deps.verify("dual", { name: req.input.fullName }, d) ?? d;
      } catch {
        dv = d;
      }
      result.dual = dv;
      const top = dv && typeof dv === "object" ? (dv as { verification?: unknown }).verification : undefined;
      verification.dual = top ?? { status: "unverified" };
      derived.dual = DUAL_DERIVATION;
    } else {
      failedLabels.push("dual");
    }
  }

  // Kişi haritası lang=tr çağrılır; aynı Life Path'in EN uğurlu ilişkileri (taş adları) sabit katalogdan
  // eklenir — ikinci sağlayıcı çağrısı YOK. Katalog boş/okunamazsa alan eklenmez (sonuç bozulmaz).
  const chart = result.chart;
  if (chart && typeof chart === "object" && !Array.isArray(chart)) {
    const lp = (deps.lifePathOf ?? defaultLifePathOf)(chart);
    if (lp !== null) {
      const cat = await getCatalogEntry(ctx.db, "lucky_association", lp, "en");
      if (cat.ok) result.chart = { ...(chart as Record<string, unknown>), luckyEn: cat.value.payload };
    }
  }
  const fetchedAt = now().toISOString();
  const providerMeta = {
    provider: "roxy",
    api: "v2",
    spec_version: CLASSIC_PROVIDER_SPEC_VERSION,
    adapter_version: CLASSIC_ADAPTER_VERSION,
    lang: CLASSIC_PROVIDER_LANG,
    fetched_at: fetchedAt,
    reference_date: req.kind === "person" ? (req.input.targetDate ?? referenceDate) : referenceDate,
    cache_hits: outcomes.filter((o) => o.cacheHit).length,
    provider_calls: outcomes.reduce((n, o) => n + o.attempts, 0),
    failed: failedLabels,
    derived,
    endpoints: outcomes.map((o) => ({
      label: o.label, endpoint: o.endpointId, cache_hit: o.cacheHit, outcome: o.ok ? "ok" : o.outcome, http: o.http, attempts: o.attempts,
    })),
  };
  const status = failedLabels.length ? "partial" : "complete";
  return {
    status: 200,
    body: {
      ok: true,
      computed: { result, verification, providerMeta, status, referenceDate, resultHash: classicResultHash(req, referenceDate, result), fetchedAt },
    },
  };
}

/** Danışan bağı denetimi (Kaydet / Güncelle): clients izni + danışan bu tenant'ta. */
async function checkClientLink(ctx: ClassicServiceCtx, clientId: string | null): Promise<ClassicServiceResponse<never> | null> {
  if (!clientId) return null;
  if (!ctx.canLinkClients) return classicFail("CLIENTS_PERMISSION_REQUIRED");
  const belongs = await clientBelongsToTenant(ctx.db, ctx.tenantId, clientId);
  if (belongs === null) return classicFail("DB_ERROR");
  if (!belongs) return classicFail("CLIENT_NOT_FOUND");
  return null;
}

/** Kaydedilmemiş sonucun uzman görünümü (kimlik yok; satır sürümü 0). */
export function draftView(req: ClassicAnalysisRequest, c: ClassicComputed): Omit<ClassicAnalysisView, "id"> & { id: null } {
  return {
    ...toAnalysisView({
      id: "",
      tenant_id: "",
      client_id: req.clientId,
      created_by: null,
      kind: req.kind,
      title: req.title,
      input: req.input,
      techniques: req.techniques,
      result: c.result,
      verification: c.verification,
      provider_meta: c.providerMeta,
      methodology_version: CLASSIC_METHODOLOGY_VERSION,
      api_schema_version: CLASSIC_PROVIDER_SPEC_VERSION,
      status: c.status,
      row_version: 0,
      created_at: c.fetchedAt,
      updated_at: c.fetchedAt,
    }),
    id: null,
  };
}

/** Kaydedilmemiş sonucu bellek içi satıra çevirir (taslak Word / PNG / taşlar için; DB'ye YAZILMAZ). */
export function draftRow(ctx: ClassicServiceCtx, req: ClassicAnalysisRequest, c: ClassicComputed): ClassicAnalysisRow {
  return {
    id: "taslak",
    tenant_id: ctx.tenantId,
    client_id: req.clientId,
    created_by: ctx.userId,
    kind: req.kind,
    title: req.title,
    input: req.input,
    techniques: req.techniques,
    result: c.result,
    verification: c.verification,
    provider_meta: c.providerMeta,
    methodology_version: CLASSIC_METHODOLOGY_VERSION,
    api_schema_version: CLASSIC_PROVIDER_SPEC_VERSION,
    status: c.status,
    row_version: 0,
    created_at: c.fetchedAt,
    updated_at: c.fetchedAt,
  };
}

export type ClassicDraftRef = { request: ClassicAnalysisRequest; referenceDate: string; resultHash: string };

/**
 * Taslağı YALNIZ önbellekten yeniden kurar ve uzmanın gördüğü sonuçla birebir aynı olduğunu doğrular
 * (sağlayıcı çağrısı YOK). Önbellekte yoksa / sonuç değiştiyse 409 DRAFT_STALE → uzman yeniden hesaplar.
 */
export async function rebuildClassicDraft(
  ctx: ClassicServiceCtx,
  ref: ClassicDraftRef,
  deps: ClassicServiceDeps,
): Promise<ClassicServiceResponse<{ computed: ClassicComputed }>> {
  const r = await computeClassicResult(ctx, ref.request, deps, { referenceDate: ref.referenceDate, cacheOnly: true });
  if (!r.body.ok) return r;
  if (r.body.computed.resultHash !== ref.resultHash) return classicFail("DRAFT_STALE");
  return r;
}

/** Açık "Kaydet": taslak önbellekten doğrulanır → TEK INSERT. */
export async function persistClassicAnalysis(
  ctx: ClassicServiceCtx,
  ref: ClassicDraftRef,
  deps: ClassicServiceDeps,
): Promise<ClassicServiceResponse<{ analysis: ClassicAnalysisView }>> {
  if (ctx.isDemo) return classicFail("DEMO_READONLY");
  const link = await checkClientLink(ctx, ref.request.clientId);
  if (link) return link;
  const r = await rebuildClassicDraft(ctx, ref, deps);
  if (!r.body.ok) return { status: r.status, body: r.body };
  const c = r.body.computed;
  const req = ref.request;
  const saved = await insertAnalysis(ctx.db, ctx.tenantId, {
    clientId: req.clientId,
    createdBy: ctx.userId,
    kind: req.kind,
    title: req.title,
    input: req.input,
    techniques: req.techniques,
    result: c.result,
    verification: c.verification,
    providerMeta: c.providerMeta,
    methodologyVersion: CLASSIC_METHODOLOGY_VERSION,
    apiSchemaVersion: CLASSIC_PROVIDER_SPEC_VERSION,
    status: c.status,
  });
  if (!saved.ok) return classicFail("SAVE_FAILED");
  const row: ClassicAnalysisRow = { ...draftRow(ctx, req, c), ...saved.value, tenant_id: ctx.tenantId, created_by: ctx.userId };
  return { status: 201, body: { ok: true, analysis: toAnalysisView(row) } };
}

/**
 * Açık "Kaydı Güncelle": kayıtlı analizin girdisi + sonucu, uzmanın "Bilgileri Düzenle → Yeniden Hesapla" ile
 * gördüğü taslakla değiştirilir (row_version CAS; tür değişmez). Sessiz güncelleme YOK — yalnız bu uçla.
 */
export async function replaceClassicAnalysis(
  ctx: ClassicServiceCtx,
  id: string,
  rowVersion: number,
  ref: ClassicDraftRef,
  deps: ClassicServiceDeps,
): Promise<ClassicServiceResponse<{ analysis: ClassicAnalysisView }>> {
  if (ctx.isDemo) return classicFail("DEMO_READONLY");
  const link = await checkClientLink(ctx, ref.request.clientId);
  if (link) return link;
  const r = await rebuildClassicDraft(ctx, ref, deps);
  if (!r.body.ok) return { status: r.status, body: r.body };
  const c = r.body.computed;
  const req = ref.request;
  const u = await replaceAnalysisContent(ctx.db, ctx.tenantId, id, rowVersion, {
    kind: req.kind,
    title: req.title,
    clientId: req.clientId,
    input: req.input,
    techniques: req.techniques,
    result: c.result,
    verification: c.verification,
    providerMeta: c.providerMeta,
    methodologyVersion: CLASSIC_METHODOLOGY_VERSION,
    apiSchemaVersion: CLASSIC_PROVIDER_SPEC_VERSION,
    status: c.status,
  });
  if (!u.ok) {
    if (u.reason === "not_found") return classicFail("NOT_FOUND");
    if (u.reason === "conflict") return classicFail("CONFLICT");
    return classicFail("DB_ERROR");
  }
  return { status: 200, body: { ok: true, analysis: toAnalysisView(u.value) } };
}

// Tür bazlı ince sarmalayıcılar (çağıran tarafın okunabilirliği için; hepsi KAYITSIZ hesap).
export const computePersonAnalysis = (ctx: ClassicServiceCtx, req: Extract<ClassicAnalysisRequest, { kind: "person" }>, deps: ClassicServiceDeps) => computeClassicResult(ctx, req, deps);
export const computeRelationship = (ctx: ClassicServiceCtx, req: Extract<ClassicAnalysisRequest, { kind: "relationship" }>, deps: ClassicServiceDeps) => computeClassicResult(ctx, req, deps);
export const computeBusiness = (ctx: ClassicServiceCtx, req: Extract<ClassicAnalysisRequest, { kind: "business" }>, deps: ClassicServiceDeps) => computeClassicResult(ctx, req, deps);
export const computeNames = (ctx: ClassicServiceCtx, req: Extract<ClassicAnalysisRequest, { kind: "names" }>, deps: ClassicServiceDeps) => computeClassicResult(ctx, req, deps);
