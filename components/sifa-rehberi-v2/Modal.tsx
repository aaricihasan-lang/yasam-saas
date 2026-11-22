"use client";

/**
 * Prototip için sade uygulama-içi pencere (tarayıcının prompt/confirm penceresi KULLANILMAZ).
 * Esc = vazgeç; ilk alan otomatik odaklanır. Mevcut Şifa onay penceresinin görünümünü izler.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  testId,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button[data-autofocus]");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[26px] border border-white/90 bg-[linear-gradient(165deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.99)_100%)] shadow-[0_24px_70px_rgba(15,23,42,0.18)] ring-1 ring-emerald-100/60 sm:rounded-[26px] ${wide ? "sm:max-w-[640px]" : "sm:max-w-[460px]"}`}
      >
        <div className="border-b border-slate-100 px-5 pb-3 pt-5">
          <h2 className="text-[17px] font-black text-slate-950">{title}</h2>
          {subtitle ? <p className="mt-1 text-[13px] font-medium leading-5 text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export const btnGhost =
  "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50";
export const btnPrimary =
  "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 px-5 text-[13px] font-black text-white shadow-[0_10px_26px_rgba(16,185,129,0.32)] transition hover:brightness-105 disabled:opacity-50 [forced-color-adjust:none]";
export const btnDanger =
  "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-[13px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50";
export const inputBase =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200";

/** Tek alanlı metin penceresi (yeni konu, alt başlık, yeniden adlandırma, kutu adı…). */
export function PromptDialog({
  title,
  subtitle,
  label,
  placeholder,
  initial = "",
  confirmText = "Tamam",
  suggestions,
  allowEmpty,
  onCancel,
  onSubmit,
  testId,
}: {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  initial?: string;
  confirmText?: string;
  suggestions?: readonly string[];
  allowEmpty?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => string | null | void;
  testId?: string;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!allowEmpty && !value.trim()) {
      setError("Bu alan boş bırakılamaz.");
      return;
    }
    const err = onSubmit(value);
    if (err) setError(err);
  };
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      testId={testId}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onCancel}>
            Vazgeç
          </button>
          <button type="button" className={btnPrimary} onClick={submit} data-testid="prompt-submit">
            {confirmText}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">{label}</span>
        <input
          className={inputBase}
          value={value}
          placeholder={placeholder}
          maxLength={200}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          data-testid="prompt-input"
        />
      </label>
      {suggestions?.length ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold text-slate-500">İsterseniz hazır ad seçin (zorunlu değil):</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setValue(s)}
                className="rounded-full border border-emerald-100 bg-emerald-50/70 px-3 py-1.5 text-[12px] font-bold text-emerald-800 transition hover:bg-emerald-100"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[13px] font-bold text-rose-600" role="alert">{error}</p> : null}
    </Modal>
  );
}
