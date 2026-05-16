"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type PdfPreviewModalProps = {
  src: string;
  title: string;
  onClose: () => void;
};

export function PdfPreviewModal({ src, title, onClose }: PdfPreviewModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="pdf-preview-title"
      onClick={onClose}
    >
      <div
        className="flex h-[min(92vh,900px)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id="pdf-preview-title" className="truncate text-lg font-black text-slate-900">
            {title}
          </h2>
          <div className="flex gap-2">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-900 transition hover:bg-violet-100"
            >
              Yeni Sekmede Aç
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
            >
              Kapat
            </button>
          </div>
        </header>
        <iframe title={title} src={src} className="min-h-0 flex-1 w-full bg-slate-100" />
      </div>
    </div>,
    document.body,
  );
}
