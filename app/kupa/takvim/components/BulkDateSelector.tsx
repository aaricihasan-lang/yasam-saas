"use client";

import { useMemo, useState } from "react";
import { kupaBtnGhost, kupaBtnPrimary, kupaInput, kupaPill, kupaPillActive } from "@/app/kupa/components/KupaShell";
import { computeBulkDates, hasAnyCriteria, WEEKDAYS_TR, type BulkCriteria } from "../lib/bulk";
import type { CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import { CUPPING_DAY_COLORS, CUPPING_DAY_COLOR_ORDER } from "../lib/cellState";
import { MONTHS_TR } from "./MonthCalendar";

/**
 * FAZ 5 / AŞAMA 3 + 5 — NÖTR Toplu Gün Seçimi (opsiyonel yardımcı; sayfayı BASKILAMAZ).
 *
 * Profesyonel KENDİ ölçütünü seçer. Ön-seçili değer YOK; 17/19/21 preset YOK; ekol YOK;
 *   haftagünü yasağı YOK. Ölçütler EPHEMERAL React state'idir — DB'ye/localStorage'a
 *   KALICILAŞTIRILMAZ.
 * RENK ZORUNLU (AŞAMA 5): tek gün kuralıyla tutarlı — toplu ekleme için de bir renk seçilmelidir
 *   (varsayılan/ön-seçili YOK, hazır ekol kuralı YOK). Seçilen renk YALNIZ bu işlemle YENİ eklenen
 *   günlere uygulanır; daha önce seçili/kayıtlı günlerin renkleri EZİLMEZ. Sonuç yerel taslağa
 *   eklenir (otomatik kayıt YOK; kullanıcı ayrıca "Değişiklikleri Kaydet" der).
 */
export function BulkDateSelector({
  year,
  onAddDates,
}: {
  year: number;
  onAddDates: (dates: string[], colorKey: CuppingDayColorKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [useRange, setUseRange] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [hijriDays, setHijriDays] = useState<number[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  // Gregoryen ay çoklu-seçimi — EPHEMERAL; ön-seçili DEĞİL; DB/localStorage'a YAZILMAZ.
  const [months, setMonths] = useState<number[]>([]);
  // Toplu renk — ZORUNLU; ön-seçili DEĞİL (varsayılan/ekol kuralı YOK).
  const [colorKey, setColorKey] = useState<CuppingDayColorKey | null>(null);

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
  // Renk ZORUNLU: ölçüt + sonuç + renk üçü de gerekli.
  const canApply = hasAnyCriteria(criteria) && preview.length > 0 && colorKey !== null;

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
    setColorKey(null);
  }
  function apply() {
    if (!canApply || colorKey === null) return;
    onAddDates(preview, colorKey);
    // Uygulama sonrası ölçütleri + rengi sıfırla (ephemeral; kalıcı kural/varsayılan renk YOK).
    reset();
    setOpen(false);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white/70 max-lg:rounded-none max-lg:border-x-0">
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
            Kendi yaklaşımınıza göre ölçüt seçin ve bir renk belirleyin; eşleşen yeni günler o renkle
            taslak seçiminize eklenir. Ölçütler ve renk kaydedilmez, yalnızca sonuç günleri saklanabilir.
          </p>

          {/* A) Hicrî gün numaraları (1–30) — ön-seçili DEĞİL */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Hicrî Gün Numarası</p>
            <div className="grid grid-cols-6 gap-1 min-[400px]:grid-cols-8 sm:grid-cols-10">
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

          {/* E) Toplu RENK — ZORUNLU; ön-seçili DEĞİL. Yalnız bu işlemle EKLENEN yeni günlere uygulanır. */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Renk (zorunlu)</p>
            <div className="flex flex-wrap gap-2">
              {CUPPING_DAY_COLOR_ORDER.map((key) => {
                const def = CUPPING_DAY_COLORS[key];
                const active = colorKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setColorKey(key)}
                    aria-pressed={active}
                    aria-label={def.labelTr}
                    title={def.labelTr}
                    className={[
                      "h-8 w-8 rounded-full border-2 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400/70",
                      def.swatch,
                      active ? "ring-2 ring-slate-700 ring-offset-2" : "hover:scale-105",
                    ].join(" ")}
                  />
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              Seçtiğiniz renk yalnızca bu toplu işlemle <span className="font-semibold">yeni eklenen</span> günlere
              uygulanır; mevcut günlerin rengini değiştirmez.
            </p>
          </div>

          {/* Önizleme + aksiyon */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-slate-600" aria-live="polite">
              {!hasAnyCriteria(criteria)
                ? "Ölçüt seçilmedi"
                : colorKey === null
                  ? `${preview.length} gün eşleşti — renk seçin`
                  : `${preview.length} gün eşleşti`}
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
