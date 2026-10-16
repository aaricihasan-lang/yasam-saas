"use client";

/**
 * Yaşam Sistemi'nin KENDİ dünya haritası (SVG, eşdikdörtgen). Harita servisi / API anahtarı / ücretli
 * bağımlılık YOK. Kara ve sınırlar: Natural Earth 1:110m (kamu malı) — yalnız harita açılınca yüklenir.
 * Çizgiler yalnız sağlayıcının teknik koordinatlarından üretilir. İpucu (tooltip) TEKNİK bilgidir;
 * sağlayıcı yorumu burada GÖSTERİLMEZ (ayrı panel).
 */

import { useEffect, useMemo, useState } from "react";
import { MAP_H, MAP_W, packedToPath, project } from "../_lib/geo";

import type { MapLabel, MapLine, MapMarker } from "../_lib/locationMaps";
export type { MapLabel, MapLine, MapMarker } from "../_lib/locationMaps";

type Base = { land: string[]; borders: string[] };

let baseCache: Base | null = null;
async function loadBase(): Promise<Base> {
  if (baseCache) return baseCache;
  const m = await import("../_lib/worldMap110m");
  baseCache = { land: m.WORLD_LAND_RINGS.map((r) => packedToPath(r, true)), borders: m.WORLD_BORDER_LINES.map((r) => packedToPath(r, false)) };
  return baseCache;
}

const GRATICULE = (() => {
  const d: string[] = [];
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = project(0, lon);
    d.push(`M${x},0L${x},${MAP_H}`);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = project(lat, 0);
    d.push(`M0,${y}L${MAP_W},${y}`);
  }
  return d.join("");
})();

export default function WorldMap({
  lines,
  markers = [],
  labels = [],
  ariaLabel,
  focus,
}: {
  lines: MapLine[];
  markers?: MapMarker[];
  labels?: MapLabel[];
  ariaLabel: string;
  /** İsteğe bağlı görünüm penceresi (enlem/boylam kutusu) — local space için referans çevresi. */
  focus?: { latMin: number; latMax: number; lonMin: number; lonMax: number } | null;
}) {
  const [base, setBase] = useState<Base | null>(baseCache);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => {
    if (base) return;
    let alive = true;
    void loadBase().then((b) => {
      if (alive) setBase(b);
    });
    return () => {
      alive = false;
    };
  }, [base]);

  const viewBox = useMemo(() => {
    if (!focus) return `0 0 ${MAP_W} ${MAP_H}`;
    const [x1, y1] = project(focus.latMax, focus.lonMin);
    const [x2, y2] = project(focus.latMin, focus.lonMax);
    return `${Math.max(0, x1)} ${Math.max(0, y1)} ${Math.min(MAP_W, x2) - Math.max(0, x1)} ${Math.min(MAP_H, y2) - Math.max(0, y1)}`;
  }, [focus]);

  const activeKey = pinned ?? hover;
  const active = lines.find((l) => l.key === activeKey) ?? null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-sky-50">
        <svg viewBox={viewBox} role="img" aria-label={ariaLabel} className="block h-auto w-full select-none" preserveAspectRatio="xMidYMid meet">
          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#eff6ff" />
          <path d={GRATICULE} stroke="#cbd5e1" strokeWidth={0.5} fill="none" />
          {base ? (
            <>
              {base.land.map((d, i) => (
                <path key={`l${i}`} d={d} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.5} />
              ))}
              {base.borders.map((d, i) => (
                <path key={`b${i}`} d={d} fill="none" stroke="#cbd5e1" strokeWidth={0.4} />
              ))}
            </>
          ) : (
            <text x={MAP_W / 2} y={MAP_H / 2} textAnchor="middle" fontSize={14} fill="#64748b">
              Harita yükleniyor…
            </text>
          )}
          {lines.map((l) => (
            <g key={l.key}>
              <path
                d={l.d}
                fill="none"
                stroke={l.color}
                strokeWidth={(l.width ?? 1.4) * (activeKey === l.key ? 2 : 1)}
                strokeDasharray={l.dash}
                opacity={activeKey && activeKey !== l.key ? 0.35 : 0.95}
              />
              {/* Geniş, görünmez dokunma alanı (mobil uyumlu). */}
              <path
                d={l.d}
                fill="none"
                stroke="transparent"
                strokeWidth={10}
                style={{ cursor: "pointer" }}
                data-line={l.key}
                onMouseEnter={() => setHover(l.key)}
                onMouseLeave={() => setHover((h) => (h === l.key ? null : h))}
                onClick={() => setPinned((p) => (p === l.key ? null : l.key))}
              >
                <title>{l.label}</title>
              </path>
            </g>
          ))}
          {labels.map((t) => (
            <text key={t.key} x={t.x} y={t.y} fontSize={9} fontWeight={700} fill={t.color} textAnchor="middle" paintOrder="stroke" stroke="#ffffff" strokeWidth={2}>
              {t.text}
            </text>
          ))}
          {markers.map((m) => {
            const [x, y] = project(m.lat, m.lon);
            return (
              <g key={m.key}>
                <circle cx={x} cy={y} r={4} fill={m.color ?? "#0f172a"} stroke="#ffffff" strokeWidth={1.5} />
                <text x={x + 6} y={y - 6} fontSize={10} fontWeight={700} fill="#0f172a" paintOrder="stroke" stroke="#ffffff" strokeWidth={2.5}>
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {lines.length > 0 && (
      <div className="min-h-[3rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" aria-live="polite" data-testid="astro-map-tooltip">
        {active ? (
          <>
            <div className="font-semibold text-slate-900">
              {active.label} {pinned === active.key && <span className="ml-1 text-[10px] font-normal text-sky-700">(sabitlendi — tekrar tıklayınca kalkar)</span>}
            </div>
            {active.detail.map((x) => (
              <div key={x}>{x}</div>
            ))}
          </>
        ) : (
          <span className="text-slate-400">Bir hattın üzerine gelin veya dokunun: gezegen, açı ve teknik bilgi burada görünür (teknik veridir, yorum değildir).</span>
        )}
      </div>
      )}
      <p className="text-[10px] text-slate-400">Harita verisi: Natural Earth 1:110m (kamu malı). Eşdikdörtgen projeksiyon.</p>
    </div>
  );
}
