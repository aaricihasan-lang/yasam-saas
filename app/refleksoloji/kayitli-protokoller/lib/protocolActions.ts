import type { ReflexologyProtocolRecord } from "../types";

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase("tr-TR");
}

export function parseOrgansList(organs: string | null | undefined): string[] {
  if (!organs?.trim()) return [];
  return organs
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function protocolMatchesSearch(
  protocol: ReflexologyProtocolRecord,
  query: string,
): boolean {
  if (!query) return true;
  const haystack = [
    protocol.title,
    protocol.target_problem,
    protocol.organs,
    protocol.application_notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  return haystack.includes(query);
}

export function formatProtocolDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
