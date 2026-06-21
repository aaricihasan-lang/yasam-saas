"use client";

import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useToast } from "@/components/ui/ToastProvider";
import { backgroundSyncYasamUserFromDb, readYasamUser } from "@/lib/auth/yasamUser";
import {
  ADMIN_LIBRARY_TENANT_ID,
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import {
  fetchAllStonesExtended,
  fetchStonesListCount,
  fetchStonesListPage,
  getFirstStoneImageUrl,
  stoneListImageCount,
  type SearchMode,
  type StoneListItem,
  type StoneListItemExtended,
} from "@/lib/dogaltas/stonesListFetch";
import {
  containsTr,
  stoneHasWarning,
  stoneMatchesMineral,
  stoneMatchesZodiac,
} from "@/lib/dogaltas/stoneSearchUtils";
import { supabase } from "@/lib/supabase";

const VIEWED_SEARCH_STORAGE_KEY = "yasam-dogaltas-list-viewed-search-results";
const LAST_VIEWED_STONE_KEY = "yasam-dogaltas-last-viewed-stone-id";

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

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_LENGTH = 2;

const CHAKRA_CHIPS = [
  "Kök", "Sakral", "Solar Pleksus", "Kalp", "Boğaz", "Alın", "Taç",
] as const;

type DetailFilters = {
  zodiac: string;
  warningOnly: boolean;
  mineral: string;
  chakra: string;
};

const EMPTY_DETAIL_FILTERS: DetailFilters = {
  zodiac: "",
  warningOnly: false,
  mineral: "",
  chakra: "",
};

function normalizeTrSearch(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
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

/** Dizi/obje/null değerleri aranabilir string'e çevirir (recursive). */
function safeTextExtract(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => safeTextExtract(v)).join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

function readLastViewedStoneId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_VIEWED_STONE_KEY);
}

function saveLastViewedStoneId(id: string) {
  localStorage.setItem(LAST_VIEWED_STONE_KEY, id);
}

function stoneDetailHref(id: string, queryString: string) {
  const base = `/dogaltas/dogaltas-listesi/${encodeURIComponent(id)}`;
  return queryString ? `${base}?${queryString}` : base;
}

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

function listSummaryLabel(stone: StoneListItem): string {
  return stone.short_description?.trim() ? "Özet var" : "—";
}

function ListSkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-cyan-100">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`sk-${i}`}
          className="grid grid-cols-[auto_1.2fr_1.7fr_0.75fr_0.6fr_0.55fr_0.45fr] gap-3 px-4 py-3"
        >
          <div className="h-5 w-5 animate-pulse rounded-md bg-slate-200" />
          <div className="flex gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-2xl bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className="h-4 animate-pulse rounded bg-slate-100" />
          <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-14 animate-pulse rounded bg-slate-100" />
          <div className="h-9 w-14 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-4 px-4 py-4 sm:px-5 xl:px-8 2xl:px-10";
const uiHeaderCard =
  "rounded-[24px] border-[3px] border-cyan-400/45 bg-white/90 p-4 shadow-lg";
const uiFilterCard =
  "rounded-[20px] border-[3px] border-violet-300/45 bg-white/90 p-3 shadow-md";
const uiTableCard =
  "w-full min-h-[360px] overflow-hidden rounded-[22px] border-[3px] border-cyan-400/45 bg-white/92 shadow-lg";
const uiSearchInput =
  "h-10 w-full rounded-xl border-2 border-cyan-200 bg-white/90 px-4 pl-10 font-semibold shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiViewBtn =
  "rounded-xl px-4 py-2 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5";
const uiStatCard =
  "rounded-xl border-2 border-cyan-200 bg-white/85 px-3 py-2 text-center shadow-md";
const uiBadgeBase = "rounded-full border px-3 py-1 text-xs font-black shadow-sm";
const uiBadgeSection = `${uiBadgeBase} border-emerald-200 bg-emerald-50 text-emerald-700`;
const uiBadgeImage = `${uiBadgeBase} border-cyan-200 bg-cyan-50 text-cyan-700`;
const uiBadgeChakra = `${uiBadgeBase} border-violet-200 bg-violet-50 text-violet-700`;
const uiDeleteBtn =
  "min-h-[32px] rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100";
const uiSelectActionBtn =
  "min-h-[32px] rounded-xl px-4 py-1.5 text-xs font-black shadow-sm transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
const uiRowCheckbox =
  "h-5 w-5 shrink-0 cursor-pointer rounded-md border-2 border-cyan-300 text-cyan-600 shadow-sm accent-cyan-600 focus:ring-2 focus:ring-cyan-300/40";

function DogaltasListesiPageContent() {
  const deleteConfirm = useDeleteConfirm();
  const { showToast } = useToast();
  // Liste verisi
  const [stones, setStones] = useState<StoneListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAllStones, setTotalAllStones] = useState(0);

  // Detay filtreler için genişletilmiş veri (pagination yok, tüm taşlar)
  const [detailData, setDetailData] = useState<StoneListItemExtended[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // UI
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [detailFilters, setDetailFilters] = useState<DetailFilters>(EMPTY_DETAIL_FILTERS);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [viewedStoneIds, setViewedStoneIds] = useState<Set<string>>(() => new Set());
  const [lastViewedStoneId, setLastViewedStoneId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [stoneToDelete, setStoneToDelete] = useState<StoneListItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDeleteStep, setMobileDeleteStep] = useState<1 | 2>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [wordBusy, setWordBusy] = useState(false);

  const fetchList = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      const tenantId = queryTenantId ?? getSessionTenantId();

      if (!tenantId) {
        setListLoading(false);
        setLoadingMore(false);
        setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
        return;
      }

      if (opts.reset) {
        setListLoading(true);
        setErrorMessage("");
      } else {
        setLoadingMore(true);
      }

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;

      const [pageRes, countRes] = await Promise.all([
        fetchStonesListPage(tenantId, { offset, search, searchMode }),
        opts.reset
          ? fetchStonesListCount(tenantId, search, searchMode)
          : Promise.resolve({ count: totalCount, error: null }),
      ]);

      if (opts.reset) setListLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        setErrorMessage(`Kayıtlar alınamadı: ${pageRes.error}`);
        if (opts.reset) setStones([]);
        return;
      }

      if (countRes.error) {
        setErrorMessage(`Kayıt sayısı alınamadı: ${countRes.error}`);
      } else if (opts.reset) {
        setTotalCount(countRes.count);
      }

      setStones((current) =>
        opts.append ? [...current, ...pageRes.rows] : pageRes.rows,
      );

    },
    [debouncedSearch, searchMode, queryTenantId, totalCount],
  );

  const resolveTenant = useCallback(async () => {
    const cached = getSessionTenantId();
    if (cached) {
      setQueryTenantId(cached);
      backgroundSyncYasamUserFromDb();
      return cached;
    }
    const synced = await getSyncedTenantId();
    if (synced) setQueryTenantId(synced);
    return synced;
  }, []);

  async function deleteStone() {
    if (!stoneToDelete) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { data: deletedRows, error } = await supabase
      .from("stones")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", stoneToDelete.id)
      .select("id");

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Kayıt silinemedi: ${error.message}`);
      return;
    }

    if (!deletedRows?.length) {
      setErrorMessage("Kayıt silinemedi. Lütfen tekrar deneyin.");
      return;
    }

    const deletedId = stoneToDelete.id;
    setStones((current) => current.filter((stone) => stone.id !== deletedId));
    setDetailData((prev) => (prev ? prev.filter((s) => s.id !== deletedId) : null));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(deletedId);
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
    saveLastViewedStoneId(stoneId);
    setLastViewedStoneId(stoneId);
  }, []);

  const handleRefresh = useCallback(() => {
    clearSearch();
    setDebouncedSearch("");
    setDetailFilters(EMPTY_DETAIL_FILTERS);
    setDetailData(null);
    void fetchList({ reset: true });
  }, [clearSearch, fetchList]);

  useEffect(() => {
    void resolveTenant();
  }, [resolveTenant]);

  // Gerçek toplam kayıt sayısını bir kez çek — count kartı için (filtre/arama etkilemez)
  useEffect(() => {
    if (!queryTenantId) return;
    void fetchStonesListCount(queryTenantId).then(({ count }) => {
      setTotalAllStones(count);
    });
  }, [queryTenantId]);

  // Normal liste: detay filtreler kapalıyken server-side arama
  const isDetailFilterActive = Boolean(
    detailFilters.zodiac || detailFilters.warningOnly || detailFilters.mineral || detailFilters.chakra,
  );

  // Metin araması VEYA detay filtre aktifse → tüm taşlar client-side yüklenir
  const needsFullLoad = isDetailFilterActive || Boolean(debouncedSearch);

  // Server-side paginated fetch: yalnızca hiç filtre/arama yokken çalışır
  useEffect(() => {
    if (!queryTenantId) return;
    if (needsFullLoad) return; // client-side full-text devralıyor
    void fetchList({ reset: true });
  }, [queryTenantId, debouncedSearch, searchMode, needsFullLoad]);

  // needsFullLoad aktifken tüm taşları genişletilmiş alanlarla çek (bir kez yükle)
  useEffect(() => {
    if (!queryTenantId) return;
    if (!needsFullLoad) {
      setDetailData(null);
      return;
    }
    // detailData zaten yüklüyse tekrar çekme
    if (detailData) return;
    void (async () => {
      setDetailLoading(true);
      const { rows } = await fetchAllStonesExtended(queryTenantId);
      setDetailData(rows);
      setDetailLoading(false);
    })();
  }, [queryTenantId, needsFullLoad, detailData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchTerm.trim();
      setDebouncedSearch(trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : "");
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q")?.trim() ?? "";
    const astro = params.get("astro")?.trim() ?? "";
    const chakra = params.get("chakra")?.trim() ?? "";
    const mineral = params.get("mineral")?.trim() ?? "";
    const warn = params.get("warn") === "1";
    if (q) setSearchTerm(q);
    if (astro || chakra || mineral || warn) {
      setDetailFilters((f) => ({
        ...f,
        zodiac: astro || f.zodiac,
        chakra: chakra || f.chakra,
        mineral: mineral || f.mineral,
        warningOnly: warn || f.warningOnly,
      }));
    }
  }, []);

  useEffect(() => {
    const refreshViewed = () => {
      setViewedStoneIds(readViewedStoneIds());
      setLastViewedStoneId(readLastViewedStoneId());
    };
    refreshViewed();
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (stoneToDelete) setMobileDeleteStep(1);
  }, [stoneToDelete]);

  const isSearchActive = Boolean(debouncedSearch);
  const activeSearch = debouncedSearch;

  // Detay sayfasına geçerken ve geri dönünce tüm filter state'i URL'de tut
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (detailFilters.zodiac) params.set("astro", detailFilters.zodiac);
    if (detailFilters.chakra) params.set("chakra", detailFilters.chakra);
    if (detailFilters.mineral) params.set("mineral", detailFilters.mineral);
    if (detailFilters.warningOnly) params.set("warn", "1");
    return params.toString();
  }, [debouncedSearch, detailFilters]);

  useEffect(() => {
    const newUrl = filterQueryString
      ? `${window.location.pathname}?${filterQueryString}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [filterQueryString]);

  // Client-side tam içerik araması ve detay filtreleme
  const filteredStones: StoneListItem[] = useMemo(() => {
    if (!needsFullLoad || !detailData) return stones;

    return detailData.filter((stone) => {
      // ── Metin araması — moda göre ayrılmış ──────────────────────────────────
      if (debouncedSearch) {
        if (searchMode === "name") {
          // Taş İsmi modu: yalnızca stone_name alanında substring arama
          if (!containsTr(stone.stone_name, debouncedSearch)) return false;
        } else {
          // İçerik modu: tüm metin alanlarında arama
          const haystack = [
            stone.stone_name,
            stone.short_description,
            stone.general_info,
            stone.source_note,
            stone.physical_effects,
            stone.spiritual_effects,
            stone.other_effects,
            stone.feng_shui,
            stone.meditation,
            stone.care,
            stone.application,
            stone.warning_text,
            safeTextExtract(stone.warning_tags),
            safeTextExtract(stone.chakras),
            safeTextExtract(stone.assignments),
          ].join(" ");
          if (!containsTr(haystack, debouncedSearch)) return false;
        }
      }
      // ── Detay filtreler ───────────────────────────────────────────────────────
      if (detailFilters.zodiac) {
        if (!stoneMatchesZodiac(stone.assignments, detailFilters.zodiac))
          return false;
      }
      if (detailFilters.warningOnly) {
        if (!stoneHasWarning(stone.warning_text, stone.warning_tags))
          return false;
      }
      if (detailFilters.mineral && detailFilters.mineral.length >= SEARCH_MIN_LENGTH) {
        if (!stoneMatchesMineral(stone.assignments, detailFilters.mineral))
          return false;
      }
      if (detailFilters.chakra && detailFilters.chakra.trim().length >= SEARCH_MIN_LENGTH) {
        const chakraMatch = (stone.chakras || []).some((c) =>
          containsTr(c, detailFilters.chakra.trim()),
        );
        if (!chakraMatch) return false;
      }
      return true;
    }) as StoneListItem[];
  }, [
    stones,
    detailData,
    needsFullLoad,
    debouncedSearch,
    searchMode,
    detailFilters,
  ]);

  const hasMore = !needsFullLoad && stones.length < totalCount;
  const listBusy =
    listLoading ||
    detailLoading ||
    (isSearchActive && searchTerm.trim() !== debouncedSearch);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredStones.map((stone) => stone.id)));
  }, [filteredStones]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || listLoading || !hasMore) return;
    void fetchList({ reset: false, append: true, offset: stones.length });
  }, [fetchList, hasMore, listLoading, loadingMore, stones.length]);

  const deleteSelectedStones = useCallback(async () => {
    if (selectedIds.size === 0) return;

    // Kütüphane taşlarını (ADMIN_LIBRARY_TENANT_ID) seçimden çıkar
    const allStones = [...(detailData ?? []), ...stones];
    const stoneById = new Map(allStones.map((s) => [s.id, s]));

    const ownIds: string[] = [];
    const libraryIds: string[] = [];
    for (const id of selectedIds) {
      const stone = stoneById.get(id);
      if (stone?.tenant_id === ADMIN_LIBRARY_TENANT_ID) {
        libraryIds.push(id);
      } else {
        ownIds.push(id);
      }
    }

    if (ownIds.length === 0) {
      setErrorMessage(
        `Seçili ${libraryIds.length} kayıt kütüphane taşıdır ve silinemez. ` +
        "Yalnızca kendinizin eklediği kayıtları silebilirsiniz."
      );
      return;
    }

    const confirmMsg =
      libraryIds.length > 0
        ? `${ownIds.length} kaydınız silinecek. ` +
          `${libraryIds.length} kütüphane taşı bu işlemin dışında tutulacak.`
        : `${ownIds.length} taş kaydını silmek istediğinizden emin misiniz?`;

    const confirmed = await deleteConfirm({
      title: "Seçili kayıtları sil",
      message: confirmMsg,
      secondMessage: "Bu işlem geri alınamaz. Seçili kayıtlar kalıcı olarak silinecek.",
    });

    if (!confirmed) return;

    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    setDeleteLoading(true);
    setErrorMessage("");

    const { data: deletedRows, error } = await supabase
      .from("stones")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", ownIds)
      .select("id");

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Seçili kayıtlar silinemedi: ${error.message}`);
      return;
    }

    const deletedCount = deletedRows?.length ?? 0;
    if (deletedCount === 0) {
      setErrorMessage(
        "Silme işlemi gerçekleşmedi. Kayıtlar size ait olmayabilir. " +
        "Sayfayı yenileyip tekrar deneyin."
      );
      return;
    }

    const deletedIdSet = new Set(deletedRows.map((r) => r.id as string));
    setDetailData((prev) => (prev ? prev.filter((s) => !deletedIdSet.has(s.id)) : null));

    const msg =
      libraryIds.length > 0
        ? `${deletedCount} kayıt silindi. ${libraryIds.length} kütüphane taşı korundu.`
        : `${deletedCount} kayıt başarıyla silindi.`;

    showToast({ type: "success", message: msg });
    setSelectedIds(new Set());
    await fetchList({ reset: true });
  }, [deleteConfirm, detailData, fetchList, queryTenantId, selectedIds, showToast, stones]);

  const loadedImages = filteredStones.reduce(
    (total, stone) => total + stoneListImageCount(stone.images),
    0,
  );

  const exportStonesWord = useCallback(async (mode: "selected" | "all" | "filtered") => {
    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) { showToast({ type: "error", message: MISSING_SESSION_TENANT_MESSAGE }); return; }
    const userId = readYasamUser()?.id;
    if (!userId) { showToast({ type: "error", message: MISSING_SESSION_TENANT_MESSAGE }); return; }

    setWordBusy(true);
    try {
      let selectedStoneIds: string[] | undefined;
      if (mode === "selected") {
        selectedStoneIds = [...selectedIds];
        if (!selectedStoneIds.length) { showToast({ type: "warning", message: "Önce taş seçin." }); return; }
      } else if (mode === "filtered") {
        selectedStoneIds = filteredStones.map((s) => s.id);
        if (!selectedStoneIds.length) { showToast({ type: "warning", message: "Filtrelenmiş sonuç yok." }); return; }
      }

      const body: Record<string, unknown> = {
        tenantId,
        userId,
        sections: { stones: true },
        includeImages: false,
      };
      if (selectedStoneIds) body.selectedStoneIds = selectedStoneIds;

      const res = await fetch("/api/dogaltas/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Rapor oluşturulamadı.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const modeSlug = mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu";
      a.download = `dogaltas-${modeSlug}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ type: "success", message: "Taş raporu indirildi." });
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "Rapor oluşturulamadı." });
    } finally {
      setWordBusy(false);
    }
  }, [queryTenantId, selectedIds, filteredStones, showToast]);

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-violet-300/15 blur-3xl" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-1.5 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-black tracking-[0.18em] text-cyan-700">
              💎 DOĞALTAŞ KÜTÜPHANESİ
            </div>

            <h1 className="text-2xl font-black tracking-tight text-slate-950">
              Doğaltaş Listesi
            </h1>

            <p className="mt-1 text-sm font-medium text-slate-600">
              Kayıtları arayın, filtreleyin ve detay sayfasında okuyun.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
            <div className={uiStatCard}>
              <div className="text-lg font-black text-slate-950">
                {totalAllStones || totalCount}
              </div>
              <div className="text-xs font-bold text-slate-500">Toplam kayıt</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-lg font-black text-slate-950">
                {filteredStones.length}
              </div>
              <div className="text-xs font-bold text-slate-500">
                {isDetailFilterActive ? "Eşleşen" : "Yüklü"}
              </div>
            </div>

            <div className={uiStatCard}>
              <div className="text-lg font-black text-slate-950">{loadedImages}</div>
              <div className="text-xs font-bold text-slate-500">Görsel</div>
            </div>
          </div>
        </header>

        <section className={uiFilterCard}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            {/* Arama kutusu + mod seçimi + Detay Arama */}
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center gap-2">
                {/* Arama modu toggle */}
                <div className="flex shrink-0 gap-0.5 rounded-xl bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setSearchMode("name")}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-all ${
                      searchMode === "name"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Taş İsmi
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("content")}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-all ${
                      searchMode === "content"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    İçerik
                  </button>
                </div>

                {/* Ana arama kutusu */}
                <form
                  className="relative flex-1"
                  onSubmit={(event) => event.preventDefault()}
                >
                  <span className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-base text-slate-400">
                    ⌕
                  </span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                    placeholder={
                      searchMode === "name"
                        ? "Taş adında ara..."
                        : "Açıklama ve içerikte ara..."
                    }
                    className={uiSearchInput}
                    enterKeyHint="search"
                    autoComplete="off"
                  />
                </form>

                {/* Detay Arama butonu */}
                <button
                  type="button"
                  onClick={() => setIsDetailPanelOpen(true)}
                  className={`shrink-0 rounded-xl border-2 px-3 py-2 text-[11px] font-black transition-all hover:-translate-y-0.5 ${
                    isDetailFilterActive
                      ? "border-violet-400 bg-violet-600 text-white shadow-md"
                      : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  }`}
                >
                  {isDetailFilterActive ? "Filtreli ▾" : "Detay ▾"}
                </button>
              </div>

              {/* Aktif detay filtre rozetleri */}
              {isDetailFilterActive && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {detailFilters.zodiac && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-800">
                      ♈ Astroloji: {detailFilters.zodiac}
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, zodiac: "" }))}
                        className="ml-0.5 text-violet-400 hover:text-violet-900"
                        aria-label="Astroloji filtresini kaldır"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {detailFilters.chakra && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-800">
                      🔵 Çakra: {detailFilters.chakra}
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, chakra: "" }))}
                        className="ml-0.5 text-indigo-400 hover:text-indigo-900"
                        aria-label="Çakra filtresini kaldır"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {detailFilters.warningOnly && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      ⚠️ Uyarısı olanlar
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, warningOnly: false }))}
                        className="ml-0.5 text-amber-400 hover:text-amber-900"
                        aria-label="Uyarı filtresini kaldır"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {detailFilters.mineral && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-800">
                      💎 Mineral: {detailFilters.mineral}
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, mineral: "" }))}
                        className="ml-0.5 text-cyan-400 hover:text-cyan-900"
                        aria-label="Mineral filtresini kaldır"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailFilters(EMPTY_DETAIL_FILTERS)}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700"
                  >
                    Tümünü Temizle
                  </button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
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
              {isDetailFilterActive
                ? `${filteredStones.length} eşleşme (detay filtre)`
                : isSearchActive
                  ? `Arama: ${activeSearch} · ${filteredStones.length} sonuç`
                  : `${filteredStones.length} kayıt gösteriliyor`}
            </p>

            {listBusy && (
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                {detailLoading
                  ? "Filtre yükleniyor..."
                  : isSearchActive && searchTerm.trim() !== debouncedSearch
                    ? "Aranıyor..."
                    : "Yükleniyor..."}
              </span>
            )}
          </div>

          {!listLoading && filteredStones.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-800 shadow-sm">
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

              <div className="h-4 w-px bg-slate-200" aria-hidden />

              <button
                type="button"
                disabled={wordBusy || selectedCount === 0}
                onClick={() => void exportStonesWord("selected")}
                className={`${uiSelectActionBtn} border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-800 hover:from-blue-100 hover:to-blue-200`}
              >
                {wordBusy ? "⏳..." : `📄 Seçilenleri Word (${selectedCount})`}
              </button>

              {(isSearchActive || isDetailFilterActive) && (
                <button
                  type="button"
                  disabled={wordBusy}
                  onClick={() => void exportStonesWord("filtered")}
                  className={`${uiSelectActionBtn} border-2 border-violet-200 bg-gradient-to-r from-violet-50 to-violet-100 text-violet-800 hover:from-violet-100 hover:to-violet-200`}
                >
                  {wordBusy ? "⏳..." : `📄 Filtrelenmiş Word (${filteredStones.length})`}
                </button>
              )}

              <button
                type="button"
                disabled={wordBusy}
                onClick={() => void exportStonesWord("all")}
                className={`${uiSelectActionBtn} border-2 border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 hover:from-slate-100 hover:to-slate-200`}
              >
                {wordBusy ? "⏳..." : "📄 Tümünü Word"}
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
          {listLoading && filteredStones.length === 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <ListSkeletonRows count={8} />
              </div>
            </div>
          ) : filteredStones.length === 0 ? (
            <div className="flex h-[360px] flex-col items-center justify-center px-6 text-center">
              {/* İkon */}
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-violet-100 text-4xl shadow-sm ring-1 ring-cyan-200/60">
                💎
              </div>

              {isDetailFilterActive || isSearchActive ? (
                /* Filtre / arama sonucu boş */
                <>
                  <h3 className="mt-4 text-lg font-black text-slate-900">
                    Sonuç bulunamadı
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    Arama kriterlerinize uygun kayıt bulunamadı. Farklı bir
                    arama yapmayı veya filtreleri temizlemeyi deneyebilirsiniz.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {isSearchActive && (
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        Aramayı Temizle
                      </button>
                    )}
                    {isDetailFilterActive && (
                      <button
                        type="button"
                        onClick={() => setDetailFilters(EMPTY_DETAIL_FILTERS)}
                        className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-100"
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* Kütüphane boş */
                <>
                  <h3 className="mt-4 text-lg font-black text-slate-900">
                    Henüz kayıt bulunamadı
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    Doğaltaş kütüphanenizde henüz kayıt bulunmuyor. İlk
                    kaydınızı oluşturmak için aşağıdaki butonu
                    kullanabilirsiniz.
                  </p>
                  <Link
                    href="/dogaltas/dogaltas-kayit"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5 hover:from-cyan-600 hover:to-violet-700"
                  >
                    + Yeni Kayıt Ekle
                  </Link>
                </>
              )}
            </div>
          ) : viewMode === "list" ? (
            <div>
              {/* Column headers — desktop only */}
              <div className="hidden grid-cols-[auto_1.2fr_1.7fr_0.75fr_0.6fr_0.55fr_0.45fr] gap-3 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-violet-50 to-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-700 md:grid">
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
                  const imageCount = stoneListImageCount(stone.images);
                  const coverImageUrl = getFirstStoneImageUrl(stone.images);
                  const isSelected = selectedIds.has(stone.id);
                  const isLibraryStone = stone.tenant_id === ADMIN_LIBRARY_TENANT_ID;
                  const isViewedInSearch =
                    isSearchActive && viewedStoneIds.has(stone.id);
                  const isLastViewed = stone.id === lastViewedStoneId;
                  const detailHref = stoneDetailHref(stone.id, filterQueryString);
                  const displayName = stone.stone_name || "İsimsiz taş";
                  const displayDescription = safeText(stone.short_description);

                  return (
                    <Fragment key={stone.id}>
                      {/* Mobile row: slim list style */}
                      <div
                        className={`relative flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 transition-colors hover:bg-cyan-50/50 md:hidden ${
                          isSelected ? "bg-violet-50/40" : isLastViewed ? "bg-rose-50/60" : ""
                        } ${
                          isViewedInSearch
                            ? "border-l-4 border-rose-500"
                            : isSearchActive
                              ? "border-l-4 border-amber-400"
                              : ""
                        }`}
                      >
                        {isViewedInSearch ? (
                          <span className="absolute bottom-0 left-0 top-0 w-1 bg-rose-500" aria-hidden />
                        ) : null}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleStoneSelection(stone.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${displayName} seç`}
                          className={uiRowCheckbox}
                        />
                        <Link
                          href={detailHref}
                          onClick={() => {
                            handleStoneNavigate(stone.id);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2"
                        >
                          <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-cyan-50 ring-1 ring-cyan-100">
                            {coverImageUrl ? (
                              <img
                                src={coverImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-base">
                                💎
                              </span>
                            )}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-900">
                            {isSearchActive
                              ? renderHighlightedText(displayName, activeSearch)
                              : displayName}
                          </span>
                        </Link>
                        <Link
                          href={detailHref}
                          onClick={() => {
                            handleStoneNavigate(stone.id);
                          }}
                          className="shrink-0 text-xs font-bold text-cyan-600 hover:text-violet-700"
                        >
                          Detay→
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setStoneToDelete(stone);
                          }}
                          className="min-h-[44px] shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-black text-red-600 transition hover:bg-red-100"
                        >
                          Sil
                        </button>
                      </div>

                      {/* Desktop row: all 7 columns */}
                      <div
                        className={`relative hidden grid-cols-[auto_1.2fr_1.7fr_0.75fr_0.6fr_0.55fr_0.45fr] gap-3 overflow-hidden border-b border-cyan-100 px-4 py-3 transition-colors hover:bg-cyan-50/70 md:grid ${
                          isSelected ? "bg-violet-50/60" : isLastViewed ? "bg-rose-50/50" : ""
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
                            handleStoneNavigate(stone.id);
                          }}
                          className={`flex min-w-0 items-center gap-3 ${isViewedInSearch ? "pl-2" : ""}`}
                        >
                          <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-xl bg-cyan-50 ring-1 ring-cyan-100">
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
                            <div className="truncate text-sm font-black text-slate-950 xl:text-base">
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
                            handleStoneNavigate(stone.id);
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
                            handleStoneNavigate(stone.id);
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

                            {(stone.chakras || []).length === 0 && (
                              <span className="text-[11px] font-bold text-slate-300">
                                -
                              </span>
                            )}
                          </div>
                        </Link>

                        <Link
                          href={detailHref}
                          onClick={() => {
                            handleStoneNavigate(stone.id);
                          }}
                          className={`flex items-center gap-1.5 ${isViewedInSearch ? "pl-2" : ""}`}
                        >
                          <span className={uiBadgeSection}>{listSummaryLabel(stone)}</span>

                          {imageCount > 0 && (
                            <span className={uiBadgeImage}>
                              {imageCount} görsel
                            </span>
                          )}
                        </Link>

                        <Link
                          href={detailHref}
                          onClick={() => {
                            handleStoneNavigate(stone.id);
                          }}
                          className={`flex items-center text-sm font-black text-slate-500 xl:text-base ${isViewedInSearch ? "pl-2" : ""}`}
                        >
                          {formatDate(stone.updated_at)}
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
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredStones.map((stone) => {
                const imageCount = stoneListImageCount(stone.images);
                const coverImageUrl = getFirstStoneImageUrl(stone.images);
                const isSelected = selectedIds.has(stone.id);
                const isLibraryStone = stone.tenant_id === ADMIN_LIBRARY_TENANT_ID;
                const isViewedInSearch =
                  isSearchActive && viewedStoneIds.has(stone.id);
                const isLastViewed = stone.id === lastViewedStoneId;
                const detailHref = stoneDetailHref(stone.id, filterQueryString);
                const displayName = stone.stone_name || "İsimsiz taş";
                const displayDescription = safeText(stone.short_description, 120);

                return (
                  <div
                    key={stone.id}
                    className={`relative overflow-hidden rounded-[18px] border-[3px] bg-white/85 p-4 text-left shadow-[0_0_28px_rgba(34,211,238,0.10)] transition-all duration-300 hover:-translate-y-0.5 ${
                      isSelected
                        ? "border-violet-400/70 bg-violet-50/50"
                        : isLastViewed
                          ? "border-rose-200 bg-rose-50/50 ring-1 ring-rose-100"
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
                        {isLibraryStone ? "Kütüphane" : "Seç"}
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
                              {formatDate(stone.updated_at)}
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

                            <span className={uiBadgeSection}>{listSummaryLabel(stone)}</span>

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
                          handleStoneNavigate(stone.id);
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

          {hasMore && filteredStones.length > 0 ? (
            <div className="flex justify-center border-t border-cyan-100 bg-white/80 px-5 py-4">
              <button
                type="button"
                disabled={loadingMore || listLoading}
                onClick={handleLoadMore}
                className={`${uiViewBtn} border-2 border-cyan-200 bg-gradient-to-r from-cyan-50 to-violet-50 text-slate-800 hover:from-cyan-100 hover:to-violet-100 disabled:opacity-60`}
              >
                {loadingMore
                  ? "Yükleniyor..."
                  : `Daha Fazla Göster (${stones.length} / ${totalCount})`}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {/* ── Detay Arama Paneli ── */}
      {isDetailPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => setIsDetailPanelOpen(false)}
        >
          <div
            className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel başlık */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                  Gelişmiş Filtreler
                </div>
                <h2 className="text-base font-black text-slate-950">Detay Arama</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Paneli kapat"
              >
                ×
              </button>
            </div>

            {/* A) Astrolojik Atama — manuel text input */}
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-black text-slate-700">♈ Astrolojik Atama / Burç</div>
              <input
                type="text"
                value={detailFilters.zodiac}
                onChange={(e) =>
                  setDetailFilters((f) => ({ ...f, zodiac: e.target.value }))
                }
                placeholder="Burç, gezegen veya astrolojik atama yazın…"
                className="h-9 w-full rounded-xl border-2 border-slate-200 px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                Örn: yengeç, merkür, venüs, ay, koç — Türkçe karakter uyumlu
              </p>
            </div>

            {/* B) Sadece Uyarısı Olanlar */}
            <div className="border-b border-slate-100 px-5 py-4">
              <label className="flex cursor-pointer select-none items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={detailFilters.warningOnly}
                  onChange={(e) =>
                    setDetailFilters((f) => ({ ...f, warningOnly: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-amber-300 accent-amber-500"
                />
                <span className="text-sm font-black text-slate-700">
                  ⚠️ Sadece uyarısı olan taşlar
                </span>
              </label>
              <p className="mt-1.5 pl-6 text-[10px] font-medium text-slate-400">
                warning_text veya warning_tags alanı dolu olan taşlar.
              </p>
            </div>

            {/* C) Çakra Filtresi — chip seçim + manuel input */}
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-black text-slate-700">🔵 Çakra</div>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {CHAKRA_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setDetailFilters((f) => ({
                        ...f,
                        chakra: f.chakra === chip ? "" : chip,
                      }))
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-black transition-all ${
                      detailFilters.chakra === chip
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={detailFilters.chakra}
                onChange={(e) =>
                  setDetailFilters((f) => ({ ...f, chakra: e.target.value }))
                }
                placeholder="Çakra adı veya bağlantılı ifade yazın…"
                className="h-9 w-full rounded-xl border-2 border-slate-200 px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                Örn: kalp, boğaz, taç, 4. çakra — Türkçe karakter uyumlu
              </p>
            </div>

            {/* D) Mineral Arama */}
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-black text-slate-700">
                💎 Mineral Araması
              </div>
              <input
                type="text"
                value={detailFilters.mineral}
                onChange={(e) =>
                  setDetailFilters((f) => ({ ...f, mineral: e.target.value }))
                }
                placeholder="Mineral adı girin... (min 2 karakter)"
                className="h-9 w-full rounded-xl border-2 border-slate-200 px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                Sadece mineral atamasında eşleşen taşlar. Türkçe karakter uyumlu.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4">
              <button
                type="button"
                onClick={() => setDetailFilters(EMPTY_DETAIL_FILTERS)}
                className="text-xs font-bold text-slate-500 transition hover:text-rose-600"
              >
                Filtreleri Temizle
              </button>
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen(false)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {stoneToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-[28px] bg-white p-6 text-center shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-white">
            {isMobile && mobileDeleteStep === 2 ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-[28px] ring-1 ring-rose-200">
                  🚨
                </div>
                <h2 className="mt-4 text-[22px] font-black text-slate-950">
                  Son Onay
                </h2>
                <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
                  Bu işlem <b>geri alınamaz.</b> Kalıcı olarak silinsin mi?
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStoneToDelete(null)}
                    disabled={deleteLoading}
                    className="min-h-[44px] rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={deleteStone}
                    disabled={deleteLoading}
                    className="min-h-[44px] rounded-2xl bg-rose-700 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-800 disabled:opacity-60"
                  >
                    {deleteLoading ? "Siliniyor..." : "Evet, Kalıcı Sil"}
                  </button>
                </div>
              </>
            ) : isMobile ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
                  ⚠️
                </div>
                <h2 className="mt-4 text-[22px] font-black text-slate-950">
                  Taşı Sil
                </h2>
                <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
                  <b>{stoneToDelete.stone_name || "İsimsiz taş"}</b> kaydını silmek istiyor musunuz?
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStoneToDelete(null)}
                    className="min-h-[44px] rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200"
                  >
                    Hayır
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileDeleteStep(2)}
                    className="min-h-[44px] rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700"
                  >
                    Evet
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    className="min-h-[44px] rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={deleteStone}
                    disabled={deleteLoading}
                    className="min-h-[44px] rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    {deleteLoading ? "Siliniyor..." : "Evet, Sil"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function DogaltasListesiPageFallback() {
  return (
    <main className={pageBg}>
      <div className={pageContent}>
        <div className={`${uiTableCard} p-0`}>
          <ListSkeletonRows count={8} />
        </div>
      </div>
    </main>
  );
}

export default function DogaltasListesiPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <Suspense fallback={<DogaltasListesiPageFallback />}>
        <DogaltasListesiPageContent />
      </Suspense>
    </>
  );
}
