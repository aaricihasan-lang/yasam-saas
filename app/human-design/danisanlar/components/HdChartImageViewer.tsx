"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { runInEffect } from "@/lib/runInEffect";

/**
 * HD harita görseli tam ekran görüntüleyici (HD-0 görsel UX).
 *
 * - YALNIZ verilen signedUrl'yi kullanır; public URL / storage path üretmez,
 *   kullanıcıya metin olarak göstermez.
 * - Stacking-context bağımsızlığı: overlay createPortal ile doğrudan document.body
 *   altına render edilir (sabit uygulama header'ının ardında kalmaz). SSR-safe:
 *   client mount'una kadar (mounted) null döner (proje ImageLightbox deseni).
 * - Zoom: fare tekerleği (imleç-merkezli) + / − / %100 / Ekrana Sığdır butonları.
 *   Sınır: %50–%500 (doğal piksele göre; %100 = 1:1). İlk açılış: Ekrana Sığdır.
 * - Pan: pointer (fare + dokunma) ile sürükleme; iki parmak pinch zoom.
 * - a11y: role="dialog", aria-modal, Escape ile kapatma, focus trap,
 *   kapanınca odak açan elemana döner, body scroll kilidi + geri alma.
 * - Yeni npm paketi YOK; yalnız React + DOM olayları.
 */

const MIN_SCALE = 0.5; // %50
const MAX_SCALE = 5; // %500
const WHEEL_STEP = 0.0015;
const BTN_STEP = 1.25;

type Props = {
  signedUrl: string;
  onClose: () => void;
};

type View = { scale: number; tx: number; ty: number };
type Size = { w: number; h: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Pan sınırı: görsel container'dan tamamen kaçamaz (büyükse kenarlar içeride,
 *  küçükse ortalanır). */
function clampTranslate(tx: number, ty: number, s: number, nat: Size, box: Size): { tx: number; ty: number } {
  const sw = nat.w * s;
  const sh = nat.h * s;
  const x = sw <= box.w ? (box.w - sw) / 2 : clamp(tx, box.w - sw, 0);
  const y = sh <= box.h ? (box.h - sh) / 2 : clamp(ty, box.h - sh, 0);
  return { tx: x, ty: y };
}

/** İmleç-merkezli zoom: (cx,cy) sabit kalacak şekilde yeni ölçek uygular. */
function zoomTo(prev: View, nextScaleRaw: number, cx: number, cy: number, nat: Size, box: Size): View {
  const s2 = clamp(nextScaleRaw, MIN_SCALE, MAX_SCALE);
  const imgX = (cx - prev.tx) / prev.scale;
  const imgY = (cy - prev.ty) / prev.scale;
  const { tx, ty } = clampTranslate(cx - imgX * s2, cy - imgY * s2, s2, nat, box);
  return { scale: s2, tx, ty };
}

/** Ekrana sığdır + ortala. */
function fitView(nat: Size, box: Size): View {
  const s = box.w && box.h && nat.w && nat.h
    ? clamp(Math.min(box.w / nat.w, box.h / nat.h), MIN_SCALE, MAX_SCALE)
    : 1;
  return { scale: s, tx: (box.w - nat.w * s) / 2, ty: (box.h - nat.h * s) / 2 };
}

export function HdChartImageViewer({ signedUrl, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const natRef = useRef<Size | null>(null);
  const [errored, setErrored] = useState(false);
  // SSR-safe portal: yalnız client mount'undan sonra render (proje deseni).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    runInEffect(() => setMounted(true));
  }, []);

  // Aktif pointer'lar (pan + pinch) + pinch baz mesafesi
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchPrevDist = useRef<number | null>(null);

  const box = useCallback((): Size => {
    const el = containerRef.current;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 };
  }, []);

  const fitToScreen = useCallback(() => {
    const nat = natRef.current;
    if (nat) setView(fitView(nat, box()));
  }, [box]);

  const zoomAt = useCallback(
    (nextScaleRaw: number, cx: number, cy: number) => {
      const nat = natRef.current;
      if (!nat) return;
      const b = box();
      setView((prev) => zoomTo(prev, nextScaleRaw, cx, cy, nat, b));
    },
    [box],
  );

  const zoomButton = useCallback(
    (factor: number) => {
      const b = box();
      setView((prev) => {
        const nat = natRef.current;
        if (!nat) return prev;
        return zoomTo(prev, prev.scale * factor, b.w / 2, b.h / 2, nat, b);
      });
    },
    [box],
  );

  const setHundred = useCallback(() => {
    const b = box();
    zoomAt(1, b.w / 2, b.h / 2);
  }, [zoomAt, box]);

  function onImgLoad() {
    const el = imgRef.current;
    if (!el) return;
    const nat = { w: el.naturalWidth || el.width, h: el.naturalHeight || el.height };
    natRef.current = nat;
    setView(fitView(nat, box()));
  }

  // Native wheel (passive:false) — sayfa scroll'unu engelle + imleç-merkezli zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const nat = natRef.current;
      if (!nat) return;
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * WHEEL_STEP);
      setView((prev) => zoomTo(prev, prev.scale * factor, cx, cy, nat, { w: el!.clientWidth, h: el!.clientHeight }));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // mounted: portal DOM'a girdikten sonra containerRef'e bağlan.
  }, [mounted]);

  // Body scroll kilidi + geri alma
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Focus: aç → kapat butonuna odaklan; kapanınca açan elemana geri dön.
  // mounted: portal render edildikten sonra closeBtnRef mevcut olur.
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => {
      opener?.focus?.();
    };
  }, [mounted]);

  // Escape + Tab focus trap
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Pointer (pan + pinch)
  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinchPrevDist.current = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const nat = natRef.current;
    if (!nat) return;

    if (pointers.current.size >= 2) {
      // Pinch zoom (iki parmak): mesafe oranına göre ölçekle, orta noktaya zoom
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const baseDist = pinchPrevDist.current;
      pinchPrevDist.current = dist;
      if (baseDist && baseDist > 0) {
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = (pts[0]!.x + pts[1]!.x) / 2 - (rect?.left ?? 0);
        const cy = (pts[0]!.y + pts[1]!.y) / 2 - (rect?.top ?? 0);
        zoomAt(view.scale * (dist / baseDist), cx, cy);
      }
      return;
    }

    // Tek pointer → pan
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    setView((v) => {
      const c = clampTranslate(v.tx + dx, v.ty + dy, v.scale, nat, box());
      return { ...v, tx: c.tx, ty: c.ty };
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchPrevDist.current = null;
  }

  const pct = Math.round(view.scale * 100);
  const ctrlBtn =
    "flex h-11 min-w-[44px] items-center justify-center rounded-lg border border-white/25 bg-white/10 px-3 text-sm font-bold text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";

  // SSR-safe: client mount'una kadar portal render edilmez.
  if (!mounted) return null;

  // createPortal → doğrudan document.body altına; tüm ata stacking-context'lerden
  // kurtularak sabit uygulama header'ının (z-50) ÜSTÜNDE, en üst modal katmanında
  // (z-[10000], toast/ImageLightbox ile aynı düzey) render edilir.
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Human Design harita görseli görüntüleyici"
      className="flex flex-col bg-black/90"
      // Katman kritik özellikleri Tailwind arbitrary z-index'e (z-[10000]) GÜVENMEDEN
      // inline uygulanır: Preview production CSS'inde arbitrary sınıfın üretilmemesi
      // riskini ortadan kaldırır. isolation:isolate + near-max zIndex → uygulama
      // header'ı (z-50) dahil hiçbir katman overlay'in üstünde kalamaz.
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 2147483000,
        isolation: "isolate",
      }}
    >
      {/* Kontrol çubuğu — her zaman görünür (flexShrink:0, overflow:visible), dar ekranda
          sarar (flex-wrap), notch/status alanından korunur (safe-area). Görsel alanının
          ÜSTÜNDE ayrı satırda (zIndex:2); görsel çalışma alanını kapatmaz. */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2"
        style={{
          position: "relative",
          zIndex: 2,
          flexShrink: 0,
          overflow: "visible",
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => zoomButton(1 / BTN_STEP)} className={ctrlBtn} aria-label="Uzaklaştır">−</button>
          <span className="min-w-[64px] text-center text-sm font-bold text-white" aria-live="polite">
            %{pct}
          </span>
          <button type="button" onClick={() => zoomButton(BTN_STEP)} className={ctrlBtn} aria-label="Yakınlaştır">+</button>
          <button type="button" onClick={setHundred} className={ctrlBtn} aria-label="Gerçek boyut yüzde yüz">%100</button>
          <button type="button" onClick={fitToScreen} className={ctrlBtn} aria-label="Ekrana sığdır">Ekrana Sığdır</button>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className={ctrlBtn}
          aria-label="Görüntüleyiciyi kapat"
        >
          Kapat ✕
        </button>
      </div>

      {/* Görsel alanı — toolbar'ın ALTINDA (zIndex:1), flex:1 + minHeight:0 ile kalan
          yüksekliği kaplar; pan/wheel yalnız burada (toolbar butonlarını engellemez). */}
      <div
        ref={containerRef}
        className="relative touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          cursor: view.scale > 1 ? "grab" : "default",
        }}
      >
        {errored ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/80">
            Görsel yüklenemedi. Lütfen görüntüleyiciyi kapatıp tekrar deneyin.
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={imgRef}
            src={signedUrl}
            alt="Human Design harita görseli"
            draggable={false}
            onLoad={onImgLoad}
            onError={() => setErrored(true)}
            className="select-none will-change-transform"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transformOrigin: "0 0",
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
