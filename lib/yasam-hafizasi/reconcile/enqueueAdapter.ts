/**
 * Yaşam Hafızası™ — Controlled Enqueue RPC Adapter (BF-11D6, DI; fail-closed).
 * ============================================================================
 *
 * YALNIZ exact `yh_outbox_reconcile_enqueue` RPC'sini çağırır. Generic/arbitrary RPC
 * adı KABUL ETMEZ; doğrudan outbox/index table write YOK. DB istemcisi (yalnız `rpc`)
 * ENJEKTE edilir (BF-11B outboxRpcClient deseniyle aynı). Ham DB mesajı TAŞINMAZ.
 */

import {
  RECON_PILOT_SOURCE_KEY,
  RECON_PILOT_SOURCE_TABLE,
} from "./types";
import type { ReconApplyCandidate, ReconEnqueueOutcome, ReconEnqueueResult } from "./applyTypes";

/** Sabit RPC adı — TEK izinli fonksiyon. */
export const RECONCILE_ENQUEUE_RPC = "yh_outbox_reconcile_enqueue" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES: readonly ReconEnqueueOutcome[] = ["inserted", "coalesced_pending", "preserved_processing"];

export interface ReconcileRpcResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}
export interface ReconcileEnqueueDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<ReconcileRpcResult>;
}

/** RPC transport/DB hatası (fail-closed; ham mesaj taşımaz). */
export class ReconEnqueueError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ReconEnqueueError";
  }
}
/** RPC dönüşü sözleşmeye aykırı → kalıcı invariant. */
export class ReconEnqueueInvariantError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ReconEnqueueInvariantError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isPosInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/**
 * TEK candidate için exact `yh_outbox_reconcile_enqueue` çağrısı (yalnız upsert).
 * Fail-closed: RPC hatası → ReconEnqueueError; beklenmeyen dönüş → InvariantError.
 * Doğrudan tablo write YOK; yalnız allowlisted RPC.
 */
export async function enqueueUpsertCandidate(
  db: ReconcileEnqueueDb,
  candidate: ReconApplyCandidate,
): Promise<ReconEnqueueResult> {
  // Defense: adapter yalnız pilot upsert candidate kabul eder.
  if (candidate.sourceKey !== RECON_PILOT_SOURCE_KEY || candidate.sourceTable !== RECON_PILOT_SOURCE_TABLE) {
    throw new ReconEnqueueInvariantError("candidate-not-pilot");
  }
  if (!isUuid(candidate.sourceId) || !isUuid(candidate.tenantId)) {
    throw new ReconEnqueueInvariantError("candidate-invalid-uuid");
  }

  let res: ReconcileRpcResult;
  try {
    res = await db.rpc(RECONCILE_ENQUEUE_RPC, {
      p_source_key: RECON_PILOT_SOURCE_KEY,
      p_source_table: RECON_PILOT_SOURCE_TABLE,
      p_source_id: candidate.sourceId,
      p_tenant_id: candidate.tenantId,
      p_operation: "upsert",
    });
  } catch {
    throw new ReconEnqueueError("rpc-transport-failed");
  }
  if (res.error !== null) throw new ReconEnqueueError("rpc-failed"); // ham message taşınmaz

  // RETURNS TABLE → tek satırlık dizi (veya tek nesne) bekle.
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!isRecord(row)) throw new ReconEnqueueInvariantError("enqueue-result-not-object");
  const { id, source_key, source_id, tenant_id, operation, status, event_version, outcome } = row;
  if (!isUuid(id)) throw new ReconEnqueueInvariantError("enqueue-invalid-id");
  if (source_key !== RECON_PILOT_SOURCE_KEY) throw new ReconEnqueueInvariantError("enqueue-source-key-mismatch");
  if (!isUuid(source_id) || source_id !== candidate.sourceId) throw new ReconEnqueueInvariantError("enqueue-source-id-mismatch");
  if (!isUuid(tenant_id) || tenant_id !== candidate.tenantId) throw new ReconEnqueueInvariantError("enqueue-tenant-mismatch");
  if (operation !== "upsert") throw new ReconEnqueueInvariantError("enqueue-operation-mismatch");
  if (typeof status !== "string" || status.length === 0) throw new ReconEnqueueInvariantError("enqueue-invalid-status");
  if (!isPosInt(event_version)) throw new ReconEnqueueInvariantError("enqueue-invalid-event-version");
  if (typeof outcome !== "string" || !(OUTCOMES as readonly string[]).includes(outcome)) {
    throw new ReconEnqueueInvariantError("enqueue-invalid-outcome");
  }

  return {
    id,
    sourceKey: source_key,
    sourceId: source_id,
    tenantId: tenant_id,
    operation: "upsert",
    status,
    eventVersion: event_version,
    outcome: outcome as ReconEnqueueOutcome,
  };
}
