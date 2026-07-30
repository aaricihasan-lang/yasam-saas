/**
 * Yaşam Hafızası™ — Reconciliation Sözleşmeleri (BF-11D1, SAF tipler + sabitler).
 * ============================================================================
 *
 * YALNIZ TİP + SABİT. Bu dosyada MANTIK / IO / DB / write YOKTUR.
 *
 * BF-11D reconciliation DRY-RUN paketinin ortak sözleşmesi: sınıflandırma union'ı,
 * gerekçe union'ı, gelecek-aksiyon (yalnız VERİ; bu pakette ÇALIŞTIRILMAZ), iki-yönlü
 * tarama (source→index / index→source) cursor + safety-cap + özet tipleri.
 *
 * BAĞLAYICI KARARLAR:
 *   - Content hash stale kararında TEK OTORİTEDİR (`source_updated_at` yalnız diagnostic).
 *   - Kaynak gerçekten yoksa `orphan_index`; kaynak var fakat artık indexlenemezse
 *     ayrı `deindex_required`.
 *   - Tarama İKİ YÖNLÜDÜR: source→index ve index→source ayrı cursor/sayaç/cap taşır.
 *   - Pilot yalnız `dogaltas:stones` (fail-closed allowlist).
 *   - Demo / sentetik / skipped kayıtlar `missing_index` SAYILMAZ.
 *   - futureAction yalnız rapor alanıdır; bu pakette enqueue/write YAPILMAZ.
 */

// ─── Pilot allowlist (fail-closed; başka tablo/kaynak kabul edilmez) ───────────
export const RECON_PILOT_SOURCE_KEY = "dogaltas:stones" as const;
export const RECON_PILOT_SOURCE_TABLE = "stones" as const;

// ─── Sınıflandırma union (KİLİTLİ) ────────────────────────────────────────────
export type ReconClassification =
  | "healthy"
  | "missing_index"
  | "stale_index"
  | "orphan_index"
  | "intentionally_excluded"
  | "skipped_build"
  | "deindex_required"
  | "tenant_mismatch"
  | "duplicate_index"
  | "index_invariant_violation"
  | "source_read_error"
  | "unsupported_source";

export const RECON_CLASSIFICATIONS: readonly ReconClassification[] = [
  "healthy",
  "missing_index",
  "stale_index",
  "orphan_index",
  "intentionally_excluded",
  "skipped_build",
  "deindex_required",
  "tenant_mismatch",
  "duplicate_index",
  "index_invariant_violation",
  "source_read_error",
  "unsupported_source",
] as const;

// ─── Gerekçe union (kapalı; ham içerik/PII taşımaz) ───────────────────────────
export type ReconReason =
  | "none"
  // intentionally_excluded / deindex_required nedenleri
  | "demo"
  | "synthetic"
  | "shared_not_allowed"
  | "pii"
  | "unclassified"
  | "source_disabled"
  | "policy_rejected"
  | "build_null"
  // healthy / stale
  | "hash_match"
  | "hash_mismatch"
  // index-centric anomaliler
  | "no_source_row"
  | "tenant_divergence"
  | "duplicate_key"
  | "unit_type_invalid"
  | "section_ref_present"
  | "source_table_invalid"
  // kontrollü hata / kapsam
  | "tenant_unresolved"
  | "not_pilot_source";

// ─── Gelecek aksiyon (YALNIZ VERİ; bu pakette çalıştırılmaz) ───────────────────
export type ReconFutureAction = "none" | "upsert" | "delete";

/** Tarama yönü. */
export type ReconScanPass = "source" | "index";

// ─── Tek kayıt sonucu (yalnız GÜVENLİ teknik alanlar; PII/içerik YOK) ──────────
export interface ReconRecordResult {
  readonly pass: ReconScanPass;
  readonly classification: ReconClassification;
  readonly reason: ReconReason;
  /** Gelecekte apply açılırsa uygulanacak aksiyon — bu pakette YALNIZ rapor alanı. */
  readonly futureAction: ReconFutureAction;
  readonly sourceId: string | null;
  readonly tenantId: string | null;
  /**
   * Yeniden üretilen içerik hash'i — YALNIZ eligible source→index sonuçlarında
   * (healthy/missing_index/stale_index) doldurulur; aksi undefined. BF-11D6 candidate
   * digest güvenlik kapısı için (içerik/PII taşımaz; SHA-256 fingerprint).
   */
  readonly contentHash?: string;
}

// ─── Safety cap'ler (muhafazakâr; tek yerde) ──────────────────────────────────
export interface ReconScanCaps {
  /** İstenen sayfa boyutu (keyset). */
  readonly pageSize: number;
  /** Sayfa boyutu üst sınırı (hard cap). */
  readonly maxPageSize: number;
  /** Bir taramada işlenecek maksimum sayfa. */
  readonly maxPages: number;
  /** Bir taramada işlenecek maksimum satır. */
  readonly maxScannedRows: number;
  /** Yanıtta örneklenecek maksimum aday/anomali satırı (SAYAÇLAR tam kalır). */
  readonly maxReportedCandidates: number;
}

/**
 * Varsayılan cap'ler. Kaynak batch sabitleri `runSource`'tan REUSE edilir
 * (DEFAULT_SOURCE_BATCH_SIZE=200, MAX_SOURCE_BATCH_SIZE=500). Pilot (stones ~1447,
 * index ~500) bu değerlerle kontrollü, sayfalı ve HARD-bounded taranır:
 *   maxPages(50) * maxPageSize(500) = 25.000 satır tavanı; maxScannedRows ile de sınırlı.
 */
export const RECON_DEFAULT_CAPS: ReconScanCaps = {
  pageSize: 200,
  maxPageSize: 500,
  maxPages: 50,
  maxScannedRows: 25_000,
  maxReportedCandidates: 500,
} as const;

// ─── Cursor (keyset; deterministik; offset YOK) ───────────────────────────────
/** Keyset cursor: son işlenen `id` (stones.id / index.id). null → baştan. */
export type ReconCursor = string | null;

/** Tek yön (pass) için tarama özeti — ayrı cursor / sayaç / done bilgisi. */
export interface ReconPassSummary {
  readonly pass: ReconScanPass;
  readonly scannedRows: number;
  readonly pagesScanned: number;
  /** classification → adet (bu pass'te). */
  readonly byClassification: Readonly<Record<string, number>>;
  /** Bounded örnek aday/anomali listesi (maxReportedCandidates ile sınırlı). */
  readonly sample: readonly ReconRecordResult[];
  /** Yalnız index→source pass: aynı-tenant kaynakla eşleşen (source pass'in sahiplendiği) satır sayısı. */
  readonly covered?: number;
  /** Daha fazla sayfa var mı (cap veya veri sonu). */
  readonly hasMore: boolean;
  /** Devam için sonraki cursor (hasMore=false ise null). */
  readonly nextCursor: ReconCursor;
  /** Cap nedeniyle mi durdu (true) yoksa veri bitti mi (false). */
  readonly stoppedByCap: boolean;
}

// ─── Recovery health özeti (yalnız BF-11A/B outbox aggregate; PII/last_error YOK) ─
export interface ReconRecoveryHealth {
  readonly total: number;
  readonly pending: number;
  readonly pendingReady: number;
  readonly pendingFuture: number;
  readonly processing: number;
  readonly processingExpired: number;
  readonly succeeded: number;
  readonly dead: number;
  readonly maxAttempts: number;
  /** last_error dolu satır sayısı (ham metin TAŞINMAZ). */
  readonly withError: number;
}

// ─── Güvenli dry-run yanıtı (route + Inngest ortak) ───────────────────────────
export interface ReconDryRunResult {
  readonly mode: "dry-run";
  readonly sourceKey: typeof RECON_PILOT_SOURCE_KEY;
  readonly sourceToIndex: ReconPassSummary;
  readonly indexToSource: ReconPassSummary;
  /**
   * İki yönün ANOMALY-AWARE birleşik classification tally'si. Her identity YALNIZ bir
   * kez, fail-closed precedence ile (duplicate>invariant>tenant_mismatch>normal): bir
   * identity anomaly ve actionable candidate olarak birlikte SAYILMAZ.
   */
  readonly combined: Readonly<Record<string, number>>;
  /** Anomaly-aware birleşik aday/anomali örneği (bounded; kazanan sınıf per identity). */
  readonly combinedSample: readonly ReconRecordResult[];
  readonly recovery: ReconRecoveryHealth | null;
  readonly caps: ReconScanCaps;
}
