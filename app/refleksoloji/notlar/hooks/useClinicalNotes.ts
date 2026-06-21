"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClinicalNoteFormDraft, SavedClinicalNote } from "../types";
import {
  draftToSavedNote,
  loadNotesFromStorage,
  saveNotesToStorage,
} from "../lib/noteStorage";

export type SaveNoteResult =
  | { saved: SavedClinicalNote; storageOk: boolean }
  | { saved: null; storageOk: true };

export function useClinicalNotes() {
  const [notes, setNotes] = useState<SavedClinicalNote[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    try {
      setNotes(loadNotesFromStorage());
    } catch {
      setNotes([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const persist = useCallback(
    (next: SavedClinicalNote[]): boolean => {
      const ok = saveNotesToStorage(next);
      setNotes(next);
      return ok;
    },
    [],
  );

  const saveNote = useCallback(
    (draft: ClinicalNoteFormDraft, editingId: string | null): SaveNoteResult => {
      const list = loadNotesFromStorage();
      const existingIds = new Set(list.map((n) => n.id));
      const previous = editingId ? list.find((n) => n.id === editingId) : undefined;

      const saved = draftToSavedNote(draft, {
        id: editingId ?? undefined,
        previous,
        existingIds,
      });
      if (!saved) return { saved: null, storageOk: true };

      const without = list.filter((n) => n.id !== saved.id);
      const next = [saved, ...without].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const storageOk = persist(next);
      return { saved, storageOk };
    },
    [persist],
  );

  const deleteNote = useCallback(
    (id: string): boolean => {
      const list = loadNotesFromStorage();
      const next = list.filter((n) => n.id !== id);
      if (next.length === list.length) return false;
      persist(next);
      return true;
    },
    [persist],
  );

  return { notes, hydrated, refresh, saveNote, deleteNote };
}
