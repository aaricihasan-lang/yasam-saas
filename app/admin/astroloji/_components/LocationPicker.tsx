"use client";

/**
 * Doğum yeri seçici — yalnız konum KİMLİĞİ seçilir; tz/koordinat sunucuda çözülür.
 * Kaynaklar: Türkiye 81 il (yerel veri) + /api/location/search (sunucu GeoNames veri seti;
 * dış API yok, ücretli çağrı yok).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { normalizeLocationQuery } from "@/lib/location";

export type PickedLocation = { id: string; label: string };

type Loc = { id: string; name: string; adminRegion: string; country: string };

function labelOf(l: Loc): string {
  const region = l.adminRegion && l.adminRegion !== l.name ? `${l.adminRegion}, ` : "";
  return `${l.name}, ${region}${l.country}`;
}

export default function LocationPicker({ value, onChange }: { value: PickedLocation | null; onChange: (v: PickedLocation | null) => void }) {
  const [q, setQ] = useState("");
  const [global, setGlobal] = useState<{ q: string; results: Loc[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trMatches = useMemo(() => {
    const n = normalizeLocationQuery(q);
    if (n.length < 2) return [];
    return TR_LOCATIONS.filter((l) => normalizeLocationQuery(l.name).startsWith(n)).slice(0, 8);
  }, [q]);

  const qq = q.trim();
  useEffect(() => {
    if (qq.length < 2) return;
    let alive = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/location/search?q=${encodeURIComponent(qq)}&limit=8`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (alive) setGlobal({ q: qq, results: Array.isArray(j?.results) ? (j.results as Loc[]) : [] });
        })
        .catch(() => {
          if (alive) setGlobal({ q: qq, results: [] });
        });
    }, 250);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qq]);
  const globalResults = global && global.q === qq && qq.length >= 2 ? global.results : [];

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <span className="text-emerald-900">{value.label}</span>
        <button type="button" className="text-xs text-emerald-700 underline" onClick={() => onChange(null)}>
          Değiştir
        </button>
      </div>
    );
  }

  const options: Loc[] = [...trMatches, ...globalResults.filter((g) => !trMatches.some((t) => t.id === g.id))];
  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Şehir ara (ör. İzmir, Berlin)…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400"
        aria-label="Doğum yeri ara"
      />
      {options.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm">
          {options.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-violet-50"
                onClick={() => {
                  onChange({ id: l.id, label: labelOf(l) });
                  setQ("");
                }}
              >
                {labelOf(l)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
