import "server-only";

/**
 * YEBS — Admin-only READ-ONLY uzman vitrini: görünürlük politikası.
 *
 * BAĞLAYICI:
 *   - Default görünüm YALNIZ `published`.
 *   - Admin `?preview=1` ile yayınlanmamış kayıtları READ-ONLY görebilir; ancak
 *     preview yalnız server-side verifyAdminRequest'ten GEÇEN admin isteğinde
 *     etkindir (client flag tek başına yetki değildir — route her zaman
 *     verifyAdminRequest ile korunur).
 *   - `archived` HİÇBİR görünümde gösterilmez.
 *   - Evidence `verification_status='rejected'` HİÇBİR görünümde gösterilmez.
 *
 * NOT (status kümeleri): traditions & concepts status CHECK'i {draft, verified,
 * approved, published} (archived YOK) → preview'da tümü görünür. sources, claims,
 * relations `archived` içerir → preview'da bunlar hariç tutulur.
 */

export type ShowcaseView = "published" | "preview";

/** `?preview=1` → preview; aksi halde published. */
export function resolveView(previewParam: string | null): ShowcaseView {
  return previewParam === "1" ? "preview" : "published";
}

/**
 * Entity status'ü bu görünümde vitrinde görünmeli mi?
 *   published görünümü → yalnız 'published'
 *   preview görünümü   → 'archived' hariç her şey
 */
export function isEntityStatusVisible(status: string, view: ShowcaseView): boolean {
  if (view === "published") return status === "published";
  return status !== "archived";
}

/** Yayınlanmamış (preview rozeti gerektiren) her status. */
export function isUnpublished(status: string): boolean {
  return status !== "published";
}

/**
 * Evidence (claim_source / relation_source) satırı vitrinde görünmeli mi?
 * Yalnız 'rejected' gizlenir; verified/unverified/contradiction gösterilir.
 * (source_role bağımsızdır; contradiction rolü meşru kanıttır.)
 */
export function isEvidenceVisible(verificationStatus: string): boolean {
  return verificationStatus !== "rejected";
}
