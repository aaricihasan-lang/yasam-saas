"use client";

// Connection birleşik BodyGraph'ı — etkileşimli SVG. Word görseliyle AYNI öğe tanımlarından çizilir
// (lib/human-design/relations/connectionBodygraphScene → cbgElements). Kanal geometrisi mühürlü V9; veri yalnız
// kayıtlı sonuç. Kanal seçimi: fare üzerine gelme (yalnız gerçek fare), dokunma / tıklama ve klavye (Tab + Enter/
// Boşluk, Esc). Seçili kanal vurgulanır, diğer kanalların renkleri soluklaşır; bilgi grafiğin altındaki panelde.

import { createElement, Fragment, type ReactNode } from "react";
import {
  CBG_CHANNEL_IDS,
  CBG_DEFS,
  CBG_VIEWBOX,
  cbgChannelRoute,
  cbgElements,
  type CbgEl,
  type CbgPrim,
} from "@/lib/human-design/relations/connectionBodygraphScene";

const HIT_ROUTES = CBG_CHANNEL_IDS.map((id) => ({ id, points: cbgChannelRoute(id).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") }));
const NO_POINTER = { pointerEvents: "none" } as const;

/** Öğe tanımı → React öğesi (öznitelikler camelCase; statik `raw` içerik yalnız sabit tanımlar, kullanıcı verisi içermez). */
function renderEl(e: CbgEl, key: string, extra: Record<string, unknown> = {}): ReactNode {
  const props: Record<string, unknown> = { key, ...e.attrs, style: NO_POINTER, ...extra };
  if (e.raw !== undefined) props.dangerouslySetInnerHTML = { __html: e.raw };
  return createElement(e.tag, props, e.text);
}

function primData(p: CbgPrim): Record<string, unknown> {
  switch (p.k) {
    case "fill":
      return { "data-hd-cbg-fill": p.chs.join(","), "data-hd-cbg-color": `${p.tone}${p.stripe ? "-dash" : ""}` };
    case "center":
      return { "data-hd-cbg-center": `${p.engine}:${p.defined ? "defined" : "open"}` };
    case "gate":
      return { "data-hd-cbg-gate": `${p.gate}:${p.holder ?? "off"}` };
    case "logo":
      return { "data-hd-cbg-logo": "" };
    default:
      return {};
  }
}

export function ConnectionBodygraph({
  prims,
  label,
  logoSrc,
  selected,
  onSelect,
  channelLabel = (id) => id,
  wide = false,
  sizeClass,
}: {
  prims: CbgPrim[];
  label: string;
  /** null → grafiğe logo çizilmez (ör. bireysel harita: logo bilgi panelinde). */
  logoSrc: string | null;
  /** Etkileşim (kanal seçimi) — verilmezse grafik salt görüntüdür (ör. bireysel harita). */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  channelLabel?: (id: string) => string;
  /** Mobil büyütme: sabit geniş çizim (kapsayıcı yatay kaydırır). */
  wide?: boolean;
  /** Boyut sınıfı (varsayılan: genişliğe sığar, en fazla 640px). */
  sizeClass?: string;
}) {
  const interactive = !!onSelect;
  const dim = (chs: string[]) => (selected && !chs.includes(selected) ? 0.3 : 1);
  const selRoute = selected ? HIT_ROUTES.find((r) => r.id === selected) : null;
  return (
    <svg
      viewBox={CBG_VIEWBOX}
      role="img"
      aria-label={label}
      className={`mx-auto block select-none ${sizeClass ?? (wide ? "h-auto w-[860px] max-w-none" : "h-auto w-full max-w-[640px]")}`}
      data-hd-cbg=""
      data-hd-cbg-selected={selected ?? ""}
    >
      {/* Statik, sabit içerikli tanımlar (degrade / filtre; kullanıcı verisi içermez). */}
      <defs dangerouslySetInnerHTML={{ __html: CBG_DEFS }} />
      {prims.map((p, i) => {
        if (p.k === "slot") {
          if (!interactive || !onSelect) return null;
          return (
            <Fragment key={i}>
              {selRoute ? (
                <polyline points={selRoute.points} fill="none" stroke="#6366f1" strokeWidth={17} strokeOpacity={0.26} strokeLinecap="round" strokeLinejoin="round" style={NO_POINTER} data-hd-cbg-highlight={selRoute.id} />
              ) : null}
              {/* Etkileşim yüzeyleri (görünmez, geniş) — kanal başına bir hedef. */}
              {HIT_ROUTES.map((r) => (
                <polyline
                  key={`hit-${r.id}`}
                  points={r.points}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
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
        }
        const els = cbgElements(p, logoSrc);
        if (els.length === 0) return null;
        const data = primData(p);
        const chs = p.k === "fill" || p.k === "tick" ? p.chs : null;
        // Tek öğeli ilkel: veri öznitelikleri doğrudan öğede; çok öğeli: ortak <g> üzerinde.
        if (els.length === 1 && !chs) return renderEl(els[0], String(i), data);
        return (
          <g key={i} opacity={chs ? dim(chs) : undefined} style={NO_POINTER} {...data}>
            {els.map((e, j) => renderEl(e, `${i}-${j}`))}
          </g>
        );
      })}
    </svg>
  );
}
