/**
 * USAGE360 — SUNUCU OLAY YARDIMCISI (tek sözleşme; AŞAMA 2B tüm modüller bunu kullanır).
 *
 *   await trackUsage(guard, req, { module: "stones", action: "record_created", subEntity: "stone", resourceId: id });
 *
 * KURALLAR:
 *   * Kimlik YALNIZ route guard'ından (guard.userId / guard.tenantId). İstemci gövdesinden
 *     user/tenant ALINMAZ; RPC ayrıca users tablosundan tenant eşleşmesini ve rolü doğrular.
 *   * Ana işlem BAŞARILI olduktan sonra çağrılır. Asla throw etmez; telemetri hatası iş
 *     işlemini bozmaz / geri almaz. Loglar yalnız enum değerleri + hata kodu içerir.
 *   * resourceId yalnız idempotency için HMAC'lanır; ham id DB'ye/loga YAZILMAZ.
 *   * Admin ve demo hesaplar: no-op (uzman istatistiğine karışmaz).
 *   * USAGE360_ENABLED kapalıyken yalnız AŞAMA 1 öncesi 4 olay (legacyEventType) eski
 *     biçimde yazılır (mevcut "Ölçülen işlem" metriği kırılmaz); diğer her şey no-op.
 */
import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";
import { isUsage360Enabled } from "@/lib/usage/usageFlag";
import { resolveUsageClientContext, type UsageClientContext } from "@/lib/usage/clientContext";
import { recordUsageEvent } from "@/lib/usage/usageEvents";
import {
  isAllowedSubEntity,
  isUsageModuleKey,
  toItemCountBucket,
  USAGE_ERROR_CLASSES,
  type FailableUsageAction,
  type LegacyUsageEventType,
  type ServerUsageAction,
  type UsageAction,
  type UsageErrorClass,
} from "@/lib/usage/usageTaxonomy";

/** Route guard'ının (verifyUserRequest / requireModuleAccess) ihtiyaç duyulan alt kümesi. */
export type UsageGuardContext = {
  userId: string;
  tenantId: string;
  is_demo_account: boolean;
  db: SupabaseClient;
  profile?: Record<string, unknown>;
};

export type TrackUsageSpec = {
  module: ModuleGateKey;
  action: ServerUsageAction;
  subEntity?: string | null;
  /** Yalnız idempotency için; HMAC'lanır, saklanmaz. */
  resourceId?: string | null;
  itemCount?: number | null;
  failedAction?: FailableUsageAction | null;
  errorClass?: UsageErrorClass | null;
  /** Yalnız AŞAMA 1 öncesi 4 çağrı noktası: flag kapalıyken eski satır biçimi korunur. */
  legacyEventType?: LegacyUsageEventType | null;
};

export type TrackUsageStatus =
  | "disabled" // flag kapalı, eski olay değil
  | "legacy" // flag kapalı, eski biçim yazıldı (veya dedup)
  | "noop" // admin / demo / bilinmeyen kullanıcı
  | "invalid" // sözleşme ihlali (kod hatası) — yazılmadı
  | "rejected" // RPC reddi (tenant uyuşmazlığı / geçersiz oturum)
  | "deduped"
  | "ok"
  | "error";

/**
 * Aynı kaynak için bir kez anlamlı olan eylemler: kaynak id'sinden kalıcı dedup.
 * Diğerleri (update/rapor/hata) aynı kaynakta tekrar olabilir → 60 sn kovası ile dedup
 * (çift tık / retry tek sayılır, gerçek tekrar sayılır).
 */
const ONCE_PER_RESOURCE: ReadonlySet<UsageAction> = new Set<UsageAction>([
  "record_created",
  "record_deleted",
  "analysis_run",
  "file_uploaded",
  "ai_task_completed",
]);
export const IDEM_WINDOW_SECONDS = 60;

/**
 * HMAC anahtarı — yalnız sunucu env'i. Öncelik: USAGE360_HASH_SECRET → mevcut sunucu
 * sırrından alan-ayrımlı türetme (SUPABASE_SERVICE_ROLE_KEY) → yalnız yerel geliştirmede
 * sabit değer. Sır hiçbir yere yazılmaz. (lib/auth/loginThrottle.ts ile aynı desen.)
 */
export function resolveUsageHashSecret(env: Record<string, string | undefined> = process.env): string {
  const v = env.USAGE360_HASH_SECRET?.trim();
  if (v) return v;
  const serverSecret = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serverSecret) {
    return createHash("sha256").update(`yasam:usage360-idem:v1:${serverSecret}`).digest("hex");
  }
  return "dev-only-yasam-usage360-idem";
}

/** Geri döndürülemez dedup anahtarı (64 hex). Ham kaynak id'si içermez. */
export function buildUsageIdemHash(
  input: { userId: string; module: ModuleGateKey; action: UsageAction; resourceId: string; nowMs?: number },
  secret: string = resolveUsageHashSecret(),
): string {
  const window = ONCE_PER_RESOURCE.has(input.action)
    ? "once"
    : String(Math.floor((input.nowMs ?? Date.now()) / 1000 / IDEM_WINDOW_SECONDS));
  return createHmac("sha256", secret)
    .update(`usage360:v1|${input.userId}|${input.module}|${input.action}|${input.resourceId}|${window}`)
    .digest("hex");
}

const UNKNOWN_CONTEXT: UsageClientContext = {
  channel: "unknown",
  osFamily: "other",
  browserFamily: "other",
  appVersion: null,
  country: null,
  city: null,
};

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return String(profile?.role ?? "").trim().toLowerCase() === "admin";
}

function validateSpec(spec: TrackUsageSpec): boolean {
  if (!isUsageModuleKey(spec.module)) return false;
  if (spec.subEntity != null && !isAllowedSubEntity(spec.module, spec.subEntity)) return false;
  if (spec.action === "action_failed") {
    if (!spec.errorClass || !(USAGE_ERROR_CLASSES as readonly string[]).includes(spec.errorClass)) return false;
  } else if (spec.errorClass != null || spec.failedAction != null) {
    return false;
  }
  return true;
}

function logSafe(level: "warn" | "error", msg: string, spec: TrackUsageSpec, code?: string | null): void {
  // PII/iş içeriği YOK: yalnız enum değerleri ve hata kodu.
  console[level](`[usage360] ${msg}`, { module: spec.module, action: spec.action, code: code ?? null });
}

export async function trackUsage(
  guard: UsageGuardContext,
  req: { headers: Headers } | null,
  spec: TrackUsageSpec,
  env: Record<string, string | undefined> = process.env,
): Promise<{ status: TrackUsageStatus }> {
  try {
    if (guard.is_demo_account || isAdminProfile(guard.profile)) return { status: "noop" };
    if (!validateSpec(spec)) {
      logSafe("warn", "invalid spec", spec);
      return { status: "invalid" };
    }

    const idem = spec.resourceId
      ? buildUsageIdemHash({ userId: guard.userId, module: spec.module, action: spec.action, resourceId: spec.resourceId }, resolveUsageHashSecret(env))
      : null;

    if (!isUsage360Enabled(env)) {
      if (!spec.legacyEventType) return { status: "disabled" };
      // AŞAMA 1 öncesi davranış: aynı 5 kolonlu satır (idempotency artık HMAC).
      const r = await recordUsageEvent(guard.db, {
        tenantId: guard.tenantId,
        userId: guard.userId,
        moduleKey: spec.module,
        eventType: spec.legacyEventType,
        idempotencyKey: idem,
      });
      return { status: r.ok ? "legacy" : "error" };
    }

    const ctx = req ? resolveUsageClientContext(req.headers) : UNKNOWN_CONTEXT;
    const token = req?.headers.get("x-session-token")?.trim() || null;
    const { data, error } = await guard.db.rpc("usage360_track", {
      p_user_id: guard.userId,
      p_tenant_id: guard.tenantId,
      p_session_token: token,
      p_module_key: spec.module,
      p_action: spec.action,
      p_sub_entity: spec.subEntity ?? null,
      p_failed_action: spec.failedAction ?? null,
      p_error_class: spec.errorClass ?? null,
      p_item_count_bucket: spec.itemCount != null ? toItemCountBucket(spec.itemCount) : null,
      p_source: "server",
      p_idempotency_key: idem,
      p_legacy_event_type: spec.legacyEventType ?? null,
      p_channel: ctx.channel,
      p_os_family: ctx.osFamily,
      p_browser_family: ctx.browserFamily,
      p_app_version: ctx.appVersion,
      p_country: ctx.country,
      p_city: ctx.city,
    });
    if (error) {
      logSafe("error", "track failed", spec, (error as { code?: string }).code ?? null);
      return { status: "error" };
    }
    const status = String(data ?? "");
    if (status === "ok" || status === "deduped" || status === "noop" || status === "rejected") {
      if (status === "rejected") logSafe("warn", "track rejected", spec);
      return { status };
    }
    logSafe("error", "track unexpected result", spec);
    return { status: "error" };
  } catch (e) {
    logSafe("error", "track unexpected error", spec, e instanceof Error ? e.name : "unknown");
    return { status: "error" };
  }
}
