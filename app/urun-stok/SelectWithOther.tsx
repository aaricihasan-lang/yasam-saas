"use client";

import { useId } from "react";
import { OTHER_TEXT_MAX, isOtherOption } from "@/lib/urun-stok/selectOther";

/**
 * Ürün & Stok — "Diğer" destekli seçim alanı. Diğer seçiliyken serbest metin kutusu açılır
 * (≤ 60 karakter). Saklanacak değer çağıran tarafta `composeOtherValue` ile üretilir;
 * düzenlemede `splitOtherValue` liste dışı eski değeri "Diğer + metin" olarak geri yükler.
 * YALNIZ etiket alanları içindir — ölçü tipi / birim alanlarında KULLANILMAZ.
 */
export function SelectWithOther({
  label,
  options,
  value,
  custom,
  onSelect,
  onCustom,
  otherLabel = "Diğer",
  selectClassName,
  inputClassName,
  labelClassName = "mb-1 block text-sm font-black",
  placeholder = "Yazınız",
  transform,
  hint,
}: {
  label: string;
  options: readonly string[];
  value: string;
  custom: string;
  onSelect: (v: string) => void;
  onCustom: (v: string) => void;
  otherLabel?: string;
  selectClassName: string;
  inputClassName?: string;
  labelClassName?: string;
  placeholder?: string;
  /** Yazım dönüşümü (ör. Doğaltaş tür adları için turkishUpper). */
  transform?: (v: string) => string;
  /** Diğer seçiliyken gösterilen kısa ipucu. */
  hint?: string;
}) {
  const id = useId();
  const other = isOtherOption(value, otherLabel);
  // Kayıtlı değer listede yoksa (eski veri) seçim kutusu boş görünmesin.
  const opts = options.includes(value) ? options : [...options, value].filter(Boolean);
  return (
    <div className="block min-w-0">
      <label htmlFor={`${id}-select`} className={labelClassName}>
        {label}
      </label>
      <select id={`${id}-select`} className={selectClassName} value={value} onChange={(e) => onSelect(e.target.value)}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {other ? (
        <>
          <input
            id={`${id}-custom`}
            className={`${inputClassName ?? selectClassName} mt-2 min-h-[42px]`}
            value={custom}
            maxLength={OTHER_TEXT_MAX}
            aria-label={`${label} — ${otherLabel} (yazınız)`}
            aria-describedby={hint ? `${id}-hint` : undefined}
            placeholder={placeholder}
            onChange={(e) => onCustom(transform ? transform(e.target.value) : e.target.value)}
          />
          {hint ? (
            <span id={`${id}-hint`} className="mt-1 block text-xs font-semibold text-slate-500">
              {hint}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
