"use client";

// Design | Personality gezegen sütunu — SALT SUNUM.
//
// Silinmiş FAZ 10B `PlanetColumns.tsx`'in (6425ab0c) güncel mimariye uyarlanmış eşdeğeri:
//   • girdi `HdComputedChart.activations` (dahili motor + RoxyAPI kayıtları)
//   • mevcut `planetGlyphs.ts` sözlüğü (sıra/glif/Türkçe ad) yeniden kullanılır
//   • açık tema (Kayıtlı Haritalar modalı beyaz zeminli); Design = kırmızı, Personality = koyu
//     (BodyGraph konvansiyonu ile birebir)
// Hesaplama YOK; yalnız gate.line gösterimi.

import { HD_PLANET_ORDER, PLANET_GLYPH, PLANET_LABEL_TR } from "@/lib/human-design/bodygraph/planetGlyphs";
import type { HdComputedActivation } from "@/lib/human-design/chart/computedChart";

// ⊕ (Earth) / ☊ ☋ (Nodes) bazı fontlarda eksik → sembol font-stack.
const SYMBOL_FONT = '"Segoe UI Symbol", "Noto Sans Symbols2", "Apple Symbols", sans-serif';

const THEME = {
  design: {
    title: "Design",
    subtitle: "Bilinçdışı",
    titleCls: "text-rose-700",
    glyphCls: "text-rose-600",
    boxCls: "border-rose-200 bg-rose-50 text-rose-800",
  },
  personality: {
    title: "Personality",
    subtitle: "Bilinçli",
    titleCls: "text-slate-900",
    glyphCls: "text-slate-700",
    boxCls: "border-slate-300 bg-slate-50 text-slate-900",
  },
} as const;

export function HdPlanetColumn({
  activations,
  side,
}: {
  activations: ReadonlyArray<HdComputedActivation>;
  side: "design" | "personality";
}) {
  const t = THEME[side];
  // Personality sağda → aynalanır (glif dış kenarda, gate.line grafiğe yakın).
  const mirror = side === "personality";
  const bySide = new Map(activations.filter((a) => a.side === side).map((a) => [a.body, a]));
  const rows = HD_PLANET_ORDER.map((b) => bySide.get(b)).filter((a): a is HdComputedActivation => Boolean(a));

  return (
    <div role="group" aria-label={`${t.title} (${t.subtitle}) gezegen aktivasyonları`} className="w-full" data-hd-side={side}>
      <p className={`text-center text-[11px] font-black uppercase tracking-[0.18em] ${t.titleCls}`}>{t.title}</p>
      <p className="mb-2 text-center text-[10px] font-semibold text-slate-500">{t.subtitle}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map((a) => (
          <li
            key={a.body}
            data-hd-activation={`${side}:${a.body}:${a.gate}.${a.line}`}
            className={`flex h-8 items-center justify-between gap-1.5 ${mirror ? "flex-row-reverse" : ""}`}
            aria-label={`${PLANET_LABEL_TR[a.body]}: kapı ${a.gate}, çizgi ${a.line}`}
            title={PLANET_LABEL_TR[a.body]}
          >
            <span aria-hidden className={`w-6 shrink-0 text-center text-base leading-none ${t.glyphCls}`} style={{ fontFamily: SYMBOL_FONT }}>
              {PLANET_GLYPH[a.body]}
            </span>
            <span className={`inline-flex min-w-[3.4rem] items-center justify-center rounded-lg border px-2 py-1 text-[13px] font-black tabular-nums ${t.boxCls}`}>
              {a.gate}.{a.line}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
