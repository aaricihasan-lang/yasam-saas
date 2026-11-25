"use client";

/**
 * Gökyüzü Atlası — GÖKSEL ANALİZ HAZIRLIK MERKEZİ (Aşama D3; yalnız Yeni Analiz ekranı, sunum katmanı).
 *
 * Yerleşim
 *   • Üst: kimlik plakası — kompakt danışan seçici + doğum verisi göstergeleri (tarih, saat, yer, saat doğruluğu, tz).
 *   • ≥1280 px: üç sütun — sol: sistem kadranları (Batı / Vedik / KP) + teknik dizini · orta: göksel ön izleme odası ·
 *     sağ: odaktaki tekniğin ayarları. 768–1279 px: iki sütun (ön izleme sağ üstte, ayarlar altında). <768 px: tek
 *     sütun, ayarlar odaktaki tekniğin satırında açılır.
 *   • Alt: Analiz Hazırlık Konsolu — ekranın altına YAPIŞIK (sticky); seçilen teknikler, plan göstergeleri ve Hesapla.
 *
 * Veri kuralları (değişmedi): seçim → buildSelections (sayfa) → SUNUCU planı → çalıştırma. Bu bileşen istek sayısı
 * tahmin etmez; plan sayfadan gelir. FINAL: Yeni Analiz'deki harita ön izlemesi owner kararıyla KALDIRILDI (aşağıdaki
 * ön izleme notu tarihçedir; gerçek haritalar yalnız Analiz Sonucu ekranında). Eski ön izleme ÜÇ durumu ayırıyordu:
 *   1) Temsili şema (TechniqueSchematic) — hesaplama sonucu DEĞİL; açıkça etiketli.
 *   2) Önceden hesaplanmış — /engine/view (YALNIZ-ÖNBELLEK uç; sağlayıcı bağımlılığı verilmez → Roxy isteği yapılamaz).
 *   3) Bu oturumda yeni hesaplanmış — aynı önbellek görünümü, son çalıştırmada reused=false olan sonuçla eşleşirse.
 * 3D: WebGL KULLANILMAZ; derinlik CSS perspektifli kaide/halka katmanları, iç gölge, cam ve metal degradelerle verilir.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowUpRight, Check, ChevronDown, ChevronRight, Info, Loader2, Pencil, Plus, Search, Settings2, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { NATAL_HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";
import { dateInputReason, describeOptions, missingReason, NEW_TECHNIQUES, TECHNIQUE_META, UI_TECHNIQUES, techniqueLabel, type LunarReturnInfo, type TechText, type PlanetaryReturnInfo, type PlanetaryReturnNeighbors, type TechniqueParams, type UiTechniqueId, type WesternMethod } from "../../_lib/techniques";
import { MethodFields, PartnerField, TechniqueParamFields, USES_HOUSE_SYSTEM, USES_NODE_TYPE, type NatalMethodContext, type PartnerOption } from "../TechniqueSelector";
import { deskPrimary } from "./ResultDesk";
import { ap } from "./premium/AtlasPremium";
import { atlasDisplay, atlasText } from "./fonts";
import { formatUtcOffset } from "../../_lib/utcOffset";
import { compactBlocked } from "./skippedSections";
import { deltaTBirthNotes } from "@/lib/astrology/deltaTNotice";

/* ── Tipler (sayfadakiyle yapısal olarak aynı) ─────────────────────────────────────────────────── */
export type PrepRevision = {
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  timeAccuracy?: string;
  timeAccuracyLabel: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  utcOffsetSeconds: number;
  /** YENİ-P2-03: saklı ofset güncel tarihsel saat dilimi tablosundan farklı (sunucu okuma anında işaretler). */
  staleTimezone?: { storedOffsetSeconds: number; currentOffsetSeconds: number | null; text: string };
  /** ATL-P2-07: saklı ofset temsilci şehrin yerel ortalama saati; doğum yeri boylamından farklı (yalnız uyarı). */
  lmtNotice?: { storedOffsetSeconds: number; localMeanOffsetSeconds: number; text: string };
};
type PlanSelection = { technique: string; options: Record<string, unknown> | null; unitCount: number; newRequests: number; blocked: { code: string; error: string } | null; info?: ({ skippedSections?: { section: string; label: string; reason: string }[] } & Record<string, unknown>) | null };
export type PrepPlan = { selectedCount: number; blockedCount: number; newRequestCount: number; cachedCount: number; coveredCount: number; dedupedCount: number; requiresConfirmation: boolean; selections: PlanSelection[] };
type ViewLike = { technique?: string; options: Record<string, unknown>; technical: unknown; timeUnknownMasked: boolean; warnings: string[] };
export type PrepRunItem = { technique: string; ok: true; partial: boolean; reused: boolean; view: ViewLike } | { technique: string; ok: false; code: string; error: string };

export type SystemId = "western" | "vedic" | "kp";
/** I18N-F1-R5 (ATLAS-B): sistem adları katalogdan (atlas.prep.system.<id>.label / short / sub). */
const SYSTEMS: { id: SystemId }[] = [{ id: "western" }, { id: "vedic" }, { id: "kp" }];
const systemOf = (id: UiTechniqueId): SystemId => id.split(".")[0] as SystemId;
/** 2026-10-30 (Owner): William Lilly Horary Batı listesinde BAĞLANTI olarak görünür — seçilebilir teknik DEĞİLDİR (natal motoruna,
 * plana ve doğum profiline girmez); tıklanınca bağımsız Horary ekranı (#horary-lilly) açılır. KP Horary ayrı (KP listesi). */
// Etiket / ipucu / arama sözcükleri katalogdan: atlas.prep.horary.{label,hint,search}.
const TECH_BY_SYSTEM: Record<SystemId, UiTechniqueId[]> = {
  western: UI_TECHNIQUES.filter((t) => systemOf(t) === "western"),
  vedic: UI_TECHNIQUES.filter((t) => systemOf(t) === "vedic"),
  kp: UI_TECHNIQUES.filter((t) => systemOf(t) === "kp"),
};

/** Tekniğin ne gösterdiği (genel tanım; kişiye özgü içerik yok). */

/** Gerekli / ayarlanabilir parametrelerin kısa özeti (dizinde görünür). */
/** Kendi parametresi olmayan teknikler (yalnız ortak Batı yöntemi veya hiç ayar). */
const NO_PRIMARY_PARAMS: UiTechniqueId[] = ["western.natal", "western.astrocartography", "western.synastry", "western.composite"];

/* ── Düzen modu ────────────────────────────────────────────────────────────────────────────────── */
type Mode = "wide" | "mid" | "narrow";
const MQ_WIDE = "(min-width: 1280px)";
const MQ_MID = "(min-width: 768px)";
function subscribeMode(cb: () => void) {
  const a = window.matchMedia(MQ_WIDE);
  const b = window.matchMedia(MQ_MID);
  a.addEventListener("change", cb);
  b.addEventListener("change", cb);
  return () => {
    a.removeEventListener("change", cb);
    b.removeEventListener("change", cb);
  };
}
function useMode(): Mode {
  return useSyncExternalStore(subscribeMode, () => (window.matchMedia(MQ_WIDE).matches ? "wide" : window.matchMedia(MQ_MID).matches ? "mid" : "narrow"), () => "wide");
}

/* ── Görsel yardımcılar ────────────────────────────────────────────────────────────────────────── */
/* Açık premium görünüm (2026-10-21): yüzey / yazı / çip / düğme değerleri tek kaynaktan (premium/atlasPremium.module.css). */
const SURFACE = ap.surface;
const EYEBROW = ap.eyebrowSm;

const CSS = `
@keyframes atlasPrepIn { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
.atlas-prep-in { animation: atlasPrepIn .32s cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .atlas-prep-in { animation: none; } .atlas-prep-dial { transition: none !important; } }
`;

export function DialEmblem({ id }: { id: SystemId }) {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="none" stroke="#D9B56F" strokeOpacity="0.55" strokeWidth="1" />
      {id === "western" && (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={32 + 27 * Math.cos(a)} y1={32 + 27 * Math.sin(a)} x2={32 + 21 * Math.cos(a)} y2={32 + 21 * Math.sin(a)} stroke="#D9B56F" strokeOpacity="0.6" strokeWidth="0.8" />;
          })}
          <circle cx="32" cy="32" r="13" fill="none" stroke="#9CC0F2" strokeOpacity="0.5" strokeDasharray="1.5 2.5" />
          <circle cx="32" cy="32" r="5" fill="#D9B56F" fillOpacity="0.9" />
        </g>
      )}
      {id === "vedic" && (
        <g fill="none" stroke="#D9B56F" strokeWidth="0.9">
          <rect x="16" y="16" width="32" height="32" strokeOpacity="0.7" />
          <path d="M16,16L48,48M48,16L16,48" strokeOpacity="0.45" />
          <path d="M32,16L48,32L32,48L16,32Z" strokeOpacity="0.6" />
        </g>
      )}
      {id === "kp" && (
        <g>
          {Array.from({ length: 54 }, (_, i) => {
            const a = (i * Math.PI * 2) / 54;
            const long = i % 2 === 0;
            return <line key={i} x1={32 + 27 * Math.cos(a)} y1={32 + 27 * Math.sin(a)} x2={32 + (long ? 21 : 24) * Math.cos(a)} y2={32 + (long ? 21 : 24) * Math.sin(a)} stroke={long ? "#D9B56F" : "#9CC0F2"} strokeOpacity="0.55" strokeWidth="0.6" />;
          })}
          <circle cx="32" cy="32" r="9" fill="none" stroke="#D9B56F" strokeOpacity="0.7" />
          <path d="M32,23v18M23,32h18" stroke="#9CC0F2" strokeOpacity="0.55" strokeWidth="0.8" />
        </g>
      )}
    </svg>
  );
}

/* ── Sistem kadranları (HUD uydu diskleri) ─────────────────────────────────────────────────────── */
function SystemDials({ active, onChange, counts }: { active: SystemId; onChange: (s: SystemId) => void; counts: Record<SystemId, number> }) {
  const tp = useTranslations("atlas.prep");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % 3;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i + 2) % 3;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = 2;
    if (n < 0) return;
    e.preventDefault();
    onChange(SYSTEMS[n].id);
    refs.current[SYSTEMS[n].id]?.focus();
  };
  return (
    <div data-testid="atlas-system-dials">
      <div role="tablist" aria-label={tp("sysAria")} className={ap.sysSeg}>
        {SYSTEMS.map((s, i) => {
          const on = s.id === active;
          return (
            <button
              key={s.id}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(s.id)}
              onKeyDown={(e) => onKey(e, i)}
              title={tp(`system.${s.id}.label`)}
              className={`${ap.sysSegBtn} ${on ? ap.sysSegOn : ""} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#6f55c9]`}
              data-system={s.id}
            >
              <span className={ap.sysSegIcon} aria-hidden="true">
                <DialEmblem id={s.id} />
              </span>
              {tp(`system.${s.id}.short`)}
              {counts[s.id] > 0 && <span className={ap.sysSegBadge}>{counts[s.id]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sürüklenebilir panel ayırıcı (geniş düzen) ──────────────────────────────────────────────────── */
const SPLIT_KEY = "atlas.newAnalysis.leftWidth";
const SPLIT_DEFAULT = 350;
const SPLIT_MIN = 270;
const SPLIT_MAX = 520;
const SPLIT_RIGHT_MIN = 600;
const SPLIT_HANDLE = 12;

const SPLIT_EVENT = "atlas-split-width";
function readSplit(): number {
  try {
    const v = Number(window.localStorage.getItem(SPLIT_KEY));
    return Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : SPLIT_DEFAULT;
  } catch {
    return memSplit ?? SPLIT_DEFAULT;
  }
}
function writeSplit(w: number) {
  const v = Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, w)));
  try {
    window.localStorage.setItem(SPLIT_KEY, String(v));
  } catch {
    /* depolama yoksa yalnız bu sayfa */
    memSplit = v;
  }
  window.dispatchEvent(new Event(SPLIT_EVENT));
}
let memSplit: number | null = null;
function subscribeSplit(cb: () => void) {
  window.addEventListener(SPLIT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SPLIT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Sol teknik listesi ↔ sağ çalışma alanı sınırı: fare/dokunmatik sürükleme, ←/→ (Shift: büyük adım), Home/End, çift tık = 350 px. */
function SplitHandle({ width, onWidth, containerRef }: { width: number; onWidth: (w: number) => void; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const tp = useTranslations("atlas.prep");
  const [drag, setDrag] = useState(false);
  const maxFor = () => {
    const w = containerRef.current?.getBoundingClientRect().width ?? 0;
    return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, w - SPLIT_RIGHT_MIN - SPLIT_HANDLE));
  };
  const shown = Math.min(width, maxFor());
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setDrag(true);
    const left = containerRef.current?.getBoundingClientRect().left ?? 0;
    const max = maxFor();
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => onWidth(Math.min(max, ev.clientX - left - SPLIT_HANDLE / 2));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      document.body.style.userSelect = prevSelect;
      setDrag(false);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = shown - step;
    else if (e.key === "ArrowRight") next = shown + step;
    else if (e.key === "Home") next = SPLIT_MIN;
    else if (e.key === "End") next = maxFor();
    if (next === null) return;
    e.preventDefault();
    onWidth(Math.min(maxFor(), next));
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={tp("splitAria")}
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={shown}
      tabIndex={0}
      title={tp("splitTitle")}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onWidth(SPLIT_DEFAULT)}
      className={`${ap.splitHandle} ${drag ? ap.splitHandleOn : ""} focus-visible:outline-none`}
      data-testid="atlas-split-handle"
    />
  );
}

/* ── Durum (plan) ──────────────────────────────────────────────────────────────────────────────── */
type Status = { kind: "none" | "pending" | "ready" | "new" | "blocked" | "missing" | "error"; text: string };
const STATUS_DOT: Record<Status["kind"], string> = {
  none: "bg-transparent",
  pending: ap.dotPending,
  ready: ap.dotReady,
  new: ap.dotNew,
  blocked: ap.dotBlocked,
  missing: ap.dotMissing,
  error: ap.dotError,
};

/* ── Bileşen ───────────────────────────────────────────────────────────────────────────────────── */
export default function PrepCenter({
  profile,
  rev,
  picker,
  onCreateClient,
  onEditBirth,
  onDeleteProfile,
  checked,
  onChecked,
  params,
  onParams,
  method,
  onMethod,
  partners,
  partnerQuery,
  onPartnerQuery,
  lunarReturns,
  planetaryReturns = null,
  planetaryReturnNeighbors = null,
  selections,
  plan,
  planError,
  running,
  runError,
  runFailures,
  onDismissFailures,
  onRun,
  labelOf,
  onOpenHorary,
  allowedTechniques = null,
}: {
  profile: { id: string; label: string; archivedAt?: string | null; clientName: string | null } | null;
  rev: PrepRevision | null;
  picker: ReactNode;
  /** D3.1: her zaman görünür "+ Yeni Danışan" (mevcut doğum profili formunu açar). */
  onCreateClient: () => void;
  onEditBirth: (() => void) | null;
  /** Seçili doğum profilini silme akışı (analizi olmayan profil dahil; A/B seçimi + sunucu onayı ArchiveDeleteFlow'da). */
  onDeleteProfile?: (() => void) | null;
  checked: Partial<Record<UiTechniqueId, boolean>>;
  /** Durum ayarlayıcı (işlevsel güncelleme desteklenir → hızlı ardışık tıklamalarda seçim kaybolmaz). */
  onChecked: (next: Partial<Record<UiTechniqueId, boolean>> | ((prev: Partial<Record<UiTechniqueId, boolean>>) => Partial<Record<UiTechniqueId, boolean>>)) => void;
  params: TechniqueParams;
  onParams: (next: TechniqueParams) => void;
  method: WesternMethod;
  onMethod: (next: WesternMethod) => void;
  partners: PartnerOption[];
  partnerQuery: string;
  onPartnerQuery: (q: string) => void;
  lunarReturns: LunarReturnInfo[] | null;
  /** 2026-10-22: gezegen dönüşü kümesinin kavuşumları (sunucu planından; yoksa null). */
  planetaryReturns?: PlanetaryReturnInfo[] | null;
  planetaryReturnNeighbors?: PlanetaryReturnNeighbors | null;
  selections: { technique: UiTechniqueId; options: Record<string, unknown> }[];
  plan: PrepPlan | null;
  planError: string | null;
  running: boolean;
  runError: string | null;
  /** FINAL: tüm seçili teknikler başarısız olduğunda (sonuç ekranı açılmaz) teknik bazında neden + sonraki adım. */
  runFailures: { at: number; items: { technique: string; code: string; error: string; retryAfterSec?: number }[] } | null;
  onDismissFailures: () => void;
  onRun: () => void;
  labelOf: (id: string) => string | null;
  /** Batı listesindeki William Lilly Horary girişi (yoksa giriş gösterilmez). */
  onOpenHorary?: () => void;
  /** 2026-11-03 teknik izinleri: izinli teknikler (null → kısıt yok). Kapalı teknik listelenmez; yetki ayrıca sunucuda. */
  allowedTechniques?: ReadonlySet<string> | null;
}) {
  const mode = useMode();
  const tp = useTranslations("atlas.prep");
  const tq = useTranslations("atlas.techniques") as unknown as TechText;
  const tt = useTranslations("terms");
  const tm = useTranslations("atlas.timingMore");
  const locale = useLocale();
  const lc = locale === "en" ? "en-GB" : "tr-TR";
  const label = (id: UiTechniqueId) => tq(`meta.${id}.label`);
  const hint = (id: UiTechniqueId) => tq(`meta.${id}.hint`);
  const techBySystem = useMemo<Record<SystemId, UiTechniqueId[]>>(
    () =>
      allowedTechniques
        ? { western: TECH_BY_SYSTEM.western.filter((t) => allowedTechniques.has(t)), vedic: TECH_BY_SYSTEM.vedic.filter((t) => allowedTechniques.has(t)), kp: TECH_BY_SYSTEM.kp.filter((t) => allowedTechniques.has(t)) }
        : TECH_BY_SYSTEM,
    [allowedTechniques],
  );
  const firstAllowed = UI_TECHNIQUES.find((t) => !allowedTechniques || allowedTechniques.has(t)) ?? "western.natal";
  const [system, setSystem] = useState<SystemId>(() => systemOf(firstAllowed));
  const [focus, setFocus] = useState<UiTechniqueId>(firstAllowed);
  const [birthDetailsOpen, setBirthDetailsOpen] = useState(false);
  const [techQuery, setTechQuery] = useState("");
  // Sürüklenebilir ayırıcı (yalnız geniş düzen): sol sütun genişliği tarayıcıda saklanır.
  const leftW = useSyncExternalStore(subscribeSplit, readSplit, () => SPLIT_DEFAULT);
  const setLeftW = useCallback((w: number) => writeSplit(w), []);

  const focusOn = (id: UiTechniqueId) => {
    setFocus(id);
    setSystem(systemOf(id));
  };
  const toggle = (id: UiTechniqueId, next?: boolean) => onChecked((prev) => ({ ...prev, [id]: next ?? !prev[id] }));

  const counts = useMemo(() => {
    const c: Record<SystemId, number> = { western: 0, vedic: 0, kp: 0 };
    for (const id of UI_TECHNIQUES) if (checked[id]) c[systemOf(id)]++;
    return c;
  }, [checked]);
  const chosen = UI_TECHNIQUES.filter((id) => checked[id]);

  // Plan satırı ↔ teknik: plan.selections, selections ile AYNI sırada (çalıştırma da bu eşlemeyi kullanır).
  const statusOf = useCallback(
    (id: UiTechniqueId): Status => {
      if (!checked[id]) return { kind: "none", text: "" };
      const idx = selections.findIndex((s) => s.technique === id);
      if (idx < 0) return { kind: "missing", text: missingReason(id, params, tq) ?? tp("st.missing") };
      if (!profile) return { kind: "pending", text: tp("st.noClient") };
      if (!plan) return planError ? { kind: "error", text: tp("st.planError") } : { kind: "pending", text: tp("st.pending") };
      const ps = plan.selections[idx];
      if (!ps) return { kind: "pending", text: tp("st.pending") };
      if (ps.blocked) return { kind: "blocked", text: compactBlocked(ps.blocked, ps.info?.skippedSections)!.text };
      if (ps.newRequests === 0) return { kind: "ready", text: tp("st.ready") };
      return { kind: "new", text: ps.newRequests === 1 ? tp("st.new1") : tp("st.newN", { n: ps.newRequests }) };
    },
    [checked, selections, plan, planError, profile, params, tp, tq],
  );

  /* ── Masaüstü yüksekliği ── */
  const deskRef = useRef<HTMLDivElement | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [deskH, setDeskH] = useState<number | null>(null);
  const [consoleH, setConsoleH] = useState(0);
  const measure = useCallback(() => {
    const ch = consoleRef.current?.offsetHeight ?? 0;
    setConsoleH(ch);
    const el = deskRef.current;
    if (!el || window.innerWidth < 768) {
      setDeskH(null);
      return;
    }
    // FINAL: masanın altındaki GERÇEK pay (konsol boşluğu + aralık + kapsayıcı alt dolgusu) canlı ölçülür → masaüstünde
    // gereksiz sayfa kaydırması olmaz. Kısa ekranda alt sınır korunur (doğal kaydırma).
    const scrollTop = (document.scrollingElement?.scrollTop ?? 0) + document.body.scrollTop;
    const rect = el.getBoundingClientRect();
    const top = rect.top + scrollTop;
    const sec = el.closest("section");
    const wrap = sec?.parentElement ?? null;
    const spacer = Math.max(ch, consoleRef.current?.offsetHeight ?? ch);
    const gap = sec ? parseFloat(getComputedStyle(sec).rowGap) || 12 : 12;
    const below = gap + spacer + (wrap ? parseFloat(getComputedStyle(wrap).paddingBottom) || 0 : 0);
    setDeskH(Math.max(window.innerWidth >= 1280 ? 340 : 520, Math.floor(window.innerHeight - top - below - 1)));
  }, []);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" && consoleRef.current ? new ResizeObserver(() => measure()) : null;
    if (ro && consoleRef.current) ro.observe(consoleRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure, mode, profile?.id, birthDetailsOpen]);

  const sysLabel = tp(`system.${system}.label`);
  const sysShort = tp(`system.${system}.short`);
  const meta = TECHNIQUE_META[focus];
  const focusOnChecked = !!checked[focus];
  const timeUnknown = !!rev && !rev.timeKnown;

  /* ── Parçalar ── */
  const dials = <SystemDials active={system} onChange={setSystem} counts={counts} />;

  const usesMethod = USES_HOUSE_SYSTEM.includes(focus) || USES_NODE_TYPE.includes(focus);
  // Aşama 3 (#643): Natal 8'li ev sistemi AYRI; diğer Batı teknikleri 4'lü ortak seçim.
  const houseSystemOf = (id: UiTechniqueId): string => (id === "western.natal" ? method.natalHouseSystem : method.houseSystem);
  const houseLabelFor = (id: UiTechniqueId): string => (NATAL_HOUSE_SYSTEM_LABELS[houseSystemOf(id)] ? tt(`houseSystem.${houseSystemOf(id) as "placidus"}`) : houseSystemOf(id));
  const sharedChosen = UI_TECHNIQUES.filter((x) => checked[x] && x !== "western.natal" && USES_HOUSE_SYSTEM.includes(x));
  const natalContext: NatalMethodContext = {
    latitude: rev?.latitude ?? null,
    timeKnown: rev ? rev.timeKnown : undefined,
    sharedTechniques: sharedChosen.map((x) => ({ id: x, label: label(x) })),
    onFocusTechnique: (x) => focusOn(x),
  };
  const houseSummary = [
    checked["western.natal"] ? tp("natalPrefix", { hs: houseLabelFor("western.natal") }) : null,
    sharedChosen.length > 0 ? `${checked["western.natal"] ? tp("otherWestern") : tp("sharedWestern")}: ${houseLabelFor(sharedChosen[0])}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const houseSummaryText = houseSummary ? tp("houseSummary", { s: houseSummary }) : "";
  const methodSummary = [
    USES_HOUSE_SYSTEM.includes(focus) ? tp("methodHouse", { hs: houseLabelFor(focus), def: houseSystemOf(focus) === "placidus" ? tp("default") : "" }) : null,
    USES_NODE_TYPE.includes(focus) ? tp("methodNode", { n: tt(`nodeType.${method.nodeType}`), def: method.nodeType === "true" ? tp("default") : "" }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const hasPrimary = meta.needsPartner || !NO_PRIMARY_PARAMS.includes(focus);
  const settingsBody = (inline: boolean) => {
    const st = statusOf(focus);
    // Plan önizlemesi: teknik içinde hesaplanmayacak bölümler (ör. ek noktalarda asteroit tarih kapsamı) gerekçesiyle.
    const focusIdx = checked[focus] ? selections.findIndex((s) => s.technique === focus) : -1;
    const skipped = focusIdx >= 0 && plan ? (plan.selections[focusIdx]?.info?.skippedSections ?? []) : [];
    // Seçim tamamen atlanan bölümlerle engelliyse gerekçeler durum satırında (her biri bir kez) zaten yazılı → liste tekrarlanmaz.
    const fullySkipped = focusIdx >= 0 && plan ? !!compactBlocked(plan.selections[focusIdx]?.blocked, skipped)?.fullySkipped : false;
    const primary = (
      <>
        {meta.needsPartner && <PartnerField params={params} onParams={onParams} partners={partners} partnerQuery={partnerQuery} onPartnerQuery={onPartnerQuery} />}
        <TechniqueParamFields id={focus} params={params} onParams={onParams} lunarReturns={lunarReturns} birthPlaceLabel={rev?.locationLabel ?? null} birthDate={rev?.birthDate ?? null} planetaryReturns={planetaryReturns} planetaryReturnNeighbors={planetaryReturnNeighbors} natalHouseSystem={method.natalHouseSystem} />
      </>
    );
    return (
      <div className="flex min-w-0 flex-col gap-3" data-testid="atlas-technique-settings" data-focus={focus}>
        {!inline && (
          <div className="flex min-w-0 flex-col gap-3 border-b border-[#e9dcc0] pb-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className={ap.focusEmblem} aria-hidden="true">
                <DialEmblem id={system} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={EYEBROW}>{sysLabel.toLocaleUpperCase(lc)}</p>
                <h3 className={`${ap.ink} ${ap.display} mt-0.5 break-words text-[1.75rem] leading-tight`}>{label(focus)}</h3>
                <p className={`${ap.muted} mt-0.5 text-[14px] leading-snug`}>{hint(focus)}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(focus)}
                aria-pressed={focusOnChecked}
                className={`${focusOnChecked ? ap.btnAdded : ap.btnGold} shrink-0 !min-h-[44px] !px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f55c9]`}
                data-testid="atlas-focus-toggle"
              >
                {focusOnChecked ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                <span className="whitespace-nowrap">{focusOnChecked ? tp("added") : tp("add")}</span>
              </button>
            </div>
            <p className={`${ap.text} text-[14px] leading-relaxed`}>{tp(`about.${focus}`)}</p>
            <p className={`inline-flex items-center gap-1.5 text-[12px] ${focusOnChecked ? ap.lavInk : ap.muted}`} data-testid="atlas-focus-selected">
              {focusOnChecked ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {focusOnChecked ? tp("addedNote") : tp("addNote")}
            </p>
          </div>
        )}
        {(meta.needsTime && timeUnknown) || st.kind !== "none" || focus === "kp.transit" ? (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {meta.needsTime && timeUnknown && <span className={ap.chipWarn}>{tp("timeUnknownChip")}</span>}
            {focus === "kp.transit" && <span className={ap.chipWarn}>{tp("noNatalHouses")}</span>}
            {st.kind !== "none" && (
              <span className={ap.chip} data-testid="atlas-focus-status">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[st.kind]}`} /> {st.text}
              </span>
            )}
          </div>
        ) : null}
        {skipped.length > 0 && !fullySkipped && (
          <ul className="flex min-w-0 flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900" data-testid="atlas-focus-skipped">
            {skipped.map((x) => (
              <li key={x.section} className="break-words" data-skipped-section={x.section}>
                {tp("skipped", { label: x.label, reason: x.reason })}
              </li>
            ))}
          </ul>
        )}
        <div className={`${ap.paramsCard} ${inline ? "" : ap.paramsCardWide} text-sm`} data-testid="atlas-params-card">
          {inline ? (
            <p className="mb-2 text-[10.5px] font-semibold tracking-[0.16em] text-[#8a6d2c]">{tp("settingsCaps")}</p>
          ) : (
            <div className="mb-3 flex items-center gap-2.5">
              <span className={ap.sectionIcon} aria-hidden="true">
                <Settings2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className={`${ap.ink} text-[15px] font-semibold leading-tight`}>{tp("settings")}</p>
                <p className={`${ap.muted} text-[12.5px] leading-snug`}>{hasPrimary || usesMethod ? tp("settingsHas") : tp("settingsNone")}</p>
              </div>
            </div>
          )}
          {hasPrimary ? <div className="flex min-w-0 flex-col gap-2.5">{primary}</div> : <p className="text-xs text-slate-600">{tp("settingsNone")}</p>}
          {usesMethod && (
            <details open={!inline || undefined} className={`${hasPrimary ? "mt-3" : ""} rounded-lg border border-[#d9c9a3] bg-white/60 px-2.5 py-2`} data-testid="atlas-advanced">
              <summary className="cursor-pointer select-none text-xs text-slate-700">
                <span className="font-semibold">{tp("advanced")}</span>
                <span className="block text-[11px] text-slate-500">{methodSummary}</span>
              </summary>
              <div className="mt-2">
                <MethodFields id={focus} method={method} onMethod={onMethod} natalContext={natalContext} />
                <p className="mt-1.5 text-[11px] text-slate-500" data-testid="atlas-method-note">
                  {focus === "western.natal"
                    ? tp("noteNatal")
                    : USES_HOUSE_SYSTEM.includes(focus)
                      ? `${tp("noteShared")}${checked["western.natal"] ? tp("noteSharedNatal", { hs: houseLabelFor("western.natal") }) : ""}`
                      : tp("noteNode")}
                </p>
              </div>
            </details>
          )}

        </div>
        {inline ? (
          <details className={`${ap.inset} group px-3 py-2.5`} data-testid="atlas-about">
            <summary className={`${ap.ink} cursor-pointer select-none text-[13px] font-semibold`}>{tp("aboutTitle")}</summary>
            <p className={`${ap.text} mt-1.5 text-[13px] leading-relaxed`}>{tp(`about.${focus}`)}</p>
            <p className={`${ap.muted} mt-1 text-[11.5px]`}>{tp("paramsLead", { p: tp(`params.${focus}`) })}</p>
          </details>
        ) : (
          <div className={`${ap.infoBox} flex items-start gap-2.5 px-3.5 py-3`} data-testid="atlas-about">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 text-[13px] leading-snug">
              <span className="block font-semibold">{tp("calcInfo")}</span>
              {tp("paramsLead", { p: tp(`params.${focus}`) })}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Arama ekran dilindeki ad + ipucunda (TR'de tr-TR küçük harf; davranış aynen).
  const q = techQuery.trim().toLocaleLowerCase(lc);
  const listed = techBySystem[system].filter((id) => !q || `${label(id)} ${hint(id)}`.toLocaleLowerCase(lc).includes(q));
  const horaryLabel = tp("horary.label");
  const showHorary = system === "western" && !!onOpenHorary && (!q || `${horaryLabel} ${tp("horary.hint")} ${tp("horary.search")}`.toLocaleLowerCase(lc).includes(q));
  const techSearch = (
    <label className={ap.searchBox}>
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={techQuery}
        onChange={(e) => setTechQuery(e.target.value)}
        placeholder={tp("searchPh")}
        aria-label={tp("searchAria", { sys: sysLabel })}
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-slate-400"
        data-testid="atlas-technique-search"
      />
      {techQuery && (
        <button type="button" onClick={() => setTechQuery("")} aria-label={tp("searchClear")} className="rounded p-0.5 hover:bg-black/5">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  );
  const techniqueIndex = (inlineSettings: boolean) => (
    <ul className="flex flex-col gap-1.5" aria-label={tp("listAria", { sys: sysLabel })} data-testid="atlas-technique-index">
      {listed.length === 0 && !showHorary && <li className={`${ap.muted} px-2 py-3 text-[13px]`}>{tp("noMatch", { q: techQuery })}</li>}
      {listed.map((id) => {
        const m = TECHNIQUE_META[id];
        const on = !!checked[id];
        const f = id === focus;
        const st = statusOf(id);
        return (
          <li key={id}>
            <div
              className={`${ap.tech} ${f ? ap.techFocus : on ? ap.techOn : ""}`}
            >
              {on && <span className={ap.techBar} aria-hidden="true" />}
              <button type="button" onClick={() => focusOn(id)} aria-current={f ? "true" : undefined} className="min-w-0 flex-1 px-3 py-2.5 text-left max-sm:px-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D9B56F]" data-technique-focus={id}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`min-w-0 break-words text-[14px] leading-snug ${on || f ? `${ap.ink} font-semibold` : `${ap.ink} font-medium`}`}>{label(id)}</span>
                  {NEW_TECHNIQUES.has(id) && <span className="shrink-0 rounded-full bg-[#f6ead0] px-[7px] py-[2px] text-[10px] font-bold tracking-[0.08em] text-[#8a6424]">{tp("new")}</span>}
                  {st.kind !== "none" && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[st.kind]}`} title={st.text} aria-label={st.text} />}
                  {!inlineSettings && <ChevronRight className={`ml-auto h-4 w-4 shrink-0 ${f ? ap.lavInk : ap.faint}`} aria-hidden="true" />}
                </span>
                <span className={`${ap.muted} mt-0.5 block break-words text-[12px] leading-snug`}>{hint(id)}</span>
                {m.needsTime && timeUnknown && <span className={`${ap.warnInk} mt-0.5 block text-[11px] leading-snug`}>{tp("needsTime")}</span>}
                {on && USES_HOUSE_SYSTEM.includes(id) && (
                  <span className={`${ap.lavInk} mt-0.5 block break-words text-[11px] leading-snug`} data-testid="atlas-tech-house" data-technique-house={id}>
                    {tp("techHouse", { hs: houseLabelFor(id) })}
                    {id === "western.natal" ? "" : tp("techHouseShared")}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={on}
                aria-label={on ? tp("remove", { label: label(id) }) : tp("addAria", { label: label(id) })}
                className={`${ap.techToggleCol} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#6f55c9]`}
                data-technique={id}
              >
                <span className={`${ap.techToggle} ${on ? ap.techToggleOn : ""}`}>
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5" />}
                </span>
              </button>
            </div>
            {inlineSettings && f && <div className={`atlas-prep-in ${ap.inset} mt-1.5 p-3 max-sm:-mx-2 max-sm:rounded-none max-sm:border-x-0 max-sm:px-2`}>{settingsBody(true)}</div>}
          </li>
        );
      })}
      {showHorary && (
        <li key="horary-lilly">
          <button
            type="button"
            onClick={onOpenHorary}
            className={`${ap.tech} w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D9B56F]`}
            aria-label={tp("horaryAria", { label: horaryLabel })}
            data-testid="atlas-horary-entry"
          >
            <span className="min-w-0 flex-1 px-3 py-2.5 max-sm:px-2">
              <span className={`${ap.ink} block min-w-0 break-words text-[14px] font-medium leading-snug`}>{horaryLabel}</span>
              <span className={`${ap.muted} mt-0.5 block break-words text-[12px] leading-snug`}>{tp("horary.hint")}</span>
            </span>
            <span className={ap.techToggleCol} aria-hidden="true">
              <span className={ap.techToggle}>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </span>
          </button>
        </li>
      )}
    </ul>
  );

  /* ── Konsol (D4: kısa özet + Plan Ayrıntıları) ── */
  const statuses = chosen.map((id) => statusOf(id));
  const readyN = statuses.filter((s) => s.kind === "ready").length;
  const newN = statuses.filter((s) => s.kind === "new").length;
  const blockedN = statuses.filter((s) => s.kind === "blocked").length;
  const missingN = statuses.filter((s) => s.kind === "missing").length;
  // Tarih/saat alanı tamamlanmamış teknik varken başlatma kapalı (yarım tarihle diğerleri sessizce çalışmasın).
  const dateIncomplete = chosen.some((id) => !!dateInputReason(id, params, tq));
  const runDisabled = !profile || running || !plan || plan.selectedCount === plan.blockedCount || dateIncomplete;
  const runLabel = running ? tp("running") : plan?.requiresConfirmation ? tp("confirmRun", { n: plan.newRequestCount }) : tp("run");

  const missingList = chosen.map((id) => ({ id, why: missingReason(id, params, tq) })).filter((x): x is { id: UiTechniqueId; why: string } => !!x.why);
  const [planOpen, setPlanOpen] = useState(false);
  const summaryLines = (
    <>
      <p className={`${ap.ink} text-[13px] leading-snug`} data-testid="atlas-console-summary">
        {!profile ? (
          tp("sum.noClient")
        ) : chosen.length === 0 ? (
          tp("sum.noTech")
        ) : (
          <>
            {tp.rich("sum.chosen", { n: chosen.length, b: (c) => <strong>{c}</strong> })}
            {plan ? (
              <>
                {" "}
                {tp.rich("sum.ready", { ready: readyN, nw: newN, ok: (c) => <strong className={ap.okInk}>{c}</strong>, gd: (c) => <strong className={ap.goldInk}>{c}</strong> })}
                {blockedN > 0 && (
                  <>
                    {" "}
                    {tp.rich("sum.blocked", { n: blockedN, d: (c) => <strong className={ap.dangerInk}>{c}</strong> })}
                  </>
                )}
              </>
            ) : planError ? (
              <span className={ap.dangerInk}> · {planError}</span>
            ) : (
              <span className={ap.muted}>{tp("sum.pending")}</span>
            )}
            {missingN > 0 && <span className={ap.warnInk}>{tp("sum.missing", { n: missingN })}</span>}
          </>
        )}
      </p>
      {houseSummaryText && (
        <p className={`${ap.lavInk} truncate text-[11px]`} data-testid="atlas-console-houses" title={houseSummaryText}>
          {houseSummaryText}
        </p>
      )}
      {plan && plan.newRequestCount > 0 && (
        <p className={`${ap.goldInk} truncate text-[11px]`} data-testid="atlas-console-requests">
          {tp("sum.requests", { n: plan.newRequestCount })}
        </p>
      )}
      {missingList.length > 0 && (
        <p className={`${ap.warnInk} truncate text-[11px]`} data-testid="atlas-console-missing" title={missingList.map((m) => `${label(m.id)}: ${m.why}`).join(" · ")}>
          {missingList.map((m) => `${label(m.id)}: ${m.why}`).join(" · ")}
          {tp("sum.missingTail")}
        </p>
      )}
    </>
  );
  const planToggle =
    chosen.length > 0 ? (
      <button
        type="button"
        aria-expanded={planOpen}
        aria-controls="atlas-plan-details"
        onClick={() => setPlanOpen((v) => !v)}
        className={`${ap.btnGhost} shrink-0 !min-h-[36px] !px-2.5 !text-[12px]`}
        data-testid="atlas-plan-toggle"
      >
        <span className="hidden sm:inline">{tp("planDetails")}</span>
        <span className="sm:hidden">{tp("planShort")}</span>
      </button>
    ) : null;
  // Masaüstü/tablet: başlat kartındaki küçük plan düğmesi (eski "Ayarları Gözden Geçir" kartının işlevi; eksik ayar uyarısı korunur).
  const planToggleDesk =
    chosen.length > 0 ? (
      <button
        type="button"
        aria-expanded={planOpen}
        aria-controls="atlas-plan-details"
        onClick={() => setPlanOpen((v) => !v)}
        className={`${ap.btnGhost} ${ap.btnSm} shrink-0 ${missingN > 0 ? "!border-amber-300 !text-amber-800" : ""} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f55c9]`}
        data-testid="atlas-plan-toggle"
        title={tp("planToggleTitle")}
      >
        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-xl:hidden">{tp("planDetails")}</span>
        <span className="xl:hidden">{tp("planShort")}</span>
        {missingN > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label={tp("missingAria", { n: missingN })} />}
      </button>
    ) : null;
  const runButton = (wide: boolean) => (
    <button
      type="button"
      disabled={runDisabled}
      onClick={onRun}
      className={wide ? `${ap.runBig} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f55c9]` : `${deskPrimary} min-h-[40px] max-w-[48%] shrink-0 rounded-xl px-3 py-2 text-left leading-tight md:max-w-none md:px-4`}
      data-testid="astro-run"
    >
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {runLabel}
    </button>
  );
  // inline: masaüstü/tablet şeridinde panel akış içinde, şeridin ALTINDA açılır (telefon alt konsolunda yukarı açılan katman).
  const planDetails = (inline: boolean) => (
    <>
    {planOpen && chosen.length > 0 && (
      <div
        id="atlas-plan-details"
        className={inline ? `${ap.planPanel} ${ap.planPanelInline}` : ap.planPanel}
        data-testid="atlas-plan-details"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={EYEBROW}>{tp("planCaps")}</p>
          <button type="button" onClick={() => setPlanOpen(false)} aria-label={tp("planClose")} className={`${ap.muted} rounded p-1 hover:bg-black/5`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {plan && (
            <span className={ap.text} data-testid="astro-plan">
              {tp("plan.base", { sel: plan.selectedCount, nw: plan.newRequestCount, cached: plan.cachedCount })}
              {plan.blockedCount > 0 && tp("plan.blocked", { n: plan.blockedCount })}
              {plan.dedupedCount > 0 && tp("plan.deduped", { n: plan.dedupedCount })}
              {plan.requiresConfirmation && tp("plan.confirm")}
            </span>
          )}
          <div className="flex min-w-0 flex-wrap gap-1.5" role="list" aria-label={tp("chosenAria")} data-testid="atlas-chosen">
            {chosen.map((id) => {
              const st = statusOf(id);
              const f = id === focus;
              return (
                <span key={id} role="listitem" className={`${f ? ap.chipGold : ap.chip} !gap-0 !p-0 text-xs`}>
                  <button type="button" onClick={() => focusOn(id)} className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5" title={`${techniqueLabel(id, tq)} — ${st.text}`} data-chip={id}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[st.kind]}`} />
                    <span className="max-w-[180px] truncate">{label(id)}</span>
                    <span className={`${ap.muted} text-[10.5px]`}>· {st.text}</span>
                  </button>
                  <button type="button" onClick={() => toggle(id, false)} aria-label={tp("removeChip", { label: label(id) })} className={`${ap.muted} mr-1 rounded-full p-1 hover:bg-black/5`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          {plan && plan.selections.length > 0 && (
            <ul className="flex flex-col gap-0.5" data-testid="astro-plan-lines">
              {plan.selections.map((s, i) => (
                <li key={`${s.technique}-${i}`} className={s.blocked ? ap.dangerInk : ap.text}>
                  {techniqueLabel(s.technique, tq)}
                  {s.options && describeOptions(s.technique, s.options, labelOf, tq) ? ` — ${describeOptions(s.technique, s.options, labelOf, tq)}` : ""}:{" "}
                  {s.blocked ? compactBlocked(s.blocked, s.info?.skippedSections)!.text : tp("plan.line", { u: s.unitCount, n: s.newRequests })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )}
    </>
  );
  const consoleBar = (
    // TELEFON: sabit alt konsol (başlat her an el altında). Masaüstü/tablet: aynı parçalar üst akış çubuğunda.
    <div ref={consoleRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(0.4rem,env(safe-area-inset-bottom))]" data-testid="atlas-console">
      <div className="mx-auto w-full max-w-[1600px] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:px-6 lg:px-8">
        <div className={`${ap.console} pointer-events-auto`} data-testid="astro-plan-box">
          <span className={ap.consoleGlow} aria-hidden="true" />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">{summaryLines}</div>
            {planToggle}
            {runButton(false)}
          </div>
          {planDetails(false)}
        </div>
      </div>
    </div>
  );

  /* ── Kimlik satırı (D4: ad + tek satır özet; ayrıntılar açılır) ── */
  // EN gün/ay/yıl "/" (Owner A13); TR GG.AA.YYYY aynen.
  const dsep = locale === "en" ? "/" : ".";
  const fmtDate = (iso: string) => `${iso.slice(8, 10)}${dsep}${iso.slice(5, 7)}${dsep}${iso.slice(0, 4)}`;
  const off = rev ? rev.utcOffsetSeconds : 0;
  const offTxt = formatUtcOffset(off);
  const accuracyWarn = rev && rev.timeKnown && rev.timeAccuracy && rev.timeAccuracy !== "exact_record" && rev.timeAccuracy !== "rectified" ? tp("accuracy", { v: rev.timeAccuracyLabel }) : null;
  // ΔT bilgi notu (24.10.2026): 1800 öncesi / 2100 sonrası doğum tarihi — raporun "Doğum verileri" notuyla aynı metin.
  const birthDeltaT = rev ? deltaTBirthNotes(rev.birthDate) : [];
  const detail = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className={`${ap.goldInk} text-[9.5px] font-semibold tracking-[0.16em]`}>{label}</dt>
      <dd className={`${ap.ink} truncate text-[13px] tabular-nums`}>{value}</dd>
    </div>
  );
  const ghostBtn = `${ap.btnGhost} shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6f55c9]`;

  // z-20: Danışan Seç açılır paneli alttaki cam yüzeylerin (ayrı katman bağlamı) üstünde kalır.
  // Öneri 3 (owner 2026-10-23) → 2026-10-30 Owner sadeleştirmesi: üst şeritte yalnız 1 Danışan Seç · 2 Analizi Başlat.
  // "Teknik Seç" / "Ayarları Gözden Geçir" kartları kaldırıldı; plan ayrıntıları başlat kartındaki küçük "Plan" düğmesinde.
  const stepState = {
    client: profile && rev ? "done" : "now",
    run: running ? "done" : !runDisabled ? "now" : "todo",
  } as const;
  const stepNum = (n: number, st: "done" | "now" | "todo" | "warn") => (
    <span className={`${ap.stepNum} ${st === "done" ? ap.stepNumDone : st === "now" ? ap.stepNumNow : st === "warn" ? ap.stepNumWarn : ""} !h-7 !w-7`} aria-hidden="true">
      {st === "done" ? <Check className="h-3.5 w-3.5" /> : n}
    </span>
  );
  const plate = (
    <header className={`${SURFACE} z-20 flex flex-col gap-2 px-2.5 py-2 sm:p-2.5`} data-testid="atlas-prep-plate">
      <ol className={ap.flow} aria-label={tp("stepsAria")} data-testid="atlas-steps">
        <li className={`${ap.flowStep} ${ap.flowStepClient} ${stepState.client === "now" ? ap.flowStepNow : ""}`} aria-current={stepState.client === "now" ? "step" : undefined} data-testid="atlas-client-identity">
          {stepNum(1, stepState.client)}
          <UserRound className={`${ap.flowIcon} ${ap.flowWideOnly}`} aria-hidden="true" />
          <span className={`${ap.flowLabel} ${ap.flowWideOnly}`}>{tp("selectClient")}</span>
          <span className="sr-only" data-testid="atlas-client-name">{profile ? profile.label : tp("noClient")}</span>
          <div className="min-w-0 flex-1">{picker}</div>
          <button
            type="button"
            onClick={onCreateClient}
            className={`${ap.btnGold} shrink-0 !min-h-[40px] !px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f55c9]`}
            data-testid="atlas-new-client"
            title={tp("newClient")}
            aria-label={tp("newClient")}
          >
            <Plus className="h-4 w-4" /> <span className={`whitespace-nowrap ${ap.newClientTxt}`}>{tp("newClient")}</span>
          </button>
        </li>
        <li className={`${ap.flowStep} ${ap.flowStepRun} ${ap.flowStepDesk}`} aria-current={stepState.run === "now" ? "step" : undefined} data-testid="atlas-run-step">
          {stepNum(2, stepState.run)}
          <span className="min-w-0 flex-1" aria-hidden="true" />
          {mode !== "narrow" && planToggleDesk}
          {mode !== "narrow" && <div className={ap.flowRunBtn}>{runButton(true)}</div>}
        </li>
      </ol>
      {profile || (mode !== "narrow" && chosen.length > 0) ? (
        <div className="flex min-w-0 flex-col gap-1.5 px-1 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {profile && (
              <p className={`${ap.text} truncate text-[12.5px]`}>
                <strong className={`${ap.ink} font-semibold`}>{profile.label}</strong>
                {rev ? (
                  <span className="tabular-nums" data-testid="atlas-birth-summary">
                    {" "}· {fmtDate(rev.birthDate)} · {rev.timeKnown ? rev.birthTime?.slice(0, 5) : tp("timeUnknownShort")} · {rev.locationLabel}
                  </span>
                ) : (
                  <span>{tp("loadingBirth")}</span>
                )}
              </p>
            )}
            {mode !== "narrow" && chosen.length > 0 && (
              <div className="flex min-w-0 flex-col gap-0.5" data-testid="astro-plan-box">
                {summaryLines}
              </div>
            )}
          </div>
          {profile && (
            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5">
              {rev && onEditBirth && (
                <button type="button" onClick={onEditBirth} className={`${ghostBtn} ${ap.btnSm}`} data-testid="atlas-edit-birth">
                  <Pencil className="h-3.5 w-3.5" /> {tp("editBirth")}
                </button>
              )}
              {rev && (
                <button type="button" onClick={() => setBirthDetailsOpen((v) => !v)} aria-expanded={birthDetailsOpen} aria-controls="atlas-birth-details" className={`${ghostBtn} ${ap.btnSm}`} data-testid="atlas-birth-details-toggle">
                  {tp("birthDetails")} <ChevronDown className={`h-3.5 w-3.5 transition ${birthDetailsOpen ? "rotate-180" : ""}`} />
                </button>
              )}
              {onDeleteProfile && (
                <button type="button" onClick={onDeleteProfile} className={`${ghostBtn} ${ap.btnSm} hover:!border-rose-300 hover:!text-rose-700`} data-testid="atlas-delete-profile" title={tp("deleteTitle")}>
                  <Trash2 className="h-3.5 w-3.5" /> {tp("deleteProfile")}
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}
      {mode !== "narrow" && planDetails(true)}
      {timeUnknown || accuracyWarn || rev?.staleTimezone || rev?.lmtNotice || birthDeltaT.length ? (
        <div className="flex min-w-0 flex-col gap-1.5 px-1">
          {(timeUnknown || accuracyWarn) && (
            <p className={ap.chipWarn} data-testid="atlas-birth-warning">
              <AlertTriangle className="h-3 w-3" />
              {timeUnknown ? tp("timeUnknownWarn") : accuracyWarn}
            </p>
          )}
          {rev?.staleTimezone && (
            <p className={ap.chipWarn} data-testid="atlas-stale-timezone">
              <AlertTriangle className="h-3 w-3" />
              {rev.staleTimezone.text}
            </p>
          )}
          {rev?.lmtNotice && (
            <p className={ap.chipWarn} data-testid="atlas-representative-lmt">
              <AlertTriangle className="h-3 w-3" />
              {rev.lmtNotice.text}
            </p>
          )}
          {birthDeltaT.map((n) => (
            <p key={n.code} className={ap.chip} data-testid="atlas-delta-t-birth">
              <Info className="h-3 w-3" />
              {n.text}
            </p>
          ))}
        </div>
      ) : null}
      {profile && rev && birthDetailsOpen && (
        <dl id="atlas-birth-details" className={`atlas-prep-in ${ap.inset} grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-6`} data-testid="atlas-birth-details">
          {detail(tp("d.birthDate"), fmtDate(rev.birthDate))}
          {detail(tp("d.time"), rev.timeKnown ? rev.birthTime?.slice(0, 5) : tp("d.unknown"))}
          {detail(tp("d.tz"), <span title={rev.timezone}>{`${rev.timezone} · ${offTxt}`}</span>)}
          {detail(tp("d.coord"), `${Math.abs(rev.latitude).toFixed(4)}° ${tm(`dir.${rev.latitude >= 0 ? "N" : "S"}`)} · ${Math.abs(rev.longitude).toFixed(4)}° ${tm(`dir.${rev.longitude >= 0 ? "E" : "W"}`)}`)}
          {detail(tp("d.accuracy"), rev.timeAccuracyLabel)}
          {detail(tp("d.client"), profile.clientName ?? tp("d.unlinked"))}
        </dl>
      )}
      {profile?.archivedAt && <p className={`${ap.warnInk} text-xs`}>{tp("archived")}</p>}
    </header>
  );

  const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString(lc, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const failPanel = runFailures && runFailures.items.length > 0 && (
    <div className={`${ap.noteDanger} px-4 py-3`} role="alert" data-testid="atlas-run-failures">
      <div className="flex items-start justify-between gap-3">
        <p className={`${ap.dangerInk} flex items-start gap-2 font-semibold`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {tp("fail.title")}
        </p>
        <button type="button" onClick={onDismissFailures} aria-label={tp("fail.close")} className={`${ap.muted} rounded p-1 hover:bg-black/5`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {runFailures.items.map((f, i) => (
          <li key={`${f.technique}-${i}`} className="rounded-lg bg-white/80 px-3 py-1.5" data-fail-technique={f.technique} data-fail-code={f.code}>
            <span className="font-semibold">{techniqueLabel(f.technique, tq)}:</span> <span className={ap.text}>{f.error}</span>
          </li>
        ))}
      </ul>
      <p className={`${ap.text} mt-2 text-[12px] leading-snug`} data-testid="atlas-run-failures-next">
        {runFailures.items.some((f) => f.code === "LOCAL_FIXTURE_MISSING")
          ? tp("fail.local")
          : ""}
        {runFailures.items.some((f) => f.code === "IN_PROGRESS")
          ? tp("fail.inProgress", { at: hhmmss(runFailures.at + Math.max(...runFailures.items.map((f) => f.retryAfterSec ?? 0)) * 1000) })
          : ""}
        {tp("fail.retry")}
      </p>
    </div>
  );

  const notices = (
    <>
      {failPanel}
      {runError && (
        <p className={`${ap.noteDanger} flex items-start gap-2`} role="alert" data-testid="astro-run-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {tp("runError", { e: runError })}
        </p>
      )}
      {running && (
        <p className={`${ap.noteInfo} flex items-center gap-2`} role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> {tp("runningNote")}
        </p>
      )}
    </>
  );

  const leftCol = (
    <div className={`${SURFACE} flex min-h-0 flex-col gap-3 p-3.5`}>
      <p className={`${EYEBROW} px-0.5`}>{tp("mapSystem")}</p>
      {dials}
      <div className="flex items-end justify-between gap-2 px-0.5 pt-1">
        <p className={`${ap.ink} ${ap.display} text-[1.15rem] leading-tight`}>{tp("techniques")}</p>
        <span className={`${ap.muted} text-[11.5px] tabular-nums`}>
          {tp("selectedCount", { n: counts[system], total: techBySystem[system].length })}
        </span>
      </div>
      {techSearch}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">{techniqueIndex(false)}</div>
    </div>
  );
  const settingsCol = <div className={`${SURFACE} min-h-0 overflow-y-auto p-5 [scrollbar-width:thin] xl:p-6`}>{settingsBody(false)}</div>;

  return (
    <section className={`${atlasDisplay.variable} ${atlasText.variable} relative flex min-w-0 flex-col gap-3 [font-family:var(--font-atlas-text)]`} aria-label={tp("prepAria")} data-testid="atlas-prep-center">
      <style>{CSS}</style>
      {plate}
      {notices}
      {mode === "wide" ? (
        <div
          ref={deskRef}
          style={{ ...(deskH ? { height: deskH } : {}), gridTemplateColumns: `clamp(${SPLIT_MIN}px, ${leftW}px, max(${SPLIT_MIN}px, calc(100% - ${SPLIT_RIGHT_MIN + SPLIT_HANDLE}px))) ${SPLIT_HANDLE}px minmax(0, 1fr)` }}
          className="grid min-h-0"
          data-testid="atlas-prep-grid"
        >
          {leftCol}
          <SplitHandle width={leftW} onWidth={setLeftW} containerRef={deskRef} />
          {settingsCol}
        </div>
      ) : mode === "mid" ? (
        <div ref={deskRef} style={deskH ? { height: deskH } : undefined} className="grid min-h-0 grid-cols-[minmax(290px,330px)_minmax(0,1fr)] gap-3" data-testid="atlas-prep-grid">
          {leftCol}
          {settingsCol}
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="atlas-prep-stack">
          <div className={`${SURFACE} p-3`}>{dials}</div>
          <div className={`${SURFACE} flex flex-col gap-2 p-1.5 sm:p-2`}>
            <div className="flex items-center justify-between gap-2 px-1">
              <p className={EYEBROW}>
                {tp("sysTechniques", { sys: sysShort.toLocaleUpperCase(lc), n: counts[system], total: techBySystem[system].length })}
              </p>
            </div>
            {techSearch}
            {techniqueIndex(true)}
          </div>
        </div>
      )}
      {/* telefon: sabit konsolun kapladığı yer kadar boşluk (içerik konsolun altında kalmaz) */}
      {mode === "narrow" && <div aria-hidden="true" style={{ height: consoleH }} />}
      {mode === "narrow" && consoleBar}
    </section>
  );
}
