"use client";

// FAZ 10B / ADIM 2 — Gezegen sütunu (Design | Personality). SALT SUNUM.
//
// result.activations'ı `side`'a göre filtreler + HD_PLANET_ORDER ile sıralar.
// Gösterim: gezegen glifi + Gate.Line.  color / tone / base YOK (kapsam dışı).
// BodyGraph.tsx / layout.ts / engine / compute / API — HİÇBİRİNE dokunmaz.
//
// Henüz dashboard'a bağlı DEĞİL (10B-3'te yerleştirilecek). Hesaplama YOK.

import {
  HD_PLANET_ORDER,
  PLANET_GLYPH,
  PLANET_LABEL_TR,
} from "@/lib/human-design/bodygraph/planetGlyphs";
import type { ActivationSide } from "@/lib/human-design/engine/chart-activations";
import type { HdChartResult } from "@/lib/human-design/engine/contract";

// ⊕ (Earth) / ☊ ☋ (Nodes) bazı fontlarda eksik → sembol font-stack ile güvenceye al.
const SYMBOL_FONT =
  '"Segoe UI Symbol", "Noto Sans Symbols2", "Apple Symbols", sans-serif';

type SideTheme = {
  kicker: string;
  labelCls: string;
  glyphCls: string;
  boxCls: string;
};

// Design = kırmızı, Personality = koyu (BodyGraph konvansiyonuyla birebir).
const THEME: Record<ActivationSide, SideTheme> = {
  design: {
    kicker: "Design",
    labelCls: "text-rose-300",
    glyphCls: "text-rose-300",
    boxCls: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  },
  personality: {
    kicker: "Personality",
    labelCls: "text-slate-100",
    glyphCls: "text-slate-200",
    boxCls: "border-white/15 bg-white/[0.06] text-slate-100",
  },
};

export function PlanetColumns({
  result,
  side,
}: {
  result: HdChartResult;
  side: ActivationSide;
}) {
  const theme = THEME[side];
  // Personality sütunu sağda → aynalanır (glif dış kenara, Gate.Line grafiğe yakın).
  const mirror = side === "personality";

  const bySide = new Map(
    result.activations.filter((a) => a.side === side).map((a) => [a.body, a]),
  );
  const rows = HD_PLANET_ORDER.map((body) => bySide.get(body)).filter(
    (a): a is NonNullable<typeof a> => Boolean(a),
  );

  return (
    <div
      className="flex w-full flex-col gap-1.5"
      role="group"
      aria-label={`${theme.kicker} gezegen aktivasyonları`}
    >
      <p
        className={`mb-2 text-center text-xs font-black uppercase tracking-[0.2em] ${theme.labelCls}`}
      >
        {theme.kicker}
      </p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((a) => (
          <li
            key={a.body}
            className={`flex h-9 items-center justify-between ${mirror ? "flex-row-reverse" : ""}`}
            aria-label={`${PLANET_LABEL_TR[a.body]}: kapı ${a.gate}, çizgi ${a.line}`}
          >
            <span
              aria-hidden
              className={`w-6 shrink-0 text-center text-lg leading-none ${theme.glyphCls}`}
              style={{ fontFamily: SYMBOL_FONT }}
            >
              {PLANET_GLYPH[a.body]}
            </span>
            <span
              className={`inline-flex min-w-[3.5rem] items-center justify-center rounded-lg border px-2.5 py-1.5 text-sm font-black tabular-nums ${theme.boxCls}`}
            >
              {a.gate}.{a.line}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
