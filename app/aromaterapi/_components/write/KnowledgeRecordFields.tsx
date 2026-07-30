"use client";

import { useId } from "react";
import { AromaterapiFieldError } from "@/app/aromaterapi/_components/write/AromaterapiFormShell";

/**
 * Aromaterapi V2 — C3D-D form alan primitifleri (client-safe, salt sunum).
 * Erişilebilir: label↔input, 44px, focus-visible, field-level hata.
 */

export type EnumOption = { value: string; label: string };

/** Bir enum kod dizisini readLabels haritasıyla seçenek listesine çevirir. */
export function enumOptions(
  values: readonly string[],
  labels: Record<string, string>,
): EnumOption[] {
  return values.map((v) => ({ value: v, label: labels[v] ?? v }));
}

export function EnumSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  error,
  disabled = false,
  allLabel = "Seçin…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: EnumOption[];
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  allLabel?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-[14px] font-bold text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:bg-slate-50"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <AromaterapiFieldError message={error} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  required = false,
  error,
  disabled = false,
  multiline = false,
  rows = 3,
  maxLength,
  placeholder,
  hint,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
}) {
  const id = useId();
  const cls =
    "mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:bg-slate-50" +
    (mono ? " font-mono text-[13px]" : "");
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} whitespace-pre-wrap`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
      {hint ? <p className="mt-1 text-[11px] font-medium text-slate-400">{hint}</p> : null}
      <AromaterapiFieldError message={error} />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-[14px] font-bold text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:bg-slate-50"
      />
    </div>
  );
}

/** Bir child grubu için kabuk: başlık, "Ekle", satırlar ve boş not. */
export function ChildGroupShell({
  title,
  hint,
  error,
  onAdd,
  addLabel,
  disabled,
  count,
  children,
}: {
  title: string;
  hint?: string;
  error?: string | null;
  onAdd: () => void;
  addLabel: string;
  disabled?: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-black text-slate-800">
            {title} {count > 0 ? <span className="text-slate-400">({count})</span> : null}
          </h4>
          {hint ? <p className="text-[11.5px] font-medium text-slate-400">{hint}</p> : null}
        </div>
        {!disabled ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 text-[12.5px] font-black text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
          >
            + {addLabel}
          </button>
        ) : null}
      </div>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-center text-[12px] font-medium italic text-slate-400">
          Kayıt yok.
        </p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
      <AromaterapiFieldError message={error} />
    </div>
  );
}

export function RowShell({ onRemove, disabled, children }: { onRemove: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">{children}</div>
        {!disabled ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Satırı kaldır"
            className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:border-rose-200 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}
