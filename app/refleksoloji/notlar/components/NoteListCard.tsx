"use client";

import type { SavedClinicalNote } from "../types";
import { noteContentPreview } from "../lib/noteSearch";
import { formatNoteDate } from "../lib/noteFormat";

type NoteListCardProps = {
  note: SavedClinicalNote;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function NoteListCard({ note, onView, onEdit, onDelete }: NoteListCardProps) {
  return (
    <article className="flex flex-col rounded-[28px] border border-purple-100 bg-white/80 p-6 shadow-sm ring-1 ring-violet-100/60 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-900">{note.title}</h2>
        <span className="shrink-0 rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-900">
          {note.attachments.length} ek
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-violet-700">{formatNoteDate(note.date)}</p>

      <p className="mt-3 line-clamp-4 text-base font-medium leading-relaxed text-slate-600">
        {noteContentPreview(note.content)}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onView}
          className="flex-1 rounded-xl border border-violet-300/80 bg-violet-100 px-4 py-2.5 text-sm font-bold text-violet-950 transition hover:bg-violet-200/90"
        >
          Görüntüle
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-xl border border-fuchsia-300/80 bg-fuchsia-50 px-4 py-2.5 text-sm font-bold text-fuchsia-950 transition hover:bg-fuchsia-100/90"
        >
          Düzenle
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 sm:w-auto sm:min-w-[100px]"
        >
          Sil
        </button>
      </div>
    </article>
  );
}
