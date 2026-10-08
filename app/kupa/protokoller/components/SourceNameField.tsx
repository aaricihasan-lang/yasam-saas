"use client";

import { useId, useMemo, useState } from "react";
import { kupaInput } from "@/app/kupa/components/KupaShell";
import { ownSourceSuggestions, type SourceLike } from "@/lib/cupping/ownSources";

/**
 * WT6 — Kaynak adı: SERBEST metin + yalnız uzmanın KENDİ geçmiş kaynak adlarından öneri.
 * Hazır katalog/açılır liste YOK ("bunlardan birini seçmek zorundasın" hissi verilmez). Öneri
 * listesi yalnız yazarken/odakta görünür; uzman yine istediği yeni adı yazabilir.
 * (Native <datalist> yerine: Android'de bindirme sorunları ve sorgu dışı tam liste gösterimi yok.)
 */
export function SourceNameField({
  value,
  onChange,
  sources,
  label,
  placeholder,
  disabled,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  sources: readonly SourceLike[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => ownSourceSuggestions(sources, value), [sources, value]);
  const show = focused && !disabled && suggestions.length > 0;

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-[11px] font-semibold text-slate-500">{label}</label>
      <input
        id={id}
        data-testid={testId}
        className={`mt-1 ${kupaInput}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        // Öneriye dokunma (mousedown) blur'dan önce işlenir; kısa gecikmeyle kapanır.
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
      />
      {show ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          data-testid={testId ? `${testId}-suggestions` : undefined}
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <li className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400" aria-hidden>
            Daha önce yazdığınız kaynaklar
          </li>
          {suggestions.map((s) => (
            <li key={s} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s);
                  setFocused(false);
                }}
                className="block min-h-[40px] w-full px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-amber-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
