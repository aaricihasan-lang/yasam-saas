"use client";

// HD doğum yeri seçici (otomatik hesaplama için).
//
// Silinmiş FAZ 8A `LocationPicker.tsx`'in (6425ab0c) güncel eşdeğeri — mevcut konum altyapısı:
//   • Türkiye: TR_LOCATIONS (81 il) istemcide, anında
//   • Dünya: /api/location/search (GeoNames, server-only dataset) ≥2 karakter, debounce
// Bileşen yalnız SEÇİLEN konumun kimliğini/etiketini bildirir. Saat dilimi ve koordinat
// SUNUCUDA bu kimlikten yeniden çözülür (istemci tz'sine güvenilmez). Serbest metin
// seçim sayılmaz → seçim yapılmadan hesaplama yapılamaz.

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { searchLocations, type Location } from "@/lib/location";
import { TR_LOCATIONS } from "@/lib/location/tr";

export type HdPickedLocation = { id: string; label: string; tz: string };

const inputCls =
  "h-9 w-full rounded-xl border border-indigo-200/90 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";

function labelOf(l: Location): string {
  const region = l.adminRegion && l.adminRegion !== l.name ? `${l.adminRegion}, ` : "";
  return `${l.name}, ${region}${l.country}`;
}

export function HdBirthLocationPicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: HdPickedLocation | null;
  onChange: (loc: HdPickedLocation | null) => void;
  disabled?: boolean;
}) {
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const [query, setQuery] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  // Dışarıdan gelen seçim (ör. önceki hesaptan ön-doldurma) metni günceller.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dış seçim → görünen metin senkronu
    if (value) setQuery(value.label);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const my = ++seq.current;
    const tr = q ? searchLocations(q, { dataset: TR_LOCATIONS, limit: 8 }) : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TR sonuçları anında
    setResults(tr);
    if (q.length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/location/search?q=${encodeURIComponent(q)}&limit=8`, { signal: ac.signal })
        .then((r) => r.json())
        .then((j: { ok?: boolean; results?: Location[] }) => {
          if (my !== seq.current) return;
          const world = j.ok && Array.isArray(j.results) ? j.results : [];
          setResults([...tr, ...world].slice(0, 12));
        })
        .catch(() => undefined)
        .finally(() => {
          if (my === seq.current) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, open]);

  function choose(l: Location) {
    const picked = { id: l.id, label: labelOf(l), tz: l.tz };
    onChange(picked);
    setQuery(picked.label);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && active >= 0 && active < results.length) {
      e.preventDefault();
      choose(results[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listboxId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder="Şehir ara… (ör. Konya, Berlin)"
        className={`${inputCls} disabled:opacity-60`}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
          // Metin değişti → önceki seçim geçersiz (serbest metin timezone kabul edilmez).
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-indigo-200 bg-white py-1 shadow-lg"
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {results.map((l, i) => (
            <li
              key={l.id}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                i === active ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-indigo-50/60"
              }`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(l)}
            >
              <span className="min-w-0 truncate font-medium">{labelOf(l)}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{l.tz}</span>
            </li>
          ))}
        </ul>
      ) : open && query.trim().length >= 2 && !searching ? (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-500 shadow-lg">
          Şehir bulunamadı. Daha bilinen yakın bir şehir deneyin.
        </div>
      ) : null}
    </div>
  );
}
