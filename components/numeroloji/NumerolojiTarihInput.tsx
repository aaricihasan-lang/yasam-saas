"use client";

// Numeroloji Merkezi — ortak tarih giriş alanı (Bütüncül + Klasik Numeroloji; 30.10.2026 owner kararı).
// Görünen ve üst bileşene verilen değer DAİMA "GG.AA.YYYY" (yazarken noktalar otomatik):
//   14021987 → 14.02.1987 · 1.2.1990 → 01.02.1990 · 14/02/1987 ve 1987-02-14 yapıştırma → 14.02.1987
// Doğrulama (geçersiz gün / ay, artık yıl) ve hesap motoruna giden biçim ÇAĞIRAN ekranda kalır — bu bileşen yalnız
// yazım biçimini düzenler; hesap motoru, API sözleşmesi ve kayıtlı değerler değişmez.
// İmleç: yazılan rakam sayısına göre korunur (aradan düzeltme sıçramaz); nokta önünde geri silme rakamı siler.

import { forwardRef, useImperativeHandle, useRef, type CSSProperties, type InputHTMLAttributes } from "react";

const SEP = /[./\-\s]/;

/** 0–8 rakam → "GG.AA.YYYY" parçalı gösterim. */
export function formatTarihRakam(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/**
 * Serbest metin → "GG.AA.YYYY" (yarım olabilir). Ayraçlı tek haneli gün / ay sıfırla tamamlanır;
 * YYYY-AA-GG (ISO) yapıştırma çevrilir. Rakam dışı karakterler atılır; en çok 8 rakam.
 */
export function normalizeTarihGirdisi(raw: string): string {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return formatTarihRakam(`${iso[3].padStart(2, "0")}${iso[2].padStart(2, "0")}${iso[1]}`);
  if (!SEP.test(s)) return formatTarihRakam(s);
  const endsWithSep = SEP.test(s.slice(-1));
  const parts = s.split(/[./\-\s]+/);
  let buf = "";
  parts.forEach((p, i) => {
    let dg = p.replace(/\D/g, "");
    if (!dg) return;
    const closed = i < parts.length - 1 || endsWithSep;
    // Gün (0) ve ay (2) parçası tek haneyle kapatıldıysa başına 0 eklenir: "1." → "01."
    if (closed && dg.length === 1 && (buf.length === 0 || buf.length === 2)) dg = `0${dg}`;
    buf += dg;
  });
  buf = buf.slice(0, 8);
  const out = formatTarihRakam(buf);
  return endsWithSep && (buf.length === 2 || buf.length === 4) ? `${out}.` : out;
}

/** Biçimli metinde n. rakamdan sonraki konum (n = 0 → 0). */
function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return formatted.length;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode" | "maxLength"> & {
  value: string;
  /** Her zaman "GG.AA.YYYY" biçiminde (yarım olabilir) çağrılır. */
  onChange: (next: string) => void;
  className?: string;
  style?: CSSProperties;
};

export const NumerolojiTarihInput = forwardRef<HTMLInputElement, Props>(function NumerolojiTarihInput(
  { value, onChange, placeholder = "GG.AA.YYYY", autoComplete = "off", onKeyDown, onPaste, ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);

  function apply(next: string, digitsBeforeCaret: number | null) {
    onChange(next);
    const el = inner.current;
    if (!el || digitsBeforeCaret === null) return;
    const pos = digitsBeforeCaret === -1 ? next.length : caretAfterDigits(next, digitsBeforeCaret);
    // React değeri yazdıktan SONRA imleç yerleştirilir (sıçrama yok).
    requestAnimationFrame(() => {
      if (document.activeElement === el) el.setSelectionRange(pos, pos);
    });
  }

  return (
    <input
      {...rest}
      ref={inner}
      type="text"
      inputMode="numeric"
      autoComplete={autoComplete}
      placeholder={placeholder}
      maxLength={10}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        const caret = e.target.selectionStart ?? raw.length;
        const atEnd = caret >= raw.length;
        const next = normalizeTarihGirdisi(raw);
        const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length;
        // Sona yazılıyorsa imleç sonda kalır (otomatik nokta / sıfır tamamlama dahil); arada düzeltmede rakam sayısına göre.
        apply(next, atEnd ? -1 : digitsBefore);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        const el = e.currentTarget;
        const s = el.selectionStart ?? 0;
        const t = el.selectionEnd ?? 0;
        if (s !== t) return; // seçim varsa tarayıcı siler; onChange biçimler
        if (e.key === "Backspace" && s > 0 && el.value[s - 1] === ".") {
          // Nokta önünde geri silme: noktanın solundaki RAKAM silinir (nokta yeniden eklenip imleç takılmaz).
          e.preventDefault();
          const digits = el.value.replace(/\D/g, "");
          const before = el.value.slice(0, s - 1).replace(/\D/g, "").length;
          if (before === 0) return;
          const nextDigits = digits.slice(0, before - 1) + digits.slice(before);
          apply(formatTarihRakam(nextDigits), before - 1);
        } else if (e.key === "Delete" && el.value[s] === ".") {
          e.preventDefault();
          const digits = el.value.replace(/\D/g, "");
          const before = el.value.slice(0, s).replace(/\D/g, "").length;
          if (before >= digits.length) return;
          apply(formatTarihRakam(digits.slice(0, before) + digits.slice(before + 1)), before);
        }
      }}
      onPaste={(e) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        const el = e.currentTarget;
        const text = e.clipboardData.getData("text");
        if (!text) return;
        const s = el.selectionStart ?? 0;
        const t = el.selectionEnd ?? 0;
        // Tüm alan seçiliyken / boşken yapıştırma: tam tarih olarak yorumlanır (ISO ve ayraçlı biçimler dahil).
        if (s === 0 && t === el.value.length) {
          e.preventDefault();
          apply(normalizeTarihGirdisi(text), -1);
        }
      }}
    />
  );
});
