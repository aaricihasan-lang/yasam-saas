"use client";

import { runInEffect } from "@/lib/runInEffect";
import { pruneSelection } from "@/lib/ui/selection";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";

import Link from "next/link";
import { ArrowRight, ChevronDown, Clock3, Eye, Layers, Search } from "lucide-react";
import styles from "@/app/_premium/biyoenerji/kutuphane/bioKutuphane.module.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useBioErrorText } from "../useBioErrorText";
import { useBioDateTime } from "../useBioDateTime";
import { hasPreviewText } from "../previewText";
import { backgroundSyncYasamUserFromDb, readYasamUser } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import {
  fetchImaginationsCount,
  fetchImaginationsPage,
  previewImaginationText,
  type ImaginationListItem,
} from "@/lib/bioenergy/imaginationsListFetch";
import { imaginationDetailHref } from "@/lib/bioenergy/imaginationsRoutes";
import {
  authHeaders,
  bioApiCategories,
  bioApiCreate,
  bioApiDeleteAll,
  bioApiDeleteMany,
  bioApiLastCreated,
} from "@/lib/biyoenerji/secureApi";
import { bioListGet, bioListKey, bioListSet } from "@/lib/biyoenerji/listCache";
import { useBioRequestGate } from "@/lib/biyoenerji/requestGate";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { BiyoenerjiDangerDeleteModal, type DangerDeleteMode } from "./BiyoenerjiDangerDeleteModal";
import { badgeFieldWrapClass, bioSaveBtnClass, CrudEmptyState } from "./BiyoenerjiUi";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";
import { useDirtySnapshot } from "@/lib/biyoenerji/useDirtyGuard";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";

async function exportImaginationsWord(
  tenantId: string,
  userId: string,
  exportMode: "all" | "selected",
  selectedIds: Set<string>,
  setWordBusy: (v: boolean) => void,
  onSuccess?: () => void,
  onError?: () => void,
) {
  setWordBusy(true);
  try {
    const body: Record<string, unknown> = { tenantId, userId, exportMode };
    if (exportMode === "selected") {
      const arr = [...selectedIds];
      if (!arr.length) return;
      body.ids = arr;
    }
    const res = await fetch("/api/biyoenerji/imagination-report", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) { onError?.(); return; }
    await downloadFileResponse(res, `biyoenerji-imajinasyon-${exportMode === "selected" ? "secili" : "tumu"}-${reportFileDate()}.docx`);
    onSuccess?.();
  } catch { onError?.(); } finally {
    setWordBusy(false);
  }
}

const SEARCH_DEBOUNCE_MS = 300;

type BioImaginationForm = {
  title: string;
  category: string;
  text: string;
  notes: string;
  source: string;
};

const emptyForm: BioImaginationForm = {
  title: "",
  category: "",
  text: "",
  notes: "",
  source: "",
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function trimOrEmpty(v: string) {
  return v.trim();
}

function slugifySourceId(value: string) {
  const slug = value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || String(Date.now());
}


export default function Imajinasyonlar() {
  const { isDemo } = useDemoGuard();
  const t = useTranslations("bioenergy.imagery");
  const tl = useTranslations("bioenergy.list");
  const errText = useBioErrorText();
  const formatDate = useBioDateTime();
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<ImaginationListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalInDb, setTotalInDb] = useState(0);
  // K-2: sayım çözülene kadar "…" göster; ilk yüklemede yanlış "0" önlenir.
  const [statsReady, setStatsReady] = useState(false);
  const [searchResultCount, setSearchResultCount] = useState(0);
  // Loader callback'i stabil tutmak için (çift-fetch önlenir): append dalında
  // sayım placeholder'ları bu ref'lerden okunur; state dep zincirini kırmaz.
  const totalInDbRef = useRef(0);
  const searchResultCountRef = useRef(0);
  useEffect(() => { totalInDbRef.current = totalInDb; }, [totalInDb]);
  useEffect(() => { searchResultCountRef.current = searchResultCount; }, [searchResultCount]);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const lastCreatedAtRef = useRef<string | null>(null);
  useEffect(() => { lastCreatedAtRef.current = lastCreatedAt; }, [lastCreatedAt]);
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLock = useSubmitLock();
  const [form, setForm] = useState<BioImaginationForm>({ ...emptyForm });
  const [formModalOpen, setFormModalOpen] = useState(false);
  // BIO-004/015 — form modalı için kaydedilmemiş değişiklik takibi.
  const { isDirty: formIsDirty } = useDirtySnapshot(formModalOpen, form);
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoError, setInfoError] = useState("");
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [danger, setDanger] = useState<{ open: boolean; mode: DangerDeleteMode }>({
    open: false,
    mode: "selected",
  });
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const showSoft = useCallback((kind: "ok" | "err", text: string) => {
    if (kind === "ok") {
      setInfoError("");
      setInfoSuccess(text);
    } else {
      setInfoSuccess("");
      setInfoError(text);
    }
  }, []);

  useEffect(() => {
    if (!infoSuccess && !infoError) return;
    const t = window.setTimeout(() => {
      setInfoSuccess("");
      setInfoError("");
    }, 5200);
    return () => window.clearTimeout(t);
  }, [infoSuccess, infoError]);

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

  // A7/A8 — eski / başka hesap yanıtlarını yok sayan istek kapısı.
  const listGate = useBioRequestGate();
  const fetchList = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      const ticket = listGate.begin({ append: Boolean(opts.append) });
      const tenantId = queryTenantId ?? getSessionTenantId();
      if (!tenantId) {
        setListLoading(false);
        setLoadingMore(false);
        setLoadErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
        return;
      }

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;
      const category = categoryFilter || undefined;
      const cacheKey = bioListKey("imaginations", { search, category, offset: 0 });

      if (opts.reset) {
        setLoadErrorMessage("");
        // Cache'ten anında göster (stale-while-revalidate); yoksa yükleniyor
        const cached = bioListGet(cacheKey);
        if (cached) {
          setRows(cached.rows as ImaginationListItem[]);
          setTotalInDb(cached.total);
          setStatsReady(true);
          setSearchResultCount(cached.searchCount);
          setLastCreatedAt(cached.lastCreatedAt);
          setListLoading(false);
        } else {
          setListLoading(true);
        }
      } else {
        setLoadingMore(true);
      }

      // 1) ÖNCE sayfa (grid) — istatistik beklenmez
      const pageRes = await fetchImaginationsPage(tenantId, { offset, search, category });
      if (!listGate.isCurrent(ticket)) return; // A7/A8 — eski/başka hesap yanıtı yazılmaz
      if (opts.reset) setListLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        setLoadErrorMessage(t("readFailed", { detail: errText(pageRes.error, tl("serverError")) }));
        if (opts.reset && !bioListGet(cacheKey)) setRows([]);
        return;
      }

      setRows((current) =>
        opts.append ? [...current, ...pageRes.rows] : pageRes.rows,
      );

      // 2) İstatistikler ARKA PLANDA (grid'i bloklamaz) — yalnız reset
      if (opts.reset) {
        void (async () => {
          const totalP = fetchImaginationsCount(tenantId);
          // dedupe: arama+kategori boşken total == searchCount → tek sorgu
          const searchP =
            !search && !category ? totalP : fetchImaginationsCount(tenantId, search, category);
          const [totalRes, searchCountRes, lastRes] = await Promise.all([
            totalP,
            searchP,
            bioApiLastCreated("imaginations"),
          ]);
          if (!listGate.isCurrent(ticket)) return; // A7/A8 — sayım/cache yazılmaz
          let total = totalInDbRef.current;
          if (totalRes.error) {
            setLoadErrorMessage(tl("countFailed", { detail: errText(totalRes.error, tl("serverError")) }));
          } else {
            total = totalRes.count;
            setTotalInDb(total);
          }
          let searchCount = 0;
          if (searchCountRes.error) {
            setSearchResultCount(0);
          } else {
            searchCount = searchCountRes.count;
            setSearchResultCount(searchCount);
          }
          const lastAt = lastRes.error
            ? lastCreatedAtRef.current
            : ((lastRes as { lastCreatedAt?: string | null }).lastCreatedAt ?? null);
          setLastCreatedAt(lastAt);
          setStatsReady(true);
          bioListSet(cacheKey, {
            rows: pageRes.rows,
            total,
            searchCount,
            lastCreatedAt: lastAt,
            categories: null,
          }, ticket);
        })();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- çeviri işlevleri dil değişiminde yeniden liste çekmez
    [categoryFilter, debouncedSearch, queryTenantId, listGate],
  );

  const refreshCategories = useCallback(async () => {
    const { categories: cats, error } = await bioApiCategories("imaginations");
    if (!error) setCategories(cats);
  }, []);

  useEffect(() => {
    void resolveTenant();
  }, [resolveTenant]);

  useEffect(() => {
    if (!queryTenantId) return;
    void refreshCategories();
  }, [queryTenantId, refreshCategories]);

  useEffect(() => {
    if (!queryTenantId) return;
    void fetchList({ reset: true });
  }, [queryTenantId, debouncedSearch, categoryFilter, fetchList]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const hasMore = rows.length < searchResultCount;
  const listBusy =
    listLoading || (Boolean(searchTerm.trim()) && searchTerm.trim() !== debouncedSearch);
  const isSearchActive = Boolean(debouncedSearch);

  async function handleKaydet() {
    // Çift gönderim kilidi: senkron kilit İLK ifade (tenant çözümü dahil); ikinci tık yok sayılır.
    await saveLock
      .run(async () => {
        try {
          const tenantId = queryTenantId ?? (await getSyncedTenantId());
          if (!tenantId) {
            showSoft("err", MISSING_SESSION_TENANT_MESSAGE);
            return;
          }

          const titleTrim = form.title.trim();
          if (!titleTrim) {
            showSoft("err", t("titleRequired"));
            return;
          }

          setSaving(true);
          const { error } = await bioApiCreate("imaginations", {
            source_id: slugifySourceId(titleTrim),
            title: titleTrim,
            category: trimOrNull(form.category) || "Genel",
            text: trimOrEmpty(form.text),
            notes: trimOrEmpty(form.notes),
            source: trimOrNull(form.source),
          });

          setSaving(false);

          if (error) {
            showSoft("err", tl("addFailed", { detail: errText(error, tl("serverError")) }));
            return;
          }

          setFormModalOpen(false);
          setForm({ ...emptyForm });
          await fetchList({ reset: true });
          void refreshCategories();
          showSoft("ok", t("created"));
        } finally {
          setSaving(false);
        }
      })
      .catch((e: unknown) => showSoft("err", errText(e, tl("opFailed"))));
  }

  // Toplu seçim güvenliği: arama/filtre ile liste değişince seçim görünür kayıtlarla
  // kesişime budanır (değişiklik yoksa aynı Set döner → render döngüsü yok). Silme ve
  // "seçili" Word yalnız görünür ∩ seçili kayıtlar üzerinden yapılır.
  useEffect(() => {
    const visibleIds = rows.map((r) => r.id);
    runInEffect(() => setSelectedForExport((prev) => pruneSelection(prev, visibleIds)));
  }, [rows]);
  const selectedVisibleRows = rows.filter((r) => selectedForExport.has(r.id));
  const selectedVisibleIds = new Set(selectedVisibleRows.map((r) => r.id));

  async function handleBulkDeleteSelected() {
    const ids = selectedVisibleRows.map((r) => r.id);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteMany("imaginations", ids);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", tl("deleteFailed", { detail: errText(error, tl("serverError")) }));
      return;
    }
    setSelectedForExport(new Set());
    await fetchList({ reset: true });
    void refreshCategories();
    showSoft("ok", tl("deletedCount", { count: String(ids.length) }));
  }

  async function handleDeleteAll() {
    setIsBulkDeleting(true);
    const { error } = await bioApiDeleteAll("imaginations", totalInDb);
    setIsBulkDeleting(false);
    setDanger((d) => ({ ...d, open: false }));
    if (error) {
      showSoft("err", tl("deleteFailed", { detail: errText(error, tl("serverError")) }));
      return;
    }
    setSelectedForExport(new Set());
    setCategoryFilter("");
    await fetchList({ reset: true });
    void refreshCategories();
    showSoft("ok", tl("deletedAll"));
  }

  return (
    <section className="w-full min-w-0">
      {isDemo && (
        <div className="mb-4 rounded-[14px] border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
            <div>
              <p className="text-sm font-black text-blue-900">{t("demoTitle")}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                {tl("demoBody")}
              </p>
            </div>
          </div>
        </div>
      )}
      {/* 2026-10-20 premium görünüm (owner GÖRSEL PASS). Veri, arama, kategori, sayaç, seçim, Word, silme ve
          detay sayfasına geçiş davranışı DEĞİŞMEDİ; kartlar tek tip (kayda göre görsel/renk YOK). */}
      <div className={`${styles.topBar} ${isDemo ? styles.topBarNoNew : ""}`}>
        {!isDemo && (
          <button type="button" onClick={() => { setForm({ ...emptyForm }); setFormModalOpen(true); }} className={styles.newBtn}>
            {tl("newRecord")}
          </button>
        )}
        <div className={`${styles.stat} ${styles.sViolet}`}>
          <span className={styles.statIcon} aria-hidden><Layers className="h-6 w-6" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{tl("statTotalCap")}</p>
            <p className={styles.statValue}>{statsReady ? totalInDb : "…"}</p>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.sBlue}`}>
          <span className={styles.statIcon} aria-hidden><Eye className="h-6 w-6" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{isSearchActive ? tl("statSearch") : tl("statVisibleCap")}</p>
            <p className={styles.statValue}>{statsReady ? searchResultCount : "…"}</p>
          </div>
        </div>
        <div className={`${styles.stat} ${styles.sTeal}`}>
          <span className={styles.statIcon} aria-hidden><Clock3 className="h-6 w-6" strokeWidth={2} /></span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>{tl("statLastCap")}</p>
            <p className={`${styles.statValue} ${styles.statSmall}`}>{formatDate(lastCreatedAt)}</p>
          </div>
        </div>
      </div>

      <div className={`${styles.filters} ${""} ${categories.length > 0 ? "" : styles.filtersOne}`}>
        <label className="block min-w-0">
          <span className={`${styles.fLabel} ${styles.fLabelMuted}`}>{tl("searchLabel")}</span>
          <span className={styles.inputWrap}>
            <Search className={styles.inIcon} strokeWidth={2} aria-hidden />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className={`${styles.input} ${styles.inputSearch}`}
            />
          </span>
          {listBusy ? (
            <p className={styles.hint}>{tl("searching")}</p>
          ) : isSearchActive ? (
            <p className={styles.hint}> {tl("searchSummary", { query: debouncedSearch, count: String(searchResultCount) })}
            </p>
          ) : null}
        </label>
        {categories.length > 0 && (
          <label className="block min-w-0">
            <span className={`${styles.fLabel} ${styles.fLabelMuted}`}>{t("fields.category")}</span>
            <span className={styles.inputWrap}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={`${styles.input} ${styles.select}`}
              >
                <option value="">{tl("all")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className={styles.selIcon} strokeWidth={2} aria-hidden />
            </span>
          </label>
        )}
      </div>

      {loadErrorMessage ? (
        <div className={`${styles.notice} ${styles.noticeErr}`}>
          {loadErrorMessage}
        </div>
      ) : null}

      {(infoSuccess || infoError) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {infoSuccess ? (
            <div
              role="status"
              aria-live="polite"
              className={`flex-1 ${styles.notice} ${styles.noticeOk}`}
            >
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div
              role="alert"
              aria-live="assertive"
              className={`flex-1 ${styles.notice} ${styles.noticeErr}`}
            >
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      {listLoading && rows.length === 0 ? (
        <p className={styles.listEmpty}>{tl("loading")}</p>
      ) : rows.length === 0 ? (
        <CrudEmptyState
          Icon={Eye}
          title={isSearchActive ? tl("emptySearchTitle") : tl("emptyTitle")}
          subtitle={
            isSearchActive
              ? tl("emptySearchBody")
              : t("emptyBody")
          }
          tone="amber"
        />
      ) : (
        <>
          {!isDemo && <div className={styles.bulk}>
            <BulkExportBar
              selectedCount={selectedForExport.size}
              totalCount={totalInDb}
              selectAllLabel={tl("selectVisible")}
              selectAllCount={rows.length}
              onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
              onClearSelection={() => setSelectedForExport(new Set())}
              onExportSelected={() => void exportImaginationsWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "selected", selectedVisibleIds, setWordBusy, () => showSoft("ok", tl("reportDownloaded")), () => showSoft("err", tl("reportFailed")))}
              onExportAll={() => void exportImaginationsWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "all", selectedForExport, setWordBusy, () => showSoft("ok", tl("reportDownloaded")), () => showSoft("err", tl("reportFailed")))}
              isExporting={wordBusy}
              onDeleteSelected={() => setDanger({ open: true, mode: "selected" })}
              isDeleting={isBulkDeleting}
              onDeleteAll={() => setDanger({ open: true, mode: "all" })}
            />
          </div>}
          <div className={`${styles.grid} ${styles.grid3}`}>
            {rows.map((row) => {
              const detailHref = imaginationDetailHref(row.id);
              // I18N-F1-R3: tüm parçalar boşsa lib'in "Önizleme yok." yedeği yerine ekran dilinde aynı metin (TR birebir).
              const preview = hasPreviewText(row.text, row.notes, row.source) ? previewImaginationText(row.text, row.notes, row.source) : tl("noPreview");
              const hasCategory = Boolean(row.category?.trim());
              const isExportSelected = selectedForExport.has(row.id);

              if (!detailHref) return null;

              return (
                <div key={row.id} className={styles.rWrap}>
                  {!isDemo && (
                    <label className={styles.rCheck} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={tl("selectRecord")}
                        checked={isExportSelected}
                        onChange={() => setSelectedForExport((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                          return next;
                        })}
                      />
                    </label>
                  )}
                <Link
                  href={detailHref}
                  className={`${styles.rCard} ${!isDemo && isExportSelected ? styles.rSelected : ""}`}
                >
                  {hasCategory ? (
                    <span className={styles.pill}>
                      {row.category}
                    </span>
                  ) : (
                    <span className={`${styles.pill} ${styles.pillMuted}`}>
                      {tl("uncategorised")}
                    </span>
                  )}

                  <h2 className={`${styles.rTitle} ${styles.rTitleSerif}`} lang="tr">
                    {row.title?.trim() || tl("untitled")}
                  </h2>
                  <AdminTransferBadge originType={row.origin_type} className="mt-1" />

                  <DemoBlur isProtected={isDemo} className={styles.rTextWrap}>
                    <p className={styles.rText}>
                      {preview}
                    </p>
                  </DemoBlur>

                  <span className={`${styles.rBtn} ${styles.rBtnRight}`}>
                    {tl("openDetail")}
                    <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                </Link>
                </div>
              );
            })}
          </div>

          {hasMore ? (
            <div className={styles.moreWrap}>
              <button
                type="button"
                disabled={loadingMore || listLoading}
                onClick={() => void fetchList({ reset: false, append: true, offset: rows.length })}
                className={styles.moreBtn}
              >
                {loadingMore
                  ? tl("loading")
                  : tl("loadMore", { shown: String(rows.length), total: String(searchResultCount) })}
              </button>
            </div>
          ) : null}
        </>
      )}

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        isDirty={formIsDirty}
        title={t("formTitle")}
        subtitle={tl("formSubtitle")}
        titleId="imagination-form-modal-title"
        accentRingClass="ring-amber-100/50"
        footer={({ requestClose }) => (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={requestClose}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {tl("cancel")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setForm({ ...emptyForm })}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {tl("clear")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleKaydet()}
              className={bioSaveBtnClass}
            >
              {saving ? tl("saving") : tl("save")}
            </button>
          </>
        )}
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">{t("fields.titleLabel")}</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">{t("fields.category")}</span>
            <div className={badgeFieldWrapClass("amber")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                placeholder={t("fields.categoryPlaceholder")}
              />
            </div>
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">{t("fields.text")}</span>}
            modalTitle={t("fields.text")}
            value={form.text}
            onChange={(v) => setForm((f) => ({ ...f, text: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">{t("fields.notes")}</span>}
            modalTitle={t("fields.notes")}
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-slate-100/60"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">{t("fields.source")}</span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-emerald-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-200/90 focus:ring-2 focus:ring-emerald-100/55"
            />
          </label>
        </div>
      </BiyoenerjiCrudFormModal>

      <BiyoenerjiDangerDeleteModal
        open={danger.open}
        scope={{ filterActive: Boolean(debouncedSearch.trim() || categoryFilter), visibleCount: searchResultCount }}
        mode={danger.mode}
        count={danger.mode === "all" ? totalInDb : selectedVisibleRows.length}
        names={danger.mode === "all" ? undefined : selectedVisibleRows.map((r) => (r.title?.trim() || tl("untitled")))}
        resourceLabel={t("resourceLabel")}
        isDeleting={isBulkDeleting}
        onClose={() => !isBulkDeleting && setDanger((d) => ({ ...d, open: false }))}
        onConfirm={() => void (danger.mode === "all" ? handleDeleteAll() : handleBulkDeleteSelected())}
      />
    </section>
  );
}
