"use client";

import type { YhSourceModule } from "@/lib/yasam-hafizasi/config";
import type { YhFacet } from "@/lib/yasam-hafizasi/ui/searchResult";

/** BF-13 — sade kaynak-modül filtresi + paylaşımlı içerik anahtarı. */
export function FilterBar({
  facets,
  selected,
  onToggleModule,
  onClear,
  allowShared,
  onAllowSharedChange,
}: {
  facets: YhFacet[];
  selected: readonly YhSourceModule[];
  onToggleModule: (m: YhSourceModule) => void;
  onClear: () => void;
  allowShared: boolean;
  onAllowSharedChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Modüller</span>
        <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-0.5">
          {facets.map((f) => {
            const active = selected.includes(f.module);
            return (
              <button
                key={f.module}
                type="button"
                onClick={() => onToggleModule(f.module)}
                aria-pressed={active}
                className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition ${
                  active
                    ? "border-violet-300 bg-violet-600 text-white shadow"
                    : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"
                }`}
              >
                {f.moduleLabel}
                <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 ? (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 hover:text-violet-700">
            Temizle
          </button>
        ) : null}
      </div>

      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={allowShared}
          onChange={(e) => onAllowSharedChange(e.target.checked)}
          className="h-4 w-4 accent-violet-600"
        />
        Paylaşımlı kütüphane içeriğini de dahil et
      </label>
    </div>
  );
}
