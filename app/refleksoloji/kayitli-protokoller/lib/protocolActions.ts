import type { SavedProtocol } from "@/app/refleksoloji/protokol-haritasi/types";
import {
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "@/app/refleksoloji/protokol-haritasi/lib/protocolStorage";

export function getProtocolById(id: string): SavedProtocol | null {
  try {
    return loadProtocolsFromStorage().find((p) => p.id === id) ?? null;
  } catch {
    return null;
  }
}

export function deleteProtocolById(id: string): boolean {
  try {
    const list = loadProtocolsFromStorage();
    const next = list.filter((p) => p.id !== id);
    if (next.length === list.length) return false;
    saveProtocolsToStorage(next);
    return true;
  } catch {
    return false;
  }
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase("tr-TR");
}

export function protocolMatchesSearch(protocol: SavedProtocol, query: string): boolean {
  if (!query) return true;
  const haystack = [protocol.title, protocol.description, ...protocol.organs]
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
