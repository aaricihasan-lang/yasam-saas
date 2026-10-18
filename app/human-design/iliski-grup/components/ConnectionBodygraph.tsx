"use client";

// Connection birleşik BodyGraph'ı — etkileşimli SVG. Word görseliyle AYNI sahne ilkellerinden çizilir
// (lib/human-design/relations/connectionBodygraphScene). Kanal geometrisi mühürlü V9; veri yalnız kayıtlı sonuç.
// Kanal seçimi: fare üzerine gelme, dokunma / tıklama ve klavye (Tab + Enter/Boşluk, Esc). Seçili kanal vurgulanır,
// diğer kanalların renkleri soluklaşır; bilgi grafiğin altındaki panelde gösterilir (telefonda taşan tooltip yok).

import { Fragment } from "react";
import {
  CBG_CHANNEL_IDS,
  CBG_FILL_WIDTH,
  CBG_GATE_R,
  CBG_GATE_STROKE,
  CBG_LOGO,
  CBG_MARKER_STYLE,
  CBG_PERSON_COLOR,
  CBG_SILHOUETTE_DEFS,
  CBG_SILHOUETTE_MARKUP,
  CBG_VIEW,
  CBG_VIEWBOX,
  cbgCenterAttrs,
  cbgChannelRoute,
  cbgGateHalfPaths,
  cbgPipeAttrs,
  type CbgPrim,
} from "@/lib/human-design/relations/connectionBodygraphScene";

const HIT_ROUTES = CBG_CHANNEL_IDS.map((id) => ({ id, points: cbgChannelRoute(id).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") }));
const NO_POINTER = { pointerEvents: "none" } as const;

export function ConnectionBodygraph({
  prims,
  label,
  logoSrc,
  selected,
  onSelect,
  channelLabel,
  wide = false,
}: {
  prims: CbgPrim[];
  label: string;
  logoSrc: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  channelLabel: (id: string) => string;
  /** Mobil büyütme: sabit geniş çizim (kapsayıcı yatay kaydırır). */
  wide?: boolean;
}) {
  const dim = (chs: string[]) => (selected && !chs.includes(selected) ? 0.28 : 1);
  const selRoute = selected ? HIT_ROUTES.find((r) => r.id === selected) : null;
  return (
    <svg
      viewBox={CBG_VIEWBOX}
      role="img"
      aria-label={label}
      className={`mx-auto block h-auto select-none ${wide ? "w-[860px] max-w-none" : "w-full max-w-[620px]"}`}
      data-hd-cbg=""
      data-hd-cbg-selected={selected ?? ""}
    >
      {/* Statik, sabit içerikli tanımlar ve silüet (kullanıcı verisi içermez). */}
      <defs dangerouslySetInnerHTML={{ __html: CBG_SILHOUETTE_DEFS }} />
      {prims.map((p, i) => {
        switch (p.k) {
          case "rect":
            return <rect key={i} x={CBG_VIEW.x} y={CBG_VIEW.y} width={CBG_VIEW.width} height={CBG_VIEW.height} fill={p.fill} />;
          case "silhouette":
            return <g key={i} style={NO_POINTER} dangerouslySetInnerHTML={{ __html: CBG_SILHOUETTE_MARKUP }} />;
          case "pipe": {
            const a = cbgPipeAttrs(p);
            return <polyline key={i} points={p.points} fill="none" stroke={a.stroke} strokeWidth={a.strokeWidth} strokeLinecap={p.cap} strokeLinejoin="round" style={NO_POINTER} />;
          }
          case "fill":
            return (
              <polyline
                key={i}
                points={p.points}
                fill="none"
                stroke={p.color}
                strokeWidth={CBG_FILL_WIDTH}
                strokeLinecap={p.cap}
                strokeLinejoin="round"
                strokeDasharray={p.dash}
                opacity={dim(p.chs)}
                style={NO_POINTER}
                data-hd-cbg-fill={p.chs.join(",")}
                data-hd-cbg-color={p.color === CBG_PERSON_COLOR.A ? (p.dash ? "A-dash" : "A") : p.dash ? "B-dash" : "B"}
              />
            );
          case "slot":
            return (
              <Fragment key={i}>
                {selRoute ? (
                  <polyline points={selRoute.points} fill="none" stroke="#6366f1" strokeWidth={14} strokeOpacity={0.28} strokeLinecap="round" strokeLinejoin="round" style={NO_POINTER} data-hd-cbg-highlight={selRoute.id} />
                ) : null}
                {/* Etkileşim yüzeyleri (görünmez, geniş) — kanal başına bir hedef. */}
                {HIT_ROUTES.map((r) => (
                  <polyline
                    key={`hit-${r.id}`}
                    points={r.points}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={13}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ cursor: "pointer", outline: "none" }}
                    tabIndex={0}
                    role="button"
                    aria-label={channelLabel(r.id)}
                    aria-pressed={selected === r.id}
                    data-hd-cbg-hit={r.id}
                    // Üzerine gelme yalnız gerçek farede: dokunmadan sonra tarayıcının ürettiği sanal fare olayı
                    // (sayfa kayınca parmağın altına gelen başka kanal) seçimi değiştirmesin.
                    onPointerEnter={(e) => {
                      if (e.pointerType === "mouse") onSelect(r.id);
                    }}
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
              </Fragment>
            );
          case "marker":
            return (
              <path key={i} d={p.d} fill={CBG_MARKER_STYLE.fill} stroke={CBG_MARKER_STYLE.stroke} strokeWidth={CBG_MARKER_STYLE.strokeWidth} strokeLinejoin="round" opacity={dim([p.ch])} style={NO_POINTER} data-hd-cbg-marker={p.ch} />
            );
          case "center": {
            const a = cbgCenterAttrs(p.defined);
            return <polygon key={i} points={p.points} fill={a.fill} stroke={a.stroke} strokeWidth={a.strokeWidth} strokeLinejoin="round" style={NO_POINTER} data-hd-cbg-center={`${p.engine}:${p.defined ? "defined" : "open"}`} />;
          }
          case "text":
            return (
              <text key={i} x={p.x} y={p.y} fontSize={p.size} fontWeight={p.weight} letterSpacing={p.spacing} textAnchor="middle" fill={p.fill} style={NO_POINTER}>
                {p.text}
              </text>
            );
          case "gate":
            if (p.holder === "both") {
              const h = cbgGateHalfPaths(p.x, p.y);
              return (
                <g key={i} style={NO_POINTER} data-hd-cbg-gate={`${p.gate}:both`}>
                  <path d={h.left} fill={CBG_PERSON_COLOR.A} />
                  <path d={h.right} fill={CBG_PERSON_COLOR.B} />
                  <circle cx={p.x} cy={p.y} r={CBG_GATE_R} fill="none" stroke={CBG_GATE_STROKE} strokeWidth={1} />
                </g>
              );
            }
            return <circle key={i} cx={p.x} cy={p.y} r={CBG_GATE_R} fill={p.holder ? CBG_PERSON_COLOR[p.holder] : "#ffffff"} stroke={CBG_GATE_STROKE} strokeWidth={1} style={NO_POINTER} data-hd-cbg-gate={`${p.gate}:${p.holder ?? "off"}`} />;
          case "logo":
            return <image key={i} href={logoSrc} x={CBG_LOGO.x} y={CBG_LOGO.y} width={CBG_LOGO.width} height={CBG_LOGO.height} preserveAspectRatio="xMidYMid meet" style={NO_POINTER} data-hd-cbg-logo="" />;
        }
      })}
    </svg>
  );
}
