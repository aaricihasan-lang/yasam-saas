"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { SavedClinicalNote } from "../types";
import { noteContentPreview } from "../lib/noteSearch";
import { formatNoteDate } from "../lib/noteFormat";

type NoteListCardProps = {
  note: SavedClinicalNote;
  onEdit: () => void;
  onDelete: () => void;
};

export function NoteListCard({ note, onEdit, onDelete }: NoteListCardProps) {
  const t = useTranslations("reflexology.notes");
  // Eşitleme red nedeni senkron katmanından Türkçe gelir: kaynak dilde aynen, diğer dillerde genel metin.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  return (
    <article className="flex flex-col rounded-2xl border border-purple-100 bg-white/80 p-4 shadow-sm ring-1 ring-violet-100/60 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-black text-slate-900">{note.title}</h2>
        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">
          {t("list.attachmentCount", { count: String(note.attachments.length) })}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-violet-700">{formatNoteDate(note.date)}</p>

      {note.syncRejected ? (
        <p
          className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800"
          role="status"
        >
          {t("list.syncRejected", { reason: isSourceLocale ? note.syncRejected : t("list.syncRejectedGeneric") })}
        </p>
      ) : null}

      <p className="mt-2 line-clamp-3 text-sm font-medium leading-relaxed text-slate-600">
        {note.content.trim() ? noteContentPreview(note.content) : t("detail.noContent")}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/refleksoloji/notlar/${encodeURIComponent(note.id)}`}
          className="flex-1 rounded-lg border border-violet-300/80 bg-violet-100 px-3 py-1.5 text-center text-xs font-bold text-violet-950 transition hover:bg-violet-200/90"
        >
          {t("list.detail")}
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-lg border border-fuchsia-300/80 bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-950 transition hover:bg-fuchsia-100/90"
        >
          {t("detail.edit")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 sm:w-auto"
        >
          {t("form.delete")}
        </button>
      </div>
    </article>
  );
}
