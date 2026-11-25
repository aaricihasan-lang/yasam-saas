import type { ReflexologyProtocolRecord } from "../types";
import { parseOrganList } from "@/lib/refleksoloji/organs";
import { foldSearchText } from "@/lib/refleksoloji/search";

export function normalizeSearchQuery(query: string): string {
  // Türkçe + diakritik-duyarsız: "bobrek" → "böbrek" eşleşir.
  return foldSearchText(query);
}

/**
 * Protokol `organs` string'ini organ dizisine ayrıştırır.
 * TEK ortak ayrıştırıcıya (pipe VEYA virgül) devreder; editör `" | "` ile
 * kaydettiği için eski virgül-yalnız davranış çoklu-organı tek sanıyordu (SEV-1).
 */
export function parseOrgansList(organs: string | null | undefined): string[] {
  return parseOrganList(organs);
}

export function protocolMatchesSearch(
  protocol: ReflexologyProtocolRecord,
  query: string,
): boolean {
  if (!query) return true;
  const haystack = foldSearchText(
    [
      protocol.title,
      protocol.target_problem,
      protocol.organs,
      protocol.application_notes,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(query);
}

/**
 * I18N-F1-R3: `bcp47` ekran dilinin etiketi (lib/i18n/format.localeTag). Varsayılan "tr-TR" → eski çıktı birebir.
 */
export function formatProtocolDate(iso: string, bcp47: string = "tr-TR"): string {
  try {
    return new Date(iso).toLocaleString(bcp47, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
