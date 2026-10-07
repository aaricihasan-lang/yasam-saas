"use client";

/**
 * Natal çark — Yaşam Sistemi'nin KENDİ SVG çizimi (sağlayıcı-bağımsız; yalnız kanonik teknik
 * veriyi kullanır). Roxy UI bileşeni KULLANILMAZ (lisans/sürüm bağımlılığı yok; ileride başka
 * hesap motoru da aynı çarkı besler).
 *
 * Yerleşim: Yükselen solda (9 yönü), boylam saat yönünün TERSİNE artar (astrolojik standart).
 * Saat bilinmiyorsa (angles=null) 0° Koç solda, evler çizilmez.
 */

import type { NatalTechnical, BodyId } from "@/lib/astrology/model/western";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { BODY_GLYPHS, BODY_LABELS, SIGN_ELEMENT, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";

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

const NATURE_COLOR: Record<string, string> = {
  harmonious: "#2563eb",
  challenging: "#dc2626",
  neutral: "#64748b",
};

const MAJOR = new Set(["conjunction", "opposition", "trine", "square", "sextile"]);

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export default function NatalWheel({ technical }: { technical: NatalTechnical }) {
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

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Natal harita çarkı"
      className="mx-auto h-auto w-full max-w-[604px] select-none"
    >
      <circle cx={C} cy={C} r={R_OUT} fill="#fffdf7" stroke="#334155" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={R_SIGN_IN} fill="#ffffff" stroke="#334155" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_ASPECT} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.8} />

      {/* Burç halkası */}
      {SIGN_IDS.map((sign, i) => {
        const start = i * 30;
        const p1 = pt(R_SIGN_IN, start);
        const p2 = pt(R_OUT, start);
        const g = pt((R_SIGN_IN + R_OUT) / 2, start + 15);
        return (
          <g key={sign}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#334155" strokeWidth={0.8} />
            <text
              x={g.x}
              y={g.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={17}
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
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#64748b">
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
            const q = pt(R_OUT + 16, a.lon);
            return (
              <text key={a.t} x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#0f172a">
                <title>{a.title}</title>
                {a.t}
              </text>
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

      {/* Gezegenler */}
      {technical.bodies.map((b) => {
        const d = disp.get(b.id) ?? b.longitude;
        const tick1 = pt(R_SIGN_IN, b.longitude);
        const tick2 = pt(R_SIGN_IN - 9, b.longitude);
        const g = pt(R_GLYPH, d);
        const deg = pt(R_DEG, d);
        const dot = pt(R_ASPECT, b.longitude);
        return (
          <g key={b.id}>
            <line x1={tick1.x} y1={tick1.y} x2={tick2.x} y2={tick2.y} stroke="#0f172a" strokeWidth={1.2} />
            <line x1={tick2.x} y1={tick2.y} x2={g.x} y2={g.y} stroke="#cbd5e1" strokeWidth={0.6} />
            <circle cx={dot.x} cy={dot.y} r={1.8} fill="#0f172a" />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#0f172a">
              <title>{`${BODY_LABELS[b.id]} — ${SIGN_LABELS[b.sign]} ${Math.floor(b.degreeInSign)}°${b.retrograde ? " ℞" : ""}`}</title>
              {BODY_GLYPHS[b.id]}
            </text>
            <text x={deg.x} y={deg.y} textAnchor="middle" dominantBaseline="central" fontSize={8.5} fill="#475569">
              {`${Math.floor(b.degreeInSign)}°${b.retrograde ? "℞" : ""}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
