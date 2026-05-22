import { SYMBOL_LANGUAGE_LIST_PATH } from "./symbolLanguageListFetch";

function decodeRouteIdSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed).trim();
  } catch {
    return trimmed;
  }
}

export function safeSymbolLanguageId(id: string | string[] | null | undefined): string {
  let raw = "";
  if (typeof id === "string") raw = id;
  else if (Array.isArray(id)) raw = id[0] ?? "";

  const decoded = decodeRouteIdSegment(raw);
  if (!decoded || decoded === "undefined" || decoded === "null") return "";
  return decoded;
}

export function symbolLanguageDetailHref(id: string | null | undefined): string | null {
  const safeId = safeSymbolLanguageId(id);
  if (!safeId) return null;
  return `${SYMBOL_LANGUAGE_LIST_PATH}/${encodeURIComponent(safeId)}`;
}
