"use client";

// MOB-01 — Doğum tarihi ELLE yazılabilir (GG.AA.YYYY). Yerel tarih seçicisi zorunlu değildir:
//   • Yalnız rakam (mobilde sayısal klavye); noktalar OTOMATİK (10041992 → 10.04.1992).
//   • HD kuralı (sunucuyla aynı): gerçek takvim günü, 1800 – bugün (Europe/Istanbul). Yarım/geçersiz
//     girişte üst bileşene "" gider ve alan uyarı gösterir → yanlış tarih kaydedilmez / hesaplanmaz (HD-08).
//   • Hesap SAF metin üzerinden (Date/UTC dönüşümü YOK) → saat dilimi kaynaklı gün kayması olamaz.

import { useEffect, useRef, useState } from "react";

const MIN_YEAR = 1800;

function istanbulTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function toDisplay(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso ?? "") ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
}

function format(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** 8 rakam → geçerliyse "YYYY-AA-GG", değilse null (gerçek takvim günü, 1800 – bugün). */
export function hdParseDateDigits(digits: string, todayIso: string = istanbulTodayIso()): string | null {
  if (!/^\d{8}$/.test(digits)) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  if (day > dim) return null;
  const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  return iso > todayIso ? null : iso;
}

export function HdBirthDateInput({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => toDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const emitted = useRef(value);

  // Yalnız DIŞARIDAN gelen değişiklik (yükleme / form sıfırlama) metni senkronlar.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setDisplay(toDisplay(value));
    setInvalid(false);
  }, [value]);

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="GG.AA.YYYY"
        maxLength={10}
        value={display}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
          setDisplay(format(digits));
          const iso = hdParseDateDigits(digits);
          setInvalid(digits.length > 0 && iso === null);
          const next = iso ?? "";
          emitted.current = next;
          onChange(next);
        }}
        className={invalid ? `${className ?? ""} !border-rose-400 ring-1 ring-rose-200` : className}
        data-hd-date-input
      />
      {invalid ? (
        <p className="mt-1 text-[11px] font-semibold text-rose-600" role="alert">
          Tarihi GG.AA.YYYY biçiminde girin (gerçek bir gün, 1800 – bugün), ör. 10.04.1992.
        </p>
      ) : null}
    </>
  );
}
