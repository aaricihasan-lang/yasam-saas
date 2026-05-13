"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Tıklanınca büyük düzenleme modalı açan uzun metin önizlemesi + modal */
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

  return (
    <>
      <label
        className={`block ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        {label}
        <LongTextPreview
          value={value}
          minRows={minRows}
          className={className}
          onOpen={() => !disabled && setOpen(true)}
          ariaLabel={modalTitle}
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

function LongTextPreview({
  value,
  minRows,
  className,
  onOpen,
  ariaLabel,
}: {
  value: string;
  minRows: number;
  className: string;
  onOpen: () => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const line = 22;
    const minH = minRows * line + 16;
    el.style.height = `${Math.max(el.scrollHeight, minH)}px`;
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      readOnly
      rows={minRows}
      value={value}
      aria-label={ariaLabel}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`cursor-pointer overflow-hidden text-slate-900 outline-none select-none ${className}`}
    />
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/35 p-3 backdrop-blur-md sm:items-center sm:p-5"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-3xl flex-col rounded-2xl border border-white/85 bg-[linear-gradient(165deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.94)_45%,rgba(241,245,249,0.92)_100%)] p-4 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.14)] ring-1 ring-violet-100/40 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="large-text-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="large-text-modal-title"
          className="mb-3 shrink-0 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500"
        >
          {title}
        </p>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[min(52vh,420px)] w-full flex-1 resize-y rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-[14px] leading-relaxed text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none ring-1 ring-slate-100/60 transition focus:border-violet-200/80 focus:ring-2 focus:ring-violet-100/50 sm:min-h-[min(48vh,380px)] sm:p-5"
        />
        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100/90 pt-4">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 hover:bg-slate-50/95"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.35)] transition hover:-translate-y-0.5 hover:bg-emerald-700"
          >
            Kaydet ve Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
