"use client";

import { useMemo } from "react";
import { monthHijriCells } from "@/lib/cupping/hijri";
import type { CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import {
  getCuppingCellState,
  CUPPING_CELL_PALETTE,
  CUPPING_DAY_COLORS,
  cuppingCellBadge,
  type CuppingCellKind,
} from "../lib/cellState";
import { WEEKDAYS_TR, isoWeekday } from "../lib/bulk";

/**
 * FAZ 5 / AŞAMA 3 + 5 — Aylık takvim (Gregoryen + Hicrî HER GÜN, TAM ay adı; PASTEL durumlar
 *   + UZMAN-TANIMLI renk/kısa açıklama). İKİ SUNUM, TEK VERİ.
 *
 * RESPONSIVE (owner FINAL): AYNI plan/taslak/tarih kaynağının iki sunumu vardır —
 *   • ≥1024px (lg+): klasik 7 sütunlu aylık ızgara (masaüstü; DEĞİŞMEDİ).
 *   • <1024px (mobil/tablet): kronolojik GÜN KARTLARI (360–430px 2 sütun, 320px tek sütun,
 *     tablet 3 sütun). Yedi dar sütun telefona ZORLANMAZ. İkinci takvim motoru/veri YOK.
 * TAM HİCRÎ AD: Hiçbir kısaltma YOK; kelimeler HARF HARF bölünmez (break-words, word-sınırı).
 *   Hicrî değer lib/cupping/hijri.ts üzerinden TÜRETİLİR (saklanmaz). Hücre başına API çağrısı YOK.
 *
 * DURUM (renk + rozet): getCuppingCellState TEK doğruluk kaynağıdır (Yıllık Özet ile AYNI).
 *   Yeni günde RENK ZORUNLUDUR; kısa açıklama opsiyoneldir; renk anlamı platformca sabitlenmez.
 *   Kaydedilmiş günlerde "SEÇİLİ" YAZISI GÖSTERİLMEZ — seçim renk + kenarlık + aria-pressed +
 *   ekran-okuyucu ile ifade edilir (renk TEK sinyal değildir).
 * TIKLAMA: gün kutusuna/kartına tek tık PANELİ AÇAR (boş gün → renkle EKLE; seçili gün → DÜZENLE).
 *   Sıradan tık seçimi ASLA yanlışlıkla KALDIRMAZ; kaldırma yalnız panelin "Gün Seçimini Kaldır" ile.
 */

/** Bir günün mevcut stili (renk + kısa açıklama) — taslaktan türetilir. */
export type CuppingDayStyleView = { colorKey: CuppingDayColorKey | null; label: string | null };

/** Bir günün türetilmiş görünüm verisi (masaüstü ızgara + mobil kart AYNI kaynağı paylaşır). */
type DerivedDay = {
  ymd: string;
  isSel: boolean;
  isToday: boolean;
  state: { kind: CuppingCellKind };
  gDay: number;
  weekdayLong: string;
  hijriDay: number;
  hijriMonthName: string;
  hijriYear: number;
  label: string | null;
  badge: string | null;
  colored: boolean;
  cellCls: string;
  gregCls: string;
  hijriCls: string;
  dashed: boolean;
  aria: string;
};

export function MonthCalendar({
  year,
  month,
  selected,
  saved,
  today,
  styleOf,
  onEditDay,
}: {
  year: number;
  month: number; // 1–12
  selected: Set<string>;
  /** ymd kümesi — sunucuda KAYITLI günler. Bekleyen ekleme/kaldırma kararında kullanılır. */
  saved: Set<string>;
  today: string | null; // "YYYY-MM-DD"
  /** Bir günün taslak stili (renk + kısa açıklama). Yoksa renk/açıklama yok. */
  styleOf: (ymd: string) => CuppingDayStyleView | undefined;
  /** Gün panelini aç: boş gün → renkle EKLE; seçili gün → DÜZENLE. Seçimi DEĞİŞTİRMEZ. */
  onEditDay: (ymd: string) => void;
}) {
  const cells = useMemo(() => monthHijriCells(year, month), [year, month]);
  // Ayın ilk günü hangi ISO haftagününe düşüyor → ızgarada baştaki boş hücre sayısı (Pzt-başlangıç).
  const leading = cells.length > 0 ? isoWeekday(cells[0].gregorian) - 1 : 0;

  // TEK türetme — hem masaüstü ızgara hem mobil kartlar bunu kullanır (durum/renk bir kez hesaplanır).
  const days: DerivedDay[] = useMemo(
    () =>
      cells.map((cell) => {
        const ymd = cell.gregorian;
        const isSel = selected.has(ymd);
        const state = getCuppingCellState(isSel, saved.has(ymd));
        const isToday = today === ymd;
        const gDay = Number(ymd.slice(8, 10));

        // Renk yalnız SEÇİLİ günlerde (kayıtlı veya kaydedilecek) uygulanır; kaldırılacak gün nötr.
        const dayStyle = styleOf(ymd);
        const colorKey = dayStyle?.colorKey ?? null;
        const colored =
          colorKey !== null && (state.kind === "selected_saved" || state.kind === "selected_pending_add");
        const colorDef = colored ? CUPPING_DAY_COLORS[colorKey] : null;
        const palette = CUPPING_CELL_PALETTE[state.kind];

        const label = isSel ? dayStyle?.label ?? null : null;
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
        const labelWord = label ? ` — ${label}` : "";

        return {
          ymd,
          isSel,
          isToday,
          state,
          gDay,
          weekdayLong: WEEKDAYS_TR[isoWeekday(ymd) - 1]?.long ?? "",
          hijriDay: cell.hijri.day,
          hijriMonthName: cell.hijri.monthName,
          hijriYear: cell.hijri.year,
          label,
          badge: cuppingCellBadge(state.kind),
          colored,
          cellCls: colorDef ? colorDef.cell : palette.cell,
          gregCls: colorDef ? colorDef.greg : palette.greg,
          hijriCls: colorDef ? colorDef.hijri : palette.hijri,
          dashed: state.kind === "selected_pending_add",
          aria: `${gDay} ${MONTHS_TR[month - 1]} ${year} — Hicrî ${fullHijri}${statusWord}${colorWord}${labelWord}`,
        };
      }),
    [cells, selected, saved, today, styleOf, month, year],
  );

  return (
    <div>
      {/* ═══ MASAÜSTÜ (≥lg): klasik 7 sütunlu ızgara — DEĞİŞMEDİ ═══ */}
      <div className="hidden lg:block">
        {/* Haftagünü başlıkları (Pzt→Paz) */}
        <div className="grid grid-cols-7 gap-1.5" role="row">
          {WEEKDAYS_TR.map((w) => (
            <div
              key={w.iso}
              className="pb-1 text-center text-xs font-bold uppercase tracking-wide text-slate-400"
              aria-hidden
            >
              {w.short}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: leading }).map((_, i) => (
            <div key={`blank-${i}`} aria-hidden />
          ))}
          {days.map((d) => (
            <div key={d.ymd} className="relative">
              <button
                type="button"
                onClick={() => onEditDay(d.ymd)}
                aria-pressed={d.isSel}
                aria-label={d.aria}
                title={d.aria}
                className={[
                  "group flex min-h-[76px] w-full flex-col items-center justify-start gap-0.5 rounded-lg border px-0.5 py-1 text-center outline-none transition",
                  "focus-visible:ring-2 focus-visible:ring-amber-400/70",
                  d.cellCls,
                  d.dashed ? "border-dashed" : "",
                  d.isToday && !d.isSel ? "ring-1 ring-inset ring-slate-300" : "",
                ].join(" ")}
              >
                <span className={["text-base font-bold leading-none", d.gregCls].join(" ")}>{d.gDay}</span>
                {/* TAM Hicrî tarih (kısaltma YOK; kelime bölünmez). */}
                <span className={["text-[10px] leading-tight break-words", d.hijriCls].join(" ")}>
                  {d.hijriDay} {d.hijriMonthName} {d.hijriYear}
                </span>
                {d.state.kind === "selected_pending_add" ? (
                  <span className="rounded border border-dashed border-indigo-400 px-1 text-[8px] font-bold uppercase leading-tight text-indigo-600" aria-hidden>
                    Kaydedilecek
                  </span>
                ) : d.state.kind === "pending_remove" ? (
                  <span className="text-[8px] font-medium leading-none text-slate-400" aria-hidden>
                    Kaldırılacak
                  </span>
                ) : null}
                {d.label ? (
                  <span className="line-clamp-2 w-full px-0.5 text-[10px] font-medium leading-tight text-slate-600 break-words" aria-hidden>
                    {d.label}
                  </span>
                ) : null}
                {d.badge ? <span className="sr-only">{d.badge}</span> : null}
              </button>

              {/* "Düzenle" kalem simgesi — YALNIZ seçili günde (seçim durumunu DEĞİŞTİRMEZ). */}
              {d.isSel ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditDay(d.ymd);
                  }}
                  aria-label={`${d.gDay} ${MONTHS_TR[month - 1]} — günü düzenle (renk ve açıklama)`}
                  title="Günü düzenle"
                  className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-[10px] leading-none text-slate-500 shadow-sm outline-none transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 focus-visible:ring-2 focus-visible:ring-amber-400/70"
                >
                  <span aria-hidden>✎</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ MOBİL + TABLET (<lg): kronolojik GÜN KARTLARI (aynı veri; rahat okunur) ═══ */}
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 md:grid-cols-3 lg:hidden">
        {days.map((d) => (
          <button
            key={d.ymd}
            type="button"
            onClick={() => onEditDay(d.ymd)}
            aria-pressed={d.isSel}
            aria-label={d.aria}
            className={[
              "flex min-h-[76px] w-full flex-col items-start gap-0.5 rounded-xl border p-3 text-left outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-amber-400/70",
              d.cellCls,
              d.dashed ? "border-dashed" : "",
              d.isToday && !d.isSel ? "ring-1 ring-inset ring-slate-300" : "",
            ].join(" ")}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className={["text-[11px] font-bold uppercase tracking-wide", d.hijriCls].join(" ")}>
                {d.weekdayLong}
              </span>
              {/* Düzenle/ekle görsel ipucu (aria-hidden; tüm kart zaten buton). */}
              <span aria-hidden className="text-xs text-slate-400">
                {d.isSel ? "✎" : "+"}
              </span>
            </span>
            <span className={["text-sm font-black leading-tight", d.gregCls].join(" ")}>
              {d.gDay} {MONTHS_TR[month - 1]} {year}
            </span>
            {/* TAM Hicrî tarih — kelime sınırında sarar, HARF HARF bölünmez. */}
            <span className={["text-xs leading-snug break-words", d.hijriCls].join(" ")}>
              {d.hijriDay} {d.hijriMonthName} {d.hijriYear}
            </span>
            {d.state.kind === "selected_pending_add" ? (
              <span className="mt-0.5 rounded border border-dashed border-indigo-400 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-tight text-indigo-600" aria-hidden>
                Kaydedilecek
              </span>
            ) : d.state.kind === "pending_remove" ? (
              <span className="mt-0.5 text-[10px] font-semibold leading-none text-slate-400" aria-hidden>
                Kaldırılacak
              </span>
            ) : null}
            {d.label ? (
              <span className="mt-0.5 line-clamp-2 w-full text-xs font-medium leading-snug text-slate-600 break-words" aria-hidden>
                {d.label}
              </span>
            ) : null}
            {d.badge ? <span className="sr-only">{d.badge}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Gregoryen ay adları (a11y etiketi için; nötr). */
export const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;
