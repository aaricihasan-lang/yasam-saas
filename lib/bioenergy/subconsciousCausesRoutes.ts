import { SUBCONSCIOUS_CAUSES_LIST_PATH } from "./subconsciousCausesListFetch";

function decodeRouteIdSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed).trim();
  } catch {
    return trimmed;
  }
}

/** Route segment — boş/undefined id build ve link hatalarını önler */
export function safeSubconsciousCauseId(
  id: string | string[] | null | undefined,
): string {
  let raw = "";
  if (typeof id === "string") raw = id;
  else if (Array.isArray(id)) raw = id[0] ?? "";

  const decoded = decodeRouteIdSegment(raw);
  if (!decoded || decoded === "undefined" || decoded === "null") return "";
  return decoded;
}

export function subconsciousCauseDetailHref(
  id: string | null | undefined,
): string | null {
  const safeId = safeSubconsciousCauseId(id);
  if (!safeId) return null;
  return `${SUBCONSCIOUS_CAUSES_LIST_PATH}/${encodeURIComponent(safeId)}`;
}
