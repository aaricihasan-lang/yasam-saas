"use client";

import { useMemo, useState } from "react";
import { kupaBtnGhost, kupaBtnPrimary, kupaInput, kupaPill, kupaPillActive } from "@/app/kupa/components/KupaShell";
import { computeBulkDates, hasAnyCriteria, WEEKDAYS_TR, type BulkCriteria } from "../lib/bulk";
import { MONTHS_TR } from "./MonthCalendar";

/**
 * FAZ 5 / AŞAMA 3 — NÖTR Toplu Gün Seçimi (opsiyonel yardımcı; sayfayı BASKILAMAZ).
 *
 * Profesyonel KENDİ ölçütünü seçer. Ön-seçili değer YOK; 17/19/21 preset YOK; ekol YOK;
 *   haftagünü yasağı YOK. Ölçütler EPHEMERAL React state'idir — DB'ye/localStorage'a
 *   KALICILAŞTIRILMAZ; panel kapanınca/yeniden yüklenince sıfırlanabilir.
 * Sonuç somut Gregoryen tarihlere çözülür ve YALNIZCA yerel taslak seçime eklenir
 *   (otomatik kayıt YOK; kullanıcı ayrıca "Değişiklikleri Kaydet" der).
 */
export function BulkDateSelector({
  year,
  onAddDates,
}: {
  year: number;
  onAddDates: (dates: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [useRange, setUseRange] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [hijriDays, setHijriDays] = useState<number[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  // Gregoryen ay çoklu-seçimi — EPHEMERAL; ön-seçili DEĞİL; DB/localStorage'a YAZILMAZ.
  const [months, setMonths] = useState<number[]>([]);

  const yearMin = `${year}-01-01`;
  const yearMax = `${year}-12-31`;

  const criteria: BulkCriteria = useMemo(
    () => ({
      rangeStart: useRange && rangeStart ? rangeStart : null,
      rangeEnd: useRange && rangeEnd ? rangeEnd : null,
      hijriDays,
      weekdays,
      months,
    }),
    [useRange, rangeStart, rangeEnd, hijriDays, weekdays, months],
  );

  const preview = useMemo(() => computeBulkDates(year, criteria), [year, criteria]);
  const canApply = hasAnyCriteria(criteria) && preview.length > 0;

  function toggleHijri(n: number) {
    setHijriDays((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }
  function toggleWeekday(iso: number) {
    setWeekdays((prev) => (prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso].sort((a, b) => a - b)));
  }
  function toggleMonth(m: number) {
    setMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)));
  }
  function reset() {
    setUseRange(false);
    setRangeStart("");
    setRangeEnd("");
    setHijriDays([]);
    setWeekdays([]);
    setMonths([]);
  }
  function apply() {
    if (!canApply) return;
    onAddDates(preview);
    // Uygulama sonrası ölçütleri sıfırla (ephemeral; kalıcı kural YOK).
    reset();
    setOpen(false);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>🗓️</span>
          <span className="text-sm font-bold text-slate-800">Toplu Gün Seçimi</span>
          <span className="text-xs text-slate-400">(kendi ölçütünüzle)</span>
        </span>
        <span aria-hidden className="text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-slate-100 px-4 py-4">
          <p className="text-xs leading-relaxed text-slate-500">
            Kendi yaklaşımınıza göre ölçüt seçin; eşleşen günler taslak seçiminize eklenir.
            Ölçütler kaydedilmez, yalnızca sonuç günleri saklanabilir.
          </p>

          {/* A) Hicrî gün numaraları (1–30) — ön-seçili DEĞİL */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Hicrî Gün Numarası</p>
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleHijri(n)}
                  aria-pressed={hijriDays.includes(n)}
                  className={`${hijriDays.includes(n) ? kupaPillActive : kupaPill} min-h-[32px] px-0 text-center`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* B) Haftagünleri — ön-seçili DEĞİL, yasak DEĞİL */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Haftagünü</p>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS_TR.map((w) => (
                <button
                  key={w.iso}
                  type="button"
                  onClick={() => toggleWeekday(w.iso)}
                  aria-pressed={weekdays.includes(w.iso)}
                  aria-label={w.long}
                  className={`${weekdays.includes(w.iso) ? kupaPillActive : kupaPill} min-h-[36px]`}
                >
                  {w.short}
                </button>
              ))}
            </div>
          </div>

          {/* C) Gregoryen aylar — çoklu seçim (opsiyonel; ephemeral). Seçiliyse sonuç
                yalnız bu aylarda kalır (diğer ölçütlerle AND). Boşsa ay filtresi yok. */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Aylar</p>
              {months.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setMonths([])}
                  className="text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                >
                  Tüm ayları temizle
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
              {MONTHS_TR.map((label, i) => {
                const m = i + 1;
                const active = months.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMonth(m)}
                    aria-pressed={active}
                    aria-label={`${label} ${year}`}
                    className={`${active ? kupaPillActive : kupaPill} min-h-[36px] px-0 text-center`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* D) Gregoryen tarih aralığı (opsiyonel) */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} />
              Tarih Aralığı ({year})
            </label>
            {useRange ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="date"
                  className={kupaInput}
                  value={rangeStart}
                  min={yearMin}
                  max={yearMax}
                  onChange={(e) => setRangeStart(e.target.value)}
                  aria-label="Başlangıç tarihi"
                />
                <input
                  type="date"
                  className={kupaInput}
                  value={rangeEnd}
                  min={yearMin}
                  max={yearMax}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  aria-label="Bitiş tarihi"
                />
              </div>
            ) : null}
          </div>

          {/* Önizleme + aksiyon */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-slate-600" aria-live="polite">
              {hasAnyCriteria(criteria)
                ? `${preview.length} gün eşleşti`
                : "Ölçüt seçilmedi"}
            </span>
            <div className="flex gap-2">
              <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={reset}>
                Temizle
              </button>
              <button
                type="button"
                className={`${kupaBtnPrimary} min-h-[40px]`}
                onClick={apply}
                disabled={!canApply}
              >
                Seçime Ekle
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
