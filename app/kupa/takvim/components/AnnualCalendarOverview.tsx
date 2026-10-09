"use client";

import { useMemo } from "react";
import { annualHijriCells } from "@/lib/cupping/hijri";
import { getCuppingCellState, type CuppingCellKind, CUPPING_DAY_COLORS } from "../lib/cellState";
import { isoWeekday } from "../lib/bulk";
import { MONTHS_TR, type CuppingDayStyleView } from "./MonthCalendar";

/**
 * FAZ 5 / AŞAMA 3 — YILLIK ÖZET (profesyonel 12-ay planı).
 *
 * TEK PLAN, İKİNCİ TAKVİM YOK: Aylık Düzenleme ile AYNI plan/taslak/kayıt kümesini alır.
 *   Durum getCuppingCellState ile TÜRETİLİR (renk bağımsız hesaplanmaz) → iki görünüm HER
 *   ZAMAN aynı doğruluğu gösterir; KAYDEDİLMEMİŞ taslak dâhil.
 * UZMAN-SAHİPLİ: Hazır gün, Sünnet/Altın, otomatik statü YOKTUR — yalnız uzmanın seçtiği
 *   günler pastel indigo ile vurgulanır. Hiç gün seçilmemişse 12 ay yine gösterilir (sakin
 *   boş-durum mesajı).
 * NAVİGASYON: Yıllık Özet öncelikle ÖZET + GEZİNMEDİR (minik hücrede tekil düzenleme YOK).
 *   Bir ay kartına tıklamak Aylık Düzenleme'yi tam o ayda açar.
 */

/** Haftagünü baş harfleri (Pzt→Paz; minik grid için 2 harf, okunur). */
const WD_INITIALS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"] as const;

/** Minik gün hücresi için kompakt PASTEL dolgu (Aylık ile AYNI durum aileleri). */
const MINI_FILL: Record<CuppingCellKind, string> = {
  none: "text-slate-600",
  selected_saved: "bg-indigo-100 text-indigo-800 font-bold ring-1 ring-indigo-300",
  selected_pending_add: "bg-indigo-50 text-indigo-700 font-bold border border-dashed border-indigo-400",
  pending_remove: "bg-indigo-50 text-indigo-400 line-through opacity-70",
};

export function AnnualCalendarOverview({
  year,
  title,
  description,
  selected,
  saved,
  today,
  styleOf,
  onMonthClick,
  onDayClick,
}: {
  year: number;
  title: string;
  description?: string | null;
  selected: Set<string>;
  saved: Set<string>;
  today: string | null;
  /** Bir günün taslak stili (renk + kısa açıklama) — Aylık ile AYNI kaynak. */
  styleOf: (ymd: string) => CuppingDayStyleView | undefined;
  onMonthClick: (month: number) => void;
  /** WT6: gün → SALT OKUNUR gün bilgisi (düzenleme AÇMAZ, yazma YOK). */
  onDayClick?: (ymd: string) => void;
}) {
  const months = useMemo(() => annualHijriCells(year), [year]);
  const hasSelection = selected.size > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Başlık + sade legend */}
      <div className="flex flex-col gap-3 border-b border-amber-100 pb-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 sm:text-xl">{year} Hacamat Takvimi</h2>
          {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : (
            <p className="mt-0.5 text-sm text-slate-500">{title}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-indigo-100 ring-1 ring-indigo-300" aria-hidden />
            Seçili Gün
          </span>
        </div>
      </div>

      {/* Hiç gün seçilmemişse sakin boş-durum notu (12 ay yine gösterilir). */}
      {!hasSelection ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
          Bu yıl için henüz uygulama günü işaretlenmedi. Günleri işaretlemek için <strong>Bu Ayı Düzenle</strong>
          veya <strong>+ Yeni Takvim</strong> (yıl/ay) kullanın.
        </p>
      ) : null}

      {/* 12 minik ay — responsive (mobil 1, sm 2, lg 3, xl 4 kolon; yatay taşma YOK) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((cells, i) => {
          const month = i + 1;
          const leading = cells.length > 0 ? isoWeekday(cells[0].gregorian) - 1 : 0;
          return (
            <div
              key={month}
              data-kupa-annual-month={month}
              className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-amber-200"
            >
              {/* WT6: ay başlığı → o ayın SALT OKUNUR aylık görünümü (düzenleme DEĞİL). */}
              <button
                type="button"
                onClick={() => onMonthClick(month)}
                aria-label={`${MONTHS_TR[i]} ${year} — aylık görünümde aç`}
                className="group flex items-center justify-between rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
              >
                <span className="text-sm font-black text-slate-800">{MONTHS_TR[i]}</span>
                <span className="text-[10px] font-semibold text-amber-600 opacity-70 transition group-hover:opacity-100" aria-hidden>
                  Ayı görüntüle →
                </span>
              </button>
              {/* Haftagünü başlıkları */}
              <div className="grid grid-cols-7 gap-px">
                {WD_INITIALS.map((w, wi) => (
                  <span key={wi} className="text-center text-[8px] font-bold uppercase text-slate-300" aria-hidden>
                    {w}
                  </span>
                ))}
              </div>
              {/* Gün ızgarası */}
              <div className="grid grid-cols-7 gap-px">
                {Array.from({ length: leading }).map((_, bi) => (
                  <span key={`b-${bi}`} aria-hidden />
                ))}
                {cells.map((cell) => {
                  const ymd = cell.gregorian;
                  const isSel = selected.has(ymd);
                  const state = getCuppingCellState(isSel, saved.has(ymd));
                  const gDay = Number(ymd.slice(8, 10));
                  const isToday = today === ymd;

                  // Renk yalnız seçili günlerde (Aylık ile AYNI eşleme). Kaldırılacak nötr kalır.
                  const dayStyle = styleOf(ymd);
                  const colorKey = dayStyle?.colorKey ?? null;
                  const showColor =
                    colorKey !== null &&
                    (state.kind === "selected_saved" || state.kind === "selected_pending_add");
                  const colorDef = showColor ? CUPPING_DAY_COLORS[colorKey] : null;
                  const fill = colorDef ? colorDef.mini : MINI_FILL[state.kind];
                  const dashed = colorDef && state.kind === "selected_pending_add" ? "border border-dashed" : "";
                  const fullHijri = `${cell.hijri.day} ${cell.hijri.monthName} ${cell.hijri.year}`;
                  const statusWord =
                    state.kind === "selected_saved"
                      ? " — seçili gün"
                      : state.kind === "selected_pending_add"
                        ? " — seçili gün (kaydedilecek)"
                        : state.kind === "pending_remove"
                          ? " — kaldırılacak"
                          : "";
                  const colorWord = colorDef ? ` — ${colorDef.labelTr} renk` : "";
                  const labelWord = isSel && dayStyle?.label ? ` — ${dayStyle.label}` : "";
                  const cellTitle = `${gDay} ${MONTHS_TR[i]} ${year} — Hicrî ${fullHijri}${statusWord}${colorWord}${labelWord}`;
                  const cellCls = [
                    "relative flex aspect-square items-center justify-center rounded text-[9px] leading-none sm:text-[10px]",
                    fill,
                    dashed,
                    isToday && state.kind === "none" ? "ring-1 ring-inset ring-slate-300" : "",
                  ].join(" ");
                  return onDayClick ? (
                    <button
                      key={ymd}
                      type="button"
                      data-kupa-annual-day={ymd}
                      onClick={() => onDayClick(ymd)}
                      title={cellTitle}
                      aria-label={`${cellTitle} — bilgiyi göster`}
                      className={`${cellCls} outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70`}
                    >
                      {gDay}
                    </button>
                  ) : (
                    <span key={ymd} title={cellTitle} className={cellCls}>
                      {gDay}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        Bu yıllık görünüm kayıtlı takviminizi gösterir ve salt okunurdur: bir güne dokunduğunuzda
        yalnız o günün bilgisi açılır. Günleri değiştirmek için <strong>Bu Ayı Düzenle</strong> veya
        <strong> + Yeni Takvim</strong> (yıl/ay) kullanın.
      </p>
    </div>
  );
}
