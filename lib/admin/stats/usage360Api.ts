/**
 * USAGE360 2C — Admin 360 API eşleme katmanı (saf; route'lar ve harness kullanır).
 *
 * Girdi yalnız okuma RPC'lerinin döndürdüğü sayı/zaman/enum alanlarıdır; çıktı da öyle kalır.
 * Serbest metin, iş kaydı kimliği, dosya adı vb. alan EKLENMEZ (tipler buna izin vermez).
 */
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { MODULE_USAGE_KEYS, MODULE_USAGE_REGISTRY } from "@/lib/admin/stats/moduleUsageRegistry";
import { ADMIN_ONLY_MODULE_KEYS } from "@/lib/auth/moduleAccessCore";
import { LEGACY_EVENT_ACTION, isUsageModuleKey } from "@/lib/usage/usageTaxonomy";
import type {
  Usage360Counts,
  Usage360ExpertRow,
  Usage360ModuleRow,
  Usage360ModuleStatus,
  Usage360TimelineRow,
} from "@/lib/admin/stats/apiTypes";

const num = (v: unknown): number => (typeof v === "number" ? v : v == null ? 0 : Number(v) || 0);
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));

export function moduleLabel(key: string): string {
  return isUsageModuleKey(key) ? MODULE_USAGE_REGISTRY[key].label : key;
}

/** Uzmana izinli, uzman kullanımına açık modüller (admin-only modüller hariç). */
export function allowedExpertModules(role: unknown, permissions: unknown): { key: string; label: string }[] {
  return MODULE_USAGE_KEYS
    .filter((k) => !ADMIN_ONLY_MODULE_KEYS.has(k) && resolveModuleAccess(role ?? "expert", permissions, k))
    .map((k) => ({ key: k, label: MODULE_USAGE_REGISTRY[k].label }));
}

export function mapExpertRow(r: Record<string, unknown>): Usage360ExpertRow {
  const active = r.active === true ? true : r.active === false ? false : null;
  const approval = String(r.approval_status ?? "");
  const ch = r.channel_visits_30d && typeof r.channel_visits_30d === "object" ? (r.channel_visits_30d as Record<string, unknown>) : {};
  return {
    userId: String(r.user_id),
    fullName: String(r.full_name ?? "").trim(),
    email: String(r.email ?? "").trim(),
    active,
    approvalStatus: approval,
    isDemo: r.is_demo_account === true,
    isArchived: active === false && approval.trim().toLowerCase() === "approved",
    accountCreatedAt: strOrNull(r.created_at),
    lastLoginAt: strOrNull(r.last_login),
    lastSeenAt: strOrNull(r.last_seen),
    lastActivityAt: strOrNull(r.last_activity),
    today: {
      visits: num(r.today_visits),
      activeSeconds: num(r.today_active_seconds),
      modules: num(r.today_modules),
      actions: num(r.today_actions),
    },
    d7ActiveDays: num(r.d7_active_days),
    d30ActiveDays: num(r.d30_active_days),
    channelVisits30d: Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, num(v)])),
    accessibleModuleCount: allowedExpertModules("expert", r.module_permissions).length,
  };
}

export function mapCounts(o: Record<string, unknown> | null | undefined): Usage360Counts {
  const x = o ?? {};
  return {
    visits: num(x.visits), activeSeconds: num(x.activeSeconds), moduleOpens: num(x.moduleOpens), actions: num(x.actions),
    creates: num(x.creates), updates: num(x.updates), deletes: num(x.deletes), analyses: num(x.analyses),
    reportsGenerated: num(x.reportsGenerated), reportsExported: num(x.reportsExported), uploads: num(x.uploads),
    aiTasks: num(x.aiTasks), failures: num(x.failures),
  };
}

/**
 * Modül durumu (objektif; değerlendirme/skor YOK):
 *   actioned      — dönemde gerçek işlem var
 *   opened_only   — dönemde açıldı/süre var ama işlem yok
 *   never_opened  — ölçüm başlangıcından beri HİÇ açılmadı (yalnız ölçüm varken; eski dönem "kullanılmadı" sayılmaz)
 *   not_measured  — ölçüm yok (Usage360 başlamadı) veya dönemde kullanım izi yok
 */
export function moduleStatus(args: {
  periodRow: { actions: number; moduleOpens: number; activeSeconds: number } | null;
  everOpened: boolean;
  measurementStart: string | null;
}): Usage360ModuleStatus {
  if (!args.measurementStart) return "not_measured";
  if (args.periodRow && args.periodRow.actions > 0) return "actioned";
  if (args.periodRow && (args.periodRow.moduleOpens > 0 || args.periodRow.activeSeconds > 0)) return "opened_only";
  if (!args.everOpened) return "never_opened";
  return "not_measured";
}

export function buildModuleRows(args: {
  rpcModules: Record<string, unknown>[];
  everOpened: string[];
  allowed: { key: string; label: string }[];
  measurementStart: string | null;
}): Usage360ModuleRow[] {
  const byKey = new Map(args.rpcModules.map((m) => [String(m.module), m]));
  const allowedKeys = new Set(args.allowed.map((a) => a.key));
  const keys = [...new Set([...args.allowed.map((a) => a.key), ...byKey.keys()])];
  const ever = new Set(args.everOpened);
  return keys.map((key) => {
    const m = byKey.get(key) ?? null;
    const c = mapCounts(m);
    return {
      module: key,
      label: moduleLabel(key),
      allowed: allowedKeys.has(key),
      status: moduleStatus({ periodRow: m ? c : null, everOpened: ever.has(key), measurementStart: args.measurementStart }),
      firstAt: strOrNull(m?.firstAt), lastAt: strOrNull(m?.lastAt),
      firstEverAt: strOrNull(m?.firstEverAt), lastEverAt: strOrNull(m?.lastEverAt),
      activeDays: num(m?.activeDays), lastActionAt: strOrNull(m?.lastActionAt),
      activeSeconds: c.activeSeconds, moduleOpens: c.moduleOpens, actions: c.actions, creates: c.creates, updates: c.updates,
      deletes: c.deletes, analyses: c.analyses, reportsGenerated: c.reportsGenerated, reportsExported: c.reportsExported,
      uploads: c.uploads, aiTasks: c.aiTasks, failures: c.failures,
    };
  });
}

export function mapTimelineRow(r: Record<string, unknown>): Usage360TimelineRow {
  const legacy = r.event_type != null ? LEGACY_EVENT_ACTION[String(r.event_type) as keyof typeof LEGACY_EVENT_ACTION] : undefined;
  const action = r.action != null ? String(r.action) : legacy?.action ?? "record_created";
  const sub = r.sub_entity != null ? String(r.sub_entity) : r.action == null ? legacy?.subEntity ?? null : null;
  return {
    at: String(r.occurred_at),
    module: String(r.module_key),
    label: moduleLabel(String(r.module_key)),
    action,
    subEntity: sub,
    failedAction: strOrNull(r.failed_action),
    errorClass: strOrNull(r.error_class),
    channel: strOrNull(r.channel),
    source: strOrNull(r.source),
    itemBucket: strOrNull(r.item_count_bucket),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opak imleç: base64url({ at, id }) — id telemetri satırının kendi id'sidir (iş kaydı değil). */
export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify({ at, id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null): { at: string; id: string } | null | "invalid" {
  if (!raw) return null;
  try {
    const o = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { at?: unknown; id?: unknown };
    if (typeof o.at !== "string" || !Number.isFinite(Date.parse(o.at)) || typeof o.id !== "string" || !UUID_RE.test(o.id)) return "invalid";
    return { at: o.at, id: o.id };
  } catch {
    return "invalid";
  }
}
