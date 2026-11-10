"use client";

import { useCallback, useEffect, useRef, useState, type ElementType, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type SettingsTabDef<T extends string> = { id: T; label: string; icon: ElementType };

type Props<T extends string> = {
  tabs: readonly SettingsTabDef<T>[];
  active: T;
  onSelect: (id: T) => void;
};

/** Ok düğmesinin altında kalmaması için seçili/odaktaki sekmenin kenar boşluğu (px). */
const EDGE_PAD = 40;

/**
 * Ayarlar sekme çubuğu — her genişlikte TEK SATIR.
 * Sekmeler sığarsa eşit genişlikte yayılır (eski lg görünümü); sığmazsa yalnız çubuğun içi yatay kaydırılır
 * (sayfa taşmaz, sekme alt satıra inmez, sıra değişmez). Kaydırılabilir yönde kenar solması + ok düğmesi görünür.
 * Seçili sekme ve klavye odağındaki sekme görünür alana kaydırılır.
 * Klavye: Tab ile sırayla; ←/→ ile önceki/sonraki, Home/End ile ilk/son sekmeye odak; Enter/Space seçer.
 */
export function SettingsTabBar<T extends string>({ tabs, active, onSelect }: Props<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft < max - 1;
    setEdges((p) => (p.start === start && p.end === end ? p : { start, end }));
  }, []);

  const reveal = useCallback((btn: HTMLElement | null, smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el || !btn || el.scrollWidth <= el.clientWidth) return;
    const viewL = el.scrollLeft;
    const viewR = viewL + el.clientWidth;
    const bL = btn.offsetLeft;
    const bR = bL + btn.offsetWidth;
    let target: number | null = null;
    if (bL - EDGE_PAD < viewL) target = bL - EDGE_PAD;
    else if (bR + EDGE_PAD > viewR) target = bR + EDGE_PAD - el.clientWidth;
    if (target === null) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: Math.max(0, target), behavior: smooth && !reduce ? "smooth" : "auto" });
  }, []);

  // Boyut / sekme sayısı değişince kenar durumunu yeniden hesapla.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateEdges());
    ro.observe(el);
    Array.prototype.forEach.call(el.children, (c: Element) => ro.observe(c));
    return () => ro.disconnect();
  }, [tabs.length, updateEdges]);

  // Seçili sekme her zaman görünür alanda.
  const firstReveal = useRef(true);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const btn = el.querySelector<HTMLElement>(`[data-settings-tab="${active}"]`);
    reveal(btn, !firstReveal.current);
    firstReveal.current = false;
  }, [active, tabs.length, reveal]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: reduce ? "auto" : "smooth" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-settings-tab]"));
    const i = btns.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? btns.length - 1
      : e.key === "ArrowRight" ? Math.min(btns.length - 1, i + 1)
      : Math.max(0, i - 1);
    btns[next]?.focus();
  };

  return (
    <div className="mb-5">
      <div className="relative rounded-2xl border border-white/80 bg-white/70 p-2 shadow-md backdrop-blur-xl">
        <div
          ref={scrollerRef}
          data-settings-tabbar="scroll"
          onScroll={updateEdges}
          onKeyDown={onKeyDown}
          className="relative flex gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={isActive}
                data-settings-tab={t.id}
                onClick={() => onSelect(t.id)}
                onFocus={(e) => reveal(e.currentTarget, false)}
                className={[
                  "flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 md:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500",
                  isActive
                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md focus-visible:ring-white/90"
                    : "text-slate-500 hover:bg-violet-50 hover:text-violet-700",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                {t.label}
              </button>
            );
          })}
        </div>

        {edges.start && (
          <>
            <div className="pointer-events-none absolute inset-y-2 left-2 w-14 rounded-l-xl bg-gradient-to-r from-white via-white/85 to-transparent" aria-hidden />
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              title="Önceki sekmeler"
              data-settings-tab-arrow="start"
              onClick={() => scrollByPage(-1)}
              className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-violet-700 shadow-md ring-1 ring-violet-100 transition hover:bg-violet-50"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </>
        )}
        {edges.end && (
          <>
            <div className="pointer-events-none absolute inset-y-2 right-2 w-14 rounded-r-xl bg-gradient-to-l from-white via-white/85 to-transparent" aria-hidden />
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              title="Sonraki sekmeler"
              data-settings-tab-arrow="end"
              onClick={() => scrollByPage(1)}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-violet-700 shadow-md ring-1 ring-violet-100 transition hover:bg-violet-50"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
