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
import type { AspectNature, BodyId, NatalTechnical } from "@/lib/astrology/model/western";
import { BODY_LABELS, NATURE_LABELS } from "@/lib/astrology/labels/tr";
import {
  aspectCounts,
  availablePoints,
  DEFAULT_ASPECT_FILTER,
  extraPointsFor,
  hiddenBodiesFor,
  isDefaultAspectFilter,
  NATAL_OPTIONAL_POINT_LABELS,
  NATAL_OPTIONAL_POINTS,
  NATAL_WHEEL_MODE_LABELS,
  NATAL_WHEEL_MODES,
  parsePrefs,
  type NatalAspectFilter,
  type NatalOptionalPoint,
  type NatalPointSelection,
  type NatalWheelMode,
  type NatalWheelPrefs,
} from "@/lib/astrology/view/natalWheelDisplay";
import type { NatalWheelDisplay } from "./NatalWheel";
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
let selection = initialSelection();
let snapshot: { mode: NatalWheelMode; sel: typeof selection; value: NatalWheelPrefs } | null = null;

function readMode(): NatalWheelMode {
  if (memoryMode) return memoryMode;
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_KEY)).mode;
  } catch {
    return parsePrefs(null).mode;
  }
}

function readPrefs(): NatalWheelPrefs {
  const mode = readMode();
  if (!snapshot || snapshot.mode !== mode || snapshot.sel !== selection) snapshot = { mode, sel: selection, value: { mode, ...selection } };
  return snapshot.value;
}

const SERVER_PREFS: NatalWheelPrefs = { mode: parsePrefs(null).mode, ...initialSelection() };

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
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: next.mode }));
    } catch {
      /* depolama yok: bellekteki görünüm kullanılır */
    }
    for (const cb of listeners) cb();
  }, []);
  return [prefs, update];
}

/** Çarka verilecek görünüm katmanı (saf türetim; teknik veri değişmez). */
export function natalWheelDisplay(technical: NatalTechnical, prefs: NatalWheelPrefs): NatalWheelDisplay {
  const points = prefs.points[prefs.mode];
  return { mode: prefs.mode, hiddenBodies: hiddenBodiesFor(points), extraPoints: extraPointsFor(technical, points), aspectFilter: prefs.filter };
}

const NATURES = ["harmonious", "challenging", "neutral"] as const satisfies readonly AspectNature[];

export default function NatalChartControls({
  technical,
  prefs,
  onChange,
}: {
  technical: NatalTechnical;
  prefs: NatalWheelPrefs;
  onChange: (next: NatalWheelPrefs) => void;
}) {
  const mode = prefs.mode;
  const points = prefs.points[mode];
  const available = useMemo(() => availablePoints(technical), [technical]);
  const hidden = useMemo(() => hiddenBodiesFor(points), [points]);
  const filter = prefs.filter;
  const counts = useMemo(() => aspectCounts(technical.aspects, mode, hidden, filter), [technical.aspects, mode, hidden, filter]);
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
  const pointsSummary = availableKeys.length === 0 ? "yok" : `${onCount}/${availableKeys.length}`;

  // Açı seçenekleri: Temel görünüm küçük açı çizmez → orada seçenek pasif ve sayıma girmez.
  const flagKeys = (["major", "minor", ...NATURES] as const).filter((k) => !(k === "minor" && mode === "basic"));
  const flagOn = flagKeys.filter((k) => filter[k]).length;
  const filterDefault = isDefaultAspectFilter({ ...filter, focus });
  const filterSummary = `${flagOn}/${flagKeys.length}${focus ? ` · ${BODY_LABELS[focus]}` : ""}`;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-testid="natal-wheel-controls" data-mode={mode}>
      <div role="group" aria-label="Harita görünümü" className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {NATAL_WHEEL_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === mode}
            onClick={() => setMode(m)}
            className={`min-h-[30px] rounded-md px-2.5 text-[12.5px] font-semibold transition max-sm:min-h-[36px] ${
              m === mode ? "bg-[#0B1430] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
            title={
              m === "basic"
                ? "Sade görünüm: yalnız 10 gezegen arasındaki başlıca açılar (kavuşum, sekstil, kare, üçgen, karşıt). Hesap ve açı listesi değişmez."
                : "Ayrıntılı görünüm: listedeki bütün açı türleri, ev başlangıç dereceleri; sıkı orb'lu açılar daha kalın. Hesap değişmez."
            }
            data-testid={`natal-mode-${m}`}
          >
            {NATAL_WHEEL_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <MenuButton
        label="Ek noktalar"
        summary={pointsSummary}
        changed={availableKeys.length > 0 && onCount < availableKeys.length}
        open={menuOpen === "points"}
        onToggle={() => setMenuOpen((m) => (m === "points" ? null : "points"))}
        btnRef={pointsRef}
        title={`Haritada gösterilecek ek noktalar: ${onCount}/${availableKeys.length} seçili${missing ? ` (${missing} nokta bu haritada yok)` : ""}`}
        testId="natal-points-toggle"
      />
      <DeskPopover open={menuOpen === "points"} onClose={closeMenu} triggerRef={pointsRef} width={292} label="Ek noktalar" testId="natal-points-panel">
        <MenuHead
          title="Ek noktalar"
          onAll={availableKeys.length > 0 && onCount < availableKeys.length ? () => setPoints({ ...points, ...Object.fromEntries(availableKeys.map((k) => [k, true])) }) : undefined}
          onNone={onCount > 0 ? () => setPoints({ ...points, ...Object.fromEntries(availableKeys.map((k) => [k, false])) }) : undefined}
          testIdBase="natal-points"
        />
        <ul className="px-1.5 pb-1.5" role="group" aria-label="Haritada gösterilecek noktalar">
          {NATAL_OPTIONAL_POINTS.map((k) => {
            const ok = available[k];
            return (
              <li key={k}>
                <CheckRow
                  checked={ok && points[k]}
                  disabled={!ok}
                  onChange={() => setPoints({ ...points, [k]: !points[k] })}
                  testId={`natal-point-${k}`}
                  note={ok ? undefined : "Bu haritada yok (doğum saati bilinmiyor)"}
                >
                  <span className={`${styles.symbol} w-5 shrink-0 text-center text-slate-500`} aria-hidden="true">
                    {POINT_GLYPH[k]}
                  </span>
                  {NATAL_OPTIONAL_POINT_LABELS[k]}
                </CheckRow>
              </li>
            );
          })}
        </ul>
        <MenuFoot>Yalnız çizim değişir; hesap ve kayıt değişmez.</MenuFoot>
      </DeskPopover>

      <MenuButton
        label="Açı çizgileri"
        summary={filterSummary}
        changed={!filterDefault}
        open={menuOpen === "filter"}
        onToggle={() => setMenuOpen((m) => (m === "filter" ? null : "filter"))}
        btnRef={filterRef}
        title={`Çarkta çizilen açılar: ${flagOn}/${flagKeys.length} seçenek seçili${focus ? ` · yalnız ${BODY_LABELS[focus]}` : " · tüm gövdeler"}`}
        testId="natal-filter-toggle"
      />
      <DeskPopover open={menuOpen === "filter"} onClose={closeMenu} triggerRef={filterRef} width={300} label="Açı çizgileri" testId="natal-aspect-filter">
        <MenuHead
          title="Açı çizgileri"
          onAll={!filterDefault ? () => onChange({ ...prefs, filter: { ...DEFAULT_ASPECT_FILTER } }) : undefined}
          onNone={flagOn > 0 ? () => setFilter({ major: false, minor: false, harmonious: false, challenging: false, neutral: false }) : undefined}
          testIdBase="natal-filter"
        />
        <div className="px-1.5 pb-1" role="group" aria-label="Açı grubu">
          <p className="px-2 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Açı grubu</p>
          {(["major", "minor"] as const).map((k) => {
            const disabled = k === "minor" && mode === "basic";
            return (
              <CheckRow
                key={k}
                checked={!disabled && filter[k]}
                disabled={disabled}
                onChange={() => setFilter({ [k]: !filter[k] })}
                testId={`natal-filter-${k}`}
                note={disabled ? "Temel görünümde çizilmez — Profesyonel'e geçin" : k === "major" ? "Kavuşum, sekstil, kare, üçgen, karşıt" : "Yarım sekstil, yarım kare, seskikare, kuinkunks"}
              >
                {k === "major" ? "Başlıca açılar" : "Küçük açılar"}
              </CheckRow>
            );
          })}
        </div>
        <div className="border-t border-slate-100 px-1.5 py-1" role="group" aria-label="Açı niteliği">
          <p className="px-2 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Nitelik</p>
          {NATURES.map((k) => (
            <CheckRow key={k} checked={filter[k]} onChange={() => setFilter({ [k]: !filter[k] })} testId={`natal-filter-${k}`}>
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: NATURE_DOT[k] }} aria-hidden="true" />
              {NATURE_LABELS[k]}
            </CheckRow>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2 border-t border-slate-100 px-3.5 py-2.5 text-[13px] text-slate-700">
          <span className="font-medium">Gövde odağı</span>
          <select
            value={focus ?? ""}
            onChange={(e) => setFilter({ focus: (e.target.value || null) as BodyId | null })}
            className="min-h-[34px] max-w-[11rem] rounded-md border border-slate-300 bg-white px-1.5 text-[13px] text-slate-800"
            title="Yalnız seçilen gezegenin / noktanın açı çizgilerini göster"
            data-testid="natal-filter-focus"
          >
            <option value="">Tüm gövdeler</option>
            {focusable.map((id) => (
              <option key={id} value={id}>
                {BODY_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <MenuFoot>
          Açı listesi: <strong className="font-semibold text-slate-700">{counts.total}</strong> · çarkta çizili: <strong className="font-semibold text-slate-700">{counts.drawn}</strong>. Liste ve orb
          değişmez; tüm açılar Açılar bölümünde.
        </MenuFoot>
      </DeskPopover>

      <p className="ml-auto shrink-0 pl-1 text-[11.5px] tabular-nums text-slate-500 max-[1535px]:sr-only" data-testid="natal-aspect-counts" aria-live="polite" title="Açı listesindeki toplam açı / çarkta çizilen açı">
        Açı listesi: <strong className="font-semibold text-slate-700">{counts.total}</strong> · çarkta çizili:{" "}
        <strong className="font-semibold text-slate-700">{counts.drawn}</strong>
        <span className="sr-only"> (kavuşumlar yakın noktalar olduğundan çizgi olarak görünmeyebilir; tüm liste Açılar bölümünde)</span>
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
  const link = "rounded-md px-1.5 py-1 text-[12px] font-medium text-teal-800 hover:bg-teal-50 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
      <b className="text-[13px] font-semibold text-slate-900">{title}</b>
      <span className="flex items-center gap-0.5">
        <button type="button" className={link} onClick={onAll} disabled={!onAll} data-testid={`${testIdBase}-reset`}>
          Tümünü seç
        </button>
        <button type="button" className={link} onClick={onNone} disabled={!onNone} data-testid={`${testIdBase}-none`}>
          Temizle
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
