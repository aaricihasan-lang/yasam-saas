"use client";

import { useEffect, useState } from "react";

type ProtocolNotesModalProps = {
  open: boolean;
  value: string;
  onClose: () => void;
  onSave: (notes: string) => void;
};

export function ProtocolNotesModal({ open, value, onClose, onSave }: ProtocolNotesModalProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="protocol-notes-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl">
        <div className="border-b border-violet-100/80 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-5 text-white">
          <h2 id="protocol-notes-modal-title" className="text-xl font-black">
            Uygulama Notları
          </h2>
          <p className="mt-1 text-sm font-medium text-white/85">
            Seans süresi, basınç, sıklık ve diğer uygulama detayları
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[420px] w-full resize-y rounded-xl border border-violet-200/90 bg-white px-4 py-4 text-lg font-medium leading-relaxed text-slate-800 outline-none ring-violet-300/30 focus:border-violet-400 focus:ring-2"
            placeholder="Uygulama notlarınızı buraya yazın…"
            autoFocus
          />
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-violet-100/80 bg-violet-50/50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:opacity-95"
          >
            Kaydet ve Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
