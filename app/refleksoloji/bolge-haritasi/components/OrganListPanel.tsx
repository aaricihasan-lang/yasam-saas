"use client";

import { Layers } from "lucide-react";

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
  /**
   * ÜRÜN KURALI: false ise (telefon/dar ekran) düzenleme kontrolleri (organ ekle,
   * çizimi sil) gizlenir. Organ listesi + arama + seçim KORUNUR (görüntüleme).
   */
  editingAllowed: boolean;
};

export function OrganListPanel({
  organs,
  selectedOrgans,
  activeOrgan,
  selectedRegionId,
  onToggleOrgan,
  onAddOrgan,
  onDeleteDrawing,
  editingAllowed,
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
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-3xl border border-[#e5e0f7] bg-white/90 p-4 shadow-[0_16px_36px_-20px_rgba(76,61,140,0.28)] lg:w-[300px] 2xl:w-[330px]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600" aria-hidden>
          <Layers className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-[15px] font-extrabold tracking-[0.04em] text-[#1b1638]">ORGANLAR</h2>
          <p className="mt-0.5 text-[11.5px] font-medium text-slate-500">Çoklu seçim için tıklayın</p>
        </div>
      </div>

      {editingAllowed ? (
        <>
          <div className="mt-3 flex gap-2">
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
              className="h-10 min-w-0 flex-1 rounded-xl border border-[#e6e3f3] bg-[#fbfaff] px-3 text-[13.5px] font-medium text-slate-800 placeholder:text-slate-400 outline-none ring-violet-300/40 transition focus:border-violet-300 focus:bg-white focus:ring-2"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="h-10 shrink-0 rounded-xl bg-violet-300 px-3.5 text-[13px] font-bold text-white transition hover:bg-violet-400"
            >
              Ekle
            </button>
          </div>
          {addError ? <p className="mt-0.5 text-[10px] font-semibold text-rose-700">{addError}</p> : null}
        </>
      ) : null}

      <label className="mt-2.5 block">
        <span className="sr-only">Organ ara</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Organ ara..."
          className="h-10 w-full rounded-xl border border-[#e6e3f3] bg-[#fbfaff] px-3 text-[13.5px] font-medium text-slate-800 placeholder:text-slate-400 outline-none ring-violet-300/40 transition focus:border-violet-300 focus:bg-white focus:ring-2"
        />
      </label>

      {editingAllowed ? (
        <button
          type="button"
          onClick={onDeleteDrawing}
          disabled={!selectedRegionId}
          className={`mt-2.5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-[13px] font-bold transition ${
            selectedRegionId
              ? "border-rose-300/80 bg-rose-50/90 text-rose-900 hover:bg-rose-100/90"
              : "cursor-not-allowed border-rose-200/60 bg-rose-50/50 text-rose-400"
          }`}
        >
          Çizimi Sil
        </button>
      ) : null}

      <ul className="mt-2.5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
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
                  className={`flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[14.5px] font-semibold transition-all duration-200 ${
                    isActive
                      ? "border-violet-400 bg-[#f6f2ff] text-violet-950 shadow-[0_4px_12px_-8px_rgba(109,40,217,0.5)] ring-2 ring-violet-300/60"
                      : isSelected
                        ? "border-violet-300 bg-[#f6f2ff] text-violet-950 ring-1 ring-violet-200/70"
                        : "border-[#efedf7] bg-white text-[#2a2546] hover:bg-[#faf8ff]"
                  }`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-black ${
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
