"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClinicalNoteFormDraft, SavedClinicalNote } from "../types";
import {
  CLINICAL_NOTES_UPDATED_EVENT,
  draftToSavedNote,
  loadNotesFromStorage,
  mergeNotesById,
  saveNotesToStorage,
} from "../lib/noteStorage";
import {
  hydrateNotesFromServer,
  scheduleNotesSync,
  setNotesSyncSuspended,
  queueNoteDeletion,
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
      if (serverNotes.length === 0 && local.length === 0) return;

      // Birleştir (union, id çakışmasında en yeni updatedAt kazanır) → veri kaybı yok.
      const merged = mergeNotesById(local, serverNotes);
      const changedLocally =
        merged.length !== serverNotes.length ||
        JSON.stringify(merged) !== JSON.stringify(loadNotesFromStorage());

      setNotesSyncSuspended(true);
      saveNotesToStorage(merged);
      setNotesSyncSuspended(false);
      setNotes(loadNotesFromStorage());

      // Yerelde sunucuda olmayan/daha yeni not varsa birleşik listeyi sunucuya yaz (migrate).
      const serverKey = JSON.stringify(
        [...serverNotes].sort((x, y) => x.id.localeCompare(y.id)),
      );
      const mergedKey = JSON.stringify(
        [...merged].sort((x, y) => x.id.localeCompare(y.id)),
      );
      if (changedLocally && mergedKey !== serverKey) {
        scheduleNotesSync(merged);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // REF-003: server senkron sonucu yerel depoyu değiştirdiğinde (baseUpdatedAt
  // tazeleme / delete-conflict geri yükleme) listeyi yeniden oku.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUpdated = () => refresh();
    window.addEventListener(CLINICAL_NOTES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(CLINICAL_NOTES_UPDATED_EVENT, onUpdated);
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
      const target = list.find((n) => n.id === id);
      const next = list.filter((n) => n.id !== id);
      if (next.length === list.length) return false;
      // REF-004: silmeyi AÇIKÇA işaretle (persist → scheduleNotesSync bunu gönderir).
      // Sunucu artık "listede yok = sil" yapmadığından, son not dahil silme yalnız
      // bu açık deleted_uids ile gerçekleşir; boş liste kaza sonucu toplu silmez.
      // REF-003: bilinen server sürümünü (baseUpdatedAt) taşı → stale delete engellenir.
      queueNoteDeletion(id, target?.baseUpdatedAt ?? null);
      persist(next);
      return true;
    },
    [persist],
  );

  return { notes, hydrated, refresh, saveNote, deleteNote };
}
