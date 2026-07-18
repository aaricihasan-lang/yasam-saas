/**
 * Yaşam Hafızası™ — İndeks Smoke Planı (Sprint 2 / S2.12C, framework-agnostic).
 *
 * S2.05–S2.11 zincirini GERÇEK DB'de kontrollü doğrulamak için smoke aracının
 * SAF/enjekte-IO çekirdeği. CLI global durumundan bağımsız; test edilir.
 *
 * ⚠️ MODEL B — FAIL-CLOSED (gerçek mutasyon devre dışı):
 *   Gerçek `write` ve gerçek `cleanup delete` HER ORTAMDA reddedilir
 *   (write-isolation-not-proven / production-write-disabled /
 *    cleanup-provenance-missing / production-cleanup-disabled).
 *
 * ✅ S2.12C — EXACT-OWNED-RECORD DRY-RUN (gerçek izolasyon):
 *   Dry-run ARTIK `indexSourcePage` (sayfa) çağırmaz. Enjekte `readExactOwnedRecord`
 *   DB sorgusunda `primaryKey=recordId` VE `tenantColumn=tenantId` filtrelerini
 *   BİRLİKTE uygular → başka tenant'a ait satır sorgu sonucuna GİREMEZ. 0 satır →
 *   `record-not-found-or-not-owned` (IDOR-güvenli; ikinci tenant'sız sorgu YOK).
 *   DB/adapter/sözleşme hatası → `source-read-failed` (not-found'a dönüşmez).
 *   İlk allowlist yalnız `biyoenerji:symbols` (column, non-shared); shared/join
 *   fail-closed (`shared-record-disabled`/`join-source-disabled`).
 *
 * SINIR — bu dosyada BULUNMAZ:
 *   process.argv / process.env / Supabase / getServerDb / fetch / network / IO /
 *   console / page reader / cursor / .gt / auto-pagination / writer / delete.
 */

import { createHash } from "node:crypto";

import { resolveYhSourceConfig } from "./adminIndexRequest";
import { runIndexUnit } from "./runIndexUnit";
import type { SourceConfig } from "./sources";

export type SmokeEnvironment = "local" | "staging" | "production";
export type SmokePhase = "dry-run" | "write" | "cleanup";

/** Ortam-başı sabit confirmation ifadeleri (production daha güçlü). */
export const SMOKE_CONFIRMATIONS: Record<SmokeEnvironment, string> = {
  local: "YH-SMOKE-LOCAL",
  staging: "YH-SMOKE-STAGING",
  production: "YH-SMOKE-PRODUCTION-I-UNDERSTAND-THE-RISK",
};

/** İlk ve tek smoke source allowlist'i (sources.ts DEĞİŞMEZ; burada tutulur). */
export const SMOKE_SOURCE_ALLOWLIST: ReadonlySet<string> = new Set(["biyoenerji:symbols"]);

export interface SmokeArgs {
  readonly execute: boolean;
  readonly environment?: string;
  readonly phase?: string;
  readonly sourceKey?: string;
  readonly tenantId?: string;
  readonly testRecordId?: string;
  readonly confirmation?: string;
}

export type SmokeErrorCode =
  | "invalid-environment"
  | "missing-confirmation"
  | "invalid-confirmation"
  | "invalid-phase"
  | "missing-source-key"
  | "unknown-source"
  | "missing-tenant"
  | "invalid-tenant"
  | "missing-test-record"
  | "invalid-test-record"
  | "missing-credentials"
  | "source-smoke-not-allowed"
  | "unsupported-tenant-model"
  | "shared-record-disabled"
  | "join-source-disabled"
  | "tenant-demo-disabled"
  | "record-not-found-or-not-owned"
  | "source-read-failed"
  | "write-isolation-not-proven"
  | "production-write-disabled"
  | "cleanup-provenance-missing"
  | "production-cleanup-disabled";

export type SmokeSuccessCode = "dry-run-ready" | "dry-run-completed";

export interface ValidatedSmokeActivation {
  readonly environment: SmokeEnvironment;
  readonly phase: SmokePhase;
  readonly sourceKey: string;
  readonly config: SourceConfig;
  readonly tenantId: string;
  readonly testRecordId: string;
}

export type SmokeActivation =
  | { readonly ok: true; readonly value: ValidatedSmokeActivation }
  | { readonly ok: false; readonly code: SmokeErrorCode };

/** Enjekte exact-owned-record okuma sonucu (tek sorgu; pk+tenant birlikte). */
export type ExactRecordResult =
  | { readonly status: "row"; readonly row: Readonly<Record<string, unknown>> }
  | { readonly status: "none" }
  | { readonly status: "error" };

/** Redakte edilmiş güvenli özet (ham içerik / tam id / cursor YOK). */
export interface SafeSmokeSummary {
  readonly environment: SmokeEnvironment;
  readonly phase: SmokePhase;
  readonly sourceKey: string;
  readonly tenantIdRedacted: string;
  readonly testRecordIdRedacted: string;
  readonly fetched: 0 | 1;
  readonly produced: number;
  readonly skipped: number;
  readonly eligibleUnits: number;
  readonly plannedInsert: number;
  readonly plannedUpdate: number;
  readonly unchanged: number;
}

export interface SmokeDeps {
  /** Yalnız BOOLEAN: service-role env var'ları mevcut mu (değer okunmaz). */
  readonly hasCredentials: () => boolean;
  /** Hedef tenant demo mu? (error-aware). */
  readonly checkDemoTarget: (input: {
    readonly tenantId: string;
  }) => Promise<{ ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" }>;
  /** EXACT-OWNED-RECORD okuma: DB sorgusunda pk=recordId VE tenant=tenantId birlikte. */
  readonly readExactOwnedRecord: (input: {
    readonly config: SourceConfig;
    readonly tenantId: string;
    readonly recordId: string;
  }) => Promise<ExactRecordResult>;
}

export type SmokeStatus = "plan-only" | "dry-run-ok" | "rejected";

export interface SmokeOutcome {
  readonly status: SmokeStatus;
  readonly code: SmokeErrorCode | SmokeSuccessCode | null;
  readonly exitCode: number;
  readonly summary: SafeSmokeSummary | null;
  /** Girdilerden türetilmiş deterministik hedef ETİKETİ. İZOLASYON KANITI DEĞİLDİR. */
  readonly targetFingerprint?: string;
}

// ─── Yardımcılar (saf) ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
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

/** Deterministik hedef ETİKETİ (yalnız girdiler; İZOLASYON KANITI DEĞİL). */
export function computeTargetFingerprint(v: ValidatedSmokeActivation): string {
  const canonical = [v.environment, v.sourceKey, v.tenantId, v.testRecordId, "s2.12c"].join("|");
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

  return { ok: true, value: { environment, phase, sourceKey: config.sourceKey, config, tenantId: args.tenantId, testRecordId: args.testRecordId } };
}

// ─── Güvenli özet (saf; redaction) ───────────────────────────────────────────

function buildSummary(v: ValidatedSmokeActivation, produced: number, skipped: number): SafeSmokeSummary {
  return {
    environment: v.environment,
    phase: v.phase,
    sourceKey: v.sourceKey,
    tenantIdRedacted: redactId(v.tenantId),
    testRecordIdRedacted: redactId(v.testRecordId),
    fetched: 1,
    produced,
    skipped,
    eligibleUnits: produced,
    // Dry-run yazma-planı yapmaz (prefetch/write yok) → 0.
    plannedInsert: 0,
    plannedUpdate: 0,
    unchanged: 0,
  };
}

// ─── Tenant-model kapısı (saf; savunma amaçlı) ────────────────────────────────
// İlk allowlist yalnız column-non-shared (biyoenerji:symbols) olduğundan normal
// akışta shared/join'e ulaşılmaz; bu kapı ileri genişleme için fail-closed savunmadır.
export function evaluateSmokeTenantModel(
  config: SourceConfig,
): "shared-record-disabled" | "join-source-disabled" | "unsupported-tenant-model" | null {
  const t = config.tenant;
  if (t.mode === "join") return "join-source-disabled";
  if (t.mode !== "column") return "unsupported-tenant-model";
  if (t.allowSharedNull === true) return "shared-record-disabled";
  return null;
}

// ─── Orkestrasyon (enjekte deps; exact-owned-record) ─────────────────────────

function rejected(code: SmokeErrorCode, exitCode = 2): SmokeOutcome {
  return { status: "rejected", code, exitCode, summary: null };
}

export async function runIndexSmoke(args: SmokeArgs, deps: SmokeDeps): Promise<SmokeOutcome> {
  // 0) --execute yoksa: plan-only; HİÇBİR dep çağrılmaz (DB bağlantısı YOK).
  if (!args.execute) return { status: "plan-only", code: "dry-run-ready", exitCode: 0, summary: null };

  // 1) Aktivasyon kilitleri (fail-closed; dep yok).
  const act = validateSmokeActivation(args);
  if (!act.ok) return rejected(act.code);
  const v = act.value;

  // 2) Credential yalnız boolean; yoksa bağlanmadan güvenli hata.
  if (!deps.hasCredentials()) return rejected("missing-credentials");

  // 3) Gerçek WRITE — her ortamda fail-closed (izolasyon kanıtlanamaz). Dep yok.
  if (v.phase === "write") {
    return rejected(v.environment === "production" ? "production-write-disabled" : "write-isolation-not-proven");
  }

  // 4) Gerçek CLEANUP DELETE — her ortamda fail-closed (provenance yok). Dep yok.
  if (v.phase === "cleanup") {
    return rejected(v.environment === "production" ? "production-cleanup-disabled" : "cleanup-provenance-missing");
  }

  // 5) DRY-RUN — allowlist → tenant-model → demo → exact-owned-record.
  if (!SMOKE_SOURCE_ALLOWLIST.has(v.sourceKey)) return rejected("source-smoke-not-allowed");

  const modelCode = evaluateSmokeTenantModel(v.config);
  if (modelCode !== null) return rejected(modelCode);

  // Demo hedef: demo VEYA kesin doğrulanamıyorsa/atarsa → fail-closed (reader'a ulaşılmaz).
  let demo: { ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" };
  try {
    demo = await deps.checkDemoTarget({ tenantId: v.tenantId });
  } catch {
    return rejected("tenant-demo-disabled");
  }
  if (!demo.ok || demo.isDemo) return rejected("tenant-demo-disabled");

  // Exact-owned-record (tek sorgu; pk=recordId VE tenant=tenantId; ikinci sorgu YOK).
  // Dep atarsa → source-read-failed (ham hata sızmaz; not-found'a dönüşmez).
  let res: ExactRecordResult;
  try {
    res = await deps.readExactOwnedRecord({ config: v.config, tenantId: v.tenantId, recordId: v.testRecordId });
  } catch {
    return rejected("source-read-failed");
  }
  if (res.status === "error") return rejected("source-read-failed");
  if (res.status === "none") return rejected("record-not-found-or-not-owned");

  // Tek owned kayıt → builder (S2.08 runIndexUnit; yazma yok).
  const built = runIndexUnit({ config: v.config, row: res.row });
  const produced = built.status === "unit" ? 1 : 0;
  const skipped = built.status === "unit" ? 0 : 1;

  return {
    status: "dry-run-ok",
    code: "dry-run-completed",
    exitCode: 0,
    summary: buildSummary(v, produced, skipped),
    targetFingerprint: computeTargetFingerprint(v),
  };
}
