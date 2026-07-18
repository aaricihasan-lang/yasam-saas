/**
 * Yaşam Hafızası™ — Admin İndeks-Sayfa İstek Katmanı (Sprint 2 / S2.11).
 *
 * Next.js'den BAĞIMSIZ, framework-agnostic uygulama/orkestrasyon katmanı.
 * SAF fonksiyonlar: `resolveYhSourceConfig`, `validateAdminIndexRequest`, response
 * map. ORKESTRASYON (saf değil; enjekte IO deps): `handleAdminIndexRequest`.
 *
 * SINIR — bu dosyada BULUNMAZ:
 *   NextRequest / NextResponse / next/server / Supabase client / getServerDb /
 *   fetch / process.env / IO / HTTP / DB sorgusu. Tüm IO çağırana (route) aittir
 *   ve `AdminIndexHandlerDeps` ile ENJEKTE edilir.
 *
 * KANONİK KURALLAR (S2.11):
 *   - Raw SourceConfig/tablo/kolon request'ten ALINMAZ; yalnız statik allowlist
 *     (`YH_INDEX_SOURCES`) üzerinden sourceKey→config çözülür (case-sensitive).
 *   - Response yalnız GÜVENLİ sayaç + sabit hata kodu taşır; ham row/unit/title/
 *     snippet/evidence/tenant/PII/DB-mesaj/cursor-değeri ASLA.
 *   - `ok:true` + `completed:false` tip-seviyesinde İMKÂNSIZ (ayrı union üyeleri).
 *   - Write kapısı FAIL-CLOSED: demo kesin doğrulanamazsa write reddedilir.
 *   - Dry-run demo sorgusu çalıştırmaz ve hiçbir DB tablosuna yazmaz.
 *   - Audit (`writeAuditEvent`) best-effort; S2.11'de yalnız güvenli server log
 *     (DB write YOK); hatası ana işlemi düşürmez.
 */

import { YH_INDEX_SOURCES } from "./sources";
import type { SourceConfig } from "./sources";
import type { IndexSourcePageResult } from "./indexSourcePage";
import type { WriteIndexUnitsResult } from "./supabaseIndexAdapters";

// ─── Source resolver (saf; statik allowlist) ─────────────────────────────────

/** Statik registry'de case-sensitive sourceKey → config; yoksa `null`. */
export function resolveYhSourceConfig(sourceKey: string): SourceConfig | null {
  for (const s of YH_INDEX_SOURCES) {
    if (s.sourceKey === sourceKey) return s;
  }
  return null;
}

// ─── Sözleşme tipleri ─────────────────────────────────────────────────────────

export type AdminIndexMode = "dry-run" | "write";

export interface AdminIndexRequestBody {
  readonly sourceKey: string;
  readonly mode: AdminIndexMode;
  readonly afterId?: string | null;
  readonly limit?: number;
}

export interface ValidatedAdminIndexRequest {
  readonly sourceKey: string;
  readonly config: SourceConfig;
  readonly mode: AdminIndexMode;
  readonly afterId: string | null;
  readonly limit: number;
}

export type AdminIndexErrorCode =
  | "invalid-json"
  | "invalid-body"
  | "unexpected-field"
  | "missing-source-key"
  | "unknown-source"
  | "invalid-mode"
  | "invalid-cursor"
  | "invalid-limit"
  | "demo-write-forbidden"
  | "demo-check-failed"
  | "index-failed"
  | "partial-write";

/** Güvenli sayfa özeti (ham içerik yok). */
export interface SafePageSummary {
  readonly fetched: number;
  readonly produced: number;
  readonly skipped: number;
  readonly eligibleUnits: number;
  readonly excludedDemo: number;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/** Güvenli yazma özeti (ham içerik yok; yalnız sayaç + sabit chunk kodları). */
export interface SafeWriteSummary {
  readonly attempted: number;
  readonly written: number;
  readonly plannedInsert: number;
  readonly plannedUpdate: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly chunksAttempted: number;
  readonly chunksSucceeded: number;
  readonly errors: ReadonlyArray<{ readonly chunkIndex: number; readonly code: string }>;
}

export interface AdminIndexDryRunSuccess {
  readonly ok: true;
  readonly mode: "dry-run";
  readonly sourceKey: string;
  readonly page: SafePageSummary;
  readonly write: null;
}
export interface AdminIndexWriteSuccess {
  readonly ok: true;
  readonly mode: "write";
  readonly sourceKey: string;
  readonly page: SafePageSummary;
  readonly write: SafeWriteSummary & { readonly completed: true };
}
export interface AdminIndexPartialWrite {
  readonly ok: false;
  readonly mode: "write";
  readonly sourceKey: string;
  readonly error: { readonly code: "partial-write" };
  readonly page: SafePageSummary;
  readonly write: SafeWriteSummary & { readonly completed: false };
}
export interface AdminIndexErrorResponse {
  readonly ok: false;
  readonly error: { readonly code: AdminIndexErrorCode };
}
export type AdminIndexResponse =
  | AdminIndexDryRunSuccess
  | AdminIndexWriteSuccess
  | AdminIndexPartialWrite
  | AdminIndexErrorResponse;

/** Best-effort audit için güvenli metadata (ham içerik / cursor değeri YOK). */
export interface SafeAdminIndexAuditEvent {
  readonly adminId: string;
  readonly sourceKey: string;
  readonly mode: AdminIndexMode;
  readonly limit: number;
  readonly cursorPresent: boolean;
  readonly outcome: "dry-run-ok" | "write-ok" | "partial-write" | "fatal";
  readonly fetched?: number;
  readonly produced?: number;
  readonly skipped?: number;
  readonly eligibleUnits?: number;
  readonly excludedDemo?: number;
  readonly plannedInsert?: number;
  readonly plannedUpdate?: number;
  readonly unchanged?: number;
  readonly written?: number;
  readonly failed?: number;
  readonly completed?: boolean;
  readonly errorCode?: AdminIndexErrorCode;
}

export interface AdminIndexHandlerDeps {
  readonly adminId: string;
  readonly checkAdminDemoStatus: (
    adminId: string,
  ) => Promise<{ ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" }>;
  readonly runIndexSourcePage: (input: ValidatedAdminIndexRequest) => Promise<IndexSourcePageResult>;
  readonly writeAuditEvent?: (event: SafeAdminIndexAuditEvent) => Promise<void>;
}

// ─── Validation (saf) ─────────────────────────────────────────────────────────

export type AdminIndexValidation =
  | { readonly ok: true; readonly value: ValidatedAdminIndexRequest }
  | { readonly ok: false; readonly status: number; readonly code: AdminIndexErrorCode };

const ALLOWED_KEYS: ReadonlySet<string> = new Set(["sourceKey", "mode", "afterId", "limit"]);
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function fail(status: number, code: AdminIndexErrorCode): AdminIndexValidation {
  return { ok: false, status, code };
}

/** NUL/tab/newline/tüm C0 kontrol + DEL var mı? (regex/escape yok → kaynak temiz.) */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

/**
 * Ham gövdeyi katı kurallarla doğrular (coercion YOK). Bkz. S2.11 sözleşmesi.
 */
export function validateAdminIndexRequest(raw: unknown): AdminIndexValidation {
  // Body: yalnız plain object (null/array/primitive reddedilir).
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(400, "invalid-body");
  }
  const body = raw as Record<string, unknown>;

  // Fazladan/bilinmeyen alan reddedilir.
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) return fail(400, "unexpected-field");
  }

  // sourceKey: zorunlu string, trim sonrası boş olamaz (lookup ham değerle).
  const sk = body.sourceKey;
  if (typeof sk !== "string" || sk.trim().length === 0) {
    return fail(400, "missing-source-key");
  }

  // mode: zorunlu literal (default yok, boolean yok).
  const mode = body.mode;
  if (mode !== "dry-run" && mode !== "write") {
    return fail(400, "invalid-mode");
  }

  // afterId: eksik/null → başlangıç; verilirse katı string.
  let afterId: string | null = null;
  if (body.afterId !== undefined && body.afterId !== null) {
    const a = body.afterId;
    if (
      typeof a !== "string" ||
      a.length === 0 ||
      a.length > 128 ||
      hasControlChar(a) ||
      a !== a.trim() // baş/son whitespace → sessiz düzeltme YOK, reddet
    ) {
      return fail(400, "invalid-cursor");
    }
    afterId = a;
  }

  // limit: eksikse 100; verilirse finite integer 1..500 (clamp yok, reddet).
  let limit = DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    const l = body.limit;
    if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > MAX_LIMIT) {
      return fail(400, "invalid-limit");
    }
    limit = l;
  }

  // sourceKey allowlist çözümü (ham değer; case-sensitive; trim/coercion yok).
  const config = resolveYhSourceConfig(sk);
  if (config === null) return fail(400, "unknown-source");

  return { ok: true, value: { sourceKey: config.sourceKey, config, mode, afterId, limit } };
}

// ─── Response map (saf; yalnız güvenli sayaçlar) ─────────────────────────────

function toSafePage(result: IndexSourcePageResult): SafePageSummary {
  return {
    fetched: result.fetched,
    produced: result.summary.units,
    skipped: result.summary.skipped,
    eligibleUnits: result.eligibleUnits,
    excludedDemo: result.excludedDemo,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}

function toSafeWrite(w: WriteIndexUnitsResult): SafeWriteSummary {
  return {
    attempted: w.attempted,
    written: w.written,
    plannedInsert: w.plannedInsert,
    plannedUpdate: w.plannedUpdate,
    unchanged: w.unchanged,
    failed: w.failed,
    chunksAttempted: w.chunksAttempted,
    chunksSucceeded: w.chunksSucceeded,
    errors: w.errors.map((e) => ({ chunkIndex: e.chunkIndex, code: e.code })),
  };
}

// ─── Handler (orkestrasyon; enjekte deps) ────────────────────────────────────

async function bestEffortAudit(
  deps: AdminIndexHandlerDeps,
  event: SafeAdminIndexAuditEvent,
): Promise<void> {
  if (!deps.writeAuditEvent) return;
  try {
    await deps.writeAuditEvent(event);
  } catch {
    // best-effort: audit hatası ana işlemi düşürmez, dışarı taşınmaz.
  }
}

/**
 * Ham gövde + enjekte deps → `{ status, body }`. HTTP/Next bilmez.
 */
export async function handleAdminIndexRequest(
  raw: unknown,
  deps: AdminIndexHandlerDeps,
): Promise<{ status: number; body: AdminIndexResponse }> {
  const v = validateAdminIndexRequest(raw);
  if (!v.ok) {
    return { status: v.status, body: { ok: false, error: { code: v.code } } };
  }
  const { sourceKey, mode, afterId, limit } = v.value;
  const cursorPresent = afterId !== null;

  // Write kapısı: fail-closed demo kontrolü (dry-run demo sorgusu çalıştırmaz).
  if (mode === "write") {
    const demo = await deps.checkAdminDemoStatus(deps.adminId);
    if (!demo.ok) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "demo-check-failed" });
      return { status: 503, body: { ok: false, error: { code: "demo-check-failed" } } };
    }
    if (demo.isDemo) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "demo-write-forbidden" });
      return { status: 403, body: { ok: false, error: { code: "demo-write-forbidden" } } };
    }
  }

  // İndeksleme (tek çağrı). IO fatal → 500 index-failed (ham hata taşınmaz).
  let result: IndexSourcePageResult;
  try {
    result = await deps.runIndexSourcePage(v.value);
  } catch {
    await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "index-failed" });
    return { status: 500, body: { ok: false, error: { code: "index-failed" } } };
  }

  const page = toSafePage(result);
  const auditBase = {
    adminId: deps.adminId, sourceKey, mode, limit, cursorPresent,
    fetched: page.fetched, produced: page.produced, skipped: page.skipped,
    eligibleUnits: page.eligibleUnits, excludedDemo: page.excludedDemo,
  };

  if (mode === "dry-run") {
    await bestEffortAudit(deps, { ...auditBase, outcome: "dry-run-ok" });
    return { status: 200, body: { ok: true, mode: "dry-run", sourceKey, page, write: null } };
  }

  // Write modu: indexSourcePage write döndürmeliydi; yoksa fatal (savunmacı).
  if (result.write === null) {
    await bestEffortAudit(deps, { ...auditBase, outcome: "fatal", errorCode: "index-failed" });
    return { status: 500, body: { ok: false, error: { code: "index-failed" } } };
  }

  const write = toSafeWrite(result.write);
  const completed = write.errors.length === 0;
  const auditWrite = {
    ...auditBase,
    plannedInsert: write.plannedInsert, plannedUpdate: write.plannedUpdate,
    unchanged: write.unchanged, written: write.written, failed: write.failed, completed,
  };

  if (completed) {
    await bestEffortAudit(deps, { ...auditWrite, outcome: "write-ok" });
    return { status: 200, body: { ok: true, mode: "write", sourceKey, page, write: { ...write, completed: true } } };
  }

  // Kısmi write → 503, ok:false (monitoring görür; idempotent tekrar edilebilir).
  await bestEffortAudit(deps, { ...auditWrite, outcome: "partial-write", errorCode: "partial-write" });
  return {
    status: 503,
    body: { ok: false, mode: "write", sourceKey, error: { code: "partial-write" }, page, write: { ...write, completed: false } },
  };
}
