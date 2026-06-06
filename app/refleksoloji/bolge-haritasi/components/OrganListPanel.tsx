"use client";

import { useMemo, useState } from "react";
import { organKey } from "../utils/organUtils";

type OrganListPanelProps = {
  organs: string[];
  selectedOrgans: string[];
  activeOrgan: string | null;
  selectedRegionId: string | null;
  onToggleOrgan: (organ: string) => void;
  onAddOrgan: (name: string) => boolean;
  onDeleteDrawing: () => void;
};

export function OrganListPanel({
  organs,
  selectedOrgans,
  activeOrgan,
  selectedRegionId,
  onToggleOrgan,
  onAddOrgan,
  onDeleteDrawing,
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
    const ok = onAddOrgan(trimmed);
    if (ok) {
      setNewOrganName("");
      setAddError(null);
    } else {
      setAddError("Bu organ zaten listede.");
    }
  };

  const listEmpty = organs.length === 0;
  const searchEmpty = !listEmpty && filteredOrgans.length === 0;

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-2xl border border-white/90 bg-white/80 p-2.5 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:w-[220px]">
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-violet-900">Organlar</h2>
      <p className="mt-0.5 text-[10px] font-medium text-slate-500">Çoklu seçim için tıklayın</p>

      <div className="mt-1.5 flex gap-1">
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
          placeholder="Organ adı yaz..."
          className="min-w-0 flex-1 rounded-lg border border-violet-200/80 bg-violet-50/40 px-2 py-1 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none ring-violet-300/40 transition focus:border-violet-300 focus:bg-white focus:ring-2"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="shrink-0 rounded-lg border border-emerald-300/80 bg-emerald-100/90 px-2 py-1 text-[10px] font-bold text-emerald-950 transition hover:bg-emerald-200/90"
        >
          Ekle
        </button>
      </div>
      {addError ? <p className="mt-0.5 text-[10px] font-semibold text-rose-700">{addError}</p> : null}

      <label className="mt-1.5 block">
        <span className="sr-only">Organ ara</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Organ ara..."
          className="w-full rounded-lg border border-violet-200/80 bg-violet-50/40 px-2.5 py-1.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none ring-violet-300/40 transition focus:border-violet-300 focus:bg-white focus:ring-2"
        />
      </label>

      <button
        type="button"
        onClick={onDeleteDrawing}
        disabled={!selectedRegionId}
        className={`mt-1.5 w-full rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
          selectedRegionId
            ? "border-rose-300/80 bg-rose-50/90 text-rose-900 hover:bg-rose-100/90"
            : "cursor-not-allowed border-rose-200/60 bg-rose-50/50 text-rose-400"
        }`}
      >
        Çizimi Sil
      </button>

      <ul className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        {listEmpty ? (
          <li className="rounded-lg border border-dashed border-violet-200/70 bg-violet-50/40 px-2 py-3 text-center text-xs font-medium text-slate-600">
            Henüz organ eklenmedi.
          </li>
        ) : searchEmpty ? (
          <li className="rounded-lg border border-dashed border-violet-200/70 bg-violet-50/40 px-2 py-3 text-center text-xs font-medium text-slate-600">
            Eşleşen organ bulunamadı.
          </li>
        ) : (
          filteredOrgans.map((organ) => {
            const isSelected = selectedOrgans.includes(organ);
            const isActive = organ === activeOrgan;
            return (
              <li key={organKey(organ)}>
                <button
                  type="button"
                  onClick={() => onToggleOrgan(organ)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? "border-violet-500/95 bg-gradient-to-r from-violet-300/95 via-fuchsia-200/90 to-violet-200/95 text-violet-950 shadow-[0_4px_12px_-6px_rgba(109,40,217,0.45)] ring-2 ring-violet-500/60"
                      : isSelected
                        ? "border-violet-400/90 bg-gradient-to-r from-violet-200/90 via-fuchsia-100/85 to-violet-100/90 text-violet-950 shadow-sm ring-1 ring-violet-400/55"
                        : "border-violet-100/90 bg-gradient-to-r from-violet-50/90 via-fuchsia-50/70 to-white/80 text-slate-800 shadow-sm hover:border-violet-200/80 hover:from-violet-100/90 hover:to-fuchsia-50/80"
                  }`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] font-black ${
                      isSelected
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-violet-300 bg-white text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
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
