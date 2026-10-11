"use client";

/**
 * Doğum yeri seçici — yalnız konum KİMLİĞİ seçilir; tz/koordinat sunucuda çözülür.
 * Kaynaklar: Türkiye 81 il (yerel veri) + Türkiye 973 resmî ilçe (D4: Human Design'ın derlenmiş ilçe dizini,
 * istemcide KOORDİNATSIZ; koordinat sunucuda) + /api/location/search (sunucu GeoNames veri seti, nüfus > 15.000;
 * dış API yok, ücretli çağrı yok).
 * Türkiye için iki yol: arama ("Erdek", "Karesi Balıkesir") veya Ülke → İl → İlçe seçimi. Yurt dışı: ülke / eyalet /
 * şehir araması (her ülkenin idari yapısına Türkiye hiyerarşisi zorlanmaz).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { normalizeLocationQuery } from "@/lib/location";
import { searchTrDistricts, isTrDistrictProxy } from "@/lib/human-design/location/trDistrictIndex";
import { TR_DISTRICT_ROWS } from "@/lib/human-design/location/trDistrictIndex.generated";

export type PickedLocation = { id: string; label: string };

type Loc = { id: string; name: string; adminRegion: string; country: string };

function labelOf(l: Loc): string {
  const region = l.adminRegion && l.adminRegion !== l.name ? `${l.adminRegion}, ` : "";
  return `${l.name}, ${region}${l.country}`;
}

const IL_SORTED = [...TR_LOCATIONS].sort((a, b) => a.name.localeCompare(b.name, "tr"));
const PROXY_NOTE = "Bu ilçenin merkez koordinatı doğrulanamadı; hesapta il merkezi koordinatı kullanılır (yükselen/MC ve evler birkaç dakika farklı olabilir).";

export default function LocationPicker({ value, onChange }: { value: PickedLocation | null; onChange: (v: PickedLocation | null) => void }) {
  const [q, setQ] = useState("");
  const [global, setGlobal] = useState<{ q: string; results: Loc[] } | null>(null);
  const [mode, setMode] = useState<"search" | "tr">("search");
  const [il, setIl] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trMatches = useMemo(() => {
    const n = normalizeLocationQuery(q);
    if (n.length < 2) return [];
    return TR_LOCATIONS.filter((l) => normalizeLocationQuery(l.name).startsWith(n)).slice(0, 6);
  }, [q]);
  const districtMatches = useMemo(() => searchTrDistricts(q, 8), [q]);
  const ilDistricts = useMemo(() => (il ? TR_DISTRICT_ROWS.filter((r) => r[2] === il).sort((a, b) => a[1].localeCompare(b[1], "tr")) : []), [il]);

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
    const proxy = isTrDistrictProxy(value.id);
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="text-emerald-900">{value.label}</span>
          <button type="button" className="text-xs text-emerald-700 underline" onClick={() => onChange(null)}>
            Değiştir
          </button>
        </div>
        {proxy && <p className="text-[11px] text-amber-800" data-testid="astro-location-proxy-note">{PROXY_NOTE}</p>}
      </div>
    );
  }

  // Sıra: Türkiye ilçeleri → Türkiye illeri → yurt dışı (GeoNames). Aynı kimlik bir kez.
  type Opt = { id: string; label: string; hint?: string };
  const options: Opt[] = [
    ...districtMatches.map((d) => ({ id: d.id, label: d.label, hint: d.proxy ? "il merkezi koordinatı" : "ilçe" })),
    ...trMatches.map((l) => ({ id: l.id, label: labelOf(l), hint: "il merkezi" })),
    ...globalResults.filter((g) => !trMatches.some((t) => t.id === g.id)).map((g) => ({ id: g.id, label: labelOf(g) })),
  ];

  return (
    <div className="flex flex-col gap-1.5" data-testid="astro-location-picker">
      <div className="flex rounded-lg border border-slate-300 p-0.5 text-xs" role="group" aria-label="Konum seçme yöntemi">
        <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")} className={`flex-1 rounded-md px-2 py-1 ${mode === "search" ? "bg-slate-800 text-white" : "text-slate-600"}`}>
          Ara (Türkiye + yurt dışı)
        </button>
        <button type="button" aria-pressed={mode === "tr"} onClick={() => setMode("tr")} className={`flex-1 rounded-md px-2 py-1 ${mode === "tr" ? "bg-slate-800 text-white" : "text-slate-600"}`} data-testid="astro-location-mode-tr">
          Türkiye → İl → İlçe
        </button>
      </div>
      {mode === "tr" ? (
        <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
          <select value={il} onChange={(e) => setIl(e.target.value)} aria-label="İl" className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" data-testid="astro-location-il">
            <option value="">İl seçin</option>
            {IL_SORTED.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            value=""
            disabled={!il}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v.startsWith("trd-")) {
                const r = ilDistricts.find((x) => x[0] === v);
                if (r) onChange({ id: r[0], label: `${r[1]}, ${r[2]}, Türkiye` });
              } else {
                const l = TR_LOCATIONS.find((x) => x.id === v);
                if (l) onChange({ id: l.id, label: labelOf(l) });
              }
            }}
            aria-label="İlçe"
            className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100"
            data-testid="astro-location-ilce"
          >
            <option value="">{il ? `İlçe seçin (${ilDistricts.length})` : "Önce il seçin"}</option>
            {il && (
              <option value={TR_LOCATIONS.find((x) => x.name === il)?.id ?? ""}>
                {il} — il merkezi
              </option>
            )}
            {ilDistricts.map((r) => (
              <option key={r[0]} value={r[0]}>
                {r[1]}
                {r[3] === 1 ? " (il merkezi koordinatı)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İlçe, il veya şehir ara (ör. Erdek, Berlin)…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
            aria-label="Doğum yeri ara"
          />
          {options.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm">
              {options.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-sky-50"
                    onClick={() => {
                      onChange({ id: l.id, label: l.label });
                      setQ("");
                    }}
                  >
                    <span>{l.label}</span>
                    {l.hint && <span className="shrink-0 text-[10.5px] text-slate-400">{l.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {qq.length >= 2 && options.length === 0 && global?.q === qq && (
            <p className="text-[11px] text-slate-500">Sonuç yok. Yurt dışı veri seti nüfusu 15.000&apos;i aşan yerleşimleri kapsar; en yakın büyük yerleşimi veya bağlı olduğu şehri seçin.</p>
          )}
        </>
      )}
    </div>
  );
}
