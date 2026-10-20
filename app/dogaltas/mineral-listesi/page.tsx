"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { backgroundSyncYasamUserFromDb, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
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
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { useToast } from "@/components/ui/ToastProvider";
import { bulkDeleteMinerals } from "@/lib/dogaltas/dogaltasApi";
import {
  renderHighlightedText,
  SEARCH_MATCH_BADGE_CLASS,
} from "@/lib/dogaltas/searchHighlight";
import { Database, FileText, Search } from "lucide-react";
import {
  DogaltasEmptyState,
  DogaltasPremiumShell,
  DogaltasSearchField,
  DogaltasStat,
  DogaltasStats,
  dp,
} from "@/app/dogaltas/components/premium/DogaltasPremium";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { browserSessionStorage, markChecked, readCheckedIds, searchContextKey } from "@/lib/search/searchChecked";
import { SearchCheckedBadge, SEARCH_CHECKED_CARD_ACCENT } from "@/components/search/SearchCheckedBadge";

/** WT8: eski bağlamsız, hiç silinmeyen localStorage "Bakıldı" listesi — yalnız temizlik için. */
const LEGACY_VIEWED_STORAGE_KEY = "yasam-mineral-viewed-search-results";
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
  // "Tümünü Seç" ile seçilen ama henüz listede yüklenmemiş minerallerin adları (onay ekranı için).
  const [scopeNames, setScopeNames] = useState<Map<string, string>>(() => new Map());
  const [selectingAll, setSelectingAll] = useState(false);
  const [mineralWordBusy, setMineralWordBusy] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  // Word raporu modal
  const [showWordModal, setShowWordModal] = useState(false);
  const [wordExportMode, setWordExportMode] = useState<"all" | "selected">("all");
  const [wordReportLoading, setWordReportLoading] = useState(false);
  const [wordReportError, setWordReportError] = useState("");
  const [wordReportSuccess, setWordReportSuccess] = useState("");

  const deleteConfirm = useDeleteConfirm();
  const { showToast } = useToast();
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
        setErrorMessage(tc("workspaceUnavailable"));
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
        setErrorMessage(t("loadError", { error: pageRes.error }));
        if (opts.reset) setMinerals([]);
        return;
      }

      if (countRes.error) {
        setErrorMessage(t("countError", { error: countRes.error }));
      } else if (opts.reset) {
        setTotalCount(countRes.count);
      }

      setMinerals((current) =>
        opts.append ? [...current, ...pageRes.rows] : pageRes.rows,
      );
    },
    [categoryFilter, debouncedSearch, queryTenantId, totalCount, t, tc],
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

  // WT8: "Kontrol edildi" — Doğaltaş Detay Arama ile ORTAK mantık (lib/search/searchChecked):
  // arama bağlamına bağlı, sessionStorage; yeni arama temiz başlar, önceki aramaya dönünce geri gelir.
  const checkedContext = searchContextKey({ scope: "minerals", query: debouncedSearch });
  const checkedContextRef = useRef(checkedContext);
  useEffect(() => {
    checkedContextRef.current = checkedContext;
    runInEffect(() => setViewedMineralIds(readCheckedIds(browserSessionStorage(), checkedContext)));
  }, [checkedContext]);
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_VIEWED_STORAGE_KEY); } catch { /* erişim yok */ }
    const refreshViewed = () => setViewedMineralIds(readCheckedIds(browserSessionStorage(), checkedContextRef.current));
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);

  const handleResultNavigate = useCallback((mineralId: string) => {
    const ctx = checkedContextRef.current;
    if (ctx) setViewedMineralIds(markChecked(browserSessionStorage(), ctx, mineralId));
  }, []);

  // WT3.1 (owner kararı 2026-10-08): mobil "en fazla 2 seçim" sınırı KALDIRILDI — mobilde de
  // gerçek "Tümünü Seç" + serbest seçim. Yanlış toplu silme koruması 3 aşamalı onaydır (#350).
  const toggleMineralSelection = useCallback((id: string) => {
    setSelectedMineralIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * "Tümünü Seç": sayfalı listede YÜKLÜ olanlarla sınırlı DEĞİL — aktif arama/kategori kapsamındaki
   * TÜM mineraller sunucudan (100'lük sayfalarla) toplanır ve açıkça seçilir. Gizli kapsam yoktur:
   * seçili sayı = seçilen kayıt sayısı; silme/Word tam olarak bu kümeyi kullanır.
   */
  const selectAllMinerals = useCallback(async () => {
    if (selectingAll) return;
    if (minerals.length >= totalCount) {
      setSelectedMineralIds(new Set(minerals.map((m) => m.id)));
      return;
    }
    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) return;
    setSelectingAll(true);
    try {
      const search = debouncedSearch.trim() || undefined;
      const category =
        categoryFilter.trim() === UNCATEGORIZED_LABEL
          ? MINERALS_UNCATEGORIZED_FILTER
          : categoryFilter.trim() || undefined;
      const names = new Map<string, string>();
      const PAGE = 100;
      for (let offset = 0; offset < 100_000; offset += PAGE) {
        const page = await fetchMineralsListPage(tenantId, { offset, limit: PAGE, search, category });
        if (page.error) throw new Error(page.error);
        for (const m of page.rows) names.set(m.id, m.name);
        if (page.rows.length < PAGE) break;
      }
      setScopeNames(names);
      setSelectedMineralIds(new Set(names.keys()));
    } catch {
      showToast({ type: "error", message: t("selectAllFailed") });
    } finally {
      setSelectingAll(false);
    }
  }, [categoryFilter, debouncedSearch, minerals, queryTenantId, selectingAll, showToast, t, totalCount]);

  const clearMineralSelection = useCallback(() => {
    setSelectedMineralIds(new Set());
    setScopeNames(new Map());
  }, []);

  // Arama/kategori (kapsam) değişince seçim TEMİZLENİR — önceki kapsamdan gizli seçili kayıt kalmaz.
  // ("Daha fazla yükle" kapsamı değiştirmez → seçim korunur.)
  useEffect(() => {
    runInEffect(() => {
      setSelectedMineralIds((prev) => (prev.size === 0 ? prev : new Set()));
      setScopeNames((prev) => (prev.size === 0 ? prev : new Map()));
    });
  }, [debouncedSearch, categoryFilter]);

  const mineralNameOf = useCallback(
    (id: string) => minerals.find((m) => m.id === id)?.name ?? scopeNames.get(id) ?? id,
    [minerals, scopeNames],
  );

  async function handleBulkDelete() {
    // Seçim açıktır (kapsam değişince temizlenir) → silinecek küme tam olarak seçili kayıtlar.
    const ids = [...selectedMineralIds];
    if (!ids.length || bulkDeleteBusy) return;

    const ok = await deleteConfirm({
      title: t("deleteConfirmTitle"),
      count: ids.length,
      message: t("deleteConfirmMessage", { n: ids.length }),
      names: ids.map(mineralNameOf),
    });
    if (!ok) return;

    const tid = queryTenantId ?? (await getSyncedTenantId());
    if (!tid) return;

    setBulkDeleteBusy(true);
    try {
      const { ok, error, deleted, demo } = await bulkDeleteMinerals(ids);

      if (!ok) {
        showToast({ type: "error", message: t("deleteFailed", { error: error ?? tRoot("unknownError") }) });
        return;
      }

      // Gerçek silinen satır sayısı sunucudan gelir (demo'da simüle → ids.length).
      const affected = demo ? ids.length : deleted ?? ids.length;
      setMinerals((prev) => prev.filter((m) => !ids.includes(m.id)));
      setTotalCount((prev) => Math.max(0, prev - affected));
      clearMineralSelection();
      showToast({ type: "success", message: t("deleteSuccess", { n: affected }) });
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
      await downloadFileResponse(res, `mineral-secili-${reportFileDate()}.docx`);
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

    // Kapsam yalnız iki mantık: TÜM mineraller veya kullanıcının SEÇTİKLERİ ("görünenler" yok).
    let mineralIds: string[] | undefined;
    if (wordExportMode === "selected") {
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
      await downloadFileResponse(res, `mineral-bankasi-raporu-${reportFileDate()}.docx`);
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
    <DogaltasPremiumShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      aside={
        <DogaltasStats columns={2}>
          <DogaltasStat icon={<Database className="h-5 w-5" />} value={totalCount} label={t("totalLabel")} />
          <DogaltasStat
            icon={<FileText className="h-5 w-5" />}
            value={filteredMinerals.length}
            label={hasMore ? t("loadedTotal") : t("visibleResult")}
          />
        </DogaltasStats>
      }
    >
        <section className={dp.panel}>
          {/* FAZ-3A: Arama alanı öncelikli — kendi satırında tam genişlik; kategori/Word/Yeni
              ikincil satırda ve aramayı daraltmaz. Responsive: mobilde hepsi alt alta. */}
          <DogaltasSearchField
            type="search"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
          <div className={`${dp.panelRow} mt-3`}>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={dp.select}
              aria-label={t("categoryFilterAria")}
            >
              <option value="">{t("allCategories")}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === UNCATEGORIZED_LABEL ? t("uncategorized") : cat}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              {!isDemo && (
                <button
                  type="button"
                  onClick={() => { setShowWordModal(true); setWordReportError(""); setWordReportSuccess(""); }}
                  className={`btn-soft ${dp.actionTall} flex-1 sm:flex-none`}
                >
                  {t("wordReportButton")}
                </button>
              )}
              {!isDemo && (
                <Link
                  href="/dogaltas/mineral-bankasi"
                  className={`btn-primary ${dp.actionTall} flex-1 sm:flex-none`}
                >
                  {t("newMineral")}
                </Link>
              )}
            </div>
          </div>
          {isSearchActive || listBusy ? (
            <p className={`${dp.meta} ${dp.metaStrong} mt-3`}>
              {listBusy
                ? t("searching")
                : t("searchResult", { q: activeSearch, n: totalCount })}
            </p>
          ) : null}

          {/* Toplu işlem çubuğu */}
          {!isDemo && !listLoading && filteredMinerals.length > 0 && (
            <div className={dp.bulkArea}>
              <BulkExportBar
                compact
                selectedCount={selectedMineralIds.size}
                totalCount={totalCount}
                selectAllLabel={selectingAll ? t("selectingAll") : (isSearchActive || categoryFilter ? t("selectAllResults") : t("selectAllLabel"))}
                selectAllCount={totalCount}
                onSelectAll={() => void selectAllMinerals()}
                onClearSelection={clearMineralSelection}
                exportSelectedLabel={t("exportSelectedLabel")}
                onExportSelected={() => void exportSelectedMineralsWord()}
                onDeleteSelected={() => void handleBulkDelete()}
                isExporting={mineralWordBusy}
                isDeleting={bulkDeleteBusy}
              />
            </div>
          )}
        </section>

        {errorMessage ? (
          <div className={dp.alert} role="alert">
            {errorMessage}
          </div>
        ) : null}

        <section>
          {listLoading && filteredMinerals.length === 0 ? (
            <div className={dp.empty}>
              <p className={dp.meta}>{t("loadingList")}</p>
            </div>
          ) : isEmptyDatabase ? (
            <DogaltasEmptyState art="mineral" title={t("emptyDbTitle")} text={t("emptyDbText")} />
          ) : isEmptyFiltered ? (
            <DogaltasEmptyState
              icon={<Search className="h-7 w-7" strokeWidth={1.8} />}
              title={t("emptyFilteredTitle")}
              text={t("emptyFilteredText")}
            />
          ) : (
            <>
            <div className={dp.grid}>
              {filteredMinerals.map((mineral) => {
                const categoryLabel = getCategoryLabel(mineral.kategori);
                const showCategoryPill = categoryLabel !== UNCATEGORIZED_LABEL;
                // Sentinel "Kategorisiz" görünen etiketi localize; gerçek kategori adları DB verisi → aynen.
                const categoryDisplay = categoryLabel === UNCATEGORIZED_LABEL ? t("uncategorized") : categoryLabel;
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
                    className={`${dp.card} ${
                      !isMineralSelected && isViewedInSearch
                        ? `border-l-4 !border-l-emerald-500 ${SEARCH_CHECKED_CARD_ACCENT}`
                        : !isMineralSelected && isSearchActive
                          ? "border-l-4 !border-l-amber-400"
                          : ""
                    }`}
                    data-selected={isMineralSelected ? "true" : undefined}
                  >
                    {isViewedInSearch ? (
                      <span
                        className="absolute bottom-0 left-0 top-0 w-1.5 bg-emerald-500"
                        aria-hidden
                      />
                    ) : null}

                    <div className={`${dp.cardTop} ${isViewedInSearch ? "pl-2" : ""}`}>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {showCategoryPill ? (
                          <span className={dp.chip}>
                            {isSearchActive
                              ? renderHighlightedText(categoryDisplay, activeSearch)
                              : categoryDisplay}
                          </span>
                        ) : (
                          <span className={dp.cardKicker}>
                            {isSearchActive
                              ? renderHighlightedText(categoryDisplay, activeSearch)
                              : categoryDisplay}
                          </span>
                        )}
                        {isSearchActive ? (
                          <span className={SEARCH_MATCH_BADGE_CLASS}>{tRoot("searchMatchBadge")}</span>
                        ) : null}
                        {isViewedInSearch ? <SearchCheckedBadge label={t("viewedBadge")} /> : null}
                      </div>
                      {/* Mineral seçim checkbox — demo'da gizli */}
                      {!isDemo && (
                        <input
                          type="checkbox"
                          checked={isMineralSelected}
                          onChange={(e) => { e.stopPropagation(); toggleMineralSelection(mineral.id); }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={mineral.name}
                          className={dp.checkbox}
                        />
                      )}
                    </div>

                    <div className={`${dp.cardBody} ${isViewedInSearch ? "pl-2" : ""}`}>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <h2 className={dp.cardTitleWrap}>
                          {isSearchActive
                            ? renderHighlightedText(mineral.name, activeSearch)
                            : mineral.name}
                        </h2>
                        <AdminTransferBadge originType={mineral.origin_type} className="mt-1" />
                        <DemoBlur isProtected={isPreviewProtected} intensity={4} className="flex-1">
                          <p className={dp.cardText}>
                            {isSearchActive
                              ? renderHighlightedText(descriptionPreview, activeSearch)
                              : descriptionPreview}
                          </p>
                        </DemoBlur>
                      </div>
                    </div>

                    <div className={dp.cardFooter}>
                      <Link
                        href={detailHref}
                        onClick={() => {
                          if (isSearchActive) handleResultNavigate(mineral.id);
                        }}
                        className={dp.readLink}
                      >
                        {t("detailLink")}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            {hasMore && filteredMinerals.length > 0 ? (
              <div className={`${dp.loadMore} mt-4`}>
                <button
                  type="button"
                  disabled={loadingMore || listLoading}
                  onClick={handleLoadMore}
                  className="btn-soft"
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

      {/* Word raporu modal — demo'da gizli */}
      {!isDemo && showWordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-3 backdrop-blur-sm sm:p-4">
          <div role="dialog" aria-modal="true" data-testid="word-modal" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200/50 sm:p-6">
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
                ["selected", selectedMineralIds.size > 0 ? tWord("modeSelectedCount", { n: selectedMineralIds.size }) : tWord("modeSelected"), null],
              ] as const).map(([mode, label, count]) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                    wordExportMode === mode
                      ? "border-violet-300 bg-violet-50"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="mineralExportMode"
                    value={mode}
                    checked={wordExportMode === mode}
                    onChange={() => setWordExportMode(mode)}
                    className="mt-0.5 h-4 w-4 accent-emerald-600"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                    {count !== null && (
                      <span className="ml-2 text-xs font-medium text-slate-400">{count}</span>
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
    </DogaltasPremiumShell>
  );
}

function MineralListesiPageFallback() {
  const tRoot = useTranslations("stones.minerals");
  return (
    <main className={`${dp.page} flex items-center justify-center`}>
      <p className="relative z-10 text-base font-semibold text-emerald-800">{tRoot("fallbackLoading")}</p>
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
