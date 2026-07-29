import {
  getDetail,
  getList,
  type DetailResult,
  type ListResult,
} from "@/lib/aromaterapi/readClient";
import type {
  PassageDetail,
  PassageListItem,
  SourceDetail,
  SourceListItem,
} from "@/lib/aromaterapi/readTypes";

/** Aromaterapi V2 — C3C Kaynaklar istemci veri sarmalayıcısı. */

export function fetchSourceList(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ListResult<SourceListItem>> {
  return getList<SourceListItem>(`/api/aromaterapi/sources?${params.toString()}`, signal);
}

export function fetchSource(
  id: string,
  signal?: AbortSignal,
): Promise<DetailResult<SourceDetail>> {
  return getDetail<SourceDetail>(`/api/aromaterapi/sources/${id}`, "source", signal);
}

export function fetchSourcePassageList(
  sourceId: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ListResult<PassageListItem>> {
  return getList<PassageListItem>(
    `/api/aromaterapi/sources/${sourceId}/passages?${params.toString()}`,
    signal,
  );
}

export function fetchPassage(
  id: string,
  signal?: AbortSignal,
): Promise<DetailResult<PassageDetail>> {
  return getDetail<PassageDetail>(`/api/aromaterapi/passages/${id}`, "passage", signal);
}
