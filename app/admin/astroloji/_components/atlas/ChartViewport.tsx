"use client";

/**
 * Gökyüzü Atlası — harita GÖRÜNTÜLEYİCİSİ (Aşama D3.1): yakınlaştır / uzaklaştır / sürükle / sığdır.
 *
 * YALNIZ GÖRÜNTÜLEME KATMANI: çocuk (gerçek SVG harita) hiç değiştirilmez ve yeniden çizilmez; yalnız sarmalayıcıya
 * CSS dönüşümü (translate + scale) uygulanır. Gezegen konumu, derece, ev, açı, ASC/MC vb. hiçbir değer etkilenmez;
 * kayıt / Word / PDF bu durumu hiç görmez (yalnız bu bileşenin yerel durumu).
 *
 * Başlangıç = sığdır (ölçek 1): çocuk görüntüleme alanının tamamını kaplar, SVG viewBox oranı korunur → tam daire.
 * Fare tekerleği yalnız harita ÜZERİNDEYKEN yakınlaştırır (imleç noktası sabit kalır); sayfa kaydırması başka yerde
 * normaldir. Basılı tutup sürükleme yalnız yakınlaştırılmışken (ölçek > 1) haritayı kaydırır; içerik görüntüleme
 * alanının dışına kaçamaz (sınırlı). Dokunmatik: iki parmak = yakınlaştır, tek parmak = (yakınken) sürükle; ölçek 1'de
 * tek parmak dikey sayfa kaydırmasına bırakılır (touch-action: pan-y). Klavye: + / − / 0 ve ok tuşları.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, Plus } from "lucide-react";

const MIN = 1;
const MAX = 8;
type View = { s: number; x: number; y: number };
const FIT: View = { s: 1, x: 0, y: 0 };

export default function ChartViewport({ children, className = "", label = "Harita görüntüleyici" }: { children: ReactNode; className?: string; label?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>(FIT);
  const viewRef = useRef<View>(FIT);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const apply = useCallback((next: View) => {
    const el = boxRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const s = Math.min(MAX, Math.max(MIN, next.s));
    // Sınır: ölçeklenmiş içerik görüntüleme alanını her zaman kaplar (köşeden boşluğa kaçmaz).
    const x = Math.min(0, Math.max(w * (1 - s), next.x));
    const y = Math.min(0, Math.max(h * (1 - s), next.y));
    const v = s === 1 ? FIT : { s, x, y };
    viewRef.current = v;
    setView(v);
  }, []);

  /** (px, py) görüntüleme alanı koordinatı sabit kalacak şekilde yeni ölçek. */
  const zoomAt = useCallback(
    (px: number, py: number, s2: number) => {
      const v = viewRef.current;
      const s = Math.min(MAX, Math.max(MIN, s2));
      const k = s / v.s;
      apply({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    },
    [apply],
  );
  const zoomCenter = (factor: number) => {
    const el = boxRef.current;
    if (!el) return;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, viewRef.current.s * factor);
  };

  // Tekerlek: pasif olmayan dinleyici (yalnız harita üzerindeyken sayfa kaydırması engellenir).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * r.height : e.deltaY;
      zoomAt(e.clientX - r.left, e.clientY - r.top, viewRef.current.s * Math.exp(-Math.max(-120, Math.min(120, dy)) * 0.0022));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Görüntüleme alanı boyutu değişince (pencere / panel) sınırlar yeniden uygulanır.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => apply(viewRef.current));
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-viewport-control]")) return;
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: viewRef.current.s };
    }
    // Ölçek 1'de tek dokunuş sayfaya bırakılır (dikey kaydırma); fare/yakın görünümde yakalanır.
    if (viewRef.current.s > 1 || pointers.current.size === 2 || e.pointerType === "mouse") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* işaretçi zaten bırakılmış olabilir; yakalama olmadan da hareket izlenir */
      }
      if (viewRef.current.s > 1) setDragging(true);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.current.s * (d / pinch.current.d));
      return;
    }
    const v = viewRef.current;
    if (v.s > 1) apply({ s: v.s, x: v.x + (cur.x - prev.x), y: v.y + (cur.y - prev.y) });
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 48;
    const v = viewRef.current;
    if (e.key === "+" || e.key === "=") zoomCenter(1.35);
    else if (e.key === "-" || e.key === "_") zoomCenter(1 / 1.35);
    else if (e.key === "0") apply(FIT);
    else if (v.s > 1 && e.key === "ArrowLeft") apply({ ...v, x: v.x + step });
    else if (v.s > 1 && e.key === "ArrowRight") apply({ ...v, x: v.x - step });
    else if (v.s > 1 && e.key === "ArrowUp") apply({ ...v, y: v.y + step });
    else if (v.s > 1 && e.key === "ArrowDown") apply({ ...v, y: v.y - step });
    else return;
    e.preventDefault();
  };

  const zoomed = view.s > 1;
  const ctl =
    "flex h-8 w-8 items-center justify-center rounded-lg text-[#F6F2EA]/85 transition hover:bg-white/10 hover:text-[#F6E7C3] disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F]";

  return (
    <div className={`relative h-full w-full min-h-0 ${className}`} data-testid="atlas-chart-viewport" data-scale={view.s.toFixed(2)}>
      <div
        ref={boxRef}
        role="group"
        aria-label={`${label} — tekerlek veya + / − ile yakınlaştırın, sürükleyerek gezinin, 0 ile sığdırın`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDragStart={(e) => e.preventDefault()}
        onDoubleClick={(e) => {
          const p = local(e);
          if (viewRef.current.s >= 3.5) apply(FIT);
          else zoomAt(p.x, p.y, viewRef.current.s * 1.8);
        }}
        className={`relative h-full w-full select-none overflow-hidden rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-[#D9B56F]/60 ${zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"}`}
        style={{ touchAction: zoomed ? "none" : "pan-y" }}
      >
        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "0 0" }}>
          {children}
        </div>
      </div>
      {/* Kontroller: sağ üst köşe (dairesel haritada boş alan); harita noktalarını örtmez. */}
      <div
        className="absolute right-2 top-2 z-10 flex flex-col items-center gap-0.5 rounded-xl border border-white/12 bg-[#0b1234]/80 p-1 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur"
        data-viewport-control=""
        role="toolbar"
        aria-label="Harita yakınlaştırma"
      >
        <button type="button" className={ctl} onClick={() => zoomCenter(1.35)} disabled={view.s >= MAX} aria-label="Yakınlaştır" title="Yakınlaştır (+)" data-testid="atlas-zoom-in">
          <Plus className="h-4 w-4" />
        </button>
        <span className="py-0.5 text-[10px] tabular-nums text-[#F6F2EA]/60" aria-live="polite" data-testid="atlas-zoom-level">
          {Math.round(view.s * 100)}%
        </span>
        <button type="button" className={ctl} onClick={() => zoomCenter(1 / 1.35)} disabled={!zoomed} aria-label="Uzaklaştır" title="Uzaklaştır (−)" data-testid="atlas-zoom-out">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" className={ctl} onClick={() => apply(FIT)} disabled={!zoomed} aria-label="Sığdır" title="Sığdır / sıfırla (0)" data-testid="atlas-zoom-fit">
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
