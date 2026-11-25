"use client";

/**
 * 2026-10-22 — KP ruling planets zaman taraması seçici alanları: süre + adım (+ an sayısı). Başlangıç anı ve gözlem yeri KP ortak
 * alanlarından gelir (TechniqueSelector). Sınırlar sunucuyla AYNI (kpIntervalWindowOk): ≤ 24 saat, ≤ 121 an, süre adımın katı.
 */

import { useTranslations } from "next-intl";
import { KP_RI_DEFAULT, KP_RI_STEPS, kpIntervalWindowOk } from "@/lib/astrology/model/kpRulingInterval";
import type { TechniqueParams } from "../_lib/techniques";

const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
/** Süre seçenekleri (dakika; kanonik değer). Etiket: < 60 → dakika, aksi halde saat. */
const DURATIONS = [30, 60, 120, 180, 360, 720, 1440] as const;

export function KpRulingIntervalFields({ params, onParams }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void }) {
  const t = useTranslations("atlas.kp");
  const d = params.kpRiDuration ?? KP_RI_DEFAULT.durationMinutes;
  const iv = params.kpRiInterval ?? KP_RI_DEFAULT.intervalMinutes;
  const ok = kpIntervalWindowOk(d, iv);
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2" data-testid="astro-kp-ri-params">
      <legend className="px-1 text-[11px] font-semibold text-slate-700">{t("fields.legend")}</legend>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          {t("fields.duration")}
          <select className={inp} value={d} onChange={(e) => onParams({ ...params, kpRiDuration: Number(e.target.value) })} aria-label={t("fields.durationAria")} data-kp-ri="duration">
            {DURATIONS.map((v) => (
              <option key={v} value={v}>
                {v < 60 ? t("fields.minutes", { n: String(v) }) : t("fields.hours", { n: String(v / 60) })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          {t("fields.step")}
          <select className={inp} value={iv} onChange={(e) => onParams({ ...params, kpRiInterval: Number(e.target.value) })} aria-label={t("fields.stepAria")} data-kp-ri="interval">
            {KP_RI_STEPS.map((v) => (
              <option key={v} value={v}>
                {t("fields.minutes", { n: String(v) })}
              </option>
            ))}
          </select>
        </label>
        <span className={ok ? "text-slate-600" : "text-amber-800"} data-testid="astro-kp-ri-count">
          {ok ? t("fields.count", { n: String(d / iv + 1) }) : t("fields.tooMany")}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-slate-600">{t("interval.methodNote")}</p>
      <p className="text-[11px] text-slate-500">{t("fields.dstNote")}</p>
    </fieldset>
  );
}
