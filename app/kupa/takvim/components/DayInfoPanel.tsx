"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useCalendarNames } from "../lib/useCalendarNames";
import { kupaBtnGhost } from "@/app/kupa/components/KupaShell";
import type { CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import { CUPPING_DAY_COLORS } from "../lib/cellState";

/**
 * WT6 — KAYITLI takvimin GÜN BİLGİSİ paneli (SALT OKUNUR).
 *
 * Görüntüleme modunda (Aylık + Yıllık) bir güne dokunmak düzenleme AÇMAZ ve hiçbir yazma isteği
 * göndermez; yalnız o günün kayıtlı bilgisini gösterir: hacamat günü mü, renk, kısa açıklama,
 * detay notu. Hiç düzenlenmemiş gün "kayıt yok" olarak görünür. Düzenleme yalnız açık
 * "Bu Ayı Düzenle" veya "Yeni Takvim → yıl/ay" akışındadır.
 */
export function DayInfoPanel({
  gregText,
  hijriText,
  info,
  onClose,
}: {
  gregText: string;
  hijriText: string;
  /** null → bu gün için kayıt yok. */
  info: { colorKey: CuppingDayColorKey | null; label: string | null; note: string | null } | null;
  onClose: () => void;
}) {
  const t = useTranslations("cupping.calendar");
  const tc = useTranslations("cupping.common");
  const names = useCalendarNames();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const color = info?.colorKey ? CUPPING_DAY_COLORS[info.colorKey] : null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("dayInfo.aria")}
        data-testid="kupa-day-info"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col overflow-y-auto rounded-t-2xl border border-amber-100 bg-white p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900">{t("dayInfo.title")}</h3>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">{gregText}</p>
            {hijriText ? <p className="text-xs text-slate-500">{t("hijriPrefix")} {hijriText}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc("close")}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <span aria-hidden className="text-lg leading-none">×</span>
          </button>
        </div>

        {info ? (
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t("dayInfo.status")}</dt>
              <dd className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                {t("dayInfo.marked")}
              </dd>
              {color ? (
                <dd className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span className={`h-3.5 w-3.5 rounded border ${color.swatch}`} aria-hidden />
                  {info.colorKey ? names.colorLabel(info.colorKey) : color.labelTr}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("dayInfo.label")}</dt>
              <dd className="mt-0.5 text-slate-800">{info.label?.trim() || <span className="text-slate-400">—</span>}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("dayInfo.note")}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-800">
                {info.note?.trim() || <span className="text-slate-400">—</span>}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
            {t("dayInfo.empty")}
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          {t.rich("dayInfo.readOnly", { b: (c) => <span className="font-bold">{c}</span> })}
        </p>
        <div className="mt-3 flex justify-end">
          <button type="button" className={`${kupaBtnGhost} min-h-[42px]`} onClick={onClose}>
            {tc("close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
