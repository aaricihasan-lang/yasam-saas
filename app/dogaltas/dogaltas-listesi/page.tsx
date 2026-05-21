"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import {
  getSessionTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";

type StoneRecord = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, string[][]> | null;
  images: { id: string; name: string; url?: string; file_path?: string }[] | null;
  created_at: string;
  updated_at: string | null;
};

const VIEWED_SEARCH_STORAGE_KEY = "yasam-dogaltas-list-viewed-search-results";

const DOGALTAS_LIST_SEARCH_STORAGE_KEYS = [
  "yasam-dogaltas-search",
  "yasam-dogaltas-search-query",
  "yasam-dogaltas-last-search",
  "dogaltas-search",
  "lastDogaltasSearch",
  "searchTerm",
  "q",
] as const;

const HIGHLIGHT_MARK_CLASS = "rounded bg-yellow-200 px-1 font-bold text-slate-950";
const SEARCH_MATCH_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700";

const STONES_SELECT =
  "id, tenant_id, stone_name, short_description, general_info, source_note, physical_effects, spiritual_effects, other_effects, warning_text, warning_tags, feng_shui, meditation, care, application, chakras, assignments, images, created_at, updated_at";

function normalizeTrSearch(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildNormIndexMap(text: string): { norm: string; indexMap: number[] } {
  let norm = "";
  const indexMap: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const charNorm = normalizeTrSearch(text[i] ?? "");
    for (let j = 0; j < charNorm.length; j += 1) {
      norm += charNorm[j];
      indexMap.push(i);
    }
  }

  return { norm, indexMap };
}

function renderHighlightedText(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const queryNorm = normalizeTrSearch(trimmedQuery);
  if (!queryNorm) return text;

  const { norm, indexMap } = buildNormIndexMap(text);
  const nodes: ReactNode[] = [];
  let lastEnd = 0;
  let searchFrom = 0;

  while (searchFrom <= norm.length - queryNorm.length) {
    const idx = norm.indexOf(queryNorm, searchFrom);
    if (idx < 0) break;

    const startOrig = indexMap[idx] ?? 0;
    const endOrig = (indexMap[idx + queryNorm.length - 1] ?? startOrig) + 1;

    if (startOrig > lastEnd) {
      nodes.push(
        <Fragment key={`p-${lastEnd}`}>{text.slice(lastEnd, startOrig)}</Fragment>,
      );
    }

    nodes.push(
      <mark key={`m-${startOrig}-${idx}`} className={HIGHLIGHT_MARK_CLASS}>
        {text.slice(startOrig, endOrig)}
      </mark>,
    );

    lastEnd = endOrig;
    searchFrom = idx + queryNorm.length;
  }

  if (lastEnd < text.length) {
    nodes.push(<Fragment key="p-end">{text.slice(lastEnd)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : text;
}

function assignmentsToSearchText(assignments: Record<string, string[][]> | null): string {
  if (!assignments || typeof assignments !== "object") return "";

  const parts: string[] = [];
  for (const value of Object.values(assignments)) {
    if (Array.isArray(value)) {
      for (const row of value) {
        if (Array.isArray(row)) {
          parts.push(row.map((cell) => String(cell ?? "")).join(" "));
        } else if (typeof row === "string") {
          parts.push(row);
        }
      }
    } else if (typeof value === "string") {
      parts.push(value);
    }
  }
  return parts.filter(Boolean).join(" ");
}

function buildSearchableText(stone: StoneRecord): string {
  const parts: string[] = [
    stone.stone_name,
    stone.short_description ?? "",
    stone.general_info ?? "",
    stone.source_note ?? "",
    stone.physical_effects ?? "",
    stone.spiritual_effects ?? "",
    stone.other_effects ?? "",
    stone.warning_text ?? "",
    stone.feng_shui ?? "",
    stone.meditation ?? "",
    stone.care ?? "",
    stone.application ?? "",
    ...(stone.chakras || []),
    ...(stone.warning_tags || []),
    assignmentsToSearchText(stone.assignments),
  ];

  for (const value of Object.values(stone)) {
    if (typeof value === "string" && value.trim()) {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) parts.push(item);
        else if (item && typeof item === "object" && "name" in item) {
          parts.push(String((item as { name?: string }).name ?? ""));
        }
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      parts.push(assignmentsToSearchText(value as Record<string, string[][]>));
    }
  }

  return parts.filter(Boolean).join(" ");
}

function stoneMatchesSearch(stone: StoneRecord, searchTerm: string): boolean {
  const trimmed = searchTerm.trim();
  if (!trimmed) return true;
  const haystack = normalizeTrSearch(buildSearchableText(stone));
  const needle = normalizeTrSearch(trimmed);
  return Boolean(needle) && haystack.includes(needle);
}

function clearDogaltasListSearchStorage() {
  if (typeof window === "undefined") return;
  for (const key of DOGALTAS_LIST_SEARCH_STORAGE_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

function readUrlSearchQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

function stripUrlSearchQuery() {
  if (typeof window === "undefined") return;
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);
}

function readViewedStoneIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(VIEWED_SEARCH_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((id) => String(id)));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function markViewedStoneId(id: string) {
  const viewed = readViewedStoneIds();
  viewed.add(id);
  localStorage.setItem(VIEWED_SEARCH_STORAGE_KEY, JSON.stringify([...viewed]));
}

function stoneDetailHref(id: string, query: string, isSearchActive: boolean) {
  return isSearchActive
    ? `/dogaltas/dogaltas-listesi/${encodeURIComponent(id)}?q=${encodeURIComponent(query)}`
    : `/dogaltas/dogaltas-listesi/${encodeURIComponent(id)}`;
}

type StonesLoadDebug = {
  activeUserTenantId: string | null;
  queryTenantId: string | null;
  returnedCount: number;
  tableTotalVisible: number | null;
  sampleTenantIds: string[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function safeText(value: string | null | undefined, limit = 115) {
  if (!value) return "Kısa açıklama eklenmemiş.";
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function countFilledSections(stone: StoneRecord) {
  return [
    stone.short_description,
    stone.general_info,
    stone.source_note,
    stone.physical_effects,
    stone.spiritual_effects,
    stone.other_effects,
    stone.warning_text,
    stone.feng_shui,
    stone.meditation,
    stone.care,
    stone.application,
  ].filter((item) => item && item.trim().length > 0).length;
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-6 px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[34px] border-[3px] border-cyan-400/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(34,211,238,0.16)] backdrop-blur-xl";
const uiFilterCard =
  "rounded-[30px] border-[3px] border-violet-300/45 bg-white/75 p-5 shadow-[0_0_40px_rgba(139,92,246,0.14)] backdrop-blur-xl";
const uiTableCard =
  "w-full min-h-[520px] overflow-hidden rounded-[34px] border-[3px] border-cyan-400/45 bg-white/78 shadow-[0_0_50px_rgba(34,211,238,0.16)] backdrop-blur-xl";
const uiSearchInput =
  "h-14 w-full rounded-2xl border-2 border-cyan-200 bg-white/90 px-5 pl-12 font-semibold shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiViewBtn =
  "rounded-2xl px-6 py-4 font-black shadow-md transition-all duration-300 hover:-translate-y-0.5";
const uiStatCard =
  "rounded-2xl border-2 border-cyan-200 bg-white/85 px-8 py-4 text-center shadow-md";
const uiBadgeBase = "rounded-full border px-3 py-1 text-xs font-black shadow-sm";
const uiBadgeSection = `${uiBadgeBase} border-emerald-200 bg-emerald-50 text-emerald-700`;
const uiBadgeImage = `${uiBadgeBase} border-cyan-200 bg-cyan-50 text-cyan-700`;
const uiBadgeWarning = `${uiBadgeBase} border-red-200 bg-red-50 text-red-600`;
const uiBadgeChakra = `${uiBadgeBase} border-violet-200 bg-violet-50 text-violet-700`;
const uiDeleteBtn =
  "rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-black text-red-600 shadow-sm transition hover:bg-red-100";
const uiSelectActionBtn =
  "rounded-2xl px-5 py-3 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
const uiRowCheckbox =
  "h-5 w-5 shrink-0 cursor-pointer rounded-md border-2 border-cyan-300 text-cyan-600 shadow-sm accent-cyan-600 focus:ring-2 focus:ring-cyan-300/40";

function DogaltasListesiPageContent() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [stones, setStones] = useState<StoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewedStoneIds, setViewedStoneIds] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [stoneToDelete, setStoneToDelete] = useState<StoneRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [loadDebug, setLoadDebug] = useState<StonesLoadDebug | null>(null);

  async function loadStones() {
    setLoading(true);
    setErrorMessage("");

    const activeUserTenantId = getSessionTenantId();
    const tenantIdForQuery = activeUserTenantId;

    if (!tenantIdForQuery) {
      setLoading(false);
      setQueryTenantId(null);
      setStones([]);
      setLoadDebug({
        activeUserTenantId: null,
        queryTenantId: null,
        returnedCount: 0,
        tableTotalVisible: null,
        sampleTenantIds: [],
      });
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    setQueryTenantId(tenantIdForQuery);

    const { data, error } = await supabase
      .from("stones")
      .select(STONES_SELECT)
      .eq("tenant_id", tenantIdForQuery)
      .order("created_at", { ascending: false });

    const returnedCount = data?.length ?? 0;

    let tableTotalVisible: number | null = null;
    let sampleTenantIds: string[] = [];

    if (!error && returnedCount === 0) {
      const { count } = await supabase
        .from("stones")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantIdForQuery);
      tableTotalVisible = count ?? 0;

      const { data: tenantRows } = await supabase
        .from("stones")
        .select("tenant_id")
        .eq("tenant_id", tenantIdForQuery)
        .limit(50);

      sampleTenantIds = [
        ...new Set(
          (tenantRows ?? [])
            .map((row) => String(row.tenant_id ?? "").trim())
            .filter(Boolean),
        ),
      ].slice(0, 5);
    }

    setLoadDebug({
      activeUserTenantId,
      queryTenantId: tenantIdForQuery,
      returnedCount,
      tableTotalVisible,
      sampleTenantIds,
    });

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error.message}`);
      setStones([]);
      return;
    }

    setStones((data || []) as StoneRecord[]);
  }

  async function deleteStone() {
    if (!stoneToDelete) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const tenantId = queryTenantId ?? getSessionTenantId();
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { error } = await supabase
      .from("stones")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", stoneToDelete.id);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Kayıt silinemedi: ${error.message}`);
      return;
    }

    setStones((current) =>
      current.filter((stone) => stone.id !== stoneToDelete.id)
    );
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(stoneToDelete.id);
      return next;
    });
    setStoneToDelete(null);
  }

  const selectedCount = selectedIds.size;

  const toggleStoneSelection = useCallback((stoneId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(stoneId)) {
        next.delete(stoneId);
      } else {
        next.add(stoneId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const clearSearch = useCallback(() => {
    if (readUrlSearchQuery()) {
      stripUrlSearchQuery();
    }
    clearDogaltasListSearchStorage();
    setSearchTerm("");
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (!value.trim()) {
      if (readUrlSearchQuery()) {
        stripUrlSearchQuery();
      }
      clearDogaltasListSearchStorage();
    }
  }, []);

  const handleStoneNavigate = useCallback((stoneId: string) => {
    markViewedStoneId(stoneId);
    setViewedStoneIds(readViewedStoneIds());
  }, []);

  const handleRefresh = useCallback(() => {
    clearSearch();
    void loadStones();
  }, [clearSearch]);

  useEffect(() => {
    runInEffect(() => {
      void loadStones();
    });
  }, []);

  useEffect(() => {
    const q = readUrlSearchQuery();
    if (q) {
      setSearchTerm(q);
    }
  }, []);

  useEffect(() => {
    const refreshViewed = () => setViewedStoneIds(readViewedStoneIds());
    refreshViewed();
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);

  const isSearchActive = Boolean(searchTerm.trim());
  const activeSearch = searchTerm.trim();

  const filteredStones = useMemo(() => {
    return stones.filter((stone) =>
      stoneMatchesSearch(stone, isSearchActive ? searchTerm : ""),
    );
  }, [stones, searchTerm, isSearchActive]);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredStones.map((stone) => stone.id)));
  }, [filteredStones]);

  const deleteSelectedStones = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const confirmed = await confirm({
      title: "Seçili kayıtları sil",
      message: "Seçili kayıtları silmek istediğinize emin misiniz?",
      tone: "danger",
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
    });

    if (!confirmed) return;

    const tenantId = queryTenantId ?? getSessionTenantId();
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const ids = Array.from(selectedIds);
    setDeleteLoading(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("stones")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", ids);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Seçili kayıtlar silinemedi: ${error.message}`);
      return;
    }

    showToast({
      type: "success",
      message: `${ids.length} kayıt başarıyla silindi.`,
    });
    setSelectedIds(new Set());
    await loadStones();
  }, [confirm, queryTenantId, selectedIds, showToast]);

  const totalImages = stones.reduce(
    (total, stone) => total + (stone.images || []).length,
    0
  );

  const totalWarnings = stones.filter(
    (stone) =>
      (stone.warning_text && stone.warning_text.trim().length > 0) ||
      (stone.warning_tags || []).length > 0
  ).length;

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-3 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-cyan-700">
              💎 DOĞALTAŞ KÜTÜPHANESİ
            </div>

            <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
              Doğaltaş Listesi
            </h1>

            <p className="mt-3 text-lg font-medium text-slate-600 xl:text-xl">
              Kayıtları arayın, filtreleyin ve detay sayfasında okuyun.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex h-14 max-w-full shrink-0 items-center gap-2 rounded-2xl border-2 border-cyan-200 bg-white px-6 font-black text-slate-700 shadow-md transition hover:bg-cyan-50"
              >
                <svg
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 text-cyan-600/90"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
                </svg>
                <span className="truncate">Ana Panele Dön</span>
              </Link>

              <Link
                href="/dogaltas"
                className="inline-flex h-14 max-w-full shrink-0 items-center gap-2 rounded-xl border-2 border-cyan-200 bg-cyan-50 px-6 font-black text-slate-700 shadow-sm transition hover:bg-cyan-100"
              >
                <span className="shrink-0 text-base leading-none" aria-hidden>
                  💎
                </span>
                <span className="truncate">Doğaltaş Sayfasına Dön</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:min-w-[480px]">
            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{stones.length}</div>
              <div className="text-xs font-bold text-slate-500">Kayıt</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{totalImages}</div>
              <div className="text-xs font-bold text-slate-500">Görsel</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{totalWarnings}</div>
              <div className="text-xs font-bold text-slate-500">Uyarı</div>
            </div>
          </div>
        </header>

        <section className={uiFilterCard}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <form
              className="relative w-full"
              onSubmit={(event) => event.preventDefault()}
            >
              <span className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-lg text-slate-400">
                ⌕
              </span>

              <input
                type="search"
                value={searchTerm}
                onChange={(event) => handleSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Taş adı, açıklama, çakra, etki veya uyarı ara..."
                className={uiSearchInput}
                enterKeyHint="search"
                autoComplete="off"
              />
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`${uiViewBtn} ${
                  viewMode === "list"
                    ? "bg-slate-950 text-white"
                    : "border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Liste
              </button>

              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`${uiViewBtn} ${
                  viewMode === "card"
                    ? "bg-slate-950 text-white"
                    : "border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Kart
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                className={`${uiViewBtn} border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
              >
                Yenile
              </button>

              <Link
                href="/dogaltas/dogaltas-kayit"
                className={`${uiViewBtn} bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_10px_30px_rgba(34,211,238,0.25)] hover:from-cyan-600 hover:to-violet-700`}
              >
                + Yeni Kayıt
              </Link>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold text-slate-400">
              {isSearchActive
                ? `Arama: “${activeSearch}” · ${filteredStones.length} sonuç`
                : `${filteredStones.length} kayıt gösteriliyor`}
            </p>

            {loading && (
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                Yükleniyor...
              </span>
            )}
          </div>

          {!loading && filteredStones.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <span className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-800 shadow-sm">
                Seçili: {selectedCount}
              </span>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={selectAllFiltered}
                className={`${uiSelectActionBtn} border-2 border-cyan-200 bg-gradient-to-r from-cyan-50 to-cyan-100 text-cyan-950 hover:from-cyan-100 hover:to-cyan-200`}
              >
                Tümünü Seç
              </button>
              <button
                type="button"
                disabled={deleteLoading || selectedCount === 0}
                onClick={clearSelection}
                className={`${uiSelectActionBtn} border-2 border-violet-200 bg-gradient-to-r from-violet-50 to-violet-100 text-violet-950 hover:from-violet-100 hover:to-violet-200`}
              >
                Seçimi Temizle
              </button>
              <button
                type="button"
                disabled={deleteLoading || selectedCount === 0}
                onClick={() => void deleteSelectedStones()}
                className={`${uiSelectActionBtn} border-2 border-rose-200 bg-gradient-to-r from-rose-50 to-rose-100 text-rose-800 hover:from-rose-100 hover:to-rose-200`}
              >
                {deleteLoading ? "Siliniyor..." : "Seçilenleri Sil"}
              </button>
            </div>
          ) : null}
        </section>

        {errorMessage && (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700">
            {errorMessage}
          </div>
        )}

        <section className={uiTableCard}>
          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center text-base font-bold text-slate-500">
              Kayıtlar yükleniyor...
            </div>
          ) : filteredStones.length === 0 ? (
            <div className="flex h-[330px] flex-col items-center justify-center rounded-[24px] bg-white/70 text-center ring-1 ring-white">
              <div className="text-[54px]">💎</div>

              {stones.length === 0 && !isSearchActive ? (
                <>
                  <h3 className="mt-3 text-[18px] font-black text-slate-900">
                    Supabase sorgusu çalıştı ama 0 kayıt döndü
                  </h3>
                  <p className="mt-2 max-w-[480px] text-[13px] leading-6 text-slate-500">
                    Tablo: <b>stones</b> · Filtre: aktif kullanıcı{" "}
                    <code className="rounded bg-slate-100 px-1">tenant_id</code>
                  </p>
                  {loadDebug && (
                    <ul className="mt-4 max-w-[480px] space-y-1 text-left font-mono text-[11px] text-slate-600 sm:text-xs">
                      <li>
                        Aktif kullanıcı tenant_id:{" "}
                        {loadDebug.activeUserTenantId ?? "—"}
                      </li>
                      <li>Sorgu tenant_id: {loadDebug.queryTenantId ?? "—"}</li>
                      <li>Gelen kayıt sayısı: {loadDebug.returnedCount}</li>
                      {loadDebug.tableTotalVisible != null && (
                        <li>
                          Tabloda görünen toplam (filtresiz):{" "}
                          {loadDebug.tableTotalVisible}
                        </li>
                      )}
                      {loadDebug.sampleTenantIds.length > 0 && (
                        <li>
                          Örnek stones.tenant_id:{" "}
                          {loadDebug.sampleTenantIds.join(" · ")}
                        </li>
                      )}
                    </ul>
                  )}
                  {loadDebug?.queryTenantId &&
                    loadDebug.tableTotalVisible != null &&
                    loadDebug.tableTotalVisible > 0 && (
                    <p className="mt-3 max-w-[480px] text-[12px] leading-5 text-amber-800">
                      Import tenant_id ile aktif kullanıcı tenant_id farklı.
                      Supabase&apos;deki stones.tenant_id örnekleri yukarıda;
                      sorgu tenant_id ile eşleşmeli.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h3 className="mt-3 text-[18px] font-black text-slate-900">
                    Arama sonucu bulunamadı
                  </h3>
                  <p className="mt-2 max-w-[390px] text-[13px] leading-6 text-slate-500">
                    Farklı bir kelime deneyin veya aramayı temizleyin.
                  </p>
                </>
              )}
            </div>
          ) : viewMode === "list" ? (
            <div>
              <div className="grid grid-cols-[auto_1.2fr_1.7fr_0.75fr_0.6fr_0.55fr_0.45fr] gap-3 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-violet-50 to-white px-5 py-5 text-xs font-black uppercase tracking-[0.18em] text-slate-700">
                <div className="w-8" aria-hidden />
                <div>Taş</div>
                <div>Açıklama</div>
                <div>Etiketler</div>
                <div>İçerik</div>
                <div>Tarih</div>
                <div className="text-right">İşlem</div>
              </div>

              <div>
                {filteredStones.map((stone) => {
                  const imageCount = (stone.images || []).length;
                  const warningCount = (stone.warning_tags || []).length;
                  const sectionCount = countFilledSections(stone);
                  const coverImageUrl = (stone.images || []).find((image) => image.url)?.url;
                  const isSelected = selectedIds.has(stone.id);
                  const isViewedInSearch =
                    isSearchActive && viewedStoneIds.has(stone.id);
                  const detailHref = stoneDetailHref(stone.id, activeSearch, isSearchActive);
                  const displayName = stone.stone_name || "İsimsiz taş";
                  const displayDescription = safeText(stone.short_description);

                  return (
                    <div
                      key={stone.id}
                      className={`relative grid grid-cols-[auto_1.2fr_1.7fr_0.75fr_0.6fr_0.55fr_0.45fr] gap-3 overflow-hidden border-b border-cyan-100 px-5 py-5 transition-colors hover:bg-cyan-50/70 ${
                        isSelected ? "bg-violet-50/60" : ""
                      } ${
                        isViewedInSearch
                          ? "border-l-4 border-rose-600"
                          : isSearchActive
                            ? "border-l-4 border-amber-400"
                            : ""
                      }`}
                    >
                      {isViewedInSearch ? (
                        <span
                          className="absolute bottom-0 left-0 top-0 w-1.5 bg-rose-600"
                          aria-hidden
                        />
                      ) : null}
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleStoneSelection(stone.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${stone.stone_name || "İsimsiz taş"} seç`}
                          className={uiRowCheckbox}
                        />
                      </div>
                      <Link
                        href={detailHref}
                        onClick={() => {
                          if (isSearchActive) handleStoneNavigate(stone.id);
                        }}
                        className={`flex min-w-0 items-center gap-3 ${isViewedInSearch ? "pl-2" : ""}`}
                      >
                        <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-2xl bg-cyan-50 ring-1 ring-cyan-100">
                          {coverImageUrl ? (
                            <img
                              src={coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[20px]">
                              💎
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          {isSearchActive ? (
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme Var</span>
                              {isViewedInSearch ? (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                                  Bakıldı
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="truncate text-base font-black text-slate-950 xl:text-lg">
                            {isSearchActive
                              ? renderHighlightedText(displayName, activeSearch)
                              : displayName}
                          </div>

                          <div className="mt-0.5 text-xs font-bold text-cyan-700 hover:text-violet-700 xl:text-sm">
                            Detayı aç →
                          </div>
                        </div>
                      </Link>

                      <Link
                        href={detailHref}
                        onClick={() => {
                          if (isSearchActive) handleStoneNavigate(stone.id);
                        }}
                        className={`flex items-center text-sm font-medium leading-6 text-slate-600 xl:text-base ${isViewedInSearch ? "pl-2" : ""}`}
                      >
                        {isSearchActive
                          ? renderHighlightedText(displayDescription, activeSearch)
                          : displayDescription}
                      </Link>

                      <Link
                        href={detailHref}
                        onClick={() => {
                          if (isSearchActive) handleStoneNavigate(stone.id);
                        }}
                        className={`flex items-center ${isViewedInSearch ? "pl-2" : ""}`}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {(stone.chakras || []).slice(0, 2).map((chakra) => (
                            <span
                              key={chakra}
                              className={uiBadgeChakra}
                            >
                              {chakra}
                            </span>
                          ))}

                          {warningCount > 0 && (
                            <span className={uiBadgeWarning}>
                              {warningCount} uyarı
                            </span>
                          )}

                          {(stone.chakras || []).length === 0 && warningCount === 0 && (
                            <span className="text-[11px] font-bold text-slate-300">
                              -
                            </span>
                          )}
                        </div>
                      </Link>

                      <Link
                        href={detailHref}
                        onClick={() => {
                          if (isSearchActive) handleStoneNavigate(stone.id);
                        }}
                        className={`flex items-center gap-1.5 ${isViewedInSearch ? "pl-2" : ""}`}
                      >
                        <span className={uiBadgeSection}>
                          {sectionCount} bölüm
                        </span>

                        {imageCount > 0 && (
                          <span className={uiBadgeImage}>
                            {imageCount} görsel
                          </span>
                        )}
                      </Link>

                      <Link
                        href={detailHref}
                        onClick={() => {
                          if (isSearchActive) handleStoneNavigate(stone.id);
                        }}
                        className={`flex items-center text-sm font-black text-slate-500 xl:text-base ${isViewedInSearch ? "pl-2" : ""}`}
                      >
                        {formatDate(stone.created_at)}
                      </Link>

                      <div className="flex flex-col items-end justify-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setStoneToDelete(stone);
                          }}
                          className={uiDeleteBtn}
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredStones.map((stone) => {
                const imageCount = (stone.images || []).length;
                const sectionCount = countFilledSections(stone);
                const coverImageUrl = (stone.images || []).find((image) => image.url)?.url;
                const isSelected = selectedIds.has(stone.id);
                const isViewedInSearch =
                  isSearchActive && viewedStoneIds.has(stone.id);
                const detailHref = stoneDetailHref(stone.id, activeSearch, isSearchActive);
                const displayName = stone.stone_name || "İsimsiz taş";
                const displayDescription = safeText(stone.short_description, 120);

                return (
                  <div
                    key={stone.id}
                    className={`relative overflow-hidden rounded-[28px] border-[3px] bg-white/85 p-5 text-left shadow-[0_0_35px_rgba(34,211,238,0.12)] transition-all duration-300 hover:-translate-y-1 ${
                      isSelected
                        ? "border-violet-400/70 bg-violet-50/50"
                        : "border-cyan-300/40 hover:border-violet-300/50"
                    } ${
                      isViewedInSearch
                        ? "border-l-4 border-rose-600"
                        : isSearchActive
                          ? "border-l-4 border-amber-400"
                          : ""
                    }`}
                  >
                    {isViewedInSearch ? (
                      <span
                        className="absolute bottom-0 left-0 top-0 w-1.5 bg-rose-600"
                        aria-hidden
                      />
                    ) : null}
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleStoneSelection(stone.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${stone.stone_name || "İsimsiz taş"} seç`}
                        className={uiRowCheckbox}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Seç
                      </span>
                    </div>
                    <Link
                      href={detailHref}
                      onClick={() => {
                        if (isSearchActive) handleStoneNavigate(stone.id);
                      }}
                      className={`group block ${isViewedInSearch ? "pl-2" : ""}`}
                    >
                      {isSearchActive ? (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme Var</span>
                          {isViewedInSearch ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                              Bakıldı
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-cyan-50 ring-1 ring-cyan-100">
                          {coverImageUrl ? (
                            <img
                              src={coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[22px]">
                              💎
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="truncate text-base font-black text-slate-950 xl:text-lg">
                              {isSearchActive
                                ? renderHighlightedText(displayName, activeSearch)
                                : displayName}
                            </h3>

                            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-400 ring-1 ring-slate-100">
                              {formatDate(stone.created_at)}
                            </span>
                          </div>

                          <p className="mt-2 min-h-[42px] text-[12px] leading-5 text-slate-500">
                            {isSearchActive
                              ? renderHighlightedText(displayDescription, activeSearch)
                              : displayDescription}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {(stone.chakras || []).slice(0, 3).map((chakra) => (
                              <span
                                key={chakra}
                                className={uiBadgeChakra}
                              >
                                {chakra}
                              </span>
                            ))}

                            {(stone.warning_tags || []).slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className={uiBadgeWarning}
                              >
                                {tag}
                              </span>
                            ))}

                            <span className={uiBadgeSection}>
                              {sectionCount} bölüm
                            </span>

                            {imageCount > 0 && (
                              <span className={uiBadgeImage}>
                                {imageCount} görsel
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <Link
                        href={detailHref}
                        onClick={() => {
                          if (isSearchActive) handleStoneNavigate(stone.id);
                        }}
                        className="text-xs font-bold text-cyan-700 transition hover:text-violet-700 xl:text-sm"
                      >
                        Detay sayfasında oku →
                      </Link>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setStoneToDelete(stone);
                        }}
                        className={`shrink-0 ${uiDeleteBtn}`}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {stoneToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-[28px] bg-white p-6 text-center shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
              ⚠️
            </div>

            <h2 className="mt-4 text-[22px] font-black text-slate-950">
              Taşı Sil
            </h2>

            <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
              <b>{stoneToDelete.stone_name || "İsimsiz taş"}</b> kaydını silmek istediğinizden emin misiniz?
            </p>

            <p className="mt-2 text-[12px] font-bold text-rose-600">
              Bu işlem geri alınamaz.
            </p>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setStoneToDelete(null)}
                disabled={deleteLoading}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={deleteStone}
                disabled={deleteLoading}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteLoading ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DogaltasListesiPageFallback() {
  return (
    <main className={pageBg}>
      <div className="flex min-h-screen items-center justify-center text-base font-black text-slate-600">
        Yükleniyor…
      </div>
    </main>
  );
}

export default function DogaltasListesiPage() {
  return (
    <Suspense fallback={<DogaltasListesiPageFallback />}>
      <DogaltasListesiPageContent />
    </Suspense>
  );
}
