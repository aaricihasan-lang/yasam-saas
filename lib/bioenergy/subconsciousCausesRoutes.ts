import { SUBCONSCIOUS_CAUSES_LIST_PATH } from "./subconsciousCausesListFetch";

/** Route segment — boş/undefined id build ve link hatalarını önler */
export function safeSubconsciousCauseId(
  id: string | string[] | null | undefined,
): string {
  if (typeof id === "string") return id.trim();
  if (Array.isArray(id)) return (id[0] ?? "").trim();
  return "";
}

export function subconsciousCauseDetailHref(
  id: string | null | undefined,
): string | null {
  const safeId = safeSubconsciousCauseId(id);
  if (!safeId) return null;
  return `${SUBCONSCIOUS_CAUSES_LIST_PATH}/${encodeURIComponent(safeId)}`;
}
