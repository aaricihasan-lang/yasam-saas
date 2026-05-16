"use client";

import { useMemo, useState } from "react";

export const SAMPLE_ORGANS = [
  "Mesane",
  "Böbrek",
  "Karaciğer",
  "Mide",
  "Bağırsaklar",
  "Rahim / Prostat",
] as const;

export type SampleOrgan = (typeof SAMPLE_ORGANS)[number];

type OrganListPanelProps = {
  selectedOrgan: string | null;
  setSelectedOrgan: (organ: string) => void;
};

export function OrganListPanel({ selectedOrgan, setSelectedOrgan }: OrganListPanelProps) {
  const [query, setQuery] = useState("");

  const filteredOrgans = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return SAMPLE_ORGANS;
    return SAMPLE_ORGANS.filter((organ) => organ.toLocaleLowerCase("tr").includes(q));
  }, [query]);

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-[24px] border border-white/90 bg-white/80 p-4 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:w-[300px] lg:p-5">
      <h2 className="text-sm font-black uppercase tracking-[0.22em] text-violet-800/90">Organlar</h2>
      <label className="mt-3 block">
        <span className="sr-only">Organ ara</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Organ ara…"
          className="w-full rounded-xl border border-violet-200/80 bg-violet-50/40 px-3.5 py-2.5 text-base font-medium text-slate-800 placeholder:text-slate-400 outline-none ring-violet-300/40 transition focus:border-violet-300 focus:bg-white focus:ring-2"
        />
      </label>

      <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {filteredOrgans.length === 0 ? (
          <li className="rounded-xl border border-dashed border-violet-200/70 bg-violet-50/40 px-3 py-4 text-center text-sm font-medium text-slate-500">
            Eşleşen organ bulunamadı.
          </li>
        ) : (
          filteredOrgans.map((organ) => {
            const isSelected = organ === selectedOrgan;
            return (
              <li key={organ}>
                <button
                  type="button"
                  onClick={() => setSelectedOrgan(organ)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-base font-semibold transition-all duration-200 ${
                    isSelected
                      ? "scale-[1.02] border-violet-300/90 bg-gradient-to-r from-violet-200/70 via-fuchsia-100/50 to-violet-100/60 text-violet-950 shadow-[0_6px_20px_-10px_rgba(109,40,217,0.35)] ring-1 ring-violet-300/50"
                      : "border-transparent bg-white/50 text-slate-700 hover:border-violet-200/60 hover:bg-violet-50/50 hover:text-violet-900"
                  }`}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full transition ${
                      isSelected ? "bg-violet-600 shadow-[0_0_0_3px_rgba(124,58,237,0.25)]" : "bg-transparent"
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">{organ}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
