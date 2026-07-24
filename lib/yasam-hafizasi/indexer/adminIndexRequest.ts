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
import { isIndexableSource } from "./sourceGuard";
import {
  BroadWriteDisabledError,
  SourceNotIndexableError,
  SourceTenantScopeUnsupportedError,
  type IndexSourcePageResult,
  type ExactWriteStatus,
} from "./indexSourcePage";
import { supportsTenantScopedPage, type ValidatedTenantScope } from "./tenantScopeGate";
import { TenantFilterMismatchError } from "./runSource";
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
  // BF-2B exact-write gate (opsiyonel; ikisi birlikte verilir).
  readonly exactSourceId?: string | null;
  readonly expectedTenantId?: string | null;
  // BF-4B tenant-scoped backfill (opsiyonel; exact ile birlikte kullanılamaz).
  readonly scopedTenantId?: string | null;
}

export interface ValidatedAdminIndexRequest {
  readonly sourceKey: string;
  readonly config: SourceConfig;
  readonly mode: AdminIndexMode;
  readonly afterId: string | null;
  readonly limit: number;
  // BF-2B: exact modda ikisi de dolu + geçerli UUID; broad/scoped modda ikisi de null.
  readonly exactSourceId: string | null;
  readonly expectedTenantId: string | null;
  // BF-4B: scoped modda geçerli UUID; broad/exact modda null.
  readonly scopedTenantId: string | null;
}

export type AdminIndexErrorCode =
  | "invalid-json"
  | "invalid-body"
  | "unexpected-field"
  | "missing-source-key"
  | "unknown-source"
  | "source-not-indexable"
  | "invalid-mode"
  | "invalid-cursor"
  | "invalid-limit"
  | "demo-write-forbidden"
  | "demo-check-failed"
  | "index-failed"
  | "partial-write"
  // BF-2B exact-write gate hata kodları.
  | "exact-fields-incomplete" // yalnız biri verildi (ikisi de zorunlu)
  | "invalid-exact-source-id" // UUID değil
  | "invalid-expected-tenant-id" // UUID değil
  | "exact-cursor-conflict" // exact + afterId birlikte verilemez
  | "exact-limit-conflict" // exact + limit≠1 verilemez
  | "exact-not-eligible" // exact write: eligible tam 1 değil / eşleşme yok → writer çağrılmadı
  // BF-4B tenant-scoped backfill hata kodları.
  | "invalid-combination" // scoped + exact aynı istekte verilemez
  | "invalid-tenant-id" // scopedTenantId UUID değil
  | "broad-write-disabled" // geniş (scoped/exact olmayan) WRITE fail-closed
  | "source-tenant-scope-unsupported" // kaynak column-mode/non-shared/safe değil
  | "tenant-not-found" // tenant kaydı yok
  | "tenant-inactive" // tenant.status !== 'active'
  | "tenant-not-ready" // hazır uzman yok (admin-only / pending / rejected / boş)
  | "tenant-demo" // tenant'ın tüm kullanıcıları demo
  | "tenant-synthetic" // sentetik (ADMIN_LIBRARY) tenant
  | "tenant-mixed-demo" // tenant demo + non-demo karışık
  | "tenant-scope-validation-unavailable" // tenant/users okuma hatası (fail-closed)
  | "tenant-filter-mismatch"; // scoped sayfada yabancı tenant satırı → 409

/** deps.validateScopedTenant'ın döndürebileceği tenant kapısı hata kodları. */
export type ScopedTenantGateCode =
  | "tenant-not-found"
  | "tenant-inactive"
  | "tenant-not-ready"
  | "tenant-demo"
  | "tenant-mixed-demo"
  | "tenant-synthetic"
  | "tenant-scope-validation-unavailable";

/** Güvenli sayfa özeti (ham içerik yok). */
export interface SafePageSummary {
  readonly fetched: number;
  readonly produced: number;
  readonly skipped: number;
  readonly eligibleUnits: number;
  readonly excludedDemo: number;
  readonly excludedSynthetic: number; // BF-1B-FIX: sentetik tenant dışlaması (demo'dan ayrı)
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly exactMode: boolean; // BF-2B: exact-record write gate aktif mi
  readonly exactStatus: ExactWriteStatus | null; // yalnız exactMode'da doldurulur
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
  readonly scopedTenantId: string | null; // BF-4B: scoped modda tenant, aksi null
  readonly page: SafePageSummary;
  readonly write: null;
}
export interface AdminIndexWriteSuccess {
  readonly ok: true;
  readonly mode: "write";
  readonly sourceKey: string;
  readonly scopedTenantId: string | null; // BF-4B: scoped modda tenant, aksi null
  readonly page: SafePageSummary;
  readonly write: SafeWriteSummary & { readonly completed: true };
}
export interface AdminIndexPartialWrite {
  readonly ok: false;
  readonly mode: "write";
  readonly sourceKey: string;
  readonly scopedTenantId: string | null; // BF-4B: scoped modda tenant, aksi null
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
  readonly excludedSynthetic?: number;
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
  readonly runIndexSourcePage: (
    input: ValidatedAdminIndexRequest,
    scope?: ValidatedTenantScope,
  ) => Promise<IndexSourcePageResult>;
  /**
   * BF-4B tenant-scoped backfill: doğrulanmış tenant kanıtı üretir (IO; route enjekte
   * eder). scoped modda ZORUNLU; yoksa handler 503 tenant-scope-validation-unavailable döner.
   */
  readonly validateScopedTenant?: (
    tenantId: string,
  ) => Promise<
    | { ok: true; scope: ValidatedTenantScope }
    | { ok: false; code: ScopedTenantGateCode }
  >;
  readonly writeAuditEvent?: (event: SafeAdminIndexAuditEvent) => Promise<void>;
}

// ─── Validation (saf) ─────────────────────────────────────────────────────────

export type AdminIndexValidation =
  | { readonly ok: true; readonly value: ValidatedAdminIndexRequest }
  | { readonly ok: false; readonly status: number; readonly code: AdminIndexErrorCode };

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "sourceKey",
  "mode",
  "afterId",
  "limit",
  // BF-2B exact-write gate (opsiyonel).
  "exactSourceId",
  "expectedTenantId",
  // BF-4B tenant-scoped backfill (opsiyonel).
  "scopedTenantId",
]);
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/** Kanonik 8-4-4-4-12 hex UUID (coercion yok). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // BF-2B exact-write gate tespiti: exactSourceId VEYA expectedTenantId verildiyse
  // exact mod aktiftir ve ikisi de zorunludur (fail-closed).
  const hasExactSource = body.exactSourceId !== undefined && body.exactSourceId !== null;
  const hasExactTenant = body.expectedTenantId !== undefined && body.expectedTenantId !== null;
  const exactMode = hasExactSource || hasExactTenant;

  // BF-4B tenant-scoped tespiti.
  const scoped = body.scopedTenantId !== undefined && body.scopedTenantId !== null;

  // scoped + exact aynı istekte verilemez (fail-closed kombinasyon reddi).
  if (scoped && exactMode) return fail(400, "invalid-combination");

  let afterId: string | null = null;
  let limit = DEFAULT_LIMIT;
  let exactSourceId: string | null = null;
  let expectedTenantId: string | null = null;
  let scopedTenantId: string | null = null;

  if (scoped) {
    // scopedTenantId geçerli UUID olmalı.
    const st = body.scopedTenantId;
    if (typeof st !== "string" || !UUID_RE.test(st)) return fail(400, "invalid-tenant-id");
    scopedTenantId = st;

    // afterId (cursor) opsiyonel — geniş yol ile aynı katı doğrulama.
    if (body.afterId !== undefined && body.afterId !== null) {
      const a = body.afterId;
      if (typeof a !== "string" || a.length === 0 || a.length > 128 || hasControlChar(a) || a !== a.trim()) {
        return fail(400, "invalid-cursor");
      }
      afterId = a;
    }
    // limit 1..500 (geniş yol ile aynı; clamp yok, reddet).
    if (body.limit !== undefined) {
      const l = body.limit;
      if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > MAX_LIMIT) {
        return fail(400, "invalid-limit");
      }
      limit = l;
    }
  } else if (exactMode) {
    // İkisi birlikte zorunlu.
    if (!hasExactSource || !hasExactTenant) return fail(400, "exact-fields-incomplete");

    const es = body.exactSourceId;
    if (typeof es !== "string" || !UUID_RE.test(es)) return fail(400, "invalid-exact-source-id");
    const et = body.expectedTenantId;
    if (typeof et !== "string" || !UUID_RE.test(et)) return fail(400, "invalid-expected-tenant-id");
    exactSourceId = es;
    expectedTenantId = et;

    // Exact modda pagination cursor kullanılamaz.
    if (body.afterId !== undefined && body.afterId !== null) return fail(400, "exact-cursor-conflict");
    // Exact modda limit dışarıdan genişletilemez (yalnız 1 kayıt hedeflenir).
    if (body.limit !== undefined && body.limit !== 1) return fail(400, "exact-limit-conflict");
    limit = 1;
  } else {
    // GENİŞ (broad) mod. NOT: geniş WRITE reddi (broad-write-disabled) VALIDATION'da
    // DEĞİL, handler'da demo kapısından SONRA uygulanır (demo admin geniş write →
    // demo-write-forbidden davranışı korunur). Burada yalnız afterId/limit doğrulanır.
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
    if (body.limit !== undefined) {
      const l = body.limit;
      if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > MAX_LIMIT) {
        return fail(400, "invalid-limit");
      }
      limit = l;
    }
  }

  // sourceKey allowlist çözümü (ham değer; case-sensitive; trim/coercion yok).
  const config = resolveYhSourceConfig(sk);
  if (config === null) return fail(400, "unknown-source");

  // PII sınıflandırma guard'ı (BF-0; INV-PII). Bilinen ama safe-non-pii+enabled OLMAYAN kaynak
  // → 403 fail-closed. dry-run ve write AYNI kapıdan geçer; classification detayı sızmaz.
  if (!isIndexableSource(config)) return fail(403, "source-not-indexable");

  // BF-4B: scoped modda kaynak column-mode/non-shared/safe-non-pii olmalı; aksi → 422.
  if (scoped && !supportsTenantScopedPage(config)) {
    return fail(422, "source-tenant-scope-unsupported");
  }

  return {
    ok: true,
    value: {
      sourceKey: config.sourceKey,
      config,
      mode,
      afterId,
      limit,
      exactSourceId,
      expectedTenantId,
      scopedTenantId,
    },
  };
}

// ─── Response map (saf; yalnız güvenli sayaçlar) ─────────────────────────────

function toSafePage(result: IndexSourcePageResult): SafePageSummary {
  return {
    fetched: result.fetched,
    produced: result.summary.units,
    skipped: result.summary.skipped,
    eligibleUnits: result.eligibleUnits,
    excludedDemo: result.excludedDemo,
    excludedSynthetic: result.excludedSynthetic,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
    exactMode: result.exactMode,
    exactStatus: result.exactStatus,
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

/** BF-4B tenant kapısı kodunu HTTP status'e çevirir (fail-closed eşleme). */
function tenantGateHttpStatus(code: ScopedTenantGateCode): number {
  switch (code) {
    case "tenant-not-found":
      return 404;
    case "tenant-inactive":
    case "tenant-not-ready":
    case "tenant-demo":
    case "tenant-mixed-demo":
    case "tenant-synthetic":
      return 403;
    case "tenant-scope-validation-unavailable":
      return 503;
  }
}

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
  const { sourceKey, mode, afterId, limit, exactSourceId, scopedTenantId } = v.value;
  const cursorPresent = afterId !== null;
  const scoped = scopedTenantId !== null;
  const broad = exactSourceId === null && scopedTenantId === null;

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

  // BF-4B: GENİŞ (scoped/exact olmayan) WRITE fail-closed. Demo kapısından SONRA
  // uygulanır (demo admin geniş write → demo-write-forbidden davranışı korunur).
  // Üretim geniş write'ı indexSourcePage'e HİÇ ulaşmaz.
  if (broad && mode === "write") {
    await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "broad-write-disabled" });
    return { status: 403, body: { ok: false, error: { code: "broad-write-disabled" } } };
  }

  // BF-4B tenant-scoped kapısı: kanıt üret (IO). scoped modda ZORUNLU.
  let scope: ValidatedTenantScope | undefined;
  if (scoped) {
    if (!deps.validateScopedTenant) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "tenant-scope-validation-unavailable" });
      return { status: 503, body: { ok: false, error: { code: "tenant-scope-validation-unavailable" } } };
    }
    const gate = await deps.validateScopedTenant(scopedTenantId);
    if (!gate.ok) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: gate.code });
      return { status: tenantGateHttpStatus(gate.code), body: { ok: false, error: { code: gate.code } } };
    }
    scope = gate.scope;
  }

  // İndeksleme (tek çağrı). IO fatal → 500 index-failed (ham hata taşınmaz).
  // BF-4B: indexSourcePage çekirdeği fail-closed durumları TİPLİ THROW ile bildirir
  // (validator zaten fail-fast reddeder; bunlar route-bypass/doğrudan çağrı savunmasıdır).
  let result: IndexSourcePageResult;
  try {
    result = await deps.runIndexSourcePage(v.value, scope);
  } catch (err) {
    // BF-4B tenant-scoped tipli hatalar → güvenli HTTP eşlemesi.
    if (err instanceof TenantFilterMismatchError) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "tenant-filter-mismatch" });
      return { status: 409, body: { ok: false, error: { code: "tenant-filter-mismatch" } } };
    }
    if (err instanceof BroadWriteDisabledError) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "broad-write-disabled" });
      return { status: 403, body: { ok: false, error: { code: "broad-write-disabled" } } };
    }
    if (err instanceof SourceTenantScopeUnsupportedError) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "source-tenant-scope-unsupported" });
      return { status: 422, body: { ok: false, error: { code: "source-tenant-scope-unsupported" } } };
    }
    // BF-0 son savunma: indexSourcePage non-indexable kaynak fırlatırsa → 403 (validation
    // zaten engeller; bu defense-in-depth). Diğer IO fatal → 500 index-failed.
    if (err instanceof SourceNotIndexableError) {
      await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "source-not-indexable" });
      return { status: 403, body: { ok: false, error: { code: "source-not-indexable" } } };
    }
    await bestEffortAudit(deps, { adminId: deps.adminId, sourceKey, mode, limit, cursorPresent, outcome: "fatal", errorCode: "index-failed" });
    return { status: 500, body: { ok: false, error: { code: "index-failed" } } };
  }

  const page = toSafePage(result);
  const auditBase = {
    adminId: deps.adminId, sourceKey, mode, limit, cursorPresent,
    fetched: page.fetched, produced: page.produced, skipped: page.skipped,
    eligibleUnits: page.eligibleUnits, excludedDemo: page.excludedDemo,
    excludedSynthetic: page.excludedSynthetic,
  };

  if (mode === "dry-run") {
    await bestEffortAudit(deps, { ...auditBase, outcome: "dry-run-ok" });
    return { status: 200, body: { ok: true, mode: "dry-run", sourceKey, scopedTenantId, page, write: null } };
  }

  // BF-2B exact-write gate (defense-in-depth): write modunda exactStatus !== 'ok'
  // ise writer indexSourcePage'de HİÇ çağrılmamıştır (write=null). Bunu fatal
  // saymaz; güvenli fail-closed hata koduyla döner (eligible tam 1 değil / eşleşme yok).
  if (result.exactMode && result.exactStatus !== "ok") {
    await bestEffortAudit(deps, { ...auditBase, outcome: "fatal", errorCode: "exact-not-eligible" });
    return { status: 409, body: { ok: false, error: { code: "exact-not-eligible" } } };
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
    return { status: 200, body: { ok: true, mode: "write", sourceKey, scopedTenantId, page, write: { ...write, completed: true } } };
  }

  // Kısmi write → 503, ok:false (monitoring görür; idempotent tekrar edilebilir).
  await bestEffortAudit(deps, { ...auditWrite, outcome: "partial-write", errorCode: "partial-write" });
  return {
    status: 503,
    body: { ok: false, mode: "write", sourceKey, scopedTenantId, error: { code: "partial-write" }, page, write: { ...write, completed: false } },
  };
}
