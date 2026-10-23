"use client";

/**
 * 2026-10-22 — Vedik aylık zamanlama seçici alanları: ay (UTC takvim ayı), bölümler (her bölüm ayrı istek / önbellek satırı) ve
 * gösterim saat dilimi (yalnız gösterim; isteğe / önbellek anahtarına girmez). Ayanamsa sabit Lahiri — ortak Vedik ayanamsa
 * seçimi bu teknikte kullanılmaz. Sınırlar sunucuyla AYNI (vedicMonthOk, vedicMonthlySectionsOf).
 */

import { VEDIC_MONTHLY_DEFAULT_SECTIONS, VEDIC_MONTHLY_SECTION_LABELS, VEDIC_MONTHLY_SECTIONS, VEDIC_MONTHLY_YEAR_MAX, VEDIC_MONTHLY_YEAR_MIN, vedicMonthOk, type VedicMonthlySection } from "@/lib/astrology/model/vedicMonthly";
import { vedicMonthlyYm, type TechniqueParams } from "../_lib/techniques";

const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
const TZ = ["Europe/Istanbul", "UTC", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Dubai", "Asia/Kolkata"];
const p2 = (n: number) => String(n).padStart(2, "0");

export function VedicMonthlyFields({ params, onParams }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void }) {
  const { year, month } = vedicMonthlyYm(params);
  const ok = vedicMonthOk(year, month);
  const sections = params.vedicMonthlySections ?? [...VEDIC_MONTHLY_DEFAULT_SECTIONS];
  const tz = params.vedicMonthlyTz ?? "Europe/Istanbul";
  const setYm = (y: number, m: number) => onParams({ ...params, vedicMonthlyYear: y, vedicMonthlyMonth: m });
  const shift = (d: number) => {
    const idx = year * 12 + (month - 1) + d;
    setYm(Math.floor(idx / 12), (idx % 12) + 1);
  };
  const toggle = (s: VedicMonthlySection) => onParams({ ...params, vedicMonthlySections: sections.includes(s) ? sections.filter((x) => x !== s) : VEDIC_MONTHLY_SECTIONS.filter((x) => x === s || sections.includes(x)) });
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2 text-xs" data-testid="astro-vm-params">
      <legend className="px-1 text-[11px] font-semibold text-slate-700">Takvim ayı ve bölümler</legend>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" className="rounded border border-slate-300 px-2 py-1" onClick={() => shift(-1)} aria-label="Önceki ay" data-vm="prev">
          ‹
        </button>
        <input
          type="month"
          className={inp}
          value={ok ? `${String(year).padStart(4, "0")}-${p2(month)}` : ""}
          min={`${VEDIC_MONTHLY_YEAR_MIN}-01`}
          max={`${VEDIC_MONTHLY_YEAR_MAX}-12`}
          onChange={(e) => {
            const m = /^(\d{4})-(\d{2})$/.exec(e.target.value);
            if (m) setYm(Number(m[1]), Number(m[2]));
          }}
          aria-label="Takvim ayı"
          data-vm="month"
        />
        <button type="button" className="rounded border border-slate-300 px-2 py-1" onClick={() => shift(1)} aria-label="Sonraki ay" data-vm="next">
          ›
        </button>
        <label className="flex min-w-0 flex-wrap items-center gap-1.5">
          Gösterim saat dilimi
          <select className={inp} value={tz} onChange={(e) => onParams({ ...params, vedicMonthlyTz: e.target.value })} aria-label="Aylık takvim gösterim saat dilimi" data-vm="tz">
            {[...new Set([tz, ...TZ])].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!ok && <p className="text-amber-800">Takvim ayı {VEDIC_MONTHLY_YEAR_MIN}–{VEDIC_MONTHLY_YEAR_MAX} aralığında olmalıdır.</p>}
      <div className="flex min-w-0 flex-col gap-1" role="group" aria-label="Aylık takvim bölümleri">
        {VEDIC_MONTHLY_SECTIONS.map((s) => (
          <label key={s} className="flex min-w-0 items-start gap-1.5">
            <input type="checkbox" checked={sections.includes(s)} onChange={() => toggle(s)} data-vm-section={s} className="mt-0.5" />
            <span className="min-w-0 break-words">
              {VEDIC_MONTHLY_SECTION_LABELS[s]}
              {s === "natal_parallels" && <span className="text-slate-500"> — danışanın doğum anı; doğum saati gerekir</span>}
            </span>
          </label>
        ))}
      </div>
      <p className="text-slate-500" data-testid="astro-vm-request-note">
        {sections.length === 0 ? "En az bir bölüm seçin." : `Her bölüm ayrı hesap ve kayıttır (en çok ${sections.length} istek; aynı ay daha önce hesaplandıysa yeni istek yok).`} Ayanamsa: Lahiri (sabit). Pencere UTC takvim ayıdır; saat dilimi yalnız gösterimi değiştirir.
      </p>
      <p className="text-slate-500">Açılar astronomik açılardır (boylam farkı); geleneksel graha drishti için “Graha Drishti” tekniğini kullanın.</p>
    </fieldset>
  );
}
