"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type NoteContentModalProps = {
  open: boolean;
  value: string;
  onClose: () => void;
  onSave: (content: string) => void;
};

export function NoteContentModal({ open, value, onClose, onSave }: NoteContentModalProps) {
  const [draft, setDraft] = useState(value);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/45 px-6 py-10 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="note-content-modal-title"
      onClick={onClose}
    >
      <div
        className="flex w-[min(920px,calc(100vw-48px))] max-h-[calc(100vh-80px)] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex shrink-0 flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-black tracking-[0.14em] text-sky-800 ring-1 ring-sky-100">
              KLİNİK NOT
            </div>
            <h2 id="note-content-modal-title" className="text-2xl font-black text-slate-950 sm:text-[26px]">
              Not İçeriği
            </h2>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
            >
              Kapat
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.22)] transition hover:bg-emerald-700"
            >
              Bu Alanı Kaydet
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-[420px] max-h-[60vh] w-full resize-y rounded-[22px] border border-sky-200/90 bg-white p-5 text-lg font-medium leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100/80"
            placeholder="Seans notu, dikkat, gözlem, ek bilgi..."
            autoFocus
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
