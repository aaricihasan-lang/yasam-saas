"use client";

/**
 * 02.11.2026 — Transit Taraması (#646) seçici alanları: başlangıç / bitiş (en çok 1 yıl), tek orb (0,1–15°, varsayılan 1°), transit
 * gezegenler, natal noktalar, açılar, ek olaylar (istasyon, burç girişi) ve gösterim saat dilimi. Ay düğümü Batı yöntem seçiminden.
 * Sınırlar sunucuyla AYNI (model/westernTransitScan). En az bir gezegen / nokta / açı seçili kalır.
 */
import type { ReactNode } from "react";
import {
  TRANSIT_SCAN_ASPECTS,
  TRANSIT_SCAN_ASPECT_LABELS,
  TRANSIT_SCAN_BODIES,
  TRANSIT_SCAN_LABELS,
  TRANSIT_SCAN_ORB_DEFAULT,
  TRANSIT_SCAN_ORB_MAX,
  TRANSIT_SCAN_ORB_MIN,
  TRANSIT_SCAN_POINTS,
  transitScanRangeIssue,
} from "@/lib/astrology/model/westernTransitScan";
import { addDaysIso } from "@/lib/astrology/transitDetail";
import type { TechniqueParams } from "../_lib/techniques";

const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
const chip = (on: boolean) =>
  `min-h-[32px] rounded-full border px-2.5 text-[12px] font-semibold ${on ? "border-[#6f55c9]/45 bg-[#efeafd] text-[#5a42b0]" : "border-slate-200 bg-white text-slate-600"}`;

function Chips<T extends string>({ label, all, value, labels, onChange }: { label: string; all: readonly T[]; value: T[]; labels: Readonly<Record<string, string>>; onChange: (v: T[]) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-semibold text-slate-700">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label={label}>
        {all.map((x) => {
          const on = value.includes(x);
          return (
            <button
              key={x}
              type="button"
              aria-pressed={on}
              // Son seçili öğe kaldırılamaz (en az biri gerekli).
              onClick={() => (on ? value.length > 1 && onChange(value.filter((y) => y !== x)) : onChange(all.filter((y) => y === x || value.includes(y))))}
              className={chip(on)}
            >
              {labels[x] ?? x}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TransitScanFields({ params, onParams, tzSelect }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void; tzSelect: ReactNode }) {
  const start = params.scanStart ?? params.forecastStart;
  const end = params.scanEnd ?? addDaysIso(start, 91) ?? start;
  const orb = params.scanOrb ?? TRANSIT_SCAN_ORB_DEFAULT;
  const issue = transitScanRangeIssue(start, end);
  const set = (patch: Partial<TechniqueParams>) => onParams({ ...params, ...patch });
  return (
    <div className="flex min-w-0 flex-col gap-2.5 text-xs" data-testid="astro-transit-scan-params">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          Başlangıç
          <input type="date" className={inp} value={start} min="1900-01-01" max="2099-12-31" onChange={(e) => set({ scanStart: e.target.value })} aria-label="Tarama başlangıcı" data-ts="start" />
        </label>
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          Bitiş
          <input type="date" className={inp} value={end} min="1900-01-01" max="2099-12-31" onChange={(e) => set({ scanEnd: e.target.value })} aria-label="Tarama bitişi" data-ts="end" />
        </label>
        {tzSelect}
      </div>
      <span className={issue ? "text-amber-800" : "text-slate-600"} data-testid="astro-transit-scan-range-note">
        {issue ? `Aralık: ${issue}.` : "Tarama aralığı en çok 1 yıl; bitiş günü dahil."}
      </span>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold text-slate-700">Orb (tüm açılar için tek değer)</span>
        <span className="flex min-w-0 items-center gap-2">
          <input
            type="range"
            min={TRANSIT_SCAN_ORB_MIN}
            max={TRANSIT_SCAN_ORB_MAX}
            step={0.1}
            value={orb}
            onChange={(e) => set({ scanOrb: Math.round(Number(e.target.value) * 10) / 10 })}
            className="min-w-0 flex-1 accent-[#b8913b]"
            aria-label="Orb"
            data-ts="orb"
          />
          <output className="min-w-[48px] text-right text-sm font-bold tabular-nums text-slate-800">{String(orb).replace(".", ",")}°</output>
        </span>
      </label>
      <Chips label="Transit gezegenler" all={TRANSIT_SCAN_BODIES} value={params.scanBodies ?? [...TRANSIT_SCAN_BODIES]} labels={TRANSIT_SCAN_LABELS} onChange={(v) => set({ scanBodies: v })} />
      <Chips label="Natal noktalar" all={TRANSIT_SCAN_POINTS} value={params.scanPoints ?? [...TRANSIT_SCAN_POINTS]} labels={TRANSIT_SCAN_LABELS} onChange={(v) => set({ scanPoints: v })} />
      <Chips label="Açılar" all={TRANSIT_SCAN_ASPECTS} value={params.scanAspects ?? [...TRANSIT_SCAN_ASPECTS]} labels={TRANSIT_SCAN_ASPECT_LABELS} onChange={(v) => set({ scanAspects: v })} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold text-slate-700">Ek olaylar</span>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <button type="button" aria-pressed={params.scanStations ?? true} onClick={() => set({ scanStations: !(params.scanStations ?? true) })} className={chip(params.scanStations ?? true)}>
            İstasyonlar
          </button>
          <button type="button" aria-pressed={params.scanIngresses ?? true} onClick={() => set({ scanIngresses: !(params.scanIngresses ?? true) })} className={chip(params.scanIngresses ?? true)}>
            Burç girişleri
          </button>
        </div>
      </div>
      <span className="text-slate-500">Natal noktalar mevcut natal sonucundan alınır (önbellekteyse ek hesaplama isteği ve kredi yok); tarama Yaşam Sistemi yerel hesabıdır. Belirsizlik 1 saati aşarsa saat yerine tarih (≈) gösterilir.</span>
    </div>
  );
}
