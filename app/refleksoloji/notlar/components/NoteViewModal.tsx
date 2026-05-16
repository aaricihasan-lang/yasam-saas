"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatNoteDate } from "../lib/noteFormat";
import type { SavedClinicalNote } from "../types";

type NoteViewModalProps = {
  note: SavedClinicalNote | null;
  onClose: () => void;
};

export function NoteViewModal({ note, onClose }: NoteViewModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!note) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [note, onClose]);

  if (!note || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/45 px-6 py-10 backdrop-blur-sm"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-80px)] w-[min(720px,calc(100vw-48px))] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-100 pb-4">
          <h2 className="text-2xl font-black text-slate-950">{note.title}</h2>
          <p className="mt-1 text-base font-medium text-slate-500">{formatNoteDate(note.date)}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto py-5">
          <p className="whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
            {note.content.trim() || "İçerik eklenmemiş."}
          </p>

          {note.attachments.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-lg font-bold text-violet-900">Ek Dosyalar</h3>
              <ul className="mt-3 space-y-2">
                {note.attachments.map((file) => (
                  <li key={file.id}>
                    <a
                      href={file.dataUrl}
                      download={file.fileName}
                      className="text-base font-semibold text-sky-800 underline-offset-2 hover:underline"
                    >
                      {file.displayName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200 sm:w-auto"
        >
          Kapat
        </button>
      </div>
    </div>,
    document.body,
  );
}
