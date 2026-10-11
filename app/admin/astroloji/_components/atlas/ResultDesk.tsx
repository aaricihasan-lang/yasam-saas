"use client";

/**
 * Gökyüzü Atlası — Göksel Analiz Çalışma Masası (yalnız sunum katmanı). İLKE: ÖNCE HARİTA, SONRA ARAÇLAR, SONRA DETAYLAR.
 *
 * Masaüstü (≥1024px): HARİTA MERKEZLİ masa —
 *   • sol: DARALTILABİLİR bölüm menüsü (geniş: ikon + ad · dar: yalnız ikon; tercih tarayıcıda hatırlanır),
 *   • orta: harita istasyonu (kullanılabilir alanın tamamı; harita oranını koruyarak ölçülen alana sığar),
 *   • sağ: İSTEĞE BAĞLI bilgi paneli (varsayılan kapalı → harita geniş; bölüm seçilince veya "Bilgi paneli" ile açılır).
 * Panel kapalıyken içerik DOM'da kalır (gizlenir) — yorum / not taslakları ve istekler kaybolmaz, yeniden çalışmaz.
 * Masa yüksekliği kullanılabilir ekran yüksekliğine göre ölçülür (sayfa kaymadan tamamı görünür).
 * Odak modu: harita tam ekran (menü ve paneller gizli), yakınlaştır / sığdır, Esc veya tek tıkla normal görünüm.
 * Tablet / mobil: harita üstte ve olabildiğince büyük, altında yatay bölüm seçici ve panel; doğal dikey kaydırma.
 *
 * Harita SVG'sine dönüşüm/perspektif UYGULANMAZ (okunabilirlik ve hesaplama doğruluğu). Bu bileşen veri üretmez /
 * değiştirmez; hangi bölümlerin var olduğuna çağıran karar verir. Panel/menü/odak durumu hiçbir kaydı etkilemez.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { BookOpen, CircleDot, House, Maximize2, Orbit, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PenLine, Save, Sparkles, Sun, Table2, Triangle, X } from "lucide-react";
import { atlasDisplay, atlasText } from "./fonts";
import ChartViewport from "./ChartViewport";
import { readYasamUser } from "@/lib/auth/yasamUser";

export type DeskTone = "lavender" | "blue" | "sage" | "peach" | "gold" | "turquoise" | "slate";
export type DeskTab = {
  id: string;
  label: string;
  tone: DeskTone;
  badge?: string | number | null;
  hint?: string;
  /** İçerik kendi başlığını taşıyor → panel başlığı tekrarlanmaz. */ ownHeading?: boolean;
};

const TONE: Record<DeskTone, { dot: string; edge: string; glow: string }> = {
  lavender: {
    dot: "#B9A6F2",
    edge: "from-[#B9A6F2]",
    glow: "rgba(185,166,242,0.30)",
  },
  blue: {
    dot: "#9CC0F2",
    edge: "from-[#9CC0F2]",
    glow: "rgba(156,192,242,0.28)",
  },
  sage: {
    dot: "#9FD0AE",
    edge: "from-[#9FD0AE]",
    glow: "rgba(159,208,174,0.26)",
  },
  peach: {
    dot: "#F2B897",
    edge: "from-[#F2B897]",
    glow: "rgba(242,184,151,0.28)",
  },
  gold: {
    dot: "#E2C17E",
    edge: "from-[#E2C17E]",
    glow: "rgba(226,193,126,0.30)",
  },
  turquoise: {
    dot: "#86D6CA",
    edge: "from-[#86D6CA]",
    glow: "rgba(134,214,202,0.28)",
  },
  slate: {
    dot: "#B8C2D6",
    edge: "from-[#B8C2D6]",
    glow: "rgba(184,194,214,0.22)",
  },
};

/** Bölüm ikonları (bilinmeyen bölüm → nokta). Yalnız sunum. */
const TAB_ICON: Record<string, ComponentType<{ className?: string }>> = {
  harita: Orbit,
  gezegenler: Sun,
  evler: House,
  acilar: Triangle,
  teknik: Table2,
  yorum: Sparkles,
  bilgi: BookOpen,
  not: PenLine,
  kaydet: Save,
};
const iconOf = (id: string) => TAB_ICON[id] ?? CircleDot;

/** Katmanlı yüzey: üst ışık, iç kenar parıltısı, derin dış gölge. */
const SURFACE =
  "relative rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_48px_-28px_rgba(0,0,0,0.85)]";
const TOOL =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b1234]/80 px-2.5 text-xs font-medium text-[#F6F2EA]/85 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition hover:border-[#D9B56F]/60 hover:text-[#F6E7C3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F]";

/* ── Tercih (yalnız bu tarayıcı; okunamazsa varsayılan) ─────────────────────────────────────────── */
const NAV_KEY = "atlas.desk.navCollapsed";
function readNavPref(): boolean | null {
  try {
    const v = window.localStorage.getItem(NAV_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}
function writeNavPref(collapsed: boolean) {
  try {
    window.localStorage.setItem(NAV_KEY, collapsed ? "1" : "0");
  } catch {
    /* depolama kapalı olabilir; tercih yalnız bu oturumda geçerli kalır */
  }
}

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

function ConsoleMenu({
  items,
  active,
  onChange,
  onSelect,
  idBase,
  collapsed,
}: {
  items: DeskTab[];
  active: string;
  onChange: (id: string) => void;
  /** Tıklama (aynı bölüme tekrar basmak dahil). */ onSelect: (id: string) => void;
  idBase: string;
  collapsed: boolean;
}) {
  const { refs, onKey } = useMenuKeys(items, onChange, "vertical");
  return (
    <div role="tablist" aria-orientation="vertical" aria-label="Analiz bölümleri" className="flex flex-col gap-1.5" data-testid="atlas-result-sections">
      {items.map((t, i) => {
        const on = t.id === active;
        const tone = TONE[t.tone];
        const Icon = iconOf(t.id);
        const hasBadge = t.badge !== undefined && t.badge !== null;
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
            aria-label={collapsed ? `${t.label}${hasBadge ? ` (${t.badge})` : ""}` : undefined}
            title={collapsed ? t.label : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            style={
              on
                ? {
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -10px 24px -18px ${tone.glow}, 0 10px 22px -16px rgba(0,0,0,0.9)`,
                  }
                : undefined
            }
            className={`group relative flex w-full items-center overflow-hidden rounded-xl border text-left text-[13.5px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F] ${
              collapsed ? "h-10 justify-center px-0" : "gap-2.5 px-3 py-2.5"
            } ${
              on
                ? "border-[#D9B56F]/45 bg-[linear-gradient(180deg,rgba(52,49,108,0.85),rgba(20,28,64,0.9))] text-[#F6F2EA]"
                : "border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))] text-[#F6F2EA]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/15 hover:text-[#F6F2EA]"
            }`}
          >
            {on && <span className={`absolute inset-y-2 left-0 w-[3px] rounded-r bg-gradient-to-b ${tone.edge} to-transparent`} aria-hidden="true" />}
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="min-w-0 flex-1 leading-snug">{t.label}</span>}
            {hasBadge &&
              (collapsed ? (
                <span className="absolute right-1 top-1 min-w-[1rem] rounded-full bg-[#D9B56F] px-1 text-center text-[9px] font-bold leading-4 text-[#0B1430]" aria-hidden="true">
                  {t.badge}
                </span>
              ) : (
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${on ? "bg-[#D9B56F]/20 text-[#F6E7C3]" : "bg-white/[0.06] text-[#F6F2EA]/60"}`}>{t.badge}</span>
              ))}
            {!collapsed && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone.dot, opacity: on ? 1 : 0.45 }} aria-hidden="true" />}
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
        const Icon = iconOf(t.id);
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
            className={`inline-flex min-h-[40px] shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              on ? "border-[#D9B56F]/50 bg-[#34316C] text-[#F6F2EA] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" : "border-white/10 bg-white/[0.04] text-[#F6F2EA]/75"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
            {t.badge !== undefined && t.badge !== null && <span className="text-[11px] tabular-nums opacity-70">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Orta: harita istasyonu ────────────────────────────────────────────────────────────────────── */
/** Harita zemini: sade gece yüzeyi + çok soluk dekoratif halka (haritanın ARKASINDA; okumayı etkilemez). */
export function ChartBezel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-[1.4rem] border border-[#D9B56F]/20 bg-[radial-gradient(ellipse_at_50%_45%,#232259_0%,#141c46_48%,#0a1130_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_70px_rgba(0,0,0,0.5),0_30px_70px_-40px_rgba(0,0,0,0.9)] ${className}`}
      data-testid="atlas-chart-frame"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-50" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <circle key={i} cx={`${(i * 37.7) % 100}%`} cy={`${(i * 61.3) % 100}%`} r={i % 6 === 0 ? 1 : 0.55} fill="#F6F2EA" fillOpacity={0.3} />
        ))}
      </svg>
      <div className="relative flex h-full w-full min-h-0 items-center justify-center">{children}</div>
    </div>
  );
}

/** Odak modu: harita tam ekran (menü ve paneller gizli). Esc veya "Normal görünüm" ile kapanır; odak açan düğmeye döner. */
function ChartOverlay({ open, onClose, title, meta, children }: { open: boolean; onClose: () => void; title: string; meta?: string[]; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Harita odak modu — ${title}`} className="fixed inset-0 z-[80] flex flex-col gap-2 bg-[#060b1f] p-2 sm:p-4" data-testid="atlas-chart-overlay">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[#F6F2EA]">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/85">ODAK MODU</p>
          <p className="truncate text-base font-light [font-family:var(--font-atlas-display)]">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {meta?.map((m) => (
            <span key={m} className="hidden rounded-full border border-[#D9B56F]/30 bg-[#D9B56F]/[0.07] px-2 py-0.5 text-[10.5px] text-[#F6E7C3]/90 sm:inline">
              {m}
            </span>
          ))}
          <button ref={closeRef} type="button" onClick={onClose} className={`${TOOL} h-9`} data-testid="atlas-chart-overlay-close">
            <X className="h-4 w-4" /> Normal görünüm <span className="hidden text-[#F6F2EA]/50 sm:inline">(Esc)</span>
          </button>
        </div>
      </div>
      <ChartBezel className="flex-1 p-1 sm:p-2">{children}</ChartBezel>
      <p className="px-1 text-center text-[11px] text-[#F6F2EA]/45">Tekerlek veya + / − ile yakınlaştırın · sürükleyerek gezinin · 0 ya da ⛶ ile başlangıç boyutu</p>
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
  return useSyncExternalStore(
    subscribeDesk,
    () => window.matchMedia(DESK_MQ).matches,
    () => true,
  );
}

/* ── Masa ──────────────────────────────────────────────────────────────────────────────────────── */
/** Masa tonu: "night" (mevcut koyu masa) · "light" (sade aydınlık astrolog masası — şimdilik yalnız Natal). */
const DeskToneCtx = createContext<"night" | "light">("night");

type DeskProps = Parameters<typeof NightDesk>[0];

export default function ResultDesk({ variant = "night", ...props }: DeskProps & { variant?: "night" | "light" }) {
  return <DeskToneCtx.Provider value={variant}>{variant === "light" ? <LightDesk {...props} /> : <NightDesk {...props} />}</DeskToneCtx.Provider>;
}

function NightDesk({
  backLabel,
  onBack,
  eyebrow,
  title,
  subtitle,
  details,
  meta,
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
  /** Harita künyesi (zodyak · ev sistemi · düğüm …): görünür küçük etiketler. */
  meta?: (string | null | undefined)[];
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
  // Sol menü: kayıtlı tercih yoksa 1280px altında dar başlar. Sağ panel: her açılışta KAPALI (harita öncelikli).
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => (typeof window === "undefined" ? false : (readNavPref() ?? window.innerWidth < 1280)));
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDesk = useDeskLayout();
  const metaList = (meta ?? []).filter((m): m is string => !!m);

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
    // Ana alanın (main) doğrudan çocuğu olan sayfa kabına kadar masanın altındaki her şey (ara kaplar, alt dolgular).
    let outer: HTMLElement = el;
    while (outer.parentElement && outer.parentElement.tagName !== "MAIN" && outer.parentElement !== document.body) outer = outer.parentElement;
    const below = Math.max(0, outer.getBoundingClientRect().bottom - rect.bottom);
    setDeskH(Math.max(420, Math.floor(window.innerHeight - top - below - 1)));
  }, []);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // Başlık / sekme şeridi / bildirim yüksekliği değişince yeniden ölç (masanın üstü kayar).
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

  const toggleNav = () =>
    setNavCollapsed((c) => {
      writeNavPref(!c);
      return !c;
    });
  /** Menüden bölüm seçimi: bölümü açar ve bilgi panelini gösterir; açık bölüme tekrar basmak paneli aç/kapatır. */
  const selectSection = (id: string) => {
    if (id === active) setPanelOpen((o) => !o);
    else {
      onTab(id);
      setPanelOpen(true);
    }
  };

  const hasChart = !!chart;
  const current = tabs.find((t) => t.id === active);
  const openFocus = () => setOverlay(true);
  const focusBtn = hasChart ? (
    <button type="button" onClick={openFocus} className={TOOL} title="Haritayı tam ekranda büyük göster" data-testid="atlas-chart-expand">
      <Maximize2 className="h-3.5 w-3.5" /> Odak modu
    </button>
  ) : null;
  const panelBtn = (
    <button
      type="button"
      onClick={() => setPanelOpen((o) => !o)}
      aria-expanded={panelOpen}
      aria-controls="atlas-result-panel"
      className={`${TOOL} ${panelOpen ? "border-[#D9B56F]/55 text-[#F6E7C3]" : ""}`}
      title={panelOpen ? "Bilgi panelini kapat — harita genişler" : `Bilgi panelini aç (${current?.label ?? "bölüm"})`}
      data-testid="atlas-panel-toggle"
    >
      {panelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
      {panelOpen ? "Paneli kapat" : `Bilgi paneli · ${current?.label ?? ""}`}
    </button>
  );

  const panel = (
    <div id="atlas-result-panel" role="tabpanel" aria-labelledby={`atlas-result-tab-${active}`} className="min-w-0">
      {children}
    </div>
  );

  return (
    <section className={`${atlasDisplay.variable} ${atlasText.variable} relative flex min-w-0 flex-col gap-3 [font-family:var(--font-atlas-text)]`} aria-label="Analiz sonucu" data-testid="astro-result-view">
      {/* ── Kompakt konsol başlığı (künye aynı satırda → harita için dikey alan) ── */}
      <header className={`${SURFACE} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 text-[#F6F2EA] sm:px-5 xl:flex-nowrap`}>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#F6F2EA]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-[#D9B56F]/60 hover:text-[#D9B56F]"
          >
            ←
          </button>
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/90">{eyebrow}</p>
            <h2 className="truncate text-lg font-light tracking-[0.01em] text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-xl">{title}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#F6F2EA]/70 xl:flex-nowrap">
              {subtitle && <span className="shrink-0">{subtitle}</span>}
              {details && <span className="min-w-0 text-[#F6F2EA]/55 xl:truncate">{details}</span>}
              {metaList.length > 0 && (
                <ul className="flex shrink-0 flex-wrap gap-1 xl:flex-nowrap" aria-label="Harita künyesi" data-testid="atlas-chart-meta">
                  {metaList.map((m) => (
                    <li key={m} className="rounded-full border border-[#D9B56F]/30 bg-[#D9B56F]/[0.07] px-2 py-0.5 text-[10.5px] tracking-[0.02em] text-[#F6E7C3]/90">
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:flex-nowrap">
          {chips}
          {actions}
        </div>
      </header>

      {notices}
      {switcher}

      {isDesk ? (
        /* ── MASAÜSTÜ: menü (daraltılabilir) · HARİTA · isteğe bağlı panel ── */
        <div
          ref={deskRef}
          style={{
            ...(deskH ? { height: deskH } : {}),
            gridTemplateColumns: `${navCollapsed ? "56px" : "212px"} minmax(0,1fr)${panelOpen ? ` minmax(340px,${hasChart ? "0.5fr" : "0.62fr"})` : ""}`,
          }}
          className="grid min-h-0 gap-3"
          data-layout={hasChart ? "chart" : "table"}
          data-nav={navCollapsed ? "collapsed" : "expanded"}
          data-panel={panelOpen ? "open" : "closed"}
          data-testid="atlas-desk-grid"
        >
          <nav id="atlas-result-nav" className={`${SURFACE} flex min-h-0 flex-col gap-2 overflow-y-auto ${navCollapsed ? "items-stretch p-1.5" : "p-2.5"}`} aria-label="Analiz menüsü">
            <div className={`flex items-center ${navCollapsed ? "justify-center" : "justify-between px-1"}`}>
              {!navCollapsed && <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/80">BÖLÜMLER</p>}
              <button
                type="button"
                onClick={toggleNav}
                aria-expanded={!navCollapsed}
                aria-controls="atlas-result-nav"
                aria-label={navCollapsed ? "Bölüm menüsünü genişlet" : "Bölüm menüsünü daralt"}
                title={navCollapsed ? "Menüyü genişlet" : "Menüyü daralt"}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#F6F2EA]/70 transition hover:bg-white/10 hover:text-[#F6E7C3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F]"
                data-testid="atlas-nav-toggle"
              >
                {navCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
            <ConsoleMenu
              items={tabs}
              active={active}
              onChange={(id) => {
                // Ok tuşlarıyla gezinme: bölüm değişir ve içeriği görünür olsun diye panel açılır.
                onTab(id);
                setPanelOpen(true);
              }}
              onSelect={selectSection}
              idBase="atlas-result"
              collapsed={navCollapsed}
            />
          </nav>

          {/* Orta: harita (ya da tekniğin kendi sonuç görünümü) — ara çerçeve yok, araçlar haritanın üstünde yüzer. */}
          <div className="relative min-h-0 min-w-0" data-testid="atlas-stage">
            {hasChart ? (
              <ChartBezel className="h-full p-1">
                <ChartViewport key={chartKey}>{chart!("h-full w-full max-h-full")}</ChartViewport>
              </ChartBezel>
            ) : (
              <div className={`${SURFACE} flex h-full min-h-0 flex-col p-2`}>
                <div
                  className="min-h-0 flex-1 overflow-auto rounded-[1.1rem] bg-[#F6F2EA] p-4 pt-12 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(217,181,111,0.18)] [scrollbar-width:thin]"
                  data-testid="atlas-stage-scroll"
                >
                  {stage}
                </div>
              </div>
            )}
            <div className={`pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 ${hasChart ? "right-16" : "right-3"}`}>
              <span className={`rounded-lg px-2 py-1 text-[10.5px] font-semibold tracking-[0.16em] ${hasChart ? "bg-[#0b1234]/70 text-[#E6CF9F]/85 backdrop-blur" : "text-[#8a6d33]"}`}>
                {hasChart ? "HARİTA" : "TEKNİK SONUÇ"}
              </span>
              <span className="pointer-events-auto flex flex-wrap gap-1.5">
                {focusBtn}
                {panelBtn}
              </span>
            </div>
          </div>

          {/* Sağ: isteğe bağlı bilgi paneli — kapalıyken GİZLENİR (DOM'da kalır; taslaklar ve istekler korunur). */}
          <div className={`${SURFACE} min-h-0 flex-col p-3 ${panelOpen ? "flex" : "hidden"}`} data-testid="atlas-info-panel">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              {current?.ownHeading ? (
                <span className="sr-only">{current.label}</span>
              ) : (
                <h3 className="text-[15px] font-normal tracking-[0.01em] text-[#F6F2EA] [font-family:var(--font-atlas-display)]">{panelTitle ?? current?.label}</h3>
              )}
              <span className="flex items-center gap-2">
                {current?.hint && <span className="hidden text-[11px] text-[#F6F2EA]/55 2xl:inline">{current.hint}</span>}
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  aria-label="Bilgi panelini kapat"
                  title="Paneli kapat — harita genişler"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#F6F2EA]/65 transition hover:bg-white/10 hover:text-[#F6E7C3]"
                  data-testid="atlas-panel-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
            <div
              ref={panelRef}
              className="min-h-0 flex-1 overflow-y-auto rounded-[1.1rem] bg-[#F6F2EA] p-3 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(217,181,111,0.18)] [scrollbar-width:thin]"
              data-testid="atlas-panel-scroll"
            >
              {panel}
            </div>
          </div>
        </div>
      ) : (
        /* ── TABLET / MOBİL: harita üstte ve büyük; altında bölüm seçici + panel (doğal kaydırma) ── */
        <div className="flex flex-col gap-3" data-testid="atlas-desk-mobile">
          {hasChart ? (
            <div className={`${mobileChart === "normal" ? "" : "sticky top-0 z-30"} ${SURFACE} p-1.5`} data-testid="atlas-mobile-chart">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/80">HARİTA</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setMobileChart((m) => (m === "pinned" ? "normal" : "pinned"))} aria-pressed={mobileChart === "pinned"} className={TOOL}>
                    {mobileChart === "pinned" ? "Sabitlemeyi kaldır" : "Üstte sabitle"}
                  </button>
                  <button type="button" onClick={() => setMobileChart((m) => (m === "mini" ? "normal" : "mini"))} aria-pressed={mobileChart === "mini"} className={TOOL}>
                    {mobileChart === "mini" ? "Büyüt" : "Küçült"}
                  </button>
                  {focusBtn}
                </div>
              </div>
              <ChartBezel className={`mx-auto aspect-square w-full p-0.5 ${mobileChart === "pinned" ? "max-h-[42svh] max-w-[42svh]" : mobileChart === "mini" ? "max-h-[150px] max-w-[150px]" : "max-w-[min(100%,82svh)]"}`}>
                {mobileChart === "mini" ? (
                  chart!("h-full w-full max-h-full")
                ) : (
                  <ChartViewport key={chartKey} compact>
                    {chart!("h-full w-full max-h-full")}
                  </ChartViewport>
                )}
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
        <ChartOverlay open={overlay} onClose={() => setOverlay(false)} title={title} meta={metaList}>
          <ChartViewport key={`${chartKey ?? ""}|odak`} label="Harita — odak modu">
            {chart!("h-full w-full max-h-full")}
          </ChartViewport>
        </ChartOverlay>
      )}
    </section>
  );
}

/* ── AYDINLIK ASTROLOG MASASI (variant="light") ─────────────────────────────────────────────────────
 * Sade, açık zeminli profesyonel çalışma ekranı: büyük harita + yanında GENİŞ bilgi alanı (sekmeli).
 * • Harita yüksekliğe göre kare boyutlanır; bilgi alanı haritanın yanında KALAN genişliğin tamamını alır (en az 420px).
 *   Böylece tablolar bütün sütunlarıyla okunur ve bölüm değiştirmek haritayı küçültmez.
 * • Harita ile bilgi alanı arasındaki ayırıcı sürüklenebilir (varsayılan %65 / %35; kullanıcı başına hatırlanır).
 * • Yıldız, parlama, yörünge, 3D süs YOK. Gece kabuğu yalnız bu masa açıkken ana alanda açık zemine döner.
 */
/* Harita | bilgi paneli bölmesi (Excel sütunu gibi sürüklenir). Oran = harita sütununun masa genişliğindeki payı. */
const SPLIT_DEFAULT = 0.65;
const SPLIT_DIVIDER = 14; // görünür çizgi ince, yakalama alanı 14px
const SPLIT_MIN_CHART = 320;
const SPLIT_MIN_PANEL = 300; // daha darında tablolar panelin İÇİNDE kayar (sayfa kaymaz)
/** Tercih: yalnız bu tarayıcı + bu kullanıcı (başka uzmanın ayarını etkilemez). Okunamazsa varsayılan. */
const splitKey = () => `atlas.natalDesk.split:${readYasamUser()?.id ?? "anon"}`;
function readSplit(): number | null {
  try {
    const v = Number(window.localStorage.getItem(splitKey()));
    return Number.isFinite(v) && v > 0.05 && v < 0.95 ? v : null;
  } catch {
    return null;
  }
}
function writeSplit(v: number) {
  try {
    window.localStorage.setItem(splitKey(), v.toFixed(4));
  } catch {
    /* depolama kapalı olabilir; oran yalnız bu oturumda geçerli kalır */
  }
}
const LTOOL =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B1430]";

function LightTabs({
  items,
  active,
  onPick,
  idBase,
  trailing,
  compact = false,
}: {
  items: DeskTab[];
  active: string;
  onPick: (id: string) => void;
  idBase: string;
  trailing?: ReactNode;
  /** Dar panel: yalnız ikon (ad ipucunda ve ekran okuyucu etiketinde). */ compact?: boolean;
}) {
  const { refs, onKey } = useMenuKeys(items, onPick, "horizontal");
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 px-2">
      <div role="tablist" aria-label="Analiz bölümleri" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5" data-testid="atlas-result-sections">
        {items.map((t, i) => {
          const on = t.id === active;
          const Icon = iconOf(t.id);
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
              onClick={() => onPick(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              title={compact ? t.label : undefined}
              className={`relative inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0B1430] ${
                on ? "text-[#0B1430]" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className={compact ? "sr-only" : undefined}>{t.label}</span>
              {t.badge !== undefined && t.badge !== null && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-[#0B1430] text-white" : "bg-slate-100 text-slate-600"}`}>{t.badge}</span>}
              {on && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[#c9a54e]" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}

function LightOverlay({ open, onClose, title, meta, children }: { open: boolean; onClose: () => void; title: string; meta?: string[]; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Harita odak modu — ${title}`} className="fixed inset-0 z-[80] flex flex-col gap-2 bg-[#f4f3ef] p-2 text-slate-800 sm:p-4" data-testid="atlas-chart-overlay">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500">ODAK MODU</p>
          <p className="truncate text-base font-semibold text-slate-900">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {meta?.map((m) => (
            <span key={m} className="hidden rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 sm:inline">
              {m}
            </span>
          ))}
          <button ref={closeRef} type="button" onClick={onClose} className={`${LTOOL} h-9`} data-testid="atlas-chart-overlay-close">
            <X className="h-4 w-4" /> Normal görünüm <span className="hidden text-slate-400 sm:inline">(Esc)</span>
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">{children}</div>
      <p className="px-1 text-center text-[11px] text-slate-500">Tekerlek veya + / − ile yakınlaştırın · sürükleyerek gezinin · 0 ya da ⛶ ile başlangıç boyutu</p>
    </div>
  );
}

function LightDesk({ backLabel, onBack, eyebrow, title, subtitle, details, meta, chips, actions, switcher, notices, tabs, active, onTab, chart, stage, chartKey, children }: DeskProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const deskRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [split, setSplit] = useState<number>(() => (typeof window === "undefined" ? SPLIT_DEFAULT : (readSplit() ?? SPLIT_DEFAULT)));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; colW: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDesk = useDeskLayout();
  const metaList = (meta ?? []).filter((m): m is string => !!m);
  const hasChart = !!chart;

  // Gece kabuğu yalnız bu masa açıkken aydınlık zemine döner (ana alan: data-atlas-light).
  useEffect(() => {
    const main = sectionRef.current?.closest("main");
    if (!main) return;
    main.dataset.atlasLight = "1";
    return () => {
      delete main.dataset.atlasLight;
    };
  }, []);

  // Masa alanı: genişlik = masanın kendisi; yükseklik = görünür ekran − masanın üstü − altındaki pay.
  const measure = useCallback(() => {
    const el = deskRef.current;
    if (!el || window.innerWidth < 1024) {
      setBox(null);
      return;
    }
    const scrollTop = (document.scrollingElement?.scrollTop ?? 0) + document.body.scrollTop;
    const rect = el.getBoundingClientRect();
    let outer: HTMLElement = el;
    while (outer.parentElement && outer.parentElement.tagName !== "MAIN" && outer.parentElement !== document.body) outer = outer.parentElement;
    const below = Math.max(0, outer.getBoundingClientRect().bottom - rect.bottom);
    const h = Math.max(360, Math.floor(window.innerHeight - (rect.top + scrollTop) - below - 1));
    setBox((b) => (b && b.w === Math.floor(rect.width) && b.h === h ? b : { w: Math.floor(rect.width), h }));
  }, []);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const sec = sectionRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (ro && sec) for (const child of Array.from(sec.children)) ro.observe(child);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure, isDesk]);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [active]);

  const pick = (id: string) => {
    if (id !== active) onTab(id);
  };
  const h = box?.h ?? 520;
  const w = box?.w ?? 1100;

  // ── Sürüklenebilir bölme (harita % / bilgi %). ──
  const usable = Math.max(1, w - SPLIT_DIVIDER);
  const minR = Math.min(0.5, SPLIT_MIN_CHART / usable);
  const maxR = Math.max(0.5, 1 - SPLIT_MIN_PANEL / usable);
  const clampSplit = (r: number) => Math.min(maxR, Math.max(minR, r));
  const ratio = clampSplit(split);
  const chartColW = Math.floor(usable * ratio);
  // Harita: sütun genişliği ve kullanılabilir yükseklikten küçüğü kadar KARE (kesilmez, ovalleşmez).
  const side = Math.max(260, Math.floor(Math.min(h, chartColW) - 2)); // kartın 1px kenarlığı (iki yan) düşülür
  const commitSplit = (r: number) => {
    const v = clampSplit(r);
    setSplit(v);
    writeSplit(v);
  };
  const onDividerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, colW: chartColW };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* yakalama olmadan da hareket izlenir */
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onDividerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setSplit(clampSplit((d.colW + (e.clientX - d.x)) / usable));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    writeSplit(ratio);
  };
  const onDividerKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft") commitSplit(ratio - step);
    else if (e.key === "ArrowRight") commitSplit(ratio + step);
    else if (e.key === "Home") commitSplit(minR);
    else if (e.key === "End") commitSplit(maxR);
    else if (e.key === "Enter") commitSplit(SPLIT_DEFAULT);
    else return;
    e.preventDefault();
  };
  const pctChart = Math.round(ratio * 100);

  const panel = (
    <div id="atlas-result-panel" role="tabpanel" aria-labelledby={`atlas-result-tab-${active}`} className="min-w-0">
      {children}
    </div>
  );
  const focusBtn = hasChart ? (
    <button type="button" onClick={() => setOverlay(true)} className={LTOOL} title="Haritayı tam ekranda büyük göster" data-testid="atlas-chart-expand">
      <Maximize2 className="h-3.5 w-3.5" /> Odak modu
    </button>
  ) : null;
  const chartNode = (compact: boolean) =>
    hasChart ? (
      <ChartViewport key={chartKey} tone="light" compact={compact}>
        {chart!("h-full w-full max-h-full")}
      </ChartViewport>
    ) : (
      <div className="h-full overflow-auto p-4 text-slate-800 [scrollbar-width:thin]" data-testid="atlas-stage-scroll">
        {stage}
      </div>
    );

  return (
    <section
      ref={sectionRef}
      className={`${atlasDisplay.variable} ${atlasText.variable} relative flex min-w-0 flex-col gap-2.5 text-slate-800 [font-family:var(--font-atlas-text)]`}
      aria-label="Analiz sonucu"
      data-testid="astro-result-view"
      data-variant="light"
    >
      {/* ── Tek satır başlık: geri · ad + künye · durum + işlemler ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)] xl:flex-nowrap [&_strong]:!text-slate-900">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="shrink-0 text-[10px] font-semibold tracking-[0.14em] text-slate-500">{eyebrow}</p>
            <h2 className="truncate text-[17px] font-semibold tracking-[0.005em] text-slate-900">{title}</h2>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 xl:flex-nowrap">
            {subtitle && <span className="shrink-0">{subtitle}</span>}
            {details && <span className="min-w-0 text-slate-500 xl:truncate">{details}</span>}
            {metaList.length > 0 && (
              <ul className="flex shrink-0 flex-wrap gap-1 xl:flex-nowrap" aria-label="Harita künyesi" data-testid="atlas-chart-meta">
                {metaList.map((m) => (
                  <li key={m} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] text-slate-600">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:flex-nowrap">
          {/* Görünüm: haritanın üstüne binmesin diye başlıkta */}
          <span className="flex items-center gap-1.5 border-r border-slate-200 pr-2" role="group" aria-label="Görünüm">
            {focusBtn}
          </span>
          {chips}
          {actions}
        </div>
      </header>

      {notices}
      {switcher && <div className="rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">{switcher}</div>}

      {isDesk ? (
        <div
          ref={deskRef}
          style={{
            ...(box ? { height: box.h } : {}),
            gridTemplateColumns: `${chartColW}px ${SPLIT_DIVIDER}px minmax(0,1fr)`,
          }}
          className="grid min-h-0 items-stretch"
          data-layout={hasChart ? "chart" : "table"}
          data-split={String(pctChart)}
          data-testid="atlas-desk-grid"
        >
          {/* Harita sütunu: beyaz kart sütunu doldurur; harita içinde ortalanmış KARE (genişlik/yükseklikten küçüğü). */}
          <div className="relative min-h-0 min-w-0" data-testid="atlas-stage">
            <div
              className={`flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${dragging ? "border-[#c9a54e]/60" : "border-slate-200"}`}
              data-testid="atlas-chart-card"
            >
              {hasChart ? (
                <div className="relative" style={{ width: side, height: side }} data-testid="atlas-chart-frame">
                  {chartNode(false)}
                </div>
              ) : (
                /* Haritası tablo/ızgara olan teknikler (Vedik kundli, KP, dasha…): kendi biçiminde, sütunun tamamında. */
                <div className="h-full w-full min-w-0">{chartNode(false)}</div>
              )}
            </div>
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-controls="atlas-result-panel"
            aria-label="Harita ile bilgi paneli arasındaki ayırıcı. Sağ ve sol ok tuşlarıyla genişliği ayarlayın (Shift ile hızlı), Enter ile yüzde 65 / 35 başlangıç düzenine dönün."
            aria-valuemin={Math.round(minR * 100)}
            aria-valuemax={Math.round(maxR * 100)}
            aria-valuenow={pctChart}
            aria-valuetext={`Harita yüzde ${pctChart}, bilgi paneli yüzde ${100 - pctChart}`}
            tabIndex={0}
            title="Sürükleyerek genişliği ayarlayın · çift tık: %65 / %35"
            onPointerDown={onDividerDown}
            onPointerMove={onDividerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={() => commitSplit(SPLIT_DEFAULT)}
            onKeyDown={onDividerKey}
            className="group relative flex cursor-col-resize touch-none select-none justify-center outline-none"
            data-testid="atlas-desk-divider"
            data-dragging={dragging ? "1" : undefined}
          >
            <span
              className={`my-3 rounded-full transition-all duration-150 ${
                dragging ? "w-[3px] bg-[#c9a54e]" : "w-px bg-slate-300 group-hover:w-[3px] group-hover:bg-[#c9a54e]/80 group-focus-visible:w-[3px] group-focus-visible:bg-[#0B1430]"
              }`}
              aria-hidden="true"
            />
            <span
              className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 flex-col gap-[3px] rounded-full border bg-white px-[3px] py-2 shadow-sm transition ${
                dragging ? "border-[#c9a54e] opacity-100" : "border-slate-300 opacity-70 group-hover:border-[#c9a54e]/80 group-hover:opacity-100"
              }`}
              aria-hidden="true"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className={`h-[3px] w-[3px] rounded-full ${dragging ? "bg-[#c9a54e]" : "bg-slate-400 group-hover:bg-[#c9a54e]"}`} />
              ))}
            </span>
            {dragging && (
              <span className="pointer-events-none absolute top-3 z-20 whitespace-nowrap rounded-md bg-[#0B1430] px-2 py-1 text-[11px] font-medium tabular-nums text-white shadow" aria-hidden="true">
                %{pctChart} · %{100 - pctChart}
              </span>
            )}
          </div>
          <div
            className={`min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] flex`}
            style={{ height: box ? box.h : undefined }}
            data-testid="atlas-info-panel"
          >
            <LightTabs items={tabs} active={active} onPick={pick} idBase="atlas-result" compact={usable - chartColW < 400} />
            <div ref={panelRef} className="min-h-0 flex-1 overflow-auto bg-[#fbfaf7] p-3 [scrollbar-width:thin]" data-testid="atlas-panel-scroll">
              {panel}
            </div>
          </div>
        </div>
      ) : (
        /* ── TABLET / MOBİL: harita üstte tam genişlik, altında sekmeler ve içerik (doğal kaydırma) ── */
        <div className="flex flex-col gap-2.5" data-testid="atlas-desk-mobile">
          {hasChart ? (
            <div className="relative mx-auto aspect-square w-full max-w-[min(100%,82svh)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="atlas-mobile-chart">
              {chartNode(true)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-sm" data-testid="atlas-mobile-stage">
              {stage}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <LightTabs items={tabs} active={active} onPick={pick} idBase="atlas-result-m" />
            <div className="overflow-x-auto bg-[#fbfaf7] p-3">{panel}</div>
          </div>
        </div>
      )}

      {hasChart && (
        <LightOverlay open={overlay} onClose={() => setOverlay(false)} title={title} meta={metaList}>
          <ChartViewport key={`${chartKey ?? ""}|odak`} label="Harita — odak modu" tone="light">
            {chart!("h-full w-full max-h-full")}
          </ChartViewport>
        </LightOverlay>
      )}
    </section>
  );
}

/** Başlık çipleri (masa tonuna göre: koyu gece masası / aydınlık masa). */
export function DeskChip({ tone, children }: { tone: "ok" | "warn" | "muted" | "saved"; children: ReactNode }) {
  const light = useContext(DeskToneCtx) === "light";
  const cls = light
    ? tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : tone === "saved"
          ? "border-[#d9c39a] bg-[#fbf3e1] text-[#6b4f1d]"
          : "border-slate-200 bg-slate-50 text-slate-600"
    : tone === "ok"
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
/** Aydınlık masada ikincil düğme. */
export const deskGhostLight = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-500";
export const deskGhost = "inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-[#F6F2EA] transition hover:border-[#D9B56F]/70 hover:text-[#F6E7C3]";
