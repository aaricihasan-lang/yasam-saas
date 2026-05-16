import type { SavedClinicalNote } from "../types";
import { loadNotesFromStorage, saveNotesToStorage } from "./noteStorage";

export function getNoteById(id: string): SavedClinicalNote | null {
  try {
    return loadNotesFromStorage().find((n) => n.id === id) ?? null;
  } catch {
    return null;
  }
}

export function deleteNoteById(id: string): boolean {
  try {
    const list = loadNotesFromStorage();
    const next = list.filter((n) => n.id !== id);
    if (next.length === list.length) return false;
    saveNotesToStorage(next);
    return true;
  } catch {
    return false;
  }
}
