"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isValidIsoDate } from "@/lib/danisan/dateValidation";

type BirthDateInputProps = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
  /**
   * Yazılan metin boş değil ama geçerli tam tarihe çözülmüyorsa true (yarım giriş,
   * 31.02.2000 gibi takvimde olmayan gün, `maxDate` sonrası). Üst bileşen kaydı engeller.
   */
  onInvalidChange?: (invalid: boolean) => void;
  /** En geç izin verilen gün ("YYYY-MM-DD"; ör. doğum tarihi için bugün). */
  maxDate?: string;
};

function isoToDisplay(value: string): string {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Global tarih sözleşmesi: görünen numerik biçim TÜM locale'lerde nokta ayraçlı
// gün.ay.yıl. Placeholder locale'e göre (TR "GG.AA.YYYY" / EN "DD.MM.YYYY"); saklanan
// değer ISO `yyyy-mm-dd` olarak DEĞİŞMEZ (payload etkilenmez).
//
// Satış öncesi kapanış (VALIDATION-DATE): 8 hane girildiğinde GERÇEK takvim tarihi
// (artık yıl, ay uzunluğu, 1900–2100) doğrulanır; geçersiz/yarım giriş artık sessizce
// boşa çevrilip kaydedilmez → `onInvalidChange(true)` ile üst bileşen kaydı engeller.
export function BirthDateInput({
  value,
  onChange,
  className,
  style,
  placeholder,
  ariaLabel,
  onInvalidChange,
  maxDate,
}: BirthDateInputProps) {
  const t = useTranslations("common");
  const effectivePlaceholder =
    placeholder ?? (t.has("datePlaceholder") ? t("datePlaceholder") : "DD.MM.YYYY");
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);
  // Bu bileşenin en son yaydığı değer: yalnız DIŞARIDAN gelen değişiklik (yükleme,
  // temizleme) görünür metni senkronlar; kullanıcı yazarken yarım metin silinmez.
  const emitted = useRef(value);

  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setDisplay(isoToDisplay(value));
    setInvalid(false);
    onInvalidChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(next: string, nextInvalid: boolean) {
    emitted.current = next;
    setInvalid(nextInvalid);
    onInvalidChange?.(nextInvalid);
    onChange(next);
  }

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
      const iso = `${raw.slice(4, 8)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}`;
      const ok = isValidIsoDate(iso) && (!maxDate || iso <= maxDate);
      emit(ok ? iso : "", !ok);
    } else {
      emit("", raw.length > 0);
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      className={invalid ? `${className ?? ""} !border-rose-400 ring-1 ring-rose-200` : className}
      style={style}
      placeholder={effectivePlaceholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      maxLength={10}
    />
  );
}
