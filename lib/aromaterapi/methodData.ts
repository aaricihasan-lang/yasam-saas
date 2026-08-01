import { getDetail, type DetailResult } from "@/lib/aromaterapi/readClient";
import type {
  MethodRevisionDetail,
  MethodSeriesDetail,
  MethodSeriesListItem,
} from "@/lib/aromaterapi/readTypes";

/**
 * Aromaterapi V2 — C3D-B2B Üretim/Elde Ediliş Yöntemi istemci OKUMA sarmalayıcısı.
 * C3D-B2B read uçlarını (methodReads.ts) tüketir. Route URL'lerini tek yerde toplar.
 */

/** GET /preparations/[id]/methods — seri listesi (`series` anahtarı). */
export function fetchMethodSeriesList(
  preparationId: string,
  signal?: AbortSignal,
): Promise<DetailResult<MethodSeriesListItem[]>> {
  return getDetail<MethodSeriesListItem[]>(
    `/api/aromaterapi/preparations/${preparationId}/methods`,
    "series",
    signal,
  );
}

/** GET /methods/[seriesId] — seri detay + revizyon geçmişi. */
export function fetchMethodSeries(
  seriesId: string,
  signal?: AbortSignal,
): Promise<DetailResult<MethodSeriesDetail>> {
  return getDetail<MethodSeriesDetail>(`/api/aromaterapi/methods/${seriesId}`, "series", signal);
}

/** GET /methods/[seriesId]/revisions/[revisionId] — tek revizyonun tam içeriği. */
export function fetchMethodRevision(
  seriesId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<DetailResult<MethodRevisionDetail>> {
  return getDetail<MethodRevisionDetail>(
    `/api/aromaterapi/methods/${seriesId}/revisions/${revisionId}`,
    "revision",
    signal,
  );
}
