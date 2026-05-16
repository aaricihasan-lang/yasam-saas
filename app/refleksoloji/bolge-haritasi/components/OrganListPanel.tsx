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
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-2xl border border-white/90 bg-white/80 p-3 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:w-[300px]">
      <h2 className="text-lg font-black uppercase tracking-[0.2em] text-violet-900">Organlar</h2>
      <label className="mt-2 block">
        <span className="sr-only">Organ ara</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Organ ara…"
          className="w-full rounded-xl border border-violet-200/80 bg-violet-50/40 px-3.5 py-2.5 text-base font-medium text-slate-800 placeholder:text-slate-400 outline-none ring-violet-300/40 transition focus:border-violet-300 focus:bg-white focus:ring-2"
        />
      </label>

      <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {filteredOrgans.length === 0 ? (
          <li className="rounded-xl border border-dashed border-violet-200/70 bg-violet-50/40 px-3 py-4 text-center text-base font-medium text-slate-600">
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
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-3.5 text-left text-base font-bold transition-all duration-200 ${
                    isSelected
                      ? "border-violet-400/90 bg-gradient-to-r from-violet-300/90 via-fuchsia-200/85 to-violet-200/90 text-violet-950 shadow-[0_8px_22px_-10px_rgba(109,40,217,0.4)] ring-1 ring-violet-400/55"
                      : "border-violet-100/90 bg-gradient-to-r from-violet-50/90 via-fuchsia-50/70 to-white/80 text-slate-800 shadow-sm hover:border-violet-200/80 hover:from-violet-100/90 hover:to-fuchsia-50/80"
                  }`}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full transition ${
                      isSelected
                        ? "bg-violet-700 shadow-[0_0_0_3px_rgba(124,58,237,0.3)]"
                        : "bg-violet-300/80"
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
