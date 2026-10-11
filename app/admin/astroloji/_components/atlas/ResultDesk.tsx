"use client";

/**
 * Gökyüzü Atlası — Göksel Analiz Çalışma Masası (yalnız sunum katmanı).
 *
 * Masaüstü (≥1024px): ÜÇ SÜTUN — sol dikey konsol menüsü · orta SÜREKLİ görünen gerçek harita istasyonu · sağ, kendi
 * içinde kayan analiz paneli. Masa yüksekliği kullanılabilir ekran yüksekliğine göre hesaplanır; harita bu yüksekliğe
 * oranını koruyarak sığar (sayfayı kaydırmadan tamamı görünür). Sağ panel kayınca harita yerinden oynamaz.
 * Tablet / mobil: harita üstte (normal / sabitlenmiş / küçültülmüş), altında yatay bölüm seçici ve panel.
 *
 * 3D hissi HAREKETTEN değil malzemeden gelir: katmanlı degrade yüzeyler, iç ışık kenarları (inset highlight),
 * dış gölgeler, perspektifli dekoratif halka katmanları. Harita SVG'sine dönüşüm/perspektif UYGULANMAZ (okunabilirlik
 * ve hesaplama doğruluğu). Bu bileşen veri üretmez/değiştirmez; hangi bölümlerin var olduğuna çağıran karar verir.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { atlasDisplay, atlasText } from "./fonts";
import ChartViewport from "./ChartViewport";

export type DeskTone = "lavender" | "blue" | "sage" | "peach" | "gold" | "turquoise" | "slate";
export type DeskTab = { id: string; label: string; tone: DeskTone; badge?: string | number | null; hint?: string; /** İçerik kendi başlığını taşıyor → panel başlığı tekrarlanmaz. */ ownHeading?: boolean };

const TONE: Record<DeskTone, { dot: string; edge: string; glow: string }> = {
  lavender: { dot: "#B9A6F2", edge: "from-[#B9A6F2]", glow: "rgba(185,166,242,0.30)" },
  blue: { dot: "#9CC0F2", edge: "from-[#9CC0F2]", glow: "rgba(156,192,242,0.28)" },
  sage: { dot: "#9FD0AE", edge: "from-[#9FD0AE]", glow: "rgba(159,208,174,0.26)" },
  peach: { dot: "#F2B897", edge: "from-[#F2B897]", glow: "rgba(242,184,151,0.28)" },
  gold: { dot: "#E2C17E", edge: "from-[#E2C17E]", glow: "rgba(226,193,126,0.30)" },
  turquoise: { dot: "#86D6CA", edge: "from-[#86D6CA]", glow: "rgba(134,214,202,0.28)" },
  slate: { dot: "#B8C2D6", edge: "from-[#B8C2D6]", glow: "rgba(184,194,214,0.22)" },
};

/** Katmanlı yüzey: üst ışık, iç kenar parıltısı, derin dış gölge. */
const SURFACE =
  "relative rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_48px_-28px_rgba(0,0,0,0.85)]";

/* ── Sol konsol menüsü ─────────────────────────────────────────────────────────────────────────── */
function useMenuKeys(items: DeskTab[], onChange: (id: string) => void, orientation: "vertical" | "horizontal") {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const prev = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    let n = -1;
    if (e.key === next) n = (i + 1) % items.length;
    else if (e.key === prev) n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(items[n].id);
    refs.current[items[n].id]?.focus();
  };
  return { refs, onKey };
}

function ConsoleMenu({ items, active, onChange, idBase }: { items: DeskTab[]; active: string; onChange: (id: string) => void; idBase: string }) {
  const { refs, onKey } = useMenuKeys(items, onChange, "vertical");
  return (
    <div role="tablist" aria-orientation="vertical" aria-label="Analiz bölümleri" className="flex flex-col gap-1.5" data-testid="atlas-result-sections">
      {items.map((t, i) => {
        const on = t.id === active;
        const tone = TONE[t.tone];
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`${idBase}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idBase}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            style={on ? { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -10px 24px -18px ${tone.glow}, 0 10px 22px -16px rgba(0,0,0,0.9)` } : undefined}
            className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F] ${
              on
                ? "border-[#D9B56F]/45 bg-[linear-gradient(180deg,rgba(52,49,108,0.85),rgba(20,28,64,0.9))] text-[#F6F2EA]"
                : "border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))] text-[#F6F2EA]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/15 hover:text-[#F6F2EA]"
            }`}
          >
            {on && <span className={`absolute inset-y-2 left-0 w-[3px] rounded-r bg-gradient-to-b ${tone.edge} to-transparent`} aria-hidden="true" />}
            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-black/30" style={{ background: tone.dot, opacity: on ? 1 : 0.55, boxShadow: on ? `0 0 10px ${tone.glow}` : undefined }} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-snug">{t.label}</span>
            {t.badge !== undefined && t.badge !== null && (
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${on ? "bg-[#D9B56F]/20 text-[#F6E7C3]" : "bg-white/[0.06] text-[#F6F2EA]/60"}`}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ChipMenu({ items, active, onChange, idBase }: { items: DeskTab[]; active: string; onChange: (id: string) => void; idBase: string }) {
  const { refs, onKey } = useMenuKeys(items, onChange, "horizontal");
  return (
    <div role="tablist" aria-label="Analiz bölümleri" className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" data-testid="atlas-result-sections">
      {items.map((t, i) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`${idBase}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idBase}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`inline-flex shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              on ? "border-[#D9B56F]/50 bg-[#34316C] text-[#F6F2EA] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" : "border-white/10 bg-white/[0.04] text-[#F6F2EA]/75"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: TONE[t.tone].dot, opacity: on ? 1 : 0.6 }} aria-hidden="true" />
            {t.label}
            {t.badge !== undefined && t.badge !== null && <span className="text-[11px] tabular-nums opacity-70">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Orta: harita istasyonu ────────────────────────────────────────────────────────────────────── */
/** Gözlemevi göstergesi çerçevesi. İçerik (gerçek harita) dönüştürülmez; yalnız arka katmanlar perspektifli. */
export function ChartBezel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-[1.6rem] border border-[#D9B56F]/25 bg-[radial-gradient(ellipse_at_50%_42%,#2a2763_0%,#151d48_45%,#0a1130_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_80px_rgba(0,0,0,0.55),0_40px_80px_-40px_rgba(0,0,0,0.9)] ${className}`} data-testid="atlas-chart-frame">
      {/* perspektifli dekoratif halkalar (yalnız arka plan) */}
      <div className="pointer-events-none absolute inset-0 [perspective:1400px]" aria-hidden="true">
        <svg className="absolute left-1/2 top-1/2 h-[118%] w-[118%] -translate-x-1/2 -translate-y-1/2 [transform:translate(-50%,-50%)_rotateX(58deg)]" viewBox="0 0 200 200" style={{ transformOrigin: "50% 50%" }}>
          <g fill="none" stroke="#D9B56F">
            <circle cx="100" cy="100" r="96" strokeOpacity="0.28" strokeWidth="0.35" />
            <circle cx="100" cy="100" r="86" strokeOpacity="0.16" strokeWidth="0.25" strokeDasharray="0.8 2.6" />
            <circle cx="100" cy="100" r="74" strokeOpacity="0.12" strokeWidth="0.2" />
          </g>
        </svg>
        <div className="absolute inset-x-[12%] bottom-[6%] h-10 rounded-[50%] bg-black/45 blur-2xl" />
      </div>
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-60" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <circle key={i} cx={`${(i * 37.7) % 100}%`} cy={`${(i * 61.3) % 100}%`} r={i % 6 === 0 ? 1.1 : 0.6} fill="#F6F2EA" fillOpacity={0.35} />
        ))}
      </svg>
      {/* metalik şampanya iç halka */}
      <div className="pointer-events-none absolute inset-3 rounded-[1.25rem] border border-[#F6E7C3]/[0.06] shadow-[inset_0_0_0_1px_rgba(217,181,111,0.05)]" aria-hidden="true" />
      <div className="relative flex h-full w-full min-h-0 items-center justify-center">{children}</div>
    </div>
  );
}

/** Tam ekran harita görünümü (Esc ile kapanır). */
function ChartOverlay({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Harita — geniş görünüm" className="fixed inset-0 z-[80] flex flex-col bg-[#060b1f]/95 p-3 backdrop-blur-sm sm:p-6" data-testid="atlas-chart-overlay">
      <div className="mb-2 flex justify-end">
        <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-[#F6F2EA] hover:border-[#D9B56F]/70">
          Kapat (Esc)
        </button>
      </div>
      <ChartBezel className="flex-1 p-3 sm:p-6">{children}</ChartBezel>
    </div>
  );
}

/** Tek düzen bağlanır (masaüstü VEYA mobil): panel içeriği iki kez oluşmaz (form durumu / istekler tekil kalır). */
const DESK_MQ = "(min-width: 1024px)";
function subscribeDesk(cb: () => void) {
  const m = window.matchMedia(DESK_MQ);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
function useDeskLayout(): boolean {
  return useSyncExternalStore(subscribeDesk, () => window.matchMedia(DESK_MQ).matches, () => true);
}

/* ── Masa ──────────────────────────────────────────────────────────────────────────────────────── */
export default function ResultDesk({
  backLabel,
  onBack,
  eyebrow,
  title,
  subtitle,
  details,
  chips,
  actions,
  switcher,
  notices,
  tabs,
  active,
  onTab,
  chart,
  stage,
  panelTitle,
  chartKey,
  children,
}: {
  backLabel: string;
  onBack: () => void;
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  details?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  switcher?: ReactNode;
  notices?: ReactNode;
  tabs: DeskTab[];
  active: string;
  onTab: (id: string) => void;
  /** Gerçek hesaplanmış harita üreten (fit edilebilir) görünüm: (sınıf) => harita. Yoksa harita GÖSTERİLMEZ. */
  chart?: ((sizeClassName: string) => ReactNode) | null;
  /** Harita yoksa orta alan: tekniğin gerçek görselleştirme / sonuç paneli. */
  stage?: ReactNode;
  panelTitle?: string;
  /** D3.1: harita kimliği (teknik / sonuç) — değişince görüntüleyici başlangıç (sığdır) görünümüne döner. */
  chartKey?: string;
  children: ReactNode;
}) {
  const deskRef = useRef<HTMLDivElement | null>(null);
  const [deskH, setDeskH] = useState<number | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [mobileChart, setMobileChart] = useState<"normal" | "pinned" | "mini">("normal");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDesk = useDeskLayout();

  // Masaüstü masa yüksekliği = görünür ekran − masanın sayfa üstünden uzaklığı (kaydırmadan tamamı görünür).
  const measure = useCallback(() => {
    const el = deskRef.current;
    if (!el || window.innerWidth < 1024) {
      setDeskH(null);
      return;
    }
    // FINAL: masa yüksekliği = görünür ekran − masanın üstü − masanın ALTINDA kalan gerçek içerik (alt dolgu, kök düzen
    // şeritleri). Böylece masaüstünde ana sayfa gereksiz kaymaz; içerik kırpılmaz (paneller kendi içinde kayar).
    const scrollTop = (document.scrollingElement?.scrollTop ?? 0) + document.body.scrollTop;
    const rect = el.getBoundingClientRect();
    const top = rect.top + scrollTop;
    // Masanın altındaki pay: bölüm içi kalan + kapsayıcının alt dolgusu (ana alanın en küçük yüksekliği sayfada ayarlanır).
    // Ana alanın (main) doğrudan çocuğu olan sayfa kabına kadar masanın altındaki her şey (ara kaplar, alt dolgular).
    let outer: HTMLElement = el;
    while (outer.parentElement && outer.parentElement.tagName !== "MAIN" && outer.parentElement !== document.body) outer = outer.parentElement;
    // (kabın kendi alt dolgusu getBoundingClientRect().bottom içinde zaten var)
    const below = Math.max(0, outer.getBoundingClientRect().bottom - rect.bottom);
    setDeskH(Math.max(380, Math.floor(window.innerHeight - top - below - 1)));
  }, []);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // Başlık / sekme şeridi / bölüm menüsü / bildirim yüksekliği değişince yeniden ölç (masanın üstü kayar).
    const sec = deskRef.current?.closest("section");
    const ro = typeof ResizeObserver !== "undefined" && sec ? new ResizeObserver(() => measure()) : null;
    if (ro && sec) for (const child of Array.from(sec.children)) if (child !== deskRef.current) ro.observe(child);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure, isDesk]);
  // Bölüm değişince yalnız sağ panel başa döner; sayfa ve harita yerinde kalır.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [active]);

  const hasChart = !!chart;
  const current = tabs.find((t) => t.id === active);
  const expandBtn = hasChart ? (
    <button type="button" onClick={() => setOverlay(true)} className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-[#F6F2EA]/80 transition hover:border-[#D9B56F]/60 hover:text-[#F6E7C3]" data-testid="atlas-chart-expand">
      ⤢ Haritayı büyüt
    </button>
  ) : null;

  const panel = (
    <div id="atlas-result-panel" role="tabpanel" aria-labelledby={`atlas-result-tab-${active}`} className="min-w-0">
      {children}
    </div>
  );

  return (
    <section
      className={`${atlasDisplay.variable} ${atlasText.variable} relative flex min-w-0 flex-col gap-3 [font-family:var(--font-atlas-text)]`}
      aria-label="Analiz sonucu"
      data-testid="astro-result-view"
    >
      {/* ── Kompakt konsol başlığı ── */}
      <header className={`${SURFACE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 text-[#F6F2EA] sm:px-5`}>
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" onClick={onBack} aria-label={backLabel} title={backLabel} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#F6F2EA]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-[#D9B56F]/60 hover:text-[#D9B56F]">
            ←
          </button>
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/90">{eyebrow}</p>
            <h2 className="truncate text-lg font-light tracking-[0.01em] text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-xl">{title}</h2>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#F6F2EA]/70">
              {subtitle && <span>{subtitle}</span>}
              {details && <span className="text-[#F6F2EA]/55">{details}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chips}
          {actions}
        </div>
      </header>

      {notices}
      {switcher}

      {/* ── MASAÜSTÜ: üç sütun ── */}
      {isDesk ? (
      <>
      {/* 1024–1279px: menü yatay satırda, altında iki sütun (harita + panel); ≥1280px: üç sütun. */}
      <div className="xl:hidden">
        <ChipMenu items={tabs} active={active} onChange={onTab} idBase="atlas-result-t" />
      </div>
      <div
        ref={deskRef}
        style={deskH ? { height: deskH } : undefined}
        className={`grid min-h-0 gap-3 ${
          hasChart
            ? "grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] xl:grid-cols-[224px_minmax(0,1fr)_minmax(400px,0.78fr)]"
            : // Tablo ağırlıklı teknikler (Shadbala, Ashtakavarga, Dasha…): orta sütun daha geniş.
              "grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)] xl:grid-cols-[224px_minmax(0,1.55fr)_minmax(340px,0.6fr)]"
        }`}
        data-layout={hasChart ? "chart" : "table"}
        data-testid="atlas-desk-grid"
      >
        <nav className={`${SURFACE} hidden min-h-0 flex-col gap-3 overflow-y-auto p-3 xl:flex`} aria-label="Analiz menüsü">
          <p className="px-1 text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/80">BÖLÜMLER</p>
          <ConsoleMenu items={tabs} active={active} onChange={onTab} idBase="atlas-result" />
        </nav>

        <div className={`${SURFACE} flex min-h-0 flex-col gap-2 p-3`} data-testid="atlas-stage">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/80">{hasChart ? "HARİTA İSTASYONU" : "TEKNİK SONUÇ"}</p>
            {expandBtn}
          </div>
          {hasChart ? (
            <ChartBezel className="min-h-0 flex-1 p-2">
              <ChartViewport key={chartKey}>{chart!("h-full w-full max-h-full")}</ChartViewport>
            </ChartBezel>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-[1.25rem] bg-[#F6F2EA] p-4 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(217,181,111,0.18)] [scrollbar-width:thin]" data-testid="atlas-stage-scroll">{stage}</div>
          )}
        </div>

        <div className={`${SURFACE} flex min-h-0 flex-col p-3`}>
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            {current?.ownHeading ? <span className="sr-only">{current.label}</span> : <h3 className="text-[15px] font-normal tracking-[0.01em] text-[#F6F2EA] [font-family:var(--font-atlas-display)]">{panelTitle ?? current?.label}</h3>}
            {current?.hint && <span className="text-[11px] text-[#F6F2EA]/55">{current.hint}</span>}
          </div>
          <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto rounded-[1.1rem] bg-[#F6F2EA] p-3 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(217,181,111,0.18)] [scrollbar-width:thin]" data-testid="atlas-panel-scroll">
            {panel}
          </div>
        </div>
      </div>
      </>
      ) : (
      /* ── TABLET / MOBİL ── */
      <div className="flex flex-col gap-3" data-testid="atlas-desk-mobile">
        {hasChart ? (
          <div
            className={`${mobileChart === "normal" ? "" : "sticky top-0 z-30"} ${SURFACE} p-2`}
            data-testid="atlas-mobile-chart"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/80">HARİTA</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setMobileChart((m) => (m === "pinned" ? "normal" : "pinned"))} aria-pressed={mobileChart === "pinned"} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-[#F6F2EA]/80">
                  {mobileChart === "pinned" ? "Sabitlemeyi kaldır" : "Üstte sabitle"}
                </button>
                <button type="button" onClick={() => setMobileChart((m) => (m === "mini" ? "normal" : "mini"))} aria-pressed={mobileChart === "mini"} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-[#F6F2EA]/80">
                  {mobileChart === "mini" ? "Büyüt" : "Küçült"}
                </button>
                {expandBtn}
              </div>
            </div>
            <ChartBezel className={`mx-auto aspect-square w-full p-2 ${mobileChart === "pinned" ? "max-h-[42svh] max-w-[42svh]" : mobileChart === "mini" ? "max-h-[150px] max-w-[150px]" : "max-w-[640px]"}`}>
              {mobileChart === "mini" ? chart!("h-full w-full max-h-full") : <ChartViewport key={chartKey}>{chart!("h-full w-full max-h-full")}</ChartViewport>}
            </ChartBezel>
          </div>
        ) : (
          <div className={`${SURFACE} p-2`}>
            <p className="px-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/80">TEKNİK SONUÇ</p>
            <div className="overflow-x-auto rounded-[1.1rem] bg-[#F6F2EA] p-3 text-slate-800">{stage}</div>
          </div>
        )}
        <div className="sticky top-0 z-20 -mx-1 rounded-2xl bg-[#0a1230]/90 px-1 py-1.5 backdrop-blur" style={hasChart && mobileChart !== "normal" ? { position: "static" } : undefined}>
          <ChipMenu items={tabs} active={active} onChange={onTab} idBase="atlas-result-m" />
        </div>
        <div className={`${SURFACE} p-2`}>
          {!current?.ownHeading && <h3 className="px-1 pb-2 text-[15px] font-normal text-[#F6F2EA] [font-family:var(--font-atlas-display)]">{panelTitle ?? current?.label}</h3>}
          <div className="overflow-x-auto rounded-[1.1rem] bg-[#F6F2EA] p-3 text-slate-800">{panel}</div>
        </div>
      </div>
      )}

      {hasChart && (
        <ChartOverlay open={overlay} onClose={() => setOverlay(false)}>
          <ChartViewport key={chartKey} label="Harita — geniş görünüm">
            {chart!("h-full w-full max-h-full")}
          </ChartViewport>
        </ChartOverlay>
      )}
    </section>
  );
}

/** Başlık çipleri. */
export function DeskChip({ tone, children }: { tone: "ok" | "warn" | "muted" | "saved"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/40 bg-amber-400/10 text-amber-100"
        : tone === "saved"
          ? "border-[#D9B56F]/50 bg-[#D9B56F]/10 text-[#F6E7C3]"
          : "border-white/15 bg-white/[0.05] text-[#F6F2EA]/75";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${cls}`}>{children}</span>;
}

/** Başlıktaki işlem düğmeleri (koyu zemin). */
export const deskPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-[linear-gradient(180deg,#E6C887,#C9A158)] px-4 py-2 text-sm font-semibold text-[#0B1430] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_-10px_rgba(217,181,111,0.7)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F6F2EA] disabled:opacity-50";
export const deskGhost =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-[#F6F2EA] transition hover:border-[#D9B56F]/70 hover:text-[#F6E7C3]";
