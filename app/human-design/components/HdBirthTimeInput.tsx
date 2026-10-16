"use client";

// MOB-02 — Doğum saati ELLE yazılabilir (SS:DD). Yerel saat seçicisi zorunlu değildir:
//   • Yalnız rakam (mobilde sayısal klavye, inputMode="numeric"); ":" OTOMATİK eklenir (1430 → 14:30).
//   • Değer üst bileşene YALNIZ geçerli tam saat olarak "SS:DD" (00–23 : 00–59) gider; yarım/geçersiz
//     girişte "" gider ve alan uyarı gösterir → kayıt/hesap yanlış saatle yapılmaz (HD-08, HD-16).
//   • Saat dilimi / yaz-kış saati kuralları DEĞİŞMEZ (sunucuda doğrulanır).

import { useEffect, useRef, useState } from "react";

function toDisplay(v: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(v ?? "");
  return m ? `${m[1]}:${m[2]}` : "";
}

function format(digits: string): string {
  const d = digits.slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

export function hdParseTimeDigits(digits: string): string | null {
  if (digits.length !== 4) return null;
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4));
  if (h > 23 || m > 59) return null;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

export function HdBirthTimeInput({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (hhmm: string) => void;
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
        placeholder="SS:DD"
        maxLength={5}
        value={display}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          setDisplay(format(digits));
          const parsed = hdParseTimeDigits(digits);
          const next = parsed ?? "";
          setInvalid(digits.length > 0 && parsed === null);
          emitted.current = next;
          onChange(next);
        }}
        className={invalid ? `${className ?? ""} !border-rose-400 ring-1 ring-rose-200` : className}
        data-hd-time-input
      />
      {invalid ? (
        <p className="mt-1 text-[11px] font-semibold text-rose-600" role="alert">
          Saati SS:DD biçiminde girin (00:00–23:59), ör. 14:30.
        </p>
      ) : null}
    </>
  );
}
