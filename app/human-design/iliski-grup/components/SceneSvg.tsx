"use client";

// Sahne → etkileşimli SVG. Word PNG'si ile AYNI ilkellerden çizilir (lib/human-design/relations/*Scene).
// Kanal seçimi: fare üzerine gelme (masaüstü), dokunma / tıklama (mobil) ve klavye (Tab + Enter/Boşluk).
// Seçili kanal öne çıkar, diğerleri soluklaşır; bilgi grafiğin altındaki panelde gösterilir (ekran dışına taşan
// tooltip yok → telefonda da okunur).

import { scenePointsAttr, sceneMarkerPath, type ScenePrim } from "@/lib/human-design/relations/compositeScene";
import type { Pt } from "@/lib/human-design/relations/compositeLayout";

export function SceneSvg({
  prims,
  view,
  label,
  hitRoutes,
  selected,
  onSelect,
  channelLabel,
  testId,
  wide = false,
  large = false,
}: {
  prims: ScenePrim[];
  view: { width: number; height: number };
  label: string;
  /** Etkileşim yüzeyi: kanal kimliği → güzergâh noktaları. */
  hitRoutes: Array<{ id: string; points: Pt[] }>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  channelLabel: (id: string) => string;
  testId: string;
  /** Mobil büyütme: sabit geniş çizim (kapsayıcı yatay kaydırır). */
  wide?: boolean;
  /** Daha büyük masaüstü çizimi (Penta). */
  large?: boolean;
}) {
  const dim = (ch?: string) => (selected && ch && ch !== selected ? 0.22 : 1);
  return (
    <svg viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={label} className={`mx-auto block h-auto select-none ${wide ? "w-[680px] max-w-none" : large ? "w-full max-w-[540px]" : "w-full max-w-[460px]"}`} data-hd-scene={testId}>
      <rect width={view.width} height={view.height} fill="#ffffff" />
      {prims.map((p, i) => {
        switch (p.k) {
          case "polygon":
            return <polygon key={i} points={scenePointsAttr(p.points)} fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeLinejoin="round" />;
          case "polyline": {
            const isSel = !!selected && p.ch === selected && p.layer !== "base";
            return (
              <polyline
                key={i}
                points={scenePointsAttr(p.points)}
                fill="none"
                stroke={p.stroke}
                strokeWidth={isSel ? p.sw + 1.6 : p.sw}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={p.dash}
                opacity={(p.opacity ?? 1) * (p.layer === "base" ? 1 : dim(p.ch))}
                data-hd-scene-line={p.ch ? `${p.ch}:${p.layer}` : undefined}
              />
            );
          }
          case "circle":
            return <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash} data-hd-scene-gate={p.gate} />;
          case "path":
            return <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} />;
          case "text":
            return (
              <text key={i} x={p.x} y={p.y} fontSize={p.size} fontWeight={p.weight} fill={p.fill} textAnchor={p.anchor ?? "start"} style={{ pointerEvents: "none" }}>
                {p.text}
              </text>
            );
          case "marker":
            return <path key={i} d={sceneMarkerPath(p)} fill="#ffffff" stroke="#0f172a" strokeWidth={1.6} opacity={dim(p.ch)} data-hd-scene-marker={p.ch} />;
        }
      })}
      {/* Etkileşim yüzeyleri (görünmez, geniş) — kanal başına bir hedef. */}
      {hitRoutes.map((r) => (
        <polyline
          key={`hit-${r.id}`}
          points={scenePointsAttr(r.points)}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          strokeLinecap="round"
          style={{ cursor: "pointer", outline: "none" }}
          tabIndex={0}
          role="button"
          aria-label={channelLabel(r.id)}
          aria-pressed={selected === r.id}
          data-hd-scene-hit={r.id}
          onMouseEnter={() => onSelect(r.id)}
          onFocus={() => onSelect(r.id)}
          onClick={() => onSelect(r.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(r.id);
            } else if (e.key === "Escape") onSelect(null);
          }}
        />
      ))}
    </svg>
  );
}
