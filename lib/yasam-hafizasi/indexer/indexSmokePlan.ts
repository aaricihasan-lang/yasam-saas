/**
 * Yaşam Hafızası™ — İndeks Smoke Planı (Sprint 2 / S2.12A, framework-agnostic).
 *
 * S2.05–S2.11 indeksleme zincirini GERÇEK DB'de kontrollü doğrulamak için smoke
 * aracının SAF/enjekte-IO çekirdeği. CLI global durumundan bağımsız; test edilir.
 *
 * ⚠️ MODEL B — FAIL-CLOSED (gerçek mutasyon devre dışı):
 *   `indexSourcePage` SOURCE-SAYFA düzeyinde çalışır ve PROTECTED'tir → tek-kayıt
 *   WRITE izolasyonu TEKNİK OLARAK KANITLANAMAZ. İndeks tablosunda provenance/run
 *   marker kolonu YOKTUR (migration yasak) → cleanup, smoke ÖNCESİ var olan gerçek
 *   satırı silmekten AYIRT EDEMEZ. Bu yüzden:
 *     - Gerçek `write` HER ORTAMDA fail-closed reddedilir (write-isolation-not-proven
 *       / production'da production-write-disabled). indexSourcePage write MODUNDA
 *       hiç çağrılmaz.
 *     - Gerçek `cleanup delete` HER ORTAMDA fail-closed reddedilir
 *       (cleanup-provenance-not-available / production-cleanup-disabled). Silme kodu
 *       CLI'de dahi BULUNMAZ.
 *   İzin verilenler: plan-only · dry-run (salt-okuma, yazma yok) · cleanup-plan
 *   (yalnız hedef SAYIMI, silme yok). "Yalnız test verisi olan ortamda çalıştırın"
 *   gibi insan talimatı, teknik fail-closed'un yerine GEÇMEZ.
 *
 * SINIR — bu dosyada BULUNMAZ:
 *   process.argv / process.env / Supabase / getServerDb / fetch / network / IO / console.
 */

import { createHash } from "node:crypto";

import { resolveYhSourceConfig } from "./adminIndexRequest";
import type { IndexSourcePageResult } from "./indexSourcePage";
import type { SourceConfig } from "./sources";

export type SmokeEnvironment = "local" | "staging" | "production";
export type SmokePhase = "dry-run" | "write" | "cleanup";

/** Ortam-başı sabit confirmation ifadeleri (production daha güçlü). */
export const SMOKE_CONFIRMATIONS: Record<SmokeEnvironment, string> = {
  local: "YH-SMOKE-LOCAL",
  staging: "YH-SMOKE-STAGING",
  production: "YH-SMOKE-PRODUCTION-I-UNDERSTAND-THE-RISK",
};

/** Cleanup DELETE niyeti için ayrı açık ifade (yine de fail-closed reddedilir). */
export const SMOKE_CLEANUP_CONFIRMATION = "YH-SMOKE-CLEANUP-DELETE";

export interface SmokeArgs {
  readonly execute: boolean;
  readonly environment?: string;
  readonly phase?: string;
  readonly sourceKey?: string;
  readonly tenantId?: string;
  readonly testRecordId?: string;
  readonly afterId?: string | null;
  readonly limit?: number;
  readonly confirmation?: string;
  readonly cleanupConfirmation?: string;
}

export type SmokeErrorCode =
  | "invalid-environment"
  | "missing-confirmation"
  | "invalid-confirmation"
  | "missing-source-key"
  | "unknown-source"
  | "missing-tenant"
  | "invalid-tenant"
  | "missing-test-record"
  | "invalid-test-record"
  | "invalid-phase"
  | "invalid-limit"
  | "invalid-cursor"
  | "missing-credentials"
  | "demo-target-forbidden"
  | "demo-check-failed"
  | "index-failed"
  | "write-isolation-not-proven"
  | "production-write-disabled"
  | "cleanup-provenance-not-available"
  | "production-cleanup-disabled"
  | "cleanup-count-failed";

export interface ValidatedSmokeActivation {
  readonly environment: SmokeEnvironment;
  readonly phase: SmokePhase;
  readonly sourceKey: string;
  readonly config: SourceConfig;
  readonly tenantId: string;
  readonly testRecordId: string;
  readonly afterId: string | null;
  readonly limit: number;
}

export type SmokeActivation =
  | { readonly ok: true; readonly value: ValidatedSmokeActivation }
  | { readonly ok: false; readonly code: SmokeErrorCode };

/** Redakte edilmiş güvenli özet (ham içerik / tam id / cursor değeri YOK). */
export interface SafeSmokeSummary {
  readonly environment: SmokeEnvironment;
  readonly phase: SmokePhase;
  readonly sourceKey: string;
  readonly tenantIdRedacted: string;
  readonly testRecordIdRedacted: string;
  readonly limit: number;
  readonly cursorPresent: boolean;
  readonly fetched: number;
  readonly produced: number;
  readonly skipped: number;
  readonly eligibleUnits: number;
  readonly excludedDemo: number;
}

export interface SmokeDeps {
  /** Yalnız BOOLEAN: service-role env var'ları mevcut mu (değer okunmaz). */
  readonly hasCredentials: () => boolean;
  /** Hedef tenant demo mu? (error-aware, fail-closed). */
  readonly checkDemoTarget: (input: {
    readonly tenantId: string;
  }) => Promise<{ ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" }>;
  /** S2.10 `indexSourcePage` — YALNIZ dry-run (salt-okuma). Write modu ÇAĞRILMAZ. */
  readonly runDryRunPage: (v: ValidatedSmokeActivation) => Promise<IndexSourcePageResult>;
  /** Cleanup hedef SAYIMI (salt-okuma; index.source_id=testRecordId). Silme YOK. */
  readonly countCleanupTargets?: (input: {
    readonly sourceTable: string;
    readonly testRecordId: string;
  }) => Promise<{ count: number }>;
}

export type SmokeStatus = "plan-only" | "dry-run-ok" | "cleanup-plan-ok" | "rejected";

export interface SmokeOutcome {
  readonly status: SmokeStatus;
  readonly code: SmokeErrorCode | null;
  readonly exitCode: number;
  readonly summary: SafeSmokeSummary | null;
  /** Girdilerden türetilmiş deterministik hedef ETİKETİ. İZOLASYON KANITI DEĞİLDİR. */
  readonly targetFingerprint?: string;
  readonly cleanupTargetCount?: number;
}

// ─── Yardımcılar (saf) ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}
function isEnvironment(v: unknown): v is SmokeEnvironment {
  return v === "local" || v === "staging" || v === "production";
}
function isPhase(v: unknown): v is SmokePhase {
  return v === "dry-run" || v === "write" || v === "cleanup";
}

/** Id'yi loglama için redakte eder (ilk 8 + uzunluk; tam değer sızmaz). */
export function redactId(id: string): string {
  return `${id.slice(0, 8)}…(${id.length})`;
}

/**
 * Aktivasyon hedefinin deterministik ETİKETİ (yalnız girdilerden; node:crypto).
 * DİKKAT: Bu bir hedef etiketidir; gerçek sayfa/kapsam İZOLASYON KANITI DEĞİLDİR.
 */
export function computeTargetFingerprint(v: ValidatedSmokeActivation): string {
  const canonical = [v.environment, v.sourceKey, v.tenantId, v.testRecordId, v.afterId ?? "", String(v.limit), "s2.12a"].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ─── Aktivasyon doğrulama (saf; fail-closed) ─────────────────────────────────

export function validateSmokeActivation(args: SmokeArgs): SmokeActivation {
  if (!isEnvironment(args.environment)) return { ok: false, code: "invalid-environment" };
  const environment = args.environment;

  if (args.confirmation === undefined || args.confirmation === "") return { ok: false, code: "missing-confirmation" };
  if (args.confirmation !== SMOKE_CONFIRMATIONS[environment]) return { ok: false, code: "invalid-confirmation" };

  if (!isPhase(args.phase)) return { ok: false, code: "invalid-phase" };
  const phase = args.phase;

  if (!isNonEmptyString(args.sourceKey)) return { ok: false, code: "missing-source-key" };
  const config = resolveYhSourceConfig(args.sourceKey);
  if (config === null) return { ok: false, code: "unknown-source" };

  if (!isNonEmptyString(args.tenantId)) return { ok: false, code: "missing-tenant" };
  if (!isUuid(args.tenantId)) return { ok: false, code: "invalid-tenant" };

  if (!isNonEmptyString(args.testRecordId)) return { ok: false, code: "missing-test-record" };
  if (!isUuid(args.testRecordId)) return { ok: false, code: "invalid-test-record" };

  let afterId: string | null = null;
  if (args.afterId !== undefined && args.afterId !== null) {
    const a = args.afterId;
    if (typeof a !== "string" || a.length === 0 || a.length > 128 || hasControlChar(a) || a !== a.trim()) {
      return { ok: false, code: "invalid-cursor" };
    }
    afterId = a;
  }

  let limit = 100;
  if (args.limit !== undefined) {
    const l = args.limit;
    if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > 500) return { ok: false, code: "invalid-limit" };
    limit = l;
  }

  return { ok: true, value: { environment, phase, sourceKey: config.sourceKey, config, tenantId: args.tenantId, testRecordId: args.testRecordId, afterId, limit } };
}

// ─── Güvenli özet (saf; redaction) ───────────────────────────────────────────

export function buildSafeSmokeSummary(v: ValidatedSmokeActivation, result: IndexSourcePageResult): SafeSmokeSummary {
  return {
    environment: v.environment,
    phase: v.phase,
    sourceKey: v.sourceKey,
    tenantIdRedacted: redactId(v.tenantId),
    testRecordIdRedacted: redactId(v.testRecordId),
    limit: v.limit,
    cursorPresent: v.afterId !== null,
    fetched: result.fetched,
    produced: result.summary.units,
    skipped: result.summary.skipped,
    eligibleUnits: result.eligibleUnits,
    excludedDemo: result.excludedDemo,
  };
}

// ─── Orkestrasyon (enjekte deps; MODEL B fail-closed) ────────────────────────

function rejected(code: SmokeErrorCode, exitCode = 2): SmokeOutcome {
  return { status: "rejected", code, exitCode, summary: null };
}

export async function runIndexSmoke(args: SmokeArgs, deps: SmokeDeps): Promise<SmokeOutcome> {
  // 0) --execute yoksa: plan-only; HİÇBİR dep çağrılmaz (DB bağlantısı YOK).
  if (!args.execute) return { status: "plan-only", code: null, exitCode: 0, summary: null };

  // 1) Aktivasyon kilitleri (fail-closed; dep yok).
  const act = validateSmokeActivation(args);
  if (!act.ok) return rejected(act.code);
  const v = act.value;

  // 2) Credential yalnız boolean; yoksa bağlanmadan güvenli hata.
  if (!deps.hasCredentials()) return rejected("missing-credentials");

  // 3) GERÇEK WRITE — HER ORTAMDA FAIL-CLOSED (izolasyon kanıtlanamaz). Dep çağrılmaz.
  if (v.phase === "write") {
    return rejected(v.environment === "production" ? "production-write-disabled" : "write-isolation-not-proven");
  }

  // 4) CLEANUP.
  if (v.phase === "cleanup") {
    // Cleanup DELETE niyeti (confirmation) → HER ORTAMDA fail-closed (provenance yok).
    if (args.cleanupConfirmation === SMOKE_CLEANUP_CONFIRMATION) {
      return rejected(v.environment === "production" ? "production-cleanup-disabled" : "cleanup-provenance-not-available");
    }
    // Aksi: yalnız hedef SAYIMI (salt-okuma; silme YOK).
    let count = 0;
    if (deps.countCleanupTargets) {
      try {
        count = (await deps.countCleanupTargets({ sourceTable: v.config.tableName, testRecordId: v.testRecordId })).count;
      } catch {
        return rejected("cleanup-count-failed");
      }
    }
    return { status: "cleanup-plan-ok", code: null, exitCode: 0, summary: null, cleanupTargetCount: count };
  }

  // 5) DRY-RUN (salt-okuma; yazma yok). Demo hedef fail-closed.
  const demo = await deps.checkDemoTarget({ tenantId: v.tenantId });
  if (!demo.ok) return rejected("demo-check-failed");
  if (demo.isDemo) return rejected("demo-target-forbidden");

  let result: IndexSourcePageResult;
  try {
    result = await deps.runDryRunPage(v); // tek sayfa; auto-next YOK
  } catch {
    return rejected("index-failed");
  }
  return {
    status: "dry-run-ok",
    code: null,
    exitCode: 0,
    summary: buildSafeSmokeSummary(v, result),
    targetFingerprint: computeTargetFingerprint(v),
  };
}
