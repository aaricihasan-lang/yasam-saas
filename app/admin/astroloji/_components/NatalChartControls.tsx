"use client";

/**
 * Natal çark görünüm denetimi (2026-11-04) — YALNIZ Natal sonuç / kayıtlı Natal ekranı.
 *
 *   • Temel / Profesyonel: tek dokunuşla geçiş. AYNI teknik veri; hesap yeniden çalışmaz, sağlayıcı isteği / kredi /
 *     kayıt değişikliği YOK (yalnız çizim seçimi; bkz. lib/astrology/view/natalWheelDisplay).
 *   • İsteğe bağlı noktalar (Ay Düğümleri, Kiron, Lilith, Vertex, Şans Noktası) kullanıcı seçer; haritada bulunmayan nokta
 *     (ör. saat bilinmiyorsa Vertex / Şans Noktası) pasif gösterilir — sahte konum çizilmez.
 *   • Açı listesi sayısı ile çarkta çizilen açı sayısı AYRI yazılır.
 *   • Tercih yalnız bu tarayıcıda (localStorage; erişilemezse varsayılan) — kayıt, rapor ve Word/PDF'i etkilemez.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import {
  aspectCounts,
  availablePoints,
  DEFAULT_PREFS,
  extraPointsFor,
  hiddenBodiesFor,
  NATAL_OPTIONAL_POINT_LABELS,
  NATAL_OPTIONAL_POINTS,
  NATAL_WHEEL_MODE_LABELS,
  NATAL_WHEEL_MODES,
  parsePrefs,
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
  return { mode: prefs.mode, hiddenBodies: hiddenBodiesFor(points), extraPoints: extraPointsFor(technical, points) };
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
  const counts = useMemo(() => aspectCounts(technical.aspects, mode, hiddenBodiesFor(points)), [technical.aspects, mode, points]);

  const setMode = (m: NatalWheelMode) => {
    if (m !== mode) onChange({ ...prefs, mode: m });
  };
  const toggle = (k: NatalOptionalPoint) => {
    onChange({ ...prefs, points: { ...prefs.points, [mode]: { ...points, [k]: !points[k] } } });
  };

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

      <p className="ml-auto text-xs tabular-nums text-slate-500 max-sm:ml-0 max-sm:w-full" data-testid="natal-aspect-counts" aria-live="polite">
        Açı listesi: <strong className="font-semibold text-slate-700">{counts.total}</strong> · çarkta çizili:{" "}
        <strong className="font-semibold text-slate-700">{counts.drawn}</strong>
        <span className="sr-only"> (kavuşumlar yakın noktalar olduğundan çizgi olarak görünmeyebilir; tüm liste Açılar sekmesinde)</span>
      </p>
    </div>
  );
}

const POINT_GLYPH: Record<NatalOptionalPoint, string> = {
  nodes: "☊︎",
  chiron: "⚷︎",
  lilith: "⚸︎",
  vertex: "Vx",
  fortune: "⊗",
};
