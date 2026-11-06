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
import { ArrowLeft, BookOpen, CircleDot, House, Maximize, Maximize2, Minus, MoreHorizontal, Plus, Orbit, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PenLine, Save, Sparkles, Sun, Table2, Triangle, X, Home } from "lucide-react";
import { atlasDisplay, atlasText } from "./fonts";
import ChartViewport, { CHART_VIEWPORT_MAX, type ChartViewportApi } from "./ChartViewport";
import DeskPopover from "./DeskPopover";
import HScrollProxy from "./HScrollProxy";
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

/**
 * 2026-10-12 (UAT 2. tur, madde G): iç ekranlarda (sonuç masası, kayıtlı analiz, Yeni Analiz) "Gökyüzü Atlası Ana
 * Sayfa" kontrolü. Geri oku = bir önceki ekran; ev simgesi = MODÜLÜN başlangıç ekranı (Yaşam Sistemi dashboard'u DEĞİL).
 * Sayfa bağlamla sağlar (prop zinciri yok); sağlanmadıysa düğme görünmez.
 */
export const AtlasHomeContext = createContext<(() => void) | null>(null);
export function AtlasHomeButton({ tone = "light" }: { tone?: "light" | "dark" }) {
  const onHome = useContext(AtlasHomeContext);
  if (!onHome) return null;
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label="Gökyüzü Atlası ana sayfası"
      title="Gökyüzü Atlası ana sayfası"
      data-testid="atlas-home-btn"
      className={
        tone === "light"
          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#F6F2EA]/80 transition hover:border-[#D9B56F]/60 hover:text-[#D9B56F]"
      }
    >
      <Home className="h-4 w-4" />
    </button>
  );
}

export default function ResultDesk({ variant = "night", ...props }: LightDeskProps & { variant?: "night" | "light" }) {
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
  /**
   * V3 analiz seçicisi (2026-11-05, yalnız aydınlık masa): verilirse başlık (eyebrow + ad) yerine çizilir; telefonda künye ve
   * işlemler "⋯" menüsüne toplanır (aynı düğmeler, aynı işlev). Verilmezse başlık önceki sürümle aynı.
   */
  picker?: ReactNode;
  /**
   * Yalnız picker ile: birincil işlem (ör. "Tümünü Kaydet"). Telefonda "⋯" menüsüne GİRMEZ — başlığın altında tek başına görünür
   * (2026-10-12 UAT: kayıt düğmesi ilk ekranda); masaüstünde diğer işlemlerin yanında.
   */
  primary?: ReactNode;
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
          <AtlasHomeButton tone="dark" />
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/90">{eyebrow}</p>
            <h2 className="min-w-0 break-words text-lg font-light tracking-[0.01em] text-[#F6F2EA] [font-family:var(--font-atlas-display)] [overflow-wrap:anywhere] sm:text-xl xl:truncate" title={title}>{title}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#F6F2EA]/70 xl:flex-nowrap">
              {subtitle && <span className="min-w-0 break-words [overflow-wrap:anywhere] xl:shrink-0">{subtitle}</span>}
              {details && <span className="min-w-0 break-words text-[#F6F2EA]/55 [overflow-wrap:anywhere] xl:truncate">{details}</span>}
              {metaList.length > 0 && (
                <ul className="flex min-w-0 flex-wrap gap-1 xl:shrink-0 xl:flex-nowrap" aria-label="Harita künyesi" data-testid="atlas-chart-meta">
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

/* ── AYDINLIK ASTROLOG MASASI (variant="light") — V4 PREMIUM ÇALIŞMA ALANI (2026-11-06, owner kararı) ──────────────────
 * İki ana bölüm; üstte büyük başlık / künye / filtre şeridi YOK:
 *   • SOL — HARİTA: masanın tüm yüksekliği. Kartın üstünde tek ince araç satırı (Natal: Temel/Profesyonel + "Ek noktalar" /
 *     "Açı çizgileri" açılır çoklu seçim menüleri; diğer teknikler: kısa açıklama) + Odak modu. Menüler sayfa akışına
 *     girmez (DeskPopover) → harita kaymaz / küçülmez. Harita kalan alana KARE olarak sığar (kesilmez, ovalleşmez).
 *     Haritası tablo / metin olan tekniklerde (Vedik kundli, KP, Sabit Yıldızlar…) sol alan tekniğin kendi sonucudur.
 *   • SAĞ — BİLGİ: masanın üstünden altına kadar. Üstte kompakt kimlik (analiz seçici + danışan künyesi, "Künye ▾" ile
 *     ayrıntı), uyarılar, birincil işlem (Kaydet) ve kısa işlemler; "⋯" ikincil işlemler (kayıtlı analizi aç, dosyaya / teknik
 *     seçimine dönüş, Atlas ana sayfası). Altında solda dikey BÖLÜM RAYI (her bölüm tek tıkla), sağda bölüm içeriği (kendi
 *     içinde kayar). Sürekli görünen "Kaydedildi" etiketi, geri oku ve üst yorum düğmesi kaldırıldı (işlevler korunur).
 *   • Harita | bilgi ayırıcısı sürüklenebilir (varsayılan %62 / %38; kullanıcı başına hatırlanır).
 *   • Tablet / telefon (<1024 px): iki kolon zorlanmaz → kimlik + işlemler, harita (araç satırıyla), bölüm seçici + içerik.
 * Yıldız, parlama, yörünge, 3D süs YOK. Gece kabuğu yalnız bu masa açıkken ana alanda açık zemine döner.
 */
/* Harita | bilgi paneli bölmesi (Excel sütunu gibi sürüklenir). Oran = harita sütununun masa genişliğindeki payı. */
const SPLIT_DEFAULT = 0.62;
const SPLIT_DIVIDER = 14; // görünür çizgi ince, yakalama alanı 14px
const SPLIT_MIN_CHART = 320;
const SPLIT_MIN_PANEL = 340; // sağ bilgi kolonu (kimlik + bölüm rayı + içerik) bundan daralmaz; tablolar panelin İÇİNDE kayar
/** İki kolonlu masa için gereken en küçük masa genişliği (harita ≥ ~500 px + bilgi ≥ 340 px). */
const DESK_MIN_W = 860;
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
/** "⋯" menüsündeki satır (çağıranların menü öğeleri de bunu kullanır). */
export const deskMenuItem =
  "flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0B1430] disabled:opacity-50 max-sm:min-h-[46px]";

type LightDeskProps = DeskProps & {
  /** Sol harita kartının araç satırı (Natal görünüm denetimi). Yoksa yalnız "HARİTA / TEKNİK SONUÇ" etiketi. */
  toolbar?: ReactNode;
  /** Haritaya ait kısa açıklamalar (transit / sinastri / yönlendirme çark açıklaması, eksik çerçeve uyarısı). */
  chartNotes?: ReactNode;
  /** "⋯" menüsüne giren ikincil işlemler (deskMenuItem biçimli düğmeler). */
  menu?: ReactNode;
  /**
   * V4-005 (2026-11-06 owner): seçici kipinde TEKRARSIZ künye. `params`: tekniğin parametreleri (teknik adı OLMADAN — o seçicide);
   * sıkışık satırda harita künyesiyle (zodyak · ev sistemi · düğüm) yan yana. `kunye`: "Künye ▾" açılınca görünen YALNIZ EK
   * ayrıntılar (kayıt zamanı, saat dilimi, revizyon, ikinci kişi…) — danışan adı / doğum bilgisi / analiz başlığı tekrar edilmez.
   * Verilmezse önceki künye davranışı aynen.
   */
  params?: string | null;
  kunye?: { label: string; value: ReactNode; title?: string }[];
};

/** Sağ kolonun dikey bölüm rayı (masaüstü). Her bölüm tek tıkla (ikon + ad); ok tuşları / Home / End ile gezilir.
 *  Dar bilgi kolonunda ray incelir (ad küçük yazıyla kalır — yalnız ikona düşülmez). */
function SectionRail({ items, active, onPick, narrow }: { items: DeskTab[]; active: string; onPick: (id: string) => void; narrow: boolean }) {
  const { refs, onKey } = useMenuKeys(items, onPick, "vertical");
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label="Analiz bölümleri"
      className={`flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-slate-100 bg-[#f7f6f2] [scrollbar-width:none] ${narrow ? "w-[64px] p-1" : "w-[78px] p-1.5"}`}
      data-testid="atlas-result-sections"
      data-rail={narrow ? "narrow" : "wide"}
    >
      {items.map((t, i) => {
        const on = t.id === active;
        const Icon = iconOf(t.id);
        const hasBadge = t.badge !== undefined && t.badge !== null;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`atlas-result-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="atlas-result-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onPick(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            title={t.hint ? `${t.label} — ${t.hint}` : t.label}
            className={`relative flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1.5 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0B1430] ${on ? "bg-white text-[#0B1430] shadow-[0_1px_3px_rgba(15,23,42,0.10)]" : "text-slate-500 hover:bg-white/70 hover:text-slate-800"}`}
            data-section={t.id}
          >
            {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[#c9a54e]" aria-hidden="true" />}
            <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
            <span className={`line-clamp-2 font-medium leading-[1.15] ${narrow ? "text-[9.5px]" : "text-[10.5px]"}`}>{t.label}</span>
            {hasBadge && (
              <span
                className={`absolute right-1 top-1 min-w-[1.05rem] rounded-full px-1 text-center text-[9.5px] font-semibold leading-4 tabular-nums ${on ? "bg-[#0B1430] text-white" : "bg-slate-200 text-slate-600"}`}
                aria-label={`(${t.badge})`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Tablet / telefon bölüm seçici: tek satır, yatay kayan çipler (sayfa yatay kaymaz). */
function SectionChips({ items, active, onPick }: { items: DeskTab[]; active: string; onPick: (id: string) => void }) {
  const { refs, onKey } = useMenuKeys(items, onPick, "horizontal");
  return (
    <div role="tablist" aria-label="Analiz bölümleri" className="flex gap-1.5 overflow-x-auto px-2 py-2 [scrollbar-width:none]" data-testid="atlas-result-sections">
      {items.map((t, i) => {
        const on = t.id === active;
        const Icon = iconOf(t.id);
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`atlas-result-m-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="atlas-result-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onPick(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition ${
              on ? "border-[#0B1430] bg-[#0B1430] text-white" : "border-slate-200 bg-white text-slate-600"
            }`}
            data-section={t.id}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
            {t.badge !== undefined && t.badge !== null && <span className={`text-[11px] tabular-nums ${on ? "text-white/75" : "text-slate-400"}`}>{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Telefon / tablet: kayarken üstte KALAN bölüm çipleri. CSS `sticky` burada çalışmaz —
 * uygulama kabuğundaki `<main>` `overflow-x: hidden` (→ kaydırmayan bir kaydırma kabı) olduğundan yapışkan öğe hiç yapışmaz
 * (2026-11-06 ölçüldü). Kabuğa dokunmadan: şerit yerinden çıkınca sabitlenir (yer tutucu yüksekliği korur → içerik
 * zıplamaz), kapsayan kartın sonunda kartla birlikte yukarı itilir. Yalnız görünüm.
 */
function PinTop({ boundaryRef, className, children, testId }: { boundaryRef: React.RefObject<HTMLElement | null>; className?: string; children: ReactNode; testId?: string }) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pin, setPin] = useState<{ top: number; left: number; width: number; h: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const holder = holderRef.current;
      const bar = barRef.current;
      const bound = boundaryRef.current;
      if (!holder || !bar || !bound) return;
      const hr = holder.getBoundingClientRect();
      const br = bound.getBoundingClientRect();
      const h = bar.offsetHeight;
      if (hr.top < 0 && br.bottom > h) {
        const next = { top: Math.min(0, Math.round(br.bottom - h)), left: Math.round(hr.left), width: Math.round(hr.width), h };
        setPin((p) => (p && p.top === next.top && p.left === next.left && p.width === next.width && p.h === next.h ? p : next));
      } else setPin(null);
    };
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", later, { capture: true, passive: true });
    window.addEventListener("resize", later);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(later) : null;
    if (ro && barRef.current) ro.observe(barRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", later, { capture: true });
      window.removeEventListener("resize", later);
      ro?.disconnect();
    };
  }, [boundaryRef]);
  return (
    <div ref={holderRef} style={pin ? { height: pin.h } : undefined} data-testid={testId} data-pinned={pin ? "1" : "0"}>
      <div ref={barRef} className={className} style={pin ? { position: "fixed", top: pin.top, left: pin.left, width: pin.width, zIndex: 30 } : undefined}>
        {children}
      </div>
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

/** "⋯" ikincil işlemler menüsü: çağıranın öğeleri + dönüş (eski geri okunun işlevi) + Gökyüzü Atlası ana sayfası. */
function DeskMoreMenu({ menu, backLabel, onBack }: { menu?: ReactNode; backLabel: string; onBack: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const onHome = useContext(AtlasHomeContext);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Diğer işlemler"
        title="Diğer işlemler"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${open ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900"}`}
        data-testid="atlas-desk-menu-toggle"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <DeskPopover open={open} onClose={close} triggerRef={triggerRef} width={272} align="end" label="Diğer işlemler" testId="atlas-desk-menu">
        {/* Öğeye basınca menü kapanır (öğenin kendi işlevi aynen çalışır). */}
        <div
          className="flex flex-col p-1.5"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) setOpen(false);
          }}
        >
          {menu}
          {menu && <span className="my-1 h-px bg-slate-100" aria-hidden="true" />}
          <button type="button" className={deskMenuItem} onClick={run(onBack)} aria-label={backLabel} data-testid="atlas-desk-back">
            <ArrowLeft className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            {backLabel}
          </button>
          {onHome && (
            <button type="button" className={deskMenuItem} onClick={run(onHome)} aria-label="Gökyüzü Atlası ana sayfası" data-testid="atlas-home-btn">
              <Home className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              Gökyüzü Atlası ana sayfası
            </button>
          )}
        </div>
      </DeskPopover>
    </>
  );
}

function LightDesk({ backLabel, onBack, eyebrow, title, subtitle, details, meta, chips, actions, switcher, picker, primary, notices, tabs, active, onTab, chart, stage, chartKey, children, toolbar, chartNotes, menu, params, kunye }: LightDeskProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  // Künye: kapalıyken tek satır (sığmayan kısım "…"); "Künye ▾" tam metni açar (bilgi gizlenmez).
  const [metaOpen, setMetaOpen] = useState(false);
  const deskRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [split, setSplit] = useState<number>(() => (typeof window === "undefined" ? SPLIT_DEFAULT : (readSplit() ?? SPLIT_DEFAULT)));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; colW: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // V4-002: üst yatay kaydırma şeridinin kapsamları (teknik sonuç alanı · telefonda bilgi içeriği).
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mPanelRef = useRef<HTMLDivElement | null>(null);
  const mPanelCardRef = useRef<HTMLDivElement | null>(null);
  const mStageCardRef = useRef<HTMLDivElement | null>(null);
  // Masadaki harita görüntüleyicisi (araç satırındaki − / + / sığdır onu sürer). Odak modu kendi bağımsız görüntüleyicisini kullanır.
  const vpApi = useRef<ChartViewportApi | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  // İki kolon yalnız ≥1024 px ekranda VE masa için gerçekten yer varken (uygulama menüsü açıkken 1024 px'te masa ~700 px
  // kalır → harita ~350 px'e düşerdi). Dar alanda tablet düzeni: harita tam genişlikte, bilgi altında.
  const wideScreen = useDeskLayout();
  const [roomy, setRoomy] = useState(true);
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const check = () => setRoomy(el.getBoundingClientRect().width >= DESK_MIN_W);
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const isDesk = wideScreen && roomy;
  const metaList = (meta ?? []).filter((m): m is string => !!m);
  // Künyedeki UYARI niteliğindeki öğeler (saat bilinmiyor, yüksek enlem, ev sınırı) uyarı çipi olarak HER genişlikte görünür.
  const metaWarn = metaList.filter((m) => META_WARN_RE.test(m));
  const metaPlain = metaList.filter((m) => !META_WARN_RE.test(m));
  const hasChart = !!chart;
  const current = tabs.find((t) => t.id === active);
  // Araç satırı tek satırda kalsın: sığmazsa önce "Odak modu" yalnız simge (1280 px altındaki mevcut davranış), yine sığmazsa
  // sayaç ekrandan kalkar (aynı bilgi "Açı çizgileri" menüsünde; <1536 px'teki mevcut davranış). Genişleyince yeniden denenir.
  // Telefonda yine sığmazsa Natal denetimleri eski dizilimini korur (Temel/Profesyonel + Ek noktalar yan yana) ve − + ⛶ · Odak
  // grubu kendi satırına, sağa iner — açık "Ek noktalar" menüsü "Açı çizgileri" düğmesinin üstünü kapatmaz.
  const toolRef = useRef<HTMLDivElement | null>(null);
  const [tight, setTight] = useState(0);
  const [toolTick, setToolTick] = useState(0);
  const toolKey = `${chartKey ?? ""}|${isDesk ? "masa" : "mobil"}`;
  const [tightKey, setTightKey] = useState(toolKey);
  if (tightKey !== toolKey) {
    // Başka analiz / düzen: araç satırı içeriği değişti → sıkıştırma baştan denenir (render sırasında, koşullu sıfırlama).
    setTightKey(toolKey);
    setTight(0);
  }
  useEffect(() => {
    const el = toolRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth;
      if (Math.abs(nw - w) < 1) return;
      w = nw;
      setTight(0);
      setToolTick((t) => t + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesk, hasChart]);
  useLayoutEffect(() => {
    const el = toolRef.current;
    if (el && tight < 2 && el.offsetHeight > 56) setTight(tight + 1);
  }, [tight, toolTick, toolKey]);

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
    const h = Math.max(480, Math.floor(window.innerHeight - (rect.top + scrollTop) - below - 1));
    setBox((b) => (b && b.w === Math.floor(rect.width) && b.h === h ? b : { w: Math.floor(rect.width), h }));
  }, []);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const sec = sectionRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (ro && sec) for (const child of Array.from(sec.children)) ro.observe(child);
    // Masanın ÜSTÜNDEKİ öğeler ölçümden sonra yerleşirse (geç yüklenen şerit / yazı tipi) yükseklik yeniden hesaplanır.
    if (ro && sec?.parentElement) {
      ro.observe(sec.parentElement);
      let outer: HTMLElement = sec;
      while (outer.parentElement && outer.parentElement.tagName !== "MAIN" && outer.parentElement !== document.body) outer = outer.parentElement;
      if (outer !== sec.parentElement) ro.observe(outer);
    }
    let alive = true;
    const later = [window.setTimeout(measure, 150), window.setTimeout(measure, 700), window.setTimeout(measure, 1600)];
    void document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
      later.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure, isDesk]);
  // Bölüm değişince yalnız bilgi içeriği başa döner; sayfa ve harita yerinde kalır.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [active]);

  const pick = (id: string) => {
    if (id !== active) onTab(id);
  };
  const w = box?.w ?? 1100;

  // ── Sürüklenebilir bölme (harita % / bilgi %). ──
  const usable = Math.max(1, w - SPLIT_DIVIDER);
  const minR = Math.min(0.5, SPLIT_MIN_CHART / usable);
  const maxR = Math.max(0.5, 1 - SPLIT_MIN_PANEL / usable);
  const clampSplit = (r: number) => Math.min(maxR, Math.max(minR, r));
  const ratio = clampSplit(split);
  const chartColW = Math.floor(usable * ratio);
  const infoColW = usable - chartColW;
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
    <div id="atlas-result-panel" role="tabpanel" aria-labelledby={`atlas-result${isDesk ? "" : "-m"}-tab-${active}`} className="min-w-0">
      {!current?.ownHeading && current && (
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 className="text-[15px] font-semibold text-slate-900">{current.label}</h3>
          {current.hint && <span className="text-[11.5px] text-slate-500">{current.hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
  const focusBtn = hasChart ? (
    <button type="button" onClick={() => setOverlay(true)} className={`${LTOOL} shrink-0`} title="Haritayı tam ekranda büyük göster" aria-label="Odak modu — haritayı tam ekranda göster" data-testid="atlas-chart-expand">
      <Maximize2 className="h-3.5 w-3.5" /> <span className="max-[1279px]:hidden" data-focus-label="">Odak modu</span>
    </button>
  ) : null;

  /* ── Sağ kolon başlığı: kimlik (seçici / ad) · künye · uyarılar · işlemler ── */
  const hasMetaLine = !!(subtitle || details || metaPlain.length > 0);
  // V4-005: seçici kipinde tekrarsız künye (danışan + analiz başlığı seçicide; burada yalnız teknik özet + ek ayrıntılar).
  const lean = !!picker && !!kunye;
  // Tek düz metin: kısaltma ("…") metnin KENDİ öğesinde → hiçbir parça kutusundan / ekrandan taşmaz.
  const techText = [params || null, ...metaPlain].filter(Boolean).join(" · ");
  const leanMeta = !metaOpen ? (
    <div className="flex min-w-0 items-center gap-2 text-[12px] text-slate-600" id="atlas-desk-header-details" data-meta="compact" data-kunye="lean">
      {/* Telefonda satıra sarılır (kesilmez); geniş ekranda tek satır "…" ve tam metin ipucunda. */}
      <span className="min-w-0 flex-1 break-words sm:truncate" title={techText || undefined} aria-label={techText ? `Teknik künye: ${techText}` : undefined} data-testid="atlas-chart-meta">
        {techText}
      </span>
      {kunye && kunye.length > 0 && (
        <button
          type="button"
          onClick={() => setMetaOpen(true)}
          aria-expanded={false}
          aria-controls="atlas-desk-header-details"
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          title="Ek teknik ayrıntılar"
          data-testid="atlas-desk-meta-toggle"
        >
          Künye ▾
        </button>
      )}
    </div>
  ) : (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] text-slate-600" id="atlas-desk-header-details" data-meta="full" data-kunye="lean">
      <p className="m-0 min-w-0 break-words [overflow-wrap:anywhere]" data-testid="atlas-chart-meta">
        {techText}
      </p>
      <dl className="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5" data-testid="atlas-desk-kunye">
        {(kunye ?? []).map((k) => (
          <div key={k.label} className="contents">
            <dt className="text-slate-500">{k.label}</dt>
            <dd className="m-0 min-w-0 break-words text-slate-700 [overflow-wrap:anywhere]" title={k.title}>
              {k.value}
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={() => setMetaOpen(false)}
        aria-expanded={true}
        aria-controls="atlas-desk-header-details"
        className="self-start rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        data-testid="atlas-desk-meta-toggle"
      >
        Künye ▴
      </button>
    </div>
  );
  const actionRow = primary || actions;
  const header = (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-3.5 pb-3 pt-3 max-sm:px-3 [&_strong]:!text-slate-800" data-testid="atlas-desk-header" data-picker={picker ? "1" : undefined}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {picker ?? (
            <>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500">{eyebrow}</p>
              <h2 className="min-w-0 break-words text-[17px] font-semibold tracking-[0.005em] text-slate-900 [overflow-wrap:anywhere]" title={title}>
                {title}
              </h2>
            </>
          )}
        </div>
        <DeskMoreMenu menu={menu} backLabel={backLabel} onBack={onBack} />
      </div>
      {lean && (params || metaPlain.length > 0 || (kunye && kunye.length > 0)) && leanMeta}
      {!lean &&
        hasMetaLine &&
        (!metaOpen ? (
          /* Tek satır: her parça KENDİ kutusunda "…" ile kısalır (kutudan taşan metin yok). Telefonda teknik özet satıra sarılır;
             harita künyesi "Künye ▾" altında. */
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-slate-600" id="atlas-desk-header-details" data-meta="compact">
            <span className="flex min-w-0 flex-1 items-center gap-1">
              {subtitle && <span className="min-w-0 shrink sm:truncate">{subtitle}</span>}
              {metaPlain.length > 0 && (
                <span className="min-w-0 shrink-[2] truncate text-slate-500 max-sm:hidden" aria-label="Harita künyesi" data-testid="atlas-chart-meta">
                  {subtitle ? "· " : ""}
                  {metaPlain.join(" · ")}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setMetaOpen(true)}
              aria-expanded={false}
              aria-controls="atlas-desk-header-details"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Künyenin tamamını göster"
              data-testid="atlas-desk-meta-toggle"
            >
              Künye ▾
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] text-slate-600" id="atlas-desk-header-details" data-meta="full">
            {subtitle && <p className="min-w-0 break-words [overflow-wrap:anywhere]">{subtitle}</p>}
            {details && <p className="min-w-0 break-words text-slate-500 [overflow-wrap:anywhere]">{details}</p>}
            {metaPlain.length > 0 && (
              <ul className="flex min-w-0 flex-wrap gap-1" aria-label="Harita künyesi" data-testid="atlas-chart-meta">
                {metaPlain.map((m) => (
                  <li key={m} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] text-slate-600">
                    {m}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setMetaOpen(false)}
              aria-expanded={true}
              aria-controls="atlas-desk-header-details"
              className="self-start rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              data-testid="atlas-desk-meta-toggle"
            >
              Künye ▴
            </button>
          </div>
        ))}
      {(metaWarn.length > 0 || chips) && (
        <div className="flex flex-wrap items-center gap-1.5 empty:hidden" data-testid="atlas-desk-header-chips">
          {metaWarn.map((m) => (
            <DeskChip key={m} tone="warn">
              {m}
            </DeskChip>
          ))}
          {chips}
        </div>
      )}
      {actionRow && (
        <div className="flex flex-wrap items-center gap-2" id="atlas-desk-header-actions" data-testid="atlas-desk-header-actions">
          {primary && <span className="contents" data-testid="atlas-desk-header-primary">{primary}</span>}
          {actions}
        </div>
      )}
      {notices}
    </div>
  );

  // Owner son yerleşim kararı (06.11.2026): yakınlaştırma düğmeleri araç satırında, sayaç ("Açı listesi … · çarkta çizili …")
  // ile "Odak modu" ARASINDA: − · + · ⛶ (sığdır). Yüzde göstergesi yok. Düğmeler haritadaki ChartViewport'u sürer (tek motor).
  const zoomBtn =
    "flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B1430] max-sm:h-9 max-sm:w-9";
  const zoomCtl = hasChart ? (
    <span role="group" aria-label="Harita yakınlaştırma" className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white/95 p-px shadow-sm" data-testid="atlas-zoom-controls">
      <button type="button" className={zoomBtn} onClick={() => vpApi.current?.zoomOut()} disabled={zoomScale <= 1.001} aria-label="Küçült" title="Küçült (−) · tekerlek / iki parmak da çalışır" data-testid="atlas-zoom-out">
        <Minus className="h-4 w-4" />
      </button>
      <button type="button" className={zoomBtn} onClick={() => vpApi.current?.zoomIn()} disabled={zoomScale >= CHART_VIEWPORT_MAX - 0.001} aria-label="Büyüt" title="Büyüt (+) · tekerlek / iki parmak da çalışır" data-testid="atlas-zoom-in">
        <Plus className="h-4 w-4" />
      </button>
      <button type="button" className={zoomBtn} onClick={() => vpApi.current?.fit()} disabled={zoomScale <= 1.001} aria-label="Alana sığdır" title="Alana sığdır / başlangıç boyutu (0)" data-testid="atlas-zoom-fit">
        <Maximize className="h-3.5 w-3.5" />
      </button>
    </span>
  ) : null;
  const toolRow = (
    <div
      ref={toolRef}
      className="flex min-h-[44px] flex-wrap items-start gap-2 border-b border-slate-100 px-2.5 py-1.5 [&>[data-testid=natal-wheel-controls]]:min-w-[min(100%,18.5rem)] [&[data-tight]_[data-focus-label]]:hidden [&[data-tight=two]_[data-testid=natal-aspect-counts]]:sr-only"
      data-testid="atlas-chart-toolbar"
      data-tight={tight === 0 ? undefined : tight === 1 ? "one" : "two"}
    >
      {toolbar ?? <span className="self-center text-[10.5px] font-semibold tracking-[0.16em] text-slate-500">{hasChart ? "HARİTA" : "TEKNİK SONUÇ"}</span>}
      {(zoomCtl || focusBtn) && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {zoomCtl}
          {focusBtn}
        </span>
      )}
    </div>
  );
  const notesRow = chartNotes ? (
    <div className="border-b border-slate-100 px-3 py-1.5 text-[12px] text-slate-600 [&_p]:m-0" data-testid="atlas-chart-notes">
      {chartNotes}
    </div>
  ) : null;
  // Harita ilk açılışta alana oranını koruyarak sığar; alan değişince (pencere, ayırıcı, menü) kendiliğinden boyutlanır.
  // Yakınlaştırma: araç satırındaki − / + / sığdır, harita ÜZERİNDE fare tekerleği, iki parmak, klavye (+ / − / 0) — hepsi
  // aynı ChartViewport (yalnız CSS dönüşümü; çizim / hesap değişmez). Haritanın üstünde ayrı düğme kartı yok.
  const chartNode = () =>
    hasChart ? (
      <div className="absolute inset-0 p-1" data-testid="atlas-chart-fit">
        <ChartViewport key={chartKey} tone="light" controls={false} apiRef={vpApi} onScaleChange={setZoomScale}>
          {chart!("h-full w-full max-h-full")}
        </ChartViewport>
      </div>
    ) : (
      <div className="flex h-full min-h-0 flex-col">
        <div ref={stageRef} className="min-h-0 flex-1 overflow-auto p-4 text-slate-800 [scrollbar-width:thin]" data-testid="atlas-stage-scroll">
          {stage}
        </div>
        <HScrollProxy rootRef={stageRef} viewportRef={stageRef} resetKey={chartKey} testId="atlas-stage-hscroll" />
      </div>
    );

  return (
    <section
      ref={sectionRef}
      className={`${atlasDisplay.variable} ${atlasText.variable} relative flex min-w-0 flex-col gap-2.5 text-slate-800 [font-family:var(--font-atlas-text)]`}
      aria-label="Analiz sonucu"
      data-testid="astro-result-view"
      data-variant="light"
      data-desk="v4"
    >
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
          {/* SOL: harita kartı — araç satırı + (varsa) kısa açıklama + harita alanın TAMAMINDA (kare, ortalı). */}
          <div className="relative min-h-0 min-w-0" data-testid="atlas-stage">
            <div
              className={`flex h-full w-full flex-col overflow-hidden rounded-xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${dragging ? "border-[#c9a54e]/60" : "border-slate-200"}`}
              data-testid="atlas-chart-card"
            >
              {toolRow}
              {notesRow}
              <div className="relative min-h-0 flex-1" data-testid={hasChart ? "atlas-chart-frame" : undefined}>
                {chartNode()}
              </div>
            </div>
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-controls="atlas-result-panel"
            aria-label="Harita ile bilgi paneli arasındaki ayırıcı. Sağ ve sol ok tuşlarıyla genişliği ayarlayın (Shift ile hızlı), Enter ile yüzde 62 / 38 başlangıç düzenine dönün."
            aria-valuemin={Math.round(minR * 100)}
            aria-valuemax={Math.round(maxR * 100)}
            aria-valuenow={pctChart}
            aria-valuetext={`Harita yüzde ${pctChart}, bilgi paneli yüzde ${100 - pctChart}`}
            tabIndex={0}
            title="Sürükleyerek genişliği ayarlayın · çift tık: %62 / %38"
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
          {/* SAĞ: bilgi kolonu — masanın üstünden altına; kimlik + işlemler, altında bölüm rayı + içerik. */}
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]" data-testid="atlas-info-panel">
            {header}
            {switcher && <div className="border-b border-slate-100 px-2 py-1">{switcher}</div>}
            <div className="flex min-h-0 flex-1">
              <SectionRail items={tabs} active={active} onPick={pick} narrow={infoColW < 460} />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div ref={panelRef} className="min-h-0 min-w-0 flex-1 overflow-auto bg-[#fbfaf7] p-3.5 [scrollbar-width:thin]" data-testid="atlas-panel-scroll">
                  {panel}
                </div>
                <HScrollProxy rootRef={panelRef} viewportRef={panelRef} resetKey={`${chartKey ?? ""}|${active}`} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── TABLET / TELEFON: kimlik + işlemler · harita (araç satırıyla) · bölüm seçici + içerik (doğal kaydırma) ── */
        <div className="flex flex-col gap-2.5" data-testid="atlas-desk-mobile">
          <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm max-sm:rounded-none max-sm:border-x-0" data-testid="atlas-info-panel">
            {header}
            {switcher && <div className="px-2 py-1">{switcher}</div>}
          </div>
          <div ref={mStageCardRef} className="overflow-clip rounded-xl border border-slate-200 bg-white shadow-sm max-sm:rounded-none max-sm:border-x-0" data-testid="atlas-chart-card">
            {toolRow}
            {notesRow}
            {hasChart ? (
              <div className="relative mx-auto aspect-square w-full max-w-[min(100%,82svh)]" data-testid="atlas-mobile-chart">
                {chartNode()}
              </div>
            ) : (
              <>
                <div ref={stageRef} className="overflow-x-auto p-3 text-slate-800" data-testid="atlas-mobile-stage">
                  {stage}
                </div>
                <HScrollProxy rootRef={stageRef} resetKey={chartKey} testId="atlas-stage-hscroll" fixedBoundaryRef={mStageCardRef} />
              </>
            )}
          </div>
          <div ref={mPanelCardRef} className="rounded-xl border border-slate-200 bg-white shadow-sm max-sm:rounded-none max-sm:border-x-0">
            <PinTop boundaryRef={mPanelCardRef} className="border-b border-slate-100 bg-white/95 backdrop-blur" testId="atlas-mobile-sections-bar">
              <SectionChips items={tabs} active={active} onPick={pick} />
            </PinTop>
            <div ref={mPanelRef} className="overflow-x-auto bg-[#fbfaf7] p-3">
              {panel}
            </div>
            <HScrollProxy rootRef={mPanelRef} resetKey={`${chartKey ?? ""}|${active}`} fixedBoundaryRef={mPanelCardRef} />
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
/** Künyede uyarı niteliğindeki öğeler (seçici kipinde gizlenmez). */
const META_WARN_RE = /bilinmiyor|Yüksek enlem|sınırına/i;

export function DeskChip({ tone, status = false, children }: { tone: "ok" | "warn" | "muted" | "saved"; /** Yalnız kayıt DURUMU çipi (başlıkta zaten var → telefonda V3 seçiciyle gizlenir). */ status?: boolean; children: ReactNode }) {
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
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${cls}`} data-desk-status={status ? "1" : undefined}>
      {children}
    </span>
  );
}

/** Başlıktaki işlem düğmeleri (koyu zemin). */
export const deskPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-[linear-gradient(180deg,#E6C887,#C9A158)] px-4 py-2 text-sm font-semibold text-[#0B1430] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_-10px_rgba(217,181,111,0.7)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F6F2EA] disabled:opacity-50";
/** Aydınlık masada ikincil düğme. */
export const deskGhostLight = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-500";
export const deskGhost = "inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-[#F6F2EA] transition hover:border-[#D9B56F]/70 hover:text-[#F6E7C3]";
