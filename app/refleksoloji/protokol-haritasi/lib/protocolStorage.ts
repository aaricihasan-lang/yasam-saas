import type { ProtocolFormDraft, SavedProtocol } from "../types";

export const PROTOCOL_STORAGE_KEY = "yasam-refleksoloji-protokoller-v1";

function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "protokol";
}

export function createProtocolId(title: string, existingIds: Set<string>): string {
  let id = slugifyTitle(title);
  if (!existingIds.has(id)) return id;
  let n = 2;
  while (existingIds.has(`${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

function normalizeOrganNames(organs: unknown): string[] {
  if (!Array.isArray(organs)) return [];
  return organs
    .map((o) => {
      if (typeof o === "string") return o.trim();
      if (o && typeof o === "object" && "name" in o && typeof (o as { name: unknown }).name === "string") {
        return (o as { name: string }).name.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function migrateLegacyItem(item: unknown): SavedProtocol | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;

  if (typeof o.id !== "string" || typeof o.title !== "string") return null;

  const now = new Date().toISOString();

  if (typeof o.createdAt === "string" && typeof o.updatedAt === "string") {
    return {
      id: o.id,
      title: o.title.trim(),
      description: typeof o.description === "string" ? o.description : "",
      organs: normalizeOrganNames(o.organs),
      notes: typeof o.notes === "string" ? o.notes : "",
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }

  const description =
    typeof o.description === "string"
      ? o.description
      : typeof o.shortDescription === "string"
        ? o.shortDescription
        : "";

  const notes = typeof o.notes === "string" ? o.notes : "";

  return {
    id: o.id,
    title: o.title.trim(),
    description,
    organs: normalizeOrganNames(o.organs),
    notes,
    createdAt: now,
    updatedAt: now,
  };
}

function parseStoredProtocols(raw: string): SavedProtocol[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.map(migrateLegacyItem).filter((p): p is SavedProtocol => p != null && p.title.length > 0);
}

export function loadProtocolsFromStorage(): SavedProtocol[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PROTOCOL_STORAGE_KEY);
    if (!raw) return [];
    return parseStoredProtocols(raw);
  } catch {
    return [];
  }
}

export function saveProtocolsToStorage(protocols: SavedProtocol[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROTOCOL_STORAGE_KEY, JSON.stringify(protocols));
}

export function draftToSavedProtocol(
  draft: ProtocolFormDraft,
  options: { id?: string; previous?: SavedProtocol; existingIds: Set<string> },
): SavedProtocol | null {
  const title = draft.title.trim();
  const organs = draft.organs.map((o) => o.trim()).filter(Boolean);
  if (!title || organs.length === 0) return null;

  const now = new Date().toISOString();
  const id =
    options.id ??
    options.previous?.id ??
    createProtocolId(title, options.existingIds);

  return {
    id,
    title,
    description: draft.description.trim(),
    organs,
    notes: draft.notes.trim(),
    createdAt: options.previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function savedToDraft(protocol: SavedProtocol): ProtocolFormDraft {
  return {
    title: protocol.title,
    description: protocol.description,
    organs: [...protocol.organs],
    notes: protocol.notes,
  };
}

export const EMPTY_PROTOCOL_DRAFT: ProtocolFormDraft = {
  title: "",
  description: "",
  organs: [],
  notes: "",
};
