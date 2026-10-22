"use client";

/**
 * 2026-10-22 — KP ruling planets zaman taraması seçici alanları: süre + adım (+ an sayısı). Başlangıç anı ve gözlem yeri KP ortak
 * alanlarından gelir (TechniqueSelector). Sınırlar sunucuyla AYNI (kpIntervalWindowOk): ≤ 24 saat, ≤ 121 an, süre adımın katı.
 */

import { KP_RI_DEFAULT, KP_RI_METHOD_NOTE, KP_RI_STEPS, kpIntervalWindowOk } from "@/lib/astrology/model/kpRulingInterval";
import type { TechniqueParams } from "../_lib/techniques";

const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
const DURATIONS: [number, string][] = [
  [30, "30 dk"],
  [60, "1 saat"],
  [120, "2 saat"],
  [180, "3 saat"],
  [360, "6 saat"],
  [720, "12 saat"],
  [1440, "24 saat"],
];

export function KpRulingIntervalFields({ params, onParams }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void }) {
  const d = params.kpRiDuration ?? KP_RI_DEFAULT.durationMinutes;
  const iv = params.kpRiInterval ?? KP_RI_DEFAULT.intervalMinutes;
  const ok = kpIntervalWindowOk(d, iv);
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2" data-testid="astro-kp-ri-params">
      <legend className="px-1 text-[11px] font-semibold text-slate-700">Tarama penceresi (başlangıç = yukarıdaki an)</legend>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          Süre
          <select className={inp} value={d} onChange={(e) => onParams({ ...params, kpRiDuration: Number(e.target.value) })} aria-label="Tarama süresi" data-kp-ri="duration">
            {DURATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          Adım
          <select className={inp} value={iv} onChange={(e) => onParams({ ...params, kpRiInterval: Number(e.target.value) })} aria-label="Tarama adımı" data-kp-ri="interval">
            {KP_RI_STEPS.map((v) => (
              <option key={v} value={v}>
                {v} dk
              </option>
            ))}
          </select>
        </label>
        <span className={ok ? "text-slate-600" : "text-amber-800"} data-testid="astro-kp-ri-count">
          {ok ? `${d / iv + 1} an · tek istek` : "en çok 121 an (süre / adım) — adımı büyütün"}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-slate-600">{KP_RI_METHOD_NOTE}</p>
      <p className="text-[11px] text-slate-500">Pencere içinde gözlem yerinin saat ofseti değişirse (yaz/kış saati) hesap yapılmaz.</p>
    </fieldset>
  );
}
