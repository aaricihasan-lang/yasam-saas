import { getList, type ListResult } from "@/lib/aromaterapi/readClient";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";

/** Aromaterapi V2 — C3C Sözlük istemci veri sarmalayıcısı. */

export function fetchGlossaryList(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ListResult<GlossaryTermListItem>> {
  return getList<GlossaryTermListItem>(`/api/aromaterapi/glossary?${params.toString()}`, signal);
}
