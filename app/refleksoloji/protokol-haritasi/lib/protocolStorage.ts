import type { ProtocolFormDraft, SavedProtocol } from "../types";
import { readReflex, writeReflex } from "@/lib/refleksoloji/reflexStore";
import {
  LEGACY_QUARANTINE_KEYS,
  LEGACY_REFLEX_KEYS,
  readRawJson,
  removeRaw,
  writeRawJson,
} from "@/lib/refleksoloji/scopedStorage";
import { slugifyTr } from "@/lib/refleksoloji/slug";

/**
 * Eski (v1, cihaz geneli) anahtar — yalnız eski veri taşıma/karantina için okunur.
 * FA-04: protokol yerel kopyaları artık kullanıcı/tenant kapsamlı depodadır.
 */
export const PROTOCOL_STORAGE_KEY = LEGACY_REFLEX_KEYS.protocols;

/** Türkçe-güvenli okunur slug ("ı" artık düşmez). Mevcut UID'ler YENİDEN YAZILMAZ. */
export function slugifyTitle(title: string): string {
  return slugifyTr(title, "protokol");
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Yeni protokol kimliği (= sunucu `source_uid`). Eskiden başlık slug'ıydı: iki
 * cihazda aynı başlıklı iki protokol AYNI source_uid ile birbirinin üzerine
 * yazılıyordu. Artık daima rastgele UUID.
 */
export function createProtocolId(_title: string, existingIds: Set<string>): string {
  let id = newUuid();
  while (existingIds.has(id)) id = newUuid();
  return id;
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
  const pending = {
    ...(o.pendingSync === true ? { pendingSync: true } : {}),
    ...(typeof o.baseVersion === "string" && o.baseVersion ? { baseVersion: o.baseVersion } : {}),
  };

  if (typeof o.createdAt === "string" && typeof o.updatedAt === "string") {
    return {
      id: o.id,
      title: o.title.trim(),
      description: typeof o.description === "string" ? o.description : "",
      organs: normalizeOrganNames(o.organs),
      notes: typeof o.notes === "string" ? o.notes : "",
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      ...pending,
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
    ...pending,
  };
}

export function parseStoredProtocols(parsed: unknown): SavedProtocol[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map(migrateLegacyItem).filter((p): p is SavedProtocol => p != null && p.title.length > 0);
}

export function loadProtocolsFromStorage(): SavedProtocol[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredProtocols(readReflex<unknown>("protocols"));
  } catch {
    return [];
  }
}

export function saveProtocolsToStorage(protocols: SavedProtocol[]): boolean {
  if (typeof window === "undefined") return false;
  return writeReflex("protocols", protocols);
}

// ─── Eski (v1) anahtar + karantina (sahibi belirsiz) ─────────────────────────

export function loadLegacyProtocols(): SavedProtocol[] {
  return parseStoredProtocols(readRawJson<unknown>(LEGACY_REFLEX_KEYS.protocols));
}

export function clearLegacyProtocols(): void {
  removeRaw(LEGACY_REFLEX_KEYS.protocols);
}

export function loadQuarantinedProtocols(): SavedProtocol[] {
  return parseStoredProtocols(readRawJson<unknown>(LEGACY_QUARANTINE_KEYS.protocols));
}

export function saveQuarantinedProtocols(list: SavedProtocol[]): boolean {
  if (list.length === 0) {
    removeRaw(LEGACY_QUARANTINE_KEYS.protocols);
    return true;
  }
  return writeRawJson(LEGACY_QUARANTINE_KEYS.protocols, list);
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
