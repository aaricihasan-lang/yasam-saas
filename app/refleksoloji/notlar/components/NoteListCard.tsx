"use client";

import Link from "next/link";
import type { SavedClinicalNote } from "../types";
import { noteContentPreview } from "../lib/noteSearch";
import { formatNoteDate } from "../lib/noteFormat";

type NoteListCardProps = {
  note: SavedClinicalNote;
  onEdit: () => void;
  onDelete: () => void;
};

export function NoteListCard({ note, onEdit, onDelete }: NoteListCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-purple-100 bg-white/80 p-4 shadow-sm ring-1 ring-violet-100/60 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-black text-slate-900">{note.title}</h2>
        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">
          {note.attachments.length} ek
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-violet-700">{formatNoteDate(note.date)}</p>

      <p className="mt-2 line-clamp-3 text-sm font-medium leading-relaxed text-slate-600">
        {noteContentPreview(note.content)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/refleksoloji/notlar/${encodeURIComponent(note.id)}`}
          className="flex-1 rounded-lg border border-violet-300/80 bg-violet-100 px-3 py-1.5 text-center text-xs font-bold text-violet-950 transition hover:bg-violet-200/90"
        >
          Detay
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-lg border border-fuchsia-300/80 bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-950 transition hover:bg-fuchsia-100/90"
        >
          Düzenle
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 sm:w-auto"
        >
          Sil
        </button>
      </div>
    </article>
  );
}
