/**
 * BF-14 Ertelenmiş Kaynaklar — Kişisel Arşiv row-level sınıflandırma isteği (SAF; test edilebilir).
 *
 * BAĞLAYICI (§6D/§14): yalnız yetkili uzman/admin explicit action + reason ile sınıflandırır.
 * classification allowlist; safe-non-pii yalnız açık aksiyon; unclassified/pii FAIL-CLOSED.
 * reviewedContentHash → stale-content guard (archive güncellenirse eski safe geçersiz).
 * tenant BURADA OKUNMAZ (session'dan); archive_id doğrulanmış ownership'ten gelir.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/i;
const REASON_MAX = 2000;

export type ArchiveClassification = "unclassified" | "safe-non-pii" | "pii" | "restricted";

const VALID: readonly ArchiveClassification[] = ["unclassified", "safe-non-pii", "pii", "restricted"];

export interface ParsedArchiveClassification {
  archiveId: string;
  classification: ArchiveClassification;
  reason?: string;
  /** Mevcut archive içeriğinin hash'i; safe-non-pii için ZORUNLU (stale guard). */
  reviewedContentHash?: string;
}

export type ParseArchiveClassificationResult =
  | { ok: true; value: ParsedArchiveClassification }
  | { ok: false; code: string };

export function isArchiveClassification(v: unknown): v is ArchiveClassification {
  return typeof v === "string" && (VALID as readonly string[]).includes(v);
}

export function parseArchiveClassification(body: unknown): ParseArchiveClassificationResult {
  if (!body || typeof body !== "object") return { ok: false, code: "YH_ARC_INVALID_BODY" };
  const b = body as Record<string, unknown>;

  if (typeof b.archiveId !== "string" || !UUID_RE.test(b.archiveId)) {
    return { ok: false, code: "YH_ARC_INVALID_ARCHIVE_ID" };
  }
  if (!isArchiveClassification(b.classification)) {
    return { ok: false, code: "YH_ARC_INVALID_CLASSIFICATION" };
  }

  let reason: string | undefined;
  if (b.reason !== undefined && b.reason !== null) {
    if (typeof b.reason !== "string") return { ok: false, code: "YH_ARC_INVALID_REASON" };
    const t = b.reason.trim();
    if (t.length > REASON_MAX) return { ok: false, code: "YH_ARC_REASON_TOO_LONG" };
    if (t.length > 0) reason = t;
  }

  // safe-non-pii güvenli sınıf → stale guard için mevcut içerik hash'i ZORUNLU + reason ZORUNLU.
  let reviewedContentHash: string | undefined;
  if (b.reviewedContentHash !== undefined && b.reviewedContentHash !== null) {
    if (typeof b.reviewedContentHash !== "string" || !HASH_RE.test(b.reviewedContentHash)) {
      return { ok: false, code: "YH_ARC_INVALID_HASH" };
    }
    reviewedContentHash = b.reviewedContentHash.toLowerCase();
  }
  if (b.classification === "safe-non-pii") {
    if (!reviewedContentHash) return { ok: false, code: "YH_ARC_HASH_REQUIRED" };
    if (!reason) return { ok: false, code: "YH_ARC_REASON_REQUIRED" };
  }

  return {
    ok: true,
    value: {
      archiveId: b.archiveId,
      classification: b.classification,
      ...(reason ? { reason } : {}),
      ...(reviewedContentHash ? { reviewedContentHash } : {}),
    },
  };
}

/**
 * Row-level index eligibility (SAF): bir archive kaydı YALNIZ safe-non-pii sınıflandırıldıysa
 * VE kayıtlı reviewedContentHash mevcut içerik hash'iyle EŞLEŞİYORSA indexlenebilir.
 * unclassified/pii/restricted → fail-closed; hash uyuşmazlığı (stale) → fail-closed.
 */
export function isArchiveRowIndexable(
  row: { classification: string; reviewedContentHash: string | null },
  currentContentHash: string,
): boolean {
  if (row.classification !== "safe-non-pii") return false;
  if (!row.reviewedContentHash) return false;
  if (!HASH_RE.test(currentContentHash)) return false;
  return row.reviewedContentHash.toLowerCase() === currentContentHash.toLowerCase();
}
