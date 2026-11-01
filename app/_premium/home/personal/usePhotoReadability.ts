"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — uzmanın kendi fotoğrafı üzerindeki karşılama metninin İSTEMCİ piksel kapısı.
 *
 * Sunucu fotoğraf piksellerini ölçemez (contrast.ts). Bu kanca, ekranda GERÇEKTEN gösterilen <img> öğesini (aynı köken
 * blob: URL → tuval kirlenmez) küçük bir ekran dışı tuvale çizer ve metin satırlarının tam altındaki pikselleri örnekler:
 *  - eşleme tarayıcının hesapladığı değerlerden yapılır: object-fit cover + object-position (masaüstü / ≤ 640 px mobil
 *    odak CSS'ten gelir) + transform scale (yakınlaştırma) → getBoundingClientRect;
 *  - metnin altındaki MEVCUT katmanlar (karşılama gölgesi, sayfa fotoğrafı katmanı) hesaplanan stillerinden okunur ve
 *    piksellerle birleştirilir; okunamayan katman yok sayılır (tona uygun yazıda bu, sonucu yalnız temkinli yapar);
 *  - metin renkleri hesaplanan stillerden (gradyan yazıda gradyan durak renkleri), hedef WCAG boyutuna göre (4,5 / 3).
 * Sonuç: photoReadability (saf) → { status, ratio, alpha }. Her hata / yüklenmemiş fotoğraf → "unmeasured".
 *
 * Fotoğrafın kendisi DEĞİŞTİRİLMEZ; çağıran yalnız metnin arkasına yerel katman çizer.
 * Stüdyo ayrı bir bileşen ağacında olduğu için son ölçüm modül düzeyindeki küçük bir depoya yazılır
 * (usePhotoReadabilityStatus ile okunur).
 */
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import {
  mixRgb, photoReadability, scrimForTone, targetForText, type ReadabilityStatus, type RGB, type TextSample,
} from "@/lib/workspace/photoReadability";

export type PhotoReadabilityState = {
  /** Ölçüm bu tasarım için geçerli mi (fotoğraf A/B karşılamasında veya tüm sayfada). false → gösterilecek ölçüm yok. */
  applicable: boolean;
  status: ReadabilityStatus;
  /** Uygulanan katmanla en kötü durum oranı (aşağı yuvarlanmış); ölçülmediyse null. */
  ratio: number | null;
  /** Katmansız (yalnız mevcut tasarım katmanlarıyla) oran. */
  ratioBefore: number | null;
  /** Metnin arkasına eklenecek katman yoğunluğu (0–0,85). */
  alpha: number;
  target: number;
  scope: "hero" | "page" | null;
  tone: "light" | "dark";
  /** Örneklenen noktaların fotoğraf üzerinde olan oranı (0–1). */
  onPhoto: number;
  samples: number;
};

export const UNMEASURED: PhotoReadabilityState = Object.freeze({
  applicable: false, status: "unmeasured", ratio: null, ratioBefore: null, alpha: 0, target: 4.5, scope: null, tone: "light", onPhoto: 0, samples: 0,
}) as PhotoReadabilityState;

/* ── Modül düzeyi depo (stüdyo için) ─────────────────────────────────────── */
let snapshot: PhotoReadabilityState = UNMEASURED;
const listeners = new Set<() => void>();
function same(a: PhotoReadabilityState, b: PhotoReadabilityState): boolean {
  return (Object.keys(a) as (keyof PhotoReadabilityState)[]).every((k) => a[k] === b[k]);
}
export function publishPhotoReadability(next: PhotoReadabilityState): void {
  if (same(snapshot, next)) return;
  snapshot = next;
  listeners.forEach((l) => l());
}
export function subscribePhotoReadability(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getPhotoReadabilitySnapshot(): PhotoReadabilityState {
  return snapshot;
}
/** Ana sayfa karşılamasının son okunabilirlik ölçümü (stüdyo rozeti için). SSR'de ölçülmedi. */
export function usePhotoReadabilityStatus(): PhotoReadabilityState {
  return useSyncExternalStore(subscribePhotoReadability, getPhotoReadabilitySnapshot, () => UNMEASURED);
}

/* ── Piksel önbelleği ────────────────────────────────────────────────────── */
type Px = { w: number; h: number; data: Uint8ClampedArray };
const pxCache = new Map<string, Px>();
const PX_W = 256;
function photoPixels(img: HTMLImageElement): Px | null {
  const key = img.currentSrc || img.src;
  if (!key || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const hit = pxCache.get(key);
  if (hit) return hit;
  try {
    const w = Math.min(PX_W, img.naturalWidth);
    const h = Math.max(1, Math.round((img.naturalHeight * w) / img.naturalWidth));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(img, 0, 0, w, h);
    const out = { w, h, data: cx.getImageData(0, 0, w, h).data }; // kirli tuvalde SecurityError → null
    if (pxCache.size >= 4) pxCache.delete(pxCache.keys().next().value as string);
    pxCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/* ── Hesaplanan stil ayrıştırma ──────────────────────────────────────────── */
type RGBA = { c: RGB; a: number };
function parseColor(s: string): RGBA | null {
  const m = s.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  const c: RGB = [Number(m[1]), Number(m[2]), Number(m[3])];
  return c.every(Number.isFinite) && Number.isFinite(a) ? { c, a: Math.min(1, Math.max(0, a)) } : null;
}
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
type Stop = { a: number; c: RGB; pos: number | null };
type Grad =
  | { kind: "linear"; angle: number; stops: Stop[] }
  | { kind: "radial"; rx: number; ry: number; cx: number; cy: number; stops: Stop[] };
const COLOR_RE = /^(rgba?\([^)]*\))\s*(.*)$/i;
function parseStops(parts: string[], len: number): Stop[] | null {
  const stops: Stop[] = [];
  for (const p of parts) {
    const m = p.match(COLOR_RE);
    if (!m) return null;
    const col = parseColor(m[1]);
    if (!col) return null;
    const ps = m[2].trim().split(/\s+/).filter(Boolean);
    const toT = (v: string): number | null => (v.endsWith("%") ? Number(v.slice(0, -1)) / 100 : v.endsWith("px") && len > 0 ? Number(v.slice(0, -2)) / len : null);
    if (ps.length === 0) stops.push({ a: col.a, c: col.c, pos: null });
    else for (const v of ps) stops.push({ a: col.a, c: col.c, pos: toT(v) });
  }
  if (stops.length < 2) return null;
  if (stops[0].pos === null) stops[0].pos = 0;
  if (stops[stops.length - 1].pos === null) stops[stops.length - 1].pos = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].pos !== null) continue;
    let j = i;
    while (stops[j].pos === null) j++;
    const a = stops[i - 1].pos as number;
    const b = stops[j].pos as number;
    for (let k = i; k < j; k++) stops[k].pos = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  return stops;
}
const DIRS: Record<string, number> = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 };
function parseGradient(img: string, w: number, h: number): Grad | null {
  const m = img.match(/^(linear|radial)-gradient\((.*)\)$/i);
  if (!m) return null;
  const parts = splitTop(m[2]);
  if (m[1].toLowerCase() === "linear") {
    let angle = 180;
    if (/^-?[\d.]+deg$/.test(parts[0])) angle = Number(parts.shift()!.slice(0, -3));
    else if (parts[0] in DIRS) angle = DIRS[parts.shift()!];
    else if (/^to /.test(parts[0])) return null;
    const rad = (angle * Math.PI) / 180;
    const len = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
    const stops = parseStops(parts, len);
    return stops ? { kind: "linear", angle, stops } : null;
  }
  // radial: yalnız açık yarıçaplı elips ("60% 80% at 50% 50%"); anahtar sözcüklü boyutlar → ayrıştırılamaz
  const head = parts[0];
  if (COLOR_RE.test(head)) return null;
  const hm = head.replace(/\bellipse\b/, "").trim().match(/^([\d.]+)(%|px)\s+([\d.]+)(%|px)(?:\s+at\s+([\d.]+)(%|px)\s+([\d.]+)(%|px))?$/);
  if (!hm) return null;
  const L = (v: string, u: string, base: number) => (u === "%" ? (Number(v) / 100) * base : Number(v));
  const rx = L(hm[1], hm[2], w);
  const ry = L(hm[3], hm[4], h);
  const cx = hm[5] ? L(hm[5], hm[6], w) : w / 2;
  const cy = hm[7] ? L(hm[7], hm[8], h) : h / 2;
  const stops = parseStops(parts.slice(1), rx);
  return stops && rx > 0 && ry > 0 ? { kind: "radial", rx, ry, cx, cy, stops } : null;
}
function stopAt(stops: Stop[], t: number): { a: number; c: RGB } {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (t <= (first.pos as number)) return first;
  if (t >= (last.pos as number)) return last;
  for (let i = 1; i < stops.length; i++) {
    const s0 = stops[i - 1];
    const s1 = stops[i];
    const p0 = s0.pos as number;
    const p1 = s1.pos as number;
    if (t <= p1) {
      const k = p1 > p0 ? (t - p0) / (p1 - p0) : 1;
      // Ön çarpımlı karışım: saydam durak rengi sonucu etkilemez
      const c = s0.a === 0 ? s1.c : s1.a === 0 ? s0.c : mixRgb(s0.c, s1.c, k);
      return { a: s0.a + (s1.a - s0.a) * k, c };
    }
  }
  return last;
}

/** Metin ile fotoğraf arasında kalan bir katman: ekran noktasında (renk, yoğunluk). */
type Layer = { rect: DOMRect; at: (x: number, y: number) => { a: number; c: RGB } | null };
function readLayer(el: Element | null, pseudo?: "::before" | "::after"): Layer | null {
  if (!el) return null;
  const cs = getComputedStyle(el, pseudo);
  if (cs.display === "none" || cs.visibility === "hidden") return null;
  if (pseudo && (cs.content === "none" || cs.content === "normal")) return null;
  const op = Number(cs.opacity);
  const opacity = Number.isFinite(op) ? op : 1;
  const rect = el.getBoundingClientRect(); // ::before/::after burada inset: 0
  const solid = parseColor(cs.backgroundColor);
  const imgs = cs.backgroundImage && cs.backgroundImage !== "none" ? splitTop(cs.backgroundImage) : [];
  const grad = imgs.length ? parseGradient(imgs[0], rect.width, rect.height) : null;
  if (!grad && !(solid && solid.a > 0)) return null;
  return {
    rect,
    at(x, y) {
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
      let out: { a: number; c: RGB } | null = solid && solid.a > 0 ? { a: solid.a, c: solid.c } : null;
      if (grad) {
        const lx = x - rect.left;
        const ly = y - rect.top;
        let t: number;
        if (grad.kind === "linear") {
          const r = (grad.angle * Math.PI) / 180;
          const len = Math.abs(rect.width * Math.sin(r)) + Math.abs(rect.height * Math.cos(r)) || 1;
          t = ((lx - rect.width / 2) * Math.sin(r) - (ly - rect.height / 2) * Math.cos(r)) / len + 0.5;
        } else {
          t = Math.hypot((lx - grad.cx) / grad.rx, (ly - grad.cy) / grad.ry);
        }
        const g = stopAt(grad.stops, t);
        // Gradyan arka plan rengin üstündedir
        out = out ? { a: out.a + g.a * (1 - out.a), c: mixRgb(out.c, g.c, out.a + g.a * (1 - out.a) > 0 ? g.a / (out.a + g.a * (1 - out.a)) : 0) } : g;
      }
      return out ? { a: out.a * opacity, c: out.c } : null;
    },
  };
}

/* ── Fotoğraf geometrisi (ekran → görsel u, v) ───────────────────────────── */
type Geom = { toUV: (x: number, y: number) => { u: number; v: number } | null };
function posOffset(token: string | undefined, free: number): number {
  if (!token) return free * 0.5;
  if (token.endsWith("%")) return free * (Number(token.slice(0, -1)) / 100);
  if (token.endsWith("px")) return Number(token.slice(0, -2));
  return ({ left: 0, top: 0, center: free * 0.5, right: free, bottom: free } as Record<string, number>)[token] ?? free * 0.5;
}
function photoGeom(img: HTMLImageElement, clip: DOMRect): Geom | null {
  const R = img.getBoundingClientRect();
  const w = img.offsetWidth;
  const h = img.offsetHeight;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!w || !h || !iw || !ih || !R.width || !R.height) return null;
  const cs = getComputedStyle(img);
  const fit = cs.objectFit;
  const s = fit === "contain" ? Math.min(w / iw, h / ih) : fit === "fill" ? NaN : Math.max(w / iw, h / ih);
  const sx = Number.isNaN(s) ? w / iw : s;
  const sy = Number.isNaN(s) ? h / ih : s;
  const [px, py] = cs.objectPosition.split(/\s+/);
  const ox = posOffset(px, w - iw * sx);
  const oy = posOffset(py, h - ih * sy);
  const kx = R.width / w; // transform: scale (yakınlaştırma)
  const ky = R.height / h;
  return {
    toUV(x, y) {
      if (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom) return null;
      const u = ((x - R.left) / kx - ox) / (iw * sx);
      const v = ((y - R.top) / ky - oy) / (ih * sy);
      return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
    },
  };
}
function intersect(a: DOMRect, b: DOMRect): DOMRect {
  const l = Math.max(a.left, b.left);
  const t = Math.max(a.top, b.top);
  return new DOMRect(l, t, Math.max(0, Math.min(a.right, b.right) - l), Math.max(0, Math.min(a.bottom, b.bottom) - t));
}
function opaqueBackdrop(from: Element): RGB | null {
  for (let el: Element | null = from; el; el = el.parentElement) {
    const c = parseColor(getComputedStyle(el).backgroundColor);
    if (c && c.a >= 0.99) return c.c;
  }
  return null;
}

/* ── Metin öğeleri ───────────────────────────────────────────────────────── */
type TextPart = { rects: DOMRect[]; texts: TextSample[] };
function textParts(root: HTMLElement): TextPart[] {
  const out: TextPart[] = [];
  const els = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of els) {
    if (el.closest("[aria-hidden='true']")) continue;
    const nodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
    if (!nodes.length) continue;
    const rects: DOMRect[] = [];
    for (const n of nodes) {
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const q of Array.from(r.getClientRects())) if (q.width >= 2 && q.height >= 2) rects.push(q);
    }
    if (!rects.length) continue;
    const cs = getComputedStyle(el);
    const target = targetForText(parseFloat(cs.fontSize) || 16, Number(cs.fontWeight) || 400);
    const eff = parseColor(cs.color);
    const texts: TextSample[] = [];
    if (eff && eff.a > 0) texts.push({ color: eff.c, alpha: eff.a, target });
    else {
      // Gradyan yazı (background-clip: text): durak renklerinin her biri ayrı ölçülür
      const clipText = cs.backgroundClip === "text" || cs.getPropertyValue("-webkit-background-clip") === "text";
      if (clipText) {
        for (const g of splitTop(cs.backgroundImage)) {
          const m = g.match(/^(?:linear|radial)-gradient\((.*)\)$/i);
          if (!m) continue;
          for (const p of splitTop(m[1])) {
            const cm = p.match(COLOR_RE);
            const c = cm ? parseColor(cm[1]) : null;
            if (c && c.a > 0) texts.push({ color: c.c, alpha: c.a, target });
          }
        }
      }
    }
    if (texts.length) out.push({ rects, texts });
  }
  return out;
}

export type PhotoReadabilityOptions = {
  /** Fotoğraf A/B karşılamasında veya tüm sayfada ve metin fotoğrafın üzerinde olabilir mi (C düzeninde false). */
  enabled: boolean;
  scope: "hero" | "page";
  tone: "light" | "dark";
  heroRef: RefObject<HTMLElement | null>;
  textRef: RefObject<HTMLElement | null>;
  /** Tasarımın ölçümü etkileyen alanlarının imzası (fotoğraf, odak, yakınlaştırma, ton, katman, metin...). */
  signature: string;
};

const PAGE_SEL = '[data-testid="home-page-bg"]';
const SAFETY = 0.1; // hedefe güvenlik payı (örnekleme aralığı için)

function measure(o: Omit<PhotoReadabilityOptions, "heroRef" | "textRef" | "signature">, hero: HTMLElement, text: HTMLElement): PhotoReadabilityState | null {
  const fail: PhotoReadabilityState = { ...UNMEASURED, applicable: true, scope: o.scope, tone: o.tone };
  const pageEl = o.scope === "page" ? document.querySelector<HTMLElement>(PAGE_SEL) : null;
  const img = (o.scope === "page" ? pageEl : hero)?.querySelector<HTMLImageElement>("picture img") ?? null;
  if (!img) return fail;
  const px = photoPixels(img);
  if (!px) return fail;
  const holder = img.closest("picture")?.parentElement ?? img.parentElement;
  let clip = (holder ?? img).getBoundingClientRect();
  clip = intersect(clip, (o.scope === "page" ? pageEl ?? hero : hero).getBoundingClientRect());
  if (o.scope === "page") clip = intersect(clip, new DOMRect(0, 0, window.innerWidth, window.innerHeight));
  const geom = photoGeom(img, clip);
  if (!geom) return fail;
  const layers = (o.scope === "page"
    ? [readLayer(pageEl, "::after"), readLayer(hero, "::before")]
    : [readLayer(hero, "::before"), ...Array.from(hero.children).filter((c) => c.getAttribute("aria-hidden") === "true" && !c.querySelector("img")).map((c) => readLayer(c))]
  ).filter((l): l is Layer => l !== null);
  const backdrop = o.scope === "hero" ? opaqueBackdrop(hero) : null;

  const parts = textParts(text);
  if (!parts.length) return fail;
  let onPhoto = 0;
  let total = 0;
  const groups = parts.map((part) => {
    const pixels: RGB[] = [];
    for (const r of part.rects) {
      const cols = Math.max(3, Math.min(14, Math.round(r.width / 28)));
      for (let i = 0; i <= cols; i++) {
        for (const fy of [0.3, 0.7]) {
          const X = r.left + (r.width * i) / cols;
          const Y = r.top + r.height * fy;
          total++;
          const uv = geom.toUV(X, Y);
          if (!uv) {
            if (backdrop) pixels.push(backdrop);
            continue;
          }
          onPhoto++;
          const cx = Math.round(uv.u * (px.w - 1));
          const cy = Math.round(uv.v * (px.h - 1));
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const x = Math.min(px.w - 1, Math.max(0, cx + dx));
              const y = Math.min(px.h - 1, Math.max(0, cy + dy));
              const k = (y * px.w + x) * 4;
              let c: RGB = [px.data[k], px.data[k + 1], px.data[k + 2]];
              for (const L of layers) {
                const l = L.at(X, Y);
                if (l && l.a > 0) c = mixRgb(c, l.c, l.a);
              }
              pixels.push(c);
            }
          }
        }
      }
    }
    return { pixels, texts: part.texts };
  });
  if (o.scope === "page" && onPhoto === 0) return null; // metin görünür alanın dışında: son ölçüm korunur
  const r = photoReadability({ groups, scrim: scrimForTone(o.tone), margin: SAFETY });
  if (r.status === "unmeasured") return fail;
  return {
    applicable: true, status: r.status, ratio: r.ratio, ratioBefore: r.ratioBefore, alpha: r.alpha, target: r.target,
    scope: o.scope, tone: o.tone, onPhoto: total ? Math.round((onPhoto / total) * 100) / 100 : 0, samples: r.samples,
  };
}

/**
 * Karşılama metninin fotoğraf üzerindeki okunabilirliğini ölçer; boyut / fotoğraf / odak / yakınlaştırma / ton /
 * görünüm modu değişince yeniden ölçer. Sonucu ayrıca stüdyo deposuna yayınlar.
 */
export function usePhotoReadability(opts: PhotoReadabilityOptions): PhotoReadabilityState {
  const { enabled, scope, tone, heroRef, textRef, signature } = opts;
  const key = `${enabled ? 1 : 0}|${scope}|${tone}|${signature}`;
  const [res, setRes] = useState<{ key: string; state: PhotoReadabilityState } | null>(null);

  useEffect(() => {
    if (!enabled) {
      publishPhotoReadability(UNMEASURED);
      return;
    }
    const hero = heroRef.current;
    const text = textRef.current;
    if (!hero || !text) return;
    let raf = 0;
    let alive = true;
    const loadBound = new Set<HTMLImageElement>();
    const run = () => {
      raf = 0;
      if (!alive) return;
      let state: PhotoReadabilityState | null;
      try {
        state = measure({ enabled, scope, tone }, hero, text);
      } catch {
        state = { ...UNMEASURED, applicable: true, scope, tone };
      }
      // Yüklenmemiş fotoğraf: yüklenince yeniden ölç
      const root = scope === "page" ? document.querySelector(PAGE_SEL) : hero;
      root?.querySelectorAll<HTMLImageElement>("picture img").forEach((im) => {
        if (loadBound.has(im)) return;
        loadBound.add(im);
        im.addEventListener("load", schedule);
      });
      if (!state) return;
      const s = state;
      setRes((prev) => (prev && prev.key === key && same(prev.state, s) ? prev : { key, state: s }));
      publishPhotoReadability(s);
    };
    function schedule() {
      if (!raf && alive) raf = requestAnimationFrame(run);
    }
    const ro = new ResizeObserver(schedule);
    ro.observe(text);
    ro.observe(hero);
    const mo = new MutationObserver(schedule);
    const watchRoot = hero.closest("main") ?? document.body;
    mo.observe(watchRoot, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset", "data-pw-mode", "data-tone", "data-shade"] });
    window.addEventListener("resize", schedule);
    if (scope === "page") window.addEventListener("scroll", schedule, { passive: true });
    document.fonts?.ready.then(schedule).catch(() => undefined);
    schedule();
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      loadBound.forEach((im) => im.removeEventListener("load", schedule));
    };
  }, [enabled, scope, tone, heroRef, textRef, key]);

  // Karşılama kaldırılınca stüdyo "ölçülmedi"ye döner (yeniden ölçümlerde titreme olmasın diye yalnız ayrılırken)
  useEffect(() => () => publishPhotoReadability(UNMEASURED), []);

  if (!enabled) return UNMEASURED;
  if (!res) return { ...UNMEASURED, applicable: true, scope, tone };
  return res.state;
}
