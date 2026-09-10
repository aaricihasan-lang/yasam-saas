"use client";

import { useMemo } from "react";
import { annualHijriCells } from "@/lib/cupping/hijri";
import type { CuppingSelectionSource } from "@/lib/cupping/traditionalDays";
import { getCuppingCellState, type CuppingCellKind } from "../lib/cellState";
import { isoWeekday } from "../lib/bulk";
import { MONTHS_TR } from "./MonthCalendar";

/**
 * FAZ 5 / AŞAMA 3 — YILLIK ÖZET (profesyonel 12-ay planı).
 *
 * TEK PLAN, İKİNCİ TAKVİM YOK: Aylık Düzenleme ile AYNI plan/taslak/köken haritasını alır.
 *   Anlamsal durum getCuppingCellState ile TÜRETİLİR (renk bağımsız hesaplanmaz) → iki
 *   görünüm HER ZAMAN aynı doğruluğu gösterir; KAYDEDİLMEMİŞ taslak dâhil.
 * NAVİGASYON: Yıllık Özet öncelikle ÖZET + GEZİNMEDİR (minik hücrede tekil düzenleme YOK).
 *   Bir ay kartına tıklamak Aylık Düzenleme'yi tam o ayda açar.
 * Minik hücrelerde tam Hicrî METİN gösterilmez (kalabalık olmasın) ama title/aria-label
 *   aynı kanonik yardımcıdan tam Hicrî tarihi taşır. Tıbbi/A3/A4/Word/print YOK.
 */

/** Haftagünü baş harfleri (Pzt→Paz; minik grid için 2 harf, okunur). */
const WD_INITIALS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"] as const;

/** Minik gün hücresi için kompakt PASTEL dolgu (Aylık ile AYNI anlamsal aileler). */
const MINI_FILL: Record<CuppingCellKind, string> = {
  none: "text-slate-600",
  sunnah: "bg-emerald-100 text-emerald-800 font-bold ring-1 ring-emerald-300",
  golden: "bg-amber-100 text-amber-900 font-bold ring-1 ring-amber-300",
  "manual-saved": "bg-indigo-100 text-indigo-800 font-bold ring-1 ring-indigo-300",
  "manual-unsaved": "bg-indigo-50 text-indigo-700 font-bold border border-dashed border-indigo-400",
  "removal-auto": "bg-emerald-50 text-emerald-400 line-through opacity-70",
  "removal-manual": "bg-indigo-50 text-indigo-400 line-through opacity-70",
};

export function AnnualCalendarOverview({
  year,
  title,
  description,
  selected,
  savedSource,
  today,
  autoCount,
  practitionerCount,
  totalCount,
  onMonthClick,
}: {
  year: number;
  title: string;
  description?: string | null;
  selected: Set<string>;
  savedSource: Map<string, CuppingSelectionSource>;
  today: string | null;
  autoCount: number;
  practitionerCount: number;
  totalCount: number;
  onMonthClick: (month: number) => void;
}) {
  const months = useMemo(() => annualHijriCells(year), [year]);

  return (
    <div className="flex flex-col gap-4">
      {/* Başlık + özet + legend */}
      <div className="flex flex-col gap-3 border-b border-amber-100 pb-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 sm:text-xl">{year} Hacamat Takvimi</h2>
          {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : (
            <p className="mt-0.5 text-sm text-slate-500">{title}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-emerald-700">{autoCount} Otomatik</span>
          <span className="text-slate-300" aria-hidden>•</span>
          <span className="font-semibold text-indigo-700">{practitionerCount} Uzman</span>
          <span className="text-slate-300" aria-hidden>•</span>
          <span className="font-semibold text-amber-700">{totalCount} Toplam</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
          <LegendDot className="bg-emerald-100 ring-1 ring-emerald-300" label="Sünnet" />
          <LegendDot className="bg-amber-100 ring-1 ring-amber-300" label="Altın" />
          <LegendDot className="bg-indigo-100 ring-1 ring-indigo-300" label="Uzman" />
        </div>
      </div>

      {/* 12 minik ay — responsive (mobil 1, sm 2, lg 3, xl 4 kolon; yatay taşma YOK) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((cells, i) => {
          const month = i + 1;
          const leading = cells.length > 0 ? isoWeekday(cells[0].gregorian) - 1 : 0;
          return (
            <button
              key={month}
              type="button"
              onClick={() => onMonthClick(month)}
              aria-label={`${MONTHS_TR[i]} ${year} — Aylık Düzenleme'de aç`}
              className="group flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 text-left outline-none transition hover:border-amber-300 hover:bg-amber-50/40 focus-visible:ring-2 focus-visible:ring-amber-400/60"
            >
              <span className="flex items-center justify-between">
                <span className="text-sm font-black text-slate-800">{MONTHS_TR[i]}</span>
                <span className="text-[10px] font-semibold text-amber-600 opacity-0 transition group-hover:opacity-100" aria-hidden>
                  Düzenle →
                </span>
              </span>
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
                  const state = getCuppingCellState(ymd, isSel, savedSource.get(ymd));
                  const gDay = Number(ymd.slice(8, 10));
                  const isToday = today === ymd;
                  const fill = MINI_FILL[state.kind];
                  const fullHijri = `${cell.hijri.day} ${cell.hijri.monthName} ${cell.hijri.year}`;
                  const statusWord =
                    state.kind === "golden"
                      ? " — Altın Gün ★★★★★"
                      : state.kind === "sunnah"
                        ? " — Sünnet Günü"
                        : state.kind === "manual-saved"
                          ? " — Uzman seçimi"
                          : state.kind === "manual-unsaved"
                            ? " — Uzman seçimi (kaydedilecek)"
                            : state.kind === "removal-auto" || state.kind === "removal-manual"
                              ? " — kaldırılacak"
                              : "";
                  return (
                    <span
                      key={ymd}
                      title={`${gDay} ${MONTHS_TR[i]} ${year} — Hicrî ${fullHijri}${statusWord}`}
                      className={[
                        "relative flex aspect-square items-center justify-center rounded text-[9px] leading-none sm:text-[10px]",
                        fill,
                        isToday && state.kind === "none" ? "ring-1 ring-inset ring-slate-300" : "",
                      ].join(" ")}
                    >
                      {gDay}
                      {state.kind === "golden" ? (
                        <span className="absolute -right-0.5 -top-0.5 text-[7px] text-amber-500" aria-hidden>★</span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        Bir ayı düzenlemek için ay kartına dokunun — Aylık Düzenleme tam o ayda açılır. Bu özet,
        kaydedilmemiş seçimleriniz dâhil güncel planınızı gösterir.
      </p>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} aria-hidden />
      {label}
    </span>
  );
}
