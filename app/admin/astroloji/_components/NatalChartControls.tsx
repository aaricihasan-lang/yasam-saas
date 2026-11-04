"use client";

/**
 * Natal çark görünüm denetimi (2026-11-04) — YALNIZ Natal sonuç / kayıtlı Natal ekranı.
 *
 *   • Temel / Profesyonel: tek dokunuşla geçiş. AYNI teknik veri; hesap yeniden çalışmaz, sağlayıcı isteği / kredi /
 *     kayıt değişikliği YOK (yalnız çizim seçimi; bkz. lib/astrology/view/natalWheelDisplay).
 *   • İsteğe bağlı noktalar (Ay Düğümleri, Kiron, Lilith, Vertex, Şans Noktası) kullanıcı seçer; haritada bulunmayan nokta
 *     (ör. saat bilinmiyorsa Vertex / Şans Noktası) pasif gösterilir — sahte konum çizilmez.
 *   • Açı çizgisi filtresi: başlıca / küçük açılar, nitelik (uyumlu / zorlayıcı / nötr) ve tek gövde odağı ("Güneş'in
 *     açıları"). Yalnız çizim süzülür; açı listesi, orb ve sayım kuralı değişmez.
 *   • Açı listesi sayısı ile çarkta çizilen açı sayısı AYRI yazılır.
 *   • Tercih yalnız bu tarayıcıda (localStorage; erişilemezse varsayılan) — kayıt, rapor ve Word/PDF'i etkilemez.
 */

import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { AspectNature, BodyId, NatalTechnical } from "@/lib/astrology/model/western";
import { BODY_LABELS, NATURE_LABELS } from "@/lib/astrology/labels/tr";
import {
  aspectCounts,
  availablePoints,
  DEFAULT_ASPECT_FILTER,
  DEFAULT_PREFS,
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
  type NatalWheelMode,
  type NatalWheelPrefs,
} from "@/lib/astrology/view/natalWheelDisplay";
import type { NatalWheelDisplay } from "./NatalWheel";
import styles from "./natalWheel.module.css";

const PREFS_KEY = "atlas.natalWheel.v1";

/** Görünüm tercihi (yalnız bu tarayıcı). Sunucu ve ilk çizim varsayılanı kullanır; localStorage erişilemezse (özel pencere,
 *  engelli depolama) tercih yalnız bu sayfa oturumunda bellekte kalır. */
const listeners = new Set<() => void>();
let memoryRaw: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PREFS_KEY) ?? memoryRaw;
  } catch {
    return memoryRaw;
  }
}

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
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const prefs = useMemo(() => (raw ? parsePrefs(raw) : DEFAULT_PREFS), [raw]);
  const update = useCallback((next: NatalWheelPrefs) => {
    const v = JSON.stringify(next);
    memoryRaw = v;
    try {
      window.localStorage.setItem(PREFS_KEY, v);
    } catch {
      /* depolama yok: bellekteki değer kullanılır */
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
  const toggle = (k: NatalOptionalPoint) => {
    onChange({ ...prefs, points: { ...prefs.points, [mode]: { ...points, [k]: !points[k] } } });
  };
  const setFilter = (next: Partial<NatalAspectFilter>) => onChange({ ...prefs, filter: { ...filter, ...next } });

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-sm:rounded-none max-sm:border-x-0"
      data-testid="natal-wheel-controls"
      data-mode={mode}
    >
      <div role="group" aria-label="Harita görünümü" className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5">
        {NATAL_WHEEL_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === mode}
            onClick={() => setMode(m)}
            className={`min-h-[36px] rounded-md px-3 text-sm font-semibold transition ${
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

      <div role="group" aria-label="Haritada gösterilecek noktalar" className="flex flex-wrap items-center gap-1.5">
        {NATAL_OPTIONAL_POINTS.map((k) => {
          const ok = available[k];
          const on = ok && points[k];
          return (
            <button
              key={k}
              type="button"
              role="switch"
              aria-checked={on}
              disabled={!ok}
              onClick={() => toggle(k)}
              title={ok ? `${NATAL_OPTIONAL_POINT_LABELS[k]} çarkta ${on ? "gösteriliyor" : "gizli"}` : `${NATAL_OPTIONAL_POINT_LABELS[k]} bu haritada yok (ör. doğum saati bilinmiyor)`}
              className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition ${
                !ok
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 line-through"
                  : on
                    ? "border-teal-600 bg-teal-50 text-teal-900"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-500"
              }`}
              data-testid={`natal-point-${k}`}
            >
              <span className={styles.symbol} aria-hidden="true">
                {POINT_GLYPH[k]}
              </span>
              {NATAL_OPTIONAL_POINT_LABELS[k]}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Çarkta çizilen açılar" className="flex w-full flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2" data-testid="natal-aspect-filter">
        <span className="mr-0.5 text-xs font-semibold text-slate-500">Açı çizgileri</span>
        {(["major", "minor"] as const).map((k) => {
          const disabled = k === "minor" && mode === "basic";
          const on = !disabled && filter[k];
          return (
            <FilterChip
              key={k}
              on={on}
              disabled={disabled}
              onClick={() => setFilter({ [k]: !filter[k] })}
              title={
                disabled
                  ? "Temel görünüm yalnız başlıca açıları çizer; küçük açılar için Profesyonel'e geçin"
                  : k === "major"
                    ? "Başlıca açılar: kavuşum, sekstil, kare, üçgen, karşıt (düz çizgi)"
                    : "Küçük açılar: yarım sekstil, yarım kare, seskikare, kuinkunks (kesik çizgi)"
              }
              testId={`natal-filter-${k}`}
            >
              {k === "major" ? "Başlıca" : "Küçük"}
            </FilterChip>
          );
        })}
        <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
        {(["harmonious", "challenging", "neutral"] as const satisfies readonly AspectNature[]).map((k) => (
          <FilterChip
            key={k}
            on={filter[k]}
            onClick={() => setFilter({ [k]: !filter[k] })}
            title={`${NATURE_LABELS[k]} açılar çarkta ${filter[k] ? "gösteriliyor" : "gizli"} (nitelik hesaplama kaynağından; liste değişmez)`}
            testId={`natal-filter-${k}`}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: NATURE_DOT[k] }} aria-hidden="true" />
            {NATURE_LABELS[k]}
          </FilterChip>
        ))}
        <label className="ml-1 inline-flex items-center gap-1 text-xs text-slate-600">
          <span>Odak</span>
          <select
            value={focus ?? ""}
            onChange={(e) => setFilter({ focus: (e.target.value || null) as BodyId | null })}
            className="min-h-[32px] max-w-[11rem] rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-800"
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
        {!isDefaultAspectFilter({ ...filter, focus }) && (
          <button
            type="button"
            onClick={() => onChange({ ...prefs, filter: { ...DEFAULT_ASPECT_FILTER } })}
            className="min-h-[32px] rounded-md px-2 text-xs font-medium text-teal-800 underline-offset-2 hover:underline"
            data-testid="natal-filter-reset"
          >
            Tümünü göster
          </button>
        )}
      </div>

      <p className="ml-auto text-xs tabular-nums text-slate-500 max-sm:ml-0 max-sm:w-full" data-testid="natal-aspect-counts" aria-live="polite">
        Açı listesi: <strong className="font-semibold text-slate-700">{counts.total}</strong> · çarkta çizili:{" "}
        <strong className="font-semibold text-slate-700">{counts.drawn}</strong>
        <span className="sr-only"> (kavuşumlar yakın noktalar olduğundan çizgi olarak görünmeyebilir; tüm liste Açılar sekmesinde)</span>
      </p>
    </div>
  );
}

/** Çark çizgi renkleriyle aynı (NatalWheel NATURE_COLOR). */
const NATURE_DOT: Record<AspectNature, string> = { harmonious: "#2563eb", challenging: "#dc2626", neutral: "#64748b" };

function FilterChip({
  on,
  disabled = false,
  onClick,
  title,
  testId,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
          : on
            ? "border-slate-500 bg-slate-100 text-slate-900"
            : "border-slate-200 bg-white text-slate-400 line-through hover:border-slate-400"
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

const POINT_GLYPH: Record<NatalOptionalPoint, string> = {
  nodes: "☊︎",
  chiron: "⚷︎",
  lilith: "⚸︎",
  vertex: "Vx",
  fortune: "⊗",
};
