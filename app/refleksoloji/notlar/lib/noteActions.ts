import type { SavedClinicalNote } from "../types";
import { loadNotesFromStorage } from "./noteStorage";
import { deleteNoteWithSync, type DeleteNoteOutcome } from "./notesSync";

export function getNoteById(id: string): SavedClinicalNote | null {
  try {
    return loadNotesFromStorage().find((n) => n.id === id) ?? null;
  } catch {
    return null;
  }
}

/**
 * FA-25: eskiden yalnız yerel listeden siliyordu (sunucuya silme GİTMİYOR → not
 * geri geliyordu). Artık sunucu-önce + kalıcı outbox; sonuç döner.
 */
export function deleteNoteById(id: string): Promise<DeleteNoteOutcome> {
  return deleteNoteWithSync(id);
}
