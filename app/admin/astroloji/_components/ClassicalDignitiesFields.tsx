"use client";

/**
 * 02.11.2026 — Klasik Asalet ve Almuten (#644) seçici alanları: ekol (varsayılan Lilly 1647 · Dorothean) ve ev başı almutenleri için
 * ev sistemi (varsayılan: Natal'ın ev sistemi seçimi; 8 sistem). Ay düğümü Batı yöntem seçiminden gelir. Sunucu yeniden doğrular.
 */
import { DIGNITY_SCHOOL_HINTS, DIGNITY_SCHOOL_IDS, DIGNITY_SCHOOL_LABELS } from "@/lib/astrology/model/westernClassicalDignities";
import { NATAL_HOUSE_SYSTEM_OPTIONS, type NatalHouseSystemOption } from "@/lib/astrology/model/natalHouseSystems";
import { NATAL_HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";
import type { TechniqueParams } from "../_lib/techniques";

const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";

export function ClassicalDignitiesFields({ params, onParams, natalHouseSystem }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void; natalHouseSystem: NatalHouseSystemOption }) {
  const school = params.dignitySchool ?? "lilly-1647";
  const hs = params.dignityHouseSystem ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs" data-testid="astro-dignities-params">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold text-slate-700">Ekol</span>
        <div className="inline-flex max-w-full gap-1 rounded-xl border border-slate-200 bg-[#f6f2fb] p-1" role="group" aria-label="Ekol">
          {DIGNITY_SCHOOL_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={school === id}
              onClick={() => onParams({ ...params, dignitySchool: id })}
              className={`min-h-[36px] min-w-0 flex-1 rounded-lg px-3 text-[12.5px] font-semibold ${school === id ? "bg-white text-[#211c3d] shadow-sm" : "text-[#4a4566]"}`}
              data-dignity-school={id}
            >
              {DIGNITY_SCHOOL_LABELS[id]}
              {id === "lilly-1647" ? " (varsayılan)" : ""}
            </button>
          ))}
        </div>
        <span className="text-slate-500">{DIGNITY_SCHOOL_HINTS[school]}</span>
      </div>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold text-slate-700">Ev sistemi (ev başı almutenleri ve arızi asalet)</span>
        <select
          className={inp}
          value={hs ?? ""}
          onChange={(e) => onParams({ ...params, dignityHouseSystem: e.target.value === "" ? null : (e.target.value as NatalHouseSystemOption) })}
          aria-label="Klasik asalet ev sistemi"
          data-dp="dignity-house"
        >
          <option value="">Natal ev sistemi ({NATAL_HOUSE_SYSTEM_LABELS[natalHouseSystem] ?? natalHouseSystem})</option>
          {NATAL_HOUSE_SYSTEM_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {NATAL_HOUSE_SYSTEM_LABELS[h] ?? h}
            </option>
          ))}
        </select>
      </label>
      <span className="text-slate-500">Konumlar mevcut natal sonucundan alınır (önbellekteyse ek hesaplama isteği ve kredi yok); asalet, kabul ve almuten Yaşam Sistemi yerel hesabıdır.</span>
    </div>
  );
}
