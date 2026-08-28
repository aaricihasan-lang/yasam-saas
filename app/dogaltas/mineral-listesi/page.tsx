"use client";

import Link from "next/link";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { backgroundSyncYasamUserFromDb, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import {
  fetchMineralsListCount,
  fetchMineralsListPage,
  MINERALS_UNCATEGORIZED_FILTER,
  type MineralListItem,
} from "@/lib/dogaltas/mineralsListFetch";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useIsMobileOrPwa } from "@/hooks/useIsMobileOrPwa";
import { useToast } from "@/components/ui/ToastProvider";
import { bulkDeleteMinerals } from "@/lib/dogaltas/dogaltasApi";
import {
  renderHighlightedText,
  SEARCH_MATCH_BADGE_CLASS,
} from "@/lib/dogaltas/searchHighlight";
import { DogaltasSectionShell } from "@/app/dogaltas/components/DogaltasSectionShell";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { DOGALTAS_INPUT_CLASS } from "@/lib/dogaltas/formStyles";

const VIEWED_SEARCH_STORAGE_KEY = "yasam-mineral-viewed-search-results";
const LIST_PATH = "/dogaltas/mineral-listesi";

const MINERAL_SEARCH_STORAGE_KEYS = [
  "yasam-mineral-search",
  "yasam-mineral-search-query",
  "yasam-mineral-last-search",
  "mineral-search",
  "lastMineralSearch",
  "searchTerm",
  "q",
] as const;

function clearMineralSearchStorage() {
  if (typeof window === "undefined") return;
  for (const key of MINERAL_SEARCH_STORAGE_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

function readUrlSearchQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

/** Adres çubuğundan q kaldırır — state güncellemesinden önce çağrılmalı. */
function stripUrlSearchQuery() {
  if (typeof window === "undefined") return;
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);
}

const SEARCH_DEBOUNCE_MS = 300;
const UNCATEGORIZED_LABEL = "Kategorisiz";

function getCategoryLabel(kategori: string | null | undefined) {
  const trimmed = kategori?.trim();
  return trimmed || UNCATEGORIZED_LABEL;
}

function previewText(value: string | null | undefined, emptyLabel: string, limit = 120) {
  if (!value || !value.trim()) return emptyLabel;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

function readViewedMineralIds(): Set<string> {
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

function markViewedMineralId(id: string) {
  const viewed = readViewedMineralIds();
  viewed.add(id);
  localStorage.setItem(VIEWED_SEARCH_STORAGE_KEY, JSON.stringify([...viewed]));
}

const uiHeaderCard =
  "rounded-[22px] border-[3px] border-emerald-400/40 bg-white/70 px-5 py-4 shadow-[0_0_40px_rgba(16,185,129,0.14)] backdrop-blur-xl";
const uiFilterCard =
  "rounded-[18px] border-[3px] border-amber-300/40 bg-white/70 p-3 shadow-[0_0_35px_rgba(245,158,11,0.14)] backdrop-blur-xl";
const uiContentCard =
  "w-full min-h-[360px] rounded-[22px] border-[3px] border-emerald-400/40 bg-white/75 p-3 shadow-[0_0_45px_rgba(16,185,129,0.16)] backdrop-blur-xl";
const uiField = DOGALTAS_INPUT_CLASS;
const uiStatCard =
  "rounded-xl border-2 border-amber-300/40 bg-white/80 px-5 py-3 text-center shadow-md";
const uiMineralCard =
  "relative flex h-full flex-col overflow-hidden rounded-[18px] border-[3px] border-emerald-300/45 bg-white/80 p-4 shadow-[0_0_28px_rgba(34,211,238,0.10)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-400 hover:shadow-[0_0_38px_rgba(245,158,11,0.16)]";
const uiCategoryPill =
  "inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-900";
const uiComboBtn = "btn-soft mt-3 w-fit";
const uiLoadMoreBtn = "btn-soft";

function MineralListesiPageContent() {
  const t = useTranslations("stones.minerals.list");
  const tWord = useTranslations("stones.minerals.word");
  const tRoot = useTranslations("stones.minerals");
  const tc = useTranslations("stones.common");
  const router = useRouter();
  useBfcacheRefresh();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q")?.trim() ?? "";

  const [minerals, setMinerals] = useState<MineralListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [viewedMineralIds, setViewedMineralIds] = useState<Set<string>>(() => new Set());
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [selectedMineralIds, setSelectedMineralIds] = useState<Set<string>>(() => new Set());
  const [mineralWordBusy, setMineralWordBusy] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  // Word raporu modal
  const [showWordModal, setShowWordModal] = useState(false);
  const [wordExportMode, setWordExportMode] = useState<"all" | "filtered" | "viewed" | "selected">("all");
  const [wordReportLoading, setWordReportLoading] = useState(false);
  const [wordReportError, setWordReportError] = useState("");
  const [wordReportSuccess, setWordReportSuccess] = useState("");

  const deleteConfirm = useDeleteConfirm();
  const { showToast } = useToast();
  const isMobile = useIsMobileOrPwa();
  const { isDemo } = useDemoGuard();

  const applySearchUrl = useCallback(
    (query: string) => {
      const basePath =
        typeof window !== "undefined" ? window.location.pathname : LIST_PATH;
      const nextUrl = query.trim()
        ? `${basePath}?q=${encodeURIComponent(query.trim())}`
        : basePath;
      window.history.replaceState({}, "", nextUrl);
      router.replace(nextUrl, { scroll: false });
    },
    [router],
  );

  const clearSearch = useCallback(() => {
    stripUrlSearchQuery();
    clearMineralSearchStorage();
    setSearchTerm("");
  }, []);

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
      const categoryParam =
        categoryFilter.trim() === UNCATEGORIZED_LABEL
          ? MINERALS_UNCATEGORIZED_FILTER
          : categoryFilter.trim() || undefined;

      const [pageRes, countRes] = await Promise.all([
        fetchMineralsListPage(tenantId, {
          offset,
          search,
          category: categoryParam,
        }),
        opts.reset
          ? fetchMineralsListCount(tenantId, search, categoryParam)
          : Promise.resolve({ count: totalCount, error: null }),
      ]);

      if (opts.reset) setListLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        setErrorMessage(`Mineral kayıtları okunamadı: ${pageRes.error}`);
        if (opts.reset) setMinerals([]);
        return;
      }

      if (countRes.error) {
        setErrorMessage(`Kayıt sayısı alınamadı: ${countRes.error}`);
      } else if (opts.reset) {
        setTotalCount(countRes.count);
      }

      setMinerals((current) =>
        opts.append ? [...current, ...pageRes.rows] : pageRes.rows,
      );
    },
    [categoryFilter, debouncedSearch, queryTenantId, totalCount],
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

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (!value.trim()) {
        stripUrlSearchQuery();
        clearMineralSearchStorage();
      }
    },
    [],
  );

  const handleRefresh = useCallback(() => {
    clearSearch();
    setDebouncedSearch("");
    void fetchList({ reset: true });
  }, [clearSearch, fetchList]);

  useEffect(() => {
    void resolveTenant();
  }, [resolveTenant]);

  useEffect(() => {
    if (!queryTenantId) return;
    void fetchList({ reset: true });
  }, [queryTenantId, debouncedSearch, categoryFilter, fetchList]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchTerm.trim();
      setDebouncedSearch(next);
      if (next) {
        clearMineralSearchStorage();
        applySearchUrl(next);
      } else if (readUrlSearchQuery()) {
        stripUrlSearchQuery();
        clearMineralSearchStorage();
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm, applySearchUrl]);

  useEffect(() => {
    const q = readUrlSearchQuery();
    if (q) setSearchTerm(q);
  }, [urlQuery]);

  useEffect(() => {
    const refreshViewed = () => setViewedMineralIds(readViewedMineralIds());
    refreshViewed();
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);

  const handleResultNavigate = useCallback((mineralId: string) => {
    markViewedMineralId(mineralId);
    setViewedMineralIds(readViewedMineralIds());
  }, []);

  const toggleMineralSelection = useCallback((id: string) => {
    // FAZ-1: Mobil/PWA'da aynı anda en fazla 2 kayıt seçilebilir.
    if (isMobile && !selectedMineralIds.has(id) && selectedMineralIds.size >= 2) {
      showToast({ type: "info", message: t("mobileSelectLimit") });
      return;
    }
    setSelectedMineralIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (isMobile && next.size >= 2) return prev; // state seviyesinde sınır
      else next.add(id);
      return next;
    });
  }, [isMobile, selectedMineralIds, showToast, t]);

  const selectAllMinerals = useCallback(() => {
    if (isMobile) {
      showToast({ type: "info", message: t("mobileSelectLimit") });
      return;
    }
    setSelectedMineralIds(new Set(minerals.map((m) => m.id)));
  }, [minerals, isMobile, showToast, t]);

  const clearMineralSelection = useCallback(() => {
    setSelectedMineralIds(new Set());
  }, []);

  async function handleBulkDelete() {
    const ids = [...selectedMineralIds];
    if (!ids.length || bulkDeleteBusy) return;

    const ok = await deleteConfirm({
      title: t("deleteConfirmTitle"),
      message: t("deleteConfirmMessage", { n: ids.length }),
    });
    if (!ok) return;

    const tid = queryTenantId ?? (await getSyncedTenantId());
    if (!tid) return;

    setBulkDeleteBusy(true);
    try {
      const { ok, error } = await bulkDeleteMinerals(ids);

      if (!ok) {
        showToast({ type: "error", message: t("deleteFailed", { error: error ?? tRoot("unknownError") }) });
        return;
      }

      setMinerals((prev) => prev.filter((m) => !ids.includes(m.id)));
      setTotalCount((prev) => Math.max(0, prev - ids.length));
      clearMineralSelection();
      showToast({ type: "success", message: t("deleteSuccess", { n: ids.length }) });
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  async function exportSelectedMineralsWord() {
    const ids = [...selectedMineralIds];
    if (!ids.length) return;
    const tid = await getSyncedTenantId();
    if (!tid) return;
    const uid = readYasamUser()?.id;
    if (!uid) return;
    const sessionToken = readSessionToken();
    setMineralWordBusy(true);
    try {
      // F-018: kimlik header'dan; body'de userId/tenantId GÖNDERİLMEZ.
      const res = await fetch("/api/dogaltas/mineral-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": uid,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ exportMode: "selected", mineralIds: ids }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mineral-secili-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      // FAZ-3B: indirme tetiklendi. "İndirildi" demiyoruz — tarayıcının gerçek
      // konumunu/tamamlanmayı uygulama doğrulayamaz; dürüst mesaj.
      showToast({
        type: "success",
        message: t("wordDownloadStarted"),
      });
    } catch (err) {
      // FAZ-3B: ham hata kullanıcıya gösterilmez; yalnız geliştirici logunda.
      console.error("[mineral-listesi] seçili Word export hatası:", err);
      showToast({ type: "error", message: t("wordFailed") });
    } finally {
      setMineralWordBusy(false);
    }
  }

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const mineral of minerals) {
      set.add(getCategoryLabel(mineral.kategori));
    }
    return Array.from(set).sort((a, b) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b, "tr-TR");
    });
  }, [minerals]);

  const isSearchActive = Boolean(debouncedSearch);
  const activeSearch = debouncedSearch;
  const filteredMinerals = minerals;
  const hasMore = minerals.length < totalCount;
  const listBusy =
    listLoading || (Boolean(searchTerm.trim()) && searchTerm.trim() !== debouncedSearch);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || listLoading || !hasMore) return;
    void fetchList({ reset: false, append: true, offset: minerals.length });
  }, [fetchList, hasMore, listLoading, loadingMore, minerals.length]);

  const isEmptyDatabase = !listLoading && !errorMessage && totalCount === 0 && !isSearchActive;
  const isEmptyFiltered =
    !listLoading && !errorMessage && filteredMinerals.length === 0 && (isSearchActive || Boolean(categoryFilter));

  async function downloadMineralReport() {
    const tid = await getSyncedTenantId();
    if (!tid) { setWordReportError(tWord("errNoSession")); return; }
    const uid = readYasamUser()?.id;
    if (!uid) { setWordReportError(tWord("errNoUser")); return; }

    let mineralIds: string[] | undefined;
    if (wordExportMode === "filtered") {
      mineralIds = filteredMinerals.map((m) => m.id);
      if (!mineralIds.length) { setWordReportError(tWord("errNoFiltered")); return; }
    } else if (wordExportMode === "viewed") {
      mineralIds = [...viewedMineralIds];
      if (!mineralIds.length) { setWordReportError(tWord("errNoViewed")); return; }
    } else if (wordExportMode === "selected") {
      if (selectedMineralIds.size > 0) {
        mineralIds = [...selectedMineralIds];
      } else {
        setWordReportError(tWord("errNoSelected"));
        return;
      }
    }

    setWordReportLoading(true);
    setWordReportError("");
    setWordReportSuccess("");

    const sessionToken = readSessionToken();
    try {
      // F-018: kimlik header'dan; body'de userId/tenantId GÖNDERİLMEZ.
      const res = await fetch("/api/dogaltas/mineral-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": uid,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ exportMode: wordExportMode, mineralIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        // FAZ-3B: ham backend hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
        console.error("[mineral-listesi] Word raporu hatası:", data.error ?? `HTTP ${res.status}`);
        throw new Error("report-failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mineral-bankasi-raporu-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      // FAZ-3B: "İndirildi" demiyoruz — tarayıcının gerçek konumunu/tamamlanmayı doğrulayamayız.
      setWordReportSuccess(t("wordDownloadStarted"));
    } catch (err) {
      console.error("[mineral-listesi] Word raporu hatası:", err);
      setWordReportError(t("wordFailed"));
    } finally {
      setWordReportLoading(false);
    }
  }

  return (
    <DogaltasSectionShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      icon="⚗️"
      actions={
        <div className="grid grid-cols-2 gap-2 lg:min-w-[220px]">
          <div className={uiStatCard}>
            <div className="text-xl font-black text-slate-950">{totalCount}</div>
            <div className="text-xs font-bold text-slate-500">{t("totalLabel")}</div>
          </div>
          <div className={uiStatCard}>
            <div className="text-xl font-black text-slate-950">{filteredMinerals.length}</div>
            <div className="text-xs font-bold text-slate-500">
              {hasMore ? t("loadedTotal") : t("visibleResult")}
            </div>
          </div>
        </div>
      }
    >
      <div className="relative z-10 w-full">

        <section className={`${uiFilterCard} mb-3`}>
          {/* FAZ-3A: Arama alanı öncelikli — kendi satırında tam genişlik; kategori/Word/Yeni
              ikincil satırda ve aramayı daraltmaz. Responsive: mobilde hepsi alt alta. */}
          <div className="flex flex-col gap-3">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className={`${uiField} w-full text-sm text-slate-700`}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className={`${uiField} text-sm font-black text-slate-700 sm:w-[260px]`}
                aria-label={t("categoryFilterAria")}
              >
                <option value="">{t("allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {!isDemo && (
                <button
                  type="button"
                  onClick={() => { setShowWordModal(true); setWordReportError(""); setWordReportSuccess(""); }}
                  className="btn-soft"
                >
                  {t("wordReportButton")}
                </button>
              )}
              {!isDemo && (
                <Link
                  href="/dogaltas/mineral-bankasi"
                  className="btn-primary"
                >
                  {t("newMineral")}
                </Link>
              )}
            </div>
          </div>
          {isSearchActive || listBusy ? (
            <p className="mt-3 text-sm font-bold text-emerald-800">
              {listBusy
                ? t("searching")
                : t("searchResult", { q: activeSearch, n: totalCount })}
            </p>
          ) : null}
        </section>

        {errorMessage ? (
          <div
            className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {/* Toplu işlem çubuğu */}
        {!isDemo && !listLoading && filteredMinerals.length > 0 && (
          <div className="mb-3">
            <BulkExportBar
              compact
              selectedCount={selectedMineralIds.size}
              totalCount={totalCount}
              selectAllLabel={t("selectAllLabel")}
              selectAllCount={minerals.length}
              onSelectAll={selectAllMinerals}
              hideSelectAll={isMobile}
              onClearSelection={clearMineralSelection}
              exportSelectedLabel={t("exportSelectedLabel")}
              onExportSelected={() => void exportSelectedMineralsWord()}
              onDeleteSelected={() => void handleBulkDelete()}
              isExporting={mineralWordBusy}
              isDeleting={bulkDeleteBusy}
            />
          </div>
        )}

        <section className={uiContentCard}>
          {listLoading && filteredMinerals.length === 0 ? (
            <div className="flex min-h-[360px] items-center justify-center text-base font-black text-slate-500">
              {t("loadingList")}
            </div>
          ) : isEmptyDatabase ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] bg-gradient-to-br from-white/70 to-emerald-50/80 text-center ring-1 ring-emerald-100/60">
              <div className="text-[54px]">⚗️</div>
              <h2 className="mt-3 text-[20px] font-black text-slate-950">{t("emptyDbTitle")}</h2>
              <p className="mt-2 max-w-[400px] text-[13px] leading-6 text-slate-500">
                {t("emptyDbText")}
              </p>
            </div>
          ) : isEmptyFiltered ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] bg-gradient-to-br from-white/70 to-emerald-50/80 text-center ring-1 ring-emerald-100/60">
              <div className="text-[54px]">⚗️</div>
              <h2 className="mt-3 text-[20px] font-black text-slate-950">{t("emptyFilteredTitle")}</h2>
              <p className="mt-2 text-[13px] text-slate-500">
                {t("emptyFilteredText")}
              </p>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredMinerals.map((mineral) => {
                const categoryLabel = getCategoryLabel(mineral.kategori);
                const showCategoryPill = categoryLabel !== UNCATEGORIZED_LABEL;
                const isViewedInSearch =
                  isSearchActive && viewedMineralIds.has(mineral.id);
                const descriptionPreview = previewText(mineral.aciklama, t("noDescription"));

                // Demo: ilk mineralin ID'sini detay sayfasına query ile taşı
                const demoRefId = isDemo && minerals.length > 0 ? minerals[0]?.id : undefined;
                const detailBase = `/dogaltas/mineral-listesi/${encodeURIComponent(mineral.id)}`;
                const detailHref = (() => {
                  const parts: string[] = [];
                  if (isSearchActive) parts.push(`q=${encodeURIComponent(activeSearch)}`);
                  if (demoRefId) parts.push(`refMineralId=${encodeURIComponent(demoRefId)}`);
                  return parts.length > 0 ? `${detailBase}?${parts.join("&")}` : detailBase;
                })();

                const isMineralSelected = selectedMineralIds.has(mineral.id);
                // Demo koruma: listede görünen 1. mineralin önizlemesi açık, diğerleri blur
                const isPreviewProtected =
                  isDemo && minerals.length > 0 && mineral.id !== minerals[0]?.id;
                return (
                  <article
                    key={mineral.id}
                    className={`${uiMineralCard} ${
                      isMineralSelected
                        ? "ring-2 ring-blue-400 ring-offset-1"
                        : isViewedInSearch
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

                    {/* Mineral seçim checkbox — demo'da gizli */}
                    {!isDemo && (
                      <label className="absolute right-3 top-3 z-10 flex h-5 w-5 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isMineralSelected}
                          onChange={(e) => { e.stopPropagation(); toggleMineralSelection(mineral.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-emerald-300 accent-emerald-600"
                        />
                      </label>
                    )}

                    <div className={`flex gap-3 ${isViewedInSearch ? "pl-2" : ""}`}>
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,#d1fae5_0%,#fef3c7_48%,#fde68a_100%)] text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_5px_14px_rgba(16,185,129,0.10)] ring-1 ring-white/90"
                        aria-hidden
                      >
                        ⚗️
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        {isSearchActive ? (
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={SEARCH_MATCH_BADGE_CLASS}>{tRoot("searchMatchBadge")}</span>
                            {isViewedInSearch ? (
                              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                                {t("viewedBadge")}
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        {showCategoryPill ? (
                          <span className={`${uiCategoryPill} mb-1.5 w-fit`}>
                            {isSearchActive
                              ? renderHighlightedText(categoryLabel, activeSearch)
                              : categoryLabel}
                          </span>
                        ) : (
                          <span className="mb-1.5 text-xs font-bold text-slate-400">
                            {isSearchActive
                              ? renderHighlightedText(categoryLabel, activeSearch)
                              : categoryLabel}
                          </span>
                        )}
                        <h2 className="text-base font-black text-slate-950">
                          {isSearchActive
                            ? renderHighlightedText(mineral.name, activeSearch)
                            : mineral.name}
                        </h2>
                        <AdminTransferBadge originType={mineral.origin_type} className="mt-1" />
                        <DemoBlur isProtected={isPreviewProtected} intensity={4} className="mt-2 flex-1">
                          <p className="text-sm leading-6 text-slate-600">
                            {isSearchActive
                              ? renderHighlightedText(descriptionPreview, activeSearch)
                              : descriptionPreview}
                          </p>
                        </DemoBlur>
                        <Link
                          href={detailHref}
                          onClick={() => {
                            if (isSearchActive) handleResultNavigate(mineral.id);
                          }}
                          className={uiComboBtn}
                        >
                          {t("detailLink")}
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {hasMore && filteredMinerals.length > 0 ? (
              <div className="mt-5 flex justify-center border-t border-emerald-100/80 pt-5">
                <button
                  type="button"
                  disabled={loadingMore || listLoading}
                  onClick={handleLoadMore}
                  className={uiLoadMoreBtn}
                >
                  {loadingMore
                    ? tc("loading")
                    : t("loadMore", { loaded: filteredMinerals.length, total: totalCount })}
                </button>
              </div>
            ) : null}
            </>
          )}
        </section>
      </div>

      {/* Word raporu modal — demo'da gizli */}
      {!isDemo && showWordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950">{tWord("reportTitle")}</h2>
              <button
                type="button"
                onClick={() => setShowWordModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-500">{tWord("selectPrompt")}</p>

            <div className="space-y-2">
              {([
                ["all",      tWord("modeAll"),      tWord("countMineral", { n: totalCount })],
                ["filtered", tWord("modeFiltered"), `${tWord("countMineral", { n: filteredMinerals.length })}${hasMore ? tWord("loadedSuffix") : ""}`],
                ["viewed",   tWord("modeViewed"),   tWord("countMineral", { n: viewedMineralIds.size })],
                ["selected", selectedMineralIds.size > 0 ? tWord("modeSelectedCount", { n: selectedMineralIds.size }) : tWord("modeSelected"), null],
              ] as const).map(([mode, label, count]) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                    wordExportMode === mode
                      ? "border-violet-300 bg-violet-50"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  } ${mode === "viewed" && viewedMineralIds.size === 0 ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="mineralExportMode"
                    value={mode}
                    checked={wordExportMode === mode}
                    onChange={() => setWordExportMode(mode)}
                    disabled={mode === "viewed" && viewedMineralIds.size === 0}
                    className="mt-0.5 h-4 w-4 accent-emerald-600"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                    {count !== null && (
                      <span className="ml-2 text-xs font-medium text-slate-400">{count}</span>
                    )}
                    {mode === "viewed" && viewedMineralIds.size === 0 && (
                      <p className="mt-0.5 text-xs text-slate-400">{tWord("noViewedInSession")}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {wordExportMode === "selected" && selectedMineralIds.size === 0 && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                {tWord("selectHint")}
              </p>
            )}
            {wordExportMode === "selected" && selectedMineralIds.size > 0 && (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {tWord("selectedInfo", { n: selectedMineralIds.size })}
              </p>
            )}

            {wordReportError && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {wordReportError}
              </p>
            )}
            {wordReportSuccess && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                ✓ {wordReportSuccess}
              </p>
            )}
            {wordReportLoading && (
              <p className="mt-4 text-center text-sm font-semibold text-violet-700">
                {tWord("preparing")}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowWordModal(false)}
                disabled={wordReportLoading}
                className="btn-soft flex-1"
              >
                {tc("close")}
              </button>
              <button
                type="button"
                onClick={() => void downloadMineralReport()}
                disabled={wordReportLoading}
                className="btn-primary flex-1"
              >
                {wordReportLoading ? tWord("generating") : tWord("generateButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DogaltasSectionShell>
  );
}

function MineralListesiPageFallback() {
  const tRoot = useTranslations("stones.minerals");
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#f5f5dc_35%,#ecfccb_100%)]">
      <p className="text-base font-semibold text-emerald-800">{tRoot("fallbackLoading")}</p>
    </main>
  );
}

export default function MineralListesiPage() {
  return (
    <Suspense fallback={<MineralListesiPageFallback />}>
      <MineralListesiPageContent />
    </Suspense>
  );
}
