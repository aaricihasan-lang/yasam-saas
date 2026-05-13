"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** Sayfa içi sabit küçük textarea; tıklanınca ortada LargeTextModal açılır */
export function LongTextareaField({
  label,
  value,
  onChange,
  minRows = 3,
  className,
  modalTitle,
  disabled = false,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
  className: string;
  modalTitle: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const previewRows = Math.min(Math.max(minRows, 3), 4);

  return (
    <>
      <label
        className={`block ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        {label}
        <textarea
          readOnly
          tabIndex={disabled ? -1 : 0}
          rows={previewRows}
          value={value}
          aria-label={`${modalTitle} — düzenlemek için tıklayın`}
          onClick={() => !disabled && setOpen(true)}
          onPointerDown={(e) => {
            if (disabled || e.button !== 0) return;
            e.preventDefault();
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!disabled) setOpen(true);
            }
          }}
          className={`max-h-36 min-h-[5.5rem] w-full cursor-pointer resize-none overflow-y-auto text-slate-900 outline-none select-none ${className}`}
        />
      </label>
      <LargeTextModal
        open={open}
        title={modalTitle}
        initialValue={value}
        onDismiss={() => setOpen(false)}
        onSave={(next) => {
          onChange(next);
          setOpen(false);
        }}
      />
    </>
  );
}

type LargeTextModalProps = {
  open: boolean;
  title: string;
  initialValue: string;
  onSave: (value: string) => void;
  onDismiss: () => void;
};

export function LargeTextModal({
  open,
  title,
  initialValue,
  onSave,
  onDismiss,
}: LargeTextModalProps) {
  const [draft, setDraft] = useState(initialValue);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(initialValue);
    }
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => taRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  if (!open) return null;

  if (typeof document === "undefined") return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-md sm:p-6"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="flex h-[75vh] max-h-[75vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/80 bg-[linear-gradient(165deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_40%,rgba(241,245,249,0.94)_100%)] shadow-[0_28px_72px_-20px_rgba(15,23,42,0.18)] ring-1 ring-violet-100/45"
        role="dialog"
        aria-modal="true"
        aria-labelledby="large-text-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/70 px-4 py-3.5 sm:px-6 sm:py-4">
          <h2
            id="large-text-modal-title"
            className="min-w-0 flex-1 pr-2 text-[15px] font-black leading-snug tracking-tight text-slate-900 sm:text-base"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-lg leading-none text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6 sm:py-4">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-0 flex-1 w-full resize-none rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-[15px] leading-relaxed text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] outline-none ring-1 ring-slate-100/50 transition focus:border-violet-200/85 focus:ring-2 focus:ring-violet-100/45 sm:p-5 sm:text-[15px]"
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200/70 bg-white/40 px-4 py-3.5 backdrop-blur-sm sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.1)] transition hover:bg-slate-50/95"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700"
          >
            Kaydet ve Kapat
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
