import {
  buildQuery,
  getDetail,
  getList,
  type DetailResult,
  type ListResult,
} from "@/lib/aromaterapi/readClient";
import type {
  KnowledgeAuditEvent,
  KnowledgeRecordDetail,
  KnowledgeRecordListItem,
} from "@/lib/aromaterapi/readTypes";

/**
 * Aromaterapi V2 — C3C Bilgi Kayıtları istemci veri sarmalayıcısı.
 * UI adı her yerde "Bilgi Kayıtları"; teknik "claim" terimi kullanıcıya geçmez.
 * (Route yolları mevcut backend sözleşmesi gereği /claims'dir; kullanıcı görmez.)
 */

export function fetchKnowledgeRecordList(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ListResult<KnowledgeRecordListItem>> {
  return getList<KnowledgeRecordListItem>(`/api/aromaterapi/claims?${params.toString()}`, signal);
}

export function fetchKnowledgeRecord(
  id: string,
  signal?: AbortSignal,
): Promise<DetailResult<KnowledgeRecordDetail>> {
  return getDetail<KnowledgeRecordDetail>(`/api/aromaterapi/claims/${id}`, "record", signal);
}

export function fetchKnowledgeAudit(
  id: string,
  query: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<ListResult<KnowledgeAuditEvent>> {
  return getList<KnowledgeAuditEvent>(
    `/api/aromaterapi/claims/${id}/audit${buildQuery({ ...query })}`,
    signal,
  );
}
