"use client";

/**
 * Gökyüzü Atlası V4 (2026-11-06) — sonuç çalışma alanının AÇILIR PANELİ (filtre menüleri, "⋯" işlem menüsü).
 *
 * • Panel sayfa akışına GİRMEZ: `position: fixed` ile tetikleyicinin hemen altında (yer yoksa üstünde) açılır → harita ve
 *   diğer içerik aşağı kaymaz, küçülmez, yeniden yerleşmez. Taşma gizli kartların (harita kartı) içinde de kırpılmaz.
 * • Ekran dışına taşmaz: genişlik ve yükseklik görünür alana göre sınırlanır; içerik panelin İÇİNDE kayar.
 * • Dışarı tıklama / dokunma, Escape ve tetikleyiciye yeniden basma kapatır; Escape odağı tetikleyiciye döndürür.
 *   Sayfa kayarsa ya da pencere boyutu değişirse konum yeniden hesaplanır (panel tetikleyiciden kopmaz).
 * • Açılınca odak panelin ilk etkileşimli öğesine geçer (klavye ile hemen kullanılabilir).
 * Yalnız görünüm durumu: hiçbir kayıt, hesaplama veya ağ isteği üretmez.
 *
 * Kullanım: çağıran `open` durumunu ve tetikleyici düğmenin ref'ini tutar; panel yalnız açıkken bağlanır.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type Pos = { top: number; left: number; maxH: number; width: number; up: boolean };

const GAP = 6;
const EDGE = 8;

type Props = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** İstenen genişlik (px); dar ekranda görünür alana sığacak kadar daralır. */
  width?: number;
  /** "start": tetikleyicinin sol kenarına hizalı · "end": sağ kenarına hizalı (sığmazsa ekran içine kayar). */
  align?: "start" | "end";
  label: string;
  testId?: string;
  children: ReactNode;
};

export default function DeskPopover(props: Props) {
  return props.open ? <Panel {...props} /> : null;
}

function Panel({ onClose, triggerRef, width = 300, align = "start", label, testId, children }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - EDGE * 2);
    let left = align === "end" ? r.right - w : r.left;
    left = Math.min(Math.max(EDGE, left), vw - w - EDGE);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const natural = panelRef.current?.scrollHeight ?? 320;
    // Altta yer yetmiyorsa ve üstte daha çok yer varsa yukarı açılır.
    const up = below < Math.min(natural, 260) && above > below;
    const maxH = Math.max(140, up ? above : below);
    setPos({ top: up ? r.top - GAP : r.bottom + GAP, left, maxH, width: w, up });
  }, [triggerRef, width, align]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const tgt = e.target as Node | null;
      if (!tgt) return;
      if (panelRef.current?.contains(tgt) || triggerRef.current?.contains(tgt)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef.current?.focus();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [onClose, place, triggerRef]);

  // İlk konum hesaplanınca odak panelin ilk etkileşimli öğesine geçer.
  const placed = !!pos;
  useEffect(() => {
    if (!placed) return;
    const first = panelRef.current?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])");
    first?.focus({ preventScroll: true });
  }, [placed]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className="fixed z-[75] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-[0_18px_44px_-12px_rgba(15,23,42,0.28),0_2px_6px_rgba(15,23,42,0.06)]"
      style={
        pos
          ? { left: pos.left, width: pos.width, maxHeight: pos.maxH, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }
          : { left: -9999, top: 0, width, visibility: "hidden" }
      }
      data-testid={testId}
      data-placement={pos?.up ? "top" : "bottom"}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">{children}</div>
    </div>
  );
}
