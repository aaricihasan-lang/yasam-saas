"use client";

/**
 * Doğum tarihi girişi (2026-10-12, Android UAT madde 3): ELLE yazım + takvim, ikisi senkron.
 *
 * • Yazım: yalnız rakam (mobilde sayısal klavye, inputMode="numeric"); ayraçlar OTOMATİK: 10041992 → 10.04.1992.
 *   Silme / araya yazma / yapıştırma rakam sayısına göre yeniden biçimlenir; imleç rakam konumunda kalır. Ayraç
 *   silinmeye çalışılırsa önündeki rakam silinir (imleç ayraçta takılmaz).
 * • Takvim: gizli yerel tarih seçici (showPicker); seçilen gün metne yazılır, metindeki geçerli tarih takvime taşınır.
 * • Değer: üst bileşene YALNIZ geçerli tam tarih "YYYY-AA-GG" olarak (aksi hâlde ""); kısmi / geçersiz girişte açıklayıcı
 *   uyarı. Hesap SAF metin üzerinden yapılır (Date/UTC dönüşümü YOK) → saat dilimi kaynaklı bir gün kayması olamaz.
 *   Saat ve konum kuralları değişmez (yalnız tarih alanı).
 */
import { useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

const MIN_YEAR = 1550; // sunucu (profileInput) ile aynı: sağlayıcı efemeris aralığı
const MAX_YEAR = 2100;

const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** Rakam dizisini GG.AA.YYYY biçimine çevirir (en çok 8 rakam). */
export function formatDigits(d: string): string {
  const x = d.slice(0, 8);
  if (x.length <= 2) return x;
  if (x.length <= 4) return `${x.slice(0, 2)}.${x.slice(2)}`;
  return `${x.slice(0, 2)}.${x.slice(2, 4)}.${x.slice(4)}`;
}

/** Tam (8 rakam) girişin doğrulaması: ISO değer ya da hata. Bugünün tarihi dışarıdan (Europe/Istanbul) verilir. */
export function parseDigits(d: string, todayIso: string): { iso: string } | { error: string } | null {
  if (d.length === 0) return null;
  if (d.length < 8) return { error: "Tarihi GG.AA.YYYY biçiminde tamamlayın (ör. 10.04.1992)." };
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4, 8));
  if (month < 1 || month > 12) return { error: "Ay 01–12 arasında olmalıdır." };
  if (year < MIN_YEAR || year > MAX_YEAR) return { error: `Yıl ${MIN_YEAR}–${MAX_YEAR} aralığında olmalıdır.` };
  if (day < 1 || day > daysIn(year, month)) {
    return { error: month === 2 && day === 29 ? `${year} artık yıl değil; Şubat 28 gündür.` : `Bu ayda ${daysIn(year, month)} gün var; geçersiz gün.` };
  }
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  if (iso > todayIso) return { error: "Doğum tarihi bugünden sonra olamaz." };
  return { iso };
}

function istanbulToday(): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

const isoToDigits = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` : "");

export default function BirthDateInput({ value, onChange, label = "Doğum tarihi" }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const id = useId();
  const [digits, setDigits] = useState(() => isoToDigits(value));
  const [touched, setTouched] = useState(false);
  const textRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const [today] = useState(istanbulToday);
  // Dışarıdan gelen değer (takvim / form sıfırlama) metinle çelişiyorsa metin güncellenir (render sırasında senkron).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value && isoToDigits(value) !== digits) setDigits(isoToDigits(value));
  }
  const parsed = parseDigits(digits, today);
  const error = parsed && "error" in parsed && (touched || digits.length === 8) ? parsed.error : null;

  function commit(nextDigits: string, caretDigits: number | null) {
    setDigits(nextDigits);
    const p = parseDigits(nextDigits, today);
    const iso = p && "iso" in p ? p.iso : "";
    if (iso !== value) {
      setLastValue(iso);
      onChange(iso);
    }
    if (caretDigits !== null) {
      // İmleç: aynı sayıda rakamın arkasına (ayraçlar atlanır).
      const f = formatDigits(nextDigits);
      let pos = 0;
      let seen = 0;
      while (pos < f.length && seen < caretDigits) {
        if (/\d/.test(f[pos])) seen++;
        pos++;
      }
      requestAnimationFrame(() => textRef.current?.setSelectionRange(pos, pos));
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium text-slate-700">
        {label}
      </label>
      <div className="relative flex items-stretch gap-1.5">
        <input
          ref={textRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="GG.AA.YYYY"
          maxLength={10}
          value={formatDigits(digits)}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          onKeyDown={(e) => {
            // Ayraç önünde Backspace: ayraç değil önündeki rakam silinir (imleç ayraçta takılmaz).
            const el = e.currentTarget;
            if (e.key === "Backspace" && el.selectionStart === el.selectionEnd && el.selectionStart && el.value[el.selectionStart - 1] === ".") {
              e.preventDefault();
              const before = el.value.slice(0, el.selectionStart - 1).replace(/\D/g, "");
              const after = el.value.slice(el.selectionStart).replace(/\D/g, "");
              commit(before.slice(0, -1) + after, Math.max(0, before.length - 1));
            }
          }}
          onChange={(e) => {
            const el = e.target;
            const caret = el.selectionStart ?? el.value.length;
            const caretDigits = el.value.slice(0, caret).replace(/\D/g, "").length;
            commit(el.value.replace(/\D/g, "").slice(0, 8), Math.min(caretDigits, 8));
          }}
          onBlur={() => setTouched(true)}
          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 tabular-nums tracking-wide ${error ? "border-rose-400" : "border-slate-300"}`}
          data-testid="birth-date-text"
        />
        <button
          type="button"
          onClick={() => {
            const el = pickerRef.current;
            if (!el) return;
            try {
              el.showPicker();
            } catch {
              el.focus();
              el.click();
            }
          }}
          className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-slate-500"
          aria-label="Takvimden seç"
          title="Takvimden seç"
          data-testid="birth-date-calendar"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        {/* Gizli yerel takvim: değer metinle senkron (yalnız geçerli tarih). */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={`${MIN_YEAR}-01-01`}
          max={today}
          value={parsed && "iso" in parsed ? parsed.iso : ""}
          onChange={(e) => {
            const d = isoToDigits(e.target.value);
            setTouched(true);
            commit(d, null);
          }}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          data-testid="birth-date-picker"
        />
      </div>
      <p id={`${id}-hint`} className={`text-xs ${error ? "text-rose-700" : "text-slate-500"}`} role={error ? "alert" : undefined} data-testid="birth-date-hint">
        {error ?? "Yalnız rakam yazın: 10041992 → 10.04.1992. İsterseniz takvim simgesinden seçin."}
      </p>
    </div>
  );
}
