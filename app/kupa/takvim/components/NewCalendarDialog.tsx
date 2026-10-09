"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { kupaBtnGhost, kupaBtnPrimary, kupaInput } from "@/app/kupa/components/KupaShell";
import { calendarYearOptions, defaultMonthFor, pickPlanForYear } from "@/lib/cupping/calendarPlanResolve";
import type { CuppingCalendarPlan } from "@/app/kupa/lib/api";
import { MONTHS_TR } from "./MonthCalendar";

/**
 * WT6 — "Yeni Takvim": YIL + AY seçimi → doğrudan o ayın DÜZENLEME ekranı.
 *
 * Seçilen yıl için zaten takvim varsa YENİ takvim oluşturulmaz: mevcut takvim açılır ve o ayın
 * kayıtlı günleri (renk, kısa açıklama, not) üzerinde çalışılır (duplicate YOK). Yoksa yıl için
 * tek takvim oluşturulur. Karar ve yazma çağıranda (CalendarWorkspace.openMonthForEditing).
 */
export function NewCalendarDialog({
  plans,
  activePlanId,
  busy,
  onCancel,
  onConfirm,
}: {
  plans: CuppingCalendarPlan[];
  activePlanId: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (year: number, month: number) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const years = useMemo(() => calendarYearOptions(plans, now.getFullYear()), [plans, now]);
  const active = plans.find((p) => p.id === activePlanId) ?? null;
  const [year, setYear] = useState<number>(active?.year ?? now.getFullYear());
  const [month, setMonth] = useState<number>(defaultMonthFor(active?.year ?? now.getFullYear(), now));
  const existing = pickPlanForYear(plans, year, activePlanId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !busy && onCancel()}
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="kupa-new-cal-title"
        data-testid="kupa-new-calendar"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onConfirm(year, month);
        }}
        className="flex w-full flex-col gap-4 rounded-t-2xl border border-amber-100 bg-white p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:p-5"
      >
        <div>
          <h3 id="kupa-new-cal-title" className="text-base font-black text-slate-900">Yeni Takvim</h3>
          <p className="mt-0.5 text-xs text-slate-500">Yılı ve ayı seçin; doğrudan o ayın düzenleme ekranı açılır.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Yıl</span>
            <select
              className={kupaInput}
              value={year}
              data-testid="kupa-new-calendar-year"
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={busy}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ay</span>
            <select
              className={kupaInput}
              value={month}
              data-testid="kupa-new-calendar-month"
              onChange={(e) => setMonth(Number(e.target.value))}
              disabled={busy}
            >
              {MONTHS_TR.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <p
          data-testid="kupa-new-calendar-hint"
          className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-900"
        >
          {existing
            ? `${year} için takviminiz zaten var (“${existing.name}”). Yeni takvim oluşturulmaz; ${MONTHS_TR[month - 1]} ${year} ayı mevcut işaretli günleri, renkleri ve notlarıyla açılır.`
            : `${year} için henüz takviminiz yok. ${MONTHS_TR[month - 1]} ${year} boş olarak açılır; günleri kendiniz işaretlersiniz.`}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={`${kupaBtnGhost} min-h-[44px]`} onClick={onCancel} disabled={busy}>
            Vazgeç
          </button>
          <button type="submit" className={`${kupaBtnPrimary} min-h-[44px]`} disabled={busy}>
            {busy ? "Açılıyor…" : `${MONTHS_TR[month - 1]} ${year} Ayını Düzenle`}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
