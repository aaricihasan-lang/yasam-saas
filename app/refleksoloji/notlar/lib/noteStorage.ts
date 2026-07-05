import type { ClinicalNoteFormDraft, NoteAttachment, SavedClinicalNote } from "../types";
import { safeLocalStorageSetItem } from "@/lib/safeStorage";
import { scheduleNotesSync } from "./notesSync";

export const CLINICAL_NOTES_STORAGE_KEY = "yasam-refleksoloji-notlar-v1";

function normalizeAttachments(raw: unknown): NoteAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      if (typeof o.id !== "string") return null;

      const legacyName =
        typeof o.displayName === "string"
          ? o.displayName
          : typeof o.name === "string"
            ? o.name
            : "";
      const fileName =
        typeof o.fileName === "string" ? o.fileName : legacyName.trim();
      const displayName = legacyName.trim() || fileName;
      if (!displayName && !fileName) return null;

      const mimeType =
        typeof o.mimeType === "string"
          ? o.mimeType
          : typeof o.type === "string"
            ? o.type
            : "application/octet-stream";

      return {
        id: o.id,
        displayName: displayName || fileName,
        fileName: fileName || displayName,
        mimeType,
        size: typeof o.size === "number" ? o.size : 0,
        dataUrl: typeof o.dataUrl === "string" ? o.dataUrl : "",
      };
    })
    .filter((a): a is NoteAttachment => a != null);
}

function migrateItem(item: unknown): SavedClinicalNote | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;

  const now = new Date().toISOString();
  const title = o.title.trim();
  if (!title) return null;

  return {
    id: o.id,
    title,
    date: typeof o.date === "string" ? o.date : now.slice(0, 10),
    content: typeof o.content === "string" ? o.content : "",
    attachments: normalizeAttachments(o.attachments),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createNoteId(title: string, existingIds: Set<string>): string {
  const base = title
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  let id = base || `not-${Date.now()}`;
  if (!existingIds.has(id)) return id;
  let n = 2;
  while (existingIds.has(`${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

export function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ek-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadNotesFromStorage(): SavedClinicalNote[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CLINICAL_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(migrateItem)
      .filter((n): n is SavedClinicalNote => n != null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function saveNotesToStorage(notes: SavedClinicalNote[]): boolean {
  if (typeof window === "undefined") return false;
  const ok = safeLocalStorageSetItem(CLINICAL_NOTES_STORAGE_KEY, JSON.stringify(notes));
  // P1-1: yerel kayıt sonrası sunucuya senkronla (demo/oturumsuz/hydrate'te no-op).
  if (ok) scheduleNotesSync(notes);
  return ok;
}

export function draftToSavedNote(
  draft: ClinicalNoteFormDraft,
  options: { id?: string; previous?: SavedClinicalNote; existingIds: Set<string> },
): SavedClinicalNote | null {
  const title = draft.title.trim();
  if (!title) return null;

  const now = new Date().toISOString();
  const id =
    options.id ?? options.previous?.id ?? createNoteId(title, options.existingIds);

  return {
    id,
    title,
    date: draft.date || todayDateInputValue(),
    content: draft.content,
    attachments: draft.attachments.map((a) => ({ ...a })),
    createdAt: options.previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function savedToDraft(note: SavedClinicalNote): ClinicalNoteFormDraft {
  return {
    title: note.title,
    date: note.date,
    content: note.content,
    attachments: note.attachments.map((a) => ({ ...a })),
  };
}

export const EMPTY_NOTE_DRAFT: ClinicalNoteFormDraft = {
  title: "",
  date: todayDateInputValue(),
  content: "",
  attachments: [],
};
