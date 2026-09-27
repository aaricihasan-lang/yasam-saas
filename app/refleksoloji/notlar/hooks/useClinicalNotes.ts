"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClinicalNoteFormDraft, SavedClinicalNote } from "../types";
import {
  CLINICAL_NOTES_UPDATED_EVENT,
  draftToSavedNote,
  loadNotesFromStorage,
} from "../lib/noteStorage";
import {
  deleteNoteWithSync,
  discardQuarantinedNotes,
  getQuarantinedNoteCount,
  hydrateAndMergeNotes,
  importQuarantinedNotesToAccount,
  saveNotesAndSync,
  type DeleteNoteOutcome,
} from "../lib/notesSync";
import { isReflexSyncEligible } from "@/lib/refleksoloji/reflexStore";

export type SaveNoteResult =
  | { saved: SavedClinicalNote; storageOk: boolean }
  | { saved: null; storageOk: true };

/** Sunucu hidrasyon durumu: bekliyor | tamam | erişilemez (demo/çevrimdışı → yalnız yerel). */
export type NotesServerState = "pending" | "done" | "unavailable";

/**
 * Klinik notlar için TEK ortak depo/hook — liste ve detay sayfası aynı kaynağı
 * kullanır (detay artık yalnız yerel kopyaya bakmaz; silme sunucu sonucunu bekler).
 */
export function useClinicalNotes() {
  const [notes, setNotes] = useState<SavedClinicalNote[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [serverState, setServerState] = useState<NotesServerState>("pending");
  const [quarantineCount, setQuarantineCount] = useState(0);

  const refresh = useCallback(() => {
    try {
      setNotes(loadNotesFromStorage());
    } catch {
      setNotes([]);
    }
  }, []);

  useEffect(() => {
    // Önce yerel (anında render), sonra sunucudan hydrate (cihazlar arası senkron).
    setNotes(loadNotesFromStorage());
    setHydrated(true);

    let cancelled = false;
    void hydrateAndMergeNotes().then((r) => {
      if (cancelled) return;
      if (!r) {
        setServerState("unavailable");
        setQuarantineCount(isReflexSyncEligible() ? getQuarantinedNoteCount() : 0);
        return;
      }
      setQuarantineCount(r.quarantineCount);
      setNotes(loadNotesFromStorage());
      setServerState("done");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Senkron sonucu yerel depoyu değiştirdiğinde (base tazeleme / red / geri yükleme) yeniden oku.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUpdated = () => refresh();
    window.addEventListener(CLINICAL_NOTES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(CLINICAL_NOTES_UPDATED_EVENT, onUpdated);
  }, [refresh]);

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
      const storageOk = saveNotesAndSync(next);
      if (storageOk) setNotes(next);
      return { saved, storageOk };
    },
    [],
  );

  /** Sunucu-önce silme; sonuç döner (çağıran mesaj/navigasyon kararını buna göre verir). */
  const deleteNote = useCallback(
    async (id: string): Promise<DeleteNoteOutcome> => {
      const outcome = await deleteNoteWithSync(id);
      refresh();
      return outcome;
    },
    [refresh],
  );

  const importQuarantine = useCallback((): { imported: number; ok: boolean } => {
    const r = importQuarantinedNotesToAccount();
    if (r.ok) {
      setQuarantineCount(0);
      refresh();
    }
    return r;
  }, [refresh]);

  const discardQuarantine = useCallback(() => {
    discardQuarantinedNotes();
    setQuarantineCount(0);
  }, []);

  return {
    notes,
    hydrated,
    serverState,
    refresh,
    saveNote,
    deleteNote,
    quarantineCount,
    importQuarantine,
    discardQuarantine,
  };
}
