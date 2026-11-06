/**
 * KİŞİSEL DİJİTAL OFİS (P4) — fotoğraf odak / kırpım yardımcıları (saf; DOM YOK).
 *
 * Masaüstü ve mobil odak AYRIDIR (bg.focus / bg.mobileFocus; mobil yalnız bg.separateMobile açıkken kullanılır).
 * Odak yüzde (0–100) cinsindendir; görsel hiçbir zaman esnetilmez (object-fit: cover + object-position + ölçek).
 */
import type { Point, WorkspaceDesign } from "./schema";

export type FocusTarget = "desktop" | "mobile" | "important";
type Bg = WorkspaceDesign["bg"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function clampPoint(p: Point): Point {
  return { x: round1(clamp(p.x, 0, 100)), y: round1(clamp(p.y, 0, 100)) };
}

/** İşaretçi konumu (istemci px) → kutu içinde yüzde nokta. */
export function pointFromRect(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  return clampPoint({ x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 });
}

/** Klavye ile odak taşıma (ok tuşları); adım yüzde. */
export function nudgePoint(p: Point, key: string, step = 2): Point | null {
  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const v = d[key];
  return v ? clampPoint({ x: p.x + v[0], y: p.y + v[1] }) : null;
}

/** Görünümde kullanılan odak: mobil ayrı değilse masaüstü odağı mobilde de geçerlidir. */
export function effectiveFocus(bg: Bg, view: "desktop" | "mobile"): Point {
  return view === "mobile" && bg.separateMobile ? bg.mobileFocus : bg.focus;
}

/** Kırpım önizlemesi stili (prototip cropPreview ile aynı). */
export function cropStyle(focus: Point, zoom: number): { objectPosition: string; transform: string; transformOrigin: string } {
  return { objectPosition: `${focus.x}% ${focus.y}%`, transform: `scale(${zoom})`, transformOrigin: `${focus.x}% ${focus.y}%` };
}

/** Önemli bölge halkasının kutu içindeki genişlik / yükseklik yüzdesi (r: kısa kenara oran). */
export function importantRing(imp: Bg["important"], w: number, h: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: imp.r * 2, height: imp.r * 2 };
  const m = Math.min(w, h);
  return { width: ((imp.r * m) / w) * 2, height: ((imp.r * m) / h) * 2 };
}

/** Hedefe göre noktayı tasarıma yazar (yeni bg nesnesi). */
export function setFocusPoint(bg: Bg, target: FocusTarget, p: Point): Bg {
  const q = clampPoint(p);
  if (target === "important") return { ...bg, important: { ...bg.important, x: q.x, y: q.y } };
  if (target === "mobile") return { ...bg, mobileFocus: q };
  return { ...bg, focus: q };
}

export function targetPoint(bg: Bg, target: FocusTarget): Point {
  if (target === "important") return { x: bg.important.x, y: bg.important.y };
  return target === "mobile" ? bg.mobileFocus : bg.focus;
}
