/**
 * Yaşam Hafızası™ — Reconciliation Dry-Run Entry (BF-11D3, DI; salt-okunur).
 * ============================================================================
 *
 * Pilot allowlist + iki-yönlü orkestrasyon + recovery health aggregate + güvenli
 * yanıt. TEK MOD: dry-run. Write yolu YOK (yalnız READ port'ları enjekte edilir).
 * `getServerDb`/`@supabase` IMPORT ETMEZ → DB'siz harness'ten import edilebilir;
 * gerçek db route/Inngest tarafından `createReconcilePorts` ile verilir.
 *
 * Recovery health: BF-11A/B outbox sözleşmesi YALNIZ GÖZLEMLENİR (yeni state machine
 * yok). `computeRecoveryHealth` saftır (nowMs çağırandan geçer; saat okunmaz).
 */

import type { SourceConfig } from "../indexer/sources";
import {
  CombinedReconcile,
  runIndexToSourcePass,
  runSourceToIndexPass,
  type IndexLookupPort,
  type IndexScanPort,
  type SourceExistsPort,
  type SourceScanPort,
} from "./reconcileSource";
import {
  createSupabaseIndexLookup,
  createSupabaseIndexScanner,
  createSupabaseSourceExists,
  createSupabaseSourceScanner,
  type ReadDbClient,
} from "./indexScanAdapter";
import { isPilotStoneConfig } from "./classifyRecord";
import {
  RECON_DEFAULT_CAPS,
  RECON_PILOT_SOURCE_KEY,
  type ReconDryRunResult,
  type ReconRecoveryHealth,
  type ReconScanCaps,
} from "./types";

/** Pilot dışı kaynak dry-run'a giremez (fail-closed). */
export class ReconUnsupportedSourceError extends Error {
  constructor() {
    super("recon-unsupported-source");
    this.name = "ReconUnsupportedSourceError";
  }
}

const OUTBOX_TABLE = "yasam_hafizasi_outbox";

// ─── Recovery health (SAF; nowMs çağırandan; BF-11A/B YALNIZ gözlemlenir) ──────
export interface OutboxHealthRow {
  readonly status: string;
  readonly attempts: number;
  readonly availableAtMs: number | null;
  readonly lockedAtMs: number | null;
  readonly hasError: boolean;
}

export function computeRecoveryHealth(
  rows: readonly OutboxHealthRow[],
  nowMs: number,
  leaseSeconds: number,
): ReconRecoveryHealth {
  let pending = 0;
  let pendingReady = 0;
  let pendingFuture = 0;
  let processing = 0;
  let processingExpired = 0;
  let succeeded = 0;
  let dead = 0;
  let maxAttempts = 0;
  let withError = 0;

  const leaseMs = leaseSeconds * 1000;
  for (const r of rows) {
    if (r.attempts > maxAttempts) maxAttempts = r.attempts;
    if (r.hasError) withError += 1;
    switch (r.status) {
      case "pending":
        pending += 1;
        if (r.availableAtMs !== null && r.availableAtMs > nowMs) pendingFuture += 1;
        else pendingReady += 1;
        break;
      case "processing":
        processing += 1;
        if (r.lockedAtMs !== null && nowMs - r.lockedAtMs > leaseMs) processingExpired += 1;
        break;
      case "succeeded":
        succeeded += 1;
        break;
      case "dead":
        dead += 1;
        break;
      default:
        break; // bilinmeyen status yok sayılır (fail-safe)
    }
  }
  return {
    total: rows.length,
    pending,
    pendingReady,
    pendingFuture,
    processing,
    processingExpired,
    succeeded,
    dead,
    maxAttempts,
    withError,
  };
}

// ─── Read-only outbox health port + adapter ───────────────────────────────────
export interface OutboxHealthPort {
  readOutboxHealthRows(limit: number): Promise<readonly OutboxHealthRow[]>;
}

function parseMs(v: unknown): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function createSupabaseOutboxHealth(db: ReadDbClient): OutboxHealthPort {
  return {
    readOutboxHealthRows: async (limit) => {
      const { data, error } = await db
        .from(OUTBOX_TABLE)
        .select("status,attempts,available_at,locked_at,last_error")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error("recon-outbox-health-read-failed"); // ham mesaj taşınmaz
      const rows: OutboxHealthRow[] = [];
      for (const r of data ?? []) {
        const status = typeof r["status"] === "string" ? (r["status"] as string) : "";
        const attemptsRaw = r["attempts"];
        rows.push({
          status,
          attempts: typeof attemptsRaw === "number" && Number.isInteger(attemptsRaw) ? attemptsRaw : 0,
          availableAtMs: parseMs(r["available_at"]),
          lockedAtMs: parseMs(r["locked_at"]),
          hasError: typeof r["last_error"] === "string" && (r["last_error"] as string).length > 0,
        });
      }
      return rows;
    },
  };
}

// ─── Port factory (gerçek db → read-only port'lar) ────────────────────────────
export interface ReconcilePorts {
  readonly source: SourceScanPort;
  readonly index: IndexScanPort;
  readonly indexLookup: IndexLookupPort;
  readonly sourceExists: SourceExistsPort;
  readonly outboxHealth: OutboxHealthPort;
}

export function createReconcilePorts(db: ReadDbClient, config: SourceConfig): ReconcilePorts {
  return {
    source: createSupabaseSourceScanner(db, config),
    index: createSupabaseIndexScanner(db),
    indexLookup: createSupabaseIndexLookup(db),
    sourceExists: createSupabaseSourceExists(db, config),
    outboxHealth: createSupabaseOutboxHealth(db),
  };
}

// ─── Dry-run orkestrasyonu (yalnız READ; write yolu yok) ──────────────────────
export interface ReconcileDryRunDeps {
  readonly config: SourceConfig;
  readonly source: SourceScanPort;
  readonly index: IndexScanPort;
  readonly indexLookup: IndexLookupPort;
  readonly sourceExists: SourceExistsPort;
  readonly outboxHealth?: OutboxHealthPort | null;
  readonly caps?: ReconScanCaps;
  readonly nowMs: number;
  readonly leaseSeconds: number;
}

export async function runReconcileDryRun(deps: ReconcileDryRunDeps): Promise<ReconDryRunResult> {
  // Pilot allowlist (fail-closed; route de doğrular).
  if (!isPilotStoneConfig(deps.config)) throw new ReconUnsupportedSourceError();

  const caps = deps.caps ?? RECON_DEFAULT_CAPS;

  // ANOMALY-AWARE COMBINED: her iki pass sonuçlarını identity-anahtarlı precedence
  // katmanına besle. Aynı identity için anomaly (duplicate>invariant>tenant_mismatch)
  // varsa actionable/normal BASTIRILIR → combined'da hem anomaly hem actionable
  // candidate ASLA birlikte görünmez. Per-pass sayaç/cursor'lar (aşağıda) DEĞİŞMEZ.
  const combine = new CombinedReconcile();

  const sourceToIndex = await runSourceToIndexPass(
    deps.config,
    { source: deps.source, indexLookup: deps.indexLookup },
    caps,
    null,
    combine,
  );
  const indexToSource = await runIndexToSourcePass(
    { index: deps.index, sourceExists: deps.sourceExists },
    caps,
    null,
    combine,
  );

  let recovery: ReconRecoveryHealth | null = null;
  if (deps.outboxHealth) {
    const rows = await deps.outboxHealth.readOutboxHealthRows(caps.maxScannedRows);
    recovery = computeRecoveryHealth(rows, deps.nowMs, deps.leaseSeconds);
  }

  return {
    mode: "dry-run",
    sourceKey: RECON_PILOT_SOURCE_KEY,
    sourceToIndex,
    indexToSource,
    combined: combine.tally(),
    combinedSample: combine.sample(caps.maxReportedCandidates),
    recovery,
    caps,
  };
}
