"use client";

/**
 * 2026-10-22 — Deklinasyon paralelleri seçici alanları: ay (UTC ayı), orb, gösterim saat dilimi. Düğüm türü Batı yöntem seçiminden
 * gelir. Sınırlar sunucuyla AYNI (declinationMonthOk, DECLINATION_ORB_OPTIONS). Gösterim saat dilimi istek gövdesine girmez.
 */

import type { ReactNode } from "react";
import { DECLINATION_ORB_DEFAULT, DECLINATION_ORB_OPTIONS, declinationMonthLabel, declinationMonthOk } from "@/lib/astrology/model/westernDeclination";
import type { TechniqueParams } from "../_lib/techniques";

const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";

export function DeclinationParallelsFields({ params, onParams, tzSelect }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void; tzSelect: ReactNode }) {
  const month = params.declinationMonth ?? params.lunarMonth;
  const orb = params.declinationOrb ?? DECLINATION_ORB_DEFAULT;
  const ok = declinationMonthOk(month);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid="astro-declination-params">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          Ay
          <input type="month" className={inp} value={month} min="1600-01" max="2600-12" onChange={(e) => onParams({ ...params, declinationMonth: e.target.value })} aria-label="Deklinasyon ayı" data-dp="month" />
        </label>
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          Orb
          <select className={inp} value={String(orb)} onChange={(e) => onParams({ ...params, declinationOrb: Number(e.target.value) })} aria-label="Deklinasyon orbu" data-dp="orb">
            {DECLINATION_ORB_OPTIONS.map((v) => (
              <option key={v} value={String(v)}>
                {String(v).replace(".", ",")}°{v === DECLINATION_ORB_DEFAULT ? " (varsayılan)" : ""}
              </option>
            ))}
          </select>
        </label>
        {tzSelect}
      </div>
      <span className={ok ? "text-slate-600" : "text-amber-800"} data-testid="astro-declination-month-note">
        {ok ? `${declinationMonthLabel(month)} · tek istek · ay sınırı UTC` : "Ayı 1600–2600 aralığında seçin."}
      </span>
      <span className="text-slate-500">
        Gökyüzü takvimi: iki gök cismi arasındaki paralel / kontraparalel temaslar; doğum verisi kullanılmaz. Orb, kesinleşmeden dönen temasların dahil edilme sınırıdır; farklı orb ayrı istektir.
      </span>
    </div>
  );
}
