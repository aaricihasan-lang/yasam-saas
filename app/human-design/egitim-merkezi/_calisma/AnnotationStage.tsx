"use client";

/**
 * Eğitim Çalışma Alanı · SAHNE (FAZ 8). Onaylı premium BodyGraph DEĞİŞTİRİLMEDEN çizilir (HdPremiumBodygraph ile aynı yol:
 * buildConnectionBodygraphScene → ConnectionBodygraph); çizim / not katmanı onun ÜSTÜNDE, AYNI viewBox'lı AYRI bir SVG'dir.
 * İki SVG aynı sabit en-boy oranlı kutuda → bir öğenin tuval koordinatı her ekran genişliğinde aynı kapı / merkezin üzerinde
 * kalır. İşaretçi → tuval dönüşümü getScreenCTM ile (fare, dokunma, kalem aynı Pointer Events yolu).
 * FAZ 13: tuval BodyGraph'ın iki yanındaki boş çalışma alanını da kapsar (ANN_CANVAS); BodyGraph tuvalin ortasında, kendi
 * koordinatlarıyla durur (eski çizimler kaymaz). Seçili daire / ok / baloncuk tutamaçla yeniden boyutlandırılır; baloncuk
 * isteğe göre notunu harita üzerinde kutu içinde gösterir (uzun metin kutu içinde kayar, kesilmez).
 * Kullanıcı metni YALNIZ React metin düğümü olarak çizilir (innerHTML YOK).
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2 } from "lucide-react";
import { ConnectionBodygraph } from "@/app/human-design/iliski-grup/components/ConnectionBodygraph";
import { buildConnectionBodygraphScene, CBG_PALETTE_COLOR, type CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import { HD_PREMIUM_INDIVIDUAL_TONE } from "@/lib/human-design/bodygraph/rendererConfig";
import {
  ANN_BG_BOX, ANN_BOX, ANN_BUBBLE_R, ANN_CANVAS, ANN_CANVAS_VIEWBOX, ANN_COLORS, ANN_MAX_NOTE, ANN_MAX_PEN_POINTS, anchorLabel, elPosition, nearestAnchor,
  type AnnColor, type AnnEl, type AnnFront, type AnnWidth,
} from "@/lib/human-design/education/annotations/annotationContract";
import css from "@/app/_premium/hd-education/calismaAlani.module.css";

export type AnnTool = "pen" | "arrow" | "circle" | "bubble" | "text" | "select" | "erase" | "none";
type Pt = { x: number; y: number };

const X0 = ANN_CANVAS.x, Y0 = ANN_CANVAS.y, X1 = ANN_CANVAS.x + ANN_CANVAS.width, Y1 = ANN_CANVAS.y + ANN_CANVAS.height;
const clampX = (v: number) => Math.min(X1, Math.max(X0, v));
const clampY = (v: number) => Math.min(Y1, Math.max(Y0, v));
const r1 = (n: number) => Math.round(n * 10) / 10;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type Bubble = Extract<AnnEl, { t: "bubble" }>;
export const bubbleR = (b: Bubble) => b.r ?? ANN_BUBBLE_R.def;
export const bubbleBox = (b: Bubble) => ({ w: b.bw ?? ANN_BOX.defW, h: b.bh ?? ANN_BOX.defH });
/** Yeniden boyutlandırma tutamacı: daire yarıçapı · ok uçları · baloncuk dairesi / kutu köşesi. */
type Handle = "r" | "p1" | "p2" | "box";
/** Kutu köşe tutamacı kutunun hemen DIŞINDA (kutudaki yazma alanı tutamacı örtmesin). */
const BOX_HANDLE_GAP = 10;
export const newAnnId = (t: string) => `${t}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Daire / ok için ANLAMLI HEDEF kimliği (kapı / kanal / merkez) — konum tuvalde kalır, hedef ayrıca saklanır. */
export function withTargets(el: AnnEl, front: AnnFront): AnnEl {
  if (el.t === "circle") return { ...el, a: nearestAnchor(el.x, el.y, front, Math.max(34, el.r * 0.8)) };
  if (el.t === "arrow") return { ...el, a1: nearestAnchor(el.x1, el.y1, front), a2: nearestAnchor(el.x2, el.y2, front) };
  return el;
}

/** Öğeyi (dx, dy) kadar taşı; bırakıldığında baloncuk / metin yeniden çapalanır, daire / ok hedefi yeniden belirlenir. */
export function moveEl(el: AnnEl, dx: number, dy: number, front: AnnFront, reanchor: boolean): AnnEl {
  switch (el.t) {
    case "pen": return { ...el, p: el.p.map((v, i) => r1(i % 2 === 0 ? clampX(v + dx) : clampY(v + dy))) };
    case "arrow": { const m = { ...el, x1: r1(clampX(el.x1 + dx)), y1: r1(clampY(el.y1 + dy)), x2: r1(clampX(el.x2 + dx)), y2: r1(clampY(el.y2 + dy)) }; return reanchor ? withTargets(m, front) : m; }
    case "circle": { const m = { ...el, x: r1(clampX(el.x + dx)), y: r1(clampY(el.y + dy)) }; return reanchor ? withTargets(m, front) : m; }
    case "bubble":
    case "text": {
      const p = elPosition(el, front);
      const abs = { x: clampX(p.x + dx), y: clampY(p.y + dy) };
      return placeAnchored(el, abs, front, reanchor);
    }
  }
}

/** Mutlak tuval noktasını (varsa) semantik çapa + kaymaya çevirir. */
export function placeAnchored<T extends Extract<AnnEl, { t: "bubble" | "text" }>>(el: T, abs: Pt, front: AnnFront, reanchor = true): T {
  const a = reanchor ? nearestAnchor(abs.x, abs.y, front) : el.a;
  if (!a) return { ...el, a: null, x: r1(abs.x), y: r1(abs.y) };
  const ap = elPosition({ ...el, a, x: 0, y: 0 }, front);
  return { ...el, a, x: r1(abs.x - ap.x), y: r1(abs.y - ap.y) };
}

/** Seçili öğenin tutamaçları (tuval koordinatı). */
function handles(el: AnnEl, front: AnnFront): Array<{ h: Handle; x: number; y: number }> {
  switch (el.t) {
    case "circle": return [{ h: "r", x: el.x + el.r, y: el.y }];
    case "arrow": return [{ h: "p1", x: el.x1, y: el.y1 }, { h: "p2", x: el.x2, y: el.y2 }];
    case "bubble": {
      const p = elPosition(el, front);
      if (el.m === "in") { const b = bubbleBox(el); return [{ h: "box", x: p.x + b.w + BOX_HANDLE_GAP, y: p.y + b.h + BOX_HANDLE_GAP }]; }
      return [{ h: "r", x: p.x + bubbleR(el), y: p.y }];
    }
    default: return [];
  }
}

/** Tutamaç sürüklemesi → yeni öğe (sınırlar sözleşmeyle aynı). */
function resizeEl(el: AnnEl, h: Handle, pt: Pt, front: AnnFront, final: boolean): AnnEl {
  if (el.t === "circle" && h === "r") {
    const m = { ...el, r: r1(clampN(Math.hypot(pt.x - el.x, pt.y - el.y), 3, 400)) };
    return final ? withTargets(m, front) : m;
  }
  if (el.t === "arrow" && (h === "p1" || h === "p2")) {
    const m = h === "p1" ? { ...el, x1: r1(pt.x), y1: r1(pt.y) } : { ...el, x2: r1(pt.x), y2: r1(pt.y) };
    return final ? withTargets(m, front) : m;
  }
  if (el.t === "bubble") {
    const p = elPosition(el, front);
    if (h === "box") return { ...el, bw: r1(clampN(pt.x - p.x - BOX_HANDLE_GAP, ANN_BOX.minW, ANN_BOX.maxW)), bh: r1(clampN(pt.y - p.y - BOX_HANDLE_GAP, ANN_BOX.minH, ANN_BOX.maxH)) };
    if (h === "r") return { ...el, r: r1(clampN(Math.hypot(pt.x - p.x, pt.y - p.y), ANN_BUBBLE_R.min, ANN_BUBBLE_R.max)) };
  }
  return el;
}

function bbox(el: AnnEl, front: AnnFront): { x: number; y: number; w: number; h: number } {
  switch (el.t) {
    case "pen": {
      const xs = el.p.filter((_, i) => i % 2 === 0), ys = el.p.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case "arrow": return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    case "circle": return { x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2 };
    case "bubble": {
      const p = elPosition(el, front);
      const r = bubbleR(el);
      if (el.m === "in") { const b = bubbleBox(el); return { x: p.x - r, y: p.y - r, w: b.w + r, h: b.h + r }; }
      return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
    }
    case "text": { const p = elPosition(el, front); const w = Math.max(16, el.s.length * el.z * 0.56); return { x: p.x - 2, y: p.y - el.z, w: w + 4, h: el.z * 1.3 }; }
  }
}

export function AnnotationStage({
  state, front, els, tool, color, width, selectedId, hidden = false, openBubbleId = null, interactive,
  onCreate, onChange, onSelect, onErase, onPlace, onBubble, onExpandBubble, onNoteText, onNoteEdit,
}: {
  state: CbgState;
  front: AnnFront;
  els: AnnEl[];
  tool: AnnTool;
  color: AnnColor;
  width: AnnWidth;
  selectedId: string | null;
  hidden?: boolean;
  openBubbleId?: string | null;
  interactive: boolean;
  onCreate?: (el: AnnEl) => void;
  onChange?: (el: AnnEl) => void;
  onSelect?: (id: string | null) => void;
  onErase?: (id: string) => void;
  /** Baloncuk / metin aracı: tuvalde tıklanan nokta. */
  onPlace?: (kind: "bubble" | "text", abs: Pt) => void;
  onBubble?: (id: string | null) => void;
  /** Uzun baloncuk notunu büyük okuma penceresinde aç. */
  onExpandBubble?: (id: string) => void;
  /** "Metin baloncuk içinde" kutusunda doğrudan yazma (seçili baloncuk). */
  onNoteText?: (id: string, n: string) => void;
  onNoteEdit?: (phase: "begin" | "end") => void;
}) {
  const prims = useMemo(() => buildConnectionBodygraphScene(state), [state]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Telefon: tuval kart genişliğinden geniş → başlangıçta BodyGraph ortada (yan çalışma alanları yatay kaydırmayla).
  useEffect(() => {
    const w = wrapRef.current;
    if (w && w.scrollWidth > w.clientWidth + 1) w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2;
  }, []);
  const [draft, setDraft] = useState<AnnEl | null>(null);
  const [drag, setDrag] = useState<{ id: string; start: Pt; el: AnnEl; moved: AnnEl } | null>(null);
  const [resize, setResize] = useState<{ id: string; h: Handle; el: AnnEl; moved: AnnEl } | null>(null);
  const pColor = CBG_PALETTE_COLOR.individual[HD_PREMIUM_INDIVIDUAL_TONE.personality];
  const dColor = CBG_PALETTE_COLOR.individual[HD_PREMIUM_INDIVIDUAL_TONE.design];

  const toPt = (e: { clientX: number; clientY: number }): Pt | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: clampX(p.x), y: clampY(p.y) };
  };
  const drawing = interactive && (tool === "pen" || tool === "arrow" || tool === "circle");
  const elsHit = interactive && (tool === "select" || tool === "erase");

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive || (e.pointerType === "mouse" && e.button !== 0)) return;
    const p = toPt(e);
    if (!p) return;
    if (drawing) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sentetik / bitmiş işaretçi: yakalama olmadan devam */ }
      const id = newAnnId(tool);
      if (tool === "pen") setDraft({ id, t: "pen", c: color, w: width, p: [r1(p.x), r1(p.y)] });
      else if (tool === "arrow") setDraft({ id, t: "arrow", c: color, w: width, x1: r1(p.x), y1: r1(p.y), x2: r1(p.x), y2: r1(p.y), a1: null, a2: null });
      else setDraft({ id, t: "circle", c: color, w: width, x: r1(p.x), y: r1(p.y), r: 3, f: true, a: null });
      e.preventDefault();
    } else if (tool === "select" && e.target === e.currentTarget) {
      onSelect?.(null);
    }
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (draft) {
      const p = toPt(e);
      if (!p) return;
      if (draft.t === "pen") {
        const n = draft.p.length;
        const lx = draft.p[n - 2], ly = draft.p[n - 1];
        if (Math.hypot(p.x - lx, p.y - ly) >= 1.6 && n / 2 < ANN_MAX_PEN_POINTS) setDraft({ ...draft, p: [...draft.p, r1(p.x), r1(p.y)] });
      } else if (draft.t === "arrow") setDraft({ ...draft, x2: r1(p.x), y2: r1(p.y) });
      else if (draft.t === "circle") setDraft({ ...draft, r: r1(Math.min(400, Math.max(3, Math.hypot(p.x - draft.x, p.y - draft.y)))) });
    } else if (resize) {
      const p = toPt(e);
      if (!p) return;
      setResize({ ...resize, moved: resizeEl(resize.el, resize.h, p, front, false) });
    } else if (drag) {
      const p = toPt(e);
      if (!p) return;
      setDrag({ ...drag, moved: moveEl(drag.el, p.x - drag.start.x, p.y - drag.start.y, front, false) });
    }
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (draft) {
      const d = draft;
      setDraft(null);
      const okEl = d.t === "pen" ? d.p.length >= 4 : d.t === "arrow" ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) >= 8 : d.t === "circle" ? d.r >= 6 : false;
      if (okEl) onCreate?.(withTargets(d, front));
      return;
    }
    if (resize) {
      const p = toPt(e);
      const r = resize;
      setResize(null);
      if (p) onChange?.(resizeEl(r.el, r.h, p, front, true));
      return;
    }
    if (drag) {
      const p = toPt(e);
      const d = drag;
      setDrag(null);
      if (p && Math.hypot(p.x - d.start.x, p.y - d.start.y) > 0.5) onChange?.(moveEl(d.el, p.x - d.start.x, p.y - d.start.y, front, true));
      return;
    }
    if (interactive && (tool === "bubble" || tool === "text") && e.target === e.currentTarget) {
      const p = toPt(e);
      if (p) onPlace?.(tool, p);
    }
  };
  const elDown = (el: AnnEl) => (e: ReactPointerEvent<SVGGElement>) => {
    if (!interactive) return;
    if (tool === "erase") { e.stopPropagation(); onErase?.(el.id); return; }
    if (tool === "select") {
      e.stopPropagation();
      const p = toPt(e);
      if (!p) return;
      e.preventDefault();
      try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* yakalama olmadan devam */ }
      onSelect?.(el.id);
      setDrag({ id: el.id, start: p, el, moved: el });
    }
  };

  const handleDown = (el: AnnEl, h: Handle) => (e: ReactPointerEvent<SVGElement>) => {
    if (!interactive || tool !== "select") return;
    e.stopPropagation();
    // Tarayıcının yerel sürükleme / metin seçimi başlatıp işaretçiyi iptal etmesini (pointercancel) önle.
    e.preventDefault();
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* yakalama olmadan devam */ }
    setResize({ id: el.id, h, el, moved: el });
  };

  const live = resize ?? drag;
  const shown = (live ? els.map((x) => (x.id === live.id ? live.moved : x)) : els);
  const all = draft ? [...shown, draft] : shown;
  const order = (t: AnnEl["t"]) => ({ circle: 0, pen: 1, arrow: 2, text: 3, bubble: 4 })[t];
  const sorted = [...all].sort((a, b) => order(a.t) - order(b.t));
  const bubbleNo = new Map(els.filter((x) => x.t === "bubble").map((x, i) => [x.id, i + 1]));
  const sel = selectedId ? all.find((x) => x.id === selectedId) : null;
  const openB = openBubbleId ? els.find((x): x is Extract<AnnEl, { t: "bubble" }> => x.id === openBubbleId && x.t === "bubble") : undefined;
  const openPos = openB ? elPosition(openB, front) : null;
  const usedColors = [...new Set(all.filter((x) => x.t === "arrow").map((x) => x.c))];

  return (
    <div>
      <div className={css.stageWrap} ref={wrapRef} data-ann-stagewrap>
        <div className={css.stage} data-ann-stage data-ann-tool={tool}>
          <div className={css.bgBox} style={{ left: `${ANN_BG_BOX.left}%`, width: `${ANN_BG_BOX.width}%` }} data-ann-bg>
            <ConnectionBodygraph prims={prims} label="Human Design BodyGraph" logoSrc={null} sizeClass="h-full w-full" />
          </div>
          <svg
            ref={svgRef}
            viewBox={ANN_CANVAS_VIEWBOX}
            className={drawing || tool === "bubble" || tool === "text" || drag || resize ? css.overlay : css.overlayIdle}
            role="group"
            aria-label="Çizim ve not katmanı"
            data-ann-overlay
            data-ann-hidden={hidden ? "1" : "0"}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { setDraft(null); setDrag(null); setResize(null); }}
            style={{ cursor: drawing ? "crosshair" : tool === "bubble" || tool === "text" ? "copy" : tool === "erase" ? "not-allowed" : "default" }}
          >
            <defs>
              {usedColors.map((c) => (
                <marker key={c} id={`ann-arrow-${c}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={ANN_COLORS[c]} />
                </marker>
              ))}
            </defs>
            {/* Boş alan da işaretçi olayı alsın (çizim başlangıcı). */}
            <rect x={X0} y={Y0} width={ANN_CANVAS.width} height={ANN_CANVAS.height} fill="transparent" pointerEvents="none" />
            {!hidden && sorted.map((el) => {
              const col = ANN_COLORS[el.c];
              const hitProps = {
                "data-ann-el": el.id,
                "data-ann-type": el.t,
                onPointerDown: elDown(el),
                style: { pointerEvents: elsHit || (!interactive && el.t === "bubble") ? ("auto" as const) : ("none" as const), cursor: elsHit ? (tool === "erase" ? "not-allowed" : "move") : el.t === "bubble" ? "pointer" : undefined },
              };
              switch (el.t) {
                case "pen": {
                  const pts = el.p.reduce<string[]>((a, v, i) => (i % 2 === 0 ? [...a, `${v}`] : [...a.slice(0, -1), `${a[a.length - 1]},${v}`]), []).join(" ");
                  return (
                    <g key={el.id} {...hitProps}>
                      <polyline points={pts} fill="none" stroke="transparent" strokeWidth={Math.max(14, el.w * 3)} strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={pts} fill="none" stroke={col} strokeWidth={el.w} strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  );
                }
                case "arrow":
                  return (
                    <g key={el.id} {...hitProps} data-ann-target={`${el.a1 ? `${el.a1.k}:${el.a1.id}` : ""}>${el.a2 ? `${el.a2.k}:${el.a2.id}` : ""}`}>
                      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={14} />
                      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={col} strokeWidth={el.w} strokeLinecap="round" markerEnd={`url(#ann-arrow-${el.c})`} />
                    </g>
                  );
                case "circle":
                  return (
                    <g key={el.id} {...hitProps} data-ann-target={el.a ? `${el.a.k}:${el.a.id}` : ""}>
                      <circle cx={el.x} cy={el.y} r={el.r} fill={el.f ? col : "transparent"} fillOpacity={el.f ? 0.14 : 0} stroke={col} strokeWidth={el.w} />
                    </g>
                  );
                case "text": {
                  const p = elPosition(el, front);
                  return (
                    <g key={el.id} {...hitProps} data-ann-x={r1(p.x)} data-ann-y={r1(p.y)}>
                      <text x={p.x} y={p.y} fontSize={el.z} fontWeight={700} fill={col} stroke="#fff" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round"
                        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>{el.s}</text>
                    </g>
                  );
                }
                case "bubble": {
                  const p = elPosition(el, front);
                  const no = bubbleNo.get(el.id) ?? 0;
                  const r = bubbleR(el);
                  const fs = Math.max(9, Math.round(r * 0.95));
                  const marker = (
                    <>
                      <circle cx={p.x} cy={p.y} r={r + 5} fill="transparent" />
                      <circle cx={p.x} cy={p.y} r={r} fill={col} stroke="#fff" strokeWidth={Math.max(2, r * 0.22)} />
                      <text x={p.x} y={p.y + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight={800} fill="#fff" style={{ fontFamily: "system-ui, sans-serif" }}>{no}</text>
                    </>
                  );
                  const common = {
                    ...hitProps, "data-ann-x": r1(p.x), "data-ann-y": r1(p.y), "data-ann-anchor": el.a ? `${el.a.k}:${el.a.id}` : "", "data-ann-r": r, "data-ann-mode": el.m ?? "pop",
                    role: !interactive ? "button" : undefined, tabIndex: !interactive ? 0 : undefined, "aria-label": `Not ${no}${el.a ? ` · ${anchorLabel(el.a)}` : ""}`,
                  };
                  if (el.m === "in") {
                    // Not metni harita üzerinde kutu içinde: kutu boyutu tutamaçla değişir; uzun metin kutu içinde KAYAR (kesilmez).
                    const bx = bubbleBox(el);
                    const editing = interactive && tool === "select" && selectedId === el.id && !!onNoteText;
                    return (
                      <g key={el.id} {...common} data-ann-bw={bx.w} data-ann-bh={bx.h}>
                        <rect x={p.x} y={p.y} width={bx.w} height={bx.h} rx={10} fill="#fff" fillOpacity={0.97} stroke={col} strokeWidth={2} />
                        <foreignObject x={p.x} y={p.y} width={bx.w} height={bx.h} style={{ pointerEvents: editing || !interactive ? "auto" : "none" }}>
                          {editing ? (
                            <textarea className={css.boxEdit} style={{ paddingTop: r + 4 }} value={el.n} maxLength={ANN_MAX_NOTE} aria-label={`Not ${no} metni`} data-ann-box-input={el.id}
                              onPointerDown={(ev) => ev.stopPropagation()} onFocus={() => onNoteEdit?.("begin")} onBlur={() => onNoteEdit?.("end")}
                              onChange={(ev) => onNoteText?.(el.id, ev.target.value.replace(/[<>]/g, ""))} placeholder="Notu buraya yazın…" />
                          ) : (
                            <div className={css.boxText} style={{ paddingTop: r + 4 }} data-ann-box-text={el.id}>{el.n.trim() ? el.n : <em>(boş not)</em>}</div>
                          )}
                        </foreignObject>
                        {marker}
                      </g>
                    );
                  }
                  return (
                    <g key={el.id} {...common}
                      onClick={!interactive ? () => onBubble?.(el.id) : undefined}
                      // Dokunma / kalem: bazı cihazlarda tıklama olayı gecikir veya üretilmez → bırakmada da aç (aynı kimlik; çift tetik zararsız).
                      onPointerUp={!interactive ? (ev) => { if (ev.pointerType !== "mouse") onBubble?.(el.id); } : undefined}
                      onKeyDown={!interactive ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onBubble?.(el.id); } } : undefined}>
                      {marker}
                    </g>
                  );
                }
              }
            })}
            {!hidden && sel && interactive ? (() => { const b = bbox(sel, front); return <rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill="none" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" data-ann-selection={sel.id} />; })() : null}
            {!hidden && sel && interactive && tool === "select" ? handles(sel, front).map((hd) => (
              <g key={hd.h} data-ann-handle={hd.h} onPointerDown={handleDown(els.find((x) => x.id === sel.id) ?? sel, hd.h)} style={{ cursor: hd.h === "box" ? "nwse-resize" : "grab", pointerEvents: "auto" }}>
                <circle cx={hd.x} cy={hd.y} r={16} fill="transparent" />
                <rect x={hd.x - 7} y={hd.y - 7} width={14} height={14} rx={3} fill="#fff" stroke="#7c3aed" strokeWidth={2.5} />
              </g>
            )) : null}
          </svg>
          {openB && openPos && !hidden && openB.m !== "in" ? (
            <div className={`${css.pop} ${openPos.y < Y0 + 220 ? css.popBelow : ""}`} role="dialog" aria-label={`Not ${bubbleNo.get(openB.id) ?? ""}`} data-ann-popover={openB.id}
              style={{ left: `${((openPos.x - X0) / ANN_CANVAS.width) * 100}%`, top: `${((openPos.y - Y0) / ANN_CANVAS.height) * 100}%` }}>
              <button type="button" className={css.popClose} aria-label="Notu kapat" onClick={() => onBubble?.(null)}>×</button>
              <span className={css.popHead}>Not {bubbleNo.get(openB.id)}{openB.a ? ` · ${anchorLabel(openB.a)}` : ""}</span>
              <div className={css.popBody} data-ann-popover-body>{openB.n.trim() ? openB.n : <em>(boş not)</em>}</div>
              {onExpandBubble && openB.n.trim() ? (
                <button type="button" className={css.popExpand} onClick={() => onExpandBubble(openB.id)} data-ann-popover-expand>
                  <Maximize2 size={14} aria-hidden /> Genişlet
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className={css.legend} data-hd-premium-legend>
        <span><span className={css.dot} style={{ background: pColor }} />Kişilik (bilinçli)</span>
        <span><span className={css.dot} style={{ background: dColor }} />Tasarım (bilinçsiz)</span>
        <span>Çizgili / iki renkli: ikisi birden</span>
      </p>
    </div>
  );
}
