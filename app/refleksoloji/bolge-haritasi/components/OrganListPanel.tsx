"use client";

import { useMemo, useState } from "react";
import { isDuplicateOrgan, organKey } from "../utils/organUtils";

type OrganListPanelProps = {
  organs: string[];
  selectedOrgan: string | null;
  onSelectOrgan: (organ: string) => void;
  onAddOrgan: (name: string) => boolean;
  onDeleteOrgan: () => void;
};

export function OrganListPanel({
  organs,
  selectedOrgan,
  onSelectOrgan,
  onAddOrgan,
  onDeleteOrgan,
}: OrganListPanelProps) {
  const [query, setQuery] = useState("");
  const [newOrganName, setNewOrganName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const filteredOrgans = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return organs;
    return organs.filter((organ) => organ.toLocaleLowerCase("tr").includes(q));
  }, [query, organs]);

  const handleAdd = () => {
    const trimmed = newOrganName.trim();
    if (!trimmed) {
      setAddError("Organ adı boş olamaz.");
      return;
    }
    if (isDuplicateOrgan(trimmed, organs)) {
      setAddError("Bu organ zaten listede.");
      return;
    }
    const ok = onAddOrgan(trimmed);
    if (ok) {
      setNewOrganName("");
      setAddError(null);
    }
  };

  const listEmpty = organs.length === 0;
  const searchEmpty = !listEmpty && filteredOrgans.length === 0;

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-2xl border border-white/90 bg-white/80 p-3 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:w-[300px]">
      <h2 className="text-lg font-black uppercase tracking-[0.2em] text-violet-900">Organlar</h2>

      <div className="mt-2 flex gap-1.5">
        <input
          type="text"
          value={newOrganName}
          onChange={(e) => {
            setNewOrganName(e.target.value);
            if (addError) setAddError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Organ adı yaz…"
          className="min-w-0 flex-1 rounded-xl border border-violet-200/80 bg-violet-50/40 px-3 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none ring-violet-300/40 transition focus:border-violet-300 focus:bg-white focus:ring-2"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="shrink-0 rounded-xl border border-emerald-300/80 bg-emerald-100/90 px-3 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-200/90"
        >
          Organ Ekle
        </button>
      </div>
      {addError ? <p className="mt-1 text-xs font-semibold text-rose-700">{addError}</p> : null}

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

      {selectedOrgan ? (
        <button
          type="button"
          onClick={onDeleteOrgan}
          className="mt-2 w-full rounded-xl border border-rose-300/80 bg-rose-50/90 px-3 py-2 text-sm font-bold text-rose-900 transition hover:bg-rose-100/90"
        >
          Organ Sil
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="mt-2 w-full cursor-not-allowed rounded-xl border border-rose-200/60 bg-rose-50/50 px-3 py-2 text-sm font-bold text-rose-400"
        >
          Organ Sil
        </button>
      )}

      <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {listEmpty ? (
          <li className="rounded-xl border border-dashed border-violet-200/70 bg-violet-50/40 px-3 py-4 text-center text-base font-medium text-slate-600">
            Henüz organ eklenmedi.
          </li>
        ) : searchEmpty ? (
          <li className="rounded-xl border border-dashed border-violet-200/70 bg-violet-50/40 px-3 py-4 text-center text-base font-medium text-slate-600">
            Eşleşen organ bulunamadı.
          </li>
        ) : (
          filteredOrgans.map((organ) => {
            const isSelected = organ === selectedOrgan;
            return (
              <li key={organKey(organ)}>
                <button
                  type="button"
                  onClick={() => onSelectOrgan(organ)}
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
