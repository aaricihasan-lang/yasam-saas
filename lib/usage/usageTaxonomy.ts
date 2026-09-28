/**
 * USAGE360 — TELEMETRİ SÖZLÜĞÜ (tek TS kaynağı).
 *
 * Tüm değerler migration 20270205000000_usage360_telemetry_core.sql'deki SQL sözlük
 * fonksiyonlarıyla (usage360_actions / usage360_channels / …) BİREBİR aynıdır;
 * scripts/usage360/logic-harness.ts ikisini karşılaştırır. Yeni değer eklemek = migration +
 * bu dosya birlikte.
 *
 * MAHREMİYET: Olay satırında yalnız bu enum'lar bulunur. Serbest metin / JSON metadata /
 * URL / kayıt adı / hata mesajı alanı yoktur (yapısal engel).
 */
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";
import { MODULE_USAGE_KEYS } from "@/lib/admin/stats/moduleUsageRegistry";

/** Kanonik modül anahtarları (ModuleGateKey ile tam kapsam; registry Record<ModuleGateKey> türetir). */
export const USAGE_MODULE_KEYS: readonly ModuleGateKey[] = MODULE_USAGE_KEYS;

export function isUsageModuleKey(v: unknown): v is ModuleGateKey {
  return typeof v === "string" && (USAGE_MODULE_KEYS as readonly string[]).includes(v);
}

/** Anlamlı olay eylemleri (DB: usage360_actions). */
export const USAGE_ACTIONS = [
  "module_opened",
  "record_created",
  "record_updated",
  "record_deleted",
  "analysis_run",
  "report_generated",
  "report_exported",
  "file_uploaded",
  "ai_task_completed",
  "action_failed",
] as const;
export type UsageAction = (typeof USAGE_ACTIONS)[number];

export function isUsageAction(v: unknown): v is UsageAction {
  return typeof v === "string" && (USAGE_ACTIONS as readonly string[]).includes(v);
}

/** Sunucu route'larının trackUsage ile üretebileceği eylemler (module_opened istemci sinyalidir). */
export type ServerUsageAction = Exclude<UsageAction, "module_opened">;

/** Başarısız olabilen (failed_action) eylemler. */
export type FailableUsageAction = Exclude<UsageAction, "module_opened" | "action_failed">;

/** İstemciden (beacon) kabul edilen olaylar. CREATE/UPDATE/DELETE ASLA istemciden gelmez. */
export const CLIENT_BEACON_KINDS = ["ping", "module_opened", "report_exported", "action_failed"] as const;
export type ClientBeaconKind = (typeof CLIENT_BEACON_KINDS)[number];

/** Kanal (DB: usage360_channels). android_webview_derived = resmi UA soneki OLMADAN türetilmiş Android. */
export const USAGE_CHANNELS = [
  "desktop_web",
  "mobile_web",
  "tablet_web",
  "android_app",
  "android_webview_derived",
  "unknown",
] as const;
export type UsageChannel = (typeof USAGE_CHANNELS)[number];

export const USAGE_OS_FAMILIES = ["android", "ios", "windows", "macos", "linux", "chromeos", "other"] as const;
export type UsageOsFamily = (typeof USAGE_OS_FAMILIES)[number];

export const USAGE_BROWSER_FAMILIES = ["chrome", "safari", "firefox", "edge", "samsung", "opera", "webview", "other"] as const;
export type UsageBrowserFamily = (typeof USAGE_BROWSER_FAMILIES)[number];

/** Hata sınıfı (DB: usage360_error_classes). Mesaj/stack ASLA tutulmaz; yalnız sınıf. */
export const USAGE_ERROR_CLASSES = [
  "validation",
  "permission",
  "conflict",
  "too_large",
  "server",
  "timeout",
  "network",
  "client_export",
  "client_upload",
] as const;
export type UsageErrorClass = (typeof USAGE_ERROR_CLASSES)[number];

/** İstemcinin bildirebileceği hata sınıfları (sunucu sınıflarını istemci üretemez). */
export const CLIENT_ERROR_CLASSES = ["network", "timeout", "client_export", "client_upload"] as const satisfies readonly UsageErrorClass[];
export type ClientErrorClass = (typeof CLIENT_ERROR_CLASSES)[number];

/** Toplu işlemlerde öğe sayısı — kesin sayı yerine kova (minimum veri). */
export const ITEM_COUNT_BUCKETS = ["1", "2-10", "11-50", "51+"] as const;
export type ItemCountBucket = (typeof ITEM_COUNT_BUCKETS)[number];

export function toItemCountBucket(n: number): ItemCountBucket | null {
  if (!Number.isFinite(n) || n < 1) return null;
  if (n === 1) return "1";
  if (n <= 10) return "2-10";
  if (n <= 50) return "11-50";
  return "51+";
}

/**
 * Alt-varlık türü (ör. clients altında "session" / "analysis"). DB yalnız biçimi zorlar
 * (^[a-z][a-z0-9_]{0,31}$); modül başına izinli değerler BURADA tutulur (AŞAMA 2B genişletir).
 */
export const USAGE_SUB_ENTITIES: Partial<Record<ModuleGateKey, readonly string[]>> = {
  clients: ["analysis"],
  numerology: ["analysis"],
  stones: ["stone"],
  reflexology: ["protocol"],
};

export function isAllowedSubEntity(module: ModuleGateKey, sub: string): boolean {
  return (USAGE_SUB_ENTITIES[module] ?? []).includes(sub);
}

/**
 * AŞAMA 1 öncesi olay türleri (expert_usage_events.event_type) → Usage360 eylemi.
 * Eski satırlar action=NULL kalır; okumada bu eşleme kullanılır.
 */
export const LEGACY_EVENT_ACTION = {
  analysis_created: { action: "analysis_run", subEntity: "analysis" },
  record_created: { action: "record_created", subEntity: null },
  record_updated: { action: "record_updated", subEntity: null },
  protocol_created: { action: "record_created", subEntity: "protocol" },
  report_generated: { action: "report_generated", subEntity: null },
  guide_created: { action: "record_created", subEntity: "guide" },
  translation_completed: { action: "ai_task_completed", subEntity: null },
} as const satisfies Record<string, { action: ServerUsageAction; subEntity: string | null }>;

export type LegacyUsageEventType = keyof typeof LEGACY_EVENT_ACTION;
