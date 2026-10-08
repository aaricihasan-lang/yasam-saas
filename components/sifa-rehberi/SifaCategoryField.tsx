"use client";

import { useId, useState } from "react";
import { SUGGESTED_CATEGORIES } from "@/lib/sifa-rehberi/categories";
import {
  CATEGORY_CUSTOM_OPTION,
  categorySelectValue,
  resolveCategorySelection,
} from "@/lib/sifa-rehberi/categoryField";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  /** Hem açılır liste hem "Diğer" metin kutusu için ortak görünüm sınıfı. */
  inputClassName?: string;
};

/**
 * Şifa Rehberi kategori alanı (WT4).
 *
 * KÖK NEDEN: önceki alan `<input list="…">` + `<datalist>` idi. Datalist önerileri o anki metne
 * göre SÜZER → bir kategori seçildikten sonra liste yeniden açıldığında yalnız aynı değer (veya
 * hiçbir şey) görünüyordu; Android WebView/Chrome'da öneri katmanı klavyenin üstünde gri bir
 * bindirme + seçili metnin ikinci kopyası olarak çiziliyordu. Kullanıcı kategoriyi değiştiremiyordu.
 *
 * ÇÖZÜM: yerel `<select>` (her platformda güvenilir, her açılışta TAM liste) + "Diğer" seçilince
 * serbest metin kutusu. `category` kolonu serbest metin olarak KALIR (önerilen dışı mevcut
 * değerler korunur ve listede görünür). Karar mantığı saf: lib/sifa-rehberi/categoryField.ts.
 */
export default function SifaCategoryField({ value, onChange, disabled, className, inputClassName }: Props) {
  const selectId = useId();
  const [customMode, setCustomMode] = useState(false);
  const selectValue = categorySelectValue(value, customMode);
  const showCustomInput = selectValue === CATEGORY_CUSTOM_OPTION;

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <select
        id={selectId}
        aria-label="Kategori"
        data-testid="sifa-category-select"
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const next = resolveCategorySelection(e.target.value, value);
          setCustomMode(next.customMode);
          onChange(next.value);
        }}
        className={inputClassName}
      >
        <option value="">Kategori seçilmedi</option>
        {SUGGESTED_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={CATEGORY_CUSTOM_OPTION}>Diğer (kendim yazayım)…</option>
      </select>
      {showCustomInput ? (
        <input
          aria-label="Özel kategori"
          data-testid="sifa-category-custom"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Örn. Sinir sistemi"
          className={inputClassName}
          autoComplete="off"
        />
      ) : null}
    </div>
  );
}
