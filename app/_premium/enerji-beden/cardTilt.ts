/**
 * Premium kartlar için ölçülü fare eğimi + katman derinliği (owner onaylı prototiplerdeki etkileşimin React karşılığı).
 * Yalnız görsel: kartın CSS değişkenlerini (--rx/--ry/--px/--py/--gx/--gy) günceller; dokunmatikte ve
 * "hareketi azalt" açıkken çalışmaz. Kare başına en çok bir güncelleme (rAF).
 */
import type { PointerEvent as ReactPointerEvent } from "react";

const TILT_PROPS = ["--rx", "--ry", "--px", "--py", "--gx", "--gy"] as const;
const MAX_X = 3.5;
const MAX_Y = 4.5;

const frames = new WeakMap<HTMLElement, number>();

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function tiltMove(e: ReactPointerEvent<HTMLElement>, strength = 0.6) {
  if (e.pointerType === "touch" || reducedMotion()) return;
  const el = e.currentTarget;
  const { clientX, clientY } = e;
  const prev = frames.get(el);
  if (prev !== undefined) cancelAnimationFrame(prev);
  frames.set(
    el,
    requestAnimationFrame(() => {
      frames.delete(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = clientX - r.left;
      const y = clientY - r.top;
      const px = Math.min(Math.max(x / r.width - 0.5, -0.5), 0.5);
      const py = Math.min(Math.max(y / r.height - 0.5, -0.5), 0.5);
      el.dataset.tilting = "true";
      el.style.setProperty("--rx", `${(-py * 2 * MAX_X * strength).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * 2 * MAX_Y * strength).toFixed(2)}deg`);
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
      el.style.setProperty("--gx", `${x.toFixed(0)}px`);
      el.style.setProperty("--gy", `${y.toFixed(0)}px`);
    }),
  );
}

export function tiltLeave(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const prev = frames.get(el);
  if (prev !== undefined) {
    cancelAnimationFrame(prev);
    frames.delete(el);
  }
  delete el.dataset.tilting;
  for (const p of TILT_PROPS) el.style.removeProperty(p);
}
