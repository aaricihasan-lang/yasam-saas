/**
 * Yaşam Hafızası™ — Outbox RPC Client (BF-11B, framework-bağımsız).
 * ====================================================================
 *
 * BF-11A `yasam_hafizasi_outbox` durum makinesinin (migration 20260815000000)
 * dört RPC'sine dar, test edilebilir, dependency-injected erişim:
 *   yh_outbox_claim / yh_outbox_complete / yh_outbox_fail / yh_outbox_sweep_expired
 *
 * SINIR — bu dosyada BULUNMAZ:
 *   Next / NextRequest / fetch / process.env / getServerDb / Supabase singleton /
 *   Inngest / request-bound auth. DB istemcisi (yalnız `rpc`) ENJEKTE edilir.
 *
 * KANONİK KURALLAR:
 *   - Retry/backoff/attempts/dead kararı BF-11A RPC'lerinindir; bu client HESAPLAMAZ.
 *   - Claim satırları + complete/fail dönüş kodları RUNTIME fail-closed doğrulanır;
 *     beklenmeyen biçim açık invariant hatası üretir (sessiz kabul YOK).
 *   - Ham Supabase/DB hata mesajı DIŞARI TAŞINMAZ; yalnız güvenli sabit kod.
 *   - `operation` yalnız outboxState.OUTBOX_OPERATIONS üyelerinden biri olabilir.
 */

import { OUTBOX_OPERATIONS, type OutboxOperation } from "./outboxState";

// ─── Doğrulayıcılar (coercion YOK; SQL CHECK'leriyle hizalı) ─────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0; // SQL: attempts >= 0
}
function isPosInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0; // SQL: event_version > 0
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isOperation(v: unknown): v is OutboxOperation {
  return typeof v === "string" && (OUTBOX_OPERATIONS as readonly string[]).includes(v);
}

// ─── Dar DB istemcisi (yalnız rpc; test için taklit edilebilir) ──────────────
export interface OutboxRpcResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}
export interface OutboxRpcDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<OutboxRpcResult>;
}

// ─── Güvenli hata sınıfları (ham mesaj taşımaz) ──────────────────────────────
/** RPC çağrısının kendisi (transport/DB) başarısız → geçici sınıf. */
export class OutboxRpcError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "OutboxRpcError";
  }
}
/** RPC dönüşü sözleşmeye aykırı (biçim/enum) → kalıcı invariant. */
export class OutboxRpcInvariantError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "OutboxRpcInvariantError";
  }
}

// ─── Sonuç tipleri (BF-11A RPC dönüşleriyle birebir) ─────────────────────────
export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly sourceKey: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly tenantId: string;
  readonly operation: OutboxOperation;
  readonly attempts: number;
  readonly eventVersion: number;
}

/** yh_outbox_complete gerçek dönüş kümesi. */
export type CompleteResult = "succeeded" | "requeued_newer_event";
const COMPLETE_RESULTS: readonly CompleteResult[] = ["succeeded", "requeued_newer_event"];

/** yh_outbox_fail gerçek dönüş kümesi. */
export type FailResult = "retry_scheduled" | "dead" | "requeued_newer_event";
const FAIL_RESULTS: readonly FailResult[] = ["retry_scheduled", "dead", "requeued_newer_event"];

/** yh_outbox_sweep_expired döndürdüğü kurtarılan satır (yalnız güvenli meta). */
export interface SweptOutboxRow {
  readonly id: string;
  readonly sourceKey: string;
  readonly sourceId: string;
  readonly tenantId: string;
  readonly attempts: number;
  readonly eventVersion: number;
}

// ─── Ortak RPC çağrısı (ham mesaj gizlenir) ──────────────────────────────────
async function callRpc(
  db: OutboxRpcDb,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let res: OutboxRpcResult;
  try {
    res = await db.rpc(fn, args);
  } catch {
    throw new OutboxRpcError(`rpc-transport-failed:${fn}`);
  }
  if (res.error !== null) {
    throw new OutboxRpcError(`rpc-failed:${fn}`); // ham message taşınmaz
  }
  return res.data;
}

// ─── 1) claim ────────────────────────────────────────────────────────────────
export async function claimEvents(
  db: OutboxRpcDb,
  worker: string,
  batch: number,
): Promise<ClaimedOutboxEvent[]> {
  const data = await callRpc(db, "yh_outbox_claim", { p_worker: worker, p_batch: batch });
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new OutboxRpcInvariantError("claim-not-array");
  return data.map(mapClaimRow);
}

function mapClaimRow(row: unknown): ClaimedOutboxEvent {
  if (!isRecord(row)) throw new OutboxRpcInvariantError("claim-row-not-object");
  const { id, source_key, source_table, source_id, tenant_id, operation, attempts, event_version } =
    row;
  if (!isUuid(id)) throw new OutboxRpcInvariantError("claim-invalid-id");
  if (!isNonEmptyString(source_key)) throw new OutboxRpcInvariantError("claim-invalid-source-key");
  if (!isNonEmptyString(source_table)) {
    throw new OutboxRpcInvariantError("claim-invalid-source-table");
  }
  if (!isUuid(source_id)) throw new OutboxRpcInvariantError("claim-invalid-source-id");
  if (!isUuid(tenant_id)) throw new OutboxRpcInvariantError("claim-invalid-tenant-id");
  if (!isOperation(operation)) throw new OutboxRpcInvariantError("claim-invalid-operation");
  if (!isNonNegInt(attempts)) throw new OutboxRpcInvariantError("claim-invalid-attempts");
  if (!isPosInt(event_version)) throw new OutboxRpcInvariantError("claim-invalid-event-version");
  return {
    id,
    sourceKey: source_key,
    sourceTable: source_table,
    sourceId: source_id,
    tenantId: tenant_id,
    operation,
    attempts,
    eventVersion: event_version,
  };
}

// ─── 2) complete ─────────────────────────────────────────────────────────────
export async function completeEvent(
  db: OutboxRpcDb,
  id: string,
  worker: string,
  claimedVersion: number,
): Promise<CompleteResult> {
  const data = await callRpc(db, "yh_outbox_complete", {
    p_id: id,
    p_worker: worker,
    p_claimed_version: claimedVersion,
  });
  if (typeof data === "string" && (COMPLETE_RESULTS as readonly string[]).includes(data)) {
    return data as CompleteResult;
  }
  throw new OutboxRpcInvariantError("complete-invalid-result");
}

// ─── 3) fail ─────────────────────────────────────────────────────────────────
export async function failEvent(
  db: OutboxRpcDb,
  id: string,
  worker: string,
  claimedVersion: number,
  error: string,
  maxAttempts: number,
  baseDelay: number,
  maxDelay: number,
): Promise<FailResult> {
  const safeError = typeof error === "string" ? error.slice(0, 2000) : "";
  const data = await callRpc(db, "yh_outbox_fail", {
    p_id: id,
    p_worker: worker,
    p_claimed_version: claimedVersion,
    p_error: safeError,
    p_max_attempts: maxAttempts,
    p_base_delay: baseDelay,
    p_max_delay: maxDelay,
  });
  if (typeof data === "string" && (FAIL_RESULTS as readonly string[]).includes(data)) {
    return data as FailResult;
  }
  throw new OutboxRpcInvariantError("fail-invalid-result");
}

// ─── 4) sweep ────────────────────────────────────────────────────────────────
export async function sweepExpired(
  db: OutboxRpcDb,
  leaseSeconds: number,
  batch: number,
): Promise<SweptOutboxRow[]> {
  const data = await callRpc(db, "yh_outbox_sweep_expired", {
    p_lease_seconds: leaseSeconds,
    p_batch: batch,
  });
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new OutboxRpcInvariantError("sweep-not-array");
  return data.map(mapSweepRow);
}

function mapSweepRow(row: unknown): SweptOutboxRow {
  if (!isRecord(row)) throw new OutboxRpcInvariantError("sweep-row-not-object");
  const { id, source_key, source_id, tenant_id, attempts, event_version } = row;
  if (!isUuid(id)) throw new OutboxRpcInvariantError("sweep-invalid-id");
  if (!isNonEmptyString(source_key)) throw new OutboxRpcInvariantError("sweep-invalid-source-key");
  if (!isUuid(source_id)) throw new OutboxRpcInvariantError("sweep-invalid-source-id");
  if (!isUuid(tenant_id)) throw new OutboxRpcInvariantError("sweep-invalid-tenant-id");
  if (!isNonNegInt(attempts)) throw new OutboxRpcInvariantError("sweep-invalid-attempts");
  if (!isPosInt(event_version)) throw new OutboxRpcInvariantError("sweep-invalid-event-version");
  return {
    id,
    sourceKey: source_key,
    sourceId: source_id,
    tenantId: tenant_id,
    attempts,
    eventVersion: event_version,
  };
}
