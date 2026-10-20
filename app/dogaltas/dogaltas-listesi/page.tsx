"use client";

import { runInEffect } from "@/lib/runInEffect";
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
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { useToast } from "@/components/ui/ToastProvider";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { backgroundSyncYasamUserFromDb, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
} from "@/lib/auth/sessionTenant";
import {
  excludeStonesForTenant,
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
import { deleteStone as apiDeleteStone, deleteStones } from "@/lib/dogaltas/dogaltasApi";
import { fetchStonesByConditions } from "@/lib/dogaltas/conditionSearchApi";
import {
  renderHighlightedText,
  SEARCH_MATCH_BADGE_CLASS,
} from "@/lib/dogaltas/searchHighlight";
import { CalendarDays, Database, FileText, Gem, Image as ImageIcon, Search, SlidersHorizontal } from "lucide-react";
import {
  DogaltasEmptyState,
  DogaltasPremiumShell,
  DogaltasSearchField,
  DogaltasStat,
  DogaltasStats,
  dp,
} from "@/app/dogaltas/components/premium/DogaltasPremium";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { reportErrorKind } from "@/lib/dogaltas/reportErrorKind";
import {
  browserSessionStorage,
  markChecked,
  readCheckedIds,
  searchContextKey,
} from "@/lib/dogaltas/searchChecked";
import { SearchCheckedBadge, SEARCH_CHECKED_CARD_ACCENT } from "@/components/search/SearchCheckedBadge";

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

// Final-A1: "İçerik" araması detaydan geri dönünce "Taş İsmi"ne düşüyordu (searchMode yalnız state'teydi).
// Mod artık q ile birlikte URL'de (`mode=content`; varsayılan "name" URL'e yazılmaz → eski linkler aynı).
const SEARCH_MODE_URL_PARAM = "mode";
const LIST_SCROLL_KEY = "yasam-dogaltas-list-scroll";

function readUrlSearchMode(): SearchMode {
  if (typeof window === "undefined") return "name";
  return new URLSearchParams(window.location.search).get(SEARCH_MODE_URL_PARAM) === "content" ? "content" : "name";
}

type ListScrollMark = { qs: string; y: number; id: string; top: number | null };

function stoneLinkEl(stoneId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`a[href^="/dogaltas/dogaltas-listesi/${CSS.escape(stoneId)}"]`);
}

/**
 * Detaya giderken liste konumu (aynı arama bağlamı için) — geri dönünce sonuçlar gelince geri yüklenir.
 * Açılan taşın ekrandaki yeri de saklanır: üstteki alanların yüksekliği değişse bile (ör. "Kontrol
 * edildi" etiketi) kart aynı yerde görünür; kart yoksa mutlak konuma dönülür.
 */
function saveListScroll(queryString: string, stoneId: string) {
  try {
    const top = stoneLinkEl(stoneId)?.getBoundingClientRect().top ?? null;
    const mark: ListScrollMark = { qs: queryString, y: window.scrollY, id: stoneId, top };
    sessionStorage.setItem(LIST_SCROLL_KEY, JSON.stringify(mark));
  } catch {}
}

function takeListScroll(queryString: string): ListScrollMark | null {
  try {
    const raw = sessionStorage.getItem(LIST_SCROLL_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ListScrollMark>;
    if (v.qs !== queryString || typeof v.y !== "number" || typeof v.id !== "string") return null;
    sessionStorage.removeItem(LIST_SCROLL_KEY);
    return { qs: v.qs, y: v.y, id: v.id, top: typeof v.top === "number" ? v.top : null };
  } catch {
    return null;
  }
}

function restoreListScroll(mark: ListScrollMark) {
  const el = stoneLinkEl(mark.id);
  if (el && mark.top !== null) {
    window.scrollBy({ top: el.getBoundingClientRect().top - mark.top });
    return;
  }
  window.scrollTo({ top: mark.y });
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
    <div className={dp.grid}>
      {Array.from({ length: count }, (_, i) => (
        <div key={`sk-${i}`} className={dp.card}>
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-slate-200/80" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200/80" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
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
  // Ortak kütüphane YOK: owner'ın kendi taşları dahil herkesin kendi kaydı normal kayıttır.
  const sessionTenant = getSessionTenantId();
  const isLibraryStone = sessionTenant !== null && stone.tenant_id !== sessionTenant;
  const detailHref = stoneDetailHref(stone.id, filterQueryString);
  const displayName = stone.stone_name || tf("common.unnamedStone");
  const displayDescription = safeText(stone.short_description, 120, t("card.noShortDescription"));

  return (
    <div
      className={`${dp.card} ${
        isViewedInSearch
          ? `border-l-4 !border-l-emerald-500 ${SEARCH_CHECKED_CARD_ACCENT}`
          : isSearchActive
            ? "border-l-4 !border-l-amber-400"
            : ""
      }`}
      data-selected={isSelected ? "true" : undefined}
      data-recent={!isSelected && isLastViewed ? "true" : undefined}
    >
      {isViewedInSearch ? (
        <span
          className="absolute bottom-0 left-0 top-0 w-1.5 bg-emerald-500"
          aria-hidden
        />
      ) : null}
      <div className={dp.cardTop}>
        <div className="flex min-w-0 items-center gap-2">
          {!isDemo ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(stone.id)}
              onClick={(event) => event.stopPropagation()}
              aria-label={t("card.selectAria", { name: stone.stone_name || tf("common.unnamedStone") })}
              className={dp.checkbox}
            />
          ) : null}
          <span className={dp.cardKicker}>
            {isLibraryStone ? t("card.library") : isDemo ? "" : t("card.select")}
          </span>
        </div>
        <span className={dp.date}>
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {formatDate(stone.updated_at)}
        </span>
      </div>
      <Link
        href={detailHref}
        onClick={() => onNavigate(stone.id)}
        className={`group flex min-w-0 flex-1 flex-col ${isViewedInSearch ? "pl-2" : ""}`}
      >
        {isSearchActive || isViewedInSearch ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {isSearchActive ? <span className={SEARCH_MATCH_BADGE_CLASS}>{t("card.matchBadge")}</span> : null}
            {isViewedInSearch ? <SearchCheckedBadge label={t("card.viewed")} /> : null}
          </div>
        ) : null}
        <div className={dp.cardBody}>
          {/* Yalnız kullanıcının yüklediği gerçek kapak fotoğrafı; yoksa herkeste aynı nötr simge. */}
          <div className={dp.thumb}>
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <Gem className="h-6 w-6" strokeWidth={1.6} aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className={dp.cardTitle}>
              {isSearchActive
                ? renderHighlightedText(displayName, activeSearch)
                : displayName}
            </h3>

            <p className={dp.cardText}>
              {isSearchActive
                ? renderHighlightedText(displayDescription, activeSearch)
                : displayDescription}
            </p>

            <div className={dp.chips}>
              {(stone.chakras || []).slice(0, 3).map((chakra) => (
                <span key={chakra} className={`${dp.chip} ${dp.chipViolet}`}>
                  {facet(chakra)}
                </span>
              ))}

              <span className={dp.chip}>
                {stone.short_description?.trim() ? t("card.summaryYes") : "—"}
              </span>

              <AdminTransferBadge originType={stone.origin_type} />

              {imageCount > 0 && (
                <span className={dp.chip}>
                  {t("card.imageCount", { count: imageCount })}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      <div className={dp.cardFooter}>
        <Link
          href={detailHref}
          onClick={() => {
            onNavigate(stone.id);
          }}
          className={dp.readLink}
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
  // "Tümünü Seç" ile seçilen ama listede henüz yüklenmemiş taşların satırları (ad + sahiplik için).
  const [scopeRows, setScopeRows] = useState<Map<string, StoneListItem>>(() => new Map());
  const [selectingAll, setSelectingAll] = useState(false);

  // Detay filtreler için genişletilmiş veri (pagination yok, tüm taşlar)
  const [detailData, setDetailData] = useState<StoneListItemExtended[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // P2-09B: detay-filtre sunucu/ağ hatası "sonuç yok" gibi gösterilmez.
  const [detailError, setDetailError] = useState(false);
  // P2-07: sunucu sonuç üst sınırına ulaşıldıysa kullanıcıya dürüstçe söylenir.
  const [detailCapped, setDetailCapped] = useState(false);

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [excludedStoneIds, setExcludedStoneIds] = useState<Set<string>>(() => new Set());
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [wordBusy, setWordBusy] = useState(false);

  // Detay condition-search race guard — hızlı filtre/metin değişiminde eski response
  // yeniyi ezmesin.
  const detailSeq = useRef(0);

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

  // Tekil taş silme — DESTRUCTIVE UX: özel inline modal yerine ortak güvenli
  // dialog primitive'i (useDeleteConfirm → ConfirmProvider: role="alertdialog",
  // aria-modal, Escape, focus-trap, mobil 2-adım). Onay mesajı gerçek kayıt adını
  // gösterir; "Vazgeç"/"Sil" görsel olarak ayrışır (tone: "danger").
  const handleDeleteStone = useCallback(async (stone: StoneListItem) => {
    if (isDemo) {
      showToast({ type: "info", message: t("toast.demoAction") });
      return;
    }

    const name = stone.stone_name || tf("common.unnamedStone");
    const confirmed = await deleteConfirm({
      title: t("confirm.singleTitle"),
      message: t("confirm.singleMessage", { name }),
      secondMessage: t("confirm.singleSecond", { name }),
    });
    if (!confirmed) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      setDeleteLoading(false);
      setErrorMessage(tc("workspaceUnavailable"));
      return;
    }

    const stoneId = stone.id;
    // Silme kararı oturum sahipliğine göre: kendi tenant'ı → gerçek DELETE,
    // başka tenant (paylaşılan kütüphane) → kullanıcı bazında gizle.
    const isLibrary = stone.tenant_id !== tenantId;

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

      setStones((current) => current.filter((s) => s.id !== stoneId));
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
  }, [deleteConfirm, isDemo, queryTenantId, showToast, t, tc, tf]);

  const selectedCount = selectedIds.size;

  // FAZ-1: toggleStoneSelection, StoneListRow/StoneCard React.memo'ya doğrudan
  // geçtiği için STABİL kalmalı (re-render fırtınası koruması) — bağımlılıksız useCallback.
  // WT3.1 (owner kararı 2026-10-08): mobil "en fazla 2 seçim" sınırı KALDIRILDI — mobilde de
  // gerçek "Tümünü Seç" + serbest seçim. Yanlış toplu silme koruması 3 aşamalı onaydır (#350).
  const toggleStoneSelection = useCallback((stoneId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(stoneId)) next.delete(stoneId);
      else next.add(stoneId);
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

  // WT5: "Kontrol edildi" — işaretler arama BAĞLAMINA (metin + Detay Arama filtreleri) bağlı,
  // sessionStorage'da. Bağlam yokken (arama/filtre kapalı) işaretlenmez/gösterilmez.
  const searchCheckedContext = searchContextKey({
    query: debouncedSearch,
    zodiac: detailFilters.zodiac,
    chakra: detailFilters.chakra,
    mineral: detailFilters.mineral,
    warningOnly: detailFilters.warningOnly,
  });
  const searchCheckedContextRef = useRef(searchCheckedContext);
  useEffect(() => {
    searchCheckedContextRef.current = searchCheckedContext;
    runInEffect(() => setViewedStoneIds(readCheckedIds(browserSessionStorage(), searchCheckedContext)));
  }, [searchCheckedContext]);

  const filterQueryStringRef = useRef("");
  const handleStoneNavigate = useCallback((stoneId: string) => {
    if (filterQueryStringRef.current) saveListScroll(filterQueryStringRef.current, stoneId);
    const ctx = searchCheckedContextRef.current;
    if (ctx) setViewedStoneIds(markChecked(browserSessionStorage(), ctx, stoneId));
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

  // F-01 / DT-S1: METİN araması artık SERVER-SIDE + paginated (fetchList q+searchMode
  // gönderir; route ilike + range döner). Tüm-korpus client yüklemesi YALNIZCA detay
  // filtreler (assignments/JSON değerlendirmesi gerektiren) için kalır. Böylece en sık
  // kullanılan metin araması ölçeklenir ve sessiz truncation olmaz (totalCount + load-more).
  const needsFullLoad = isDetailFilterActive;

  // Server-side paginated fetch: yalnızca hiç filtre/arama yokken çalışır
  useEffect(() => {
    if (!queryTenantId) return;
    if (needsFullLoad) return; // client-side full-text devralıyor
    void fetchList({ reset: true });
  }, [queryTenantId, debouncedSearch, searchMode, needsFullLoad]);

  // Detay/koşul filtreleri → SERVER-SIDE condition-search (F-01/DT-S1/§5).
  // Tüm korpus ARTIK ÇEKİLMEZ; koşullar (mineral/çakra/astro) + warningOnly + metin
  // sunucuda değerlendirilir (paylaşılan AND motoru), yalnız eşleşen alt küme + exclusion
  // uygulanmış olarak döner. Filtre/metin değişince yeniden sorgulanır (debounce + race guard).
  const detailConditions = useMemo(() => {
    const c: { type: "mineral" | "chakra" | "astrology"; value: string; minPercent: null }[] = [];
    const m = detailFilters.mineral?.trim() ?? "";
    const ch = detailFilters.chakra?.trim() ?? "";
    const z = detailFilters.zodiac?.trim() ?? "";
    if (m.length >= SEARCH_MIN_LENGTH) c.push({ type: "mineral", value: m, minPercent: null });
    if (ch.length >= SEARCH_MIN_LENGTH) c.push({ type: "chakra", value: ch, minPercent: null });
    if (z) c.push({ type: "astrology", value: z, minPercent: null });
    return c;
  }, [detailFilters.mineral, detailFilters.chakra, detailFilters.zodiac]);

  useEffect(() => {
    if (!queryTenantId) return;
    const seq = ++detailSeq.current;
    const ctrl = new AbortController();
    // Tüm setState timeout callback'i içinde (senkron effect-body setState yok).
    const timer = window.setTimeout(async () => {
      if (!needsFullLoad) {
        if (seq === detailSeq.current) {
          setDetailData(null);
          setDetailError(false);
          setDetailCapped(false);
        }
        return;
      }
      setDetailLoading(true);
      const res = await fetchStonesByConditions({
        conditions: detailConditions,
        warningOnly: detailFilters.warningOnly,
        q: debouncedSearch.trim() || "",
        searchMode,
        signal: ctrl.signal,
      });
      if (seq !== detailSeq.current) return; // stale response — ez me
      if (res.error === "aborted") return;
      setDetailLoading(false);
      if (res.ok) {
        setDetailError(false);
        setDetailCapped(res.capped);
        setDetailData(res.rows as StoneListItemExtended[]);
      } else {
        console.error("[dogaltas-listesi] detay filtre araması hatası:", res.error);
        setDetailError(true);
        setDetailCapped(false);
        setDetailData([]);
      }
    }, needsFullLoad ? 250 : 0);
    return () => { ctrl.abort(); window.clearTimeout(timer); };
  }, [queryTenantId, needsFullLoad, detailConditions, detailFilters.warningOnly, debouncedSearch, searchMode]);

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
    if (q && readUrlSearchMode() === "content") setSearchMode("content");
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
      setViewedStoneIds(readCheckedIds(browserSessionStorage(), searchCheckedContextRef.current));
      setLastViewedStoneId(readLastViewedStoneId());
    };
    refreshViewed();
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);


  const isSearchActive = Boolean(debouncedSearch);
  const activeSearch = debouncedSearch;

  // Detay sayfasına geçerken ve geri dönünce tüm filter state'i URL'de tut
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (debouncedSearch && searchMode === "content") params.set(SEARCH_MODE_URL_PARAM, "content");
    if (detailFilters.zodiac) params.set("astro", detailFilters.zodiac);
    if (detailFilters.chakra) params.set("chakra", detailFilters.chakra);
    if (detailFilters.mineral) params.set("mineral", detailFilters.mineral);
    if (detailFilters.warningOnly) params.set("warn", "1");
    return params.toString();
  }, [debouncedSearch, searchMode, detailFilters]);

  useEffect(() => {
    const newUrl = filterQueryString
      ? `${window.location.pathname}?${filterQueryString}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
    filterQueryStringRef.current = filterQueryString;
  }, [filterQueryString]);

  // Görüntülenen taşlar. Metin araması → server list (mode=list); detay/koşul filtreleri
  // → server condition-search (detailData). Her ikisi de SUNUCUDA filtrelenir + exclusion
  // uygulanır → burada client-side yeniden filtreleme YOK (server ile sapma önlenir).
  // Yalnız oturum-içi soft-delete için optimistic exclusion gizleme korunur.
  const filteredStones: StoneListItem[] = useMemo(() => {
    const base: StoneListItem[] = (needsFullLoad ? detailData ?? [] : stones) as StoneListItem[];
    if (excludedStoneIds.size === 0) return base;
    return base.filter((s) => !excludedStoneIds.has(s.id));
  }, [stones, detailData, needsFullLoad, excludedStoneIds]);

  // Geri dönüş: aynı arama bağlamının sonuçları yüklenince kaydedilen konuma bir kez dön.
  useEffect(() => {
    if (listLoading || !filterQueryString || filteredStones.length === 0) return;
    const mark = takeListScroll(filterQueryString);
    if (mark) window.requestAnimationFrame(() => restoreListScroll(mark));
  }, [listLoading, filterQueryString, filteredStones.length]);

  // Arama/filtre (kapsam) değişince seçim TEMİZLENİR — önceki kapsamdan gizli seçili kayıt kalmaz.
  // ("Daha fazla yükle" kapsamı değiştirmez → "Tümünü Seç" ile yapılan seçim korunur.)
  useEffect(() => {
    runInEffect(() => {
      setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
      setScopeRows((prev) => (prev.size === 0 ? prev : new Map()));
    });
  }, [debouncedSearch, searchMode, detailFilters]);

  // Gizlenen (kütüphane) taşlar seçimden düşer.
  useEffect(() => {
    if (excludedStoneIds.size === 0) return;
    runInEffect(() =>
      setSelectedIds((prev) => {
        if (![...prev].some((id) => excludedStoneIds.has(id))) return prev;
        const next = new Set(prev);
        excludedStoneIds.forEach((id) => next.delete(id));
        return next;
      }),
    );
  }, [excludedStoneIds]);

  // F-016: görünen taşların kapak file_path'leri için TOPLU signed URL (private-read).
  // Liste lazy-load ile büyüdükçe yalnız eksik path'ler istenir → N+1 yok.
  const coverFilePaths = useMemo(
    () => (filteredStones.map((s) => imageFilePath(firstStoneImage(s.images))).filter(Boolean) as string[]),
    [filteredStones],
  );
  const signedCoverUrls = useSignedStoneImageUrls(coverFilePaths);

  const hasMore = !needsFullLoad && stones.length < totalCount;
  // P2-09B: detay-filtre modunda ana liste isteği hiç çalışmaz (needsFullLoad) → `listLoading`
  // başlangıç değerinde (true) kalıyordu: 0 sonuç / hata durumunda sonsuz iskelet + gizli toplu
  // işlem çubuğu. Filtre modunda yükleme durumu detay aramasının kendi durumundan türetilir.
  const effectiveListLoading = needsFullLoad ? detailLoading || detailData === null : listLoading;

  const listBusy =
    effectiveListLoading ||
    detailLoading ||
    (isSearchActive && searchTerm.trim() !== debouncedSearch);

  /**
   * "Tümünü Seç": sayfalı listede YÜKLÜ olanlarla sınırlı DEĞİL — aktif arama/filtre kapsamındaki
   * TÜM taşlar seçilir (detay filtrede tam küme zaten istemcide; aksi halde sunucudan 500'lük
   * sayfalarla toplanır; gizlenen kütüphane taşları hariç). Seçim açıktır: seçili sayı = gerçek küme.
   */
  const selectAllFiltered = useCallback(async () => {
    if (selectingAll) return;
    if (needsFullLoad || stones.length >= totalCount) {
      setSelectedIds(new Set(filteredStones.map((stone) => stone.id)));
      return;
    }
    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) return;
    setSelectingAll(true);
    try {
      const PAGE = 500;
      const rows = new Map<string, StoneListItem>();
      for (let offset = 0; offset < 100_000; offset += PAGE) {
        const page = await fetchStonesListPage(tenantId, {
          offset, limit: PAGE,
          search: debouncedSearch.trim() || undefined, searchMode,
        });
        if (page.error) throw new Error(page.error);
        for (const s of page.rows as StoneListItem[]) if (!excludedStoneIds.has(s.id)) rows.set(s.id, s);
        if (page.rows.length < PAGE) break;
      }
      setScopeRows(rows);
      setSelectedIds(new Set(rows.keys()));
    } catch {
      showToast({ type: "error", message: t("toast.selectAllFailed") });
    } finally {
      setSelectingAll(false);
    }
  }, [debouncedSearch, excludedStoneIds, filteredStones, needsFullLoad, queryTenantId, searchMode, selectingAll, showToast, stones.length, t, totalCount]);

  /** Seçili id → satır (yüklü liste veya "Tümünü Seç" ile toplanan kapsam). */
  const stoneRowOf = useCallback(
    (id: string): StoneListItem | undefined => filteredStones.find((s) => s.id === id) ?? scopeRows.get(id),
    [filteredStones, scopeRows],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || listLoading || !hasMore) return;
    void fetchList({ reset: false, append: true, offset: stones.length });
  }, [fetchList, hasMore, listLoading, loadingMore, stones.length]);

  const deleteSelectedStones = useCallback(async () => {
    if (deleteLoading) return;
    // Seçim açıktır (kapsam değişince temizlenir) → silinecek küme tam olarak seçili taşlar.
    const targets = [...selectedIds]
      .filter((id) => !excludedStoneIds.has(id))
      .map(stoneRowOf)
      .filter((s): s is StoneListItem => Boolean(s));
    if (targets.length === 0) return;
    if (isDemo) {
      showToast({ type: "info", message: t("toast.demoAction") });
      return;
    }

    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      setErrorMessage(tc("workspaceUnavailable"));
      return;
    }

    // Kendi taşı vs kütüphane taşı ayrımı
    const ownIds: string[] = [];
    const libraryIds: string[] = [];
    for (const stone of targets) {
      // Oturum sahipliği: kendi tenant'ı → gerçek DELETE, başka tenant → gizle.
      if (stone.tenant_id !== tenantId) {
        libraryIds.push(stone.id);
      } else {
        ownIds.push(stone.id);
      }
    }

    const confirmed = await deleteConfirm({
      title: t("confirm.bulkTitle"),
      count: targets.length,
      message: t("confirm.bulkMessage", { count: targets.length }),
      secondMessage: t("confirm.bulkSecond"),
      names: targets.map((s) => s.stone_name || tf("common.unnamedStone")),
      // Yalnız kütüphane taşı gizleniyorsa işlem geri alınabilir.
      irreversible: ownIds.length > 0,
    });

    if (!confirmed) return;

    setDeleteLoading(true);
    setErrorMessage("");

    let deletedCount = 0;
    let ownError: string | null = null;
    let libError: string | null = null;
    const removedIds = new Set<string>();

    try {
      // Kendi taşları → gerçek DELETE (server API, tenant guard'lı tekil DELETE'ler)
      if (ownIds.length > 0) {
        const { deletedIds, error } = await deleteStones(ownIds);
        if (error) ownError = error;
        deletedCount += deletedIds.length;
        if (deletedIds.length > 0) {
          const deletedIdSet = new Set(deletedIds);
          deletedIds.forEach((id) => removedIds.add(id));
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
          libraryIds.forEach((id) => removedIds.add(id));
          deletedCount += libraryIds.length;
        }
      }
    } catch (err) {
      ownError = ownError ?? (err instanceof Error ? err.message : t("error.tryAgain"));
    } finally {
      setDeleteLoading(false);
    }

    if (ownError || libError) {
      // Kısmi başarı: kaldırılanlar seçimden düşer, başarısızlar seçili kalır.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        removedIds.forEach((id) => next.delete(id));
        return next;
      });
      setErrorMessage(t("error.someRemoveFailed", { error: ownError ?? libError ?? "" }));
      if (removedIds.size > 0 && ownIds.length > 0) await fetchList({ reset: true });
      return;
    }

    showToast({ type: "success", message: t("toast.removedCount", { count: deletedCount }) });
    setSelectedIds(new Set());
    setScopeRows(new Map());
    if (ownIds.length > 0) await fetchList({ reset: true });
  }, [deleteConfirm, deleteLoading, excludedStoneIds, fetchList, queryTenantId, selectedIds, showToast, stoneRowOf, isDemo, t, tc, tf]);

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
        selectedStoneIds = [...selectedIds].filter((id) => !excludedStoneIds.has(id));
        if (!selectedStoneIds.length) { showToast({ type: "warning", message: t("toast.selectStoneFirst") }); return; }
      } else if (mode === "filtered") {
        if (isDetailFilterActive) {
          // Detay filtre: eşleşen tam küme zaten client'ta (detailData üzerinden).
          selectedStoneIds = filteredStones.map((s) => s.id);
        } else {
          // Server-side arama/liste: yalnız YÜKLÜ sayfayı değil, eşleşen TÜM kayıtları
          // dışa aktar. P2-07: eskiden tek istekte 500 ile sessizce kesiliyordu; artık 500'lük
          // sayfalarla (sunucu sırası id ile kararlı) tamamı toplanır.
          const PAGE = 500;
          const collected = new Set<string>();
          for (let offset = 0; offset < 100_000; offset += PAGE) {
            const page = await fetchStonesListPage(tenantId, {
              offset, limit: PAGE,
              search: debouncedSearch.trim() || undefined, searchMode,
            });
            if (page.error) throw new Error("report-failed");
            for (const s of page.rows) collected.add(s.id);
            if (page.rows.length < PAGE) break;
          }
          selectedStoneIds = [...collected];
        }
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
        // FAZ-4A: ham backend hatası kullanıcıya gösterilmez. P2-02: seçili kayıt artık yoksa /
        // seçim geçersizse sunucu Word ÜRETMEZ → hata türüne göre anlaşılır mesaj.
        const kind = await reportErrorKind(res);
        console.error("[dogaltas-listesi] Word raporu hatası:", `HTTP ${res.status}`, kind);
        showToast({ type: "error", message: tf(`reportErrors.${kind}`) });
        return;
      }
      const modeSlug = mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu";
      await downloadFileResponse(res, `dogaltas-${modeSlug}-${reportFileDate()}.docx`);
      // FAZ-4A: "İndirildi" demiyoruz — tarayıcının gerçek konumunu/tamamlanmayı doğrulayamayız.
      showToast({ type: "success", message: t("toast.wordStarted") });
    } catch (err) {
      console.error("[dogaltas-listesi] Word raporu hatası:", err);
      showToast({ type: "error", message: t("toast.wordFailed") });
    } finally {
      setWordBusy(false);
    }
  }, [queryTenantId, selectedIds, excludedStoneIds, filteredStones, isDetailFilterActive, debouncedSearch, searchMode, showToast, isDemo, t, tc, tf]);

  return (
    <DogaltasPremiumShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      aside={
        <DogaltasStats columns={3}>
          <DogaltasStat icon={<FileText className="h-5 w-5" />} value={totalCount} label={t("stat.total")} />
          <DogaltasStat
            icon={<Database className="h-5 w-5" />}
            value={filteredStones.length}
            label={isDetailFilterActive ? t("stat.matched") : t("stat.loaded")}
          />
          <DogaltasStat icon={<ImageIcon className="h-5 w-5" />} value={loadedImages} label={t("stat.image")} />
        </DogaltasStats>
      }
    >
        {isDemo && (
          <DemoModuleBanner message={t("demoBanner")} />
        )}

        <section className={dp.panel}>
          {/* Arama modu + arama + Detay Arama + Yeni Kayıt tek satırda (mobilde alt alta) */}
          <div className={dp.panelRow}>
            <div className={dp.segment} role="group">
              <button
                type="button"
                onClick={() => setSearchMode("name")}
                aria-pressed={searchMode === "name"}
                className={`${dp.segmentBtn} ${searchMode === "name" ? dp.segmentBtnActive : ""}`}
              >
                {t("search.modeName")}
              </button>
              <button
                type="button"
                onClick={() => setSearchMode("content")}
                aria-pressed={searchMode === "content"}
                className={`${dp.segmentBtn} ${searchMode === "content" ? dp.segmentBtnActive : ""}`}
              >
                {t("search.modeContent")}
              </button>
            </div>

            {/* Ana arama kutusu */}
            <form
              className="min-w-0 flex-1"
              onSubmit={(event) => event.preventDefault()}
            >
              <DogaltasSearchField
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
                enterKeyHint="search"
                autoComplete="off"
              />
            </form>

            <div className="flex shrink-0 items-center gap-2">
              {/* Detay Arama butonu */}
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen(true)}
                className={`${dp.filterBtn} ${isDetailFilterActive ? dp.filterBtnActive : ""}`}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                {isDetailFilterActive ? t("search.filtered") : t("search.detail")}
              </button>

              {/* FAZ-4A: Liste/Kart görünüm toggle'ı kaldırıldı — ekran yalnız kart grid. */}
              {!isDemo && (
                <Link
                  href="/dogaltas/dogaltas-kayit"
                  className={`btn-primary ${dp.actionTall} flex-1 md:flex-none`}
                >
                  {t("newRecord")}
                </Link>
              )}
            </div>
          </div>

          {/* Aktif detay filtre rozetleri */}
          {isDetailFilterActive && (
            <div className="mt-3">
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
            </div>
          )}

          <div className={`${dp.panelDivider} flex flex-wrap items-center justify-between gap-2`}>
            <p className={dp.meta}>
              {isDetailFilterActive
                ? t("status.matchDetail", { count: filteredStones.length })
                : isSearchActive
                  ? t("status.searchResult", { query: activeSearch, count: filteredStones.length })
                  : t("status.showingRecords", { count: filteredStones.length })}
            </p>

            {listBusy && (
              <span className={dp.busy}>
                {detailLoading
                  ? t("status.filterLoading")
                  : isSearchActive && searchTerm.trim() !== debouncedSearch
                    ? t("status.searching")
                    : t("status.loading")}
              </span>
            )}
          </div>

          {!effectiveListLoading && filteredStones.length > 0 && !isDemo ? (
            <div className={dp.bulkArea}>
              <BulkExportBar
                compact
                selectedCount={selectedCount}
                totalCount={totalCount}
                filteredCount={filteredStones.length}
                hasActiveFilter={isSearchActive || isDetailFilterActive}
                selectAllLabel={selectingAll ? t("bulk.selectingAll") : (isSearchActive || isDetailFilterActive ? t("bulk.selectAllResults") : t("bulk.selectAll"))}
                selectAllCount={needsFullLoad ? filteredStones.length : totalCount}
                onSelectAll={() => void selectAllFiltered()}
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
          <div className={dp.alert}>
            {errorMessage}
          </div>
        )}

        {isDetailFilterActive && detailCapped && !detailError && (
          <div role="status" data-testid="list-filter-capped" className={dp.notice}>
            {t("empty.filterCappedNote")}
          </div>
        )}

        <section>
          {effectiveListLoading && filteredStones.length === 0 ? (
            <CardSkeletonGrid count={6} />
          ) : filteredStones.length === 0 ? (
            isDetailFilterActive && detailError ? (
              /* P2-09B: sunucu/ağ hatası — "sonuç yok" DEĞİL */
              <div role="alert" data-testid="list-filter-error">
                <DogaltasEmptyState
                  icon={<Gem className="h-7 w-7" strokeWidth={1.6} />}
                  titleClassName="!text-rose-800"
                  title={t("empty.filterErrorTitle")}
                  text={t("empty.filterErrorDesc")}
                />
              </div>
            ) : isDetailFilterActive || isSearchActive ? (
              /* Filtre / arama sonucu boş */
              <DogaltasEmptyState
                icon={<Search className="h-7 w-7" strokeWidth={1.8} />}
                title={t("empty.noResultTitle")}
                text={t("empty.noResultDesc")}
                actions={
                  <>
                    {isSearchActive && (
                      <button type="button" onClick={clearSearch} className="btn-soft">
                        {t("empty.clearSearch")}
                      </button>
                    )}
                    {isDetailFilterActive && (
                      <button type="button" onClick={() => setDetailFilters(EMPTY_DETAIL_FILTERS)} className="btn-soft">
                        {t("clearFilters")}
                      </button>
                    )}
                  </>
                }
              />
            ) : (
              /* Kütüphane boş */
              <DogaltasEmptyState
                art="mineral"
                title={t("empty.noRecordTitle")}
                text={t("empty.noRecordDesc")}
                actions={
                  <Link href="/dogaltas/dogaltas-kayit" className="btn-primary">
                    {t("empty.newRecordAdd")}
                  </Link>
                }
              />
            )
          ) : (
            <div className={dp.grid}>
              {filteredStones.map((stone) => (
                <StoneCard
                  key={stone.id}
                  stone={stone}
                  coverImageUrl={resolveImageSrc(firstStoneImage(stone.images), signedCoverUrls)}
                  isSelected={selectedIds.has(stone.id)}
                  isViewedInSearch={searchCheckedContext !== "" && viewedStoneIds.has(stone.id)}
                  isLastViewed={stone.id === lastViewedStoneId}
                  isSearchActive={isSearchActive}
                  activeSearch={activeSearch}
                  filterQueryString={filterQueryString}
                  isDemo={isDemo}
                  onToggleSelect={toggleStoneSelection}
                  onNavigate={handleStoneNavigate}
                  onDelete={handleDeleteStone}
                />
              ))}
            </div>
          )}

          {hasMore && filteredStones.length > 0 ? (
            <div className={`${dp.loadMore} mt-4`}>
              <button
                type="button"
                disabled={loadingMore || listLoading}
                onClick={handleLoadMore}
                className="btn-soft"
              >
                {loadingMore
                  ? t("status.loading")
                  : t("loadMore", { loaded: stones.length, total: totalCount })}
              </button>
            </div>
          ) : null}
        </section>

      {/* ── Detay Arama Paneli ── */}
      {isDetailPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => setIsDetailPanelOpen(false)}
        >
          {/* P2-09C: kısa/yatay ekranda (320px, 844×390, klavye açık) başlık ve alt bar her zaman
              erişilebilir; yalnız gövde kayar (max-h = dinamik viewport). */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("panel.title")}
            data-testid="list-filter-panel"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel başlık */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                  {t("panel.eyebrow")}
                </div>
                <h2 className="text-base font-black text-slate-950">{t("panel.title")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailPanelOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label={t("panel.closeAria")}
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">

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

            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-white px-5 py-3">
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
    </DogaltasPremiumShell>
  );
}

function DogaltasListesiPageFallback() {
  return (
    <main className={dp.page}>
      <div className={dp.container}>
        <CardSkeletonGrid count={6} />
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
