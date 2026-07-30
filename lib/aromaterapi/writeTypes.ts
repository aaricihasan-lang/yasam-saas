/**
 * Aromaterapi V2 — C3D ortak yazma katmanı tipleri (client-safe; server-only YOK).
 *
 * SAF TİP DOSYASI: Supabase/secret YOK. Hem sunucu writer'ları (ileriki C3D fazları)
 * hem istemci form bileşenleri aynı sözleşmeyi paylaşsın diye tek kaynaktır. C3D-A
 * yalnız TEMEL kurar; gerçek entity writer'ı içermez.
 *
 * NOT: "claim" (Bilgi Kaydı) kendi C2S/C2T audit'ini kullanır; bu ortak content audit
 * yalnız claim DIŞI kanonik entity'ler içindir.
 */

/** Ortak content audit/tombstone entity_type allowlist (claim HARİÇ). Migration ile birebir. */
export const AROMATERAPI_CONTENT_ENTITY_TYPES = [
  "plant_taxon",
  "preparation",
  "preparation_method",
  "source",
  "source_passage",
  "passage_translation",
  "editorial_note",
  "glossary_term",
] as const;

export type AromaterapiContentEntityType =
  (typeof AROMATERAPI_CONTENT_ENTITY_TYPES)[number];

/** Audit işlem türleri. */
export const AROMATERAPI_AUDIT_OPERATIONS = ["create", "update", "delete"] as const;
export type AromaterapiAuditOperation = (typeof AROMATERAPI_AUDIT_OPERATIONS)[number];

/** Silme kipleri. */
export const AROMATERAPI_DELETION_MODES = ["single", "bulk", "purge"] as const;
export type AromaterapiDeletionMode = (typeof AROMATERAPI_DELETION_MODES)[number];

/** Reason sınırları — create opsiyonel; update/delete zorunlu. Migration ile birebir. */
export const AROMATERAPI_REASON_MAX_LEN = 2000;
export const AROMATERAPI_ACTOR_LABEL_MAX_LEN = 320;

/**
 * Yazma actor'ı — YALNIZ doğrulanmış oturumdan (verifyUserRequest guard) türetilir.
 * İstemci body/query'sinden ASLA kabul edilmez (yapısal ayrım).
 */
export type AromaterapiWriteActor = {
  userId: string;
  label: string;
  tenantId: string;
};

/** Form modu — ortak form kabuğu create/edit'i tek sözleşmeyle destekler. */
export type AromaterapiFormMode = "create" | "edit";

/** Optimistic concurrency belirteci (edit modunda). */
export type AromaterapiConcurrencyToken = {
  expectedUpdatedAt: string | null;
};
