"use client";

/**
 * Gökyüzü Atlası — YATAY KAYDIRMA ŞERİDİ (V4-002, 2026-11-06). V4-002B (owner son kararı): şerit sonuç alanının GÖRÜNEN ALT
 * KENARINDA ve YALNIZ GEREKTİĞİNDE — taşan bir tablo o an ekrandaysa görünür; değilse hiç çizilmez (boş şerit / yer yok).
 * Masaüstü: bilgi panelinin (ya da sol teknik sonuç alanının) kaydırma kabının hemen ALTINDA (veriyi örtmez, dikey çubukla
 * çakışmaz). Telefon / tablet (sayfa kayar): ekranın altına sabitlenir; kapsayan kartın sonunda aynı yükseklikte yer bırakılır
 * (son satırlar şeridin altında kalmaz). Kart ekranın içinde bitiyorsa şerit kartın sonunda, akışta durur.
 *
 * Sorun: dar bilgi panelinde yatay taşan tablonun kaydırma çubuğu tablonun EN ALTINDA kalıyordu; uzun listede son sütunlara
 * ulaşmak için önce listenin sonuna inmek gerekiyordu.
 *
 * Çözüm (tek ortak bileşen; tablolara tek tek kod eklenmez): kapsamdaki (bilgi paneli / teknik sonuç alanı) yatay taşan
 * kaydırma kaplarını bulur; o an EKRANDA EN ÇOK GÖRÜNEN taşan kaba bağlanır ve kapsamın tepesinde her zaman görünen bir şerit
 * gösterir. Şerit ile tablonun kendi (alt) çubuğu AYNI kabı kaydırır ve karşılıklı eşlenir. Tablo değişince (kaydırma,
 * bölüm değişimi) şerit yeni tabloya geçer ve onun konumunu alır.
 *
 * • Taşan tablo ekranda değilse (ya da hiç yoksa) şerit HİÇ çizilmez; panel genişleyip tablo sığınca kendiliğinden kaybolur.
 * • Bağlanma eşiği: tablonun en az 40 px'i görünmeli; bağlıyken 1 px'e kadar korunur (şerit görününce alan daralır → gidip
 *   gelme yok).
 * • Kaydırma kabının kendisi taşıyorsa (kendi alt çubuğu zaten görünen alt kenarda) ikinci bir şerit çizilmez.
 * • Yalnız görünüm: veri, hesaplama, kayıt etkilenmez; DOM'a düğüm EKLEMEZ (yalnız ölçer ve scrollLeft eşler).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { ChevronLeft, ChevronRight, MoveHorizontal } from "lucide-react";

type Bound = { range: number; label: string };

const CANDIDATES = '[class*="overflow-x-auto"],[class*="overflow-auto"],[class*="overflow-x-scroll"],[class*="overflow-scroll"]';

function overflowsX(el: HTMLElement): boolean {
  if (el.scrollWidth - el.clientWidth <= 1) return false;
  const ox = getComputedStyle(el).overflowX;
  return ox === "auto" || ox === "scroll";
}

function labelOf(el: HTMLElement): string {
  const own = el.getAttribute("aria-label");
  if (own) return own;
  const sec = el.closest("section,[role=region]") as HTMLElement | null;
  const h = sec?.querySelector("h3,h4,h5") ?? el.querySelector("h3,h4,h5,caption");
  const t = (sec?.getAttribute("aria-label") || h?.textContent || "").replace(/\s+/g, " ").trim();
  return t || "Tablo";
}

export default function HScrollProxy({
  rootRef,
  viewportRef,
  resetKey,
  className = "",
  testId = "atlas-hscroll",
  fixedBoundaryRef,
}: {
  /** Taranacak kapsam (bilgi paneli içeriği / teknik sonuç alanı). Kapsamın kendisi de taşıyorsa aday sayılır. */
  rootRef: RefObject<HTMLElement | null>;
  /** "Ekranda görünen" ölçüsü: kapsamın kaydırma kabı. Verilmezse pencere (telefon / tablet: sayfa kayar). */
  viewportRef?: RefObject<HTMLElement | null>;
  /** Değişince (bölüm / analiz) yeniden taranır. */
  resetKey?: string;
  className?: string;
  testId?: string;
  /** Telefon / tablet: şerit ekranın altına sabitlenir; konum / genişlik bu kartın görünen sınırlarından alınır. */
  fixedBoundaryRef?: RefObject<HTMLElement | null>;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  const candidatesRef = useRef<HTMLElement[]>([]);
  const [present, setPresent] = useState(false);
  const [bound, setBound] = useState<Bound | null>(null);
  const [barW, setBarW] = useState(0);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [stripH, setStripH] = useState(30);
  const [fixed, setFixed] = useState<{ left: number; width: number } | null>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: false });

  const syncEdges = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const max = a.scrollWidth - a.clientWidth;
    setEdge((e) => {
      const n = { start: a.scrollLeft <= 1, end: a.scrollLeft >= max - 1 };
      return e.start === n.start && e.end === n.end ? e : n;
    });
  }, []);

  /** Görünür alana göre bağlanılacak kabı seçer (önce iç kaplar; yoksa kapsamın kendisi). */
  const choose = useCallback(() => {
    const root = rootRef.current;
    const list = candidatesRef.current;
    if (!root || list.length === 0) {
      activeRef.current = null;
      setBound(null);
      return;
    }
    const vp = viewportRef?.current?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const visOf = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return Math.min(r.bottom, vp.bottom) - Math.max(r.top, vp.top);
    };
    let best: HTMLElement | null = null;
    let bestVis = 0;
    for (const el of list) {
      if (el === root) continue;
      const vis = visOf(el);
      // Yeni bağlanma için en az 40 px görünür olmalı; zaten bağlı tablo 1 px'e kadar korunur (gidip gelme yok).
      const min = el === activeRef.current ? 1 : 40;
      if (vis >= min && vis > bestVis + 0.5) {
        best = el;
        bestVis = vis;
      }
    }
    // Kapsamın kendisi taşıyorsa: kapsam kendi kaydırma kabıysa (masaüstü) alt çubuğu zaten görünen alt kenarda → şerit yok.
    if (!best && list.includes(root) && root !== viewportRef?.current && visOf(root) >= (root === activeRef.current ? 1 : 40)) best = root;
    activeRef.current = best;
    if (!best) {
      setBound(null);
      return;
    }
    const range = best.scrollWidth - best.clientWidth;
    const label = labelOf(best);
    setBound((b) => (b && b.range === range && b.label === label ? b : { range, label }));
    const bar = barRef.current;
    if (bar && Math.abs(bar.scrollLeft - best.scrollLeft) > 0.5) bar.scrollLeft = best.scrollLeft;
    syncEdges();
  }, [rootRef, viewportRef, syncEdges]);

  /** Kapsamı yeniden tarar (içerik / boyut değişimi). */
  const scan = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const found: HTMLElement[] = [];
    if (overflowsX(root)) found.push(root);
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES))) {
      if (el.getClientRects().length > 0 && overflowsX(el)) found.push(el);
    }
    candidatesRef.current = found;
    setPresent(found.length > 0);
    choose();
  }, [rootRef, choose]);

  // Tarama tetikleyicileri: içerik değişimi, boyut değişimi, pencere boyutu, bölüm değişimi. useEffect (layout değil): şerit
  // kapsamdan ÖNCE çizildiği için kapsamın ref'i ancak commit tamamlanınca bağlıdır.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    };
    scan();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(later) : null;
    ro?.observe(root);
    if (root.firstElementChild) ro?.observe(root.firstElementChild);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(later) : null;
    mo?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "open", "hidden"] });
    window.addEventListener("resize", later);
    const t = window.setTimeout(later, 400);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", later);
      window.clearTimeout(t);
    };
  }, [rootRef, scan, resetKey]);

  // Dikey kaydırmada (panel ya da sayfa) en görünür taşan kap yeniden seçilir; iç kaplardaki yatay kaydırma şeride yansır.
  useEffect(() => {
    if (!present) return;
    const vpEl = viewportRef?.current ?? null;
    let raf = 0;
    const onScroll = (e: Event) => {
      const a = activeRef.current;
      const target = e.target as Node | null;
      if (a && target === a) {
        const bar = barRef.current;
        if (bar && Math.abs(bar.scrollLeft - a.scrollLeft) > 0.5) bar.scrollLeft = a.scrollLeft;
        syncEdges();
        return;
      }
      if (target === barRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(choose);
    };
    const scope: EventTarget = vpEl ?? window;
    // capture: iç kapların scroll olayları kabarcıklanmaz → yakalama evresinde dinlenir.
    scope.addEventListener("scroll", onScroll, { capture: true, passive: true });
    if (vpEl) window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scope.removeEventListener("scroll", onScroll, { capture: true });
      if (vpEl) window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [present, viewportRef, choose, syncEdges]);

  const on = !!bound;
  // Şeridin kendi genişliği (iç ölçek = şerit genişliği + tablonun kaydırma aralığı → piksel piksel eşleşir) ve yüksekliği.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const strip = stripRef.current;
    if (!bar || !strip || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setBarW(bar.clientWidth);
      setStripH(strip.offsetHeight || 30);
    });
    ro.observe(bar);
    ro.observe(strip);
    setBarW(bar.clientWidth);
    setStripH(strip.offsetHeight || 30);
    return () => ro.disconnect();
  }, [on]);

  // Telefon / tablet: kart ekranın altından devam ediyorsa şerit ekranın altına sabitlenir; kart ekranda bitiyorsa akışta kalır.
  useEffect(() => {
    if (!on || !fixedBoundaryRef) return;
    let raf = 0;
    const update = () => {
      const b = fixedBoundaryRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const next = r.bottom > window.innerHeight + 0.5 && r.top < window.innerHeight ? { left: Math.round(r.left), width: Math.round(r.width) } : null;
      setFixed((f) => (f === next || (f && next && f.left === next.left && f.width === next.width) ? f : next));
    };
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", later, { capture: true, passive: true });
    window.addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", later, { capture: true });
      window.removeEventListener("resize", later);
    };
  }, [on, fixedBoundaryRef]);

  if (!present || !on) return null;

  const onBarScroll = () => {
    const a = activeRef.current;
    const bar = barRef.current;
    if (!a || !bar) return;
    if (Math.abs(a.scrollLeft - bar.scrollLeft) > 0.5) a.scrollLeft = bar.scrollLeft;
    syncEdges();
  };
  const step = (dir: 1 | -1) => {
    const a = activeRef.current;
    if (!a) return;
    a.scrollBy({ left: dir * Math.max(80, Math.round(a.clientWidth * 0.7)), behavior: "smooth" });
  };
  // Klavye: ← / → adım, Home / End tablonun başı / sonu. Yalnız tabloyu kaydırır (sayfa dikey kaymaz — telefonda
  // tarayıcının Home / End varsayılanı sayfayı başa götürüp tabloyu görünümden çıkarıyordu).
  const onBarKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const a = activeRef.current;
    if (!a) return;
    const max = a.scrollWidth - a.clientWidth;
    let x: number | null = null;
    if (e.key === "ArrowRight") x = a.scrollLeft + 40;
    else if (e.key === "ArrowLeft") x = a.scrollLeft - 40;
    else if (e.key === "Home") x = 0;
    else if (e.key === "End") x = max;
    if (x === null) return;
    e.preventDefault();
    a.scrollLeft = Math.max(0, Math.min(max, x));
  };
  const btn =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B1430]";

  const strip = (
    <div
      ref={stripRef}
      className={`flex min-w-0 items-center gap-1 border-t border-slate-200 bg-[#f4f2ec] px-1.5 py-0.5 ${fixed ? "shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.25)]" : ""} ${className}`}
      style={fixed ? { position: "fixed", bottom: 0, left: fixed.left, width: fixed.width, zIndex: 30 } : undefined}
      data-testid={testId}
      data-placement={fixed ? "fixed-bottom" : "bottom"}
      data-active={on ? "1" : "0"}
      data-target-label={bound?.label ?? ""}
      role="group"
      aria-label={on ? `Yatay kaydırma — ${bound!.label}` : "Yatay kaydırma (görünür alanda taşan tablo yok)"}
    >
      <span className="flex min-w-0 max-w-[38%] shrink items-center gap-1 text-[10.5px] font-medium text-slate-500" title={bound?.label}>
        <MoveHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{on ? bound!.label : "Yatay kaydırma"}</span>
      </span>
      <button type="button" className={btn} onClick={() => step(-1)} disabled={!on || edge.start} aria-label="Tabloyu sola kaydır" data-testid={`${testId}-left`}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div
        ref={barRef}
        onScroll={onBarScroll}
        onKeyDown={onBarKey}
        tabIndex={on ? 0 : -1}
        aria-label={on ? `${bound!.label} — yatay kaydırma çubuğu (sol / sağ ok, Home / End)` : undefined}
        className={`min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B1430] ${on ? "" : "pointer-events-none opacity-40"}`}
        style={{ scrollbarWidth: "auto" }}
        data-testid={`${testId}-bar`}
      >
        <div style={{ width: on ? barW + bound!.range : barW, height: 1 }} />
      </div>
      <button type="button" className={btn} onClick={() => step(1)} disabled={!on || edge.end} aria-label="Tabloyu sağa kaydır" data-testid={`${testId}-right`}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
  // Sabitlenince kartın sonunda aynı yükseklikte yer kalır (son satırlar şeridin altında kalmaz).
  return fixedBoundaryRef ? (
    <div style={fixed ? { height: stripH } : undefined} data-testid={`${testId}-spacer`}>
      {strip}
    </div>
  ) : (
    strip
  );
}
