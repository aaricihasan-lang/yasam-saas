"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { YhSourceModule } from "@/lib/yasam-hafizasi/config";
import {
  filterByModules,
  type YhSearchResponse,
  type YhSearchResult,
} from "@/lib/yasam-hafizasi/ui/searchResult";
import { fetchYhSearch } from "@/lib/yasam-hafizasi/ui/searchApiClient";
import { YH_MAX_QUERY_LENGTH } from "@/lib/yasam-hafizasi/search/queryPipeline";
import { FilterBar } from "./FilterBar";
import { SearchResultCard } from "./SearchResultCard";
import { ResultDetailDrawer } from "./ResultDetailDrawer";
import { ResultsSkeleton, WorkspaceEmpty } from "./WorkspaceStates";
import { MemoryAreaTabs, type MemoryArea } from "./MemoryAreaTabs";
import { ClientMemoryPanel } from "./ClientMemoryPanel";

/**
 * Yaşam Hafızası çalışma alanı — TEK ürün, İKİ alan (sekme):
 *   • Mesleki Hafıza  → ProfessionalMemoryPanel (mevcut professional arama; değişmez davranış)
 *   • Danışan Hafızası → ClientMemoryPanel (tenant-wide özel danışan geçmişi)
 * Admin ve aktif gerçek uzman AYNI ürünü kullanır; fark yalnız data-scope'tur.
 */
export function YasamHafizasiWorkspace() {
  const [area, setArea] = useState<MemoryArea>("professional");

  return (
    <div>
      <MemoryAreaTabs active={area} onChange={setArea} />

      <div
        role="tabpanel"
        id="yh-panel-professional"
        aria-labelledby="yh-tab-professional"
        hidden={area !== "professional"}
      >
        {area === "professional" ? <ProfessionalMemoryPanel /> : null}
      </div>

      <div
        role="tabpanel"
        id="yh-panel-client"
        aria-labelledby="yh-tab-client"
        hidden={area !== "client"}
      >
        {area === "client" ? <ClientMemoryPanel /> : null}
      </div>
    </div>
  );
}

type Status = "idle" | "loading" | "done" | "error" | "disabled";

/** Mesleki Hafıza — mevcut professional arama (shared/global KAPALI; her zaman tenant-only). */
function ProfessionalMemoryPanel() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<YhSearchResponse | null>(null);
  const [selectedModules, setSelectedModules] = useState<YhSourceModule[]>([]);
  const [selected, setSelected] = useState<YhSearchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setStatus("idle");
      setResponse(null);
      setSubmitted("");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSubmitted(trimmed);
    setStatus("loading");
    // Shared/global parametre GÖNDERİLMEZ: ortak havuz yok → server zaten tenant-only clamp'ler.
    const res = await fetchYhSearch({ q: trimmed }, ctrl.signal);
    if (ctrl.signal.aborted) return;
    setResponse(res);
    if (res.disabled) setStatus("disabled");
    else if (!res.ok) setStatus("error");
    else setStatus("done");
  }, []);

  const onToggleModule = useCallback((m: YhSourceModule) => {
    setSelectedModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }, []);

  const displayed = useMemo(
    () => (response ? filterByModules(response.results, selectedModules) : []),
    [response, selectedModules],
  );

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(q);
        }}
        className="mb-5 flex items-stretch gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={YH_MAX_QUERY_LENGTH}
            aria-label="Mesleki Hafıza araması"
            placeholder="Ara: taş, protokol, sembol, çakra, konu…"
            className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 pl-11 pr-4 text-base text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <button type="submit" className="btn-primary inline-flex min-h-[48px] items-center rounded-2xl px-5 text-sm">
          Ara
        </button>
      </form>

      {status === "idle" ? <WorkspaceEmpty variant="cold-start" /> : null}
      {status === "loading" ? <ResultsSkeleton /> : null}
      {status === "disabled" ? <WorkspaceEmpty variant="disabled" /> : null}
      {status === "error" ? (
        <WorkspaceEmpty
          variant="error"
          action={
            <button
              type="button"
              onClick={() => void runSearch(submitted)}
              className="btn-primary inline-flex items-center rounded-xl px-4 py-2 text-sm"
            >
              Tekrar dene
            </button>
          }
        />
      ) : null}

      {status === "done" && response ? (
        response.results.length === 0 ? (
          <WorkspaceEmpty variant="no-results" />
        ) : (
          <>
            <FilterBar
              facets={response.facets}
              selected={selectedModules}
              onToggleModule={onToggleModule}
              onClear={() => setSelectedModules([])}
            />
            <p className="mb-2 text-sm text-slate-500">
              <span className="font-bold text-slate-700">{displayed.length}</span> sonuç
              {selectedModules.length > 0 ? " (filtreli)" : ""}
            </p>
            {displayed.length === 0 ? (
              <WorkspaceEmpty variant="filtered" />
            ) : (
              <div className="space-y-3">
                {displayed.map((r) => (
                  <SearchResultCard key={r.id} result={r} onOpen={setSelected} />
                ))}
              </div>
            )}
          </>
        )
      ) : null}

      <ResultDetailDrawer result={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
