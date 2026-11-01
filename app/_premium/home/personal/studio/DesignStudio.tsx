"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — Kişiselleştirme merkezi (tasarım stüdyosu).
 *
 * - Yalnız tasarım modunda (pw.editing) next/dynamic (ssr:false) ile yüklenir. Sayfa arkada `pw.working`'i canlı gösterir.
 * - Tasarım değişiklikleri pw.updateWorking ile TASLAĞA yazılır; "Taslağı kaydet" / "Uygula" sunucuya (P1) gider.
 * - Modüller / Favorilerim / Görünüm TERCİHTİR: pw.updatePrefs ile anında kaydedilir, taslaktan bağımsızdır.
 * - Görseller P2 güvenli yükleme ile gider; tasarıma YALNIZ sunucu varlık kimliği yazılır (dosya yolu / URL asla).
 * - Okunabilirlik kapısı: checkDesignContrast (sunucuyla aynı kural) sorun bildirirse "Uygula" kapalıdır.
 * - Demo (readOnly): tüm yazma denetimleri kapalı.
 * Görsel referans: C:/YasamSistemi-Gorsel-Tasarim/kisisel-calisma-alani-p0-son-kabul (editor.js, studio.css).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from "react";
import { useLocale } from "next-intl";
import {
  BookOpen, Check, ChevronDown, ChevronUp, Eye, EyeOff, History, ImageIcon, Images, Lock, Maximize2, Minimize2, Moon,
  Palette, Plus, RefreshCw, RotateCcw, Save, Star, Sun, SunMoon, Target, Trash2, TriangleAlert, Upload, Wand2, X,
} from "lucide-react";
import { deleteAsset, listAssets, preflightFile, uploadAsset, type AssetView } from "@/lib/workspace/client";
import {
  BG_THEMES, FAVORITES_MAX, LOGO_ZONES, READING_WIDTHS, TEXT_LINE_MAX_CHARS, TEXT_LINES_MAX, TEXT_ROLES, VIEW_MODES, WORKSPACE_CENTERS,
  type AssetKind,
} from "@/lib/workspace/catalog";
import type { BrandPalette, LogoPlacement, ReadingPrefs, TextLine, UiPrefs, WorkspaceDesign } from "@/lib/workspace/schema";
import { AA, AA_LARGE, checkDesignContrast, heroBackground, isLargeLine, resolvedLineColor, type ContrastIssue } from "@/lib/workspace/contrast";
import { contrast, ensureContrast, fixBrandContrast, grade, palettesFromPixels } from "@/lib/workspace/palette";
import { cropStyle, effectiveFocus, importantRing, nudgePoint, pointFromRect, setFocusPoint, targetPoint, type FocusTarget } from "@/lib/workspace/photoFocus";
import { DEVICE_SETTINGS, SHARED_SETTINGS, applyDesktopToMobile, deviceSettingsDiffer } from "@/lib/workspace/mobileAdapt";
import ReadabilityBadge from "../ReadabilityBadge";
import { defaultDesign, type PersonalWorkspace } from "../usePersonalWorkspace";
import type { ModuleLinkView } from "../moduleLinks";
import { studioDict, type StudioDict } from "./i18n";
import s from "./studio.module.css";

export type DesignStudioProps = {
  pw: PersonalWorkspace;
  modules: ModuleLinkView[];
  moduleLabel: (m: ModuleLinkView) => string;
  centerLabel: (centerKey: string) => string;
  onClose: () => void;
};

type Tab = "marka" | "logo" | "moduller" | "gorunum" | "kayit";
const TABS: { key: Tab; icon: ReactNode }[] = [
  { key: "marka", icon: <Palette size={17} aria-hidden /> },
  { key: "logo", icon: <ImageIcon size={17} aria-hidden /> },
  { key: "moduller", icon: <Star size={17} aria-hidden /> },
  { key: "gorunum", icon: <Moon size={17} aria-hidden /> },
  { key: "kayit", icon: <History size={17} aria-hidden /> },
];

type Confirm =
  | { kind: "exit" } | { kind: "discard" } | { kind: "reset" } | { kind: "resetAll" } | { kind: "mobileSync" }
  | { kind: "restore"; id: string } | { kind: "loadHistory"; id: string } | { kind: "deleteAsset"; id: string };

type Msg = { tone: "ok" | "warn" | "error"; text: string } | null;
type Layout = WorkspaceDesign["layout"];
type Zone = LogoPlacement["zone"];

/** Bölgeye ilk taşındığında kullanılan konum (prototip data.js ZONES.def). */
const ZONE_DEF: Record<Zone, { x: number; y: number; w: number }> = {
  hero: { x: 1, y: 0.5, w: 0.26 }, cerceve: { x: 1, y: 0, w: 0.4 }, toolbar: { x: 0, y: 0.5, w: 1 },
  sec: { x: 1, y: 0.5, w: 1 }, rightTop: { x: 0.5, y: 0.5, w: 0.72 }, footer: { x: 0.5, y: 0.5, w: 0.3 },
};
/** Şemadaki varsayılan yerleşimler (lib/workspace/schema.ts DEFAULT_DESKTOP / DEFAULT_MOBILE). */
const PLACE_DEFAULT: Record<"desktop" | "mobile", LogoPlacement> = {
  desktop: { zone: "hero", x: 1, y: 0.5, w: 0.26 },
  mobile: { zone: "toolbar", x: 0.5, y: 0.5, w: 1 },
};
const ROLE_SIZE: Record<TextLine["role"], number> = { label: 13, title: 46, subtitle: 24, body: 16, quote: 22 };
const SWATCHES = ["auto", "#17142b", "#7c3aed", "#a8761f", "#2f6b4f", "#b4235a", "#ffffff"] as const;
const DEFAULT_BRAND: BrandPalette = { accent: "#7c3aed", soft: "#f4effd", ink: "#17142b", accent2: "#c99a3a", name: "Özel" };
const THEME_SWATCH: Record<(typeof BG_THEMES)[number], string> = {
  manzara: "linear-gradient(135deg, #efe9e4 0%, #d9e2ea 55%, #c9d6c4 100%)",
  safak: "radial-gradient(circle at 25% 30%, #fbe7d8 0 30%, transparent 60%), linear-gradient(135deg, #f8e3d2, #f4d6c3)",
  lavanta: "radial-gradient(circle at 70% 30%, #efe7fb 0 30%, transparent 60%), linear-gradient(135deg, #ece3fa, #e2d6f5)",
  adacayi: "radial-gradient(circle at 30% 70%, #e9f2e3 0 30%, transparent 60%), linear-gradient(135deg, #e4efdc, #d8e7d0)",
  sampanya: "radial-gradient(circle at 70% 70%, #f6ead2 0 30%, transparent 60%), linear-gradient(135deg, #f1e2c4, #e9d3a8)",
  gece: "radial-gradient(circle at 70% 30%, #5a4d8a 0 25%, transparent 60%), linear-gradient(135deg, #2a2148, #392e5e)",
  murdum: "radial-gradient(circle at 30% 30%, #8d3d68 0 25%, transparent 60%), linear-gradient(135deg, #521f3b, #6a2a4d)",
  marka: "linear-gradient(135deg, var(--b-soft, #f4effd), var(--b-accent, #7c3aed))",
};

const GROUP_KEYS = ["layout", "logo", "text", "bg", "brand"] as const;
function changedGroups(a: WorkspaceDesign, b: WorkspaceDesign): (typeof GROUP_KEYS)[number][] {
  return GROUP_KEYS.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** Sunucunun reddettiği görünmez / kontrol karakterleri temizlenir (satır sonu korunur). */
function cleanText(v: string): string {
  return Array.from(v).filter((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 10) return true;
    return !(c < 32 || c === 127 || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069));
  }).join("").slice(0, TEXT_LINE_MAX_CHARS);
}

const newLineId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const pct = (v: number) => Math.round(v * 100);
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** blob: önizlemeler için düz <img> (next/image blob URL'yi optimize edemez). */
function Img(props: { src: string; alt: string; className?: string; style?: CSSProperties; onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void; draggable?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt} />;
}

// ── Küçük denetimler (modül düzeyi: render sırasında yeniden tanımlanmaz) ──

function Seg<V extends string | number>({ label, value, options, onPick, disabled, wide }: {
  label: string; value: V; options: readonly (readonly [V, string])[]; onPick: (v: V) => void; disabled: boolean; wide?: boolean;
}) {
  return (
    <div className={`${s.seg} ${wide ? s.segWide : ""}`} role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} className={v === value ? s.on : undefined} disabled={disabled} onClick={() => onPick(v)}>{l}</button>
      ))}
    </div>
  );
}

function Badge({ ratio, large, t }: { ratio: number; large: boolean; t: StudioDict }) {
  const need = large ? AA_LARGE : AA;
  const ok = ratio >= need;
  return (
    <span className={`${s.cBadge} ${ok ? s.ok : s.bad}`} title={t.badgeTitle(need)}>
      {ok ? <Check size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />} {ratio.toFixed(1)}:1 · {t.grade[grade(ratio)]}
    </span>
  );
}

function Range({ label, value, min, max, step, out, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number; out: string; onChange: (v: number) => void; disabled: boolean;
}) {
  return (
    <label className={s.mini}>
      <span>{label}</span>
      <output>{out}</output>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label} aria-valuetext={out}
        onChange={(e) => onChange(Number(e.currentTarget.value))} />
    </label>
  );
}

// ── Yükleme ─────────────────────────────────────────────────────────────────

type UpState = { phase: "idle" | "start" | "chunk" | "process" | "error" | "done"; pct: number; error: string | null; slow: boolean; file: File | null };
const UP_IDLE: UpState = { phase: "idle", pct: 0, error: null, slow: false, file: null };
const isActive = (u: UpState) => u.phase === "start" || u.phase === "chunk" || u.phase === "process";

function useUploader(kind: AssetKind, t: StudioDict, onDone: (a: AssetView) => void) {
  const [st, setSt] = useState<UpState>(UP_IDLE);
  const ac = useRef<AbortController | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);
  useEffect(() => () => {
    ac.current?.abort();
    if (slowTimer.current) clearTimeout(slowTimer.current);
  }, []);

  const start = useCallback(async (file: File) => {
    const pre = preflightFile(file, kind);
    if (!pre.ok) { setSt({ ...UP_IDLE, phase: "error", error: pre.message }); return; }
    ac.current?.abort();
    const c = new AbortController();
    ac.current = c;
    setSt({ phase: "start", pct: 0, error: null, slow: false, file });
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => setSt((u) => (isActive(u) ? { ...u, slow: true } : u)), 15000);
    try {
      const r = await uploadAsset(file, kind, (p) => setSt((u) => ({
        ...u, phase: p.phase, pct: p.phase === "chunk" ? Math.round((p.done / Math.max(1, p.total)) * 100) : p.phase === "process" ? 100 : 0,
      })), c.signal);
      if (r.kind === "ok") { setSt({ ...UP_IDLE, phase: "done" }); doneRef.current(r.value); }
      else setSt((u) => ({ ...u, phase: "error", slow: false, error: r.kind === "off" ? "İşlem tamamlanamadı. Lütfen yeniden deneyin." : r.error }));
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      setSt({ ...UP_IDLE, phase: "error", error: aborted ? t.canceled : "Görsel yüklenemedi. Yeniden deneyin.", file });
    } finally {
      if (slowTimer.current) { clearTimeout(slowTimer.current); slowTimer.current = null; }
      if (ac.current === c) ac.current = null;
    }
  }, [kind, t.canceled]);

  const cancel = useCallback(() => { ac.current?.abort(); }, []);
  const retry = useCallback(() => { if (st.file) void start(st.file); }, [st.file, start]);
  const clear = useCallback(() => setSt(UP_IDLE), []);
  return { st, start, cancel, retry, clear };
}

// ── Bileşen ─────────────────────────────────────────────────────────────────

export default function DesignStudio({ pw, modules, moduleLabel, centerLabel, onClose }: DesignStudioProps) {
  const locale = useLocale();
  const t = studioDict(locale);
  const [tab, setTab] = useState<Tab>("marka");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [logoView, setLogoView] = useState<"desktop" | "mobile">(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches ? "mobile" : "desktop");
  const [focusTargetSel, setFocusTarget] = useState<FocusTarget>("desktop");
  const [collapsed, setCollapsed] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [showIssues, setShowIssues] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const closedRef = useRef(false);
  const wasEditing = useRef(pw.editing);

  const fallback = useMemo(() => defaultDesign(), []);
  const w: WorkspaceDesign = pw.working ?? pw.design?.draft ?? pw.design?.applied ?? fallback;
  const ro = pw.readOnly || !pw.working;
  const busy = pw.busy;
  const lock = ro || !!busy;
  const prefsLock = pw.readOnly || !pw.prefsLoaded;

  const set = useCallback((fn: (d: WorkspaceDesign) => void) => { if (!ro) pw.updateWorking(fn); }, [ro, pw]);

  /**
   * Uygula. Masaüstünde (> 640 px) ve cihaza özel ayarlar (logo yerleşimi / fotoğraf odağı) mobilden farklıysa önce
   * "Bu tasarımı mobil görünümünüze de uygulamak ister misiniz?" sorulur (Owner kararı 2026-11-02).
   */
  const requestApply = useCallback(() => {
    const w = pw.working;
    if (w && typeof window !== "undefined" && window.innerWidth > 640 && deviceSettingsDiffer(w)) { setConfirm({ kind: "mobileSync" }); return; }
    void pw.apply();
  }, [pw]);

  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  // Uygula / geri dön / sıfırla / vazgeç başarıyla bitince hook tasarım modunu kapatır → panel kapanır.
  useEffect(() => {
    if (wasEditing.current && !pw.editing) closeOnce();
    wasEditing.current = pw.editing;
  }, [pw.editing, closeOnce]);

  // Kaydedilmemiş değişiklikle sayfadan ayrılma uyarısı (tarayıcının standart onayı).
  useEffect(() => {
    if (!pw.dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pw.dirty]);

  // İlk odak panele; kapanınca önceki öğeye döner.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => { if (prev && document.contains(prev)) prev.focus(); };
  }, []);

  /** Sunucudaki kayıtlı taslağı SİLMEDEN tasarım modundan çıkış (kaydedilmemiş değişiklik onayı requestClose'ta). */
  const leave = useCallback(() => {
    pw.closeEdit();
    closeOnce();
  }, [pw, closeOnce]);

  const requestClose = useCallback(() => {
    if (confirm) return;
    if (pw.dirty && !pw.readOnly) setConfirm({ kind: "exit" });
    else void leave();
  }, [confirm, pw.dirty, pw.readOnly, leave]);

  const onRootKey = (e: KeyboardEvent<HTMLElement>) => {
    if (confirm) return;
    if (e.key === "Escape") { e.preventDefault(); requestClose(); return; }
    trapTab(e, rootRef.current);
  };

  // ── Okunabilirlik kapısı ──
  const issues: ContrastIssue[] = useMemo(() => {
    const local = checkDesignContrast(w);
    const server = Array.isArray(pw.notice?.issues) ? (pw.notice?.issues as ContrastIssue[]).filter((i) => i && typeof i.area === "string") : [];
    const seen = new Set(local.map((i) => i.path));
    return [...local, ...server.filter((i) => !seen.has(i.path))];
  }, [w, pw.notice]);

  const applied = pw.design?.applied ?? null;
  const changes = useMemo(() => changedGroups(w, applied ?? fallback), [w, applied, fallback]);
  const groupText = (ks: readonly string[]) => ks.map((k) => t.groups[k] ?? k).join(", ");
  const canSave = !lock && pw.dirty;
  const canApply = !lock && issues.length === 0 && (pw.dirty || changes.length > 0);
  const applyReason = ro ? t.readOnly : issues.length ? t.gateBad(issues.length) : !(pw.dirty || changes.length > 0) ? t.nothingToApply : "";

  // ── Yüklemeler ──
  const [assets, setAssets] = useState<{ status: "idle" | "loading" | "ok" | "error"; items: AssetView[]; error?: string }>({ status: "idle", items: [] });
  const [assetsOpen, setAssetsOpen] = useState(false);
  const addAsset = useCallback((a: AssetView) => setAssets((x) => (x.status === "ok" ? { ...x, items: [a, ...x.items.filter((i) => i.id !== a.id)] } : x)), []);
  const logoUp = useUploader("logo", t, (a: AssetView) => {
    pw.updateWorking((d) => { d.logo.assetId = a.id; d.logo.visible = true; });
    addAsset(a);
    setMsg({ tone: "ok", text: t.uploadOk });
  });
  const photoUp = useUploader("photo", t, (a: AssetView) => {
    pw.updateWorking((d) => { d.bg.photoAssetId = a.id; d.bg.mode = "photo"; });
    addAsset(a);
    setMsg({ tone: "ok", text: t.uploadOk });
  });

  const loadAssets = useCallback(async () => {
    setAssets((x) => ({ ...x, status: "loading" }));
    const r = await listAssets();
    if (r.kind === "ok") setAssets({ status: "ok", items: r.value });
    else setAssets({ status: "error", items: [], error: r.kind === "error" ? r.error : "İşlem tamamlanamadı. Lütfen yeniden deneyin." });
  }, []);
  const toggleAssets = () => {
    const open = !assetsOpen;
    setAssetsOpen(open);
    if (open && assets.status !== "ok" && assets.status !== "loading") void loadAssets();
  };
  const removeAsset = async (id: string) => {
    if (w.logo.assetId === id || w.bg.photoAssetId === id) { setMsg({ tone: "warn", text: t.inUseLocal }); return; }
    const r = await deleteAsset(id);
    if (r.kind === "ok") { setAssets((x) => ({ ...x, items: x.items.filter((i) => i.id !== id) })); setMsg({ tone: "ok", text: t.deleted }); return; }
    if (r.kind === "error" && r.where?.length) { setMsg({ tone: "warn", text: t.inUse(r.where.join(", ")) }); return; }
    setMsg({ tone: "error", text: r.kind === "off" ? "İşlem tamamlanamadı." : r.error });
  };

  // ── Logodan palet (yerel canvas örneklemesi) ──
  const logoSrc = w.logo.assetId ? pw.assetSrc(w.logo.assetId, "mobile") : null;
  const [palState, setPalState] = useState<{ src: string; pals: BrandPalette[] | null } | null>(null);
  useEffect(() => {
    if (!logoSrc) return;
    let alive = true;
    const im = new Image();
    im.onload = () => {
      if (!alive) return;
      try {
        const N = 180;
        const sc = Math.min(1, N / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(im.naturalWidth * sc));
        cv.height = Math.max(1, Math.round(im.naturalHeight * sc));
        const cx = cv.getContext("2d", { willReadFrequently: true });
        if (!cx) throw new Error("canvas");
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        setPalState({ src: logoSrc, pals: palettesFromPixels(cx.getImageData(0, 0, cv.width, cv.height)) });
      } catch {
        setPalState({ src: logoSrc, pals: null });
      }
    };
    im.onerror = () => { if (alive) setPalState({ src: logoSrc, pals: null }); };
    im.src = logoSrc;
    return () => { alive = false; };
  }, [logoSrc]);
  const pal = palState && palState.src === logoSrc ? palState : null;

  // ── Fotoğraf boyutu (odak kutusu oranı) ──
  const photoSrc = w.bg.photoAssetId ? pw.assetSrc(w.bg.photoAssetId, "mobile") : null;
  const [photoDims, setPhotoDims] = useState<{ src: string; w: number; h: number } | null>(null);
  const dims = photoDims && photoDims.src === photoSrc ? photoDims : null;
  const focusTarget: FocusTarget = focusTargetSel === "mobile" && !w.bg.separateMobile ? "desktop" : focusTargetSel;
  const dragging = useRef(false);

  // ── Tercihler (anında kaydedilir; aynı anda tek istek → sürüm çakışması olmaz) ──
  const [prefSaving, setPrefSaving] = useState(false);
  const prefSavingRef = useRef(false);
  const savePrefs = useCallback(async (fn: (p: UiPrefs) => UiPrefs) => {
    if (prefsLock || prefSavingRef.current) return false;
    prefSavingRef.current = true;
    setPrefSaving(true);
    try { return await pw.updatePrefs(fn); }
    finally { prefSavingRef.current = false; setPrefSaving(false); }
  }, [prefsLock, pw]);

  const savePrefsRef = useRef(savePrefs);
  useEffect(() => { savePrefsRef.current = savePrefs; }, [savePrefs]);

  const [readingLocal, setReadingLocal] = useState<ReadingPrefs | null>(null);
  const readingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readingSeq = useRef(0);
  const readingPending = useRef<(() => void) | null>(null);
  const reading = readingLocal ?? pw.prefs.reading;
  const changeReading = (patch: Partial<ReadingPrefs>) => {
    if (prefsLock) return;
    const next = { ...reading, ...patch };
    const seq = ++readingSeq.current;
    setReadingLocal(next);
    if (readingTimer.current) clearTimeout(readingTimer.current);
    const commit = () => {
      if (prefSavingRef.current) { readingTimer.current = setTimeout(commit, 300); return; }
      readingTimer.current = null;
      readingPending.current = null;
      void savePrefsRef.current((p) => ({ ...p, reading: next })).then(() => { if (readingSeq.current === seq) setReadingLocal(null); });
    };
    readingPending.current = commit;
    readingTimer.current = setTimeout(commit, 450);
  };
  useEffect(() => () => {
    if (readingTimer.current) clearTimeout(readingTimer.current);
    readingPending.current?.();
  }, []);

  const hidden = useMemo(() => new Set(pw.prefs.hiddenModules), [pw.prefs.hiddenModules]);
  const favs = pw.prefs.favorites;
  const modByKey = useMemo(() => new Map(modules.map((m) => [m.key, m])), [modules]);
  const isModHidden = (m: ModuleLinkView) => hidden.has(`module:${m.key}`) || hidden.has(`center:${m.centerKey}`);
  const toggleHidden = (key: string) => void savePrefs((p) => ({ ...p, hiddenModules: p.hiddenModules.includes(key) ? p.hiddenModules.filter((k) => k !== key) : [...p.hiddenModules, key] }));
  const toggleFav = (m: ModuleLinkView) => {
    const k = `module:${m.key}`;
    if (favs.includes(k)) { void savePrefs((p) => ({ ...p, favorites: p.favorites.filter((x) => x !== k) })); return; }
    if (!m.accessible) { setMsg({ tone: "warn", text: t.favLocked }); return; }
    if (favs.length >= FAVORITES_MAX) { setMsg({ tone: "warn", text: t.favFull(FAVORITES_MAX) }); return; }
    void savePrefs((p) => ({ ...p, favorites: p.favorites.includes(k) ? p.favorites : [...p.favorites, k].slice(0, FAVORITES_MAX) }));
  };
  const removeFav = (k: string) => void savePrefs((p) => ({ ...p, favorites: p.favorites.filter((x) => x !== k) }));
  const moveFav = (i: number, dir: -1 | 1) => void savePrefs((p) => {
    const f = [...p.favorites];
    const j = i + dir;
    if (j < 0 || j >= f.length) return p;
    [f[i], f[j]] = [f[j], f[i]];
    return { ...p, favorites: f };
  });

  // ── Ortak küçük parçalar ──
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale?.startsWith("en") ? "en-GB" : "tr-TR", { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d); };
  const palName = (n: string) => t.palNames[n] ?? n;

  function dropzone(kind: AssetKind, up: ReturnType<typeof useUploader>, hasImage: boolean) {
    const label = kind === "logo" ? (hasImage ? t.replaceLogo : t.chooseLogo) : hasImage ? t.replacePhoto : t.choosePhoto;
    const active = isActive(up.st);
    const onDrop = (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f && !lock && !active) void up.start(f);
    };
    return (
      <>
        <label className={`${s.drop} ${lock || active ? s.dropOff : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {/* capture özniteliği YOK: Android WebView'de galeri seçimi açılır. */}
          <input className={s.srOnly} type="file" accept="image/png,image/jpeg,image/webp" disabled={lock || active}
            onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void up.start(f); }} />
          <Upload size={22} aria-hidden />
          <span><strong>{label}</strong><small>{kind === "logo" ? t.logoLimits : t.photoLimits}</small></span>
        </label>
        {active && (
          <div className={s.progress} role="status" aria-live="polite">
            <div className={s.bar}><span style={{ width: `${up.st.phase === "process" ? 100 : Math.max(4, up.st.pct)}%` }} /></div>
            <span>{up.st.phase === "process" ? t.processing : t.uploading(up.st.pct)}</span>
            {up.st.slow && <span className={s.warnTxt}>{t.slow}</span>}
            <button type="button" className={s.linkBtn} onClick={up.cancel}>{t.cancel}</button>
          </div>
        )}
        {up.st.phase === "error" && up.st.error && (
          <div className={`${s.msg} ${s.err}`} role="alert">
            <span>{up.st.error}</span>
            {up.st.file && <button type="button" className={s.linkBtn} onClick={up.retry} disabled={lock}><RefreshCw size={13} aria-hidden /> {t.retry}</button>}
          </div>
        )}
      </>
    );
  }

  function assetsBlock(kind: AssetKind) {
    const items = assets.items.filter((a) => a.kind === kind);
    return (
      <div className={s.assetsBox}>
        <div className={s.rowBtns}>
          <button type="button" className={`${s.ghost} ${s.grow}`} onClick={toggleAssets} aria-expanded={assetsOpen}>
            <Images size={16} aria-hidden />{assetsOpen ? t.assetsHide : t.assetsShow}
          </button>
          {assetsOpen && <button type="button" className={s.iconBtn} onClick={() => void loadAssets()} aria-label={t.assetsRefresh} title={t.assetsRefresh}><RefreshCw size={15} aria-hidden /></button>}
        </div>
        {assetsOpen && (
          <>
            <p className={s.hint}>{t.assetsHint}</p>
            {assets.status === "loading" && <p className={s.hint} role="status">{t.assetsLoading}</p>}
            {assets.status === "error" && <p className={`${s.msg} ${s.err}`} role="alert">{assets.error}</p>}
            {assets.status === "ok" && !items.length && <p className={s.hint}>{t.assetsEmpty}</p>}
            {assets.status === "ok" && items.length > 0 && (
              <ul className={s.assetList}>
                {items.map((a) => {
                  const src = pw.assetSrc(a.id, "mobile");
                  const inWorking = w.logo.assetId === a.id || w.bg.photoAssetId === a.id;
                  return (
                    <li key={a.id}>
                      <span className={`${s.thumb} ${kind === "logo" ? s.checker : ""}`}>{src ? <Img src={src} alt="" /> : null}</span>
                      <span className={s.assetMeta}>
                        <strong>{t.kind[a.kind]} · {a.original.width}×{a.original.height}</strong>
                        <small>{fmtDate(a.createdAt)}{inWorking ? ` · ${t.inUseWorking}` : ""}</small>
                      </span>
                      <span className={s.assetBtns}>
                        <button type="button" className={s.ghost} disabled={lock || inWorking}
                          onClick={() => set((d) => { if (kind === "logo") { d.logo.assetId = a.id; d.logo.visible = true; } else { d.bg.photoAssetId = a.id; d.bg.mode = "photo"; } })}>
                          {kind === "logo" ? t.useAsLogo : t.useAsPhoto}
                        </button>
                        <button type="button" className={`${s.iconBtn} ${s.danger}`} disabled={lock} aria-label={`${t.deleteAsset}: ${t.kind[a.kind]} ${fmtDate(a.createdAt)}`}
                          onClick={() => setConfirm({ kind: "deleteAsset", id: a.id })}><Trash2 size={15} aria-hidden /></button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Bölüm: Tasarım ve Marka ──
  function renderLayout() {
    return (
      <section className={s.edSec}>
        <h3>{t.layoutTitle}</h3>
        <div className={s.layoutCards} role="radiogroup" aria-label={t.layoutTitle}>
          {(["A", "B", "C"] as Layout[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={w.layout === k} className={`${s.layoutCard} ${w.layout === k ? s.on : ""}`} disabled={lock}
              onClick={() => set((d) => { d.layout = k; })}>
              <span className={`${s.layoutMini} ${s[`mini${k}`]}`} aria-hidden><i /><i /><i /></span>
              <span><b>{k} · {t.layouts[k][0]}</b><small>{t.layouts[k][1]}</small></span>
            </button>
          ))}
        </div>
        <p className={s.hint}>{t.layoutHint}</p>
      </section>
    );
  }

  function applyPalette(p: BrandPalette | null) {
    set((d) => {
      d.brand = p ? { ...p } : null;
      if (!p) {
        d.text.lines.forEach((l) => { if (l.color === "brand") l.color = "auto"; });
        if (d.bg.theme === "marka") d.bg.theme = "manzara";
      }
    });
  }

  function renderBrand() {
    const br = w.brand;
    const cur = br ?? DEFAULT_BRAND;
    const rA = contrast(cur.accent, cur.soft);
    const rI = contrast(cur.ink, cur.soft);
    const brandThemeOn = w.bg.mode === "theme" && w.bg.theme === "marka";
    return (
      <>
        <section className={s.edSec}>
          <h3><Palette size={16} aria-hidden />{t.brandTitle}</h3>
          <p className={s.hint}>{t.brandHint}</p>
          {!w.logo.assetId ? <p className={s.hint}>{t.brandNoLogo}</p>
            : !pal ? <p className={s.hint} role="status">{t.brandAnalyzing}</p>
              : !pal.pals ? <p className={`${s.hint} ${s.warnTxt}`}>{t.brandAnalyzeFail}</p>
                : (
                  <div className={s.pals}>
                    {pal.pals.map((p, i) => {
                      const on = !!br && br.accent === p.accent && br.soft === p.soft && br.ink === p.ink;
                      return (
                        <div key={i} className={`${s.palCard} ${on ? s.on : ""}`}>
                          <div className={s.palTop}>
                            <strong>{palName(p.name)}</strong>
                            <span className={s.palSw}>{[p.accent, p.accent2, p.soft, p.ink].map((c, k) => <i key={k} style={{ background: c }} title={c} />)}</span>
                          </div>
                          <div className={s.palPrev} style={{ background: p.soft, color: p.ink }}><b style={{ color: p.accent }}>{t.palPreviewTitle}</b> · {t.palPreviewText}</div>
                          <div className={s.cRow}><Badge ratio={contrast(p.accent, p.soft)} large={false} t={t} /><Badge ratio={contrast(p.ink, p.soft)} large={false} t={t} /></div>
                          <button type="button" className={`${on ? s.primary : s.ghost} ${s.wide}`} disabled={lock} aria-pressed={on} onClick={() => applyPalette(p)}>
                            {on ? t.palInUse : t.palApply}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
          <div className={s.rowBtns}>
            <button type="button" className={`${br ? s.ghost : s.primary} ${s.grow}`} disabled={lock || !br} onClick={() => applyPalette(null)}>
              {br ? t.palNone : t.palNoneCurrent}
            </button>
          </div>
        </section>
        <section className={s.edSec}>
          <h3>{t.customTitle}</h3>
          <div className={s.brandPick}>
            {(["accent", "soft", "ink"] as const).map((k) => (
              <label key={k}>{t[k]}
                <input type="color" value={cur[k]} disabled={lock}
                  onChange={(e) => { const v = e.currentTarget.value.toLowerCase(); set((d) => { d.brand = { ...(d.brand ?? DEFAULT_BRAND), [k]: v, name: d.brand?.name ?? DEFAULT_BRAND.name }; }); }} />
              </label>
            ))}
          </div>
          <div className={s.cRow}><span className={s.cLbl}>{t.accentOnSoft}</span><Badge ratio={rA} large={false} t={t} /></div>
          <div className={s.cRow}><span className={s.cLbl}>{t.inkOnSoft}</span><Badge ratio={rI} large={false} t={t} /></div>
          {br && (rA < AA || rI < AA) && (
            <button type="button" className={`${s.ghost} ${s.wide} ${s.mt8}`} disabled={lock} onClick={() => set((d) => { if (d.brand) d.brand = fixBrandContrast(d.brand); })}>
              <Wand2 size={15} aria-hidden />{t.brandFix}
            </button>
          )}
          <label className={`${s.check} ${s.mt8}`}>
            <input type="checkbox" checked={brandThemeOn} disabled={lock || !br}
              onChange={(e) => { const on = e.currentTarget.checked; set((d) => { if (on) { d.bg.mode = "theme"; d.bg.theme = "marka"; } else if (d.bg.mode === "theme" && d.bg.theme === "marka") { d.bg.mode = "default"; } }); }} />
            {t.brandTheme}
          </label>
          <p className={s.hint}>{br ? t.brandThemeHint : t.themeNeedsBrand}</p>
        </section>
      </>
    );
  }

  function renderLine(l: TextLine, i: number, n: number) {
    const bg = heroBackground(w);
    const fg = bg ? resolvedLineColor(w, l, bg) : null;
    const ratio = bg && fg ? contrast(fg, bg) : null;
    const need = isLargeLine(l) ? AA_LARGE : AA;
    const isCustom = l.color !== "auto" && l.color !== "brand" && !(SWATCHES as readonly string[]).includes(l.color);
    const upd = (fn: (x: TextLine) => void) => set((d) => { const x = d.text.lines.find((y) => y.id === l.id); if (x) fn(x); });
    const move = (dir: -1 | 1) => set((d) => { const a = d.text.lines; const j = i + dir; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; });
    const taId = `ln-${l.id}`;
    return (
      <li key={l.id} className={s.lineEd}>
        <div className={s.lineTop}>
          <select aria-label={t.lineRole} value={l.role} disabled={lock}
            onChange={(e) => { const r = e.currentTarget.value as TextLine["role"]; upd((x) => { x.role = r; x.size = ROLE_SIZE[r]; }); }}>
            {TEXT_ROLES.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
          </select>
          <span className={s.lineBtns}>
            <button type="button" className={s.iconBtn} disabled={lock || i === 0} aria-label={t.lineUp} onClick={() => move(-1)}><ChevronUp size={16} aria-hidden /></button>
            <button type="button" className={s.iconBtn} disabled={lock || i === n - 1} aria-label={t.lineDown} onClick={() => move(1)}><ChevronDown size={16} aria-hidden /></button>
            <button type="button" className={`${s.iconBtn} ${s.danger}`} disabled={lock} aria-label={t.lineDel} onClick={() => set((d) => { d.text.lines = d.text.lines.filter((y) => y.id !== l.id); })}><Trash2 size={16} aria-hidden /></button>
          </span>
        </div>
        <label className={s.srOnly} htmlFor={taId}>{t.lineText(i + 1)}</label>
        <textarea id={taId} rows={Math.min(4, Math.max(1, l.text.split("\n").length))} maxLength={TEXT_LINE_MAX_CHARS} placeholder={t.linePlaceholder} value={l.text} disabled={lock}
          onChange={(e) => { const v = cleanText(e.currentTarget.value); upd((x) => { x.text = v; }); }} />
        <div className={s.lineMeta}><span>{l.text.length}/{TEXT_LINE_MAX_CHARS}</span></div>
        <Range label={t.lineSize} value={l.size} min={11} max={72} step={1} out={String(l.size)} onChange={(v) => upd((x) => { x.size = v; })} disabled={lock} />
        {ratio === null || !fg || !bg ? <p className={`${s.hint} ${s.mini2}`}>{t.linePhotoHint}</p> : (
          <div className={s.cRow}>
            <Badge ratio={ratio} large={isLargeLine(l)} t={t} />
            {ratio < need && <button type="button" className={s.linkBtn} disabled={lock} onClick={() => { const c = ensureContrast(fg, bg, need + 0.2); upd((x) => { x.color = c; }); }}>{t.lineFix}</button>}
          </div>
        )}
        <div className={s.swatches} role="radiogroup" aria-label={t.lineColor}>
          {w.brand && (
            <button type="button" role="radio" aria-checked={l.color === "brand"} className={`${s.sw} ${s.swBrand} ${l.color === "brand" ? s.on : ""}`}
              style={{ "--c": w.brand.accent } as CSSProperties} disabled={lock} title={t.colorBrand} aria-label={t.colorBrand} onClick={() => upd((x) => { x.color = "brand"; })} />
          )}
          {SWATCHES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={l.color === c} className={`${s.sw} ${c === "auto" ? s.swAuto : ""} ${l.color === c ? s.on : ""}`}
              style={c === "auto" ? undefined : ({ "--c": c } as CSSProperties)} disabled={lock} title={t.colors[c]} aria-label={t.colors[c]} onClick={() => upd((x) => { x.color = c; })} />
          ))}
          <label className={`${s.sw} ${s.swPick} ${isCustom ? s.on : ""}`} title={t.colorCustom} style={isCustom ? ({ "--c": l.color } as CSSProperties) : undefined}>
            <input type="color" value={isCustom ? l.color : "#5b3fa0"} disabled={lock} aria-label={t.colorCustom}
              onChange={(e) => { const v = e.currentTarget.value.toLowerCase(); upd((x) => { x.color = v; }); }} />
          </label>
        </div>
      </li>
    );
  }

  function renderText() {
    const tx = w.text;
    return (
      <>
        <section className={s.edSec}>
          <h3>{t.greetTitle}</h3>
          {<Seg label={t.greetTitle} value={tx.useGreeting ? "ready" : "own"} options={[["ready", t.greetReady], ["own", t.greetOwn]] as const} onPick={(v) => set((d) => {
            d.text.useGreeting = v === "ready";
            if (v === "own" && d.text.lines.length === 0) d.text.lines.push({ id: newLineId(), role: "title", text: "", size: ROLE_SIZE.title, color: "auto" });
          })} disabled={lock} />}
          <p className={s.hint}>{tx.useGreeting ? t.greetReadyHint : t.greetOwnHint}</p>
        </section>
        {!tx.useGreeting && (
          <section className={s.edSec}>
            <h3>{t.linesTitle} <output>{tx.lines.length}/{TEXT_LINES_MAX}</output></h3>
            <ol className={s.lines}>{tx.lines.map((l, i) => renderLine(l, i, tx.lines.length))}</ol>
            <button type="button" className={`${s.ghost} ${s.wide}`} disabled={lock || tx.lines.length >= TEXT_LINES_MAX}
              onClick={() => set((d) => { if (d.text.lines.length < TEXT_LINES_MAX) d.text.lines.push({ id: newLineId(), role: "body", text: "", size: ROLE_SIZE.body, color: "auto" }); })}>
              <Plus size={16} aria-hidden />{t.lineAdd}
            </button>
          </section>
        )}
        <section className={s.edSec}>
          <h3>{t.alignTitle}</h3>
          <Seg label={t.alignH} value={tx.align} options={(["left", "center", "right"] as const).map((v) => [v, t.aligns[v]] as const)} onPick={(v) => set((d) => { d.text.align = v; })} disabled={lock} />
          <div className={s.gap8} />
          <Seg label={t.alignV} value={tx.valign} options={(["top", "center", "bottom"] as const).map((v) => [v, t.valigns[v]] as const)} onPick={(v) => set((d) => { d.text.valign = v; })} disabled={lock} />
        </section>
        <section className={s.edSec}>
          <label className={s.check}>
            <input type="checkbox" checked={tx.showDate} disabled={lock} onChange={(e) => { const v = e.currentTarget.checked; set((d) => { d.text.showDate = v; }); }} />
            {t.showDate}
          </label>
        </section>
      </>
    );
  }

  // ── Bölüm: Logo ve Fotoğraf ──
  function renderLogo() {
    const lg = w.logo;
    const L = lg.layout[logoView];
    const zones = LOGO_ZONES.filter((z) => z !== "cerceve" || w.layout === "C" || L.zone === "cerceve");
    const setPlace = (patch: Partial<LogoPlacement>) => set((d) => { d.logo.layout[logoView] = { ...d.logo.layout[logoView], ...patch }; });
    return (
      <>
        <section className={`${s.edSec} ${s.lockSec}`}>
          <h3><Lock size={16} aria-hidden />{t.sysLogoTitle} <span className={`${s.tag} ${s.tagLock}`}>{t.tagFixed}</span></h3>
          <p className={s.hint}>{t.sysLogoHint}</p>
        </section>
        <section className={s.edSec}>
          <h3>{t.logoTitle} <span className={`${s.tag} ${s.tagOpt}`}>{t.tagOptional}</span></h3>
          {dropzone("logo", logoUp, !!lg.assetId)}
          {lg.assetId && (
            <div className={s.fileInfo}>
              <span className={`${s.thumb} ${s.checker}`}>{logoSrc ? <Img src={logoSrc} alt="" /> : null}</span>
              <span className={s.grow}><strong>{t.logoTitle}</strong><small>{lg.visible ? t.logoVisibleHint : t.logoHiddenHint}</small></span>
            </div>
          )}
          {lg.assetId && (
            <div className={s.rowBtns}>
              <button type="button" className={`${s.ghost} ${s.grow}`} disabled={lock} aria-pressed={!lg.visible} onClick={() => set((d) => { d.logo.visible = !d.logo.visible; })}>
                {lg.visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}{lg.visible ? t.hide : t.show}
              </button>
              <button type="button" className={`${s.ghost} ${s.danger}`} disabled={lock} onClick={() => set((d) => { d.logo.assetId = null; })}>
                <Trash2 size={16} aria-hidden />{t.removeLogo}
              </button>
            </div>
          )}
          {assetsBlock("logo")}
        </section>
        {lg.assetId && (
          <>
            <section className={s.edSec}>
              <h3>{t.placeTitle}</h3>
              <Seg label={t.placeTitle} value={logoView} options={[["desktop", t.placeDesktop], ["mobile", t.placeMobile]] as const} onPick={(v) => setLogoView(v)} disabled={false} wide={true} />
              <p className={s.hint}>{t.placeHint}</p>
              <dl className={s.layoutSum}>
                <div><dt>{t.sumDesktop}</dt><dd>{t.zones[lg.layout.desktop.zone]} · %{pct(lg.layout.desktop.w)}</dd></div>
                <div><dt>{t.sumMobile}</dt><dd>{t.zones[lg.layout.mobile.zone]} · %{pct(lg.layout.mobile.w)}</dd></div>
              </dl>
            </section>
            <section className={s.edSec}>
              <h3>{t.zoneTitle} <output>{t.zones[L.zone]}</output></h3>
              <div className={s.zoneBtns} role="radiogroup" aria-label={t.zoneTitle}>
                {zones.map((z) => (
                  <button key={z} type="button" role="radio" aria-checked={z === L.zone} className={`${s.chip} ${z === L.zone ? s.on : ""}`} disabled={lock}
                    onClick={() => setPlace({ zone: z, ...ZONE_DEF[z] })}>{t.zones[z]}</button>
                ))}
              </div>
              <div className={s.gap8} />
              <Range label={t.sizeTitle} value={L.w} min={0.04} max={1} step={0.01} out={t.sizeOut(pct(L.w))} onChange={(v) => setPlace({ w: v })} disabled={lock} />
              <Range label={t.posX} value={L.x} min={0} max={1} step={0.01} out={`%${pct(L.x)}`} onChange={(v) => setPlace({ x: v })} disabled={lock} />
              <Range label={t.posY} value={L.y} min={0} max={1} step={0.01} out={`%${pct(L.y)}`} onChange={(v) => setPlace({ y: v })} disabled={lock} />
              <p className={s.hint}>{t.sliderHint}</p>
              <div className={s.rowBtns}>
                <button type="button" className={`${s.ghost} ${s.grow}`} disabled={lock}
                  onClick={() => set((d) => { if (logoView === "desktop") d.logo.layout.mobile = { ...d.logo.layout.desktop }; else d.logo.layout.desktop = { ...d.logo.layout.mobile }; })}>
                  {logoView === "desktop" ? t.copyToMobile : t.copyToDesktop}
                </button>
                <button type="button" className={`${s.ghost} ${s.grow}`} disabled={lock} onClick={() => set((d) => { d.logo.layout[logoView] = { ...PLACE_DEFAULT[logoView] }; })}>
                  <RotateCcw size={15} aria-hidden />{t.resetPos}
                </button>
              </div>
            </section>
            <section className={s.edSec}>
              <h3>{t.plateTitle}</h3>
              <Seg label={t.plateTitle} value={lg.plate} options={(["yok", "cam", "beyaz"] as const).map((v) => [v, t.plates[v]] as const)} onPick={(v) => set((d) => { d.logo.plate = v; })} disabled={lock} />
              <p className={s.hint}>{t.plateHint}</p>
            </section>
          </>
        )}
      </>
    );
  }

  function renderBackground() {
    const b = w.bg;
    return (
      <>
        <section className={s.edSec}>
          <h3>{t.bgTitle}</h3>
          <div className={s.seg} role="radiogroup" aria-label={t.bgTitle}>
            {(["default", "theme", "photo"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={b.mode === m} className={b.mode === m ? s.on : undefined}
                disabled={lock || (m === "photo" && !b.photoAssetId)}
                onClick={() => set((d) => { d.bg.mode = m; if (m === "theme" && d.bg.theme === "marka" && !d.brand) d.bg.theme = "manzara"; })}>{t.bgModes[m]}</button>
            ))}
          </div>
          <p className={s.hint}>{t.bgHint[w.layout]}{!b.photoAssetId ? ` ${t.photoNeedsUpload}` : ""}</p>
        </section>
        {b.mode === "theme" && (
          <section className={s.edSec}>
            <h3>{t.themesTitle}</h3>
            <div className={s.themes} role="radiogroup" aria-label={t.themesTitle}>
              {BG_THEMES.map((k) => {
                const needs = k === "marka" && !w.brand;
                const st: CSSProperties = { background: THEME_SWATCH[k], ...(k === "marka" && w.brand ? ({ "--b-soft": w.brand.soft, "--b-accent": w.brand.accent } as CSSProperties) : {}) };
                return (
                  <button key={k} type="button" role="radio" aria-checked={b.theme === k} className={`${s.themeSw} ${b.theme === k ? s.on : ""}`} disabled={lock || needs}
                    onClick={() => set((d) => { d.bg.theme = k; })}>
                    <span className={s.themeBox} style={st} aria-hidden />
                    <span>{t.themes[k]}</span>
                  </button>
                );
              })}
            </div>
            {!w.brand && <p className={`${s.hint} ${s.warnTxt}`}>{t.themeNeedsBrand}</p>}
          </section>
        )}
      </>
    );
  }

  function renderPhoto() {
    const b = w.bg;
    const scope = b.scope ?? (w.layout === "B" ? "page" : "hero");
    const imp = b.important;
    const ring = dims ? importantRing(imp, dims.w, dims.h) : { width: imp.r * 2, height: imp.r * 2 };
    const tp = targetPoint(b, focusTarget);
    const ratio = dims ? dims.w / dims.h : 4 / 3;
    const onPick = (e: PointerEvent<HTMLDivElement>) => {
      if (lock) return;
      const p = pointFromRect(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
      set((d) => { d.bg = setFocusPoint(d.bg, focusTarget, p); });
    };
    const targets: [FocusTarget, string][] = [["important", t.targets.important], ["desktop", t.targets.desktop], ...(b.separateMobile ? [["mobile", t.targets.mobile] as [FocusTarget, string]] : [])];
    return (
      <>
        <section className={s.edSec}>
          <h3>{t.photoTitle}</h3>
          {dropzone("photo", photoUp, !!b.photoAssetId)}
          {b.photoAssetId && (
            <div className={s.rowBtns}>
              <button type="button" className={`${s.ghost} ${s.danger} ${s.grow}`} disabled={lock}
                onClick={() => set((d) => { d.bg.photoAssetId = null; if (d.bg.mode === "photo") d.bg.mode = "default"; })}>
                <Trash2 size={16} aria-hidden />{t.removePhoto}
              </button>
            </div>
          )}
          {assetsBlock("photo")}
        </section>
        {b.photoAssetId && b.mode === "photo" && (
          <>
            <section className={`${s.edSec} ${s.scopeSec}`}>
              <h3>{t.scopeTitle}</h3>
              <Seg label={t.scopeTitle} value={scope} options={[["hero", t.scopes.hero], ["page", t.scopes.page]] as const} onPick={(v) => set((d) => { d.bg.scope = v; })} disabled={lock} wide={true} />
              <p className={s.hint}>{scope === "page" ? t.scopePageHint : t.scopeHeroHint}{b.scope ? "" : ` ${t.scopeDefault}`}</p>
              {scope === "page" && (
                <>
                  <h3 className={s.mt}>{t.attachTitle}</h3>
                  <Seg label={t.attachTitle} value={b.pageAttach} options={[["fixed", t.attach.fixed], ["scroll", t.attach.scroll]] as const} onPick={(v) => set((d) => { d.bg.pageAttach = v; })} disabled={lock} wide={true} />
                  <p className={s.hint}>{b.pageAttach === "fixed" ? t.attachFixedHint : t.attachScrollHint}</p>
                  <Range label={t.pageOverlay} value={b.pageOverlay ?? b.overlay} min={0} max={0.9} step={0.05} out={`%${pct(b.pageOverlay ?? b.overlay)}`} onChange={(v) => set((d) => { d.bg.pageOverlay = v; })} disabled={lock} />
                  <Range label={t.pageBlur} value={b.pageBlur} min={0} max={12} step={1} out={`${b.pageBlur} px`} onChange={(v) => set((d) => { d.bg.pageBlur = v; })} disabled={lock} />
                  <h3 className={s.mt}>{t.cardsTitle}</h3>
                  <Seg label={t.cardsTitle} value={b.pageCards} options={(["auto", "glass", "opaque"] as const).map((v) => [v, t.cards[v]] as const)} onPick={(v) => set((d) => { d.bg.pageCards = v; })} disabled={lock} />
                  <p className={s.hint}>{t.cardsHint}</p>
                </>
              )}
            </section>
            <section className={s.edSec}>
              <h3>{t.focusTitle}</h3>
              <label className={s.check}>
                <input type="checkbox" checked={b.separateMobile} disabled={lock}
                  onChange={(e) => { const v = e.currentTarget.checked; set((d) => { d.bg.separateMobile = v; if (v) d.bg.mobileFocus = { ...d.bg.focus }; }); if (v) setFocusTarget("mobile"); }} />
                {t.separateMobile}
              </label>
              <div className={s.gap8} />
              <Seg label={t.focusTitle} value={focusTarget} options={targets} onPick={(v) => setFocusTarget(v)} disabled={false} wide={true} />
              {photoSrc ? (
                <div className={`${s.focal} ${focusTarget === "important" ? s.markImp : ""} ${lock ? s.focalOff : ""}`}
                  style={{ aspectRatio: `${ratio}`, width: `min(100%, ${Math.round(240 * ratio)}px)` }}
                  tabIndex={lock ? -1 : 0} role="group" aria-label={`${t.focalLabel(t.targets[focusTarget])} (${Math.round(tp.x)}%, ${Math.round(tp.y)}%)`}
                  onPointerDown={(e) => { if (lock) return; dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); onPick(e); }}
                  onPointerMove={(e) => { if (dragging.current) onPick(e); }}
                  onPointerUp={() => { dragging.current = false; }}
                  onPointerCancel={() => { dragging.current = false; }}
                  onKeyDown={(e) => {
                    if (lock) return;
                    const p = nudgePoint(tp, e.key, e.shiftKey ? 10 : 2);
                    if (p) { e.preventDefault(); set((d) => { d.bg = setFocusPoint(d.bg, focusTarget, p); }); }
                  }}>
                  <Img src={photoSrc} alt="" draggable={false} onLoad={(e) => { const im = e.currentTarget; setPhotoDims({ src: photoSrc, w: im.naturalWidth, h: im.naturalHeight }); }} />
                  <span className={s.impRing} style={{ left: `${imp.x}%`, top: `${imp.y}%`, width: `${ring.width}%`, height: `${ring.height}%` }} />
                  <span className={s.focalDot} style={{ left: `${tp.x}%`, top: `${tp.y}%` }} />
                </div>
              ) : <p className={s.hint} role="status">{t.photoLoading}</p>}
              <p className={s.hint}>{focusTarget === "important" ? t.importantHint : t.focusHint}</p>
              {focusTarget === "important" && <Range label={t.importantSize} value={imp.r} min={6} max={45} step={1} out={`%${imp.r}`} onChange={(v) => set((d) => { d.bg.important.r = v; })} disabled={lock} />}
              {photoSrc && (
                <div className={s.crops}>
                  <figure>
                    <div className={`${s.crop} ${scope === "page" ? s.cropPage : s.cropD}`}><Img src={photoSrc} alt="" style={cropStyle(effectiveFocus(b, "desktop"), b.zoom)} /></div>
                    <figcaption>{t.cropDesktop}</figcaption>
                  </figure>
                  <figure>
                    <div className={`${s.crop} ${s.cropM} ${scope === "page" ? s.tall : ""}`}><Img src={photoSrc} alt="" style={cropStyle(effectiveFocus(b, "mobile"), b.zoom)} /></div>
                    <figcaption>{t.cropMobile}</figcaption>
                  </figure>
                </div>
              )}
              <div className={s.gap8} />
              <Range label={t.zoom} value={b.zoom} min={1} max={2.5} step={0.05} out={`${pct(b.zoom)}%`} onChange={(v) => set((d) => { d.bg.zoom = v; })} disabled={lock} />
            </section>
            <section className={s.edSec}>
              <h3>{t.overlayTitle} <output>%{pct(b.overlay)}</output></h3>
              <Range label={t.overlayTitle} value={b.overlay} min={0} max={0.85} step={0.05} out={`%${pct(b.overlay)}`} onChange={(v) => set((d) => { d.bg.overlay = v; })} disabled={lock} />
              <div className={s.gap8} />
              <Seg label={t.overlayTitle} value={b.tone} options={[["light", t.tones.light], ["dark", t.tones.dark]] as const} onPick={(v) => set((d) => { d.bg.tone = v; })} disabled={lock} wide={true} />
              <p className={s.hint}>{t.overlayHint}</p>
            </section>
          </>
        )}
      </>
    );
  }

  // ── Bölüm: Modüller ve Favoriler ──
  function renderModules() {
    const total = modules.length;
    const visible = modules.filter((m) => !isModHidden(m)).length;
    const shownFavs = favs.filter((k) => { const m = modByKey.get(k.replace(/^module:/, "")); return !!m && m.accessible && !isModHidden(m); }).length;
    return (
      <>
        <section className={s.edSec}>
          <div className={s.modSummary}>
            <span>{t.modSummary(visible, total)}</span>
            {pw.prefs.hiddenModules.length > 0 && <button type="button" className={s.ghost} disabled={prefsLock || prefSaving} onClick={() => void savePrefs((p) => ({ ...p, hiddenModules: [] }))}>{t.showAll}</button>}
          </div>
          <p className={s.note}><EyeOff size={16} aria-hidden /><span>{t.noteHide}</span></p>
          <p className={`${s.note} ${s.sim}`}><Save size={16} aria-hidden /><span>{t.notePrefs}</span></p>
          {prefSaving && <p className={s.hint} role="status">{t.prefsSaving}</p>}
        </section>
        <section className={s.edSec}>
          <h3><Star size={16} aria-hidden />{t.favTitle} <output>{favs.length}/{FAVORITES_MAX}</output></h3>
          {favs.length ? (
            <ol className={s.favOrder}>
              {favs.map((k, i) => {
                const m = modByKey.get(k.replace(/^module:/, ""));
                const off = !m || !m.accessible || isModHidden(m);
                return (
                  <li key={k} className={off ? s.off : undefined}>
                    <span className={s.favName}>{m ? moduleLabel(m) : k}
                      {m && !m.accessible ? <small>{t.favNoAccess}</small> : m && isModHidden(m) ? <small>{t.favHidden}</small> : null}
                    </span>
                    <span className={s.lineBtns}>
                      <button type="button" className={s.iconBtn} disabled={prefsLock || prefSaving || i === 0} aria-label={t.favUp} onClick={() => moveFav(i, -1)}><ChevronUp size={15} aria-hidden /></button>
                      <button type="button" className={s.iconBtn} disabled={prefsLock || prefSaving || i === favs.length - 1} aria-label={t.favDown} onClick={() => moveFav(i, 1)}><ChevronDown size={15} aria-hidden /></button>
                      <button type="button" className={s.iconBtn} disabled={prefsLock || prefSaving} aria-label={t.favRemove} onClick={() => removeFav(k)}><X size={15} aria-hidden /></button>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : <p className={s.hint}>{t.favEmpty}</p>}
          <p className={s.hint}>{t.favShown(shownFavs)}</p>
        </section>
        {/* "Modül kartları" (cardLevel) P4'te ana sayfada çizilmediği için seçenek gösterilmez (işlevsiz kontrol yok). */}
        <section className={s.edSec}>
          <h3>{t.visibilityTitle}</h3>
          <ol className={s.centers}>
            {WORKSPACE_CENTERS.map((c) => {
              const cKey = `center:${c.key}`;
              const cHidden = hidden.has(cKey);
              const name = centerLabel(c.key);
              const kids = modules.filter((m) => m.centerKey === c.key);
              return (
                <li key={c.key} className={`${s.centerRow} ${cHidden ? s.off : ""}`}>
                  <div className={s.centerHead}>
                    <button type="button" className={s.eye} aria-pressed={!cHidden} disabled={prefsLock || prefSaving} aria-label={cHidden ? t.showCenter(name) : t.hideCenter(name)} onClick={() => toggleHidden(cKey)}>
                      {cHidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                    </button>
                    <strong>{name}</strong>
                  </div>
                  <ul className={s.modList}>
                    {kids.map((m) => {
                      const mKey = `module:${m.key}`;
                      const mHidden = hidden.has(mKey);
                      const fav = favs.includes(mKey);
                      const label = moduleLabel(m);
                      return (
                        <li key={m.key} className={`${s.modRow} ${mHidden || cHidden ? s.off : ""}`}>
                          <button type="button" className={s.eye} aria-pressed={!mHidden} disabled={prefsLock || prefSaving} aria-label={mHidden ? t.showModule(label) : t.hideModule(label)} onClick={() => toggleHidden(mKey)}>
                            {mHidden ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                          </button>
                          <span className={s.modName}>{label}{!m.accessible && <small> · {t.noAccess}</small>}{cHidden && !mHidden && <small> · {t.centerHiddenNote}</small>}</span>
                          <button type="button" className={`${s.starBtn} ${fav ? s.on : ""}`} aria-pressed={fav}
                            disabled={prefsLock || prefSaving || (!fav && (!m.accessible || favs.length >= FAVORITES_MAX))}
                            title={!fav && !m.accessible ? t.favLocked : !fav && favs.length >= FAVORITES_MAX ? t.favFull(FAVORITES_MAX) : undefined}
                            aria-label={`${fav ? t.favRemove : t.favAdd}: ${label}`} onClick={() => toggleFav(m)}>
                            <Star size={16} aria-hidden fill={fav ? "currentColor" : "none"} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </section>
      </>
    );
  }

  // ── Bölüm: Görünüm ──
  function renderView() {
    const icons: Record<string, ReactNode> = { auto: <SunMoon size={18} aria-hidden />, day: <Sun size={18} aria-hidden />, night: <Moon size={18} aria-hidden />, reading: <BookOpen size={18} aria-hidden />, focus: <Target size={18} aria-hidden /> };
    return (
      <>
        <section className={s.edSec}>
          <h3><Moon size={16} aria-hidden />{t.viewTitle}</h3>
          <p className={s.note}><Lock size={16} aria-hidden /><span>{t.viewNote}</span></p>
          <div className={s.viewList}>
            {VIEW_MODES.map((v) => (
              <button key={v} type="button" className={`${s.viewOpt} ${pw.prefs.viewMode === v ? s.on : ""}`} aria-pressed={pw.prefs.viewMode === v} disabled={prefsLock || prefSaving}
                onClick={() => void savePrefs((p) => ({ ...p, viewMode: v }))}>
                {icons[v]}<span><b>{t.viewModes[v][0]}</b><small>{t.viewModes[v][1]}</small></span>
              </button>
            ))}
          </div>
          {prefSaving && <p className={s.hint} role="status">{t.prefsSaving}</p>}
        </section>
        <section className={s.edSec}>
          <h3><BookOpen size={16} aria-hidden />{t.readingTitle}</h3>
          <Range label={t.readingScale} value={reading.scale} min={1} max={1.5} step={0.05} out={`%${pct(reading.scale)}`} onChange={(v) => changeReading({ scale: v })} disabled={prefsLock} />
          <Range label={t.readingLh} value={reading.lineHeight} min={1.4} max={2.1} step={0.05} out={reading.lineHeight.toFixed(2)} onChange={(v) => changeReading({ lineHeight: v })} disabled={prefsLock} />
          <div className={s.gap8} />
          <Seg label={t.readingWidthLabel} value={reading.width} options={READING_WIDTHS.map((v) => [v, t.readingWidths[v]] as const)} onPick={(v) => changeReading({ width: v })} disabled={prefsLock} />
          <p className={s.hint}>{t.readingHint}</p>
        </section>
      </>
    );
  }

  // ── Bölüm: Kayıtlı Düzen ──
  function renderSaved() {
    const history = pw.design?.history ?? [];
    const isDefault = JSON.stringify(w) === JSON.stringify(defaultDesign(w.layout));
    return (
      <>
        <section className={s.edSec}>
          <h3><Save size={16} aria-hidden />{t.stateTitle}</h3>
          <div className={s.stateCards}>
            <div className={`${s.stCard} ${s.stDraft}`}><small>{t.stDraftSmall}</small><b>{t.stDraft}</b><span>{changes.length ? t.stChanged(groupText(changes)) : t.stSame}</span></div>
            <div className={`${s.stCard} ${s.stLive}`}><small>{t.stLiveSmall}</small><b>{t.stLive}</b><span>{applied ? t.stLiveCustom : t.stLiveDefault}</span></div>
          </div>
          <p className={s.hint}>{pw.design?.draft ? t.stServerDraft : t.stNoServerDraft}</p>
          <div className={s.rowBtns}>
            <button type="button" className={`${s.ghost} ${s.grow}`} disabled={!canSave} onClick={() => void pw.saveDraft()}><Save size={15} aria-hidden />{busy === "saveDraft" ? t.saving : t.saveDraft}</button>
            <button type="button" className={`${s.primary} ${s.grow}`} disabled={!canApply} title={applyReason || undefined} onClick={requestApply}><Check size={15} aria-hidden />{busy === "apply" ? t.applying : t.apply}</button>
          </div>
          <div className={s.rowBtns}>
            <button type="button" className={`${s.ghost} ${s.grow}`} disabled={lock || isDefault} onClick={() => pw.loadDefaultIntoDraft()}>{t.loadDefault}</button>
          </div>
          <p className={s.hint}>{t.loadDefaultHint}</p>
        </section>
        <section className={s.edSec}>
          <h3><History size={16} aria-hidden />{t.historyTitle} <output>{history.length}</output></h3>
          {history.length ? (
            <ol className={s.histList}>
              {history.map((h) => {
                const diff = changedGroups(h.design, applied ?? fallback);
                return (
                  <li key={h.id}>
                    <span><b>{t.layouts[h.design.layout][0]}</b><small>{t.historyItem(fmtDate(h.savedAt))} · {diff.length ? groupText(diff) : t.historyNoDiff}</small></span>
                    <span className={s.histBtns}>
                      <button type="button" className={s.ghost} disabled={lock} onClick={() => (pw.dirty ? setConfirm({ kind: "loadHistory", id: h.id }) : void pw.loadHistory(h.id))}>{t.histLoad}</button>
                      <button type="button" className={s.ghost} disabled={lock} onClick={() => setConfirm({ kind: "restore", id: h.id })}>{t.histRestore}</button>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : <p className={s.hint}>{t.historyEmpty}</p>}
        </section>
        <section className={s.edSec}>
          <h3><RotateCcw size={16} aria-hidden />{t.resetAllTitle}</h3>
          <p className={s.hint}>{t.resetAllHint}</p>
          <div className={s.rowBtns}>
            <button type="button" className={`${s.ghost} ${s.danger} ${s.grow}`} disabled={lock || !pw.prefsLoaded} onClick={() => setConfirm({ kind: "resetAll" })} data-testid="studio-reset-all">
              <RotateCcw size={15} aria-hidden />{t.resetAllTitle}
            </button>
          </div>
          <h3><RotateCcw size={16} aria-hidden />{t.resetDesignOnly}</h3>
          <p className={s.hint}>{t.resetHint}</p>
          <div className={s.rowBtns}>
            <button type="button" className={`${s.ghost} ${s.danger} ${s.grow}`} disabled={lock || (!applied && !pw.design?.draft)} onClick={() => setConfirm({ kind: "reset" })} data-testid="studio-reset-design">
              <RotateCcw size={15} aria-hidden />{t.resetDesignOnly}
            </button>
          </div>
        </section>
      </>
    );
  }

  const body = tab === "marka" ? <>{renderLayout()}{renderBrand()}{renderText()}</>
    : tab === "logo" ? <>{renderLogo()}{renderBackground()}{renderPhoto()}</>
      : tab === "moduller" ? renderModules()
        : tab === "gorunum" ? renderView()
          : renderSaved();

  const notice = pw.notice;
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((x) => x.key === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].key;
    setTab(next);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`#studio-tab-${next}`)?.focus());
  };

  return (
    <>
      <aside ref={rootRef} className={`${s.drawer} ${collapsed ? s.collapsed : ""}`} role="dialog" aria-modal="true" aria-labelledby="studio-title" onKeyDown={onRootKey}>
        <div className={s.edHead}>
          <div className={s.headText}>
            <p className={s.edKicker}>{t.kicker}</p>
            <h2 id="studio-title" tabIndex={-1} data-autofocus>{t.tabs[tab][0]}</h2>
            <p className={`${s.draftChip} ${pw.dirty ? s.dirty : ""}`}>{pw.dirty ? t.draftDirty : t.draftClean}</p>
          </div>
          <div className={s.headBtns}>
            <button type="button" className={s.iconBtn} onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? t.expand : t.collapse} title={collapsed ? t.expand : t.collapse}>
              {collapsed ? <Maximize2 size={16} aria-hidden /> : <Minimize2 size={16} aria-hidden />}
            </button>
            <button type="button" className={s.iconBtn} onClick={requestClose} aria-label={t.close} title={t.close}><X size={18} aria-hidden /></button>
          </div>
        </div>
        {!collapsed && (
          <>
            <div className={s.edTabs} role="tablist" aria-label={t.panelLabel} onKeyDown={onTabKey}>
              {TABS.map((x) => (
                <button key={x.key} id={`studio-tab-${x.key}`} type="button" role="tab" aria-selected={x.key === tab} aria-controls="studio-panel" tabIndex={x.key === tab ? 0 : -1}
                  className={x.key === tab ? s.on : undefined} title={t.tabs[x.key][0]} onClick={() => setTab(x.key)}>
                  {x.icon}<span>{t.tabs[x.key][1]}</span>
                </button>
              ))}
            </div>
            <div className={s.edBody} id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
              {pw.readOnly && <p className={`${s.note} ${s.warnNote}`} role="status"><Lock size={16} aria-hidden /><span>{t.readOnly}</span></p>}
              {notice && (
                <div className={`${s.notice} ${s[notice.tone]}`} role={notice.tone === "error" ? "alert" : "status"}>
                  <span>{notice.text}</span>
                  <button type="button" className={s.iconBtn} aria-label={t.dismiss} onClick={() => pw.setNotice(null)}><X size={14} aria-hidden /></button>
                </div>
              )}
              {msg && (
                <div className={`${s.notice} ${s[msg.tone]}`} role={msg.tone === "error" ? "alert" : "status"}>
                  <span>{msg.text}</span>
                  <button type="button" className={s.iconBtn} aria-label={t.dismiss} onClick={() => setMsg(null)}><X size={14} aria-hidden /></button>
                </div>
              )}
              {body}
            </div>
          </>
        )}
        <div className={s.edFoot}>
          <div className={s.footState}>
            <span className={`${s.dot} ${pw.dirty ? s.dotDirty : ""}`} aria-hidden />
            <span>{pw.dirty ? t.dirtyDot : t.savedDot}</span>
            <button type="button" className={`${s.gateChip} ${issues.length ? s.bad : s.ok}`} aria-expanded={showIssues} disabled={!issues.length}
              onClick={() => setShowIssues((v) => !v)} id="studio-gate">
              {issues.length ? <TriangleAlert size={13} aria-hidden /> : <Check size={13} aria-hidden />}
              {issues.length ? t.gateBad(issues.length) : pw.working?.bg.mode === "photo" ? t.gateOkColors : t.gateOk}
            </button>
            {/* Fotoğraf üzerindeki metin: tarayıcıda ölçülür; ölçülemeyen durum PASS gösterilmez. */}
            {pw.working?.bg.mode === "photo" ? <ReadabilityBadge showIdle /> : null}
          </div>
          {showIssues && issues.length > 0 && (
            <ul className={s.issueList} role="alert">
              {issues.map((i) => <li key={i.path}>{t.issueLine(i.area, i.ratio, i.need)}</li>)}
            </ul>
          )}
          <div className={s.footBtns}>
            <button type="button" className={s.ghost} disabled={!!busy || !pw.editing}
              onClick={() => { if (pw.dirty || pw.design?.draft) setConfirm({ kind: "discard" }); else void leave(); }}>{t.discard}</button>
            <button type="button" className={s.ghost} disabled={!canSave} onClick={() => void pw.saveDraft()}>
              <Save size={15} aria-hidden />{busy === "saveDraft" ? t.saving : t.saveDraft}
            </button>
            <button type="button" className={s.primary} disabled={!canApply} aria-describedby={applyReason ? "studio-apply-reason" : undefined} onClick={requestApply}>
              <Check size={15} aria-hidden />{busy === "apply" ? t.applying : busy ? t.working : t.apply}
            </button>
          </div>
          {applyReason && <p id="studio-apply-reason" className={s.footReason}>{applyReason}</p>}
        </div>
      </aside>
      {confirm && (
        <ConfirmDialog t={t} confirm={confirm} changes={groupText(changes)} busy={!!busy} canApply={canApply} canSave={canSave}
          onCancel={() => setConfirm(null)}
          onAction={async (action) => {
            const c = confirm;
            if (action === "cancel") { setConfirm(null); return; }
            if (c.kind === "exit") {
              if (action === "drop") { setConfirm(null); await leave(); }
              else if (action === "save") { if (await pw.saveDraft()) { setConfirm(null); await leave(); } else setConfirm(null); }
              else if (action === "apply") { setConfirm(null); requestApply(); }
              return;
            }
            if (c.kind === "mobileSync") {
              setConfirm(null);
              const w = pw.working;
              if (action === "yes" && w) await pw.apply(applyDesktopToMobile(w));
              else if (action === "no") await pw.apply();
              return;
            }
            setConfirm(null);
            if (c.kind === "discard") await pw.discard();
            else if (c.kind === "resetAll") await pw.resetAll();
            else if (c.kind === "reset") await pw.resetDesign();
            else if (c.kind === "restore") await pw.restore(c.id);
            else if (c.kind === "loadHistory") await pw.loadHistory(c.id);
            else if (c.kind === "deleteAsset") await removeAsset(c.id);
          }} />
      )}
    </>
  );
}

// ── Onay penceresi ──────────────────────────────────────────────────────────

type Action = "cancel" | "confirm" | "drop" | "save" | "apply" | "yes" | "no";

function ConfirmDialog({ t, confirm, changes, busy, canApply, canSave, onCancel, onAction }: {
  t: StudioDict; confirm: Confirm; changes: string; busy: boolean; canApply: boolean; canSave: boolean;
  onCancel: () => void; onAction: (a: Action) => void | Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("[data-first]")?.focus(); }, []);
  const spec: { title: string; body: string; btns: [Action, string, "ghost" | "danger" | "primary" | "primaryDanger", boolean?][] } =
    confirm.kind === "exit" ? { title: t.exitTitle, body: t.exitBody, btns: [["cancel", t.keepEditing, "ghost"], ["drop", t.exitDrop, "danger"], ["save", t.exitSave, "ghost", !canSave], ["apply", t.exitApply, "primary", !canApply]] }
      : confirm.kind === "discard" ? { title: t.discardTitle, body: t.discardBody, btns: [["cancel", t.keepEditing, "ghost"], ["confirm", t.discardYes, "primaryDanger"]] }
        : confirm.kind === "reset" ? { title: t.resetConfirmTitle, body: t.resetConfirmBody, btns: [["cancel", t.keepEditing, "ghost"], ["confirm", t.resetYes, "primaryDanger"]] }
        : confirm.kind === "resetAll" ? { title: t.resetAllConfirmTitle, body: t.resetAllConfirmBody, btns: [["cancel", t.keepEditing, "ghost"], ["confirm", t.resetAllYes, "primaryDanger"]] }
        : confirm.kind === "mobileSync" ? { title: t.mobileSyncTitle, body: t.mobileSyncBody, btns: [["cancel", t.keepEditing, "ghost"], ["no", t.mobileSyncNo, "ghost"], ["yes", t.mobileSyncYes, "primary"]] }
          : confirm.kind === "restore" ? { title: t.restoreTitle, body: t.restoreBody, btns: [["cancel", t.keepEditing, "ghost"], ["confirm", t.restoreYes, "primary"]] }
            : confirm.kind === "loadHistory" ? { title: t.histLoadDirtyTitle, body: t.histLoadDirtyBody, btns: [["cancel", t.keepEditing, "ghost"], ["confirm", t.histLoadYes, "primary"]] }
              : { title: t.deleteTitle, body: t.deleteBody, btns: [["cancel", t.keepEditing, "ghost"], ["confirm", t.deleteYes, "primaryDanger"]] };
  const cls = { ghost: s.ghost, danger: `${s.ghost} ${s.danger}`, primary: s.primary, primaryDanger: `${s.primary} ${s.primaryDanger}` };
  return (
    <div className={s.modal}>
      <div className={s.mdScrim} onClick={onCancel} aria-hidden />
      <div ref={ref} className={s.mdBox} role="alertdialog" aria-modal="true" aria-labelledby="studio-md-t" aria-describedby="studio-md-b"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
          trapTab(e, ref.current);
        }}>
        <h2 id="studio-md-t">{spec.title}</h2>
        <p id="studio-md-b">{spec.body}</p>
        {changes && (confirm.kind === "exit" || confirm.kind === "discard") && <p className={s.mdList}>{t.changedList(changes)}</p>}
        {confirm.kind === "resetAll" && (
          <>
            <ul className={s.mdList}>{t.resetAllItems.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className={s.mdList}>{t.resetAllKept}</p>
          </>
        )}
        {confirm.kind === "mobileSync" && (
          <div className={s.mdList}>
            <p><strong>{t.mobileSyncShared}:</strong> {SHARED_SETTINGS.join(" · ")}</p>
            <p><strong>{t.mobileSyncDevice}:</strong> {DEVICE_SETTINGS.join(" · ")}</p>
          </div>
        )}
        <div className={s.mdBtns}>
          {spec.btns.map(([a, label, kind, dis], i) => (
            <button key={a} type="button" className={cls[kind]} disabled={busy || !!dis} data-first={i === 0 ? "" : undefined} onClick={() => void onAction(a)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
