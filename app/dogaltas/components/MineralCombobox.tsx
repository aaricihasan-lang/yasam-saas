"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { rankMineralOptions } from "@/lib/dogaltas/mineralCombination";

type MineralComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** Mineral adı → onu içeren taş sayısı (rozet için). */
  counts: Map<string, number>;
  placeholder?: string;
  className?: string;
  /** Dropdown öğesi ikonu (arama türüne göre). Varsayılan 🧪. */
  icon?: string;
};

/**
 * Mineral seçimi için Türkçe-duyarsız, kelime-başı öncelikli arama dropdown'ı.
 *
 * Native <datalist> yerine kullanılır çünkü:
 *   • Türkçe normalize (silisyum = silisyüm = SİLİSYUM)
 *   • Kelime başı eşleşmeleri en üstte
 *   • Her mineral için "X taş" bilgisi
 *
 * Serbest metin girişi korunur — listede olmayan mineral de yazılabilir.
 */
export function MineralCombobox({
  value,
  onChange,
  options,
  counts,
  placeholder,
  className,
  icon = "🧪",
}: MineralComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const t = useTranslations("stones.mineralCombo");

  const ranked = useMemo(
    () => rankMineralOptions(options, counts, value, 60),
    [options, counts, value],
  );

  // Dışarı tıklayınca kapan.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Liste değişince vurguyu başa al.
  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  function commit(name: string) {
    onChange(name);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, ranked.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      if (open && ranked[highlight]) {
        event.preventDefault();
        commit(ranked[highlight].name);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  }

  // Vurgulanan öğeyi görünür tut.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
      />

      {open && ranked.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border-2 border-emerald-300/60 bg-white py-1 shadow-xl"
        >
          {ranked.map((item, index) => (
            <li
              key={item.name}
              role="option"
              aria-selected={index === highlight}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(e) => {
                // blur'dan önce seçimi yakala
                e.preventDefault();
                commit(item.name);
              }}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm transition ${
                index === highlight ? "bg-emerald-50" : "bg-white"
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="shrink-0">{icon}</span>
                <span
                  className={`truncate font-bold ${
                    item.isPrefix ? "text-emerald-800" : "text-slate-700"
                  }`}
                >
                  {item.name}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                  item.count > 0
                    ? "bg-violet-100 text-violet-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {t("stoneCount", { count: item.count })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
