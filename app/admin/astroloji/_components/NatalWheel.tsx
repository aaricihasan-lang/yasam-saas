"use client";

/**
 * Natal çark — Yaşam Sistemi'nin KENDİ SVG çizimi (sağlayıcı-bağımsız; yalnız kanonik teknik
 * veriyi kullanır). Roxy UI bileşeni KULLANILMAZ (lisans/sürüm bağımlılığı yok; ileride başka
 * hesap motoru da aynı çarkı besler).
 *
 * Yerleşim: Yükselen solda (9 yönü), boylam saat yönünün TERSİNE artar (astrolojik standart).
 * Saat bilinmiyorsa (angles=null) 0° Koç solda, evler çizilmez.
 *
 * Ekran tipografisi (yalnız görünüm): glifler büyük; gezegen derecesi + dakikası tablolarla AYNI biçimlendiriciyle
 * (formatDegree: dakika kesilir) iki satırda. Yarıçaplar ve glif itme aralığı rapor çarkıyla (report/wheelSvg) aynıdır.
 */

import type { AspectNature, AspectType, BodyId, NatalHouse, SignId } from "@/lib/astrology/model/western";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { BODY_GLYPHS, BODY_LABELS, formatDegree, SIGN_ELEMENT, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";

const SIZE = 604;
const C = SIZE / 2;
const R_OUT = 272;
const R_SIGN_IN = 238;
const R_GLYPH = 212;
const R_DEG = 190;
const R_HOUSE_NUM = 136;
const R_ASPECT = 122;

const ELEMENT_COLOR: Record<string, string> = {
  fire: "#dc2626",
  earth: "#15803d",
  air: "#ca8a04",
  water: "#2563eb",
};

/** Aydınlık masa (tinted): burç bandı için soluk element tonları (yalnız zemin rengi). */
const ELEMENT_TINT: Record<string, string> = {
  fire: "#fde8e8",
  earth: "#e3f5e8",
  air: "#fbf3d0",
  water: "#e1ecfb",
};

const NATURE_COLOR: Record<string, string> = {
  harmonious: "#2563eb",
  challenging: "#dc2626",
  neutral: "#64748b",
};

const MAJOR = new Set(["conjunction", "opposition", "trine", "square", "sextile"]);

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Çarkın ihtiyaç duyduğu en küçük harita biçimi (natal, solar/lunar return, composite ortak). */
export type WheelChart = {
  bodies: { id: BodyId; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean }[];
  houses: NatalHouse[];
  angles: { ascendant: { longitude: number }; midheaven: { longitude: number } } | null;
  aspects: { a: BodyId; b: BodyId; type: AspectType; nature: AspectNature | null }[];
  /**
   * AŞAMA 2.1/2.2 (2026-10-21): isteğe bağlı DIŞ HALKA (ilerletilmiş / Solar Arc gezegenleri; iç halka = natal). Rapor
   * çarkının (report/wheelSvg `outer`) ekran karşılığı; verilmezse çizim eskisiyle BİREBİR aynıdır.
   */
  outer?: {
    /** Dış halka adı (glif ipucunda; ör. "İlerletilmiş", "Solar Arc"). */
    title: string;
    bodies: { id: BodyId; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean }[];
    /** Halkalar arası açılar (dış → iç; uçlar gerçek boylamda). */
    crossAspects: { outer: BodyId; inner: BodyId; type: AspectType; nature: AspectNature | null }[];
  } | null;
};

/** Dış halka kalınlığı ve rengi (rapor çarkıyla aynı). */
const RING2 = 54;
const OUTER_INK = "#6d28d9";

export default function NatalWheel({
  technical,
  label = "Natal harita çarkı",
  sizeClassName = "h-auto w-full max-w-[604px]",
  tinted = false,
}: {
  technical: WheelChart;
  label?: string;
  /** Yalnız görüntü boyutu (SVG viewBox ve çizim aynı; oran korunur). */
  sizeClassName?: string;
  /** Aydınlık çalışma masası: element tonlu burç bandı + büyük yazı. Geometri, konumlar ve açılar AYNI. */
  tinted?: boolean;
}) {
  const fs = tinted ? { sign: 22, glyph: 22, deg: 11, min: 8.5, house: 12, angle: 10.5 } : { sign: 19, glyph: 20, deg: 9.5, min: 7.5, house: 11, angle: 9.5 };
  const ascLon = technical.angles?.ascendant.longitude ?? 0;
  const pt = (r: number, lon: number) => {
    const a = ((180 + (lon - ascLon)) * Math.PI) / 180;
    return { x: C + r * Math.cos(a), y: C - r * Math.sin(a) };
  };

  // Gezegen glifi yerleşimi: üst üste binmeyi önlemek için basit itme (min 7.5°).
  const sorted = [...technical.bodies].sort((a, b) => a.longitude - b.longitude);
  const disp = new Map<BodyId, number>(sorted.map((b) => [b.id, b.longitude]));
  const MIN_SEP = 7.5;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    const order = [...sorted].sort((a, b) => norm(disp.get(a.id)!) - norm(disp.get(b.id)!));
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      const b = order[(i + 1) % order.length];
      if (a.id === b.id) continue;
      const la = disp.get(a.id)!;
      const lb = disp.get(b.id)!;
      const gap = norm(lb - la);
      if (gap < MIN_SEP) {
        const push = (MIN_SEP - gap) / 2 + 0.05;
        disp.set(a.id, la - push);
        disp.set(b.id, lb + push);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const posById = new Map(technical.bodies.map((b) => [b.id, b]));
  const houses = technical.houses;
  const angleIds = new Set([1, 4, 7, 10]);
  const outer = technical.outer && technical.outer.bodies.length > 0 ? technical.outer : null;
  // Dış halka varsa tuval her yönde genişler; iç geometri (koordinatlar) AYNI kalır.
  const EXTRA = outer ? RING2 : 0;
  const outerDisp = new Map<BodyId, number>();
  if (outer) {
    const os = [...outer.bodies].sort((a, b) => a.longitude - b.longitude);
    for (const b of os) outerDisp.set(b.id, b.longitude);
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      const order = [...os].sort((a, b) => norm(outerDisp.get(a.id)!) - norm(outerDisp.get(b.id)!));
      for (let i = 0; i < order.length; i++) {
        const a = order[i];
        const b = order[(i + 1) % order.length];
        if (a.id === b.id) continue;
        const la = outerDisp.get(a.id)!;
        const lb = outerDisp.get(b.id)!;
        const gap = norm(lb - la);
        if (gap < MIN_SEP) {
          const push = (MIN_SEP - gap) / 2 + 0.05;
          outerDisp.set(a.id, la - push);
          outerDisp.set(b.id, lb + push);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  return (
    <svg
      viewBox={outer ? `${-(EXTRA + 10)} ${-(EXTRA + 10)} ${SIZE + 2 * (EXTRA + 10)} ${SIZE + 2 * (EXTRA + 10)}` : `0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
      className={`mx-auto select-none ${sizeClassName}`}
      data-outer-ring={outer ? "1" : undefined}
    >
      {outer && <circle cx={C} cy={C} r={R_OUT + RING2} fill="#faf5ff" stroke={OUTER_INK} strokeWidth={1.2} />}
      <circle cx={C} cy={C} r={R_OUT} fill="#fffdf7" stroke="#334155" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={R_SIGN_IN} fill="#ffffff" stroke="#334155" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_ASPECT} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.8} />

      {/* Burç halkası */}
      {SIGN_IDS.map((sign, i) => {
        const start = i * 30;
        const p1 = pt(R_SIGN_IN, start);
        const p2 = pt(R_OUT, start);
        const g = pt((R_SIGN_IN + R_OUT) / 2, start + 15);
        const o2 = pt(R_OUT, start + 30);
        const i2 = pt(R_SIGN_IN, start + 30);
        return (
          <g key={sign}>
            {tinted && (
              <path
                d={`M ${p2.x} ${p2.y} A ${R_OUT} ${R_OUT} 0 0 0 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${R_SIGN_IN} ${R_SIGN_IN} 0 0 1 ${p1.x} ${p1.y} Z`}
                fill={ELEMENT_TINT[SIGN_ELEMENT[sign]]}
              />
            )}
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#334155" strokeWidth={0.8} />
            <text
              x={g.x}
              y={g.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fs.sign}
              fill={ELEMENT_COLOR[SIGN_ELEMENT[sign]]}
            >
              <title>{SIGN_LABELS[sign]}</title>
              {SIGN_GLYPHS[sign]}
            </text>
          </g>
        );
      })}

      {/* 5° işaretleri */}
      {Array.from({ length: 72 }, (_, i) => {
        const lon = i * 5;
        const p1 = pt(R_SIGN_IN, lon);
        const p2 = pt(R_SIGN_IN - (i % 2 === 0 ? 6 : 3), lon);
        return <line key={`t${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#94a3b8" strokeWidth={0.6} />;
      })}

      {/* Ev çizgileri + numaralar */}
      {houses.map((h, i) => {
        const next = houses[(i + 1) % houses.length];
        const inner = pt(R_ASPECT, h.longitude);
        const outer = pt(angleIds.has(h.number) ? R_OUT + 6 : R_SIGN_IN, h.longitude);
        const span = norm(next.longitude - h.longitude);
        const mid = pt(R_HOUSE_NUM, h.longitude + span / 2);
        return (
          <g key={`h${h.number}`}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={angleIds.has(h.number) ? "#0f172a" : "#94a3b8"}
              strokeWidth={angleIds.has(h.number) ? 1.6 : 0.7}
            />
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.house} fill="#475569">
              {h.number}
            </text>
          </g>
        );
      })}

      {/* Açı etiketleri */}
      {technical.angles && (
        <>
          {[
            { lon: technical.angles.ascendant.longitude, t: "ASC", title: "Yükselen" },
            { lon: technical.angles.ascendant.longitude + 180, t: "DSC", title: "Alçalan" },
            { lon: technical.angles.midheaven.longitude, t: "MC", title: "Tepe Noktası (MC)" },
            { lon: technical.angles.midheaven.longitude + 180, t: "IC", title: "Dip Noktası (IC)" },
          ].map((a) => {
            const q = pt(R_OUT + EXTRA + 16, a.lon);
            // Etiket çember DIŞINDA → zemin rengi (koyu masa / açık kâğıt) ne olursa olsun okunur küçük açık levha.
            return (
              <g key={a.t}>
                <rect x={q.x - 14} y={q.y - 7.5} width={28} height={15} rx={4} fill="#fffdf7" stroke="#334155" strokeWidth={0.7} />
                <text x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.angle} fontWeight={700} fill="#0f172a">
                  <title>{a.title}</title>
                  {a.t}
                </text>
              </g>
            );
          })}
        </>
      )}

      {/* Açılar (iç daire) */}
      {technical.aspects.map((a, i) => {
        const pa = posById.get(a.a);
        const pb = posById.get(a.b);
        if (!pa || !pb) return null;
        const p1 = pt(R_ASPECT, pa.longitude);
        const p2 = pt(R_ASPECT, pb.longitude);
        const color = NATURE_COLOR[a.nature ?? "neutral"] ?? "#64748b";
        return (
          <line
            key={`a${i}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={color}
            strokeWidth={MAJOR.has(a.type) ? 1.1 : 0.7}
            strokeDasharray={MAJOR.has(a.type) ? undefined : "3 3"}
            opacity={0.75}
          />
        );
      })}

      {/* Halkalar arası açılar (dış halka → natal); mor nokta dış halka gövdesinin ucu */}
      {outer &&
        outer.crossAspects.map((a, i) => {
          const po = outer.bodies.find((b) => b.id === a.outer);
          const pi = posById.get(a.inner);
          if (!po || !pi) return null;
          const p1 = pt(R_ASPECT, po.longitude);
          const p2 = pt(R_ASPECT, pi.longitude);
          return (
            <line
              key={`x${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={NATURE_COLOR[a.nature ?? "neutral"] ?? "#64748b"}
              strokeWidth={MAJOR.has(a.type) ? 1.1 : 0.7}
              strokeDasharray={MAJOR.has(a.type) ? undefined : "3 3"}
              opacity={0.75}
              data-cross="1"
            />
          );
        })}
      {outer &&
        outer.bodies.map((b) => {
          const dot = pt(R_ASPECT, b.longitude);
          return <circle key={`od${b.id}`} cx={dot.x} cy={dot.y} r={1.8} fill={OUTER_INK} />;
        })}

      {/* Gezegenler */}
      {technical.bodies.map((b) => {
        const d = disp.get(b.id) ?? b.longitude;
        const tick1 = pt(R_SIGN_IN, b.longitude);
        const tick2 = pt(R_SIGN_IN - 9, b.longitude);
        const g = pt(R_GLYPH, d);
        const deg = pt(R_DEG, d);
        const dot = pt(R_ASPECT, b.longitude);
        const mins = pt(R_DEG - 19, d);
        const [degTxt, minTxt] = formatDegree(b.degreeInSign).split("°");
        return (
          <g key={b.id}>
            <line x1={tick1.x} y1={tick1.y} x2={tick2.x} y2={tick2.y} stroke="#0f172a" strokeWidth={1.2} />
            <line x1={tick2.x} y1={tick2.y} x2={g.x} y2={g.y} stroke="#cbd5e1" strokeWidth={0.6} />
            <circle cx={dot.x} cy={dot.y} r={1.8} fill="#0f172a" />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.glyph} fill="#0f172a">
              <title>{`${BODY_LABELS[b.id]} — ${SIGN_LABELS[b.sign]} ${formatDegree(b.degreeInSign)}${b.retrograde ? " ℞" : ""}`}</title>
              {BODY_GLYPHS[b.id]}
            </text>
            <text x={deg.x} y={deg.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.deg} fontWeight={600} fill="#1e293b">
              {`${degTxt}°${b.retrograde ? "℞" : ""}`}
            </text>
            <text x={mins.x} y={mins.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.min} fill="#64748b">
              {minTxt}
            </text>
          </g>
        );
      })}

      {/* Dış halka gövdeleri (ilerletilmiş / Solar Arc) — R_OUT dışında, mor; gerçek derece çentiği R_OUT çizgisinde */}
      {outer &&
        outer.bodies.map((b) => {
          const d = outerDisp.get(b.id) ?? b.longitude;
          const t1 = pt(R_OUT, b.longitude);
          const t2 = pt(R_OUT + 7, b.longitude);
          const g = pt(R_OUT + 22, d);
          const dg = pt(R_OUT + 42, d);
          const [degTxt] = formatDegree(b.degreeInSign).split("°");
          return (
            <g key={`o${b.id}`} data-outer-body={b.id}>
              <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={OUTER_INK} strokeWidth={1.4} />
              <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.glyph - 2} fill={OUTER_INK}>
                <title>{`${outer.title} ${BODY_LABELS[b.id]} — ${SIGN_LABELS[b.sign]} ${formatDegree(b.degreeInSign)}${b.retrograde ? " ℞" : ""}`}</title>
                {BODY_GLYPHS[b.id]}
              </text>
              <text x={dg.x} y={dg.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.deg} fontWeight={600} fill={OUTER_INK}>
                {`${degTxt}°${b.retrograde ? "℞" : ""}`}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
