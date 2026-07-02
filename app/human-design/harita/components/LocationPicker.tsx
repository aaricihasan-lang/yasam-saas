"use client";

// FAZ 8A — Human Design doğum yeri seçici (izole, saf sunum bileşeni).
//
// lib/location.searchLocations üstünde Türkçe-güvenli typeahead. Bileşen:
//   • timezone SET ETMEZ — yalnız seçilen Location'ı onSelect ile döndürür
//     (parent, loc.tz ile kendi timezone state'ini doldurur).
//   • parent state yönetmez — kendi `query` durumunu içeride tutar (uncontrolled).
//   • seçim yapılmazsa serbest metin input'ta kalır → parent manuel tz fallback'i devrede.
//
// Engine / compute / API / golden'a DOKUNMAZ. Salt UI; astronomy-engine bağımlılığı yok.

import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { searchLocations, type Location } from "@/lib/location";

// HD form diline (indigo) uyumlu input.
const inputCls =
  "w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200";

export function LocationPicker({
  dataset,
  onSelect,
  value = null,
  id,
  placeholder = "Şehir ara… (ör. Konya, Berlin)",
  limit = 8,
}: {
  /** Aranacak konum kümesi (çağıran verir; ör. TR 81 il + global seed). */
  dataset: ReadonlyArray<Location>;
  /** Seçim geri çağrısı — parent tz'yi loc.tz ile doldurur. */
  onSelect: (loc: Location) => void;
  /** İsteğe bağlı başlangıç seçimi (yalnız ilk görünen metin). */
  value?: Location | null;
  /** Parent'ın <label htmlFor> ile ilişkilendirmesi için input id'si. */
  id?: string;
  placeholder?: string;
  limit?: number;
}) {
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(
    () => (open ? searchLocations(query, { dataset, limit }) : []),
    [open, query, dataset, limit],
  );

  function choose(loc: Location) {
    onSelect(loc);
    setQuery(loc.name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (active >= 0 && active < results.length) {
        e.preventDefault();
        choose(results[active]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const showEmpty = open && query.trim().length > 0 && results.length === 0;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        className={inputCls}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />

      {open && results.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-indigo-200 bg-white py-1 shadow-lg"
          // Tıklama, input blur'ından önce seçim yapabilsin (blur kapanışını iptal et).
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {results.map((loc, i) => {
            const selected = i === active;
            const region = loc.adminRegion && loc.adminRegion !== loc.name ? `${loc.adminRegion}, ` : "";
            return (
              <li
                key={loc.id}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                  selected ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-indigo-50/60"
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(loc)}
              >
                <span className="min-w-0 truncate font-medium">
                  {loc.name}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    {region}
                    {loc.country}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {loc.tz}
                </span>
              </li>
            );
          })}
        </ul>
      ) : showEmpty ? (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-500 shadow-lg">
          Şehir bulunamadı — saat dilimini aşağıdan elle seçebilirsiniz.
        </div>
      ) : null}
    </div>
  );
}
