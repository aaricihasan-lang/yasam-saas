/**
 * Refleksoloji protokol yazma DTO'su — mass-assignment koruması.
 *
 * POST/PUT rotaları eskiden istemci gövdesini olduğu gibi (`{ ...body }`) yayıyordu;
 * yalnız `tenant_id` (POST) veya `tenant_id/id/source_uid` (PUT) çıkarılıyordu.
 * Bu yüzden istemci `id`, `created_at`, `updated_at` VE sağlayıcı/köken kolonlarını
 * (`origin_type`, `origin_label`, `origin_source_id`, `origin_transfer_batch_id`,
 * `transferred_at`) uydurup "Admin Kütüphanesi" rozeti gibi sahte köken yazabiliyordu.
 *
 * Artık YALNIZ kullanıcı-düzenlenebilir içerik alanları kabul edilir. Sunucu
 * `tenant_id`'yi oturumdan; `id`/`created_at`'i DB default'undan üretir. Köken/
 * provenance alanları yalnız güvenli admin transfer akışında yazılır (bu rota değil).
 */

/** İstemcinin yazabileceği tek alan kümesi. */
export const PROTOCOL_CONTENT_FIELDS = [
  "title",
  "target_problem",
  "organs",
  "application_notes",
  "raw_json",
] as const;

export type ProtocolContentFields = {
  title?: unknown;
  target_problem?: unknown;
  organs?: unknown;
  application_notes?: unknown;
  raw_json?: unknown;
};

/** İzin listesi: yalnız bilinen içerik alanlarını (var olanları) döndürür. */
export function pickProtocolContentFields(
  body: Record<string, unknown>,
): ProtocolContentFields {
  const out: Record<string, unknown> = {};
  for (const key of PROTOCOL_CONTENT_FIELDS) {
    if (key in body && body[key] !== undefined) {
      out[key] = body[key];
    }
  }
  return out as ProtocolContentFields;
}
