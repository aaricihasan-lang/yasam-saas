import { catalogWriteRequest, type CatalogWriteResult } from "@/lib/aromaterapi/catalogWrite";

/**
 * Aromaterapi V2 — C3D-B2B Üretim/Elde Ediliş Yöntemi YAZMA istemci sarmalayıcısı
 * (client-safe). C3D-B2A canlı writer route'larını tüketir.
 *
 * note_hash/status/revision/tenant/actor gövdeye ASLA konmaz (server RPC üretir/çözer).
 * Seri kimliği (method_kind/source/passage/method_lang) immutable'dır; içerik değişimi
 * "yeni revizyon" olarak gider. Sonuç/mesaj sözleşmesi catalogWrite.ts ile ortaktır.
 */

export type MethodStepInput = { order: number; text: string };

/** 14 içerik alanı (note_hash server-üretimli; buradan gitmez). */
export type MethodContentBody = {
  plant_part_used?: string | null;
  material_state?: string | null;
  method_text: string;
  equipment?: string | null;
  amount_ratio?: string | null;
  solvent_carrier?: string | null;
  duration_text?: string | null;
  temperature_text?: string | null;
  steps?: MethodStepInput[] | null;
  filtration?: string | null;
  resting?: string | null;
  storage?: string | null;
  quality_notes?: string | null;
  safety_notes?: string | null;
};

export type CreateMethodSeriesBody = MethodContentBody & {
  method_kind: string;
  method_lang: string;
  source_id?: string | null;
  passage_id?: string | null;
  reason?: string | null;
};

export type AppendRevisionBody = MethodContentBody & {
  expected_latest_revision: number;
  reason: string;
};

export type TransitionBody = {
  target_status: string;
  expected_updated_at: string;
  reason: string;
};

/** POST /preparations/[id]/methods — seri + ilk revizyon (atomik, draft). */
export function createMethodSeries(
  preparationId: string,
  body: CreateMethodSeriesBody,
  signal?: AbortSignal,
): Promise<CatalogWriteResult> {
  return catalogWriteRequest(
    `/api/aromaterapi/preparations/${preparationId}/methods`,
    "POST",
    body,
    signal,
  );
}

/** POST /methods/[seriesId]/revisions — yeni immutable revizyon (append-only). */
export function appendMethodRevision(
  seriesId: string,
  body: AppendRevisionBody,
  signal?: AbortSignal,
): Promise<CatalogWriteResult> {
  return catalogWriteRequest(
    `/api/aromaterapi/methods/${seriesId}/revisions`,
    "POST",
    body,
    signal,
  );
}

/** PATCH /methods/[seriesId]/revisions/[revisionId] — durum geçişi. */
export function transitionRevisionStatus(
  seriesId: string,
  revisionId: string,
  body: TransitionBody,
  signal?: AbortSignal,
): Promise<CatalogWriteResult> {
  return catalogWriteRequest(
    `/api/aromaterapi/methods/${seriesId}/revisions/${revisionId}`,
    "PATCH",
    body,
    signal,
  );
}
