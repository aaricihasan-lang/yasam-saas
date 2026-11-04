"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

/**
 * Gökyüzü Atlası — satış öncesi geliştirme bilgilendirmesi (owner onaylı metin, 05.11.2026).
 *
 * Yalnız GÖRSEL bilgilendirme: yetki kararı vermez, istek atmaz, veri yazmaz (Roxy / API / DB çağrısı yok).
 * Görünürlük: Atlas'a her GİRİŞTE bir kez. "Tamam" durumu yalnız bu sayfa belleğinde tutulur — localStorage,
 * sessionStorage, çerez ya da veritabanı kaydı YOK (kalıcı onay mekanizması kurulmaz).
 *   - Atlas içi gezinme (/astroloji ↔ /astroloji/efemeris, görünüm hash'leri, geri/ileri) yeniden açmaz: üst rota
 *     koruması yol değişiminde alt ağacı yeniden bağlasa bile bellek durumu korunur. Gökyüzü Araçları bağlantıları tam sayfa
 *     geçişi yaptığından, aynı siteden bir Atlas sayfasından gelen yeni belge de aynı ziyaret sayılır (document.referrer;
 *     site Referrer-Policy'si strict-origin-when-cross-origin → aynı kökende tam yol gelir).
 *   - Atlas dışına çıkınca durum sıfırlanır → tekrar girişte yeniden açılır.
 *   - Sayfa yenileme yeni bir giriştir (bellek sıfırdan başlar) → yeniden açılır.
 * Kapanış yalnız "Tamam" ile; dış tıklama ve Esc kapatmaz (tek işlem).
 */

const TITLE = "Gökyüzü Atlası — Bilgilendirme";
const PARAGRAPHS = [
  "Bu modül aktiftir. Mevcut hesaplamalar test edilmiştir ve şu anda kullanılabilir.",
  "Geliştirmelerimiz devam ediyor; yeni haritalar ve hesaplamalar aşamalı olarak eklenecektir.",
] as const;

const isAtlasPath = (path: string) => path === "/astroloji" || path.startsWith("/astroloji/");

/** Yeni belge, aynı siteden bir Atlas sayfasından tam sayfa geçişle mi açıldı? (Yenileme yeni giriştir → hayır.) */
function cameFromAtlasPage(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload" || !document.referrer) return false;
    const from = new URL(document.referrer);
    return from.origin === window.location.origin && isAtlasPath(from.pathname);
  } catch {
    return false;
  }
}

let acknowledged = typeof window !== "undefined" && cameFromAtlasPage();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function acknowledge(): void {
  acknowledged = true;
  notify();
}

export default function AtlasDevelopmentNotice() {
  // Sunucu anlık görüntüsü = "kapalı" → SSR/hydration sırasında pencere basılmaz.
  const done = useSyncExternalStore(subscribe, () => acknowledged, () => true);
  const open = !done;

  const titleId = useId();
  const descId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  // Atlas dışına çıkış: bileşen ayrıldıktan sonra adres Atlas'ta değilse bir sonraki giriş için sıfırla.
  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (!isAtlasPath(window.location.pathname)) {
          acknowledged = false;
          notify();
        }
      }, 0);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Pencere açıkken arka plan etkileşimden ve erişilebilirlik ağacından çıkarılır.
    const inerted: HTMLElement[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === container || !(el instanceof HTMLElement) || el.inert) continue;
      el.inert = true;
      inerted.push(el);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    okRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Tab") {
        // Tek odaklanabilir öğe: odak Tamam'da kalır.
        e.preventDefault();
        okRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      inerted.forEach((el) => {
        el.inert = false;
      });
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused?.isConnected && previouslyFocused !== document.body) previouslyFocused.focus();
      else document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#050816]/70 px-4 py-6 backdrop-blur-sm"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
        colorScheme: "light",
      }}
      data-testid="atlas-development-notice"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#e7dcc4] bg-white text-slate-800 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-[#0b1430] px-5 py-4 sm:px-6">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#e6c77f] ring-1 ring-[#e6c77f]/40"
            aria-hidden="true"
          >
            <Sparkles className="h-5 w-5" strokeWidth={2} />
          </span>
          <h2 id={titleId} className="min-w-0 break-words text-base font-semibold leading-snug text-white sm:text-lg">
            {TITLE}
          </h2>
        </div>

        <div id={descId} className="min-h-0 space-y-3 overflow-y-auto px-5 py-5 sm:px-6">
          {PARAGRAPHS.map((p) => (
            <p key={p} className="break-words text-[15px] leading-relaxed text-slate-700">
              {p}
            </p>
          ))}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-100 bg-[#faf7f0] px-5 py-4 sm:px-6">
          <button
            ref={okRef}
            type="button"
            onClick={acknowledge}
            className="min-h-[44px] w-full rounded-xl bg-[#0b1430] px-6 text-[15px] font-semibold text-white transition hover:bg-[#1a2b5c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8843e] sm:w-auto sm:min-w-[140px]"
            data-testid="atlas-development-notice-ok"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
