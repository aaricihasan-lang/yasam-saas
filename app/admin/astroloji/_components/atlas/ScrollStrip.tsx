"use client";

/**
 * Yatay kayan sekme şeridi (2026-10-15 satış öncesi UAT): çok sekmede sağa/sola geçiş fareyle de mümkün olsun.
 *
 * • Taşma varsa iki uçta ok düğmeleri (‹ ›) görünür; uca gelince ilgili ok pasifleşir. Taşma yoksa ok YOK.
 * • Fare tekerleği (dikey) şerit üzerindeyken yatay kaydırır — yalnız şerit gerçekten taşıyorsa; aksi halde sayfa
 *   normal kayar. Dokunmatikte yerel kaydırma aynen çalışır.
 * • Etkin öğe (`activeKey` değişince ya da şerit genişliği değişince) görünür alana, ortalanarak getirilir.
 * • Klavye gezinmesi (← →) sekmelerin kendisindedir; ok düğmeleri ek bir fare/dokunma yoludur.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ScrollStrip({
  children,
  ariaLabel,
  activeKey,
  className = "",
  tone = "light",
  testId,
}: {
  children: ReactNode;
  ariaLabel: string;
  /** Değişince `[data-strip-key="<activeKey>"]` öğesi görünür alana kaydırılır. */
  activeKey?: string | null;
  className?: string;
  tone?: "light" | "dark";
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const activeRef = useRef(activeKey ?? null);
  const lastW = useRef(0);

  /** Etkin öğe görünür alanın dışındaysa (ya da kesikse) ortalanarak getirilir. */
  const reveal = useCallback((behavior: ScrollBehavior) => {
    const el = ref.current;
    const key = activeRef.current;
    if (!el || !key) return;
    const item = el.querySelector<HTMLElement>(`[data-strip-key="${CSS.escape(key)}"]`);
    if (!item) return;
    const l = item.offsetLeft - el.offsetLeft;
    const r = l + item.offsetWidth;
    if (l >= el.scrollLeft && r <= el.scrollLeft + el.clientWidth) return;
    el.scrollTo({ left: Math.max(0, l - Math.max(0, (el.clientWidth - item.offsetWidth) / 2)), behavior });
  }, []);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Şerit genişliği değişince (ilk yerleşim, ekran döndürme, başlık satırı) etkin öğe yeniden görünür kılınır.
    if (el.clientWidth !== lastW.current) {
      lastW.current = el.clientWidth;
      reveal("auto");
    }
    const max = el.scrollWidth - el.clientWidth;
    setEdge((p) => {
      const n = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 };
      return p.left === n.left && p.right === n.right ? p : n;
    });
  }, [reveal]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    for (const c of Array.from(el.children)) ro?.observe(c);
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      // Yatay tekerlek/touchpad zaten yatay kaydırır; yalnız baskın dikey hareketi çeviririz.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return; // uçta: sayfa kaymaya devam etsin
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure, children]);

  useEffect(() => {
    activeRef.current = activeKey ?? null;
    reveal("smooth");
  }, [activeKey, reveal]);

  const step = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.75), behavior: "smooth" });
  };
  const D = tone === "dark";
  const arrow = `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-default disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] ${
    D ? "border-white/15 bg-white/[0.06] text-[#F6F2EA] hover:border-[#D9B56F]/60" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
  }`;
  const overflow = edge.left || edge.right;
  const fade = D ? "from-[#141b44]" : "from-white";

  return (
    <div className={`flex min-w-0 items-center gap-1 ${className}`} data-testid={testId}>
      {overflow && (
        <button type="button" className={arrow} onClick={() => step(-1)} disabled={!edge.left} aria-label="Önceki sekmeler" title="Önceki sekmeler" data-strip-prev="">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div className="relative min-w-0 flex-1">
        <div
          ref={ref}
          role="tablist"
          aria-label={ariaLabel}
          className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto scroll-smooth py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-strip-scroller=""
        >
          {children}
        </div>
        {edge.left && <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r ${fade} to-transparent`} />}
        {edge.right && <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l ${fade} to-transparent`} />}
      </div>
      {overflow && (
        <button type="button" className={arrow} onClick={() => step(1)} disabled={!edge.right} aria-label="Sonraki sekmeler" title="Sonraki sekmeler" data-strip-next="">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
