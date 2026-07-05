"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClinicalNoteFormDraft, SavedClinicalNote } from "../types";
import {
  draftToSavedNote,
  loadNotesFromStorage,
  saveNotesToStorage,
} from "../lib/noteStorage";
import {
  hydrateNotesFromServer,
  scheduleNotesSync,
  setNotesSyncSuspended,
} from "../lib/notesSync";

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
    // Önce yerel (anında render), sonra sunucudan hydrate (P1-1 cihazlar arası senkron).
    const local = loadNotesFromStorage();
    setNotes(local);
    setHydrated(true);

    let cancelled = false;
    void hydrateNotesFromServer().then((serverNotes) => {
      if (cancelled || serverNotes === null) return; // demo/oturumsuz/erişilemez → yereli koru
      if (serverNotes.length > 0) {
        // Sunucu gerçeği → yerel kopyayı güncelle (geri-yankı PUT'unu engelle).
        setNotesSyncSuspended(true);
        saveNotesToStorage(serverNotes);
        setNotesSyncSuspended(false);
        setNotes(loadNotesFromStorage());
      } else if (local.length > 0) {
        // Sunucu boş ama yerelde veri var → ilk açılışta sunucuya taşı (migrate).
        scheduleNotesSync(local);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
