"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useToast } from "@/components/ui/ToastProvider";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { backgroundSyncYasamUserFromDb, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  ADMIN_LIBRARY_TENANT_ID,
  getSessionTenantId,
  getSyncedTenantId,
} from "@/lib/auth/sessionTenant";
import {
  excludeStonesForTenant,
  fetchAllStonesExtended,
  fetchStoneExclusions,
  fetchStonesListPage,
  stoneListImageCount,
  stonesListCacheKey,
  type SearchMode,
  type StoneListItem,
  type StoneListItemExtended,
} from "@/lib/dogaltas/stonesListFetch";
import {
  useSignedStoneImageUrls,
  imageFilePath,
  firstStoneImage,
  resolveImageSrc,
} from "@/lib/dogaltas/stoneImageClient";
import {
  fetchStonesListDeduped,
  readStonesList,
} from "@/lib/dogaltas/stonesListCache";
import {
  containsTr,
  stoneHasWarning,
  stoneMatchesMineral,
  stoneMatchesZodiac,
} from "@/lib/dogaltas/stoneSearchUtils";
import { deleteStone as apiDeleteStone, deleteStones } from "@/lib/dogaltas/dogaltasApi";
import {
  renderHighlightedText,
  SEARCH_MATCH_BADGE_CLASS,
} from "@/lib/dogaltas/searchHighlight";
import { DogaltasSectionShell } from "@/app/dogaltas/components/DogaltasSectionShell";
import { BulkExportBar } from "@/components/common/BulkExportBar";

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

function safeText(
  value: string | null | undefined,
  limit = 115,
  emptyLabel = "Kısa açıklama eklenmemiş.",
) {
  if (!value) return emptyLabel;
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

// FAZ-4A: Yükleme iskeleti de kart görünümüyle uyumlu — StoneCard grid ile aynı
// responsive kolon düzeni (1 / md:2 / xl:3). Liste/7-kolon hissi yok, yatay taşma yok.
function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`sk-${i}`}
          className="rounded-[18px] border-[3px] border-emerald-300/40 bg-white/85 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-slate-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-5 w-5 shrink-0 animate-pulse rounded-md bg-slate-200" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#ecfccb_38%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-4";
const uiHeaderCard =
  "rounded-[24px] border-[3px] border-emerald-400/45 bg-white/90 p-4 shadow-lg";
const uiFilterCard =
  "rounded-[20px] border-[3px] border-violet-300/45 bg-white/90 p-3 shadow-md";
const uiTableCard =
  "w-full min-h-[360px] overflow-hidden rounded-[22px] border-[3px] border-emerald-400/45 bg-white/92 shadow-lg";
const uiSearchInput =
  "h-10 w-full rounded-xl border-2 border-emerald-200 bg-white/90 px-4 pl-10 font-semibold shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";
const uiViewBtn =
  "rounded-xl px-4 py-2 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5";
const uiStatCard =
  "rounded-xl border-2 border-emerald-200 bg-white/85 px-3 py-2 text-center shadow-md";
const uiBadgeBase = "rounded-full border px-3 py-1 text-xs font-black shadow-sm";
const uiBadgeSection = `${uiBadgeBase} border-emerald-200 bg-emerald-50 text-emerald-700`;
const uiBadgeImage = `${uiBadgeBase} border-emerald-200 bg-emerald-50 text-emerald-700`;
const uiBadgeChakra = `${uiBadgeBase} border-violet-200 bg-violet-50 text-violet-700`;
const uiRowCheckbox =
  "h-5 w-5 shrink-0 cursor-pointer rounded-md border-2 border-emerald-300 text-emerald-600 shadow-sm accent-emerald-600 focus:ring-2 focus:ring-emerald-300/40";

// ─── Memoize edilmiş satır bileşenleri ──────────────────────────────────────
// Satırlar React.memo ile sarılır; yalnızca prop'ları değişen satır yeniden
// render olur (seçim/tuş = tüm-liste re-render fırtınası biter). Davranış ve
// markup birebir korunur; çift DOM (mobil+masaüstü) bilinçli olarak değişmedi.
type StoneRowSharedProps = {
  stone: StoneListItem;
  coverImageUrl: string | null;
  isSelected: boolean;
  isViewedInSearch: boolean;
  isLastViewed: boolean;
  isSearchActive: boolean;
  activeSearch: string;
  filterQueryString: string;
  isDemo: boolean;
  onToggleSelect: (id: string) => void;
  onNavigate: (id: string) => void;
  onDelete: (stone: StoneListItem) => void;
};

const StoneCard = memo(function StoneCard({
  stone,
  coverImageUrl,
  isSelected,
  isViewedInSearch,
  isLastViewed,
  isSearchActive,
  activeSearch,
  filterQueryString,
  isDemo,
  onToggleSelect,
  onNavigate,
  onDelete,
}: StoneRowSharedProps) {
  const t = useTranslations("stones.list");
  const tf = useTranslations("stones");
  const facet = (v: string) => (tf.has(`facetLabels.${v}`) ? tf(`facetLabels.${v}`) : v);
  const imageCount = stoneListImageCount(stone.images);
  // F-016: kapak URL'i parent'ta batch signed-URL ile çözülür (private-read, N+1'siz).
  const isLibraryStone = stone.tenant_id === ADMIN_LIBRARY_TENANT_ID;
  const detailHref = stoneDetailHref(stone.id, filterQueryString);
  const displayName = stone.stone_name || tf("common.unnamedStone");
  const displayDescription = safeText(stone.short_description, 120, t("card.noShortDescription"));

  return (
    <div
      className={`relative overflow-hidden rounded-[18px] border-[3px] bg-white/85 p-4 text-left shadow-[0_0_28px_rgba(34,211,238,0.10)] transition-all duration-300 hover:-translate-y-0.5 ${
        isSelected
          ? "border-violet-400/70 bg-violet-50/50"
          : isLastViewed
            ? "border-rose-200 bg-rose-50/50 ring-1 ring-rose-100"
            : "border-emerald-300/40 hover:border-violet-300/50"
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
        {!isDemo ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(stone.id)}
            onClick={(event) => event.stopPropagation()}
            aria-label={t("card.selectAria", { name: stone.stone_name || tf("common.unnamedStone") })}
            className={uiRowCheckbox}
          />
        ) : <span />}
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {isLibraryStone ? t("card.library") : isDemo ? "" : t("card.select")}
        </span>
      </div>
      <Link
        href={detailHref}
        onClick={() => {
          if (isSearchActive) onNavigate(stone.id);
        }}
        className={`group block ${isViewedInSearch ? "pl-2" : ""}`}
      >
        {isSearchActive ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className={SEARCH_MATCH_BADGE_CLASS}>{t("card.matchBadge")}</span>
            {isViewedInSearch ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                {t("card.viewed")}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
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
                  {facet(chakra)}
                </span>
              ))}

              <span className={uiBadgeSection}>
                {stone.short_description?.trim() ? t("card.summaryYes") : "—"}
              </span>

              <AdminTransferBadge originType={stone.origin_type} />

              {imageCount > 0 && (
                <span className={uiBadgeImage}>
                  {t("card.imageCount", { count: imageCount })}
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
            onNavigate(stone.id);
          }}
          className="text-xs font-bold text-emerald-700 transition hover:text-violet-700 xl:text-sm"
        >
          {t("card.readOnDetail")}
        </Link>

        {!isDemo && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(stone);
            }}
            aria-label={t("card.deleteAria", { name: stone.stone_name || tf("common.unnamedStone") })}
            // F-015a: destructive dokunma hedefi ~44×44px (mobil erişilebilirlik).
            className="btn-danger shrink-0 !min-h-[44px] !min-w-[44px] !rounded-lg !px-3 !py-1.5 !text-xs"
          >
            {t("card.delete")}
          </button>
        )}
      </div>
    </div>
  );
});

function DogaltasListesiPageContent() {
  const t = useTranslations("stones.list");
  // Facet chip display: filtre value KANONİK Türkçe (detailFilters.chakra + containsTr eşleşme);
  // yalnız etiket localize. Anahtar yoksa canonical'a düşer.
  const tf = useTranslations("stones");
  const tc = useTranslations("stones.common");
  const facet = (v: string) => (tf.has(`facetLabels.${v}`) ? tf(`facetLabels.${v}`) : v);
  const deleteConfirm = useDeleteConfirm();
  const { showToast } = useToast();
  const { isDemo } = useDemoGuard();
  // Liste verisi
  const [stones, setStones] = useState<StoneListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

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
  const [stoneToDelete, setStoneToDelete] = useState<StoneListItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDeleteStep, setMobileDeleteStep] = useState<1 | 2>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [excludedStoneIds, setExcludedStoneIds] = useState<Set<string>>(() => new Set());
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [wordBusy, setWordBusy] = useState(false);

  // PERF-2: unmount sonrası setState'i engelle (revalidate geç dönebilir).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;

      // PERF-2: cache yalnız normal (aramasız) liste sayfası için — return-to-list
      // senaryosu. Arama/append kapsam dışı (mevcut davranış korunur).
      const cacheKey =
        opts.reset && !opts.append && !search
          ? stonesListCacheKey({ offset, search, searchMode, withCount: opts.reset })
          : null;

      const applyResult = (rows: StoneListItem[], count: number | undefined) => {
        if (!mountedRef.current) return;
        if (typeof count === "number") setTotalCount(count);
        setStones((current) => (opts.append ? [...current, ...rows] : rows));
      };

      // SWR: fresh → anında göster + 0 GET; stale → anında göster + arka plan revalidate.
      let shownFromCache = false;
      if (cacheKey) {
        const cached = readStonesList<{ rows: StoneListItem[]; count?: number }>(cacheKey);
        if (cached.state === "fresh" && cached.value) {
          applyResult(cached.value.rows, cached.value.count);
          setListLoading(false);
          setErrorMessage("");
          return; // 0 ağ çağrısı, skeleton yok
        }
        if (cached.state === "stale" && cached.value) {
          applyResult(cached.value.rows, cached.value.count);
          shownFromCache = true;
          setListLoading(false);
          setErrorMessage("");
          // skeleton gösterme; aşağıdaki fetch sessiz revalidate'tir
        } else {
          setListLoading(true);
          setErrorMessage("");
        }
      } else if (opts.reset) {
        setListLoading(true);
        setErrorMessage("");
      } else {
        setLoadingMore(true);
      }

      // O-3: reset'te liste + toplam sayı TEK çağrıda (withCount).
      const runFetch = () =>
        fetchStonesListPage(tenantId, { offset, search, searchMode, withCount: opts.reset });

      // Cacheable ise dedupe + başarıda cache-write; değilse düz fetch.
      const pageRes = cacheKey
        ? await fetchStonesListDeduped(cacheKey, runFetch, (r) => !r.error)
        : await runFetch();

      if (!mountedRef.current) return;
      if (opts.reset) setListLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        setErrorMessage(t("error.fetchFailed", { error: pageRes.error }));
        // stale cache gösterildiyse listeyi boşaltma; yalnız hiç veri yoksa boşalt.
        if (opts.reset && !shownFromCache) setStones([]);
        return;
      }

      applyResult(pageRes.rows, opts.reset ? pageRes.count : undefined);
    },
    [debouncedSearch, searchMode, queryTenantId, t, tc],
  );

  const resolveTenant = useCallback(async () => {
    // PERF-4: Normal ilk açılışta `/stone-exclusions` çekilmez. Normal liste zaten
    // SUNUCUDA exclusion-filtreli döner (route: .not(id in excluded)); istemci
    // excludedStoneIds filtresi yalnız arama/detay (extended, sunucuda filtrelenmeyen)
    // yolunda gereklidir. Bu yüzden exclusions o yola ertelenir (aşağıdaki
    // needsFullLoad effect'i içinde extended veriyle birlikte çekilir) → cold-open
    // kritik yolundan bir tam auth+sorgu çağrısı (+olası 2. cold-start) kalkar.
    const cached = getSessionTenantId();
    if (cached) {
      setQueryTenantId(cached);
      backgroundSyncYasamUserFromDb();
      return cached;
    }
    const synced = await getSyncedTenantId();
    if (synced) {
      setQueryTenantId(synced);
    }
    return synced;
  }, []);

  async function deleteStone() {
    if (!stoneToDelete) return;
    if (isDemo) {
      setStoneToDelete(null);
      showToast({ type: "info", message: t("toast.demoAction") });
      return;
    }

    setDeleteLoading(true);
    setErrorMessage("");

    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      setDeleteLoading(false);
      setErrorMessage(tc("workspaceUnavailable"));
      return;
    }

    const stoneId = stoneToDelete.id;
    // Silme kararı oturum sahipliğine göre: kendi tenant'ı → gerçek DELETE,
    // başka tenant (paylaşılan kütüphane) → kullanıcı bazında gizle.
    const isLibrary = stoneToDelete.tenant_id !== tenantId;

    if (isLibrary) {
      // Kütüphane taşı → kullanıcı bazında gizle (soft-delete)
      const { error } = await excludeStonesForTenant(tenantId, [stoneId]);
      setDeleteLoading(false);
      if (error) {
        setErrorMessage(t("error.removeFailed", { error }));
        return;
      }
      setExcludedStoneIds((prev) => new Set([...prev, stoneId]));
    } else {
      // Kendi taşı → gerçek DELETE (server API, tenant guard)
      const { ok, error } = await apiDeleteStone(stoneId);

      setDeleteLoading(false);

      if (!ok) {
        setErrorMessage(t("error.deleteFailed", { error: error ?? t("error.tryAgain") }));
        return;
      }

      setStones((current) => current.filter((stone) => stone.id !== stoneId));
      setDetailData((prev) => (prev ? prev.filter((s) => s.id !== stoneId) : null));
    }

    // F-005: tekil silme sonrası "Toplam kayıt" sayacı oturum-içi güncellenir
    // (yenileme beklemeden doğru). Bulk delete zaten fetchList ile tazeliyor.
    setTotalCount((c) => Math.max(0, c - 1));

    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(stoneId);
      return next;
    });
    setStoneToDelete(null);
  }

  const selectedCount = selectedIds.size;

  // FAZ-1: toggleStoneSelection, StoneListRow/StoneCard React.memo'ya doğrudan
  // geçtiği için STABİL kalmalı (re-render fırtınası koruması). En güncel değerler
  // ref üzerinden okunur; refler efekt içinde senkronlanır (render'da mutasyon yok).
  const isMobileRef = useRef(isMobile);
  const selectedIdsRef = useRef(selectedIds);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    isMobileRef.current = isMobile;
    selectedIdsRef.current = selectedIds;
    showToastRef.current = showToast;
  });

  const toggleStoneSelection = useCallback((stoneId: string) => {
    // Mobil/PWA'da aynı anda en fazla 2 kayıt seçilebilir (yanlış toplu silme koruması).
    const cur = selectedIdsRef.current;
    if (isMobileRef.current && !cur.has(stoneId) && cur.size >= 2) {
      showToastRef.current({ type: "info", message: t("toast.maxSelectMobile") });
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(stoneId)) next.delete(stoneId);
      else if (isMobileRef.current && next.size >= 2) return current; // state seviyesinde sınır
      else next.add(stoneId);
      return next;
    });
  }, [t]);

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
      // PERF-4: extended veri exclusion uygulanmadan geldiği için, gizlenen taşların
      // bir an görünmesini önlemek adına exclusions'ı PARALEL çekip birlikte set et
      // (React aynı tick'te batch'ler → aradaki flash yok). Cache fresh ise 0 GET.
      const [{ rows }, exclusions] = await Promise.all([
        fetchAllStonesExtended(queryTenantId),
        fetchStoneExclusions(queryTenantId),
      ]);
      setExcludedStoneIds(exclusions);
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
    const candidateList: StoneListItem[] =
      needsFullLoad && detailData
        ? (detailData.filter((stone) => {
            // ── Metin araması — moda göre ayrılmış ────────────────────────────
            if (debouncedSearch) {
              if (searchMode === "name") {
                if (!containsTr(stone.stone_name, debouncedSearch)) return false;
              } else {
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
            // ── Detay filtreler ────────────────────────────────────────────────
            if (detailFilters.zodiac) {
              if (!stoneMatchesZodiac(stone.assignments, detailFilters.zodiac)) return false;
            }
            if (detailFilters.warningOnly) {
              if (!stoneHasWarning(stone.warning_text, stone.warning_tags)) return false;
            }
            if (detailFilters.mineral && detailFilters.mineral.length >= SEARCH_MIN_LENGTH) {
              if (!stoneMatchesMineral(stone.assignments, detailFilters.mineral)) return false;
            }
            if (detailFilters.chakra && detailFilters.chakra.trim().length >= SEARCH_MIN_LENGTH) {
              const chakraMatch = (stone.chakras || []).some((c) =>
                containsTr(c, detailFilters.chakra.trim()),
              );
              if (!chakraMatch) return false;
            }
            return true;
          }) as StoneListItem[])
        : stones;

    // Kullanıcının kaldırdığı taşları filtrele
    if (excludedStoneIds.size === 0) return candidateList;
    return candidateList.filter((s) => !excludedStoneIds.has(s.id));
  }, [
    stones,
    detailData,
    needsFullLoad,
    debouncedSearch,
    searchMode,
    detailFilters,
    excludedStoneIds,
  ]);

  // F-016: görünen taşların kapak file_path'leri için TOPLU signed URL (private-read).
  // Liste lazy-load ile büyüdükçe yalnız eksik path'ler istenir → N+1 yok.
  const coverFilePaths = useMemo(
    () => (filteredStones.map((s) => imageFilePath(firstStoneImage(s.images))).filter(Boolean) as string[]),
    [filteredStones],
  );
  const signedCoverUrls = useSignedStoneImageUrls(coverFilePaths);

  const hasMore = !needsFullLoad && stones.length < totalCount;
  const listBusy =
    listLoading ||
    detailLoading ||
    (isSearchActive && searchTerm.trim() !== debouncedSearch);

  const selectAllFiltered = useCallback(() => {
    // FAZ-1: Mobilde "Tümünü Seç" sınırsız seçim yaptırmaz (max 2 kuralı).
    if (isMobile) {
      showToast({ type: "info", message: t("toast.maxSelectMobile") });
      return;
    }
    setSelectedIds(new Set(filteredStones.map((stone) => stone.id)));
  }, [filteredStones, isMobile, showToast, t]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || listLoading || !hasMore) return;
    void fetchList({ reset: false, append: true, offset: stones.length });
  }, [fetchList, hasMore, listLoading, loadingMore, stones.length]);

  const deleteSelectedStones = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (isDemo) {
      showToast({ type: "info", message: t("toast.demoAction") });
      return;
    }

    const confirmed = await deleteConfirm({
      title: t("confirm.bulkTitle"),
      message: t("confirm.bulkMessage", { count: selectedIds.size }),
      secondMessage: t("confirm.bulkSecond"),
    });

    if (!confirmed) return;

    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      setErrorMessage(tc("workspaceUnavailable"));
      return;
    }

    // Kendi taşı vs kütüphane taşı ayrımı
    const allStones = [...(detailData ?? []), ...stones];
    const stoneById = new Map(allStones.map((s) => [s.id, s]));

    const ownIds: string[] = [];
    const libraryIds: string[] = [];
    for (const id of selectedIds) {
      const stone = stoneById.get(id);
      // Oturum sahipliği: kendi tenant'ı → gerçek DELETE, başka tenant → gizle.
      if (stone && stone.tenant_id !== tenantId) {
        libraryIds.push(id);
      } else {
        ownIds.push(id);
      }
    }

    setDeleteLoading(true);
    setErrorMessage("");

    let deletedCount = 0;
    let ownError: string | null = null;
    let libError: string | null = null;

    // Kendi taşları → gerçek DELETE (server API, tenant guard'lı tekil DELETE'ler)
    if (ownIds.length > 0) {
      const { deletedIds, error } = await deleteStones(ownIds);
      if (error) ownError = error;
      deletedCount += deletedIds.length;
      if (deletedIds.length > 0) {
        const deletedIdSet = new Set(deletedIds);
        setDetailData((prev) => (prev ? prev.filter((s) => !deletedIdSet.has(s.id)) : null));
      }
    }

    // Kütüphane taşları → exclusion (soft-delete)
    if (libraryIds.length > 0) {
      const { error } = await excludeStonesForTenant(tenantId, libraryIds);
      if (error) {
        libError = error;
      } else {
        setExcludedStoneIds((prev) => new Set([...prev, ...libraryIds]));
        deletedCount += libraryIds.length;
      }
    }

    setDeleteLoading(false);

    if (ownError || libError) {
      setErrorMessage(t("error.someRemoveFailed", { error: ownError ?? libError ?? "" }));
      return;
    }

    showToast({ type: "success", message: t("toast.removedCount", { count: deletedCount }) });
    setSelectedIds(new Set());
    if (ownIds.length > 0) await fetchList({ reset: true });
  }, [deleteConfirm, detailData, fetchList, queryTenantId, selectedIds, showToast, stones, isDemo, t, tc]);

  const loadedImages = useMemo(
    () =>
      filteredStones.reduce(
        (total, stone) => total + stoneListImageCount(stone.images),
        0,
      ),
    [filteredStones],
  );

  const exportStonesWord = useCallback(async (mode: "selected" | "all" | "filtered") => {
    if (isDemo) { showToast({ type: "info", message: t("toast.demoAction") }); return; }
    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) { showToast({ type: "error", message: tc("workspaceUnavailable") }); return; }
    const userId = readYasamUser()?.id;
    if (!userId) { showToast({ type: "error", message: tc("workspaceUnavailable") }); return; }
    const sessionToken = readSessionToken();

    setWordBusy(true);
    try {
      let selectedStoneIds: string[] | undefined;
      if (mode === "selected") {
        selectedStoneIds = [...selectedIds];
        if (!selectedStoneIds.length) { showToast({ type: "warning", message: t("toast.selectStoneFirst") }); return; }
      } else if (mode === "filtered") {
        selectedStoneIds = filteredStones.map((s) => s.id);
        if (!selectedStoneIds.length) { showToast({ type: "warning", message: t("toast.noFilteredResult") }); return; }
      }

      // F-018: kimlik header'dan; body'de userId/tenantId GÖNDERİLMEZ.
      const body: Record<string, unknown> = {
        sections: { stones: true },
        includeImages: false,
      };
      if (selectedStoneIds) body.selectedStoneIds = selectedStoneIds;

      const res = await fetch("/api/dogaltas/word-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        // FAZ-4A: ham backend hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
        console.error("[dogaltas-listesi] Word raporu hatası:", data.error ?? `HTTP ${res.status}`);
        throw new Error("report-failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const modeSlug = mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu";
      a.download = `dogaltas-${modeSlug}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      // FAZ-4A: "İndirildi" demiyoruz — tarayıcının gerçek konumunu/tamamlanmayı doğrulayamayız.
      showToast({ type: "success", message: t("toast.wordStarted") });
    } catch (err) {
      console.error("[dogaltas-listesi] Word raporu hatası:", err);
      showToast({ type: "error", message: t("toast.wordFailed") });
    } finally {
      setWordBusy(false);
    }
  }, [queryTenantId, selectedIds, filteredStones, showToast, isDemo, t, tc]);

  return (
    <DogaltasSectionShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      icon="💎"
      actions={
        <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
          <div className={uiStatCard}>
            <div className="text-lg font-black text-slate-950">
              {totalCount}
            </div>
            <div className="text-xs font-bold text-slate-500">{t("stat.total")}</div>
          </div>

          <div className={uiStatCard}>
            <div className="text-lg font-black text-slate-950">
              {filteredStones.length}
            </div>
            <div className="text-xs font-bold text-slate-500">
              {isDetailFilterActive ? t("stat.matched") : t("stat.loaded")}
            </div>
          </div>

          <div className={uiStatCard}>
            <div className="text-lg font-black text-slate-950">{loadedImages}</div>
            <div className="text-xs font-bold text-slate-500">{t("stat.image")}</div>
          </div>
        </div>
      }
    >
      <div className={pageContent}>
        {isDemo && (
          <DemoModuleBanner message={t("demoBanner")} />
        )}

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
                    {t("search.modeName")}
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
                    {t("search.modeContent")}
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
                    // F-015b: yalnız placeholder erişilebilir ad değildir → aria-label.
                    aria-label={
                      searchMode === "name"
                        ? t("search.ariaName")
                        : t("search.ariaContent")
                    }
                    value={searchTerm}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                    placeholder={
                      searchMode === "name"
                        ? t("search.placeholderName")
                        : t("search.placeholderContent")
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
                  {isDetailFilterActive ? t("search.filtered") : t("search.detail")}
                </button>
              </div>

              {/* Aktif detay filtre rozetleri */}
              {isDetailFilterActive && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {detailFilters.zodiac && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-800">
                      {t("filters.badgeAstro", { value: detailFilters.zodiac })}
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, zodiac: "" }))}
                        className="ml-0.5 text-violet-400 hover:text-violet-900"
                        aria-label={t("filters.removeAstroAria")}
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {detailFilters.chakra && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-800">
                      {t("filters.badgeChakra", { value: detailFilters.chakra })}
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, chakra: "" }))}
                        className="ml-0.5 text-indigo-400 hover:text-indigo-900"
                        aria-label={t("filters.removeChakraAria")}
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {detailFilters.warningOnly && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      {t("filters.badgeWarning")}
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, warningOnly: false }))}
                        className="ml-0.5 text-amber-400 hover:text-amber-900"
                        aria-label={t("filters.removeWarningAria")}
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {detailFilters.mineral && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                      {t("filters.badgeMineral", { value: detailFilters.mineral })}
                      <button
                        type="button"
                        onClick={() => setDetailFilters((f) => ({ ...f, mineral: "" }))}
                        className="ml-0.5 text-emerald-400 hover:text-emerald-900"
                        aria-label={t("filters.removeMineralAria")}
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
                    {t("filters.clearAll")}
                  </button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* FAZ-4A: Liste/Kart görünüm toggle'ı kaldırıldı — ekran yalnız kart grid. */}
              {!isDemo && (
                <Link
                  href="/dogaltas/dogaltas-kayit"
                  className="btn-primary"
                >
                  {t("newRecord")}
                </Link>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold text-slate-400">
              {isDetailFilterActive
                ? t("status.matchDetail", { count: filteredStones.length })
                : isSearchActive
                  ? t("status.searchResult", { query: activeSearch, count: filteredStones.length })
                  : t("status.showingRecords", { count: filteredStones.length })}
            </p>

            {listBusy && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                {detailLoading
                  ? t("status.filterLoading")
                  : isSearchActive && searchTerm.trim() !== debouncedSearch
                    ? t("status.searching")
                    : t("status.loading")}
              </span>
            )}
          </div>

          {!listLoading && filteredStones.length > 0 && !isDemo ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <BulkExportBar
                compact
                selectedCount={selectedCount}
                totalCount={totalCount}
                filteredCount={filteredStones.length}
                hasActiveFilter={isSearchActive || isDetailFilterActive}
                selectAllLabel={t("bulk.selectAll")}
                selectAllCount={filteredStones.length}
                onSelectAll={selectAllFiltered}
                hideSelectAll={isMobile}
                exportSelectedLabel={t("bulk.exportSelected")}
                onClearSelection={clearSelection}
                onExportSelected={() => void exportStonesWord("selected")}
                onExportFiltered={() => void exportStonesWord("filtered")}
                onExportAll={() => void exportStonesWord("all")}
                onDeleteSelected={() => void deleteSelectedStones()}
                isExporting={wordBusy}
                isDeleting={deleteLoading}
              />
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
            <CardSkeletonGrid count={8} />
          ) : filteredStones.length === 0 ? (
            <div className="flex h-[360px] flex-col items-center justify-center px-6 text-center">
              {/* İkon */}
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-violet-100 text-4xl shadow-sm ring-1 ring-emerald-200/60">
                💎
              </div>

              {isDetailFilterActive || isSearchActive ? (
                /* Filtre / arama sonucu boş */
                <>
                  <h3 className="mt-4 text-lg font-black text-slate-900">
                    {t("empty.noResultTitle")}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    {t("empty.noResultDesc")}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {isSearchActive && (
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        {t("empty.clearSearch")}
                      </button>
                    )}
                    {isDetailFilterActive && (
                      <button
                        type="button"
                        onClick={() => setDetailFilters(EMPTY_DETAIL_FILTERS)}
                        className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-100"
                      >
                        {t("clearFilters")}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* Kütüphane boş */
                <>
                  <h3 className="mt-4 text-lg font-black text-slate-900">
                    {t("empty.noRecordTitle")}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    {t("empty.noRecordDesc")}
                  </p>
                  <Link
                    href="/dogaltas/dogaltas-kayit"
                    className="btn-primary mt-5"
                  >
                    {t("empty.newRecordAdd")}
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredStones.map((stone) => (
                <StoneCard
                  key={stone.id}
                  stone={stone}
                  coverImageUrl={resolveImageSrc(firstStoneImage(stone.images), signedCoverUrls)}
                  isSelected={selectedIds.has(stone.id)}
                  isViewedInSearch={isSearchActive && viewedStoneIds.has(stone.id)}
                  isLastViewed={stone.id === lastViewedStoneId}
                  isSearchActive={isSearchActive}
                  activeSearch={activeSearch}
                  filterQueryString={filterQueryString}
                  isDemo={isDemo}
                  onToggleSelect={toggleStoneSelection}
                  onNavigate={handleStoneNavigate}
                  onDelete={setStoneToDelete}
                />
              ))}
            </div>
          )}

          {hasMore && filteredStones.length > 0 ? (
            <div className="flex justify-center border-t border-emerald-100 bg-white/80 px-5 py-4">
              <button
                type="button"
                disabled={loadingMore || listLoading}
                onClick={handleLoadMore}
                className={`${uiViewBtn} border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-violet-50 text-slate-800 hover:from-emerald-100 hover:to-violet-100 disabled:opacity-60`}
              >
                {loadingMore
                  ? t("status.loading")
                  : t("loadMore", { loaded: stones.length, total: totalCount })}
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
                  {t("panel.eyebrow")}
                </div>
                <h2 className="text-base font-black text-slate-950">{t("panel.title")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label={t("panel.closeAria")}
              >
                ×
              </button>
            </div>

            {/* A) Astrolojik Atama — manuel text input */}
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-black text-slate-700">{t("panel.astroLabel")}</div>
              <input
                type="text"
                value={detailFilters.zodiac}
                onChange={(e) =>
                  setDetailFilters((f) => ({ ...f, zodiac: e.target.value }))
                }
                placeholder={t("panel.astroPlaceholder")}
                className="h-9 w-full rounded-xl border-2 border-slate-200 px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                {t("panel.astroHint")}
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
                  {t("panel.warningLabel")}
                </span>
              </label>
              <p className="mt-1.5 pl-6 text-[10px] font-medium text-slate-400">
                {t("panel.warningHint")}
              </p>
            </div>

            {/* C) Çakra Filtresi — chip seçim + manuel input */}
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-black text-slate-700">{t("panel.chakraLabel")}</div>
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
                    {facet(chip)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={detailFilters.chakra}
                onChange={(e) =>
                  setDetailFilters((f) => ({ ...f, chakra: e.target.value }))
                }
                placeholder={t("panel.chakraPlaceholder")}
                className="h-9 w-full rounded-xl border-2 border-slate-200 px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                {t("panel.chakraHint")}
              </p>
            </div>

            {/* D) Mineral Arama */}
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-black text-slate-700">
                {t("panel.mineralLabel")}
              </div>
              <input
                type="text"
                value={detailFilters.mineral}
                onChange={(e) =>
                  setDetailFilters((f) => ({ ...f, mineral: e.target.value }))
                }
                placeholder={t("panel.mineralPlaceholder")}
                className="h-9 w-full rounded-xl border-2 border-slate-200 px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                {t("panel.mineralHint")}
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4">
              <button
                type="button"
                onClick={() => setDetailFilters(EMPTY_DETAIL_FILTERS)}
                className="text-xs font-bold text-slate-500 transition hover:text-rose-600"
              >
                {t("clearFilters")}
              </button>
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen(false)}
                className="btn-primary"
              >
                {t("panel.apply")}
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
                  {t("deleteDialog.finalTitle")}
                </h2>
                <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
                  {t.rich("deleteDialog.finalDesc", { b: (chunks) => <b>{chunks}</b> })}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStoneToDelete(null)}
                    disabled={deleteLoading}
                    className="btn-soft !min-h-[44px]"
                  >
                    {t("deleteDialog.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={deleteStone}
                    disabled={deleteLoading}
                    className="btn-danger !min-h-[44px]"
                  >
                    {deleteLoading ? t("deleteDialog.deleting") : t("deleteDialog.confirmPermanent")}
                  </button>
                </div>
              </>
            ) : isMobile ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
                  ⚠️
                </div>
                <h2 className="mt-4 text-[22px] font-black text-slate-950">
                  {t("deleteDialog.title")}
                </h2>
                <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
                  {t.rich("deleteDialog.mobileQuestion", {
                    name: stoneToDelete.stone_name || tf("common.unnamedStone"),
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStoneToDelete(null)}
                    className="btn-soft !min-h-[44px]"
                  >
                    {t("deleteDialog.no")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileDeleteStep(2)}
                    className="btn-danger !min-h-[44px]"
                  >
                    {t("deleteDialog.yes")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
                  ⚠️
                </div>
                <h2 className="mt-4 text-[22px] font-black text-slate-950">
                  {t("deleteDialog.title")}
                </h2>
                <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
                  {t.rich("deleteDialog.desktopQuestion", {
                    name: stoneToDelete.stone_name || tf("common.unnamedStone"),
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </p>
                <p className="mt-2 text-[12px] font-bold text-rose-600">
                  {t("deleteDialog.irreversible")}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStoneToDelete(null)}
                    disabled={deleteLoading}
                    className="btn-soft !min-h-[44px]"
                  >
                    {t("deleteDialog.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={deleteStone}
                    disabled={deleteLoading}
                    className="btn-danger !min-h-[44px]"
                  >
                    {deleteLoading ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DogaltasSectionShell>
  );
}

function DogaltasListesiPageFallback() {
  return (
    <main className={pageBg}>
      <div className={pageContent}>
        <div className={`${uiTableCard} p-0`}>
          <CardSkeletonGrid count={8} />
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
