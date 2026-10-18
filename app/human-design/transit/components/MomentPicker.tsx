"use client";

// Transit anı seçici — Türkiye saati (tarih + saat), "Şimdi" ve hesap düğmesi. Yerel girdiler; UTC dönüşümü sunucuda.

import { TRANSIT_MAX_DATE, TRANSIT_MIN_DATE, type TransitMoment } from "@/lib/human-design/transit/transitMoment";

export function momentCaption(m: TransitMoment): string {
  const [y, mo, d] = m.localDate.split("-");
  return `${d}.${mo}.${y} saat ${m.localTime} (Türkiye saati) için hesaplandı`;
}

const input = "h-10 w-full rounded-xl border border-indigo-200 bg-white px-3 text-base text-slate-900 sm:text-sm";

export function MomentPicker({
  date,
  time,
  busy,
  onDate,
  onTime,
  onNow,
  onSubmit,
  submitLabel,
  disabled = false,
}: {
  date: string;
  time: string;
  busy: boolean;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  onNow: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !disabled) onSubmit();
      }}
      data-hd-transit-picker
    >
      <label className="block text-xs font-bold text-slate-700">
        Tarih
        <input type="date" value={date} min={TRANSIT_MIN_DATE} max={TRANSIT_MAX_DATE} onChange={(e) => onDate(e.target.value)} className={`mt-1 ${input}`} required data-hd-transit-date />
      </label>
      <label className="block text-xs font-bold text-slate-700">
        Saat (Türkiye)
        <input type="time" value={time} step={60} onChange={(e) => onTime(e.target.value.slice(0, 5))} className={`mt-1 ${input}`} required data-hd-transit-time />
      </label>
      <button type="button" onClick={onNow} disabled={busy} className="h-10 rounded-xl border border-indigo-200 bg-white px-4 text-xs font-bold text-indigo-700 disabled:opacity-50" data-hd-transit-now>
        Şimdi
      </button>
      <button type="submit" disabled={busy || disabled} className="h-10 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white disabled:opacity-50" data-hd-transit-submit>
        {busy ? "Hesaplanıyor…" : submitLabel}
      </button>
    </form>
  );
}
