"use client";

/**
 * Danışan İşaret Haritası — etkileşimli nokta tuvali (SVG, sabit viewBox).
 *
 * KOORDİNAT: pointer → `getScreenCTM().inverse()` → viewBox birimi → normalize (0..1).
 *   `preserveAspectRatio="xMidYMid meet"` ile ekran boyutu/zoom koordinatı DEĞİŞTİRMEZ;
 *   görsel yüklenmesini beklemeye gerek yoktur (viewBox önceden sabit).
 *
 * DOKUNMA (mobil):
 *   - Zemin `touch-action: manipulation` → sayfa kaydırma + pinch-zoom tarayıcıda kalır.
 *     Nokta YALNIZ kısa ve hareketsiz dokunuşta eklenir (kaydırma/pinch nokta koymaz).
 *   - Noktalar `touch-action: none` → noktayı sürüklemek sayfayı kaydırmaz.
 *   - Dokunma alanı en az ~44 CSS px (görünen nokta küçük olsa bile).
 * KLAVYE: noktalar Tab ile odaklanır; ok tuşları taşır (Shift = büyük adım), Delete siler.
 * Renk tek başına anlam taşımaz: her noktada sıra numarası + yoğunluk dolgu deseni.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  type ClientMark,
  type MarkIntensity,
  type SurfaceView,
  describeMark,
  fromViewBox,
  markRadius,
  toViewBox,
} from "@/lib/refleksoloji/markSurfaces";
import { SurfaceArt } from "./SurfaceArt";

export type CanvasMark = ClientMark & { pending?: boolean };

type Props = {
  view: SurfaceView;
  marks: readonly CanvasMark[];
  selectedId: string | null;
  mode: "add" | "select";
  readOnly: boolean;
  label: string;
  onAdd: (x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  /** Sürükleme/klavye ile taşıma bitti → kalıcı yaz. */
  onMove: (id: string, x: number, y: number) => void;
  onDeleteRequest: (id: string) => void;
};

const TAP_MOVE_PX = 10;
const TAP_MAX_MS = 700;
const MIN_HIT_PX = 22; // yarıçap → ~44px çap
const KEY_STEP = 0.005;
const KEY_STEP_BIG = 0.02;

function fillFor(intensity: MarkIntensity | null): { fill: string; fillOpacity: number; ring: number } {
  switch (intensity) {
    case "strong":
      return { fill: "#be123c", fillOpacity: 0.9, ring: 2 };
    case "medium":
      return { fill: "#e11d48", fillOpacity: 0.55, ring: 1 };
    case "light":
      return { fill: "#ffffff", fillOpacity: 0.75, ring: 1 };
    default:
      return { fill: "#7c3aed", fillOpacity: 0.55, ring: 1 };
  }
}

export function MarkCanvas({
  view,
  marks,
  selectedId,
  mode,
  readOnly,
  label,
  onAdd,
  onSelect,
  onMove,
  onDeleteRequest,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // `meet` ile viewBox dışı içerik (ör. ayak PNG'sinin DİĞER yarısı) SVG viewport'unda görünür
  // kalır → zemin viewBox'a KIRPILIR; aksi hâlde "sağ ayak" ekranında sol ayak da görünürdü.
  const clipId = `rf-clip-${useId().replace(/:/g, "")}`;
  const [unitsPerPx, setUnitsPerPx] = useState(1);
  const tapRef = useRef<{ id: number; x: number; y: number; t: number; multi: boolean } | null>(null);
  const activePointers = useRef(new Set<number>());
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

  // Ekran pikseli ↔ viewBox birimi (dokunma alanı + sürükleme eşiği için).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      // meet: ölçek = min(oran); birim/px = 1/ölçek
      const scale = Math.min(r.width / view.width, r.height / view.height);
      if (scale > 0) setUnitsPerPx(1 / scale);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [view.width, view.height]);

  const toNormalized = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return null;
      const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      if (pt.x < 0 || pt.y < 0 || pt.x > view.width || pt.y > view.height) return null;
      return fromViewBox(view, pt.x, pt.y);
    },
    [view],
  );

  // ─── Zemin: kısa dokunuş = ekle (add) / seçimi kaldır (select) ───────────────
  const onBgPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    activePointers.current.add(e.pointerId);
    const multi = activePointers.current.size > 1;
    if (multi && tapRef.current) tapRef.current.multi = true;
    if (!e.isPrimary) return;
    tapRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), multi };
  };
  const endPointer = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
  };
  const onBgPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    endPointer(e);
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap || tap.id !== e.pointerId || tap.multi) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MOVE_PX) return;
    if (performance.now() - tap.t > TAP_MAX_MS) return;
    if (mode === "add" && !readOnly) {
      const p = toNormalized(e.clientX, e.clientY);
      if (p) onAdd(p.x, p.y);
    } else {
      onSelect(null);
    }
  };
  const onBgPointerCancel = (e: React.PointerEvent) => {
    endPointer(e);
    tapRef.current = null;
  };

  // ─── Nokta: dokun = seç; sürükle = taşı ─────────────────────────────────────
  const onMarkPointerDown = (e: React.PointerEvent<SVGGElement>, m: CanvasMark) => {
    e.stopPropagation();
    onSelect(m.id);
    if (readOnly || m.pending || !e.isPrimary) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: m.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
  };
  const onMarkPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < TAP_MOVE_PX / 2) return;
    d.moved = true;
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const p = fromViewBox(view, pt.x, pt.y); // sınır içine kırpılır
    setDragPos({ id: d.id, x: p.x, y: p.y });
  };
  const onMarkPointerUp = (e: React.PointerEvent<SVGGElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.pointerId !== e.pointerId) return;
    const pos = dragPos;
    setDragPos(null);
    if (d.moved && pos && pos.id === d.id) onMove(d.id, pos.x, pos.y);
  };
  const onMarkPointerCancel = () => {
    dragRef.current = null;
    setDragPos(null);
  };

  const onMarkKeyDown = (e: React.KeyboardEvent<SVGGElement>, m: CanvasMark) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(m.id);
      return;
    }
    if (readOnly || m.pending) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDeleteRequest(m.id);
      return;
    }
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (dx === 0 && dy === 0) return;
    e.preventDefault();
    onSelect(m.id);
    const nx = Math.min(1, Math.max(0, m.x + dx));
    const ny = Math.min(1, Math.max(0, m.y + dy));
    onMove(m.id, Math.round(nx * 10000) / 10000, Math.round(ny * 10000) / 10000);
  };

  const hitR = MIN_HIT_PX * unitsPerPx;
  const fontPx = 11 * unitsPerPx;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full select-none"
      role="group"
      aria-label={label}
      style={{ touchAction: "manipulation" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={view.width} height={view.height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <SurfaceArt view={view} />
      </g>
      <rect
        x={0}
        y={0}
        width={view.width}
        height={view.height}
        fill="transparent"
        className={mode === "add" && !readOnly ? "cursor-crosshair" : "cursor-default"}
        onPointerDown={onBgPointerDown}
        onPointerUp={onBgPointerUp}
        onPointerCancel={onBgPointerCancel}
        onPointerLeave={endPointer}
        aria-hidden
      />
      {marks.map((m, i) => {
        const pos = dragPos && dragPos.id === m.id ? dragPos : m;
        const { cx, cy } = toViewBox(view, pos.x, pos.y);
        const r = markRadius(view, m.size);
        const sel = m.id === selectedId;
        const f = fillFor(m.intensity);
        const n = i + 1;
        return (
          <g
            key={m.id}
            role="button"
            tabIndex={0}
            aria-label={`${describeMark(m, n)}${sel ? " (seçili)" : ""}`}
            aria-pressed={sel}
            className={`outline-none ${readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
            style={{ touchAction: "none", opacity: m.pending ? 0.6 : 1 }}
            onPointerDown={(e) => onMarkPointerDown(e, m)}
            onPointerMove={onMarkPointerMove}
            onPointerUp={onMarkPointerUp}
            onPointerCancel={onMarkPointerCancel}
            onKeyDown={(e) => onMarkKeyDown(e, m)}
            onFocus={() => onSelect(m.id)}
          >
            <circle cx={cx} cy={cy} r={Math.max(hitR, r)} fill="transparent" />
            {sel ? (
              <circle
                cx={cx}
                cy={cy}
                r={r + 6 * unitsPerPx}
                fill="none"
                stroke="#0f172a"
                strokeWidth={2 * unitsPerPx}
                strokeDasharray={`${4 * unitsPerPx} ${3 * unitsPerPx}`}
              />
            ) : null}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={f.fill}
              fillOpacity={f.fillOpacity}
              stroke={m.intensity === "light" ? "#be123c" : "#4c1d95"}
              strokeWidth={(f.ring + (sel ? 1 : 0)) * 1.5 * unitsPerPx}
            />
            {m.intensity === "strong" ? (
              <circle cx={cx} cy={cy} r={r + 3 * unitsPerPx} fill="none" stroke="#be123c" strokeWidth={1.5 * unitsPerPx} />
            ) : null}
            <text
              x={cx}
              y={cy}
              dy="0.35em"
              textAnchor="middle"
              fontSize={fontPx}
              fontWeight={800}
              fill={m.intensity === "strong" || m.intensity === "medium" ? "#ffffff" : "#1e1b4b"}
              stroke={m.intensity === "strong" || m.intensity === "medium" ? "#4c0519" : "#ffffff"}
              strokeWidth={2.5 * unitsPerPx}
              paintOrder="stroke"
              style={{ pointerEvents: "none" }}
            >
              {n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
