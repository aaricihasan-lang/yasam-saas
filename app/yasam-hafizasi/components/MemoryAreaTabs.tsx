"use client";

import { useRef } from "react";

/** Yaşam Hafızası'nın iki alanı — tek ürün, iki sekme. */
export type MemoryArea = "professional" | "client";

export const MEMORY_AREA_TABS: ReadonlyArray<{ id: MemoryArea; label: string; icon: string }> = [
  { id: "professional", label: "Mesleki Hafıza", icon: "📚" },
  { id: "client", label: "Danışan Hafızası", icon: "🧾" },
];

/**
 * Erişilebilir sekme başlığı (role=tablist/tab, aria-selected, ok-tuşu navigasyonu).
 * Mobilde yatay taşma güvenli (overflow-x-auto). Panel içerikleri çağıran tarafından
 * `role="tabpanel"` ile render edilir.
 */
export function MemoryAreaTabs({
  active,
  onChange,
}: {
  active: MemoryArea;
  onChange: (area: MemoryArea) => void;
}) {
  const refs = useRef<Record<MemoryArea, HTMLButtonElement | null>>({
    professional: null,
    client: null,
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = MEMORY_AREA_TABS.findIndex((t) => t.id === active);
    const nextIdx =
      e.key === "ArrowRight"
        ? (idx + 1) % MEMORY_AREA_TABS.length
        : (idx - 1 + MEMORY_AREA_TABS.length) % MEMORY_AREA_TABS.length;
    const next = MEMORY_AREA_TABS[nextIdx]!.id;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Yaşam Hafızası alanları"
      onKeyDown={onKeyDown}
      className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5"
    >
      {MEMORY_AREA_TABS.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`yh-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`yh-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition ${
              selected
                ? "border-violet-300 bg-violet-600 text-white shadow"
                : "border-white/80 bg-white/80 text-slate-700 hover:border-violet-300"
            }`}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
