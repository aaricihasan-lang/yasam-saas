/**
 * Yaşam Hafızası™ — Controlled Reconciliation Apply Entry (BF-11D6, DI; fail-closed).
 * ============================================================================
 *
 * Default KAPALI. Yalnız TÜM kapılar geçerse enqueue yapar. Dry-run'dan AYRI; gizli
 * `mode: apply` YOK. Doğrudan index/outbox table write YOK — yalnız allowlisted RPC.
 *
 * KAPI SIRASI (fail-closed, herhangi biri düşerse RPC 0):
 *   1) env gate (applyEnabled)          2) confirmation phrase (exact)
 *   3) source allowlist (dogaltas:stones) 4) maxEnqueue bounded
 *   5) fresh rescan (iki pass + combined) 6) blocking anomaly / delete candidate yok
 *   7) candidate count == expected        8) candidate digest == expected
 *   9) deterministik sıra (source_id)     10) sequential (concurrency 1) enqueue
 *   11) ilk RPC hatasında güvenli stop
 *
 * Sonuç yalnız güvenli sayaç/teknik meta (taş içeriği/PII YOK).
 */

import type { SourceConfig } from "../indexer/sources";
import { isPilotStoneConfig } from "./classifyRecord";
import {
  CombinedReconcile,
  runIndexToSourcePass,
  runSourceToIndexPass,
  type IndexLookupPort,
  type IndexScanPort,
  type SourceExistsPort,
  type SourceScanPort,
} from "./reconcileSource";
import { RECON_DEFAULT_CAPS, RECON_PILOT_SOURCE_KEY, RECON_PILOT_SOURCE_TABLE, type ReconScanCaps } from "./types";
import { computeCandidateFingerprint } from "./candidateDigest";
import { enqueueUpsertCandidate, type ReconcileEnqueueDb } from "./enqueueAdapter";
import {
  RECON_APPLY_ABSOLUTE_MAX_ENQUEUE,
  RECON_APPLY_BLOCKING_CLASSIFICATIONS,
  RECON_APPLY_CLASSIFICATIONS,
  RECON_APPLY_CONFIRMATION,
  RECON_APPLY_DEFAULT_MAX_ENQUEUE,
  YH_RECONCILE_APPLY_ENABLE_FLAG,
  type ReconApplyCandidate,
  type ReconApplyClassification,
  type ReconApplyResult,
  type ReconApplyStopReason,
} from "./applyTypes";

/** Production gate — yalnız tam olarak "true" iken apply açılır (default kapalı). */
export function isReconcileApplyEnabled(): boolean {
  return process.env[YH_RECONCILE_APPLY_ENABLE_FLAG] === "true";
}

export interface ReconcileApplyDeps {
  readonly config: SourceConfig;
  readonly applyEnabled: boolean;
  readonly confirmation: string;
  readonly expectedCandidateCount: number;
  readonly expectedCandidateDigest: string;
  readonly maxEnqueue?: number;
  readonly caps?: ReconScanCaps;
  // Fresh rescan read ports.
  readonly source: SourceScanPort;
  readonly index: IndexScanPort;
  readonly indexLookup: IndexLookupPort;
  readonly sourceExists: SourceExistsPort;
  // Enqueue RPC (yalnız allowlisted fonksiyon).
  readonly enqueueDb: ReconcileEnqueueDb;
}

const BLOCKING = new Set<string>(RECON_APPLY_BLOCKING_CLASSIFICATIONS);
const APPLY_CLASSES = new Set<string>(RECON_APPLY_CLASSIFICATIONS);
const DELETE_CLASSES = new Set<string>(["orphan_index", "deindex_required"]);

function stop(reason: ReconApplyStopReason, count = 0, digest: string | null = null): ReconApplyResult {
  return {
    ran: false,
    stopReason: reason,
    candidateCount: count,
    candidateDigest: digest,
    attempted: 0,
    enqueued: 0,
    outcomes: { inserted: 0, coalesced_pending: 0, preserved_processing: 0 },
    failed: 0,
    rpcCalls: 0,
  };
}

export async function runReconcileApply(deps: ReconcileApplyDeps): Promise<ReconApplyResult> {
  // 1) env gate (hiçbir read/RPC yapmadan).
  if (!deps.applyEnabled) return stop("disabled");
  // 2) confirmation phrase (exact).
  if (deps.confirmation !== RECON_APPLY_CONFIRMATION) return stop("invalid-confirmation");
  // 3) source allowlist.
  if (!isPilotStoneConfig(deps.config)) return stop("unsupported-source");
  // 4) maxEnqueue bounded.
  const maxEnqueue = deps.maxEnqueue ?? RECON_APPLY_DEFAULT_MAX_ENQUEUE;
  if (!Number.isInteger(maxEnqueue) || maxEnqueue < 0 || maxEnqueue > RECON_APPLY_ABSOLUTE_MAX_ENQUEUE) {
    return stop("max-enqueue-exceeded");
  }
  const caps = deps.caps ?? RECON_DEFAULT_CAPS;

  // 5) FRESH RESCAN (iki pass + anomaly-aware combined).
  const combine = new CombinedReconcile();
  const src = await runSourceToIndexPass(deps.config, { source: deps.source, indexLookup: deps.indexLookup }, caps, null, combine);
  const idx = await runIndexToSourcePass({ index: deps.index, sourceExists: deps.sourceExists }, caps, null, combine);
  // Tarama cap nedeniyle eksik kaldıysa aday seti güvenilmez → fail-closed.
  if (src.stoppedByCap || idx.stoppedByCap) return stop("count-mismatch");

  const entries = combine.entries();

  // 6) blocking anomaly / delete candidate gate.
  for (const e of entries) {
    if (e.futureAction === "delete" || DELETE_CLASSES.has(e.classification)) return stop("delete-candidate-present");
    if (BLOCKING.has(e.classification)) return stop("blocking-anomaly-present");
  }

  // Apply candidate'leri topla (yalnız missing/stale upsert; contentHash zorunlu).
  const candidates: ReconApplyCandidate[] = [];
  for (const e of entries) {
    if (!APPLY_CLASSES.has(e.classification)) continue;
    if (e.futureAction !== "upsert" || e.sourceId === null || e.tenantId === null || e.contentHash === undefined) {
      // Beklenmeyen eksik alan → güvenli tarafta blocking say.
      return stop("blocking-anomaly-present");
    }
    candidates.push({
      sourceKey: RECON_PILOT_SOURCE_KEY,
      sourceTable: RECON_PILOT_SOURCE_TABLE,
      sourceId: e.sourceId,
      tenantId: e.tenantId,
      classification: e.classification as ReconApplyClassification,
      contentHash: e.contentHash,
    });
  }

  // 7-8) count + digest gate (fresh rescan ↔ beklenen).
  const fp = computeCandidateFingerprint(candidates);
  if (fp.candidateCount !== deps.expectedCandidateCount) return stop("count-mismatch", fp.candidateCount, fp.candidateDigest);
  if (fp.candidateDigest !== deps.expectedCandidateDigest) return stop("digest-mismatch", fp.candidateCount, fp.candidateDigest);

  // Boş aday seti → güvenli no-op (RPC 0).
  if (candidates.length === 0) {
    return { ran: true, stopReason: "completed", candidateCount: 0, candidateDigest: fp.candidateDigest, attempted: 0, enqueued: 0, outcomes: { inserted: 0, coalesced_pending: 0, preserved_processing: 0 }, failed: 0, rpcCalls: 0 };
  }

  // 9) deterministik sıra (source_id) — digest'ten bağımsız, kararlı enqueue sırası.
  const ordered = [...candidates].sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
  const toEnqueue = ordered.slice(0, maxEnqueue);

  // 10-11) sequential (concurrency 1) enqueue; ilk hatada güvenli stop.
  const outcomes = { inserted: 0, coalesced_pending: 0, preserved_processing: 0 };
  let attempted = 0;
  let enqueued = 0;
  let failed = 0;
  let rpcCalls = 0;
  let stopReason: ReconApplyStopReason = "completed";
  for (const c of toEnqueue) {
    attempted += 1;
    rpcCalls += 1;
    try {
      const r = await enqueueUpsertCandidate(deps.enqueueDb, c);
      enqueued += 1;
      outcomes[r.outcome] += 1;
    } catch {
      failed += 1;
      stopReason = "enqueue-error"; // ilk hatada dur; sonraki candidate çağrılmaz
      break;
    }
  }

  return { ran: true, stopReason, candidateCount: fp.candidateCount, candidateDigest: fp.candidateDigest, attempted, enqueued, outcomes, failed, rpcCalls };
}
