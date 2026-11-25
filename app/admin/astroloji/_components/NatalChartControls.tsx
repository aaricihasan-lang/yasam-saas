"use client";

/**
 * Natal çark görünüm denetimi — YALNIZ Natal sonuç / kayıtlı Natal ekranı.
 *
 *   • Temel / Profesyonel: tek dokunuşla geçiş. AYNI teknik veri; hesap yeniden çalışmaz, sağlayıcı isteği / kredi /
 *     kayıt değişikliği YOK (yalnız çizim seçimi; bkz. lib/astrology/view/natalWheelDisplay).
 *   • V4 (2026-11-06, owner kararı): "Ek noktalar" ve "Açı çizgileri" haritanın üstündeki KOMPAKT araç çubuğunda iki küçük
 *     açılır ÇOKLU SEÇİM menüsüdür (gerçek işaretleme kutuları). Menü sayfa akışına girmez (DeskPopover) → açılınca harita
 *     aşağı kaymaz / küçülmez. Kapalı düğme seçimin kısa özetini gösterir ("Ek noktalar · 3/5").
 *   • İLK AÇILIŞTA bu haritada kullanılabilir BÜTÜN seçenekler seçilidir (5/5 nokta; başlıca + küçük; uyumlu + zorlayıcı +
 *     nötr; tüm gövdeler). Haritada bulunmayan nokta (ör. saat bilinmiyorsa Vertex / Şans Noktası) pasif ve nedeniyle
 *     gösterilir, sayıma girmez — sahte konum çizilmez. Gövde odağı önceki gibi TEK gövde ("Güneş'in açıları").
 *   • Seçimler yalnız bu sayfa oturumunda bellekte tutulur (menü kapanınca / analiz değişince korunur; sayfa yeniden
 *     açılınca yine tümü seçili başlar). Yalnız Temel / Profesyonel tercihi bu tarayıcıda hatırlanır (localStorage).
 *   • Açı listesi sayısı ile çarkta çizilen açı sayısı AYRI yazılır. Hiçbiri kayıt, rapor ve Word/PDF'i etkilemez.
 */

import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AspectNature, BodyId, NatalTechnical } from "@/lib/astrology/model/western";
import {
  aspectCounts,
  availablePoints,
  DEFAULT_ASPECT_FILTER,
  extraPointsFor,
  hiddenBodiesFor,
  isDefaultAspectFilter,
  NATAL_LABEL_PREFS,
  NATAL_OPTIONAL_POINTS,
  NATAL_WHEEL_MODES,
  parsePrefs,
  type NatalAspectFilter,
  type NatalLabelPref,
  type NatalOptionalPoint,
  type NatalPointSelection,
  type NatalWheelMode,
  type NatalWheelPrefs,
} from "@/lib/astrology/view/natalWheelDisplay";
import { labelsDetailed } from "@/lib/astrology/view/natalLabelLayout";
import { listedNatalAspects } from "@/lib/astrology/view/natalTimeUnknown";
import type { NatalWheelDisplay } from "./NatalWheel";
import type { NatalLabelPick, NatalWheelLayoutInfo } from "./NatalWheelLabeled";
import DeskPopover from "./atlas/DeskPopover";
import styles from "./natalWheel.module.css";

const PREFS_KEY = "atlas.natalWheel.v1";

/** V4: ilk açılışta bütün noktalar seçili (her iki görünümde); haritada olmayan nokta zaten çizilemez. */
const ALL_POINTS: NatalPointSelection = { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true };
const initialSelection = (): Pick<NatalWheelPrefs, "points" | "filter"> => ({
  points: { basic: { ...ALL_POINTS }, pro: { ...ALL_POINTS } },
  filter: { ...DEFAULT_ASPECT_FILTER },
});

/** Görünüm tercihi. Kalıcı olan YALNIZ görünüm (Temel / Profesyonel) — bu tarayıcıda; erişilemezse bellekte.
 *  Nokta ve açı seçimi bu sayfa oturumunun belleğinde (ilk açılışta tümü seçili). Sunucu ve ilk çizim varsayılanı kullanır. */
const listeners = new Set<() => void>();
let memoryMode: NatalWheelMode | null = null;
/** G2: etiket tercihi de görünüm gibi bu tarayıcıda hatırlanır (varsayılan "Moda göre"). */
let memoryLabels: NatalLabelPref | null = null;
let selection = initialSelection();
let snapshot: { mode: NatalWheelMode; labels: NatalLabelPref; sel: typeof selection; value: NatalWheelPrefs } | null = null;

function readStored(): Pick<NatalWheelPrefs, "mode" | "labels"> {
  if (memoryMode && memoryLabels) return { mode: memoryMode, labels: memoryLabels };
  try {
    const p = parsePrefs(window.localStorage.getItem(PREFS_KEY));
    return { mode: memoryMode ?? p.mode, labels: memoryLabels ?? p.labels };
  } catch {
    const p = parsePrefs(null);
    return { mode: memoryMode ?? p.mode, labels: memoryLabels ?? p.labels };
  }
}

function readPrefs(): NatalWheelPrefs {
  const { mode, labels } = readStored();
  if (!snapshot || snapshot.mode !== mode || snapshot.labels !== labels || snapshot.sel !== selection) snapshot = { mode, labels, sel: selection, value: { mode, labels, ...selection } };
  return snapshot.value;
}

const SERVER_PREFS: NatalWheelPrefs = { mode: parsePrefs(null).mode, labels: parsePrefs(null).labels, ...initialSelection() };

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PREFS_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useNatalWheelPrefs(): [NatalWheelPrefs, (next: NatalWheelPrefs) => void] {
  const prefs = useSyncExternalStore(subscribe, readPrefs, () => SERVER_PREFS);
  const update = useCallback((next: NatalWheelPrefs) => {
    selection = { points: next.points, filter: next.filter };
    memoryMode = next.mode;
    memoryLabels = next.labels;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: next.mode, labels: next.labels }));
    } catch {
      /* depolama yok: bellekteki görünüm kullanılır */
    }
    for (const cb of listeners) cb();
  }, []);
  return [prefs, update];
}

/**
 * Çarka verilecek görünüm katmanı (saf türetim; teknik veri değişmez). G2: `labels` verilirse burç-derece-dakika etiket katmanı
 * (R4-S2) açılır — saat bilinmiyor kuralı ve dokunma ayrıntısı dahil.
 */
export function natalWheelDisplay(
  technical: NatalTechnical,
  prefs: NatalWheelPrefs,
  labels?: { timeUnknown: boolean; onPick?: (pick: NatalLabelPick) => void; onLayout?: (instance: string, layout: NatalWheelLayoutInfo | null) => void },
): NatalWheelDisplay {
  const points = prefs.points[prefs.mode];
  const base: NatalWheelDisplay = { mode: prefs.mode, hiddenBodies: hiddenBodiesFor(points), extraPoints: extraPointsFor(technical, points), aspectFilter: prefs.filter };
  return labels ? { ...base, labels: { detailed: labelsDetailed(prefs.labels, prefs.mode), timeUnknown: labels.timeUnknown, onPick: labels.onPick, onLayout: labels.onLayout } } : base;
}

/**
 * Çizilen çark örneklerinin düzen kaydı (sayfa durumu): yan grup alanı İLK kaydolan çarkı (çalışma masası) izler; odak modu gibi
 * sonradan açılan örnek kapanınca kaydı silinir.
 */
export function useNatalWheelLayouts(): [NatalWheelLayoutInfo | null, (instance: string, layout: NatalWheelLayoutInfo | null) => void] {
  const [map, setMap] = useState<Record<string, NatalWheelLayoutInfo>>({});
  const report = useCallback((instance: string, layout: NatalWheelLayoutInfo | null) => {
    setMap((m) => {
      if (layout === null) {
        if (!(instance in m)) return m;
        const next = { ...m };
        delete next[instance];
        return next;
      }
      return { ...m, [instance]: layout };
    });
  }, []);
  const first = Object.keys(map)[0];
  return [first ? map[first] : null, report];
}

const NATURES = ["harmonious", "challenging", "neutral"] as const satisfies readonly AspectNature[];

export default function NatalChartControls({
  technical,
  prefs,
  onChange,
  timeUnknown = false,
}: {
  technical: NatalTechnical;
  prefs: NatalWheelPrefs;
  onChange: (next: NatalWheelPrefs) => void;
  /** G2: doğum saati bilinmiyor → çarkta açı çizgisi yok; liste sayısı Ay'a bağlı açılar hariç. */
  timeUnknown?: boolean;
}) {
  // I18N-F1-R5: metin katalogdan (atlas.natalControls + terms); lib etiketleri (NATAL_*_LABELS) TR katalogla kilitli.
  const t = useTranslations("atlas.natalControls");
  const tt = useTranslations("terms");
  const mode = prefs.mode;
  const points = prefs.points[mode];
  const available = useMemo(() => availablePoints(technical), [technical]);
  const hidden = useMemo(() => hiddenBodiesFor(points), [points]);
  const filter = prefs.filter;
  const counts = useMemo(() => {
    if (!timeUnknown) return aspectCounts(technical.aspects, mode, hidden, filter);
    return { total: listedNatalAspects(technical.aspects, true).length, drawn: 0 };
  }, [technical.aspects, mode, hidden, filter, timeUnknown]);
  // Odak seçeneği: çarkta görünen ve en az bir açısı olan gövdeler (gizli gövde odaklanamaz → seçim yok sayılır).
  const focusable = useMemo(
    () => technical.bodies.filter((b) => !hidden.has(b.id) && technical.aspects.some((a) => a.a === b.id || a.b === b.id)).map((b) => b.id),
    [technical.bodies, technical.aspects, hidden],
  );
  const focus = filter.focus && focusable.includes(filter.focus) ? filter.focus : null;

  const setMode = (m: NatalWheelMode) => {
    if (m !== mode) onChange({ ...prefs, mode: m });
  };
  const setPoints = (next: NatalPointSelection) => onChange({ ...prefs, points: { ...prefs.points, [mode]: next } });
  const setFilter = (next: Partial<NatalAspectFilter>) => onChange({ ...prefs, filter: { ...filter, ...next } });

  // İki açılır menü: yalnız görünüm durumu (aynı anda biri açık). Seçimler prefs'te kalır; menü kapanınca korunur.
  const [menuOpen, setMenuOpen] = useState<"points" | "filter" | null>(null);
  const pointsRef = useRef<HTMLButtonElement | null>(null);
  const filterRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(null), []);

  const availableKeys = NATAL_OPTIONAL_POINTS.filter((k) => available[k]);
  const onCount = availableKeys.filter((k) => points[k]).length;
  const missing = NATAL_OPTIONAL_POINTS.length - availableKeys.length;
  const pointsSummary = availableKeys.length === 0 ? t("pointsNone") : `${onCount}/${availableKeys.length}`;

  // Açı seçenekleri: Temel görünüm küçük açı çizmez → orada seçenek pasif ve sayıma girmez.
  const flagKeys = (["major", "minor", ...NATURES] as const).filter((k) => !(k === "minor" && mode === "basic"));
  const flagOn = flagKeys.filter((k) => filter[k]).length;
  const filterDefault = isDefaultAspectFilter({ ...filter, focus });
  const filterSummary = `${flagOn}/${flagKeys.length}${focus ? ` · ${tt(`body.${focus}`)}` : ""}`;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-testid="natal-wheel-controls" data-mode={mode}>
      <div role="group" aria-label={t("viewAria")} className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {NATAL_WHEEL_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === mode}
            onClick={() => setMode(m)}
            className={`min-h-[30px] rounded-md px-2.5 text-[12.5px] font-semibold transition max-sm:min-h-[36px] ${
              m === mode ? "bg-[#0B1430] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
            title={t(`modeTitle.${m}`)}
            data-testid={`natal-mode-${m}`}
          >
            {t(`mode.${m}`)}
          </button>
        ))}
      </div>

      <MenuButton
        label={t("pointsLabel")}
        summary={pointsSummary}
        changed={availableKeys.length > 0 && onCount < availableKeys.length}
        open={menuOpen === "points"}
        onToggle={() => setMenuOpen((m) => (m === "points" ? null : "points"))}
        btnRef={pointsRef}
        title={t("pointsTitle", { on: String(onCount), total: String(availableKeys.length), missing: missing ? t("pointsMissing", { n: missing }) : "", labels: t(`labelPref.${prefs.labels}`) })}
        testId="natal-points-toggle"
      />
      <DeskPopover open={menuOpen === "points"} onClose={closeMenu} triggerRef={pointsRef} width={292} label={t("pointsLabel")} testId="natal-points-panel">
        <MenuHead
          title={t("pointsLabel")}
          onAll={availableKeys.length > 0 && onCount < availableKeys.length ? () => setPoints({ ...points, ...Object.fromEntries(availableKeys.map((k) => [k, true])) }) : undefined}
          onNone={onCount > 0 ? () => setPoints({ ...points, ...Object.fromEntries(availableKeys.map((k) => [k, false])) }) : undefined}
          testIdBase="natal-points"
        />
        <ul className="px-1.5 pb-1.5" role="group" aria-label={t("pointsGroupAria")}>
          {NATAL_OPTIONAL_POINTS.map((k) => {
            const ok = available[k];
            return (
              <li key={k}>
                <CheckRow
                  checked={ok && points[k]}
                  disabled={!ok}
                  onChange={() => setPoints({ ...points, [k]: !points[k] })}
                  testId={`natal-point-${k}`}
                  note={ok ? undefined : t("pointMissingNote")}
                >
                  <span className={`${styles.symbol} w-5 shrink-0 text-center text-slate-500`} aria-hidden="true">
                    {POINT_GLYPH[k]}
                  </span>
                  {t(`point.${k}`)}
                </CheckRow>
              </li>
            );
          })}
        </ul>
        {/* G2-K: etiket tercihi araç satırında ayrı kontrol değil (V4 tek satır kararı; 1440 px'te yer yok) → bu menüde. */}
        <div className="border-t border-slate-100 px-1.5 py-1" role="radiogroup" aria-label={t("labelsAria")} data-testid="natal-labels-group">
          <p className="px-2 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">{t("labelsTitle")}</p>
          {NATAL_LABEL_PREFS.map((k) => (
            <label
              key={k}
              className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] text-slate-800 hover:bg-slate-50 max-sm:min-h-[46px]"
            >
              <input
                type="radio"
                name="natal-wheel-labels"
                checked={prefs.labels === k}
                onChange={() => onChange({ ...prefs, labels: k as NatalLabelPref })}
                className="h-4 w-4 shrink-0 cursor-pointer accent-[#0B1430]"
                data-testid={`natal-labels-${k}`}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{t(`labelPref.${k}`)}</span>
                <span className="text-[11px] leading-snug text-slate-400">
                  {k === "auto" ? t("labelHint.auto", { current: mode === "pro" ? t("currentDetailed") : t("currentSimple") }) : t(`labelHint.${k}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <MenuFoot>{t("drawOnly")}</MenuFoot>
      </DeskPopover>

      <MenuButton
        label={t("filterLabel")}
        summary={filterSummary}
        changed={!filterDefault}
        open={menuOpen === "filter"}
        onToggle={() => setMenuOpen((m) => (m === "filter" ? null : "filter"))}
        btnRef={filterRef}
        title={t("filterTitle", { on: String(flagOn), total: String(flagKeys.length), focus: focus ? t("filterFocusOnly", { body: tt(`body.${focus}`) }) : t("filterAllBodies") })}
        testId="natal-filter-toggle"
      />
      <DeskPopover open={menuOpen === "filter"} onClose={closeMenu} triggerRef={filterRef} width={300} label={t("filterLabel")} testId="natal-aspect-filter">
        <MenuHead
          title={t("filterLabel")}
          onAll={!filterDefault ? () => onChange({ ...prefs, filter: { ...DEFAULT_ASPECT_FILTER } }) : undefined}
          onNone={flagOn > 0 ? () => setFilter({ major: false, minor: false, harmonious: false, challenging: false, neutral: false }) : undefined}
          testIdBase="natal-filter"
        />
        <div className="px-1.5 pb-1" role="group" aria-label={t("groupAria")}>
          <p className="px-2 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">{t("groupTitle")}</p>
          {(["major", "minor"] as const).map((k) => {
            const disabled = k === "minor" && mode === "basic";
            return (
              <CheckRow
                key={k}
                checked={!disabled && filter[k]}
                disabled={disabled}
                onChange={() => setFilter({ [k]: !filter[k] })}
                testId={`natal-filter-${k}`}
                note={disabled ? t("minorBasicNote") : k === "major" ? t("majorNote") : t("minorNote")}
              >
                {k === "major" ? t("major") : t("minor")}
              </CheckRow>
            );
          })}
        </div>
        <div className="border-t border-slate-100 px-1.5 py-1" role="group" aria-label={t("natureAria")}>
          <p className="px-2 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">{t("natureTitle")}</p>
          {NATURES.map((k) => (
            <CheckRow key={k} checked={filter[k]} onChange={() => setFilter({ [k]: !filter[k] })} testId={`natal-filter-${k}`}>
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: NATURE_DOT[k] }} aria-hidden="true" />
              {tt(`aspectNature.${k}`)}
            </CheckRow>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2 border-t border-slate-100 px-3.5 py-2.5 text-[13px] text-slate-700">
          <span className="font-medium">{t("focusLabel")}</span>
          <select
            value={focus ?? ""}
            onChange={(e) => setFilter({ focus: (e.target.value || null) as BodyId | null })}
            className="min-h-[34px] max-w-[11rem] rounded-md border border-slate-300 bg-white px-1.5 text-[13px] text-slate-800"
            title={t("focusTitle")}
            data-testid="natal-filter-focus"
          >
            <option value="">{t("focusAll")}</option>
            {focusable.map((id) => (
              <option key={id} value={id}>
                {tt(`body.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <MenuFoot>{t.rich("countsFoot", { total: String(counts.total), drawn: String(counts.drawn), strong: (c) => <strong className="font-semibold text-slate-700">{c}</strong> })}</MenuFoot>
      </DeskPopover>

      <p className="ml-auto shrink-0 pl-1 text-[11.5px] tabular-nums text-slate-500 max-[1535px]:sr-only" data-testid="natal-aspect-counts" aria-live="polite" title={t("countsTitle")}>
        {t.rich("counts", { total: String(counts.total), drawn: String(counts.drawn), strong: (c) => <strong className="font-semibold text-slate-700">{c}</strong> })}
        <span className="sr-only">{t("countsSr")}</span>
      </p>
    </div>
  );
}

/** Kapalı menü düğmesi: ad + kısa seçim özeti ("Ek noktalar · 3/5"). Seçim tam değilse özet vurgulanır. */
function MenuButton({
  label,
  summary,
  changed,
  open,
  onToggle,
  btnRef,
  title,
  testId,
}: {
  label: string;
  summary: string;
  changed: boolean;
  open: boolean;
  onToggle: () => void;
  btnRef: RefObject<HTMLButtonElement | null>;
  title: string;
  testId: string;
}) {
  return (
    <button
      ref={btnRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      title={title}
      className={`inline-flex min-h-[32px] min-w-0 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition max-sm:min-h-[38px] ${
        open ? "border-slate-400 bg-slate-100 text-slate-900" : changed ? "border-teal-600/50 bg-teal-50/70 text-slate-800 hover:border-teal-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
      }`}
      data-testid={testId}
    >
      <span className="font-semibold">{label}</span>
      <span className={`tabular-nums ${changed ? "font-semibold text-teal-800" : "text-slate-500"}`} data-testid={`${testId}-summary`}>
        {summary}
      </span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

function MenuHead({ title, onAll, onNone, testIdBase }: { title: string; onAll?: () => void; onNone?: () => void; testIdBase: string }) {
  const t = useTranslations("atlas.natalControls");
  const link = "rounded-md px-1.5 py-1 text-[12px] font-medium text-teal-800 hover:bg-teal-50 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
      <b className="text-[13px] font-semibold text-slate-900">{title}</b>
      <span className="flex items-center gap-0.5">
        <button type="button" className={link} onClick={onAll} disabled={!onAll} data-testid={`${testIdBase}-reset`}>
          {t("selectAll")}
        </button>
        <button type="button" className={link} onClick={onNone} disabled={!onNone} data-testid={`${testIdBase}-none`}>
          {t("clear")}
        </button>
      </span>
    </div>
  );
}

function MenuFoot({ children }: { children: ReactNode }) {
  return <p className="border-t border-slate-100 bg-slate-50/70 px-3.5 py-2 text-[11.5px] leading-snug text-slate-500">{children}</p>;
}

/** Gerçek işaretleme kutusu satırı (native checkbox: Boşluk tuşu, ekran okuyucu ve dokunma hedefi doğal). */
function CheckRow({
  checked,
  disabled = false,
  onChange,
  testId,
  note,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  testId: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-[40px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] max-sm:min-h-[46px] ${disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-800 hover:bg-slate-50"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 shrink-0 cursor-pointer accent-[#0B1430] disabled:cursor-not-allowed"
        data-testid={testId}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">{children}</span>
        {note && <span className="text-[11px] leading-snug text-slate-400">{note}</span>}
      </span>
    </label>
  );
}

/** Çark çizgi renkleriyle aynı (NatalWheel NATURE_COLOR). */
const NATURE_DOT: Record<AspectNature, string> = { harmonious: "#2563eb", challenging: "#dc2626", neutral: "#64748b" };

const POINT_GLYPH: Record<NatalOptionalPoint, string> = {
  nodes: "☊︎",
  chiron: "⚷︎",
  lilith: "⚸︎",
  vertex: "Vx",
  fortune: "⊗",
};
