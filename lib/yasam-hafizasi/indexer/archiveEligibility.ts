/**
 * YAŞAM HAFIZASI™ — BF-11E Kişisel Arşiv Satır-Seviyesi Eligibility Portu (TEK OTORİTE).
 * =============================================================================
 *
 * Kişisel Arşiv (kisisel_arsiv:archives) ROW-GATED CONTROLLED kaynağı için index/deindex
 * eligibility kararının TEK otoritesi. İki katman:
 *   1. SAF karar: `isArchiveRowIndexable` (archiveClassificationRequest) — safe-non-pii +
 *      server-türetimli current content hash eşleşmesi. Yeniden yazılmaz; reuse edilir.
 *   2. IO portu: `ArchiveEligibilityPort` — ayrı `yh_archive_classifications` tablosundan
 *      (tenant_id, archive_id) ile classification + reviewed_content_hash okur. GERÇEK DB
 *      hatası THROW eder (worker geçici hata olarak ele alır → yazma/silme YOK); "satır yok"
 *      ise `missing` döner (bilinen ineligible → tombstone). Silent "eligible" varsayımı YOK.
 *
 * BAĞLAYICI: bu port ham archive içeriği / classification reason / PII OKUMAZ (yalnız
 * classification + reviewed_content_hash). Tenant DAİMA güvenilir processing tenant'tan gelir
 * (body/query DEĞİL); cross-tenant classification imkânsız (sorgu (tenant_id, archive_id)).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isArchiveRowIndexable } from "../archive/archiveClassificationRequest";

/** Ayrı classification tablosundan okunan minimal eligibility girdisi (PII taşımaz). */
export interface ArchiveClassificationRecord {
  readonly classification: string;
  readonly reviewedContentHash: string | null;
}

/** Port lookup sonucu (DB hatası THROW ile taşınır — burada YOK). */
export type ArchiveEligibilityLookup =
  | { readonly status: "found"; readonly record: ArchiveClassificationRecord }
  | { readonly status: "missing" };

/**
 * Satır eligibility portu: güvenilir processing tenant + archive kimliği için classification
 * kaydını döndürür. GERÇEK DB/okuma hatasında THROW eder (fail-closed transient); "satır yok"
 * → `missing`. Enjekte edilir (worker/admin route gerçek Supabase adapter'ı verir; harness fake).
 */
export type ArchiveEligibilityPort = (input: {
  readonly tenantId: string;
  readonly archiveId: string;
}) => Promise<ArchiveEligibilityLookup>;

/**
 * SAF karar: bir archive kaydı, verilen server-türetimli current content hash için indexlenebilir
 * mi? Yalnız `found` + safe-non-pii + eşleşen hash → eligible. `missing`/unsafe/stale → ineligible.
 */
export function decideArchiveEligibility(
  lookup: ArchiveEligibilityLookup,
  currentContentHash: string,
): boolean {
  if (lookup.status !== "found") return false;
  return isArchiveRowIndexable(
    {
      classification: lookup.record.classification,
      reviewedContentHash: lookup.record.reviewedContentHash,
    },
    currentContentHash,
  );
}

const CLASSIFICATION_TABLE = "yh_archive_classifications";

/**
 * Gerçek Supabase eligibility portu (server-only kullanılır). (tenant_id, archive_id) ile TEK
 * classification satırını okur. DB hatası → THROW (worker transient); satır yok → `missing`.
 */
export function createSupabaseArchiveEligibilityPort(db: SupabaseClient): ArchiveEligibilityPort {
  return async ({ tenantId, archiveId }) => {
    const { data, error } = await db
      .from(CLASSIFICATION_TABLE)
      .select("classification, reviewed_content_hash")
      .eq("tenant_id", tenantId)
      .eq("archive_id", archiveId)
      .maybeSingle();

    // GERÇEK DB/okuma hatası → THROW (sessiz ineligible/tombstone YOK; iyi veri silinmez).
    if (error) {
      throw new Error("archive-eligibility-lookup-failed");
    }
    if (!data) return { status: "missing" };
    const row = data as unknown as { classification?: unknown; reviewed_content_hash?: unknown };
    return {
      status: "found",
      record: {
        classification: typeof row.classification === "string" ? row.classification : "",
        reviewedContentHash:
          typeof row.reviewed_content_hash === "string" ? row.reviewed_content_hash : null,
      },
    };
  };
}
