"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { normalizeNoteSearchQuery, noteMatchesSearch } from "../lib/noteSearch";
import type { SavedClinicalNote } from "../types";
import { NoteListCard } from "./NoteListCard";

type KayitliNotlarTabProps = {
  notes: SavedClinicalNote[];
  onEdit: (note: SavedClinicalNote) => void;
  onDelete: (id: string) => void;
};

export function KayitliNotlarTab({ notes, onEdit, onDelete }: KayitliNotlarTabProps) {
  const { confirm } = useConfirm();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeNoteSearchQuery(search);
    if (!q) return notes;
    return notes.filter((n) => noteMatchesSearch(n, q));
  }, [notes, search]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      message: "Bu not silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    onDelete(id);
  };

  if (notes.length === 0) {
    return (
      <section className="rounded-[28px] border border-dashed border-violet-200/70 bg-white/80 px-8 py-16 text-center shadow-sm">
        <p className="text-2xl font-bold text-violet-900">Henüz kayıtlı not yok.</p>
        <p className="mt-3 text-base font-medium text-slate-600">
          Not Kaydı sekmesinden yeni klinik not oluşturabilirsiniz.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Başlık, tarih veya içeriğe göre ara..."
        className="w-full max-w-xl rounded-xl border border-violet-200/90 bg-white/90 px-4 py-3 text-base font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60"
      />

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-violet-100 bg-white/80 px-6 py-10 text-center text-base font-medium text-slate-600">
          Aramanızla eşleşen not bulunamadı.
        </p>
      ) : (
        <section className="grid grid-cols-1 gap-5 pb-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((note) => (
            <NoteListCard
              key={note.id}
              note={note}
              onEdit={() => onEdit(note)}
              onDelete={() => void handleDelete(note.id)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
