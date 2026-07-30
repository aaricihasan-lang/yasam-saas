/**
 * Yaşam Hafızası™ — Controlled Apply Sözleşmeleri (BF-11D6, SAF tipler + sabitler).
 * ============================================================================
 *
 * YALNIZ TİP + SABİT. IO / DB / write YOK. BF-11D dry-run'dan FİZİKSEL AYRI.
 *
 * BAĞLAYICI: apply YALNIZ dogaltas:stones + upsert (missing_index/stale_index).
 * delete/deindex/orphan/duplicate/tenant_mismatch/invariant apply DESTEKLENMEZ.
 * Default KAPALI: env + confirmation phrase + candidate count + candidate digest
 * kapılarının TAMAMI geçmeden hiçbir RPC yapılmaz.
 */

import { RECON_PILOT_SOURCE_KEY, RECON_PILOT_SOURCE_TABLE } from "./types";

/** Apply'ı açan env bayrağı (default kapalı; production'da bu turda açılmaz). */
export const YH_RECONCILE_APPLY_ENABLE_FLAG = "YH_RECONCILE_APPLY_ENABLED";

/** Exact ve sabit onay ifadesi (yanlış/eksik → RPC 0). */
export const RECON_APPLY_CONFIRMATION = "BF-11D6_APPLY_DOGALTAS_STONES_UPSERT" as const;

/** Apply candidate sınıfları (yalnız upsert-üreten). */
export const RECON_APPLY_CLASSIFICATIONS = ["missing_index", "stale_index"] as const;
export type ReconApplyClassification = (typeof RECON_APPLY_CLASSIFICATIONS)[number];

/** Apply'ı fail-closed engelleyen anomaly/edge sınıfları (biri varsa RPC 0). */
export const RECON_APPLY_BLOCKING_CLASSIFICATIONS = [
  "tenant_mismatch",
  "duplicate_index",
  "index_invariant_violation",
  "source_read_error",
  "unsupported_source",
  "orphan_index",
  "deindex_required",
] as const;

/** Enqueue cap'leri (production 656 apply yöntemi ayrıca kilitlenecek; burada bounded). */
export const RECON_APPLY_DEFAULT_MAX_ENQUEUE = 100;
export const RECON_APPLY_ABSOLUTE_MAX_ENQUEUE = 1000;
export const RECON_APPLY_CONCURRENCY = 1;

/** Tek apply candidate (yalnız güvenli teknik identity + content_hash fingerprint). */
export interface ReconApplyCandidate {
  readonly sourceKey: typeof RECON_PILOT_SOURCE_KEY;
  readonly sourceTable: typeof RECON_PILOT_SOURCE_TABLE;
  readonly sourceId: string;
  readonly tenantId: string;
  readonly classification: ReconApplyClassification;
  readonly contentHash: string;
}

/** Deterministik candidate-set fingerprint (güvenlik kapısı; DB'ye yazılmaz). */
export interface ReconApplyFingerprint {
  readonly candidateCount: number;
  readonly candidateDigest: string; // SHA-256 hex
}

/** Tek enqueue sonucu (RPC dönüşü; ham içerik/PII YOK). */
export type ReconEnqueueOutcome = "inserted" | "coalesced_pending" | "preserved_processing";
export interface ReconEnqueueResult {
  readonly id: string;
  readonly sourceKey: string;
  readonly sourceId: string;
  readonly tenantId: string;
  readonly operation: "upsert";
  readonly status: string;
  readonly eventVersion: number;
  readonly outcome: ReconEnqueueOutcome;
}

/** Apply neden durdu (fail-closed teşhis; ham mesaj taşımaz). */
export type ReconApplyStopReason =
  | "disabled"
  | "invalid-confirmation"
  | "unsupported-source"
  | "blocking-anomaly-present"
  | "delete-candidate-present"
  | "count-mismatch"
  | "digest-mismatch"
  | "max-enqueue-exceeded"
  | "enqueue-error"
  | "completed";

/** Apply özeti (yalnız güvenli sayaç/teknik meta; taş içeriği YOK). */
export interface ReconApplyResult {
  readonly ran: boolean;
  readonly stopReason: ReconApplyStopReason;
  readonly candidateCount: number;
  readonly candidateDigest: string | null;
  readonly attempted: number;
  readonly enqueued: number;
  readonly outcomes: { readonly inserted: number; readonly coalesced_pending: number; readonly preserved_processing: number };
  readonly failed: number;
  readonly rpcCalls: number;
}
