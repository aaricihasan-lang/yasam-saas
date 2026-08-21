/**
 * PRIVATE MEMORY — Client Outbox RPC Client (framework-bağımsız; DI).
 * ====================================================================
 *
 * public.yasam_hafizasi_client_outbox durum makinesinin (migration 20261217000300)
 * dört RPC'sine dar, test edilebilir erişim (BF-11B outboxRpcClient'ın client karşılığı):
 *   yh_client_outbox_claim / _complete / _fail / _sweep_expired
 *
 * Professional outboxRpcClient DEĞİŞMEZ; ortak hata sınıfları + DB arayüzü yeniden
 * kullanılır (kod tekrarını azaltır, semantik uyumu garanti eder). TEK fark: claim/sweep
 * satırları client_id EK alanı taşır (client index builder ownership için).
 */
import { OUTBOX_OPERATIONS, type OutboxOperation } from "./outboxState";
import {
  OutboxRpcError,
  OutboxRpcInvariantError,
  type OutboxRpcDb,
} from "./outboxRpcClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}
function isPosInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isOperation(v: unknown): v is OutboxOperation {
  return typeof v === "string" && (OUTBOX_OPERATIONS as readonly string[]).includes(v);
}

/** Client claim satırı (professional + client_id). */
export interface ClaimedClientOutboxEvent {
  readonly id: string;
  readonly sourceKey: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly tenantId: string;
  readonly clientId: string;
  readonly operation: OutboxOperation;
  readonly attempts: number;
  readonly eventVersion: number;
}

export type ClientCompleteResult = "succeeded" | "requeued_newer_event";
const COMPLETE_RESULTS: readonly ClientCompleteResult[] = ["succeeded", "requeued_newer_event"];

export type ClientFailResult = "retry_scheduled" | "dead" | "requeued_newer_event";
const FAIL_RESULTS: readonly ClientFailResult[] = ["retry_scheduled", "dead", "requeued_newer_event"];

export interface SweptClientOutboxRow {
  readonly id: string;
  readonly sourceKey: string;
  readonly sourceId: string;
  readonly tenantId: string;
  readonly clientId: string;
  readonly attempts: number;
  readonly eventVersion: number;
}

async function callRpc(db: OutboxRpcDb, fn: string, args: Record<string, unknown>): Promise<unknown> {
  let res;
  try {
    res = await db.rpc(fn, args);
  } catch {
    throw new OutboxRpcError(`rpc-transport-failed:${fn}`);
  }
  if (res.error !== null) {
    throw new OutboxRpcError(`rpc-failed:${fn}`);
  }
  return res.data;
}

// ─── 1) claim ────────────────────────────────────────────────────────────────
export async function claimClientEvents(
  db: OutboxRpcDb,
  worker: string,
  batch: number,
): Promise<ClaimedClientOutboxEvent[]> {
  const data = await callRpc(db, "yh_client_outbox_claim", { p_worker: worker, p_batch: batch });
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new OutboxRpcInvariantError("client-claim-not-array");
  return data.map(mapClaimRow);
}

function mapClaimRow(row: unknown): ClaimedClientOutboxEvent {
  if (!isRecord(row)) throw new OutboxRpcInvariantError("client-claim-row-not-object");
  const { id, source_key, source_table, source_id, tenant_id, client_id, operation, attempts, event_version } = row;
  if (!isUuid(id)) throw new OutboxRpcInvariantError("client-claim-invalid-id");
  if (!isNonEmptyString(source_key)) throw new OutboxRpcInvariantError("client-claim-invalid-source-key");
  if (!isNonEmptyString(source_table)) throw new OutboxRpcInvariantError("client-claim-invalid-source-table");
  if (!isUuid(source_id)) throw new OutboxRpcInvariantError("client-claim-invalid-source-id");
  if (!isUuid(tenant_id)) throw new OutboxRpcInvariantError("client-claim-invalid-tenant-id");
  if (!isUuid(client_id)) throw new OutboxRpcInvariantError("client-claim-invalid-client-id");
  if (!isOperation(operation)) throw new OutboxRpcInvariantError("client-claim-invalid-operation");
  if (!isNonNegInt(attempts)) throw new OutboxRpcInvariantError("client-claim-invalid-attempts");
  if (!isPosInt(event_version)) throw new OutboxRpcInvariantError("client-claim-invalid-event-version");
  return {
    id,
    sourceKey: source_key,
    sourceTable: source_table,
    sourceId: source_id,
    tenantId: tenant_id,
    clientId: client_id,
    operation,
    attempts,
    eventVersion: event_version,
  };
}

// ─── 2) complete ─────────────────────────────────────────────────────────────
export async function completeClientEvent(
  db: OutboxRpcDb,
  id: string,
  worker: string,
  claimedVersion: number,
): Promise<ClientCompleteResult> {
  const data = await callRpc(db, "yh_client_outbox_complete", {
    p_id: id,
    p_worker: worker,
    p_claimed_version: claimedVersion,
  });
  if (typeof data === "string" && (COMPLETE_RESULTS as readonly string[]).includes(data)) {
    return data as ClientCompleteResult;
  }
  throw new OutboxRpcInvariantError("client-complete-invalid-result");
}

// ─── 3) fail ─────────────────────────────────────────────────────────────────
export async function failClientEvent(
  db: OutboxRpcDb,
  id: string,
  worker: string,
  claimedVersion: number,
  error: string,
  maxAttempts: number,
  baseDelay: number,
  maxDelay: number,
): Promise<ClientFailResult> {
  const safeError = typeof error === "string" ? error.slice(0, 2000) : "";
  const data = await callRpc(db, "yh_client_outbox_fail", {
    p_id: id,
    p_worker: worker,
    p_claimed_version: claimedVersion,
    p_error: safeError,
    p_max_attempts: maxAttempts,
    p_base_delay: baseDelay,
    p_max_delay: maxDelay,
  });
  if (typeof data === "string" && (FAIL_RESULTS as readonly string[]).includes(data)) {
    return data as ClientFailResult;
  }
  throw new OutboxRpcInvariantError("client-fail-invalid-result");
}

// ─── 4) sweep ────────────────────────────────────────────────────────────────
export async function sweepExpiredClient(
  db: OutboxRpcDb,
  leaseSeconds: number,
  batch: number,
): Promise<SweptClientOutboxRow[]> {
  const data = await callRpc(db, "yh_client_outbox_sweep_expired", {
    p_lease_seconds: leaseSeconds,
    p_batch: batch,
  });
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new OutboxRpcInvariantError("client-sweep-not-array");
  return data.map(mapSweepRow);
}

function mapSweepRow(row: unknown): SweptClientOutboxRow {
  if (!isRecord(row)) throw new OutboxRpcInvariantError("client-sweep-row-not-object");
  const { id, source_key, source_id, tenant_id, client_id, attempts, event_version } = row;
  if (!isUuid(id)) throw new OutboxRpcInvariantError("client-sweep-invalid-id");
  if (!isNonEmptyString(source_key)) throw new OutboxRpcInvariantError("client-sweep-invalid-source-key");
  if (!isUuid(source_id)) throw new OutboxRpcInvariantError("client-sweep-invalid-source-id");
  if (!isUuid(tenant_id)) throw new OutboxRpcInvariantError("client-sweep-invalid-tenant-id");
  if (!isUuid(client_id)) throw new OutboxRpcInvariantError("client-sweep-invalid-client-id");
  if (!isNonNegInt(attempts)) throw new OutboxRpcInvariantError("client-sweep-invalid-attempts");
  if (!isPosInt(event_version)) throw new OutboxRpcInvariantError("client-sweep-invalid-event-version");
  return {
    id,
    sourceKey: source_key,
    sourceId: source_id,
    tenantId: tenant_id,
    clientId: client_id,
    attempts,
    eventVersion: event_version,
  };
}
