"use client";

/**
 * Horary — İSTEĞE BAĞLI danışan seçimi. Mevcut tenant kapsamlı aday araması kullanılır (/clients/candidates; sunucu yalnız
 * uzmanın tenant'ındaki danışanları döndürür). Seçim kaydı sunucuda AYRICA doğrulanır (aynı tenant + FK).
 */
import { useState } from "react";
import { astroFetch } from "../../_lib/api";
import { atlasPaperInput, atlasSecondaryBtn } from "../AtlasShell";

export type PickedClient = { id: string; label: string };
type Candidate = { id: string; name: string | null; birthDate: string | null };

export default function HoraryClientPick({ value, onChange, testId = "horary-client", disabled }: { value: PickedClient | null; onChange: (v: PickedClient | null) => void; testId?: string; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ items: Candidate[] | null; loading: boolean; error: string | null }>({ items: null, loading: false, error: null });
  async function search() {
    const name = q.trim();
    if (name.length < 2) {
      setState({ items: null, loading: false, error: "En az 2 harf yazın." });
      return;
    }
    setState({ items: null, loading: true, error: null });
    const r = await astroFetch<{ candidates: Candidate[] }>(`/api/admin/astroloji/clients/candidates?${new URLSearchParams({ name }).toString()}`);
    setState({ items: r.ok ? r.data.candidates.slice(0, 8) : null, loading: false, error: r.ok ? null : r.error });
  }
  if (value)
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-2" data-testid={testId}>
        <span className="min-w-0 break-words rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid={`${testId}-picked`}>
          {value.label}
        </span>
        <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} disabled={disabled} onClick={() => onChange(null)} data-testid={`${testId}-clear`}>
          Bağlantıyı kaldır
        </button>
      </span>
    );
  return (
    <span className="grid min-w-0 gap-1.5" data-testid={testId}>
      <span className="flex min-w-0 gap-2">
        <input
          type="search"
          className={`${atlasPaperInput} min-h-[44px] w-full min-w-0 flex-1`}
          value={q}
          maxLength={80}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Danışan adı (isteğe bağlı)"
          aria-label="Danışan ara"
          data-testid={`${testId}-q`}
        />
        <button type="button" className={`${atlasSecondaryBtn} min-h-[44px] shrink-0`} disabled={disabled || state.loading} onClick={() => void search()} data-testid={`${testId}-search`}>
          {state.loading ? "Aranıyor…" : "Ara"}
        </button>
      </span>
      {state.error && <span className="text-xs text-rose-700">{state.error}</span>}
      {state.items && state.items.length === 0 && <span className="text-xs text-slate-500">Eşleşen danışan yok.</span>}
      {state.items && state.items.length > 0 && (
        <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-[#e7dcc3] bg-white p-1" data-testid={`${testId}-results`}>
          {state.items.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-[#f5ecd7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a54e]" onClick={() => onChange({ id: c.id, label: c.name ?? "Adsız danışan" })}>
                <span className="min-w-0 break-words">{c.name ?? "Adsız danışan"}</span>
                {c.birthDate && <span className="shrink-0 text-xs text-slate-500">{c.birthDate.split("-").reverse().join(".")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
