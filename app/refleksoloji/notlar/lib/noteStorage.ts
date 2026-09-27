import type { ClinicalNoteFormDraft, NoteAttachment, SavedClinicalNote } from "../types";
import type { NoteOutboxEntry } from "@/lib/refleksoloji/notesClientCore";
import { readReflex, writeReflex } from "@/lib/refleksoloji/reflexStore";
import {
  LEGACY_QUARANTINE_KEYS,
  LEGACY_REFLEX_KEYS,
  readRawJson,
  removeRaw,
  writeRawJson,
} from "@/lib/refleksoloji/scopedStorage";

/**
 * Klinik Notlar yerel deposu (FA-04 / DL-007).
 *
 * Notlar artık kullanıcı/tenant kapsamlı `refleks:v2:{tenant}:{user}:notes`
 * anahtarında; bekleyen silmeler KALICI `...:notes-outbox` anahtarında tutulur.
 * Bu modül yalnız DEPOLAMA yapar — sunucu senkronu `notesSync.ts`'tedir (döngü yok).
 */

/** Eski (v1, cihaz genelindeki) anahtar — yalnız eski veri taşıma için okunur. */
export const CLINICAL_NOTES_STORAGE_KEY = LEGACY_REFLEX_KEYS.notes;

/** REF-003: server sync sonucu uygulanınca UI'nin yeniden okuması için olay adı. */
export const CLINICAL_NOTES_UPDATED_EVENT = "yasam-refleksoloji-notes-updated";

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

/** Ham kaydı (yerel/sunucu/eski) doğrulanmış nota çevirir; geçersizse null. */
export function parseStoredNote(item: unknown): SavedClinicalNote | null {
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
    // REF-003: CAS beklenen sürümü — localStorage round-trip'inde KORUNMALI.
    ...(typeof o.baseUpdatedAt === "string" ? { baseUpdatedAt: o.baseUpdatedAt } : {}),
    ...(o.dirty === true ? { dirty: true } : {}),
    ...(typeof o.syncRejected === "string" && o.syncRejected
      ? { syncRejected: o.syncRejected }
      : {}),
  };
}

export function parseNoteList(raw: unknown): SavedClinicalNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseStoredNote)
    .filter((n): n is SavedClinicalNote => n != null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Yeni not kimliği — rastgele UUID (başlık slug'ı değil → cihazlar arası çakışma yok). */
export function newNoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `not-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Geriye dönük imza: eskiden başlık slug'ı üretiyordu (aynı başlıklı iki not farklı
 * cihazlarda AYNI id → birbirinin üzerine yazıyordu). Artık daima UUID.
 */
export function createNoteId(_title: string, existingIds: Set<string>): string {
  let id = newNoteId();
  while (existingIds.has(id)) id = newNoteId();
  return id;
}

export function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ek-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Kapsamlı depo ───────────────────────────────────────────────────────────

export function loadNotesFromStorage(): SavedClinicalNote[] {
  if (typeof window === "undefined") return [];
  try {
    return parseNoteList(readReflex<unknown>("notes"));
  } catch {
    return [];
  }
}

/** Yalnız yerel yazma (senkron TETİKLEMEZ). Senkronlu kayıt: notesSync.saveNotesAndSync. */
export function saveNotesToStorage(notes: SavedClinicalNote[]): boolean {
  if (typeof window === "undefined") return false;
  return writeReflex("notes", notes);
}

export function loadNotesOutbox(): NoteOutboxEntry[] {
  const raw = readReflex<unknown>("notes-outbox");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d): NoteOutboxEntry | null => {
      if (!d || typeof d !== "object") return null;
      const o = d as Record<string, unknown>;
      if (typeof o.uid !== "string" || !o.uid) return null;
      return {
        uid: o.uid,
        expected_updated_at:
          typeof o.expected_updated_at === "string" && o.expected_updated_at
            ? o.expected_updated_at
            : null,
        queuedAt: typeof o.queuedAt === "string" ? o.queuedAt : new Date().toISOString(),
      };
    })
    .filter((d): d is NoteOutboxEntry => d != null);
}

export function saveNotesOutbox(outbox: NoteOutboxEntry[]): boolean {
  return writeReflex("notes-outbox", outbox);
}

// ─── Eski (v1) anahtar + karantina (sahibi belirsiz veriler) ─────────────────

export function loadLegacyNotes(): SavedClinicalNote[] {
  return parseNoteList(readRawJson<unknown>(LEGACY_REFLEX_KEYS.notes));
}

export function writeLegacyNotes(notes: SavedClinicalNote[]): boolean {
  if (notes.length === 0) {
    removeRaw(LEGACY_REFLEX_KEYS.notes);
    return true;
  }
  return writeRawJson(LEGACY_REFLEX_KEYS.notes, notes);
}

export function loadQuarantinedNotes(): SavedClinicalNote[] {
  return parseNoteList(readRawJson<unknown>(LEGACY_QUARANTINE_KEYS.notes));
}

export function saveQuarantinedNotes(notes: SavedClinicalNote[]): boolean {
  if (notes.length === 0) {
    removeRaw(LEGACY_QUARANTINE_KEYS.notes);
    return true;
  }
  return writeRawJson(LEGACY_QUARANTINE_KEYS.notes, notes);
}

// ─── Taslak dönüşümleri ──────────────────────────────────────────────────────

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
    // REF-003: yerel düzenleme baseUpdatedAt'i DEĞİŞTİRMEZ — önceki (son gözlemlenen
    // server sürümü) taşınır ki bir sonraki PUT doğru sürümle CAS yapabilsin.
    ...(options.previous?.baseUpdatedAt
      ? { baseUpdatedAt: options.previous.baseUpdatedAt }
      : {}),
    // FA-03: yerel değişiklik → kirli (yalnız kirli notlar gönderilir). Kullanıcı
    // düzenlediği için önceki "reddedildi" işareti düşer (yeniden denenir).
    dirty: true,
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
