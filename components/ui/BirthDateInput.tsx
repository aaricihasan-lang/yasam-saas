"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type BirthDateInputProps = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
};

// Global tarih sözleşmesi: görünen numerik biçim TÜM locale'lerde nokta ayraçlı
// gün.ay.yıl. Placeholder locale'e göre (TR "GG.AA.YYYY" / EN "DD.MM.YYYY"); saklanan
// değer ISO `yyyy-mm-dd` olarak DEĞİŞMEZ (payload etkilenmez).
export function BirthDateInput({
  value,
  onChange,
  className,
  style,
  placeholder,
  ariaLabel,
}: BirthDateInputProps) {
  const t = useTranslations("common");
  const effectivePlaceholder =
    placeholder ?? (t.has("datePlaceholder") ? t("datePlaceholder") : "DD.MM.YYYY");
  const [display, setDisplay] = useState(() => {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  });

  useEffect(() => {
    if (!value) setDisplay("");
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);

    let formatted = "";
    if (raw.length <= 2) {
      formatted = raw;
    } else if (raw.length <= 4) {
      formatted = `${raw.slice(0, 2)}.${raw.slice(2)}`;
    } else {
      formatted = `${raw.slice(0, 2)}.${raw.slice(2, 4)}.${raw.slice(4)}`;
    }

    setDisplay(formatted);

    if (raw.length === 8) {
      const d = raw.slice(0, 2);
      const m = raw.slice(2, 4);
      const y = raw.slice(4, 8);
      onChange(`${y}-${m}-${d}`);
    } else {
      onChange("");
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      className={className}
      style={style}
      placeholder={effectivePlaceholder}
      aria-label={ariaLabel}
      maxLength={10}
    />
  );
}
