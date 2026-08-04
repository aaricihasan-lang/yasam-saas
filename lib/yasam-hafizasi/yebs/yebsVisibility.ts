/**
 * BF-14 Ertelenmiş Kaynaklar — YEBS global/canonical görünürlük + status-eligibility (SAF).
 *
 * KİLİTLİ ÜRÜN KARARI (§6A): YEBS professional/global-canonical bilgi sistemidir; client memory
 * DEĞİLDİR; tenant-owned gibi gösterilmez; tenant başına ÇOĞALTILMAZ; synthetic tenant KULLANILMAZ.
 * YEBS tabloları (yebs_traditions/schools/concepts/sources/claims/concept_relations) tenant_id
 * KOLONU TAŞIMAZ → görünürlük GLOBAL_CANONICAL'dır (professional index'te tenant_id NULL + shared
 * eşdeğeri). Yalnız YAYIMLANMIŞ (published) satırlar görünür; draft/review/pending/rejected/archived
 * FAIL-CLOSED. Karşıt claim'ler birleştirilmez, katmanlar karıştırılmaz, AI publish/verify YOK.
 *
 * Bu modül SAF sözleşmedir (DB/IO YOK). Gerçek source-registry aktivasyonu (global-canonical
 * indexer mode + enabled:false entries) AYRI foundation kapısıdır; bu sözleşme onun temelidir.
 */

export const YEBS_VISIBILITY = "GLOBAL_CANONICAL" as const;

/** Kullanıcıya gösterilecek provenans etiketi (uzman-owned gibi gösterilmez). */
export const YEBS_PROVENANCE_LABEL = "YEBS Canonical (Merkezî Bilgi)";

/** Yalnız bu status YEBS içeriğini görünür/eligible kılar (publish yaşam döngüsü sözleşmesi). */
export const YEBS_ELIGIBLE_STATUS = "published" as const;

/** YEBS professional source aile üyeleri (exact repo tabloları; client YOK). */
export const YEBS_SOURCE_TABLES = [
  "yebs_traditions",
  "yebs_schools",
  "yebs_concepts",
  "yebs_sources",
  "yebs_claims",
  "yebs_concept_relations",
] as const;
export type YebsSourceTable = (typeof YEBS_SOURCE_TABLES)[number];

/**
 * Status-eligibility (fail-closed): YALNIZ 'published' görünür. draft/verified/approved/review/
 * pending/rejected/archived ve bilinmeyen → false (görünmez).
 */
export function isYebsPublishedEligible(status: unknown): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === YEBS_ELIGIBLE_STATUS;
}

/**
 * Global-canonical tenant çözümlemesi: YEBS satırının Yaşam Hafızası index'inde alacağı
 * tenant_id DAİMA null'dır (shared/global). Tenant başına kopya veya synthetic tenant YOK.
 */
export function yebsGlobalTenantId(): null {
  return null;
}
